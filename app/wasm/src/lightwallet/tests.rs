use std::convert::TryInto;
use std::io::{Error};
use rand::{RngCore, rngs::OsRng, Rng};

use ff::{Field, PrimeField, PrimeFieldRepr};
use pairing::bls12_381::Bls12;
use protobuf::{Message, UnknownFields, CachedSize, RepeatedField};
use zcash_client_backend::{encoding::encode_payment_address,
    proto::compact_formats::{
        CompactBlock, CompactOutput, CompactSpend, CompactTx,
    }
};
use zcash_primitives::{
    block::BlockHash,
    jubjub::fs::Fs,
    note_encryption::{Memo, SaplingNoteEncryption},
    primitives::{Note, PaymentAddress},
    legacy::{Script, TransparentAddress,},
    transaction::{
        TxId, Transaction, TransactionData,
        components::{TxOut, TxIn, OutPoint, Amount,},
        components::amount::DEFAULT_FEE,
    },
    zip32::{ExtendedFullViewingKey, ExtendedSpendingKey},
    JUBJUB,
};

use sha2::{Sha256, Digest};

use super::LightWallet;
use super::LightClientConfig;
use secp256k1::{PublicKey, SecretKey};
use crate::SaplingParams;

fn get_sapling_params() -> Result<(Vec<u8>, Vec<u8>), Error> {
    // Read Sapling Params
    let mut sapling_output = vec![];
    sapling_output.extend_from_slice(SaplingParams::get("sapling-output.params").unwrap().as_ref());
    println!("Read output {}", sapling_output.len());

    let mut sapling_spend = vec![];
    sapling_spend.extend_from_slice(SaplingParams::get("sapling-spend.params").unwrap().as_ref());
    println!("Read output {}", sapling_spend.len());

    Ok((sapling_spend, sapling_output))
}

struct FakeCompactBlock {
    block: CompactBlock,
}

impl FakeCompactBlock {
    fn new(height: i32, prev_hash: BlockHash) -> Self {
        // Create a fake Note for the account
        let mut rng = OsRng;
        
        let mut cb = CompactBlock::new();

        cb.set_height(height as u64);
        cb.hash.resize(32, 0);
        rng.fill_bytes(&mut cb.hash);

        cb.prevHash.extend_from_slice(&prev_hash.0);
        
        FakeCompactBlock { block: cb }
    }

    fn as_bytes(&self) -> Vec<u8> {
        self.block.write_to_bytes().unwrap()
    }

    fn hash(&self) -> BlockHash {
        BlockHash(self.block.hash[..].try_into().unwrap())
    }

    fn tx_to_compact_tx(tx: &Transaction, index: u64) -> CompactTx {
        let spends = tx.shielded_spends.iter().map(|s| {
            let mut c_spend = CompactSpend::default();
            c_spend.set_nf(s.nullifier.to_vec());

            c_spend
        }).collect::<Vec<CompactSpend>>();

        let outputs = tx.shielded_outputs.iter().map(|o| {
            let mut c_out = CompactOutput::default();

            let mut cmu_bytes = vec![];
            o.cmu.into_repr().write_le(&mut cmu_bytes).unwrap();

            let mut epk_bytes = vec![];
            o.ephemeral_key.write(&mut epk_bytes).unwrap();

            c_out.set_cmu(cmu_bytes);
            c_out.set_epk(epk_bytes);
            c_out.set_ciphertext(o.enc_ciphertext[0..52].to_vec());

            c_out
        }).collect::<Vec<CompactOutput>>();

        CompactTx {
            index,
            hash: tx.txid().0.to_vec(),
            fee: 0, // TODO: Get Fee
            spends: RepeatedField::from_vec(spends),
            outputs: RepeatedField::from_vec(outputs),
            unknown_fields: UnknownFields::default(),
            cached_size: CachedSize::default(),
        }
    }

    // Convert the transaction into a CompactTx and add it to this block
    fn add_tx(&mut self, tx: &Transaction) {
        let ctx = FakeCompactBlock::tx_to_compact_tx(&tx, self.block.vtx.len() as u64);
        self.block.vtx.push(ctx);
    }

    // Add a new tx into the block, paying the given address the amount. 
    // Returns the nullifier of the new note.
    fn add_tx_paying(&mut self, extfvk: ExtendedFullViewingKey, value: u64) 
            -> (Vec<u8>, TxId) {
        let to = extfvk.default_address().unwrap().1;
        let value = Amount::from_u64(value).unwrap();

        // Create a fake Note for the account
        let mut rng = OsRng;
        let note = Note {
            g_d: to.diversifier.g_d::<Bls12>(&JUBJUB).unwrap(),
            pk_d: to.pk_d.clone(),
            value: value.into(),
            r: Fs::random(&mut rng),
        };
        let encryptor = SaplingNoteEncryption::new(
            extfvk.fvk.ovk,
            note.clone(),
            to.clone(),
            Memo::default(),
            &mut rng,
        );
        let mut cmu = vec![];
        note.cm(&JUBJUB).into_repr().write_le(&mut cmu).unwrap();
        let mut epk = vec![];
        encryptor.epk().write(&mut epk).unwrap();
        let enc_ciphertext = encryptor.encrypt_note_plaintext();

        // Create a fake CompactBlock containing the note
        let mut cout = CompactOutput::new();
        cout.set_cmu(cmu);
        cout.set_epk(epk);
        cout.set_ciphertext(enc_ciphertext[..52].to_vec());
        let mut ctx = CompactTx::new();
        let mut txid = vec![0; 32];
        rng.fill_bytes(&mut txid);
        ctx.set_hash(txid.clone());
        ctx.outputs.push(cout);
        
        self.block.vtx.push(ctx);
        (note.nf(&extfvk.fvk.vk, 0, &JUBJUB), TxId(txid[..].try_into().unwrap()))
    }

    fn add_tx_spending(&mut self, 
                        (nf, in_value): (Vec<u8>, u64),
                        extfvk: ExtendedFullViewingKey,
                        to: PaymentAddress<Bls12>,
                        value: u64) -> TxId {
        let mut rng = OsRng;

        let in_value = Amount::from_u64(in_value).unwrap();
        let value = Amount::from_u64(value).unwrap();

        // Create a fake CompactBlock containing the note
        let mut cspend = CompactSpend::new();
        cspend.set_nf(nf);
        let mut ctx = CompactTx::new();
        let mut txid = vec![0; 32];
        rng.fill_bytes(&mut txid);
        ctx.set_hash(txid.clone());
        ctx.spends.push(cspend);

        // Create a fake Note for the payment
        ctx.outputs.push({
            let note = Note {
                g_d: to.diversifier.g_d::<Bls12>(&JUBJUB).unwrap(),
                pk_d: to.pk_d.clone(),
                value: value.into(),
                r: Fs::random(&mut rng),
            };
            let encryptor = SaplingNoteEncryption::new(
                extfvk.fvk.ovk,
                note.clone(),
                to,
                Memo::default(),
                &mut rng,
            );
            let mut cmu = vec![];
            note.cm(&JUBJUB).into_repr().write_le(&mut cmu).unwrap();
            let mut epk = vec![];
            encryptor.epk().write(&mut epk).unwrap();
            let enc_ciphertext = encryptor.encrypt_note_plaintext();

            let mut cout = CompactOutput::new();
            cout.set_cmu(cmu);
            cout.set_epk(epk);
            cout.set_ciphertext(enc_ciphertext[..52].to_vec());
            cout
        });

        // Create a fake Note for the change
        ctx.outputs.push({
            let change_addr = extfvk.default_address().unwrap().1;
            let note = Note {
                g_d: change_addr.diversifier.g_d::<Bls12>(&JUBJUB).unwrap(),
                pk_d: change_addr.pk_d.clone(),
                value: (in_value - value).into(),
                r: Fs::random(&mut rng),
            };
            let encryptor = SaplingNoteEncryption::new(
                extfvk.fvk.ovk,
                note.clone(),
                change_addr,
                Memo::default(),
                &mut rng,
            );
            let mut cmu = vec![];
            note.cm(&JUBJUB).into_repr().write_le(&mut cmu).unwrap();
            let mut epk = vec![];
            encryptor.epk().write(&mut epk).unwrap();
            let enc_ciphertext = encryptor.encrypt_note_plaintext();

            let mut cout = CompactOutput::new();
            cout.set_cmu(cmu);
            cout.set_epk(epk);
            cout.set_ciphertext(enc_ciphertext[..52].to_vec());
            cout
        });
        
        self.block.vtx.push(ctx);         

        TxId(txid[..].try_into().unwrap())
    }
}

struct FakeTransaction {
    tx: Transaction,
}

impl FakeTransaction {
    // New FakeTransaction with random txid
    fn new<R: RngCore>(rng: &mut R) -> Self {
        let mut txid = [0u8; 32];
        rng.fill_bytes(&mut txid);
        FakeTransaction::new_with_txid(TxId(txid))
    }

    fn new_with_txid(txid: TxId) -> Self {
        FakeTransaction {
            tx: Transaction {
                txid,
                data: TransactionData::new()
            }
        }
    }

    fn get_tx(&self) -> &Transaction {
        &self.tx
    }

    fn add_t_output(&mut self, pk: &PublicKey, value: u64) {
        let mut hash160 = ripemd160::Ripemd160::new();
        hash160.input(Sha256::digest(&pk.serialize_compressed()[..].to_vec()));

        let taddr_bytes = hash160.result();

        self.tx.data.vout.push(TxOut {
            value: Amount::from_u64(value).unwrap(),
            script_pubkey: TransparentAddress::PublicKey(taddr_bytes.try_into().unwrap()).script(),
        });
    }

    fn add_t_input(&mut self, txid: TxId, n: u32) {
        self.tx.data.vin.push(TxIn {
            prevout: OutPoint{
                hash: txid.0,
                n
            },
            script_sig: Script{0: vec![]},
            sequence: 0,
        });
    }
}

fn get_entropy_string() -> String {
    let mut seed_bytes = [0u8; 32];
    // Create a random seed. 
    let mut system_rng = OsRng;
    system_rng.fill(&mut seed_bytes);

    hex::encode(seed_bytes)
}

