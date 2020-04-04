/* eslint-disable max-classes-per-file */
import axios from 'axios';
import _sodium from 'libsodium-wrappers-sumo';
import { TotalBalance, AddressBalance, Transaction, RPCConfig, TxDetail, Info } from './components/AppState';

const rust = import('./wasm/pkg');

let native = null;

async function initNative() {
  if (!native) {
    native = await rust;
  }
}

const LOCALSTORAGE_WALLET_KEY = "lite_wallet_hex_bytes";

export default class RPC {
  rpcConfig: RPCConfig;

  fnSetInfo: Info => void;

  fnSetTotalBalance: TotalBalance => void;

  fnSetAddressesWithBalance: (AddressBalance[]) => void;

  fnSetTransactionsList: (Transaction[]) => void;

  fnSetAllAddresses: (string[]) => void;

  fnSetZecPrice: number => void;

  refreshTimerID: TimerID;

  priceTimerID: TimerID;

  constructor(
    fnSetTotalBalance: TotalBalance => void,
    fnSetAddressesWithBalance: (AddressBalance[]) => void,
    fnSetTransactionsList: (Transaction[]) => void,
    fnSetAllAddresses: (string[]) => void,
    fnSetInfo: Info => void,
    fnSetZecPrice: number => void
  ) {
    this.fnSetTotalBalance = fnSetTotalBalance;
    this.fnSetAddressesWithBalance = fnSetAddressesWithBalance;
    this.fnSetTransactionsList = fnSetTransactionsList;
    this.fnSetAllAddresses = fnSetAllAddresses;
    this.fnSetInfo = fnSetInfo;
    this.fnSetZecPrice = fnSetZecPrice;
  }

  async configure(rpcConfig: RPCConfig) {
    this.rpcConfig = rpcConfig;

    if (!this.refreshTimerID) {
      this.refreshTimerID = setTimeout(() => this.refresh(), 1000);
    }

    if (!this.priceTimerID) {
      this.priceTimerID = setTimeout(() => this.getZecPrice(), 1000);
    }
  }

  setupNextFetch(lastBlockHeight: number) {
    this.refreshTimerID = setTimeout(() => this.refresh(lastBlockHeight), 60 * 1000);
  }

  static async doNewWallet(): string {
    await _sodium.ready;
    const sodium = _sodium;

    const randomHex = sodium.to_hex(sodium.randombytes_buf(32));

    await initNative();

    const result = await native.litelib_initialize_new(randomHex);
    // console.log("Litelib init result", result);

    return result;
  }

  static async doRestoreWallet(seed: string, birthday: number) {
    await initNative();

    const result = await native.litelib_initialize_new_from_phrase(seed, BigInt(birthday));
    console.log("Litelib restore result", result);

    return result;
  }

  static async doReadExistingWallet(walletHex: string) {
    await initNative();

    const result = await native.litelib_initialize_existing(walletHex);
    console.log("Litelib init existing result", result);

    return result;
  }

  static readWalletFromLocalStorage() : string | null {
    const localStorage = window.localStorage;
    const walletHex = localStorage.getItem(LOCALSTORAGE_WALLET_KEY);

    return walletHex;
  }

  static async saveWalletToLocalStorage() {
    const walletHex = await RPC.doSave();

    const localStorage = window.localStorage;
    localStorage.setItem(LOCALSTORAGE_WALLET_KEY, walletHex);

    console.log("Saved wallet to local storage");
  }

  static async doSave(): string {
    await initNative();

    const savestr = await native.litelib_execute('save', '');
    console.log(`Save result: wallet bytes: ${savestr.length}`);

    return savestr;
  }

  static async doSync() {
    await initNative();

    const syncstr = await native.litelib_execute('sync', '');
    console.log(`Sync exec result: ${syncstr}`);
  }

  static async doRescan() {
    await initNative();

    const syncstr = await native.litelib_execute('rescan', '');
    console.log(`rescan exec result: ${syncstr}`);
  }

  static async doSyncStatus(): string {
    await initNative();

    const syncstr = await native.litelib_execute('syncstatus', '');
    return syncstr;
  }

