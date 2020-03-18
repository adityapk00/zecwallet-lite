use std::io::{self, Read, Write};
use std::cmp;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};
use std::io::{Error, ErrorKind};

use log::{info, warn, error};

use protobuf::parse_from_bytes;

use secp256k1::SecretKey;
use bip39::{Mnemonic, Language};

use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use pairing::bls12_381::{Bls12};
use sha2::{Sha256, Digest};

use zcash_client_backend::{
    encoding::{encode_payment_address, encode_extended_spending_key},
    proto::compact_formats::CompactBlock, welding_rig::scan_block,
};

use zcash_primitives::{
    block::BlockHash,
    merkle_tree::{CommitmentTree},
    serialize::{Vector},
    transaction::{
        builder::{Builder},
        components::{Amount, OutPoint, TxOut}, components::amount::DEFAULT_FEE,
        TxId, Transaction,
    },
     legacy::{Script, TransparentAddress},
    note_encryption::{Memo, try_sapling_note_decryption, try_sapling_output_recovery},
    zip32::{ExtendedFullViewingKey, ExtendedSpendingKey, ChildIndex},
    JUBJUB,
    primitives::{PaymentAddress},
};

use crate::lightclient::{LightClientConfig};

mod data;
mod extended_key;
mod utils;
mod address;
mod prover;

use data::{BlockData, WalletTx, Utxo, SaplingNoteData, SpendableNote, OutgoingTxMetadata};
use extended_key::{KeyIndex, ExtendedPrivKey};

pub const MAX_REORG: usize = 100;
pub const GAP_RULE_UNUSED_ADDRESSES: usize = 5;

/// Sha256(Sha256(value))
pub fn double_sha256(payload: &[u8]) -> Vec<u8> {
    let h1 = Sha256::digest(&payload);
    let h2 = Sha256::digest(&h1);
    h2.to_vec()
}

use base58::{ToBase58};

/// A trait for converting a [u8] to base58 encoded string.
pub trait ToBase58Check {
    /// Converts a value of `self` to a base58 value, returning the owned string.
    /// The version is a coin-specific prefix that is added.
    /// The suffix is any bytes that we want to add at the end (like the "iscompressed" flag for
    /// Secret key encoding)
    fn to_base58check(&self, version: &[u8], suffix: &[u8]) -> String;
}

impl ToBase58Check for [u8] {
    fn to_base58check(&self, version: &[u8], suffix: &[u8]) -> String {
        let mut payload: Vec<u8> = Vec::new();
        payload.extend_from_slice(version);
        payload.extend_from_slice(self);
        payload.extend_from_slice(suffix);

        let mut checksum = double_sha256(&payload);
        payload.append(&mut checksum[..4].to_vec());
        payload.to_base58()
    }
}

pub struct LightWallet {
    // Is the wallet encrypted? If it is, then when writing to disk, the seed is always encrypted
    // and the individual spending keys are not written
    encrypted: bool,

    // In memory only (i.e, this field is not written to disk). Is the wallet unlocked and are
    // the spending keys present to allow spending from this wallet?
    unlocked: bool,

    enc_seed: [u8; 48], // If locked, this contains the encrypted seed
    nonce: Vec<u8>,     // Nonce used to encrypt the wallet.

    seed: [u8; 32],    // Seed phrase for this wallet. If wallet is locked, this is 0

    // List of keys, actually in this wallet. If the wallet is locked, the `extsks` will be
    // encrypted (but the fvks are not encrpyted)
    extsks:  Arc<RwLock<Vec<ExtendedSpendingKey>>>,
    extfvks: Arc<RwLock<Vec<ExtendedFullViewingKey>>>,

    pub zaddress: Arc<RwLock<Vec<PaymentAddress<Bls12>>>>,

    // Transparent keys. If the wallet is locked, then the secret keys will be encrypted,
    // but the addresses will be present.
    tkeys: Arc<RwLock<Vec<secp256k1::SecretKey>>>,
    pub taddresses: Arc<RwLock<Vec<String>>>,

    blocks: Arc<RwLock<Vec<BlockData>>>,
    pub txs: Arc<RwLock<HashMap<TxId, WalletTx>>>,

    // Transactions that are only in the mempool, but haven't been confirmed yet.
    // This is not stored to disk.
    pub mempool_txs: Arc<RwLock<HashMap<TxId, WalletTx>>>,

    // The block at which this wallet was born. Rescans
    // will start from here.
    birthday: u64,

    // Non-serialized fields
    config: LightClientConfig,
}

impl LightWallet {
    pub fn serialized_version() -> u64 {
        return 4;
    }

    fn get_taddr_from_bip39seed(config: &LightClientConfig, bip39_seed: &[u8], pos: u32) -> SecretKey {
        assert_eq!(bip39_seed.len(), 64);

        let ext_t_key = ExtendedPrivKey::with_seed(bip39_seed).unwrap();
        ext_t_key
            .derive_private_key(KeyIndex::hardened_from_normalize_index(44).unwrap()).unwrap()
            .derive_private_key(KeyIndex::hardened_from_normalize_index(config.get_coin_type()).unwrap()).unwrap()
            .derive_private_key(KeyIndex::hardened_from_normalize_index(0).unwrap()).unwrap()
            .derive_private_key(KeyIndex::Normal(0)).unwrap()
            .derive_private_key(KeyIndex::Normal(pos)).unwrap()
            .private_key
    }


    fn get_zaddr_from_bip39seed(config: &LightClientConfig, bip39_seed: &[u8], pos: u32) ->
            (ExtendedSpendingKey, ExtendedFullViewingKey, PaymentAddress<Bls12>) {
        assert_eq!(bip39_seed.len(), 64);

        let extsk: ExtendedSpendingKey = ExtendedSpendingKey::from_path(
            &ExtendedSpendingKey::master(bip39_seed),
            &[
                ChildIndex::Hardened(32),
                ChildIndex::Hardened(config.get_coin_type()),
                ChildIndex::Hardened(pos)
            ],
        );
        let extfvk  = ExtendedFullViewingKey::from(&extsk);
        let address = extfvk.default_address().unwrap().1;

        (extsk, extfvk, address)
    }

    pub fn is_shielded_address(addr: &String, config: &LightClientConfig) -> bool {
        match address::RecipientAddress::from_str(addr,
                config.hrp_sapling_address(),
                config.base58_pubkey_address(),
                config.base58_script_address()) {
            Some(address::RecipientAddress::Shielded(_)) => true,
            _ => false,
        }
    }