#[test]
fn test_z_balances() {
    let wallet = LightWallet::new(None, Some(get_entropy_string()), &get_test_config(), 0).unwrap();

    const AMOUNT1:u64 = 5;
    // Address is encoded in bech32
    let address = Some(encode_payment_address(wallet.config.hrp_sapling_address(), 
                                        &wallet.extfvks.read().unwrap()[0].default_address().unwrap().1));

    let mut cb1 = FakeCompactBlock::new(0, BlockHash([0; 32]));
    cb1.add_tx_paying(wallet.extfvks.read().unwrap()[0].clone(), AMOUNT1);
    
    // Make sure that the intial state is empty
    assert_eq!(wallet.txs.read().unwrap().len(), 0);
    assert_eq!(wallet.blocks.read().unwrap().len(), 0);
    assert_eq!(wallet.zbalance(None), 0);
    assert_eq!(wallet.zbalance(address.clone()), 0);

    wallet.scan_block(&cb1.as_bytes()).unwrap();
    
    assert_eq!(wallet.txs.read().unwrap().len(), 1);
    assert_eq!(wallet.blocks.read().unwrap().len(), 1);
    assert_eq!(wallet.zbalance(None), AMOUNT1);
    assert_eq!(wallet.zbalance(address.clone()), AMOUNT1);

    const AMOUNT2:u64 = 10;

    // Add a second block
    let mut cb2 = FakeCompactBlock::new(1, cb1.hash());
    cb2.add_tx_paying(wallet.extfvks.read().unwrap()[0].clone(), AMOUNT2);

    wallet.scan_block(&cb2.as_bytes()).unwrap();
    
    assert_eq!(wallet.txs.read().unwrap().len(), 2);
    assert_eq!(wallet.blocks.read().unwrap().len(), 2);
    assert_eq!(wallet.zbalance(None), AMOUNT1 + AMOUNT2);
    assert_eq!(wallet.zbalance(address.clone()), AMOUNT1 + AMOUNT2);
}

#[test]
fn test_z_change_balances() {
    let wallet = LightWallet::new(None, Some(get_entropy_string()), &get_test_config(), 0).unwrap();

    // First, add an incoming transaction
    const AMOUNT1:u64 = 5;

    let mut cb1 = FakeCompactBlock::new(0, BlockHash([0; 32]));
    let (nf1, txid1) = cb1.add_tx_paying(wallet.extfvks.read().unwrap()[0].clone(), AMOUNT1);

    wallet.scan_block(&cb1.as_bytes()).unwrap();
    
    assert_eq!(wallet.txs.read().unwrap().len(), 1);
    assert_eq!(wallet.blocks.read().unwrap().len(), 1);
    assert_eq!(wallet.zbalance(None), AMOUNT1);

    const AMOUNT2:u64 = 2;

    // Add a second block, spending the first note 
    let addr2 = ExtendedFullViewingKey::from(&ExtendedSpendingKey::master(&[0u8; 32]))
                    .default_address().unwrap().1;
    let mut cb2 = FakeCompactBlock::new(1, cb1.hash());
    let txid2 = cb2.add_tx_spending((nf1, AMOUNT1), wallet.extfvks.read().unwrap()[0].clone(), addr2, AMOUNT2);
    wallet.scan_block(&cb2.as_bytes()).unwrap();

    // Now, the original note should be spent and there should be a change
    assert_eq!(wallet.zbalance(None), AMOUNT1 - AMOUNT2);
    
    let txs = wallet.txs.read().unwrap();

    // Old note was spent
    assert_eq!(txs[&txid1].txid, txid1);
    assert_eq!(txs[&txid1].notes.len(), 1);
    assert_eq!(txs[&txid1].notes[0].spent.unwrap(), txid2);
    assert_eq!(txs[&txid1].notes[0].note.value, AMOUNT1);
    assert_eq!(txs[&txid1].notes[0].is_change, false);
    
    // new note is not spent
    assert_eq!(txs[&txid2].txid, txid2);
    assert_eq!(txs[&txid2].notes.len(), 1);
    assert_eq!(txs[&txid2].notes[0].spent, None);
    assert_eq!(txs[&txid2].notes[0].note.value, AMOUNT1 - AMOUNT2);
    assert_eq!(txs[&txid2].notes[0].is_change, true);
    assert_eq!(txs[&txid2].total_shielded_value_spent, AMOUNT1);
}

#[test]
fn test_t_receive_spend() {
    let mut rng = OsRng;

    let wallet = LightWallet::new(None, Some(get_entropy_string()), &get_test_config(), 0).unwrap();

    let pk = PublicKey::from_secret_key(&wallet.tkeys.read().unwrap()[0]);
    let taddr = wallet.address_from_sk(&wallet.tkeys.read().unwrap()[0]);

    const AMOUNT1: u64 = 20;

    let mut tx = FakeTransaction::new(&mut rng);
    tx.add_t_output(&pk, AMOUNT1);
    let txid1 = tx.get_tx().txid();

    wallet.scan_full_tx(&tx.get_tx(), 100, 0);  // Pretend it is at height 100

    {
        let txs = wallet.txs.read().unwrap();

        // Now make sure the t addr was recieved
        assert_eq!(txs.len(), 1);
        assert_eq!(txs[&txid1].utxos.len(), 1);
        assert_eq!(txs[&txid1].utxos[0].address, taddr);
        assert_eq!(txs[&txid1].utxos[0].txid, txid1);
        assert_eq!(txs[&txid1].utxos[0].output_index, 0);
        assert_eq!(txs[&txid1].utxos[0].value, AMOUNT1);
        assert_eq!(txs[&txid1].utxos[0].height, 100);
        assert_eq!(txs[&txid1].utxos[0].spent, None);
        assert_eq!(txs[&txid1].utxos[0].unconfirmed_spent, None);

        assert_eq!(wallet.tbalance(None), AMOUNT1);
        assert_eq!(wallet.tbalance(Some(taddr)), AMOUNT1);
    }

    // Create a new Tx, spending this taddr
    let mut tx = FakeTransaction::new(&mut rng);
    tx.add_t_input(txid1, 0);
    let txid2 = tx.get_tx().txid();

    wallet.scan_full_tx(&tx.get_tx(), 101, 0);  // Pretent it is at height 101

    {
        // Make sure the txid was spent
        let txs = wallet.txs.read().unwrap();

        // Old utxo, that should be spent now
        assert_eq!(txs.len(), 2);
        assert_eq!(txs[&txid1].utxos.len(), 1);
        assert_eq!(txs[&txid1].utxos[0].value, AMOUNT1);
        assert_eq!(txs[&txid1].utxos[0].spent, Some(txid2));
        assert_eq!(txs[&txid1].utxos[0].unconfirmed_spent, None);

        assert_eq!(txs[&txid2].block, 101); // The second TxId is at block 101
        assert_eq!(txs[&txid2].utxos.len(), 0); // The second TxId has no UTXOs
        assert_eq!(txs[&txid2].total_transparent_value_spent, AMOUNT1); 

        // Make sure there is no t-ZEC left
        assert_eq!(wallet.tbalance(None), 0);
    }
}


#[test]
/// This test spends and receives t addresses among non-wallet t addresses to make sure that
/// we're detecting and spending only our t addrs.
fn test_t_receive_spend_among_tadds() {
    let mut rng = OsRng;
    let wallet = LightWallet::new(None, Some(get_entropy_string()), &get_test_config(), 0).unwrap();

    let pk = PublicKey::from_secret_key(&wallet.tkeys.read().unwrap()[0]);
    let taddr = wallet.address_from_sk(&wallet.tkeys.read().unwrap()[0]);

    let non_wallet_sk = &SecretKey::parse_slice(&[1u8; 32]).unwrap();
    let non_wallet_pk = PublicKey::from_secret_key(&non_wallet_sk);

    const AMOUNT1: u64 = 30;

    let mut tx = FakeTransaction::new(&mut rng);
    // Add a non-wallet output
    tx.add_t_output(&non_wallet_pk, 20);
    tx.add_t_output(&pk, AMOUNT1);  // Our wallet t output
    tx.add_t_output(&non_wallet_pk, 25);
    let txid1 = tx.get_tx().txid();

    wallet.scan_full_tx(&tx.get_tx(), 100, 0);  // Pretend it is at height 100

    {
        let txs = wallet.txs.read().unwrap();

        // Now make sure the t addr was received
        assert_eq!(txs.len(), 1);
        assert_eq!(txs[&txid1].utxos.len(), 1);
        assert_eq!(txs[&txid1].utxos[0].address, taddr);
        assert_eq!(txs[&txid1].utxos[0].txid, txid1);
        assert_eq!(txs[&txid1].utxos[0].output_index, 1);
        assert_eq!(txs[&txid1].utxos[0].value, AMOUNT1);
        assert_eq!(txs[&txid1].utxos[0].height, 100);
        assert_eq!(txs[&txid1].utxos[0].spent, None);
        assert_eq!(txs[&txid1].utxos[0].unconfirmed_spent, None);

        assert_eq!(wallet.tbalance(None), AMOUNT1);
        assert_eq!(wallet.tbalance(Some(taddr)), AMOUNT1);
    }

    // Create a new Tx, spending this taddr
    let mut tx = FakeTransaction::new(&mut rng);
    tx.add_t_input(txid1, 1);   // Ours was at position 1 in the input tx
    let txid2 = tx.get_tx().txid();

    wallet.scan_full_tx(&tx.get_tx(), 101, 0);  // Pretent it is at height 101

    {
        // Make sure the txid was spent
        let txs = wallet.txs.read().unwrap();

        // Old utxo, that should be spent now
        assert_eq!(txs.len(), 2);
        assert_eq!(txs[&txid1].utxos.len(), 1);
        assert_eq!(txs[&txid1].utxos[0].value, AMOUNT1);
        assert_eq!(txs[&txid1].utxos[0].spent, Some(txid2));
        assert_eq!(txs[&txid1].utxos[0].unconfirmed_spent, None);

        assert_eq!(txs[&txid2].block, 101); // The second TxId is at block 101
        assert_eq!(txs[&txid2].utxos.len(), 0); // The second TxId has no UTXOs
        assert_eq!(txs[&txid2].total_transparent_value_spent, AMOUNT1);

        // Make sure there is no t-ZEC left
        assert_eq!(wallet.tbalance(None), 0);
    }
}

