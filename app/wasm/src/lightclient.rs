use crate::lightwallet::LightWallet;

use std::sync::{Arc, RwLock, Mutex};
use std::sync::atomic::{AtomicU64, AtomicI32, AtomicUsize, Ordering};
use std::collections::HashMap;
use std::io;
use std::io::{ErrorKind};
use std::io::prelude::*;

use protobuf::parse_from_bytes;

use json::{object, array, JsonValue};
use zcash_primitives::transaction::{TxId, Transaction};
use zcash_client_backend::{
    constants::testnet, constants::mainnet, constants::regtest, encoding::encode_payment_address,
};

use log::{info, warn, error};

use crate::proto::service::{BlockID};
use crate::grpcconnector::{self, *};
use crate::SaplingParams;
use crate::ANCHOR_OFFSET;

mod checkpoints;

const SYNCSIZE: u64 = 400;

#[derive(Clone, Debug)]
pub struct WalletStatus {
    pub is_syncing: bool,
    pub total_blocks: u64,
    pub synced_blocks: u64,
}

impl WalletStatus {
    pub fn new() -> Self {
        WalletStatus {
            is_syncing: false,
            total_blocks: 0,
            synced_blocks: 0
        }
    }
}

#[derive(Clone, Debug)]
pub struct LightClientConfig {
    pub chain_name                  : String,
    pub sapling_activation_height   : u64,
    pub consensus_branch_id         : String,
    pub anchor_offset               : u32,
    pub data_dir                    : Option<String>
}

impl LightClientConfig {

    // Create an unconnected (to any server) config to test for local wallet etc...
    pub fn create_unconnected(chain_name: String, dir: Option<String>) -> LightClientConfig {
        LightClientConfig {
            chain_name                  : chain_name,
            sapling_activation_height   : 0,
            consensus_branch_id         : "".to_string(),
            anchor_offset               : ANCHOR_OFFSET,
            data_dir                    : dir,
        }
    }

    pub async fn create() -> io::Result<(LightClientConfig, u64)> {
        // Do a getinfo first, before opening the wallet
        let info = grpcconnector::get_info().await
            .map_err(|e| std::io::Error::new(ErrorKind::ConnectionRefused, e))?;

        // Create a Light Client Config
        let config = LightClientConfig {
            chain_name                  : info.chainName,
            sapling_activation_height   : info.saplingActivationHeight,
            consensus_branch_id         : info.consensusBranchId,
            anchor_offset               : ANCHOR_OFFSET,
            data_dir                    : None,
        };

        Ok((config, info.blockHeight))
    }


    pub fn get_initial_state(&self, height: u64) -> Option<(u64, &str, &str)> {
        checkpoints::get_closest_checkpoint(&self.chain_name, height)
    }

    pub fn get_coin_type(&self) -> u32 {
        match &self.chain_name[..] {
            "main"    => mainnet::COIN_TYPE,
            "test"    => testnet::COIN_TYPE,
            "regtest" => regtest::COIN_TYPE,
            c         => panic!("Unknown chain {}", c)
        }
    }

    pub fn hrp_sapling_address(&self) -> &str {
        match &self.chain_name[..] {
            "main"    => mainnet::HRP_SAPLING_PAYMENT_ADDRESS,
            "test"    => testnet::HRP_SAPLING_PAYMENT_ADDRESS,
            "regtest" => regtest::HRP_SAPLING_PAYMENT_ADDRESS,
            c         => panic!("Unknown chain {}", c)
        }
    }

    pub fn hrp_sapling_private_key(&self) -> &str {
        match &self.chain_name[..] {
            "main"    => mainnet::HRP_SAPLING_EXTENDED_SPENDING_KEY,
            "test"    => testnet::HRP_SAPLING_EXTENDED_SPENDING_KEY,
            "regtest" => regtest::HRP_SAPLING_EXTENDED_SPENDING_KEY,
            c         => panic!("Unknown chain {}", c)
        }
    }

    pub fn base58_pubkey_address(&self) -> [u8; 2] {
        match &self.chain_name[..] {
            "main"    => mainnet::B58_PUBKEY_ADDRESS_PREFIX,
            "test"    => testnet::B58_PUBKEY_ADDRESS_PREFIX,
            "regtest" => regtest::B58_PUBKEY_ADDRESS_PREFIX,
            c         => panic!("Unknown chain {}", c)
        }
    }