    pub fn new(seed_phrase: Option<String>, entropy: Option<String>, config: &LightClientConfig, latest_block: u64) -> io::Result<Self> {
        // This is the source entropy that corresponds to the 24-word seed phrase
        let mut seed_bytes = [0u8; 32];

        if seed_phrase.is_none() {
            // Create a random seed from the entropy
            if entropy.is_none() {
                return Err(Error::new(ErrorKind::NotFound, "Couldn't find entropy".to_string()))
            }

            match hex::decode(entropy.unwrap()) {
                Ok(bytes) => seed_bytes.copy_from_slice(&bytes),
                Err(e) => {
                    let e = format!("Error parsing phrase: {}", e);
                    error!("{}", e);
                    return Err(io::Error::new(ErrorKind::InvalidData, e));
                }
            }
        } else {
            let phrase = match Mnemonic::from_phrase(seed_phrase.unwrap(), Language::English) {
                Ok(p) => p,
                Err(e) => {
                    let e = format!("Error parsing phrase: {}", e);
                    error!("{}", e);
                    return Err(io::Error::new(ErrorKind::InvalidData, e));
                }
            };

            seed_bytes.copy_from_slice(&phrase.entropy());
        }

        // The seed bytes is the raw entropy. To pass it to HD wallet generation,
        // we need to get the 64 byte bip39 entropy
        let bip39_seed = bip39::Seed::new(&Mnemonic::from_entropy(&seed_bytes, Language::English).unwrap(), "");

        // Derive only the first sk and address
        let tpk = LightWallet::get_taddr_from_bip39seed(&config, &bip39_seed.as_bytes(), 0);
        let taddr = LightWallet::address_from_prefix_sk(&config.base58_pubkey_address(), &tpk);

        // TODO: We need to monitor addresses, and always keep 1 "free" address, so
        // users can import a seed phrase and automatically get all used addresses
        let (extsk, extfvk, address)
            = LightWallet::get_zaddr_from_bip39seed(&config, &bip39_seed.as_bytes(), 0);

        Ok(LightWallet {
            encrypted:   false,
            unlocked:    true,
            enc_seed:    [0u8; 48],
            nonce:       vec![],
            seed:        seed_bytes,
            extsks:      Arc::new(RwLock::new(vec![extsk])),
            extfvks:     Arc::new(RwLock::new(vec![extfvk])),
            zaddress:    Arc::new(RwLock::new(vec![address])),
            tkeys:       Arc::new(RwLock::new(vec![tpk])),
            taddresses:  Arc::new(RwLock::new(vec![taddr])),
            blocks:      Arc::new(RwLock::new(vec![])),
            txs:         Arc::new(RwLock::new(HashMap::new())),
            mempool_txs: Arc::new(RwLock::new(HashMap::new())),
            config:      config.clone(),
            birthday:    latest_block,
        })
    }

    pub fn read<R: Read>(mut reader: R, config: &LightClientConfig) -> io::Result<Self> {
        let version = reader.read_u64::<LittleEndian>()?;
        if version > LightWallet::serialized_version() {
            let e = format!("Don't know how to read wallet version {}. Do you have the latest version?", version);
            error!("{}", e);
            return Err(io::Error::new(ErrorKind::InvalidData, e));
        }

        info!("Reading wallet version {}", version);

        let encrypted = if version >= 4 {
            reader.read_u8()? > 0
        } else {
            false
        };

        let mut enc_seed = [0u8; 48];
        if version >= 4 {
            reader.read_exact(&mut enc_seed)?;
        }

        let nonce = if version >= 4 {
            Vector::read(&mut reader, |r| r.read_u8())?
        } else {
            vec![]
        };

        // Seed
        let mut seed_bytes = [0u8; 32];
        reader.read_exact(&mut seed_bytes)?;

        // Read the spending keys
        let extsks = Vector::read(&mut reader, |r| ExtendedSpendingKey::read(r))?;

        let extfvks = if version >= 4 {
            // Read the viewing keys
            Vector::read(&mut reader, |r| ExtendedFullViewingKey::read(r))?
        } else {
            // Calculate the viewing keys
            extsks.iter().map(|sk| ExtendedFullViewingKey::from(sk))
                .collect::<Vec<ExtendedFullViewingKey>>()
        };

        // Calculate the addresses
        let addresses = extfvks.iter().map( |fvk| fvk.default_address().unwrap().1 )
            .collect::<Vec<PaymentAddress<Bls12>>>();

        let tkeys = Vector::read(&mut reader, |r| {
            let mut tpk_bytes = [0u8; 32];
            r.read_exact(&mut tpk_bytes)?;
            secp256k1::SecretKey::parse_slice(&tpk_bytes).map_err(|e| io::Error::new(ErrorKind::InvalidData, e))
        })?;

        let taddresses = if version >= 4 {
            // Read the addresses
            Vector::read(&mut reader, |r| utils::read_string(r))?
        } else {
            // Calculate the addresses
            tkeys.iter().map(|sk| LightWallet::address_from_prefix_sk(&config.base58_pubkey_address(), sk)).collect()
        };

        let blocks = Vector::read(&mut reader, |r| BlockData::read(r))?;

        let txs_tuples = Vector::read(&mut reader, |r| {
            let mut txid_bytes = [0u8; 32];
            r.read_exact(&mut txid_bytes)?;

            Ok((TxId{0: txid_bytes}, WalletTx::read(r).unwrap()))
        })?;
        let txs = txs_tuples.into_iter().collect::<HashMap<TxId, WalletTx>>();

        let chain_name = utils::read_string(&mut reader)?;

        if chain_name != config.chain_name {
            return Err(Error::new(ErrorKind::InvalidData,
                                    format!("Wallet chain name {} doesn't match expected {}", chain_name, config.chain_name)));
        }

        let birthday = reader.read_u64::<LittleEndian>()?;

        Ok(LightWallet{
            encrypted:   encrypted,
            unlocked:    !encrypted, // When reading from disk, if wallet is encrypted, it starts off locked.
            enc_seed:    enc_seed,
            nonce:       nonce,
            seed:        seed_bytes,
            extsks:      Arc::new(RwLock::new(extsks)),
            extfvks:     Arc::new(RwLock::new(extfvks)),
            zaddress:    Arc::new(RwLock::new(addresses)),
            tkeys:       Arc::new(RwLock::new(tkeys)),
            taddresses:  Arc::new(RwLock::new(taddresses)),
            blocks:      Arc::new(RwLock::new(blocks)),
            txs:         Arc::new(RwLock::new(txs)),
            mempool_txs: Arc::new(RwLock::new(HashMap::new())),
            config:      config.clone(),
            birthday,
        })
    }