#[test]
fn test_serialization() {
    let config = get_test_config();

    let wallet = LightWallet::new(None, Some(get_entropy_string()), &config, 0).unwrap();

    // First, add an incoming transaction
    const AMOUNT1:u64 = 5;

    let mut cb1 = FakeCompactBlock::new(0, BlockHash([0; 32]));
    let (nf1, txid1) = cb1.add_tx_paying(wallet.extfvks.read().unwrap()[0].clone(), AMOUNT1);

    wallet.scan_block(&cb1.as_bytes()).unwrap();

    assert_eq!(wallet.txs.read().unwrap().len(), 1);
    assert_eq!(wallet.blocks.read().unwrap().len(), 1);
    assert_eq!(wallet.zbalance(None), AMOUNT1);

    // Add a t input at the Tx
    let pk = PublicKey::from_secret_key(&wallet.tkeys.read().unwrap()[0]);
    let taddr = wallet.address_from_sk(&wallet.tkeys.read().unwrap()[0]);

    const TAMOUNT1: u64 = 20;

    let mut tx = FakeTransaction::new_with_txid(txid1);
    tx.add_t_output(&pk, TAMOUNT1);
    wallet.scan_full_tx(&tx.get_tx(), 0, 0);  // Height 0

    const AMOUNT2:u64 = 2;

    // Add a second block, spending the first note
    let addr2 = ExtendedFullViewingKey::from(&ExtendedSpendingKey::master(&[0u8; 32]))
        .default_address().unwrap().1;
    let mut cb2 = FakeCompactBlock::new(1, cb1.hash());
    let txid2 = cb2.add_tx_spending((nf1, AMOUNT1), wallet.extfvks.read().unwrap()[0].clone(), addr2, AMOUNT2);
    wallet.scan_block(&cb2.as_bytes()).unwrap();

    let mut tx = FakeTransaction::new_with_txid(txid2);
    tx.add_t_input(txid1, 0);
    wallet.scan_full_tx(&tx.get_tx(), 1, 0);  // Height 1

    // Now, the original note should be spent and there should be a change
    assert_eq!(wallet.zbalance(None), AMOUNT1 - AMOUNT2 ); // The t addr amount is received + spent, so it cancels out

    // Now, serialize the wallet and read it back again
    let mut serialized_data = vec![];
    wallet.write(&mut serialized_data).expect("Serialize wallet");
    let wallet2 = LightWallet::read(&serialized_data[..], &config).unwrap();

    assert_eq!(wallet2.zbalance(None), AMOUNT1 - AMOUNT2);

    // Test the keys were serialized correctly
    {
        assert_eq!(wallet.seed, wallet2.seed);

        assert_eq!(wallet.extsks.read().unwrap().len(), wallet2.extsks.read().unwrap().len());
        assert_eq!(wallet.extsks.read().unwrap()[0], wallet2.extsks.read().unwrap()[0]);
        assert_eq!(wallet.extfvks.read().unwrap()[0], wallet2.extfvks.read().unwrap()[0]);
        assert_eq!(wallet.zaddress.read().unwrap()[0], wallet2.zaddress.read().unwrap()[0]);

        assert_eq!(wallet.tkeys.read().unwrap().len(), wallet2.tkeys.read().unwrap().len());
        assert_eq!(wallet.tkeys.read().unwrap()[0], wallet2.tkeys.read().unwrap()[0]);
    }

    // Test blocks were serialized properly
    {
        let blks = wallet2.blocks.read().unwrap();

        assert_eq!(blks.len(), 2);
        assert_eq!(blks[0].height, 0);
        assert_eq!(blks[1].height, 1);
    }

    // Test txns were serialized properly.
    {
        let txs = wallet2.txs.read().unwrap();

        // Old note was spent
        assert_eq!(txs[&txid1].txid, txid1);
        assert_eq!(txs[&txid1].notes.len(), 1);
        assert_eq!(txs[&txid1].notes[0].spent.unwrap(), txid2);
        assert_eq!(txs[&txid1].notes[0].note.value, AMOUNT1);
        assert_eq!(txs[&txid1].notes[0].is_change, false);

        // Old UTXO was spent
        assert_eq!(txs[&txid1].utxos.len(), 1);
        assert_eq!(txs[&txid1].utxos[0].address, taddr);
        assert_eq!(txs[&txid1].utxos[0].txid, txid1);
        assert_eq!(txs[&txid1].utxos[0].output_index, 0);
        assert_eq!(txs[&txid1].utxos[0].value, TAMOUNT1);
        assert_eq!(txs[&txid1].utxos[0].height, 0);
        assert_eq!(txs[&txid1].utxos[0].spent, Some(txid2));
        assert_eq!(txs[&txid1].utxos[0].unconfirmed_spent, None);

        // new note is not spent
        assert_eq!(txs[&txid2].txid, txid2);
        assert_eq!(txs[&txid2].notes.len(), 1);
        assert_eq!(txs[&txid2].notes[0].spent, None);
        assert_eq!(txs[&txid2].notes[0].note.value, AMOUNT1 - AMOUNT2);
        assert_eq!(txs[&txid2].notes[0].is_change, true);
        assert_eq!(txs[&txid2].total_shielded_value_spent, AMOUNT1);

        // The UTXO was spent in txid2
        assert_eq!(txs[&txid2].utxos.len(), 0); // The second TxId has no UTXOs
        assert_eq!(txs[&txid2].total_transparent_value_spent, TAMOUNT1);
    }
}

#[test]
fn test_multi_serialization() {
    let config = get_test_config();

    let wallet = LightWallet::new(None, Some(get_entropy_string()), &config, 0).unwrap();

    let taddr1 = wallet.address_from_sk(&wallet.tkeys.read().unwrap()[0]);
    let taddr2 = wallet.add_taddr();

    let (zaddr1, zpk1) = &wallet.get_z_private_keys()[0];
    let zaddr2 = wallet.add_zaddr();

    let mut serialized_data = vec![];
    wallet.write(&mut serialized_data).expect("Serialize wallet");
    let wallet2 = LightWallet::read(&serialized_data[..], &config).unwrap();

    assert_eq!(wallet2.tkeys.read().unwrap().len(), 2);
    assert_eq!(wallet2.extsks.read().unwrap().len(), 2);
    assert_eq!(wallet2.extfvks.read().unwrap().len(), 2);
    assert_eq!(wallet2.zaddress.read().unwrap().len(), 2);

    assert_eq!(taddr1, wallet.address_from_sk(&wallet.tkeys.read().unwrap()[0]));
    assert_eq!(taddr2, wallet.address_from_sk(&wallet.tkeys.read().unwrap()[1]));

    let (w2_zaddr1, w2_zpk1) = &wallet.get_z_private_keys()[0];
    let (w2_zaddr2, _) = &wallet.get_z_private_keys()[1];
    assert_eq!(zaddr1, w2_zaddr1);
    assert_eq!(zpk1, w2_zpk1);
    assert_eq!(zaddr2, *w2_zaddr2);

}

fn get_test_config() -> LightClientConfig {
    LightClientConfig {
        chain_name: "test".to_string(),
        sapling_activation_height: 0,
        consensus_branch_id: "000000".to_string(),
        anchor_offset: 0,
        data_dir: None,
    }
}

// Get a test wallet already setup with a single note
fn get_test_wallet(amount: u64) -> (LightWallet, TxId, BlockHash) {
    let config = get_test_config();

    let wallet = LightWallet::new(None, Some(get_entropy_string()), &config, 0).unwrap();

    let mut cb1 = FakeCompactBlock::new(0, BlockHash([0; 32]));
    let (_, txid1) = cb1.add_tx_paying(wallet.extfvks.read().unwrap()[0].clone(), amount);
    wallet.scan_block(&cb1.as_bytes()).unwrap();

    // We have one note
    {
        let txs = wallet.txs.read().unwrap();
        assert_eq!(txs[&txid1].notes.len(), 1);
        assert_eq!(txs[&txid1].notes[0].note.value, amount);
        assert_eq!(txs[&txid1].notes[0].spent, None);
        assert_eq!(txs[&txid1].notes[0].unconfirmed_spent, None);
    }

    assert_eq!(wallet.verified_zbalance(None), amount);

    // Create a new block so that the note is now verified to be spent
    let cb2 = FakeCompactBlock::new(1, cb1.hash());
    wallet.scan_block(&cb2.as_bytes()).unwrap();

    (wallet, txid1, cb2.hash())
}