    pub fn base58_script_address(&self) -> [u8; 2] {
        match &self.chain_name[..] {
            "main"    => mainnet::B58_SCRIPT_ADDRESS_PREFIX,
            "test"    => testnet::B58_SCRIPT_ADDRESS_PREFIX,
            "regtest" => regtest::B58_SCRIPT_ADDRESS_PREFIX,
            c         => panic!("Unknown chain {}", c)
        }
    }

    pub fn base58_secretkey_prefix(&self) -> [u8; 1] {
        match &self.chain_name[..] {
            "main"    => [0x80],
            "test"    => [0xEF],
            "regtest" => [0xEF],
            c         => panic!("Unknown chain {}", c)
        }
    }
}

pub struct LightClient {
    pub wallet          : Arc<RwLock<LightWallet>>,

    pub config          : LightClientConfig,

    // zcash-params
    pub sapling_output  : Vec<u8>,
    pub sapling_spend   : Vec<u8>,

    sync_lock           : Mutex<()>,
    sync_status         : Arc<RwLock<WalletStatus>>, // The current syncing status of the Wallet.
}

impl LightClient {

    pub fn set_wallet_initial_state(&self, height: u64) {
        use std::convert::TryInto;

        let state = self.config.get_initial_state(height);

        match state {
            Some((height, hash, tree)) => self.wallet.read().unwrap().set_initial_block(height.try_into().unwrap(), hash, tree),
            _ => true,
        };
    }

    fn read_sapling_params(&mut self) {
        // Read Sapling Params
        self.sapling_output.extend_from_slice(SaplingParams::get("sapling-output.params").unwrap().as_ref());
        self.sapling_spend.extend_from_slice(SaplingParams::get("sapling-spend.params").unwrap().as_ref());

    }

    /// Method to create a test-only version of the LightClient
    #[allow(dead_code)]
    pub fn unconnected(seed_phrase: String, dir: Option<String>) -> io::Result<Self> {
        let config = LightClientConfig::create_unconnected("test".to_string(), dir);
        let mut l = LightClient {
                wallet          : Arc::new(RwLock::new(LightWallet::new(Some(seed_phrase), None, &config, 0)?)),
                config          : config.clone(),
                sapling_output  : vec![],
                sapling_spend   : vec![],
                sync_lock       : Mutex::new(()),
                sync_status     : Arc::new(RwLock::new(WalletStatus::new())),
            };

        l.set_wallet_initial_state(0);
        l.read_sapling_params();

        info!("Created new wallet!");

        Ok(l)
    }

    /// Create a brand new wallet with a new seed phrase. Will fail if a wallet file
    /// already exists on disk
    pub fn new(config: &LightClientConfig, entropy: String, latest_block: u64) -> io::Result<Self> {
        let mut l = LightClient {
                wallet          : Arc::new(RwLock::new(LightWallet::new(None, Some(entropy), config, latest_block)?)),
                config          : config.clone(),
                sapling_output  : vec![],
                sapling_spend   : vec![],
                sync_lock       : Mutex::new(()),
                sync_status     : Arc::new(RwLock::new(WalletStatus::new())),
            };

        l.set_wallet_initial_state(latest_block);
        l.read_sapling_params();

        info!("Created new wallet with a new seed!");

        Ok(l)
    }

    pub fn new_from_phrase(seed_phrase: String, config: &LightClientConfig, birthday: u64) -> io::Result<Self> {
        let mut l = LightClient {
                wallet          : Arc::new(RwLock::new(LightWallet::new(Some(seed_phrase), None, config, birthday)?)),
                config          : config.clone(),
                sapling_output  : vec![],
                sapling_spend   : vec![],
                sync_lock       : Mutex::new(()),
                sync_status     : Arc::new(RwLock::new(WalletStatus::new())),
            };

        println!("Setting birthday to {}", birthday);
        l.set_wallet_initial_state(birthday);
        l.read_sapling_params();

        info!("Created new wallet!");

        Ok(l)
    }