    pub fn write<W: Write>(&self, mut writer: W) -> io::Result<()> {
        if self.encrypted && self.unlocked {
            return Err(Error::new(ErrorKind::InvalidInput,
                        format!("Cannot write while wallet is unlocked while encrypted.")));
        }

        // Write the version
        writer.write_u64::<LittleEndian>(LightWallet::serialized_version())?;

        // Write if it is locked
        writer.write_u8(if self.encrypted {1} else {0})?;

        // Write the encrypted seed bytes
        writer.write_all(&self.enc_seed)?;

        // Write the nonce
        Vector::write(&mut writer, &self.nonce, |w, b| w.write_u8(*b))?;

        // Write the seed
        writer.write_all(&self.seed)?;

        // Flush after writing the seed, so in case of a disaster, we can still recover the seed.
        writer.flush()?;

        // Write all the spending keys
        Vector::write(&mut writer, &self.extsks.read().unwrap(),
             |w, sk| sk.write(w)
        )?;

        // Write the FVKs
        Vector::write(&mut writer, &self.extfvks.read().unwrap(),
             |w, fvk| fvk.write(w)
        )?;

        // Write the transparent private keys
        Vector::write(&mut writer, &self.tkeys.read().unwrap(),
            |w, pk| w.write_all(&pk.serialize())
        )?;

        // Write the transparent addresses
        Vector::write(&mut writer, &self.taddresses.read().unwrap(),
            |w, a| utils::write_string(w, a)
        )?;

        Vector::write(&mut writer, &self.blocks.read().unwrap(), |w, b| b.write(w))?;

        // The hashmap, write as a set of tuples
        Vector::write(&mut writer, &self.txs.read().unwrap().iter().collect::<Vec<(&TxId, &WalletTx)>>(),
                        |w, (k, v)| {
                            w.write_all(&k.0)?;
                            v.write(w)
                        })?;
        utils::write_string(&mut writer, &self.config.chain_name)?;

        // While writing the birthday, get it from the fn so we recalculate it properly
        // in case of rescans etc...
        writer.write_u64::<LittleEndian>(self.get_birthday())?;

        Ok(())
    }

    pub fn note_address(hrp: &str, note: &SaplingNoteData) -> Option<String> {
        match note.extfvk.fvk.vk.into_payment_address(note.diversifier, &JUBJUB) {
            Some(pa) => Some(encode_payment_address(hrp, &pa)),
            None     => None
        }
    }

    pub fn get_birthday(&self) -> u64 {
        if self.birthday == 0 {
            self.get_first_tx_block()
        } else {
            cmp::min(self.get_first_tx_block(), self.birthday)
        }
    }

    // Get the first block that this wallet has a tx in. This is often used as the wallet's "birthday"
    // If there are no Txns, then the actual birthday (which is recorder at wallet creation) is returned
    // If no birthday was recorded, return the sapling activation height
    pub fn get_first_tx_block(&self) -> u64 {
        // Find the first transaction
        let mut blocks = self.txs.read().unwrap().values()
            .map(|wtx| wtx.block as u64)
            .collect::<Vec<u64>>();
        blocks.sort();

        *blocks.first() // Returns optional, so if there's no txns, it'll get the activation height
            .unwrap_or(&cmp::max(self.birthday, self.config.sapling_activation_height))
    }

    // Get all z-address private keys. Returns a Vector of (address, privatekey)
    pub fn get_z_private_keys(&self) -> Vec<(String, String)> {
        self.extsks.read().unwrap().iter().map(|sk| {
            (encode_payment_address(self.config.hrp_sapling_address(),
                                    &ExtendedFullViewingKey::from(sk).default_address().unwrap().1),
             encode_extended_spending_key(self.config.hrp_sapling_private_key(), &sk)
            )
        }).collect::<Vec<(String, String)>>()
    }

    /// Get all t-address private keys. Returns a Vector of (address, secretkey)
    pub fn get_t_secret_keys(&self) -> Vec<(String, String)> {
        self.tkeys.read().unwrap().iter().map(|sk| {
            (self.address_from_sk(sk),
             sk.serialize().to_base58check(&self.config.base58_secretkey_prefix(), &[0x01]))
        }).collect::<Vec<(String, String)>>()
    }

    /// Adds a new z address to the wallet. This will derive a new address from the seed
    /// at the next position and add it to the wallet.
    /// NOTE: This does NOT rescan
    pub fn add_zaddr(&self) -> String {
        if !self.unlocked {
            return "".to_string();
        }

        let pos = self.extsks.read().unwrap().len() as u32;
        let bip39_seed = bip39::Seed::new(&Mnemonic::from_entropy(&self.seed, Language::English).unwrap(), "");

        let (extsk, extfvk, address) =
            LightWallet::get_zaddr_from_bip39seed(&self.config, &bip39_seed.as_bytes(), pos);

        let zaddr = encode_payment_address(self.config.hrp_sapling_address(), &address);
        self.extsks.write().unwrap().push(extsk);
        self.extfvks.write().unwrap().push(extfvk);
        self.zaddress.write().unwrap().push(address);

        zaddr
    }

    /// Add a new t address to the wallet. This will derive a new address from the seed
    /// at the next position.
    /// NOTE: This is not rescan the wallet
    pub fn add_taddr(&self) -> String {
        if !self.unlocked {
            return "".to_string();
        }

        let pos = self.tkeys.read().unwrap().len() as u32;
        let bip39_seed = bip39::Seed::new(&Mnemonic::from_entropy(&self.seed, Language::English).unwrap(), "");

        let sk = LightWallet::get_taddr_from_bip39seed(&self.config, &bip39_seed.as_bytes(), pos);
        let address = self.address_from_sk(&sk);

        self.tkeys.write().unwrap().push(sk);
        self.taddresses.write().unwrap().push(address.clone());

        address
    }

    /// Clears all the downloaded blocks and resets the state back to the initial block.
    /// After this, the wallet's initial state will need to be set
    /// and the wallet will need to be rescanned
    pub fn clear_blocks(&self) {
        self.blocks.write().unwrap().clear();
        self.txs.write().unwrap().clear();
        self.mempool_txs.write().unwrap().clear();
    }

    pub fn set_initial_block(&self, height: i32, hash: &str, sapling_tree: &str) -> bool {
        let mut blocks = self.blocks.write().unwrap();
        if !blocks.is_empty() {
            return false;
        }

        let hash = match hex::decode(hash) {
            Ok(hash) => {
                let mut r = hash;
                r.reverse();
                BlockHash::from_slice(&r)
            },
            Err(e) => {
                eprintln!("{}", e);
                return false;
            }
        };

        let sapling_tree = match hex::decode(sapling_tree) {
            Ok(tree) => tree,
            Err(e) => {
                eprintln!("{}", e);
                return false;
            }
        };

        if let Ok(tree) = CommitmentTree::read(&sapling_tree[..]) {
            blocks.push(BlockData { height, hash, tree });
            true
        } else {
            false
        }
    }

    // Get the latest sapling commitment tree. It will return the height and the hex-encoded sapling commitment tree at that height
    pub fn get_sapling_tree(&self) -> Result<(i32, String, String), String> {
        let blocks = self.blocks.read().unwrap();

        let block = match blocks.last() {
            Some(block) => block,
            None => return Err("Couldn't get a block height!".to_string())
        };

        let mut write_buf = vec![];
        block.tree.write(&mut write_buf).map_err(|e| format!("Error writing commitment tree {}", e))?;

        let mut blockhash = vec![];
        blockhash.extend_from_slice(&block.hash.0);
        blockhash.reverse();

        Ok((block.height, hex::encode(blockhash), hex::encode(write_buf)))
    }