#[test]
fn test_z_spend_to_z() {
    const AMOUNT1: u64 = 50000;
    let (wallet, txid1, block_hash) = get_test_wallet(AMOUNT1);

    let fvk = ExtendedFullViewingKey::from(&ExtendedSpendingKey::master(&[1u8; 32]));
    let ext_address = encode_payment_address(wallet.config.hrp_sapling_address(),
                        &fvk.default_address().unwrap().1);

    const AMOUNT_SENT: u64 = 20;

    let outgoing_memo = "Outgoing Memo".to_string();
    let fee: u64 = DEFAULT_FEE.try_into().unwrap();

    let branch_id = u32::from_str_radix("2bb40e60", 16).unwrap();
    let (ss, so) = get_sapling_params().unwrap();

    // Make sure that the balance exists 
    {
        assert_eq!(wallet.zbalance(None), AMOUNT1);
        assert_eq!(wallet.verified_zbalance(None), AMOUNT1);
    }

    // Create a tx and send to address
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
                            vec![(&ext_address, AMOUNT_SENT, Some(outgoing_memo.clone()))]).unwrap();

    let sent_tx = Transaction::read(&raw_tx[..]).unwrap();
    let sent_txid = sent_tx.txid();

    // Now, the note should be unconfirmed spent
    {
        let txs = wallet.txs.read().unwrap();

        assert_eq!(txs[&txid1].notes[0].note.value, AMOUNT1);
        assert_eq!(txs[&txid1].notes[0].is_change, false);
        assert_eq!(txs[&txid1].notes[0].spent, None);
        assert_eq!(txs[&txid1].notes[0].unconfirmed_spent, Some(sent_txid));
    }

    // It should also be in the mempool structure
    {
        let mem = wallet.mempool_txs.read().unwrap();

        assert_eq!(mem[&sent_txid].block, 2);   // block number is next block
        assert!   (mem[&sent_txid].datetime > 0);
        assert_eq!(mem[&sent_txid].txid, sent_txid);
        assert_eq!(mem[&sent_txid].outgoing_metadata.len(), 1);
        assert_eq!(mem[&sent_txid].outgoing_metadata[0].address, ext_address);
        assert_eq!(mem[&sent_txid].outgoing_metadata[0].value, AMOUNT_SENT);
        assert_eq!(mem[&sent_txid].outgoing_metadata[0].memo.to_utf8().unwrap().unwrap(), outgoing_memo);
    }

    {
        // The wallet should deduct this from the verified balance. The zbalance still includes it
        assert_eq!(wallet.zbalance(None), AMOUNT1);
        assert_eq!(wallet.verified_zbalance(None), 0);
    }

    let mut cb3 = FakeCompactBlock::new(2, block_hash);
    cb3.add_tx(&sent_tx);
    wallet.scan_block(&cb3.as_bytes()).unwrap();

    // Now this new Spent tx should be in, so the note should be marked confirmed spent
    {
        let txs = wallet.txs.read().unwrap();
        assert_eq!(txs[&txid1].notes.len(), 1);
        assert_eq!(txs[&txid1].notes[0].note.value, AMOUNT1);
        assert_eq!(txs[&txid1].notes[0].spent, Some(sent_txid));
        assert_eq!(txs[&txid1].notes[0].unconfirmed_spent, None);

        // The sent tx should generate change
        assert_eq!(txs[&sent_txid].notes.len(), 1);
        assert_eq!(txs[&sent_txid].notes[0].note.value, AMOUNT1 - AMOUNT_SENT - fee);
        assert_eq!(wallet.zbalance(None), AMOUNT1 - AMOUNT_SENT - fee);
        assert_eq!(txs[&sent_txid].notes[0].is_change, true);
        assert_eq!(txs[&sent_txid].notes[0].spent, None);
        assert_eq!(txs[&sent_txid].notes[0].unconfirmed_spent, None);
    }

    {
        // And the mempool tx should disappear
        let mem = wallet.mempool_txs.read().unwrap();
        assert!(mem.get(&sent_txid).is_none());
    }

    // Now, full scan the Tx, which should populate the Outgoing Meta data
    wallet.scan_full_tx(&sent_tx, 2, 0);

    // Check Outgoing Metadata
    {
        let txs = wallet.txs.read().unwrap();
        assert_eq!(txs[&sent_txid].total_shielded_value_spent, AMOUNT1);

        assert_eq!(txs[&sent_txid].outgoing_metadata.len(), 1);

        assert_eq!(txs[&sent_txid].outgoing_metadata[0].address, ext_address);
        assert_eq!(txs[&sent_txid].outgoing_metadata[0].value, AMOUNT_SENT);
        assert_eq!(txs[&sent_txid].outgoing_metadata[0].memo.to_utf8().unwrap().unwrap(), outgoing_memo);
    }
}

#[test]
fn test_multi_z() {
    const AMOUNT1: u64 = 50000;
    let (wallet, txid1, block_hash) = get_test_wallet(AMOUNT1);

    let zaddr2 = wallet.add_zaddr();   // This is acually address #6, since there are 5 initial addresses in the wallet

    const AMOUNT_SENT: u64 = 20;

    let outgoing_memo = "Outgoing Memo".to_string();
    let fee: u64 = DEFAULT_FEE.try_into().unwrap();

    let branch_id = u32::from_str_radix("2bb40e60", 16).unwrap();
    let (ss, so) =get_sapling_params().unwrap();

    // Create a tx and send to address
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
                            vec![(&zaddr2, AMOUNT_SENT, Some(outgoing_memo.clone()))]).unwrap();

    let sent_tx = Transaction::read(&raw_tx[..]).unwrap();
    let sent_txid = sent_tx.txid();

    let mut cb3 = FakeCompactBlock::new(2, block_hash);
    cb3.add_tx(&sent_tx);
    wallet.scan_block(&cb3.as_bytes()).unwrap();
    wallet.scan_full_tx(&sent_tx, 2, 0);

    // Because the builder will randomize notes outputted, we need to find
    // which note number is the change and which is the output note (Because this tx
    // had both outputs in the same Tx)
    let (change_note_number, ext_note_number) = {
        let txs = wallet.txs.read().unwrap();
        if txs[&sent_txid].notes[0].is_change { (0,1) } else { (1,0) }
    };

    // Now this new Spent tx should be in, so the note should be marked confirmed spent
    {
        let txs = wallet.txs.read().unwrap();
        assert_eq!(txs[&txid1].notes.len(), 1);
        assert_eq!(txs[&txid1].notes[0].note.value, AMOUNT1);
        assert_eq!(txs[&txid1].notes[0].spent, Some(sent_txid));
        assert_eq!(txs[&txid1].notes[0].unconfirmed_spent, None);

        // The sent tx should generate change + the new incoming note
        assert_eq!(txs[&sent_txid].notes.len(), 2);

        assert_eq!(txs[&sent_txid].notes[change_note_number].note.value, AMOUNT1 - AMOUNT_SENT - fee);
        assert_eq!(txs[&sent_txid].notes[change_note_number].account, 0);
        assert_eq!(txs[&sent_txid].notes[change_note_number].is_change, true);
        assert_eq!(txs[&sent_txid].notes[change_note_number].spent, None);
        assert_eq!(txs[&sent_txid].notes[change_note_number].unconfirmed_spent, None);
        assert_eq!(LightWallet::memo_str(&txs[&sent_txid].notes[change_note_number].memo), None);

        assert_eq!(txs[&sent_txid].notes[ext_note_number].note.value, AMOUNT_SENT);
        assert_eq!(txs[&sent_txid].notes[ext_note_number].account, 6);  // The new addr is added after the change addresses
        assert_eq!(txs[&sent_txid].notes[ext_note_number].is_change, false);
        assert_eq!(txs[&sent_txid].notes[ext_note_number].spent, None);
        assert_eq!(txs[&sent_txid].notes[ext_note_number].unconfirmed_spent, None);
        assert_eq!(LightWallet::memo_str(&txs[&sent_txid].notes[ext_note_number].memo), Some(outgoing_memo));

        assert_eq!(txs[&sent_txid].total_shielded_value_spent, AMOUNT1);

        // No Outgoing meta data, since this is a wallet -> wallet tx
        assert_eq!(txs[&sent_txid].outgoing_metadata.len(), 0);
    }

    // Now spend the money, which should pick notes from both addresses
    let amount_all:u64 = (AMOUNT1 - AMOUNT_SENT - fee) + (AMOUNT_SENT) - fee;
    let taddr = wallet.address_from_sk(&SecretKey::parse_slice(&[1u8; 32]).unwrap());

    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
                                        vec![(&taddr, amount_all, None)]).unwrap();
    let sent_tx = Transaction::read(&raw_tx[..]).unwrap();
    let sent_ext_txid = sent_tx.txid();

    let mut cb4 = FakeCompactBlock::new(3, cb3.hash());
    cb4.add_tx(&sent_tx);
    wallet.scan_block(&cb4.as_bytes()).unwrap();
    wallet.scan_full_tx(&sent_tx, 3, 0);

    {
        // Both notes should be spent now.
        let txs = wallet.txs.read().unwrap();

        assert_eq!(txs[&sent_txid].notes[change_note_number].is_change, true);
        assert_eq!(txs[&sent_txid].notes[change_note_number].spent, Some(sent_ext_txid));
        assert_eq!(txs[&sent_txid].notes[change_note_number].unconfirmed_spent, None);

        assert_eq!(txs[&sent_txid].notes[ext_note_number].is_change, false);
        assert_eq!(txs[&sent_txid].notes[ext_note_number].spent, Some(sent_ext_txid));
        assert_eq!(txs[&sent_txid].notes[ext_note_number].unconfirmed_spent, None);

        // Check outgoing metadata for the external sent tx
        assert_eq!(txs[&sent_ext_txid].notes.len(), 0); // No change was generated
        assert_eq!(txs[&sent_ext_txid].outgoing_metadata.len(), 1);
        assert_eq!(txs[&sent_ext_txid].outgoing_metadata[0].address, taddr);
        assert_eq!(txs[&sent_ext_txid].outgoing_metadata[0].value, amount_all);
    }
}