  async refresh(lastBlockHeight: number) {
    const latestBlockHeight = await this.fetchInfo();

    if (!lastBlockHeight || lastBlockHeight < latestBlockHeight) {
      // If the latest block height has changed, make sure to sync. This will happen in a new thread
      RPC.doSync();

      // We need to wait for the sync to finish. The way we know the sync is done is
      // if the height matches the latestBlockHeight
      let retryCount = 0;
      const pollerID = setInterval(async () => {
        const walletHeight = await RPC.fetchWalletHeight();
        retryCount += 1;

        // Wait a max of 30 retries (30 secs)
        if (walletHeight >= latestBlockHeight || retryCount > 30) {
          // We are synced. Cancel the poll timer
          clearTimeout(pollerID);

          // And fetch the rest of the data.
          this.fetchTotalBalance();
          this.fetchTandZTransactions(latestBlockHeight);

          // All done, set up next fetch
          console.log(`Finished full refresh at ${latestBlockHeight}`);

          this.setupNextFetch(latestBlockHeight);
        }
      }, 1000);
    } else {
      // Already at the latest block
      console.log('Already have latest block, waiting for next refresh');
      this.setupNextFetch(latestBlockHeight);
    }
  }

  // Special method to get the Info object. This is used both internally and by the Loading screen
  static async getInfoObject() {
    await initNative();

    const infostr = await native.litelib_execute('info', '');
    const infoJSON = JSON.parse(infostr);

    const info = new Info();
    info.testnet = infoJSON.chain_name === 'test';
    info.latestBlock = infoJSON.latest_block_height;
    info.connections = 1;
    info.version = infoJSON.version;
    info.verificationProgress = 1;
    info.currencyName = info.testnet ? 'TAZ' : 'ZEC';
    info.solps = 0;

    // Encryption is not enabled in the web wallet
    info.encrypted = false;
    info.locked = false;

    return info;
  }

  async fetchInfo(): number {
    const info = await RPC.getInfoObject(this.rpcConfig);

    this.fnSetInfo(info);

    return info.latestBlock;
  }

  // This method will get the total balances
  async fetchTotalBalance() {
    await initNative();

    const balanceStr = await native.litelib_execute('balance', '');
    const balanceJSON = JSON.parse(balanceStr);

    // Total Balance
    const balance = new TotalBalance();
    balance.private = balanceJSON.zbalance / 10 ** 8;
    balance.transparent = balanceJSON.tbalance / 10 ** 8;
    balance.verifiedPrivate = balanceJSON.verified_zbalance / 10 ** 8;
    balance.total = balance.private + balance.transparent;
    this.fnSetTotalBalance(balance);

    // Fetch pending notes and UTXOs
    const pendingNotes = await native.litelib_execute('notes', '');
    const pendingJSON = JSON.parse(pendingNotes);

    const pendingAddressBalances = new Map();

    // Process sapling notes
    pendingJSON.pending_notes.forEach(s => {
      pendingAddressBalances.set(s.address, s.value);
    });

    // Process UTXOs
    pendingJSON.pending_utxos.forEach(s => {
      pendingAddressBalances.set(s.address, s.value);
    });

    // Addresses with Balance. The lite client reports balances in zatoshi, so divide by 10^8;
    const zaddresses = balanceJSON.z_addresses
      .map(o => {
        // If this has any unconfirmed txns, show that in the UI
        const ab = new AddressBalance(o.address, o.zbalance / 10 ** 8);
        if (pendingAddressBalances.has(ab.address)) {
          ab.containsPending = true;
        }
        return ab;
      })
      .filter(ab => ab.balance > 0);

    const taddresses = balanceJSON.t_addresses
      .map(o => {
        // If this has any unconfirmed txns, show that in the UI
        const ab = new AddressBalance(o.address, o.balance / 10 ** 8);
        if (pendingAddressBalances.has(ab.address)) {
          ab.containsPending = true;
        }
        return ab;
      })
      .filter(ab => ab.balance > 0);

    const addresses = zaddresses.concat(taddresses);

    this.fnSetAddressesWithBalance(addresses);

    // Also set all addresses
    const allZAddresses = balanceJSON.z_addresses.map(o => o.address);
    const allTAddresses = balanceJSON.t_addresses.map(o => o.address);
    const allAddresses = allZAddresses.concat(allTAddresses);

    this.fnSetAllAddresses(allAddresses);
  }

  static async getPrivKeyAsString(address: string): string {
    await initNative();

    const privKeyStr = await native.litelib_execute('export', address);
    const privKeyJSON = JSON.parse(privKeyStr);

    return privKeyJSON[0].private_key;
  }

  static async createNewAddress(zaddress: boolean) {
    await initNative();

    const addrStr = await native.litelib_execute('new', zaddress ? 'z' : 't');
    const addrJSON = JSON.parse(addrStr);

    return addrJSON[0];
  }