    pub fn last_scanned_height(&self) -> i32 {
        self.blocks.read().unwrap()
            .last()
            .map(|block| block.height)
            .unwrap_or(self.config.sapling_activation_height as i32 - 1)
    }

    /// Determines the target height for a transaction, and the offset from which to
    /// select anchors, based on the current synchronised block chain.
    fn get_target_height_and_anchor_offset(&self) -> Option<(u32, usize)> {
        match {
            let blocks = self.blocks.read().unwrap();
            (
                blocks.first().map(|block| block.height as u32),
                blocks.last().map(|block| block.height as u32),
            )
        } {
            (Some(min_height), Some(max_height)) => {
                let target_height = max_height + 1;

                // Select an anchor ANCHOR_OFFSET back from the target block,
                // unless that would be before the earliest block we have.
                let anchor_height =
                    cmp::max(target_height.saturating_sub(self.config.anchor_offset), min_height);

                Some((target_height, (target_height - anchor_height) as usize))
            }
            _ => None,
        }
    }

    pub fn memo_str(memo: &Option<Memo>) -> Option<String> {
        match memo {
            Some(memo) => {
                match memo.to_utf8() {
                    Some(Ok(memo_str)) => Some(memo_str),
                    _ => None
                }
            }
            _ => None
        }
    }

    pub fn address_from_prefix_sk(prefix: &[u8; 2], sk: &secp256k1::SecretKey) -> String {
        let pk = secp256k1::PublicKey::from_secret_key(&sk);

        // Encode into t address
        let mut hash160 = ripemd160::Ripemd160::new();
        hash160.input(Sha256::digest(&pk.serialize_compressed()[..].to_vec()));

        hash160.result().to_base58check(prefix, &[])
    }

    pub fn address_from_sk(&self, sk: &secp256k1::SecretKey) -> String {
        LightWallet::address_from_prefix_sk(&self.config.base58_pubkey_address(), sk)
    }

    pub fn address_from_pubkeyhash(&self, ta: Option<TransparentAddress>) -> Option<String> {
        match ta {
            Some(TransparentAddress::PublicKey(hash)) => {
                Some(hash.to_base58check(&self.config.base58_pubkey_address(), &[]))
            },
            Some(TransparentAddress::Script(hash)) => {
                Some(hash.to_base58check(&self.config.base58_script_address(), &[]))
            },
            _ => None
        }
    }

    pub fn get_seed_phrase(&self) -> String {
        if !self.unlocked {
            return "".to_string();
        }

        Mnemonic::from_entropy(&self.seed,
                                Language::English,
        ).unwrap().phrase().to_string()
    }

    pub fn zbalance(&self, addr: Option<String>) -> u64 {
        self.txs.read().unwrap()
            .values()
            .map(|tx| {
                tx.notes.iter()
                    .filter(|nd| {  // TODO, this whole section is shared with verified_balance. Refactor it.
                        match addr.clone() {
                            Some(a) => a == encode_payment_address(
                                                self.config.hrp_sapling_address(),
                                                &nd.extfvk.fvk.vk
                                                    .into_payment_address(nd.diversifier, &JUBJUB).unwrap()
                                            ),
                            None    => true
                        }
                    })
                    .map(|nd| if nd.spent.is_none() { nd.note.value } else { 0 })
                    .sum::<u64>()
            })
            .sum::<u64>()
    }

    // Get all (unspent) utxos. Unconfirmed spent utxos are included
    pub fn get_utxos(&self) -> Vec<Utxo> {
        let txs = self.txs.read().unwrap();

        txs.values()
            .flat_map(|tx| {
                tx.utxos.iter().filter(|utxo| utxo.spent.is_none())
            })
            .map(|utxo| utxo.clone())
            .collect::<Vec<Utxo>>()
    }

    pub fn tbalance(&self, addr: Option<String>) -> u64 {
        self.get_utxos().iter()
            .filter(|utxo| {
                match addr.clone() {
                    Some(a) => utxo.address == a,
                    None    => true,
                }
            })
            .map(|utxo| utxo.value )
            .sum::<u64>()
    }

    pub fn verified_zbalance(&self, addr: Option<String>) -> u64 {
        let anchor_height = match self.get_target_height_and_anchor_offset() {
            Some((height, anchor_offset)) => height - anchor_offset as u32 - 1,
            None => return 0,
        };

        self.txs
            .read()
            .unwrap()
            .values()
            .map(|tx| {
                if tx.block as u32 <= anchor_height {
                    tx.notes
                        .iter()
                        .filter(|nd| {  // TODO, this whole section is shared with verified_balance. Refactor it.
                            match addr.clone() {
                                Some(a) => a == encode_payment_address(
                                                    self.config.hrp_sapling_address(),
                                                    &nd.extfvk.fvk.vk
                                                        .into_payment_address(nd.diversifier, &JUBJUB).unwrap()
                                                ),
                                None    => true
                            }
                        })
                        .map(|nd| if nd.spent.is_none() && nd.unconfirmed_spent.is_none() { nd.note.value } else { 0 })
                        .sum::<u64>()
                } else {
                    0
                }
            })
            .sum::<u64>()
    }

    fn add_toutput_to_wtx(&self, height: i32, timestamp: u64, txid: &TxId, vout: &TxOut, n: u64) {
        let mut txs = self.txs.write().unwrap();

        // Find the existing transaction entry, or create a new one.
        if !txs.contains_key(&txid) {
            let tx_entry = WalletTx::new(height, timestamp, &txid);
            txs.insert(txid.clone(), tx_entry);
        }
        let tx_entry = txs.get_mut(&txid).unwrap();

        // Make sure the vout isn't already there.
        match tx_entry.utxos.iter().find(|utxo| {
            utxo.txid == *txid && utxo.output_index == n && Amount::from_u64(utxo.value).unwrap() == vout.value
        }) {
            Some(utxo) => {
                info!("Already have {}:{}", utxo.txid, utxo.output_index);
            }
            None => {
                let address = self.address_from_pubkeyhash(vout.script_pubkey.address());
                if address.is_none() {
                    error!("Couldn't determine address for output!");
                } else {
                    info!("Added to wallet {}:{}", txid, n);
                    // Add the utxo
                    tx_entry.utxos.push(Utxo {
                        address: address.unwrap(),
                        txid: txid.clone(),
                        output_index: n,
                        script: vout.script_pubkey.0.clone(),
                        value: vout.value.into(),
                        height,
                        spent: None,
                        unconfirmed_spent: None,
                    });
                }
            }
        }
    }