#[test]
fn test_z_spend_to_taddr() {
    const AMOUNT1: u64 = 50000;
    let (wallet, txid1, block_hash) = get_test_wallet(AMOUNT1);

    let branch_id = u32::from_str_radix("2bb40e60", 16).unwrap();
    let (ss, so) = get_sapling_params().unwrap();

    let taddr = wallet.address_from_sk(&SecretKey::parse_slice(&[1u8; 32]).unwrap());
    const AMOUNT_SENT: u64 = 30;
    let fee: u64 = DEFAULT_FEE.try_into().unwrap();

    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
                                        vec![(&taddr, AMOUNT_SENT, None)]).unwrap();
    let sent_tx = Transaction::read(&raw_tx[..]).unwrap();
    let sent_txid = sent_tx.txid();

    // Now, the note should be unconfirmed spent
    {
        let txs = wallet.txs.read().unwrap();

        assert_eq!(txs[&txid1].notes[0].note.value, AMOUNT1);
        assert_eq!(txs[&txid1].notes[0].is_change, false);
        assert_eq!(txs[&txid1].notes[0].spent, None);
        assert_eq!(txs[&txid1].notes[0].unconfirmed_spent, Some(sent_txid));
    }

    let mut cb3 = FakeCompactBlock::new(2, block_hash);
    cb3.add_tx(&sent_tx);
    wallet.scan_block(&cb3.as_bytes()).unwrap();

    // Now this new Spent tx should be in, so the note should be marked confirmed spent
    {
        let txs = wallet.txs.read().unwrap();
        assert_eq!(txs[&txid1].notes.len(), 1);
        assert_eq!(txs[&txid1].notes[0].note.value, AMOUNT1);
        assert_eq!(txs[&txid1].notes[0].spent, Some(sent_txid));
        assert_eq!(txs[&txid1].notes[0].unconfirmed_spent, None);

        // The sent tx should generate change
        assert_eq!(txs[&sent_txid].notes.len(), 1);
        assert_eq!(txs[&sent_txid].notes[0].note.value, AMOUNT1 - AMOUNT_SENT - fee);
        assert_eq!(txs[&sent_txid].notes[0].is_change, true);
        assert_eq!(txs[&sent_txid].notes[0].spent, None);
        assert_eq!(txs[&sent_txid].notes[0].unconfirmed_spent, None);
    }

    // Now, full scan the Tx, which should populate the Outgoing Meta data
    wallet.scan_full_tx(&sent_tx, 2, 0);

    // Check Outgoing Metadata for t address
    {
        let txs = wallet.txs.read().unwrap();
        assert_eq!(txs[&sent_txid].outgoing_metadata.len(), 1);
        assert_eq!(txs[&sent_txid].outgoing_metadata[0].address, taddr);
        assert_eq!(txs[&sent_txid].outgoing_metadata[0].value, AMOUNT_SENT);
        assert_eq!(txs[&sent_txid].total_shielded_value_spent, AMOUNT1);
    }

    // Create a new Tx, but this time with a memo.
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
        vec![(&taddr, AMOUNT_SENT, Some("T address memo".to_string()))]).unwrap();
    let sent_tx = Transaction::read(&raw_tx[..]).unwrap();
    let sent_txid2 = sent_tx.txid();

    // There should be a mempool Tx, but the memo should be dropped, because it was sent to a
    // t address
    {
        let txs = wallet.mempool_txs.read().unwrap();

        assert_eq!(txs[&sent_txid2].outgoing_metadata.len(), 1);
        assert_eq!(txs[&sent_txid2].outgoing_metadata[0].address, taddr);
        assert_eq!(txs[&sent_txid2].outgoing_metadata[0].value, AMOUNT_SENT);
        assert_eq!(LightWallet::memo_str(&Some(txs[&sent_txid2].outgoing_metadata[0].memo.clone())), None);
    }

    // Now add the block
    let mut cb4 = FakeCompactBlock::new(3, cb3.hash());
    cb4.add_tx(&sent_tx);
    wallet.scan_block(&cb4.as_bytes()).unwrap();
    wallet.scan_full_tx(&sent_tx, 3, 0);

    // Check Outgoing Metadata for t address, but once again there should be no memo
    {
        let txs = wallet.txs.read().unwrap();
        assert_eq!(txs[&sent_txid2].outgoing_metadata.len(), 1);
        assert_eq!(txs[&sent_txid2].outgoing_metadata[0].address, taddr);
        assert_eq!(txs[&sent_txid2].outgoing_metadata[0].value, AMOUNT_SENT);
        assert_eq!(LightWallet::memo_str(&Some(txs[&sent_txid2].outgoing_metadata[0].memo.clone())), None);
    }
}

#[test]
fn test_t_spend_to_z() {
    let mut rng = OsRng;

    const AMOUNT_Z: u64 = 50000;
    const AMOUNT_T: u64 = 40000;
    let (wallet, txid1, block_hash) = get_test_wallet(AMOUNT_Z);

    let pk = PublicKey::from_secret_key(&wallet.tkeys.read().unwrap()[0]);
    let taddr = wallet.address_from_sk(&wallet.tkeys.read().unwrap()[0]);

    let mut tx = FakeTransaction::new(&mut rng);
    tx.add_t_output(&pk, AMOUNT_T);
    let txid_t = tx.get_tx().txid();

    wallet.scan_full_tx(&tx.get_tx(), 1, 0);  // Pretend it is at height 1

    {
        let txs = wallet.txs.read().unwrap();

        // Now make sure the t addr was recieved
        assert_eq!(txs[&txid_t].utxos.len(), 1);
        assert_eq!(txs[&txid_t].utxos[0].address, taddr);
        assert_eq!(txs[&txid_t].utxos[0].spent, None);
        assert_eq!(txs[&txid_t].utxos[0].unconfirmed_spent, None);

        assert_eq!(wallet.tbalance(None), AMOUNT_T);
    }


    let fvk = ExtendedFullViewingKey::from(&ExtendedSpendingKey::master(&[1u8; 32]));
    let ext_address = encode_payment_address(wallet.config.hrp_sapling_address(),
                        &fvk.default_address().unwrap().1);
    const AMOUNT_SENT: u64 = 20;

    let outgoing_memo = "Outgoing Memo".to_string();
    let fee: u64 = DEFAULT_FEE.try_into().unwrap();

    let branch_id = u32::from_str_radix("2bb40e60", 16).unwrap();
    let (ss, so) =get_sapling_params().unwrap();

    // Create a tx and send to address. This should consume both the UTXO and the note
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
                            vec![(&ext_address, AMOUNT_SENT, Some(outgoing_memo.clone()))]).unwrap();

    let sent_tx = Transaction::read(&raw_tx[..]).unwrap();
    let sent_txid = sent_tx.txid();

    // Verify the sent_tx for sanity
    {
        // The tx has 1 note spent, 1 utxo spent, and (1 note out, 1 note change)
        assert_eq!(sent_tx.shielded_spends.len(), 1);
        assert_eq!(sent_tx.vin.len(), 1);
        assert_eq!(sent_tx.shielded_outputs.len(), 2);
    }

    // Now, the note and utxo should be unconfirmed spent
    {
        let txs = wallet.txs.read().unwrap();

        // UTXO
        assert_eq!(txs[&txid_t].utxos.len(), 1);
        assert_eq!(txs[&txid_t].utxos[0].address, taddr);
        assert_eq!(txs[&txid_t].utxos[0].spent, None);
        assert_eq!(txs[&txid_t].utxos[0].unconfirmed_spent, Some(sent_txid));

        // Note
        assert_eq!(txs[&txid1].notes[0].note.value, AMOUNT_Z);
        assert_eq!(txs[&txid1].notes[0].spent, None);
        assert_eq!(txs[&txid1].notes[0].unconfirmed_spent, Some(sent_txid));
    }

    let mut cb3 = FakeCompactBlock::new(2, block_hash);
    cb3.add_tx(&sent_tx);

    // Scan the compact block and the full Tx
    wallet.scan_block(&cb3.as_bytes()).unwrap();
    wallet.scan_full_tx(&sent_tx, 2, 0);

    // Now this new Spent tx should be in, so the note should be marked confirmed spent
    {
        let txs = wallet.txs.read().unwrap();
        assert_eq!(txs[&txid1].notes.len(), 1);
        assert_eq!(txs[&txid1].notes[0].note.value, AMOUNT_Z);
        assert_eq!(txs[&txid1].notes[0].spent, Some(sent_txid));
        assert_eq!(txs[&txid1].notes[0].unconfirmed_spent, None);

        // The UTXO should also be spent
        assert_eq!(txs[&txid_t].utxos[0].address, taddr);
        assert_eq!(txs[&txid_t].utxos[0].spent, Some(sent_txid));
        assert_eq!(txs[&txid_t].utxos[0].unconfirmed_spent, None);

        // The sent tx should generate change
        assert_eq!(txs[&sent_txid].notes.len(), 1);
        assert_eq!(txs[&sent_txid].notes[0].note.value, AMOUNT_Z + AMOUNT_T - AMOUNT_SENT - fee);
        assert_eq!(txs[&sent_txid].notes[0].is_change, true);
        assert_eq!(txs[&sent_txid].notes[0].spent, None);
        assert_eq!(txs[&sent_txid].notes[0].unconfirmed_spent, None);
    }
}

#[test]
fn test_z_incoming_memo() {
    const AMOUNT1: u64 = 50000;
    let (wallet, _txid1, block_hash) = get_test_wallet(AMOUNT1);

    let my_address = encode_payment_address(wallet.config.hrp_sapling_address(),
                        &wallet.extfvks.read().unwrap()[0].default_address().unwrap().1);

    let memo = "Incoming Memo".to_string();
    let fee: u64 = DEFAULT_FEE.try_into().unwrap();

    let branch_id = u32::from_str_radix("2bb40e60", 16).unwrap();
    let (ss, so) = get_sapling_params().unwrap();

    // Create a tx and send to address
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
                            vec![(&my_address, AMOUNT1 - fee, Some(memo.clone()))]).unwrap();
    let sent_tx = Transaction::read(&raw_tx[..]).unwrap();
    let sent_txid = sent_tx.txid();

    // Add it to a block
    let mut cb3 = FakeCompactBlock::new(2, block_hash);
    cb3.add_tx(&sent_tx);
    wallet.scan_block(&cb3.as_bytes()).unwrap();

    // And scan the Full Tx to get the memo
    wallet.scan_full_tx(&sent_tx, 2, 0);

    {
        let txs = wallet.txs.read().unwrap();
        
        assert_eq!(txs[&sent_txid].notes.len(), 1);

        assert_eq!(txs[&sent_txid].notes[0].extfvk, wallet.extfvks.read().unwrap()[0]);
        assert_eq!(txs[&sent_txid].notes[0].note.value, AMOUNT1 - fee);
        assert_eq!(LightWallet::note_address(wallet.config.hrp_sapling_address(), &txs[&sent_txid].notes[0]), Some(my_address));
        assert_eq!(LightWallet::memo_str(&txs[&sent_txid].notes[0].memo), Some(memo));
    }
}

#[test]
fn test_add_new_zt_hd_after_incoming() {
    // When an address recieves funds, a new, unused address should automatically get added 
    const AMOUNT1: u64 = 50000;
    let (wallet, _txid1, block_hash) = get_test_wallet(AMOUNT1);

    // Get the last address
    let my_address = encode_payment_address(wallet.config.hrp_sapling_address(),
                        &wallet.extfvks.read().unwrap().last().unwrap().default_address().unwrap().1);

    let fee: u64 = DEFAULT_FEE.try_into().unwrap();

    let branch_id = u32::from_str_radix("2bb40e60", 16).unwrap();
    let (ss, so) = get_sapling_params().unwrap();

    assert_eq!(wallet.zaddress.read().unwrap().len(), 6);   // Starts with 1+5 addresses

    // Create a tx and send to the last address
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
                            vec![(&my_address, AMOUNT1 - fee, None)]).unwrap();
    let sent_tx = Transaction::read(&raw_tx[..]).unwrap();

    // Add it to a block
    let mut cb3 = FakeCompactBlock::new(2, block_hash);
    cb3.add_tx(&sent_tx);
    wallet.scan_block(&cb3.as_bytes()).unwrap();

    // NOw, 5 new addresses should be created
    assert_eq!(wallet.zaddress.read().unwrap().len(), 6+5);     

    let mut rng = OsRng;
    // Send a fake transaction to the last taddr
    let pk = PublicKey::from_secret_key(&wallet.tkeys.read().unwrap().last().unwrap());

    // Start with 1 taddr
    assert_eq!(wallet.taddresses.read().unwrap().len(), 1); 

    // Send a Tx to the last address
    let mut tx = FakeTransaction::new(&mut rng);
    tx.add_t_output(&pk, AMOUNT1);
    wallet.scan_full_tx(&tx.get_tx(), 3, 0);  

    // Now, 5 new addresses should be created. 
    assert_eq!(wallet.taddresses.read().unwrap().len(), 1+5); 
}