    pub fn read_from_buffer<R: Read>(config: &LightClientConfig, mut reader: R) -> io::Result<Self>{
        let wallet = LightWallet::read(&mut reader, config)?;
        let mut lc = LightClient {
            wallet          : Arc::new(RwLock::new(wallet)),
            config          : config.clone(),
            sapling_output  : vec![],
            sapling_spend   : vec![],
            sync_lock       : Mutex::new(()),
            sync_status     : Arc::new(RwLock::new(WalletStatus::new())),
        };

        lc.read_sapling_params();

        info!("Read wallet with birthday {}", lc.wallet.read().unwrap().get_first_tx_block());

        Ok(lc)
    }

    pub fn init_logging(&self) -> io::Result<()> {
        Ok(())
    }

    pub fn last_scanned_height(&self) -> u64 {
        self.wallet.read().unwrap().last_scanned_height() as u64
    }

    // Export private keys
    pub fn do_export(&self, addr: Option<String>) -> Result<JsonValue, &str> {
        // Clone address so it can be moved into the closure
        let address = addr.clone();
        let wallet = self.wallet.read().unwrap();
        // Go over all z addresses
        let z_keys = wallet.get_z_private_keys().iter()
            .filter( move |(addr, _)| address.is_none() || address.as_ref() == Some(addr))
            .map( |(addr, pk)|
                object!{
                    "address"     => addr.clone(),
                    "private_key" => pk.clone()
                }
            ).collect::<Vec<JsonValue>>();

        // Clone address so it can be moved into the closure
        let address = addr.clone();

        // Go over all t addresses
        let t_keys = wallet.get_t_secret_keys().iter()
            .filter( move |(addr, _)| address.is_none() || address.as_ref() == Some(addr))
            .map( |(addr, sk)|
                object!{
                    "address"     => addr.clone(),
                    "private_key" => sk.clone(),
                }
            ).collect::<Vec<JsonValue>>();

        let mut all_keys = vec![];
        all_keys.extend_from_slice(&z_keys);
        all_keys.extend_from_slice(&t_keys);

        Ok(all_keys.into())
    }

    pub fn do_address(&self) -> JsonValue {
        let wallet = self.wallet.read().unwrap();

        // Collect z addresses
        let z_addresses = wallet.zaddress.read().unwrap().iter().map( |ad| {
            encode_payment_address(self.config.hrp_sapling_address(), &ad)
        }).collect::<Vec<String>>();

        // Collect t addresses
        let t_addresses = wallet.taddresses.read().unwrap().iter().map( |a| a.clone() )
                            .collect::<Vec<String>>();

        object!{
            "z_addresses" => z_addresses,
            "t_addresses" => t_addresses,
        }
    }

    pub fn do_balance(&self) -> JsonValue {
        let wallet = self.wallet.read().unwrap();

        // Collect z addresses
        let z_addresses = wallet.zaddress.read().unwrap().iter().map( |ad| {
            let address = encode_payment_address(self.config.hrp_sapling_address(), &ad);
            object!{
                "address" => address.clone(),
                "zbalance" => wallet.zbalance(Some(address.clone())),
                "verified_zbalance" => wallet.verified_zbalance(Some(address)),
            }
        }).collect::<Vec<JsonValue>>();

        // Collect t addresses
        let t_addresses = wallet.taddresses.read().unwrap().iter().map( |address| {
            // Get the balance for this address
            let balance = wallet.tbalance(Some(address.clone()));

            object!{
                "address" => address.clone(),
                "balance" => balance,
            }
        }).collect::<Vec<JsonValue>>();

        object!{
            "zbalance"           => wallet.zbalance(None),
            "verified_zbalance"  => wallet.verified_zbalance(None),
            "tbalance"           => wallet.tbalance(None),
            "z_addresses"        => z_addresses,
            "t_addresses"        => t_addresses,
        }
    }


    pub fn do_save_to_buffer(&self) -> Result<Vec<u8>, String> {
       let mut buffer: Vec<u8> = vec![];
       match self.wallet.write().unwrap().write(&mut buffer) {
           Ok(_) => Ok(buffer),
           Err(e) => {
               let err = format!("ERR: {}", e);
               error!("{}", err);
               Err(e.to_string())
           }
       }
   }

