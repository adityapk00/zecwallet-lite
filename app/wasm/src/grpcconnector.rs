use wasm_bindgen::prelude::*;
use protobuf::parse_from_bytes;

use zcash_primitives::transaction::{TxId};
use crate::proto::compact_formats::{CompactBlock};
use crate::proto::service::{BlockID, RawTransaction, LightdInfo, SendResponse};


#[wasm_bindgen(module = "/wasmbridge.js")]
extern "C" {
  fn getInfo() -> js_sys::Promise;

  fn getFullTx(txhash: String) -> js_sys::Promise;

  fn getLatestBlock() -> js_sys::Promise;

  fn getBlockRange(start: u64, end: u64) -> js_sys::Promise;

  fn getTransparentTxids(address: String, start: u64, end: u64) -> js_sys::Promise;

  fn sendTransaction(txhex: String) -> js_sys::Promise;

  fn doLog(s: &str);
}

// ==============
// GRPC code
// ==============
pub async fn get_info() -> Result<LightdInfo, String> {
  let promise: js_sys::Promise = getInfo();

  let lightdinfo = wasm_bindgen_futures::JsFuture::from(promise).await;

  match lightdinfo {
    Ok(js) => {
      let bin = hex::decode(js.as_string().unwrap()).unwrap();
      let lightd: LightdInfo = parse_from_bytes(&bin).unwrap();
      Ok(lightd)
    },
    Err(e) => {
      Err(e.as_string().unwrap_or("Empty Error".to_string()))
    }
  }
}


pub async fn fetch_blocks<F : 'static + std::marker::Send>(start_height: u64, end_height: u64, mut c: F)
    where F : FnMut(&[u8], u64) {
  let promise: js_sys::Promise = getBlockRange(start_height, end_height);

  match wasm_bindgen_futures::JsFuture::from(promise).await {
    Ok(js) => {
      for block in js.as_string().unwrap().split("\n") {
        let bin = hex::decode(block).unwrap();
        let block: CompactBlock = parse_from_bytes(&bin).unwrap();

        c(&bin, block.get_height());
      }
    },
    Err(e) => {
      panic!("{}", e.as_string().unwrap_or("Empty Error".to_string()))
    }
  }
}

pub async fn fetch_transparent_txids<F : 'static + std::marker::Send>(address: String,
        start_height: u64, end_height: u64, c: F)
    where F : Fn(&[u8], u64) {
  let promise: js_sys::Promise = getTransparentTxids(address, start_height, end_height);

  match wasm_bindgen_futures::JsFuture::from(promise).await {
    Ok(js) => {
      let s = js.as_string().unwrap();

      if !s.trim().is_empty() {
        for txn in js.as_string().unwrap().split("\n") {
          let bin = hex::decode(txn).unwrap();
          let tx: RawTransaction = parse_from_bytes(&bin).unwrap();

          c(&tx.data, tx.get_height());
        }
      }
    },
    Err(e) => {
      panic!("{}", e.as_string().unwrap_or("Empty Error".to_string()))
    }
  }
}

pub async fn fetch_full_tx<F : 'static + std::marker::Send>(txid: TxId, c: F)
        where F : Fn(&[u8]) {
  let promise: js_sys::Promise = getFullTx(hex::encode(txid.0.to_vec()));

  let tx = wasm_bindgen_futures::JsFuture::from(promise).await;

  match tx {
    Ok(js) => {
      let bin = hex::decode(js.as_string().unwrap()).unwrap();
      let rawtx: RawTransaction = parse_from_bytes(&bin).unwrap();
      c(&rawtx.data);
    },
    Err(e) => {
      panic!("{}", e.as_string().unwrap_or("Empty Error".to_string()))
    }
  };
}

pub async fn broadcast_raw_tx(tx_bytes: Box<[u8]>) -> Result<String, String> {
  let promise: js_sys::Promise = sendTransaction(hex::encode(tx_bytes));

  let tx = wasm_bindgen_futures::JsFuture::from(promise).await;

  match tx {
    Ok(js) => {
      let bin = hex::decode(js.as_string().unwrap()).unwrap();
      let tx_response: SendResponse = parse_from_bytes(&bin).unwrap();

      if tx_response.get_errorCode() == 0 {
        let mut txid = tx_response.get_errorMessage();
        if txid.starts_with("\"") && txid.ends_with("\"") {
            txid = &txid[1..txid.len()-1];
        }

        Ok(txid.to_string())
      } else {
          Err(format!("Error: {:?}", tx_response))
      }
    },
    Err(e) => {
      panic!("{}", e.as_string().unwrap_or("Empty Error".to_string()))
    }
  }
}


pub async fn fetch_latest_block<F : 'static + std::marker::Send>(mut c : F)
    where F : FnMut(BlockID) {
  let promise: js_sys::Promise = getLatestBlock();

  match wasm_bindgen_futures::JsFuture::from(promise).await {
    Ok(js) => {
      let bin = hex::decode(js.as_string().unwrap()).unwrap();
      let block: BlockID = parse_from_bytes(&bin).unwrap();

      c(block)
    },
    Err(e) => {
      panic!("{}", e.as_string().unwrap_or("Empty Error".to_string()))
    }
  }
}