    // If one of the last 'n' taddress was used, ensure we add the next HD taddress to the wallet.
    pub fn ensure_hd_taddresses(&self, address: &String) {
        let last_addresses = {
            self.taddresses.read().unwrap().iter().rev().take(GAP_RULE_UNUSED_ADDRESSES).map(|s| s.clone()).collect::<Vec<String>>()
        };

        match last_addresses.iter().position(|s| *s == *address) {
            None => {
                return;
            },
            Some(pos) => {
                info!("Adding {} new zaddrs", (GAP_RULE_UNUSED_ADDRESSES - pos));
                // If it in the last unused, addresses, create that many more
                for _ in 0..(GAP_RULE_UNUSED_ADDRESSES - pos) {
                    // If the wallet is locked, this is a no-op. That is fine, since we really
                    // need to only add new addresses when restoring a new wallet, when it will not be locked.
                    // Also, if it is locked, the user can't create new addresses anyway.
                    self.add_taddr();
                }
            }
        }
    }

    // If one of the last 'n' zaddress was used, ensure we add the next HD zaddress to the wallet
    pub fn ensure_hd_zaddresses(&self, address: &String) {
        let last_addresses = {
            self.zaddress.read().unwrap().iter().rev().take(GAP_RULE_UNUSED_ADDRESSES)
                .map(|s| encode_payment_address(self.config.hrp_sapling_address(), s))
                .collect::<Vec<String>>()
        };

        match last_addresses.iter().position(|s| *s == *address) {
            None => {
                return;
            },
            Some(pos) => {
                info!("Adding {} new zaddrs", (GAP_RULE_UNUSED_ADDRESSES - pos));
                // If it in the last unused, addresses, create that many more
                for _ in 0..(GAP_RULE_UNUSED_ADDRESSES - pos) {
                    // If the wallet is locked, this is a no-op. That is fine, since we really
                    // need to only add new addresses when restoring a new wallet, when it will not be locked.
                    // Also, if it is locked, the user can't create new addresses anyway.
                    self.add_zaddr();
                }
            }
        }
    }

    // Scan the full Tx and update memos for incoming shielded transactions.
    pub fn scan_full_tx(&self, tx: &Transaction, height: i32, datetime: u64) {
        let mut total_transparent_spend: u64 = 0;

        // Scan all the inputs to see if we spent any transparent funds in this tx
        for vin in tx.vin.iter() {
            // Find the txid in the list of utxos that we have.
            let txid = TxId {0: vin.prevout.hash};
            match self.txs.write().unwrap().get_mut(&txid) {
                Some(wtx) => {
                    //println!("Looking for {}, {}", txid, vin.prevout.n);

                    // One of the tx outputs is a match
                    let spent_utxo = wtx.utxos.iter_mut()
                        .find(|u| u.txid == txid && u.output_index == (vin.prevout.n as u64));

                    match spent_utxo {
                        Some(su) => {
                            info!("Spent utxo from {} was spent in {}", txid, tx.txid());
                            su.spent = Some(tx.txid().clone());
                            su.unconfirmed_spent = None;

                            total_transparent_spend += su.value;
                        },
                        _ => {}
                    }
                },
                _ => {}
            };
        }

        if total_transparent_spend > 0 {
            // Update the WalletTx. Do it in a short scope because of the write lock.
            let mut txs = self.txs.write().unwrap();

            if !txs.contains_key(&tx.txid()) {
                let tx_entry = WalletTx::new(height, datetime, &tx.txid());
                txs.insert(tx.txid().clone(), tx_entry);
            }

            txs.get_mut(&tx.txid()).unwrap()
                .total_transparent_value_spent = total_transparent_spend;
        }

        // Scan for t outputs
        let all_taddresses = self.taddresses.read().unwrap().iter()
                                .map(|a| a.clone())
                                .collect::<Vec<_>>();
        for address in all_taddresses {
            for (n, vout) in tx.vout.iter().enumerate() {
                match vout.script_pubkey.address() {
                    Some(TransparentAddress::PublicKey(hash)) => {
                        if address == hash.to_base58check(&self.config.base58_pubkey_address(), &[]) {
                            // This is our address. Add this as an output to the txid
                            self.add_toutput_to_wtx(height, datetime, &tx.txid(), &vout, n as u64);

                            // Ensure that we add any new HD addresses
                            self.ensure_hd_taddresses(&address);
                        }
                    },
                    _ => {}
                }
            }
        }

        {
            let total_shielded_value_spent = self.txs.read().unwrap().get(&tx.txid()).map_or(0, |wtx| wtx.total_shielded_value_spent);
            if total_transparent_spend + total_shielded_value_spent > 0 {
                // We spent money in this Tx, so grab all the transparent outputs (except ours) and add them to the
                // outgoing metadata

                // Collect our t-addresses
                let wallet_taddrs = self.taddresses.read().unwrap().iter()
                        .map(|a| a.clone())
                        .collect::<HashSet<String>>();

                for vout in tx.vout.iter() {
                    let taddr = self.address_from_pubkeyhash(vout.script_pubkey.address());

                    if taddr.is_some() && !wallet_taddrs.contains(&taddr.clone().unwrap()) {
                        let taddr = taddr.unwrap();

                        // Add it to outgoing metadata
                        let mut txs = self.txs.write().unwrap();
                        if txs.get(&tx.txid()).unwrap().outgoing_metadata.iter()
                            .find(|om|
                                om.address == taddr && Amount::from_u64(om.value).unwrap() == vout.value)
                            .is_some() {
                            warn!("Duplicate outgoing metadata");
                            continue;
                        }

                        // Write the outgoing metadata
                        txs.get_mut(&tx.txid()).unwrap()
                            .outgoing_metadata
                            .push(OutgoingTxMetadata{
                                address: taddr,
                                value: vout.value.into(),
                                memo: Memo::default(),
                            });
                    }
                }
            }
        }

        // Scan shielded sapling outputs to see if anyone of them is us, and if it is, extract the memo
        for output in tx.shielded_outputs.iter() {
            let ivks: Vec<_> = self.extfvks.read().unwrap().iter().map(
                |extfvk| extfvk.fvk.vk.ivk().clone()
            ).collect();

            let cmu = output.cmu;
            let ct  = output.enc_ciphertext;

            // Search all of our keys
            for (_account, ivk) in ivks.iter().enumerate() {
                let epk_prime = output.ephemeral_key.as_prime_order(&JUBJUB).unwrap();

                let (note, _to, memo) = match try_sapling_note_decryption(ivk, &epk_prime, &cmu, &ct) {
                    Some(ret) => ret,
                    None => continue,
                };

                {
                    info!("A sapling note was spent in {}", tx.txid());
                    // Update the WalletTx
                    // Do it in a short scope because of the write lock.
                    let mut txs = self.txs.write().unwrap();
                    txs.get_mut(&tx.txid()).unwrap()
                        .notes.iter_mut()
                        .find(|nd| nd.note == note).unwrap()
                        .memo = Some(memo);
                }
            }

            // Also scan the output to see if it can be decoded with our OutgoingViewKey
            // If it can, then we sent this transaction, so we should be able to get
            // the memo and value for our records

            // First, collect all our z addresses, to check for change
            // Collect z addresses
            let z_addresses = self.zaddress.read().unwrap().iter().map( |ad| {
                encode_payment_address(self.config.hrp_sapling_address(), &ad)
            }).collect::<HashSet<String>>();

            // Search all ovks that we have
            let ovks: Vec<_> = self.extfvks.read().unwrap().iter().map(
                |extfvk| extfvk.fvk.ovk.clone()
            ).collect();

            for (_account, ovk) in ovks.iter().enumerate() {
                match try_sapling_output_recovery(ovk,
                    &output.cv,
                    &output.cmu,
                    &output.ephemeral_key.as_prime_order(&JUBJUB).unwrap(),
                    &output.enc_ciphertext,
                    &output.out_ciphertext) {
                        Some((note, payment_address, memo)) => {
                            let address = encode_payment_address(self.config.hrp_sapling_address(),
                                            &payment_address);

                            // Check if this is a change address
                            if z_addresses.contains(&address) {
                                continue;
                            }

                            // Update the WalletTx
                            // Do it in a short scope because of the write lock.
                            {
                                info!("A sapling output was sent in {}", tx.txid());

                                let mut txs = self.txs.write().unwrap();
                                if txs.get(&tx.txid()).unwrap().outgoing_metadata.iter()
                                        .find(|om| om.address == address && om.value == note.value)
                                        .is_some() {
                                    warn!("Duplicate outgoing metadata");
                                    continue;
                                }

                                // Write the outgoing metadata
                                txs.get_mut(&tx.txid()).unwrap()
                                    .outgoing_metadata
                                    .push(OutgoingTxMetadata{
                                        address, value: note.value, memo,
                                    });
                            }
                        },
                        None => {}
                };
            }
        }

        // Mark this Tx as scanned
        {
            let mut txs = self.txs.write().unwrap();
            match txs.get_mut(&tx.txid()) {
                Some(wtx) => wtx.full_tx_scanned = true,
                None => {},
            };
        }
    }