    pub async fn do_info(&self) -> String {
      match grpcconnector::get_info().await {
        Ok(i) => {
          let o = object!{
            "version" => i.version,
            "vendor" => i.vendor,
            "taddr_support" => i.taddrSupport,
            "chain_name" => i.chainName,
            "sapling_activation_height" => i.saplingActivationHeight,
            "consensus_branch_id" => i.consensusBranchId,
            "latest_block_height" => i.blockHeight
          };
          o.pretty(2)
        },
        Err(e) => e
      }
    }

    pub fn do_seed_phrase(&self) -> Result<JsonValue, &str> {
        let wallet = self.wallet.read().unwrap();
        Ok(object!{
            "seed"     => wallet.get_seed_phrase(),
            "birthday" => wallet.get_birthday()
        })
    }

    // Return a list of all notes, spent and unspent
    pub fn do_list_notes(&self, all_notes: bool) -> JsonValue {
        let mut unspent_notes: Vec<JsonValue> = vec![];
        let mut spent_notes  : Vec<JsonValue> = vec![];
        let mut pending_notes: Vec<JsonValue> = vec![];

        {
            // Collect Sapling notes
            let wallet = self.wallet.read().unwrap();
            wallet.txs.read().unwrap().iter()
                .flat_map( |(txid, wtx)| {
                    wtx.notes.iter().filter_map(move |nd|
                        if !all_notes && nd.spent.is_some() {
                            None
                        } else {
                            Some(object!{
                                "created_in_block"   => wtx.block,
                                "datetime"           => wtx.datetime,
                                "created_in_txid"    => format!("{}", txid),
                                "value"              => nd.note.value,
                                "is_change"          => nd.is_change,
                                "address"            => LightWallet::note_address(self.config.hrp_sapling_address(), nd),
                                "spent"              => nd.spent.map(|spent_txid| format!("{}", spent_txid)),
                                "unconfirmed_spent"  => nd.unconfirmed_spent.map(|spent_txid| format!("{}", spent_txid)),
                            })
                        }
                    )
                })
                .for_each( |note| {
                    if note["spent"].is_null() && note["unconfirmed_spent"].is_null() {
                        unspent_notes.push(note);
                    } else if !note["spent"].is_null() {
                        spent_notes.push(note);
                    } else {
                        pending_notes.push(note);
                    }
                });
        }

        let mut unspent_utxos: Vec<JsonValue> = vec![];
        let mut spent_utxos  : Vec<JsonValue> = vec![];
        let mut pending_utxos: Vec<JsonValue> = vec![];

        {
            let wallet = self.wallet.read().unwrap();
            wallet.txs.read().unwrap().iter()
                .flat_map( |(txid, wtx)| {
                    wtx.utxos.iter().filter_map(move |utxo|
                        if !all_notes && utxo.spent.is_some() {
                            None
                        } else {
                            Some(object!{
                                "created_in_block"   => wtx.block,
                                "datetime"           => wtx.datetime,
                                "created_in_txid"    => format!("{}", txid),
                                "value"              => utxo.value,
                                "scriptkey"          => hex::encode(utxo.script.clone()),
                                "is_change"          => false, // TODO: Identify notes as change if we send change to taddrs
                                "address"            => utxo.address.clone(),
                                "spent"              => utxo.spent.map(|spent_txid| format!("{}", spent_txid)),
                                "unconfirmed_spent"  => utxo.unconfirmed_spent.map(|spent_txid| format!("{}", spent_txid)),
                            })
                        }
                    )
                })
                .for_each( |utxo| {
                    if utxo["spent"].is_null() && utxo["unconfirmed_spent"].is_null() {
                        unspent_utxos.push(utxo);
                    } else if !utxo["spent"].is_null() {
                        spent_utxos.push(utxo);
                    } else {
                        pending_utxos.push(utxo);
                    }
                });
        }

        let mut res = object!{
            "unspent_notes" => unspent_notes,
            "pending_notes" => pending_notes,
            "utxos"         => unspent_utxos,
            "pending_utxos" => pending_utxos,
        };

        if all_notes {
            res["spent_notes"] = JsonValue::Array(spent_notes);
            res["spent_utxos"] = JsonValue::Array(spent_utxos);
        }

        res
    }