  static async fetchSeed(): string {
    await initNative();

    const seedStr = await native.litelib_execute('seed', '');
    const seedJSON = JSON.parse(seedStr);

    return seedJSON.seed;
  }

  static async fetchWalletHeight(): number {
    await initNative();

    const heightStr = await native.litelib_execute('height', '');
    const heightJSON = JSON.parse(heightStr);

    return heightJSON.height;
  }

  // Fetch all T and Z transactions
  async fetchTandZTransactions(latestBlockHeight: number) {
    await initNative();

    const listStr = await native.litelib_execute('list', '');
    const listJSON = JSON.parse(listStr);

    let txlist = listJSON.map(tx => {
      const transaction = new Transaction();

      const type = tx.outgoing_metadata ? 'sent' : 'receive';

      transaction.address =
        // eslint-disable-next-line no-nested-ternary
        type === 'sent' ? (tx.outgoing_metadata.length > 0 ? tx.outgoing_metadata[0].address : '') : tx.address;
      transaction.type = type;
      transaction.amount = tx.amount / 10 ** 8;
      transaction.confirmations = latestBlockHeight - tx.block_height + 1;
      transaction.txid = tx.txid;
      transaction.time = tx.datetime;
      if (tx.outgoing_metadata) {
        transaction.detailedTxns = tx.outgoing_metadata.map(o => {
          const detail = new TxDetail();
          detail.address = o.address;
          detail.amount = o.value / 10 ** 8;
          detail.memo = o.memo;

          return detail;
        });
      } else {
        transaction.detailedTxns = [new TxDetail()];
        transaction.detailedTxns[0].address = tx.address;
        transaction.detailedTxns[0].amount = tx.amount / 10 ** 8;
        transaction.detailedTxns[0].memo = tx.memo;
      }

      return transaction;
    });

    // There's an issue where there are "blank" sent transactions, filter them out.
    txlist = txlist.filter(tx => !(tx.type === 'sent' && tx.amount < 0 && tx.detailedTxns.length === 0));

    // Sort the list by confirmations
    txlist.sort((t1, t2) => t1.confirmations - t2.confirmations);

    this.fnSetTransactionsList(txlist);
  }

  // Send a transaction using the already constructed sendJson structure
  async sendTransaction(sendJson: []): string {
    let sendStr;
    try {
      await initNative();
      sendStr = await native.litelib_execute('send', JSON.stringify(sendJson));
    } catch (err) {
      // TODO Show a modal with the error
      console.log(`Error sending Tx: ${err}`);
      throw err;
    }

    if (sendStr.startsWith('Error')) {
      // Throw the proper error
      throw sendStr.split(/[\r\n]+/)[0];
    }

    console.log(`Send response: ${sendStr}`);
    const sendJSON = JSON.parse(sendStr);
    const { txid, error } = sendJSON;

    if (error) {
      console.log(`Error sending Tx: ${error}`);
      throw error;
    } else {
      // And refresh data (full refresh)
      this.refresh(null);

      return txid;
    }
  }

  setupNextZecPriceRefresh(retryCount: number, timeout: number) {
    // Every hour
    this.priceTimerID = setTimeout(() => this.getZecPrice(retryCount), timeout);
  }

  async getZecPrice(retryCount: number) {
    if (!retryCount) {
      // eslint-disable-next-line no-param-reassign
      retryCount = 0;
    }

    try {
      const response = await new Promise((resolve, reject) => {
        axios('https://api.coincap.io/v2/rates/zcash', {
          method: 'GET'
        })
          .then(r => resolve(r.data))
          .catch(err => {
            reject(err);
          });
      });

      const zecData = response.data;
      if (zecData) {
        this.fnSetZecPrice(zecData.rateUsd);
        this.setupNextZecPriceRefresh(0, 1000 * 60 * 60); // Every hour
      } else {
        this.fnSetZecPrice(null);
        let timeout = 1000 * 60; // 1 minute
        if (retryCount > 5) {
          timeout = 1000 * 60 * 60; // an hour later
        }
        this.setupNextZecPriceRefresh(retryCount + 1, timeout);
      }
    } catch (err) {
      console.log(err);
      this.fnSetZecPrice(null);
      let timeout = 1000 * 60; // 1 minute
      if (retryCount > 5) {
        timeout = 1000 * 60 * 60; // an hour later
      }
      this.setupNextZecPriceRefresh(retryCount + 1, timeout);
    }
  }
}