    // Invalidate all blocks including and after "at_height".
    // Returns the number of blocks invalidated
    pub fn invalidate_block(&self, at_height: i32) -> u64 {
        let mut num_invalidated = 0;

        // First remove the blocks
        {
            let mut blks = self.blocks.write().unwrap();

            while blks.last().unwrap().height >= at_height {
                blks.pop();
                num_invalidated += 1;
            }
        }

        // Next, remove entire transactions
        {
            let mut txs = self.txs.write().unwrap();
            let txids_to_remove = txs.values()
                .filter_map(|wtx| if wtx.block >= at_height {Some(wtx.txid.clone())} else {None})
                .collect::<HashSet<TxId>>();

            for txid in &txids_to_remove {
                txs.remove(&txid);
            }

            // We also need to update any sapling note data and utxos in existing transactions that
            // were spent in any of the txids that were removed
            txs.values_mut()
                .for_each(|wtx| {
                    wtx.notes.iter_mut()
                        .for_each(|nd| {
                            if nd.spent.is_some() && txids_to_remove.contains(&nd.spent.unwrap()) {
                                nd.spent = None;
                            }

                            if nd.unconfirmed_spent.is_some() && txids_to_remove.contains(&nd.spent.unwrap()) {
                                nd.unconfirmed_spent = None;
                            }
                        })
                })
        }

        // Of the notes that still remain, unroll the witness.
        // Remove `num_invalidated` items from the witness
        {
            let mut txs = self.txs.write().unwrap();

            // Trim all witnesses for the invalidated blocks
            for tx in txs.values_mut() {
                for nd in tx.notes.iter_mut() {
                    nd.witnesses.split_off(nd.witnesses.len().saturating_sub(num_invalidated));
                }
            }
        }

        num_invalidated as u64
    }