    pub fn do_list_transactions(&self) -> JsonValue {
        let wallet = self.wallet.read().unwrap();

        // Create a list of TransactionItems from wallet txns
        let mut tx_list = wallet.txs.read().unwrap().iter()
            .flat_map(| (_k, v) | {
                let mut txns: Vec<JsonValue> = vec![];

                if v.total_shielded_value_spent + v.total_transparent_value_spent > 0 {
                    // If money was spent, create a transaction. For this, we'll subtract
                    // all the change notes. TODO: Add transparent change here to subtract it also
                    let total_change: u64 = v.notes.iter()
                        .filter( |nd| nd.is_change )
                        .map( |nd| nd.note.value )
                        .sum();

                    // TODO: What happens if change is > than sent ?

                    // Collect outgoing metadata
                    let outgoing_json = v.outgoing_metadata.iter()
                        .map(|om|
                            object!{
                                "address" => om.address.clone(),
                                "value"   => om.value,
                                "memo"    => LightWallet::memo_str(&Some(om.memo.clone())),
                        })
                        .collect::<Vec<JsonValue>>();

                    txns.push(object! {
                        "block_height" => v.block,
                        "datetime"     => v.datetime,
                        "txid"         => format!("{}", v.txid),
                        "amount"       => total_change as i64
                                            - v.total_shielded_value_spent as i64
                                            - v.total_transparent_value_spent as i64,
                        "outgoing_metadata" => outgoing_json,
                    });
                }

                // For each sapling note that is not a change, add a Tx.
                txns.extend(v.notes.iter()
                    .filter( |nd| !nd.is_change )
                    .map ( |nd|
                        object! {
                            "block_height" => v.block,
                            "datetime"     => v.datetime,
                            "txid"         => format!("{}", v.txid),
                            "amount"       => nd.note.value as i64,
                            "address"      => LightWallet::note_address(self.config.hrp_sapling_address(), nd),
                            "memo"         => LightWallet::memo_str(&nd.memo),
                    })
                );

                // Get the total transparent received
                let total_transparent_received = v.utxos.iter().map(|u| u.value).sum::<u64>();
                if total_transparent_received > v.total_transparent_value_spent {
                    // Create an input transaction for the transparent value as well.
                    txns.push(object!{
                        "block_height" => v.block,
                        "datetime"     => v.datetime,
                        "txid"         => format!("{}", v.txid),
                        "amount"       => total_transparent_received as i64 - v.total_transparent_value_spent as i64,
                        "address"      => v.utxos.iter().map(|u| u.address.clone()).collect::<Vec<String>>().join(","),
                        "memo"         => None::<String>
                    })
                }

                txns
            })
            .collect::<Vec<JsonValue>>();

        // Add in all mempool txns
        tx_list.extend(wallet.mempool_txs.read().unwrap().iter().map( |(_, wtx)| {
            use zcash_primitives::transaction::components::amount::DEFAULT_FEE;
            use std::convert::TryInto;

            let amount: u64 = wtx.outgoing_metadata.iter().map(|om| om.value).sum::<u64>();
            let fee: u64 = DEFAULT_FEE.try_into().unwrap();

            // Collect outgoing metadata
            let outgoing_json = wtx.outgoing_metadata.iter()
                .map(|om|
                    object!{
                        "address" => om.address.clone(),
                        "value"   => om.value,
                        "memo"    => LightWallet::memo_str(&Some(om.memo.clone())),
                }).collect::<Vec<JsonValue>>();

            object! {
                "block_height" => wtx.block,
                "datetime"     => wtx.datetime,
                "txid"         => format!("{}", wtx.txid),
                "amount"       => -1 * (fee + amount) as i64,
                "unconfirmed"  => true,
                "outgoing_metadata" => outgoing_json,
            }
        }));

        tx_list.sort_by( |a, b| if a["block_height"] == b["block_height"] {
                                    a["txid"].as_str().cmp(&b["txid"].as_str())
                                } else {
                                    a["block_height"].as_i32().cmp(&b["block_height"].as_i32())
                                }
        );

        JsonValue::Array(tx_list)
    }