#[test]
fn test_z_to_t_withinwallet() {
    const AMOUNT: u64 = 500000;
    const AMOUNT_SENT: u64 = 20000;
    let (wallet, txid1, block_hash) = get_test_wallet(AMOUNT);

    let taddr = wallet.address_from_sk(&wallet.tkeys.read().unwrap()[0]);

    let fee: u64 = DEFAULT_FEE.try_into().unwrap();

    let branch_id = u32::from_str_radix("2bb40e60", 16).unwrap();
    let (ss, so) = get_sapling_params().unwrap();

    // Create a tx and send to address
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
                            vec![(&taddr, AMOUNT_SENT, None)]).unwrap();
    let sent_tx = Transaction::read(&raw_tx[..]).unwrap();
    let sent_txid = sent_tx.txid();

    // Add it to a block
    let mut cb3 = FakeCompactBlock::new(2, block_hash);
    cb3.add_tx(&sent_tx);
    wallet.scan_block(&cb3.as_bytes()).unwrap();

    // And scan the Full Tx to get the memo
    wallet.scan_full_tx(&sent_tx, 2, 0);

    {
        let txs = wallet.txs.read().unwrap();
        
        // We have the original note
        assert_eq!(txs[&txid1].notes.len(), 1);
        assert_eq!(txs[&txid1].notes[0].note.value, AMOUNT);
        
        // We have the spent tx
        assert_eq!(txs[&sent_txid].notes.len(), 1);
        assert_eq!(txs[&sent_txid].notes[0].note.value, AMOUNT - AMOUNT_SENT - fee);
        assert_eq!(txs[&sent_txid].notes[0].is_change, true);
        assert_eq!(txs[&sent_txid].notes[0].spent, None);
        assert_eq!(txs[&sent_txid].notes[0].unconfirmed_spent, None);

        // Since we sent the Tx to ourself, there should be no outgoing 
        // metadata
        assert_eq!(txs[&sent_txid].total_shielded_value_spent, AMOUNT);
        assert_eq!(txs[&sent_txid].outgoing_metadata.len(), 0);


        // We have the taddr utxo in the same Tx
        assert_eq!(txs[&sent_txid].utxos.len(), 1);
        assert_eq!(txs[&sent_txid].utxos[0].address, taddr);
        assert_eq!(txs[&sent_txid].utxos[0].value, AMOUNT_SENT);
        assert_eq!(txs[&sent_txid].utxos[0].spent, None);
        assert_eq!(txs[&sent_txid].utxos[0].unconfirmed_spent, None);

    }
}

#[test]
fn test_multi_t() {
    const AMOUNT: u64 = 5000000;
    const AMOUNT_SENT1: u64 = 20000;
    const AMOUNT_SENT2: u64 = 10000;

    let (wallet, txid1, block_hash) = get_test_wallet(AMOUNT);

    // Add a new taddr
    let taddr2 = wallet.add_taddr();

    let fee: u64 = DEFAULT_FEE.try_into().unwrap();

    let branch_id = u32::from_str_radix("2bb40e60", 16).unwrap();
    let (ss, so) = get_sapling_params().unwrap();

    // Create a Tx and send to the second t address
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
                            vec![(&taddr2, AMOUNT_SENT1, None)]).unwrap();
    let sent_tx = Transaction::read(&raw_tx[..]).unwrap();
    let sent_txid1 = sent_tx.txid();

    // Add it to a block
    let mut cb3 = FakeCompactBlock::new(2, block_hash);
    cb3.add_tx(&sent_tx);
    wallet.scan_block(&cb3.as_bytes()).unwrap();
    wallet.scan_full_tx(&sent_tx, 2, 0);

    // Check that the send to the second taddr worked
    {
        let txs = wallet.txs.read().unwrap();
        
        // We have the original note
        assert_eq!(txs[&txid1].notes.len(), 1);
        assert_eq!(txs[&txid1].notes[0].note.value, AMOUNT);
        
        // We have the spent tx
        assert_eq!(txs[&sent_txid1].notes.len(), 1);
        assert_eq!(txs[&sent_txid1].notes[0].note.value, AMOUNT - AMOUNT_SENT1 - fee);
        assert_eq!(txs[&sent_txid1].notes[0].is_change, true);
        assert_eq!(txs[&sent_txid1].notes[0].spent, None);
        assert_eq!(txs[&sent_txid1].notes[0].unconfirmed_spent, None);

        // Since we sent the Tx to ourself, there should be no outgoing 
        // metadata
        assert_eq!(txs[&sent_txid1].total_shielded_value_spent, AMOUNT);
        assert_eq!(txs[&sent_txid1].outgoing_metadata.len(), 0);


        // We have the taddr utxo in the same Tx
        assert_eq!(txs[&sent_txid1].utxos.len(), 1);
        assert_eq!(txs[&sent_txid1].utxos[0].address, taddr2);
        assert_eq!(txs[&sent_txid1].utxos[0].value, AMOUNT_SENT1);
        assert_eq!(txs[&sent_txid1].utxos[0].spent, None);
        assert_eq!(txs[&sent_txid1].utxos[0].unconfirmed_spent, None);
    }

    // Send some money to the 3rd t addr
    let taddr3 = wallet.add_taddr();

    // Create a Tx and send to the second t address
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
                            vec![(&taddr3, AMOUNT_SENT2, None)]).unwrap();
    let sent_tx = Transaction::read(&raw_tx[..]).unwrap();
    let sent_txid2 = sent_tx.txid();

    // Add it to a block
    let mut cb4 = FakeCompactBlock::new(3, cb3.hash());
    cb4.add_tx(&sent_tx);
    wallet.scan_block(&cb4.as_bytes()).unwrap();
    wallet.scan_full_tx(&sent_tx, 3, 0);

    // Quickly check we have it
    {
        let txs = wallet.txs.read().unwrap();
        
        // We have the taddr utxo in the same Tx
        assert_eq!(txs[&sent_txid2].utxos.len(), 1);
        assert_eq!(txs[&sent_txid2].utxos[0].address, taddr3);
        assert_eq!(txs[&sent_txid2].utxos[0].value, AMOUNT_SENT2);

        // Old UTXO was spent here
        assert_eq!(txs[&sent_txid1].utxos.len(), 1);
        assert_eq!(txs[&sent_txid1].utxos[0].value, AMOUNT_SENT1);
        assert_eq!(txs[&sent_txid1].utxos[0].address, taddr2);
        assert_eq!(txs[&sent_txid1].utxos[0].spent, Some(sent_txid2));
        assert_eq!(txs[&sent_txid1].utxos[0].unconfirmed_spent, None);
    }

    // Now, spend to an external z address, which will select all the utxos
    let fvk = ExtendedFullViewingKey::from(&ExtendedSpendingKey::master(&[1u8; 32]));
    let ext_address = encode_payment_address(wallet.config.hrp_sapling_address(),
                        &fvk.default_address().unwrap().1);

    const AMOUNT_SENT_EXT: u64 = 45;
    let outgoing_memo = "Outgoing Memo".to_string();

    // Create a tx and send to address
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
                            vec![(&ext_address, AMOUNT_SENT_EXT, Some(outgoing_memo.clone()))]).unwrap();

    let sent_tx = Transaction::read(&raw_tx[..]).unwrap();
    let sent_txid3 = sent_tx.txid();

    let mut cb5 = FakeCompactBlock::new(4, cb4.hash());
    cb5.add_tx(&sent_tx);
    wallet.scan_block(&cb5.as_bytes()).unwrap();
    wallet.scan_full_tx(&sent_tx, 4, 0);

    {
        let txs = wallet.txs.read().unwrap();
        assert_eq!(txs[&sent_txid3].outgoing_metadata.len(), 1);

        assert_eq!(txs[&sent_txid3].outgoing_metadata[0].address, ext_address);
        assert_eq!(txs[&sent_txid3].outgoing_metadata[0].value, AMOUNT_SENT_EXT);
        assert_eq!(txs[&sent_txid3].outgoing_metadata[0].memo.to_utf8().unwrap().unwrap(), outgoing_memo);

        // Test to see that the UTXOs were spent.

        // UTXO2
        assert_eq!(txs[&sent_txid2].utxos[0].value, AMOUNT_SENT2);
        assert_eq!(txs[&sent_txid2].utxos[0].address, taddr3);
        assert_eq!(txs[&sent_txid2].utxos[0].spent, Some(sent_txid3));
        assert_eq!(txs[&sent_txid2].utxos[0].unconfirmed_spent, None);
    }

}