    // Scan a block. Will return an error with the block height that failed to scan
    pub fn scan_block(&self, block_bytes: &[u8]) -> Result<Vec<TxId>, i32> {
        let block: CompactBlock = match parse_from_bytes(block_bytes) {
            Ok(block) => block,
            Err(e) => {
                error!("Could not parse CompactBlock from bytes: {}", e);
                return Err(-1);
            }
        };

        // Scanned blocks MUST be height-sequential.
        let height = block.get_height() as i32;
        if height == self.last_scanned_height() {
            // If the last scanned block is rescanned, check it still matches.
            if let Some(hash) = self.blocks.read().unwrap().last().map(|block| block.hash) {
                if block.hash() != hash {
                    warn!("Likely reorg. Block hash does not match for block {}. {} vs {}", height, block.hash(), hash);
                    return Err(height);
                }
            }
            return Ok(vec![]);
        } else if height != (self.last_scanned_height() + 1) {
            error!(
                "Block is not height-sequential (expected {}, found {})",
                self.last_scanned_height() + 1,
                height
            );
            return Err(self.last_scanned_height());
        }

        // Check to see that the previous block hash matches
        if let Some(hash) = self.blocks.read().unwrap().last().map(|block| block.hash) {
            if block.prev_hash() != hash {
                warn!("Likely reorg. Prev block hash does not match for block {}. {} vs {}", height, block.prev_hash(), hash);
                return Err(height-1);
            }
        }

        // Get the most recent scanned data.
        let mut block_data = BlockData {
            height,
            hash: block.hash(),
            tree: self
                .blocks
                .read()
                .unwrap()
                .last()
                .map(|block| block.tree.clone())
                .unwrap_or(CommitmentTree::new()),
        };

        // These are filled in inside the block
        let new_txs;
        let nfs: Vec<_>;
        {
            // Create a write lock
            let mut txs = self.txs.write().unwrap();

            // Create a Vec containing all unspent nullifiers.
            // Include only the confirmed spent nullifiers, since unconfirmed ones still need to be included
            // during scan_block below.
            nfs = txs
                .iter()
                .map(|(txid, tx)| {
                    let txid = *txid;
                    tx.notes.iter().filter_map(move |nd| {
                        if nd.spent.is_none() {
                            Some((nd.nullifier, nd.account, txid))
                        } else {
                            None
                        }
                    })
                })
                .flatten()
                .collect();

            // Prepare the note witnesses for updating
            for tx in txs.values_mut() {
                for nd in tx.notes.iter_mut() {
                    // Duplicate the most recent witness
                    if let Some(witness) = nd.witnesses.last() {
                        let clone = witness.clone();
                        nd.witnesses.push(clone);
                    }
                    // Trim the oldest witnesses
                    nd.witnesses = nd
                        .witnesses
                        .split_off(nd.witnesses.len().saturating_sub(100));
                }
            }

            new_txs = {
                let nf_refs: Vec<_> = nfs.iter().map(|(nf, acc, _)| (&nf[..], *acc)).collect();

                // Create a single mutable slice of all the newly-added witnesses.
                let mut witness_refs: Vec<_> = txs
                    .values_mut()
                    .map(|tx| tx.notes.iter_mut().filter_map(|nd| nd.witnesses.last_mut()))
                    .flatten()
                    .collect();

                scan_block(
                    block.clone(),
                    &self.extfvks.read().unwrap(),
                    &nf_refs[..],
                    &mut block_data.tree,
                    &mut witness_refs[..],
                )
            };
        }


        // If this block had any new Txs, return the list of ALL txids in this block,
        // so the wallet can fetch them all as a decoy.
        let all_txs = if !new_txs.is_empty() {
            block.vtx.iter().map(|vtx| {
                let mut t = [0u8; 32];
                t.copy_from_slice(&vtx.hash[..]);
                TxId{0: t}
            }).collect::<Vec<TxId>>()
        } else {
            vec![]
        };

        for tx in new_txs {
            // Create a write lock
            let mut txs = self.txs.write().unwrap();

            // Mark notes as spent.
            let mut total_shielded_value_spent: u64 = 0;

            info!("Txid {} belongs to wallet", tx.txid);

            for spend in &tx.shielded_spends {
                let txid = nfs
                    .iter()
                    .find(|(nf, _, _)| &nf[..] == &spend.nf[..])
                    .unwrap()
                    .2;
                let mut spent_note = txs
                    .get_mut(&txid)
                    .unwrap()
                    .notes
                    .iter_mut()
                    .find(|nd| &nd.nullifier[..] == &spend.nf[..])
                    .unwrap();

                // Mark the note as spent, and remove the unconfirmed part of it
                info!("Marked a note as spent");
                spent_note.spent = Some(tx.txid);
                spent_note.unconfirmed_spent = None::<TxId>;

                total_shielded_value_spent += spent_note.note.value;
            }

            // Find the existing transaction entry, or create a new one.
            if !txs.contains_key(&tx.txid) {
                let tx_entry = WalletTx::new(block_data.height as i32, block.time as u64, &tx.txid);
                txs.insert(tx.txid, tx_entry);
            }
            let tx_entry = txs.get_mut(&tx.txid).unwrap();
            tx_entry.total_shielded_value_spent = total_shielded_value_spent;

            // Save notes.
            for output in tx.shielded_outputs
            {
                let new_note = SaplingNoteData::new(&self.extfvks.read().unwrap()[output.account], output);
                match LightWallet::note_address(self.config.hrp_sapling_address(), &new_note) {
                    Some(a) => {
                        info!("Received sapling output to {}", a);
                        self.ensure_hd_zaddresses(&a);
                    },
                    None => {}
                }

                match tx_entry.notes.iter().find(|nd| nd.nullifier == new_note.nullifier) {
                    None => tx_entry.notes.push(new_note),
                    Some(_) => warn!("Tried to insert duplicate note for Tx {}", tx.txid)
                };
            }
        }

        {
            let mut blks = self.blocks.write().unwrap();

            // Store scanned data for this block.
            blks.push(block_data);

            // Trim the old blocks, keeping only as many as needed for a worst-case reorg (i.e. 101 blocks)
            let len = blks.len();
            if len > MAX_REORG + 1 {
                let drain_first = len - (MAX_REORG+1);
                blks.drain(..drain_first);
            }
        }

        {
            // Cleanup mempool tx after adding a block, to remove all txns that got mined
            self.cleanup_mempool();
        }

        // Print info about the block every 10,000 blocks
        if height % 10_000 == 0 {
            match self.get_sapling_tree() {
                Ok((h, hash, stree)) => info!("Sapling tree at height\n({}, \"{}\",\"{}\"),", h, hash, stree),
                Err(e) => error!("Couldn't determine sapling tree: {}", e)
            }
        }

        Ok(all_txs)
    }

    pub fn send_to_address(
        &self,
        consensus_branch_id: u32,
        spend_params: &[u8],
        output_params: &[u8],
        tos: Vec<(&str, u64, Option<String>)>
    ) -> Result<Box<[u8]>, String> {
        if !self.unlocked {
            return Err("Cannot spend while wallet is locked".to_string());
        }

        if tos.len() == 0 {
            return Err("Need at least one destination address".to_string());
        }

        // Check for duplicates in the to list
        if tos.len() > 1 {
            let mut to_addresses = tos.iter().map(|t| t.0.to_string()).collect::<Vec<_>>();
            to_addresses.sort();
            for i in 0..to_addresses.len()-1 {
                if to_addresses[i] == to_addresses[i+1] {
                    return Err(format!("To address {} is duplicated", to_addresses[i]));
                }
            }
        }

        let total_value = tos.iter().map(|to| to.1).sum::<u64>();
        println!(
            "0: Creating transaction sending {} ztoshis to {} addresses",
            total_value, tos.len()
        );

        // Convert address (str) to RecepientAddress and value to Amount
        let recepients = tos.iter().map(|to| {
            let ra = match address::RecipientAddress::from_str(to.0,
                            self.config.hrp_sapling_address(),
                            self.config.base58_pubkey_address(),
                            self.config.base58_script_address()) {
                Some(to) => to,
                None => {
                    let e = format!("Invalid recipient address: '{}'", to.0);
                    error!("{}", e);
                    return Err(e);
                }
            };

            let value = Amount::from_u64(to.1).unwrap();

            Ok((ra, value, to.2.clone()))
        }).collect::<Result<Vec<(address::RecipientAddress, Amount, Option<String>)>, String>>()?;

        // Target the next block, assuming we are up-to-date.
        let (height, anchor_offset) = match self.get_target_height_and_anchor_offset() {
            Some(res) => res,
            None => {
                let e = format!("Cannot send funds before scanning any blocks");
                error!("{}", e);
                return Err(e);
            }
        };

        // Select notes to cover the target value
        let target_value = Amount::from_u64(total_value).unwrap() + DEFAULT_FEE ;
        let notes: Vec<_> = self.txs.read().unwrap().iter()
            .map(|(txid, tx)| tx.notes.iter().map(move |note| (*txid, note)))
            .flatten()
            .filter_map(|(txid, note)|
                SpendableNote::from(txid, note, anchor_offset, &self.extsks.read().unwrap()[note.account])
            )
            .scan(0, |running_total, spendable| {
                let value = spendable.note.value;
                let ret = if *running_total < u64::from(target_value) {
                    Some(spendable)
                } else {
                    None
                };
                *running_total = *running_total + value;
                ret
            })
            .collect();

        let mut builder = Builder::new(height);

        // A note on t addresses
        // Funds received by t-addresses can't be explicitly spent in ZecWallet.
        // ZecWallet will lazily consolidate all t address funds into your shielded addresses.
        // Specifically, if you send an outgoing transaction that is sent to a shielded address,
        // ZecWallet will add all your t-address funds into that transaction, and send them to your shielded
        // address as change.
        let tinputs: Vec<_> = self.get_utxos().iter()
                                .filter(|utxo| utxo.unconfirmed_spent.is_none()) // Remove any unconfirmed spends
                                .map(|utxo| utxo.clone())
                                .collect();

        // Create a map from address -> sk for all taddrs, so we can spend from the
        // right address
        let address_to_sk = self.tkeys.read().unwrap().iter()
                                .map(|sk| (self.address_from_sk(&sk), sk.clone()))
                                .collect::<HashMap<_,_>>();

        // Add all tinputs
        tinputs.iter()
            .map(|utxo| {
                let outpoint: OutPoint = utxo.to_outpoint();

                let coin = TxOut {
                    value: Amount::from_u64(utxo.value).unwrap(),
                    script_pubkey: Script { 0: utxo.script.clone() },
                };

                match address_to_sk.get(&utxo.address) {
                    Some(sk) => builder.add_transparent_input(sk.clone(), outpoint.clone(), coin.clone()),
                    None     => {
                        // Something is very wrong
                        let e = format!("Couldn't find the secreykey for taddr {}", utxo.address);
                        error!("{}", e);

                        Err(zcash_primitives::transaction::builder::Error::InvalidAddress)
                    }
                }

            })
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("{}", e))?;