    /// Create a new address, deriving it from the seed.
    pub fn do_new_address(&self, addr_type: &str) -> Result<JsonValue, String> {
        let new_address = {
            let wallet = self.wallet.write().unwrap();

            match addr_type {
                "z" => wallet.add_zaddr(),
                "t" => wallet.add_taddr(),
                _   => {
                    let e = format!("Unrecognized address type: {}", addr_type);
                    error!("{}", e);
                    return Err(e);
                }
            }
        };

        Ok(array![new_address])
    }

    pub fn clear_state(&self) {
        // First, clear the state from the wallet
        self.wallet.read().unwrap().clear_blocks();

        // Then set the initial block
        self.set_wallet_initial_state(self.wallet.read().unwrap().get_birthday());
        info!("Cleared wallet state");
    }

    pub async fn do_rescan(&self) -> Result<JsonValue, String> {
        info!("Rescan starting");

        self.clear_state();

        // Then, do a sync, which will force a full rescan from the initial state
        let response = self.do_sync(true).await;

        info!("Rescan finished");

        response
    }

    /// Return the syncing status of the wallet
    pub fn do_scan_status(&self) -> WalletStatus {
        self.sync_status.read().unwrap().clone()
    }

    pub async fn do_sync(&self, print_updates: bool) -> Result<JsonValue, String> {
        // We don't have to bother with locking in wasm, because everything is single threaded anyway. 

        // Sync is 3 parts
        // 1. Get the latest block
        // 2. Get all the blocks that we don't have
        // 3. Find all new Txns that don't have the full Tx, and get them as full transactions
        //    and scan them, mainly to get the memos
        let mut last_scanned_height = self.wallet.read().unwrap().last_scanned_height() as u64;

       // This will hold the latest block fetched from the RPC
       let latest_block_height = Arc::new(AtomicU64::new(0));
       let lbh = latest_block_height.clone();
       fetch_latest_block(
           move |block: BlockID| {
               lbh.store(block.height, Ordering::SeqCst);
           }).await;
       let latest_block = latest_block_height.load(Ordering::SeqCst);

        if latest_block < last_scanned_height {
            let w = format!("Server's latest block({}) is behind ours({})", latest_block, last_scanned_height);
            warn!("{}", w);
            return Err(w);
        }

        info!("Latest block is {}", latest_block);

        // Get the end height to scan to.
        let mut end_height = std::cmp::min(last_scanned_height + SYNCSIZE, latest_block);

        // If there's nothing to scan, just return
        if last_scanned_height == latest_block {
            info!("Nothing to sync, returning");
            return Ok(object!{ "result" => "success" })
        }

        {
            let mut status = self.sync_status.write().unwrap();
            status.is_syncing = true;
            status.synced_blocks = last_scanned_height;
            status.total_blocks = latest_block;
        }

        // Count how many bytes we've downloaded
        let bytes_downloaded = Arc::new(AtomicUsize::new(0));

        let mut total_reorg = 0;

        // Collect all txns in blocks that we have a tx in. We'll fetch all these
        // txs along with our own, so that the server doesn't learn which ones
        // belong to us.
        let all_new_txs = Arc::new(RwLock::new(vec![]));

        // Fetch CompactBlocks in increments
        loop {
            // Collect all block times, because we'll need to update transparent tx
            // datetime via the block height timestamp
            let block_times = Arc::new(RwLock::new(HashMap::new()));

            let local_light_wallet = self.wallet.clone();
            let local_bytes_downloaded = bytes_downloaded.clone();

            let start_height = last_scanned_height + 1;
            info!("Start height is {}", start_height);

            // Show updates only if we're syncing a lot of blocks
            if print_updates && (latest_block - start_height) > 100 {
                print!("Syncing {}/{}\r", start_height, latest_block);
                io::stdout().flush().ok().expect("Could not flush stdout");
            }

            {
                let mut status = self.sync_status.write().unwrap();
                status.is_syncing = true;
                status.synced_blocks = start_height;
                status.total_blocks = latest_block;
            }

            // Fetch compact blocks
            info!("Fetching blocks {}-{}", start_height, end_height);

            let all_txs = all_new_txs.clone();
            let block_times_inner = block_times.clone();

            let last_invalid_height = Arc::new(AtomicI32::new(0));
            let last_invalid_height_inner = last_invalid_height.clone();
            fetch_blocks(start_height, end_height,
                move |encoded_block: &[u8], height: u64| {
                    // Process the block only if there were no previous errors
                    if last_invalid_height_inner.load(Ordering::SeqCst) > 0 {
                        return;
                    }

                    // Parse the block and save it's time. We'll use this timestamp for
                    // transactions in this block that might belong to us.
                    let block: Result<zcash_client_backend::proto::compact_formats::CompactBlock, _>
                                        = parse_from_bytes(encoded_block);
                    match block {
                        Ok(b) => {
                            block_times_inner.write().unwrap().insert(b.height, b.time);
                        },
                        Err(_) => {}
                    }

                    match local_light_wallet.read().unwrap().scan_block(encoded_block) {
                        Ok(block_txns) => {
                            // Add to global tx list
                            all_txs.write().unwrap().extend_from_slice(&block_txns.iter().map(|txid| (txid.clone(), height as i32)).collect::<Vec<_>>()[..]);
                        },
                        Err(invalid_height) => {
                            // Block at this height seems to be invalid, so invalidate up till that point
                            last_invalid_height_inner.store(invalid_height, Ordering::SeqCst);
                        }
                    };

                    local_bytes_downloaded.fetch_add(encoded_block.len(), Ordering::SeqCst);
            }).await;

            // Check if there was any invalid block, which means we might have to do a reorg
            let invalid_height = last_invalid_height.load(Ordering::SeqCst);
            if invalid_height > 0 {
                total_reorg += self.wallet.read().unwrap().invalidate_block(invalid_height);

                warn!("Invalidated block at height {}. Total reorg is now {}", invalid_height, total_reorg);
            }

            // Make sure we're not re-orging too much!
            if total_reorg > (crate::lightwallet::MAX_REORG - 1) as u64 {
                error!("Reorg has now exceeded {} blocks!", crate::lightwallet::MAX_REORG);
                return Err(format!("Reorg has exceeded {} blocks. Aborting.", crate::lightwallet::MAX_REORG));
            }

            if invalid_height > 0 {
                // Reset the scanning heights
                last_scanned_height = (invalid_height - 1) as u64;
                end_height = std::cmp::min(last_scanned_height + SYNCSIZE, latest_block);

                warn!("Reorg: reset scanning from {} to {}", last_scanned_height, end_height);

                continue;
            }

            // If it got here, that means the blocks are scanning properly now.
            // So, reset the total_reorg
            total_reorg = 0;

            // We'll also fetch all the txids that our transparent addresses are involved with
            {
                // Copy over addresses so as to not lock up the wallet, which we'll use inside the callback below.
                let addresses = self.wallet.read().unwrap()
                                    .taddresses.read().unwrap().iter().map(|a| a.clone())
                                    .collect::<Vec<String>>();
                for address in addresses {
                    let wallet = self.wallet.clone();
                    let block_times_inner = block_times.clone();

                    fetch_transparent_txids(address, start_height, end_height,
                        move |tx_bytes: &[u8], height: u64| {
                            let tx = Transaction::read(tx_bytes).unwrap();

                            // Scan this Tx for transparent inputs and outputs
                            let datetime = block_times_inner.read().unwrap().get(&height).map(|v| *v).unwrap_or(0);
                            wallet.read().unwrap().scan_full_tx(&tx, height as i32, datetime as u64);
                        }
                    ).await;
                }
            }

            // Do block height accounting
            last_scanned_height = end_height;
            end_height = last_scanned_height + SYNCSIZE;

            if last_scanned_height >= latest_block {
                break;
            } else if end_height > latest_block {
                end_height = latest_block;
            }
        }

        if print_updates{
            println!(""); // New line to finish up the updates
        }

        info!("Synced to {}, Downloaded {} kB", latest_block, bytes_downloaded.load(Ordering::SeqCst) / 1024);
        {
            let mut status = self.sync_status.write().unwrap();
            status.is_syncing = false;
            status.synced_blocks = latest_block;
            status.total_blocks = latest_block;
        }

        // Get the Raw transaction for all the wallet transactions

        // We need to first copy over the Txids from the wallet struct, because
        // we need to free the read lock from here (Because we'll self.wallet.txs later)
        let mut txids_to_fetch: Vec<(TxId, i32)> = self.wallet.read().unwrap().txs.read().unwrap().values()
                                                        .filter(|wtx| wtx.full_tx_scanned == false)
                                                        .map(|wtx| (wtx.txid.clone(), wtx.block))
                                                        .collect::<Vec<(TxId, i32)>>();

        info!("Fetching {} new txids, total {} with decoy", txids_to_fetch.len(), all_new_txs.read().unwrap().len());
        txids_to_fetch.extend_from_slice(&all_new_txs.read().unwrap()[..]);
        txids_to_fetch.sort();
        txids_to_fetch.dedup();

        // And go and fetch the txids, getting the full transaction, so we can
        // read the memos
        for (txid, height) in txids_to_fetch {
            let light_wallet_clone = self.wallet.clone();
            info!("Fetching full Tx: {}", txid);

            fetch_full_tx(txid, move |tx_bytes: &[u8] | {
                let tx = Transaction::read(tx_bytes).unwrap();

                light_wallet_clone.read().unwrap().scan_full_tx(&tx, height, 0);
            }).await;
        };

        Ok(object!{
            "result" => "success",
            "latest_block" => latest_block,
            "downloaded_bytes" => bytes_downloaded.load(Ordering::SeqCst)
        })
    }

