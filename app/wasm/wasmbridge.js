import {Empty, LightdInfo, ChainSpec, RawTransaction, TransparentAddressBlockFilter, TxFilter, BlockRange, BlockID, CompactTxStreamerPromiseClient} from '../../../../grpc/service_grpc_web_pb';
import hex from 'hex-string';

const ENVOY_PROXY="https://lightwalletd.zecwallet.co:443";

export async function getInfo() {
  try {
    const client = new CompactTxStreamerPromiseClient(ENVOY_PROXY);
    const request = new Empty();
    const resp = await client.getLightdInfo(request, {});

    const hexBin = hex.encode(resp.serializeBinary());

    return hexBin;
  } catch (err) {
    console.log("grpc error(getInfo)", err);
    throw err;
  }
}

export async function getFullTx(txhex) {
  try {
    const client = new CompactTxStreamerPromiseClient(ENVOY_PROXY);

    const request = new TxFilter();
    request.setHash(hex.decode(txhex));

    const resp = await client.getTransaction(request, {});

    const hexBin = hex.encode(resp.serializeBinary());

    return hexBin;
  } catch (err) {
    console.log("grpc error(getInfo)", err);
    throw err;
  }
}

// Returns a single string, delimited by "\n", each row contains a hex-encoded block
export function getTransparentTxids(address, startHeight, endHeight) {
  return new Promise((resolve, reject) => {
    try {
      const client = new CompactTxStreamerPromiseClient(ENVOY_PROXY);

      const startBlock = new BlockID();
      startBlock.setHeight(Number(startHeight));
      const endBlock = new BlockID();
      endBlock.setHeight(Number(endHeight));

      const blockRange = new BlockRange();
      blockRange.setStart(startBlock);
      blockRange.setEnd(endBlock);

      const request = new TransparentAddressBlockFilter();
      request.setRange(blockRange);
      request.setAddress(address);

      const retValue = [];

      const resp = client.getAddressTxids(request);
      resp.on('data', (resp) => {
        const hexBin = hex.encode(resp.serializeBinary());
        retValue.push(hexBin);
      });

      resp.on('error', (e) => {
        console.log("get Transparent Txids error:", e);
        reject(e);
      });

      resp.on('end', () => {
        resolve(retValue.join('\n'));
      });
    } catch (err) {
      console.log("grpc error (getTransparentTxids)", err);
      reject("grpc error (getTransparentTxids)" + err);
    }
  });
}


// Returns a single string, delimited by "\n", each row contains a hex-encoded block
export function getBlockRange(startHeight, endHeight) {
  return new Promise((resolve, reject) => {
    console.log("JS getBlockRange", startHeight, " to ", endHeight);
    try {
      const client = new CompactTxStreamerPromiseClient(ENVOY_PROXY);

      const startBlock = new BlockID();
      startBlock.setHeight(Number(startHeight));
      const endBlock = new BlockID();
      endBlock.setHeight(Number(endHeight));

      const blockRange = new BlockRange();
      blockRange.setStart(startBlock);
      blockRange.setEnd(endBlock);

      const retValue = [];

      const resp = client.getBlockRange(blockRange);
      resp.on('data', (resp) => {
        const hexBin = hex.encode(resp.serializeBinary());
        retValue.push(hexBin);
      });

      resp.on('error', (e) => {
        console.log("Block Range error", e);
        reject(e);
      });

      resp.on('end', () => {
        resolve(retValue.join('\n'));
      });
    } catch (err) {
      console.log("grpc error (getLatestBlock)", err);
      reject("grpc error (getLatestBlock)" + err);
    }
  });
}

export async function getLatestBlock() {
  try {
    const client = new CompactTxStreamerPromiseClient(ENVOY_PROXY);
    const request = new ChainSpec();
    const resp = await client.getLatestBlock(request, {});

    console.log("getLatestBlock = ", resp.getHeight());

    const hexBin = hex.encode(resp.serializeBinary());

    return hexBin;
  } catch (err) {
    console.log("grpc error (getLatestBlock)", err);
    throw err;
  }
}

export async function sendTransaction(txHex) {
  try {
    const client = new CompactTxStreamerPromiseClient(ENVOY_PROXY);

    const request = new RawTransaction();
    request.setData(hex.decode(txHex));

    const resp = await client.sendTransaction(request, {});

    console.log("send Transaction = ", resp.getErrorcode(), ":", resp.getErrormessage());

    const hexBin = hex.encode(resp.serializeBinary());

    return hexBin;
  } catch (err) {
    console.log("grpc error (sendTransaction)", err);
    throw err;
  }
}

export function doLog(value) {
  console.log("doLog", value);
}
