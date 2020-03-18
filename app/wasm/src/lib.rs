mod utils;

#[macro_use]
extern crate rust_embed;

pub mod lightclient;
pub mod grpcconnector;
pub mod lightwallet;

#[derive(RustEmbed)]
#[folder = "zcash-params/"]
pub struct SaplingParams;

pub const ANCHOR_OFFSET: u32 = 4;

pub mod proto;

#[macro_use]
extern crate lazy_static;

use wasm_bindgen::prelude::*;
use json::{object};
use std::sync::{Mutex, Arc};
use std::cell::RefCell;

use crate::lightclient::{LightClient, LightClientConfig};

// We'll use a MUTEX to store a global lightclient instance,
// so we don't have to keep creating it. We need to store it here, in rust
// because we can't return such a complex structure back to JS
lazy_static! {
    static ref LIGHTCLIENT: Mutex<RefCell<Option<Arc<LightClient>>>> = Mutex::new(RefCell::new(None));
}

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

/// Create a new wallet and return the seed for the newly created wallet.
#[wasm_bindgen]
pub async fn litelib_initialize_new(entropy: String) -> String {
  utils::set_panic_hook();

  let (config, latest_block_height) = match LightClientConfig::create().await {
      Ok((c, h)) => (c, h),
      Err(e) => {
          return format!("Error: {}", e);
      }
  };

  let lightclient = match LightClient::new(&config, entropy, latest_block_height) {
      Ok(l) => l,
      Err(e) => {
        return format!("Error: {}", e);
      }
  };

  // Initialize logging
  let _ = lightclient.init_logging();

  let seed = match lightclient.do_seed_phrase() {
      Ok(s) => s.dump(),
      Err(e) => {
        return format!("Error: {}", e);
      }
  };

  LIGHTCLIENT.lock().unwrap().replace(Some(Arc::new(lightclient)));

  // Return the wallet's seed
  return seed;
}

/// Restore a wallet from the seed phrase
#[wasm_bindgen]
pub async fn litelib_initialize_new_from_phrase(seed: String, birthday: u64) -> String {
  utils::set_panic_hook();

  let (config, _) = match LightClientConfig::create().await {
    Ok((c, h)) => (c, h),
    Err(e) => {
        return format!("Error: {}", e);
    }
  };

  let lightclient = match LightClient::new_from_phrase(seed, &config, birthday) {
    Ok(l) => l,
    Err(e) => {
      return format!("Error: {}", e);
    }
  };

  // Initialize logging
  let _ = lightclient.init_logging();

  LIGHTCLIENT.lock().unwrap().replace(Some(Arc::new(lightclient)));

  format!("OK")
}


// Initialize a new lightclient and store its value
#[wasm_bindgen]
pub async fn litelib_initialize_existing(wallet_hex: String) -> String {
  utils::set_panic_hook();

  let (config, _) = match LightClientConfig::create().await {
    Ok((c, h)) => (c, h),
    Err(e) => {
        return format!("Error: {}", e);
    }
  };

  let wallet_bytes = match hex::decode(wallet_hex) {
    Ok(bytes) => bytes,
    Err(e) =>  {
      return format!("Error: {}", e);
    }
  };

  let lightclient = match LightClient::read_from_buffer(&config, &wallet_bytes[..]) {
      Ok(l) => l,
      Err(e) => {
        return format!("Error: {}", e);
      }
  };

  // Initialize logging
  let _ = lightclient.init_logging();

  LIGHTCLIENT.lock().unwrap().replace(Some(Arc::new(lightclient)));

  format!("OK")
}

#[wasm_bindgen]
pub async fn litelib_execute(cmd: String, args_list: String) -> String {
  let resp: String;
  {
      let lightclient: Arc<LightClient>;
      {
          let lc = LIGHTCLIENT.lock().unwrap();

          if lc.borrow().is_none() {
              return format!("Error: Light Client is not initialized");
          }

          lightclient = lc.borrow().as_ref().unwrap().clone();
      };

      if cmd == "sync" {
        let r = lightclient.do_sync(true).await;
        resp = match r {
            Ok(j) => j.pretty(2).clone(),
            Err(e) => format!("sync Error {}", e)
        };
      } else if cmd == "rescan" {
        resp = match lightclient.do_rescan().await {
            Ok(j) => j.pretty(2),
            Err(e) => e
        };
      } else if cmd == "send" {
        let json_args = match json::parse(&args_list) {
            Ok(j)  => j,
            Err(e) => {
                let es = format!("Couldn't understand JSON: {}", e);
                return format!("{}", es);
            }
        };

        if !json_args.is_array() {
            return format!("Couldn't parse argument as array");
        }

        let maybe_send_args = json_args.members().map( |j| {
            if !j.has_key("address") || !j.has_key("amount") {
                Err(format!("Need 'address' and 'amount'\n"))
            } else {
                Ok((j["address"].as_str().unwrap().to_string().clone(), j["amount"].as_u64().unwrap(), j["memo"].as_str().map(|s| s.to_string().clone())))
            }
        }).collect::<Result<Vec<(String, u64, Option<String>)>, String>>();

        let send_args = match maybe_send_args {
            Ok(a) => a.clone(),
            Err(s) => { return format!("Error: {}", s); }
        };

        // Do a sync
        let r = lightclient.do_sync(true).await;
        resp = match r {
            Ok(_) => {
                // Convert to the right format. String -> &str.
                let tos = send_args.iter().map(|(a, v, m)| (a.as_str(), *v, m.clone()) ).collect::<Vec<_>>();
                match lightclient.do_send(tos).await {
                    Ok(txid) => { object!{ "txid" => txid } },
                    Err(e)   => { object!{ "error" => e } }
                }.pretty(2)
            },
            Err(e) => format!("sync Error {}", e)
        };
      } else if cmd == "save" {
        let wallet_bytes = lightclient.do_save_to_buffer().unwrap();
        resp = hex::encode(&wallet_bytes);
      } else if cmd == "info" {
        resp = lightclient.do_info().await;
      } else if cmd == "balance" {
        resp = format!("{}", lightclient.do_balance().pretty(2));
      } else if cmd == "notes" {
        resp = format!("{}", lightclient.do_list_notes(false).pretty(2));
      } else if cmd == "export" {
        resp = match lightclient.do_export(Some(args_list)) {
            Ok(j)  => j,
            Err(e) => object!{ "error" => e }
        }.pretty(2);
      } else if cmd == "new" {
        resp = match lightclient.do_new_address(&args_list) {
            Ok(j)  => j,
            Err(e) => object!{ "error" => e }
        }.pretty(2);
      } else if cmd == "seed" {
        resp = match lightclient.do_seed_phrase() {
            Ok(j)  => j,
            Err(e) => object!{ "error" => e }
        }.pretty(2);
      } else if cmd == "list" {
        resp = lightclient.do_list_transactions().pretty(2);
      } else if cmd == "syncstatus" {
        let status = lightclient.do_scan_status();
        resp = match status.is_syncing {
            false => object!{ "syncing" => "false" },
            true  => object!{ "syncing" => "true",
                              "synced_blocks" => status.synced_blocks,
                              "total_blocks" => status.total_blocks }
        }.pretty(2);
      } else {
        panic!("Unknown command {}", cmd);
      }
  };

  return resp;
}