    pub async fn do_send(&self, addrs: Vec<(&str, u64, Option<String>)>) -> Result<String, String> {
        info!("Creating transaction");

        let rawtx = self.wallet.write().unwrap().send_to_address(
            u32::from_str_radix(&self.config.consensus_branch_id, 16).unwrap(),
            &self.sapling_spend, &self.sapling_output,
            addrs
        );

        match rawtx {
            Ok(txbytes)   => broadcast_raw_tx(txbytes).await,
            Err(e)        => Err(format!("Error: No Tx to broadcast. Error was: {}", e))
        }
    }
}

#[cfg(test)]
pub mod tests {
    use lazy_static::lazy_static;
    use tempdir::TempDir;
    use super::{LightClient, LightClientConfig};
    use rand::{rngs::OsRng, Rng};

    lazy_static!{
        static ref TEST_SEED: String = "youth strong sweet gorilla hammer unhappy congress stamp left stereo riot salute road tag clean toilet artefact fork certain leopard entire civil degree wonder".to_string();
    }

    #[test]
    pub fn test_addresses() {
        let lc = super::LightClient::unconnected(TEST_SEED.to_string(), None).unwrap();

        // Add new z and t addresses

        let taddr1 = lc.do_new_address("t").unwrap()[0].as_str().unwrap().to_string();
        let taddr2 = lc.do_new_address("t").unwrap()[0].as_str().unwrap().to_string();
        let zaddr1 = lc.do_new_address("z").unwrap()[0].as_str().unwrap().to_string();
        let zaddr2 = lc.do_new_address("z").unwrap()[0].as_str().unwrap().to_string();

        let addresses = lc.do_address();
        assert_eq!(addresses["z_addresses"].len(), 3);
        assert_eq!(addresses["z_addresses"][1], zaddr1);
        assert_eq!(addresses["z_addresses"][2], zaddr2);

        assert_eq!(addresses["t_addresses"].len(), 3);
        assert_eq!(addresses["t_addresses"][1], taddr1);
        assert_eq!(addresses["t_addresses"][2], taddr2);
    }


    fn get_entropy_string() -> String {
        let mut seed_bytes = [0u8; 32];
        // Create a random seed.
        let mut system_rng = OsRng;
        system_rng.fill(&mut seed_bytes);

        hex::encode(seed_bytes)
    }


    #[test]
    pub fn test_wallet_creation() {
        // Create a new tmp director
        {
            let tmp = TempDir::new("lctest").unwrap();
            let dir_name = tmp.path().to_str().map(|s| s.to_string());

            // A lightclient to a new, empty directory works.
            let config = LightClientConfig::create_unconnected("test".to_string(), dir_name);
            let lc = LightClient::new(&config, get_entropy_string(), 0).unwrap();
            let _seed = lc.do_seed_phrase().unwrap()["seed"].as_str().unwrap().to_string();
        }
    }
}