#[test]
fn test_multi_spends() {
    const AMOUNT1: u64 = 50000;
    let (wallet, txid1, block_hash) = get_test_wallet(AMOUNT1);

    let zaddr2 = wallet.add_zaddr();    // Address number 6
    const ZAMOUNT2:u64 = 30;
    let outgoing_memo2 = "Outgoing Memo2".to_string();

    let zaddr3 = wallet.add_zaddr();    // Address number 7
    const ZAMOUNT3:u64 = 40;
    let outgoing_memo3 = "Outgoing Memo3".to_string();

    let taddr2 = wallet.add_taddr();
    const TAMOUNT2:u64 = 50;
    let taddr3 = wallet.add_taddr();
    const TAMOUNT3:u64 = 60;

    let fee: u64 = DEFAULT_FEE.try_into().unwrap();

    let branch_id = u32::from_str_radix("2bb40e60", 16).unwrap();
    let (ss, so) = get_sapling_params().unwrap();

    let tos = vec![ (zaddr2.as_str(), ZAMOUNT2, Some(outgoing_memo2.clone())),
                    (zaddr3.as_str(), ZAMOUNT3, Some(outgoing_memo3.clone())),
                    (taddr2.as_str(), TAMOUNT2, None),
                    (taddr3.as_str(), TAMOUNT3, None) ];
    
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so, tos).unwrap();
    let sent_tx = Transaction::read(&raw_tx[..]).unwrap();
    let sent_txid = sent_tx.txid();

    let mut cb3 = FakeCompactBlock::new(2, block_hash);
    cb3.add_tx(&sent_tx);
    wallet.scan_block(&cb3.as_bytes()).unwrap();
    wallet.scan_full_tx(&sent_tx, 2, 0);

    // Make sure all the outputs are there!
    {
        let txs = wallet.txs.read().unwrap();

        // The single note was spent
        assert_eq!(txs[&txid1].notes[0].note.value, AMOUNT1);
        assert_eq!(txs[&txid1].notes[0].spent, Some(sent_txid));

        // The outputs are all sent to the wallet, so they should 
        // correspond to notes & utxos.
        // 2 notes + 1 change
        assert_eq!(txs[&sent_txid].notes.len(), 3);

        // Find the change note
        let change_note = txs[&sent_txid].notes.iter().find(|n| n.is_change).unwrap();
        assert_eq!(change_note.note.value, AMOUNT1 - (ZAMOUNT2+ZAMOUNT3+TAMOUNT2+TAMOUNT3+fee));
        assert_eq!(change_note.spent, None);
        assert_eq!(change_note.unconfirmed_spent, None);

        // Find zaddr2
        let zaddr2_note = txs[&sent_txid].notes.iter().find(|n| n.note.value == ZAMOUNT2).unwrap();
        assert_eq!(zaddr2_note.account, 6);
        assert_eq!(zaddr2_note.is_change, false);
        assert_eq!(zaddr2_note.spent, None);
        assert_eq!(zaddr2_note.unconfirmed_spent, None);
        assert_eq!(LightWallet::memo_str(&zaddr2_note.memo), Some(outgoing_memo2));

        // Find zaddr3
        let zaddr3_note = txs[&sent_txid].notes.iter().find(|n| n.note.value == ZAMOUNT3).unwrap();
        assert_eq!(zaddr3_note.account, 7);
        assert_eq!(zaddr3_note.is_change, false);
        assert_eq!(zaddr3_note.spent, None);
        assert_eq!(zaddr3_note.unconfirmed_spent, None);
        assert_eq!(LightWallet::memo_str(&zaddr3_note.memo), Some(outgoing_memo3));

        // Find taddr2
        let utxo2 = txs[&sent_txid].utxos.iter().find(|u| u.value == TAMOUNT2).unwrap();
        assert_eq!(utxo2.address, taddr2);
        assert_eq!(utxo2.txid, sent_txid);
        assert_eq!(utxo2.spent, None);
        assert_eq!(utxo2.unconfirmed_spent, None);

        // Find taddr3
        let utxo3 = txs[&sent_txid].utxos.iter().find(|u| u.value == TAMOUNT3).unwrap();
        assert_eq!(utxo3.address, taddr3);
        assert_eq!(utxo3.txid, sent_txid);
        assert_eq!(utxo3.spent, None);
        assert_eq!(utxo3.unconfirmed_spent, None);
    }

    // Now send an outgoing tx to one ext taddr and one ext zaddr
    let fvk = ExtendedFullViewingKey::from(&ExtendedSpendingKey::master(&[1u8; 32]));
    let ext_address = encode_payment_address(wallet.config.hrp_sapling_address(),
                        &fvk.default_address().unwrap().1);
    let ext_memo = "External memo".to_string();
    let ext_taddr = wallet.address_from_sk(&SecretKey::parse_slice(&[1u8; 32]).unwrap());

    const EXT_ZADDR_AMOUNT: u64 = 3000;
    let ext_taddr_amount = AMOUNT1 - fee - EXT_ZADDR_AMOUNT - fee; // Spend everything
    println!("taddr amount {}", ext_taddr_amount);

    let tos = vec![ (ext_address.as_str(), EXT_ZADDR_AMOUNT, Some(ext_memo.clone())),
                    (ext_taddr.as_str(), ext_taddr_amount, None)];
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so, tos).unwrap();
    let sent_tx = Transaction::read(&raw_tx[..]).unwrap();
    let sent_txid2 = sent_tx.txid();

    let mut cb4 = FakeCompactBlock::new(3, cb3.hash());
    cb4.add_tx(&sent_tx);
    wallet.scan_block(&cb4.as_bytes()).unwrap();
    wallet.scan_full_tx(&sent_tx, 3, 0);

    // Make sure all the outputs are there!
    {
        let txs = wallet.txs.read().unwrap();

        // All notes were spent
        assert_eq!(txs[&sent_txid].notes[0].spent, Some(sent_txid2));
        assert_eq!(txs[&sent_txid].notes[1].spent, Some(sent_txid2));
        assert_eq!(txs[&sent_txid].notes[2].spent, Some(sent_txid2));

        // All utxos were spent
        assert_eq!(txs[&sent_txid].utxos[0].spent, Some(sent_txid2));
        assert_eq!(txs[&sent_txid].utxos[1].spent, Some(sent_txid2));

        // The new tx has no change
        assert_eq!(txs[&sent_txid2].notes.len(), 0);
        assert_eq!(txs[&sent_txid2].utxos.len(), 0);
        
        // Test the outgoing metadata
        // Find the znote
        let zoutgoing = txs[&sent_txid2].outgoing_metadata.iter().find(|o| o.address == ext_address).unwrap();
        assert_eq!(zoutgoing.value, EXT_ZADDR_AMOUNT);
        assert_eq!(LightWallet::memo_str(&Some(zoutgoing.memo.clone())), Some(ext_memo));

        // Find the taddr
        let toutgoing = txs[&sent_txid2].outgoing_metadata.iter().find(|o| o.address == ext_taddr).unwrap();
        assert_eq!(toutgoing.value, ext_taddr_amount);
        assert_eq!(LightWallet::memo_str(&Some(toutgoing.memo.clone())), None);
    }
}

#[test]
fn test_bad_send() {
    // Test all the ways in which a send should fail
    const AMOUNT1: u64 = 50000;
    let _fee: u64 = DEFAULT_FEE.try_into().unwrap();

    let (wallet, _txid1, _block_hash) = get_test_wallet(AMOUNT1);

    let branch_id = u32::from_str_radix("2bb40e60", 16).unwrap();
    let (ss, so) = get_sapling_params().unwrap();
    let ext_taddr = wallet.address_from_sk(&SecretKey::parse_slice(&[1u8; 32]).unwrap());       

    // Bad address
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
                                        vec![(&"badaddress", 10, None)]);
    assert!(raw_tx.err().unwrap().contains("Invalid recipient address"));

    // Insufficient funds
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
                                        vec![(&ext_taddr, AMOUNT1 + 10, None)]);
    assert!(raw_tx.err().unwrap().contains("Insufficient verified funds"));

    // Duplicated addresses
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
                                        vec![(&ext_taddr, AMOUNT1 + 10, None),
                                             (&ext_taddr, AMOUNT1 + 10, None)]);
    assert!(raw_tx.err().unwrap().contains("duplicate"));

    // No addresses
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so, vec![]);
    assert!(raw_tx.err().unwrap().contains("at least one"));

}

#[test]
#[should_panic]
fn test_bad_params() {
    let (wallet, _, _) = get_test_wallet(100000);
    let ext_taddr = wallet.address_from_sk(&SecretKey::parse_slice(&[1u8; 32]).unwrap());  

    let branch_id = u32::from_str_radix("2bb40e60", 16).unwrap();
    // Bad params
    let _ = wallet.send_to_address(branch_id, &[], &[],
                            vec![(&ext_taddr, 10, None)]);
}

/// Test helper to add blocks
fn add_blocks(wallet: &LightWallet, start: i32, num: i32, mut prev_hash: BlockHash) -> Result<BlockHash, i32>{
    // Add it to a block
    let mut new_blk = FakeCompactBlock::new(start, prev_hash);
    for i in 0..num {
        new_blk = FakeCompactBlock::new(start+i, prev_hash);
        prev_hash = new_blk.hash();
        match wallet.scan_block(&new_blk.as_bytes()) {
            Ok(_)  => {}, // continue
            Err(e) => return Err(e)
        };
    }

    Ok(new_blk.hash())
}

#[test]
fn test_z_mempool_expiry() {
    const AMOUNT1: u64 = 50000;
    let (wallet, _, block_hash) = get_test_wallet(AMOUNT1);

    let fvk = ExtendedFullViewingKey::from(&ExtendedSpendingKey::master(&[1u8; 32]));
    let ext_address = encode_payment_address(wallet.config.hrp_sapling_address(),
                        &fvk.default_address().unwrap().1);

    const AMOUNT_SENT: u64 = 20;

    let outgoing_memo = "Outgoing Memo".to_string();

    let branch_id = u32::from_str_radix("2bb40e60", 16).unwrap();
    let (ss, so) = get_sapling_params().unwrap();

    // Create a tx and send to address
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
                            vec![(&ext_address, AMOUNT_SENT, Some(outgoing_memo.clone()))]).unwrap();

    let sent_tx = Transaction::read(&raw_tx[..]).unwrap();
    let sent_txid = sent_tx.txid();

    // It should also be in the mempool structure
    {
        let mem = wallet.mempool_txs.read().unwrap();

        assert_eq!(mem[&sent_txid].block, 2);   // block number is next block
        assert!   (mem[&sent_txid].datetime > 0);
        assert_eq!(mem[&sent_txid].txid, sent_txid);
        assert_eq!(mem[&sent_txid].outgoing_metadata.len(), 1);
        assert_eq!(mem[&sent_txid].outgoing_metadata[0].address, ext_address);
        assert_eq!(mem[&sent_txid].outgoing_metadata[0].value, AMOUNT_SENT);
        assert_eq!(mem[&sent_txid].outgoing_metadata[0].memo.to_utf8().unwrap().unwrap(), outgoing_memo);
    }

    // Don't mine the Tx, but just add several blocks
    add_blocks(&wallet, 2, 21, block_hash).unwrap();

    // After 21 blocks, it should disappear (expiry is 20 blocks) since it was not mined
    {
        let mem = wallet.mempool_txs.read().unwrap();

        assert!(mem.get(&sent_txid).is_none());
    }
}