        // Confirm we were able to select sufficient value
        let selected_value = notes.iter().map(|selected| selected.note.value).sum::<u64>()
                             + tinputs.iter().map::<u64, _>(|utxo| utxo.value.into()).sum::<u64>();

        if selected_value < u64::from(target_value) {
            let e = format!(
                "Insufficient verified funds (have {}, need {:?}). NOTE: funds need {} confirmations before they can be spent.",
                selected_value, target_value, self.config.anchor_offset + 1
            );
            error!("{}", e);
            return Err(e);
        }

        // Create the transaction
        for selected in notes.iter() {
            if let Err(e) = builder.add_sapling_spend(
                selected.extsk.clone(),
                selected.diversifier,
                selected.note.clone(),
                selected.witness.clone(),
            ) {
                let e = format!("Error adding note: {:?}", e);
                error!("{}", e);
                return Err(e);
            }
        }

        // If no Sapling notes were added, add the change address manually. That is,
        // send the change to our sapling address manually. Note that if a sapling note was spent,
        // the builder will automatically send change to that address
        if notes.len() == 0 {
            builder.send_change_to(
                ExtendedFullViewingKey::from(&self.extsks.read().unwrap()[0]).fvk.ovk,
                self.extsks.read().unwrap()[0].default_address().unwrap().1);
        }

        // TODO: We're using the first ovk to encrypt outgoing Txns. Is that Ok?
        let ovk = self.extfvks.read().unwrap()[0].fvk.ovk;

        for (to, value, memo) in recepients {
            // Compute memo if it exists
            let encoded_memo = memo.map(|s| Memo::from_str(&s).unwrap());

            if let Err(e) = match to {
                address::RecipientAddress::Shielded(to) => {
                    builder.add_sapling_output(ovk, to.clone(), value, encoded_memo)
                }
                address::RecipientAddress::Transparent(to) => {
                    builder.add_transparent_output(&to, value)
                }
            } {
                let e = format!("Error adding output: {:?}", e);
                error!("{}", e);
                return Err(e);
            }
        }

        let (tx, _) = match builder.build(
            consensus_branch_id,
            prover::InMemTxProver::new(spend_params, output_params),
        ) {
            Ok(res) => res,
            Err(e) => {
                let e = format!("Error creating transaction: {:?}", e);
                error!("{}", e);
                return Err(e);
            }
        };
        println!("Transaction ID: {}", tx.txid());

        // Mark notes as spent.
        {
            // Mark sapling notes as unconfirmed spent
            let mut txs = self.txs.write().unwrap();
            for selected in notes {
                let mut spent_note = txs.get_mut(&selected.txid).unwrap()
                                        .notes.iter_mut()
                                        .find(|nd| &nd.nullifier[..] == &selected.nullifier[..])
                                        .unwrap();
                spent_note.unconfirmed_spent = Some(tx.txid());
            }

            // Mark this utxo as unconfirmed spent
            for utxo in tinputs {
                let mut spent_utxo = txs.get_mut(&utxo.txid).unwrap().utxos.iter_mut()
                                        .find(|u| utxo.txid == u.txid && utxo.output_index == u.output_index)
                                        .unwrap();
                spent_utxo.unconfirmed_spent = Some(tx.txid());
            }
        }

        // Add this Tx to the mempool structure
        {
            let mut mempool_txs = self.mempool_txs.write().unwrap();

            match mempool_txs.get_mut(&tx.txid()) {
                None => {
                    // Collect the outgoing metadata
                    let outgoing_metadata = tos.iter().map(|(addr, amt, maybe_memo)| {
                        OutgoingTxMetadata {
                            address: addr.to_string(),
                            value: *amt,
                            memo: match maybe_memo {
                                None    => Memo::default(),
                                Some(s) => {
                                    // If the address is not a z-address, then drop the memo
                                    if LightWallet::is_shielded_address(&addr.to_string(), &self.config) {
                                            Memo::from_str(s).unwrap()
                                    } else {
                                        Memo::default()
                                    }
                                }
                            },
                        }
                    }).collect::<Vec<_>>();

                    // Create a new WalletTx
                    let mut wtx = WalletTx::new(height as i32, 0 as u64, &tx.txid());
                    wtx.outgoing_metadata = outgoing_metadata;

                    // Add it into the mempool
                    mempool_txs.insert(tx.txid(), wtx);
                },
                Some(_) => {
                    warn!("A newly created Tx was already in the mempool! How's that possible? Txid: {}", tx.txid());
                }
            }
        }

        // Return the encoded transaction, so the caller can send it.
        let mut raw_tx = vec![];
        tx.write(&mut raw_tx).unwrap();
        Ok(raw_tx.into_boxed_slice())
    }

    // After some blocks have been mined, we need to remove the Txns from the mempool_tx structure
    // if they :
    // 1. Have expired
    // 2. The Tx has been added to the wallet via a mined block
    pub fn cleanup_mempool(&self) {
        const DEFAULT_TX_EXPIRY_DELTA: i32 = 20;

        let current_height = self.blocks.read().unwrap().last().map(|b| b.height).unwrap_or(0);

        {
            // Remove all expired Txns
            self.mempool_txs.write().unwrap().retain( | _, wtx| {
                current_height < (wtx.block + DEFAULT_TX_EXPIRY_DELTA)
            });
        }

        {
            // Remove all txns where the txid is added to the wallet directly
            self.mempool_txs.write().unwrap().retain ( |txid, _| {
                self.txs.read().unwrap().get(txid).is_none()
            });
        }
    }
}

#[cfg(test)]
pub mod tests;