#[test]
fn test_block_limit() {
    const AMOUNT: u64 = 500000;
    let (wallet, _txid1, block_hash) = get_test_wallet(AMOUNT);       

    let prev_hash = add_blocks(&wallet, 2, 1, block_hash).unwrap();
    assert_eq!(wallet.blocks.read().unwrap().len(), 3);
    
    let prev_hash = add_blocks(&wallet, 3, 47, prev_hash).unwrap();
    assert_eq!(wallet.blocks.read().unwrap().len(), 50);
    
    let prev_hash = add_blocks(&wallet, 50, 51, prev_hash).unwrap();
    assert_eq!(wallet.blocks.read().unwrap().len(), 101);
    
    // Subsequent blocks should start to trim
    let prev_hash = add_blocks(&wallet, 101, 1, prev_hash).unwrap();
    assert_eq!(wallet.blocks.read().unwrap().len(), 101);

    // Add lots
    let _ = add_blocks(&wallet, 102, 10, prev_hash).unwrap();
    assert_eq!(wallet.blocks.read().unwrap().len(), 101);

    // Now clear the blocks
    wallet.clear_blocks();
    assert_eq!(wallet.blocks.read().unwrap().len(), 0);

    let prev_hash = add_blocks(&wallet, 0, 1, BlockHash([0;32])).unwrap();
    assert_eq!(wallet.blocks.read().unwrap().len(), 1);

    let _ = add_blocks(&wallet, 1, 10, prev_hash).unwrap();
    assert_eq!(wallet.blocks.read().unwrap().len(), 11);
}

#[test]
fn test_rollback() {
    const AMOUNT: u64 = 500000;

    let (wallet, txid1, block_hash) = get_test_wallet(AMOUNT);       

    add_blocks(&wallet, 2, 5, block_hash).unwrap();

    // Make sure the note exists with the witnesses
    {
        let txs = wallet.txs.read().unwrap();
        assert_eq!(txs[&txid1].notes[0].witnesses.len(), 7);
    }
            
    // Invalidate 2 blocks
    assert_eq!(wallet.last_scanned_height(), 6);
    assert_eq!(wallet.invalidate_block(5), 2);

    // THe witnesses should be rolledback
    {
        let txs = wallet.txs.read().unwrap();
        assert_eq!(txs[&txid1].notes[0].witnesses.len(), 5);
    }

    let blk3_hash;
    let blk4_hash;
    {
        let blks = wallet.blocks.read().unwrap();
        blk3_hash = blks[3].hash.clone();
        blk4_hash = blks[4].hash.clone();
    }

    // This should result in an exception, because the "prevhash" is wrong
    assert!(add_blocks(&wallet, 5, 2, blk3_hash).is_err(), 
        "Shouldn't be able to add because of invalid prev hash");

    // Add with the proper prev hash
    add_blocks(&wallet, 5, 2, blk4_hash).unwrap();

    let blk6_hash;
    {
        let blks = wallet.blocks.read().unwrap();
        blk6_hash = blks[6].hash.clone();
    }

    // Now do a Tx
    let taddr = wallet.address_from_sk(&SecretKey::parse_slice(&[1u8; 32]).unwrap());

    let branch_id = u32::from_str_radix("2bb40e60", 16).unwrap();
    let (ss, so) = get_sapling_params().unwrap();

    // Create a tx and send to address
    const AMOUNT_SENT: u64 = 30000;
    let fee: u64 = DEFAULT_FEE.try_into().unwrap();
    let raw_tx = wallet.send_to_address(branch_id, &ss, &so,
                            vec![(&taddr, AMOUNT_SENT, None)]).unwrap();

    let sent_tx = Transaction::read(&raw_tx[..]).unwrap();
    let sent_txid = sent_tx.txid();
    let mut cb3 = FakeCompactBlock::new(7, blk6_hash);
    cb3.add_tx(&sent_tx);
    wallet.scan_block(&cb3.as_bytes()).unwrap();
    wallet.scan_full_tx(&sent_tx, 7, 0);

    // Make sure the Tx is in.
    {
        let txs = wallet.txs.read().unwrap();
        assert_eq!(txs[&txid1].notes.len(), 1);
        assert_eq!(txs[&txid1].notes[0].note.value, AMOUNT);
        assert_eq!(txs[&txid1].notes[0].spent, Some(sent_txid));
        assert_eq!(txs[&txid1].notes[0].unconfirmed_spent, None);
        
        // The sent tx should generate change
        assert_eq!(txs[&sent_txid].notes.len(), 1);
        assert_eq!(txs[&sent_txid].notes[0].note.value, AMOUNT - AMOUNT_SENT - fee);
        assert_eq!(txs[&sent_txid].notes[0].is_change, true);
        assert_eq!(txs[&sent_txid].notes[0].spent, None);
        assert_eq!(txs[&sent_txid].notes[0].unconfirmed_spent, None);
        assert_eq!(txs[&sent_txid].notes[0].witnesses.len(), 1);
    }

    // Invalidate 3 blocks
    assert_eq!(wallet.last_scanned_height(), 7);
    assert_eq!(wallet.invalidate_block(5), 3);
    assert_eq!(wallet.last_scanned_height(), 4);
    
    // Make sure the orig Tx is there, but new Tx has disappeared
    {
        let txs = wallet.txs.read().unwrap();

        // Orig Tx is still there, since this is in block 0
        // But now the spent tx is gone
        assert_eq!(txs[&txid1].notes.len(), 1);
        assert_eq!(txs[&txid1].notes[0].note.value, AMOUNT);
        assert_eq!(txs[&txid1].notes[0].spent, None);
        assert_eq!(txs[&txid1].notes[0].unconfirmed_spent, None);

        // The sent tx is missing
        assert!(txs.get(&sent_txid).is_none());
    }
}

#[test]
fn test_t_derivation() {
    let lc = LightClientConfig {
        chain_name: "main".to_string(),
        sapling_activation_height: 0,
        consensus_branch_id: "000000".to_string(),
        anchor_offset: 1,
        data_dir: None,
    };

    let seed_phrase = Some("chimney better bulb horror rebuild whisper improve intact letter giraffe brave rib appear bulk aim burst snap salt hill sad merge tennis phrase raise".to_string());

    let wallet = LightWallet::new(seed_phrase.clone(), None, &lc, 0).unwrap();

    // Test the addresses against https://iancoleman.io/bip39/
    let (taddr, pk) = &wallet.get_t_secret_keys()[0];
    assert_eq!(taddr, "t1eQ63fwkQ4n4Eo5uCrPGaAV8FWB2tmx7ui");
    assert_eq!(pk, "Kz9ybX4giKag4NtnP1pi8WQF2B2hZDkFU85S7Dciz3UUhM59AnhE");

    // Test a couple more
    wallet.add_taddr();
    let (taddr, pk) = &wallet.get_t_secret_keys()[1];
    assert_eq!(taddr, "t1NoS6ZgaUTpmjkge2cVpXGcySasdYDrXqh");
    assert_eq!(pk, "KxdmS38pxskS6bbKX43zhTu8ppWckNmWjKsQFX1hwidvhRRgRd3c");

    let (zaddr, sk) = &wallet.get_z_private_keys()[0];
    assert_eq!(zaddr, "zs1q6xk3q783t5k92kjqt2rkuuww8pdw2euzy5rk6jytw97enx8fhpazdv3th4xe7vsk6e9sfpawfg");
    assert_eq!(sk, "secret-extended-key-main1qvpa0qr8qqqqpqxn4l054nzxpxzp3a8r2djc7sekdek5upce8mc2j2z0arzps4zv940qeg706hd0wq6g5snzvhp332y6vhwyukdn8dhekmmsk7fzvzkqm6ypc99uy63tpesqwxhpre78v06cx8k5xpp9mrhtgqs5dvp68cqx2yrvthflmm2ynl8c0506dekul0f6jkcdmh0292lpphrksyc5z3pxwws97zd5els3l2mjt2s7hntap27mlmt6w0drtfmz36vz8pgu7ec0twfrq");

    assert_eq!(seed_phrase, Some(wallet.get_seed_phrase()));
}


#[test]
#[should_panic]
fn test_invalid_bip39_t() {
    // Passing a 32-byte seed to bip32 should fail. 
    let config = get_test_config();
    LightWallet::get_taddr_from_bip39seed(&config, &[0u8; 32], 0);
}

#[test]
#[should_panic]
fn test_invalid_bip39_z() {
    // Passing a 32-byte seed to bip32 should fail. 
    let config = get_test_config();
    LightWallet::get_zaddr_from_bip39seed(&config, &[0u8; 32], 0);
}

#[test]
fn test_invalid_scan_blocks() {
    const AMOUNT: u64 = 500000;
    let (wallet, _txid1, block_hash) = get_test_wallet(AMOUNT);       

    let prev_hash = add_blocks(&wallet, 2, 1, block_hash).unwrap();
    assert_eq!(wallet.blocks.read().unwrap().len(), 3);
    
    // Block fails to scan for bad encoding
    assert_eq!(wallet.scan_block(&[0; 32]), Err(-1));

    // Block is invalid height
    let new_blk = FakeCompactBlock::new(4, prev_hash);
    assert_eq!(wallet.scan_block(&new_blk.as_bytes()), Err(2));

    // Block is right height, but invalid prev height (for reorgs)
    let new_blk = FakeCompactBlock::new(2, BlockHash([0; 32]));
    assert_eq!(wallet.scan_block(&new_blk.as_bytes()), Err(2));

    // Block is right height, but invalid prev height (for reorgs)
    let new_blk = FakeCompactBlock::new(3, BlockHash([0; 32]));
    assert_eq!(wallet.scan_block(&new_blk.as_bytes()), Err(2));

    // Then the rest add properly
    let _ = add_blocks(&wallet, 3, 2, prev_hash).unwrap();
    assert_eq!(wallet.blocks.read().unwrap().len(), 5);
}
