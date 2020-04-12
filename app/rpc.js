// @flow
/* eslint-disable max-classes-per-file */
import axios from 'axios';
import { TotalBalance, AddressBalance, Transaction, RPCConfig, TxDetail, Info } from './components/AppState';
// $FlowFixMe
import native from '../native/index.node';

export default class RPC {
  rpcConfig: RPCConfig;

  fnSetInfo: Info => void;

  fnSetTotalBalance: TotalBalance => void;

  fnSetAddressesWithBalance: (AddressBalance[]) => void;

  fnSetTransactionsList: (Transaction[]) => void;

  fnSetAllAddresses: (string[]) => void;

  fnSetZecPrice: (number | null) => void;

  refreshTimerID: IntervalID | null;

  priceTimerID: TimeoutID | null;

  lastBlockHeight: number;

  constructor(
    fnSetTotalBalance: TotalBalance => void,
    fnSetAddressesWithBalance: (AddressBalance[]) => void,
    fnSetTransactionsList: (Transaction[]) => void,
    fnSetAllAddresses: (string[]) => void,
    fnSetInfo: Info => void,
    fnSetZecPrice: (number | null) => void
  ) {
    this.fnSetTotalBalance = fnSetTotalBalance;
    this.fnSetAddressesWithBalance = fnSetAddressesWithBalance;
    this.fnSetTransactionsList = fnSetTransactionsList;
    this.fnSetAllAddresses = fnSetAllAddresses;
    this.fnSetInfo = fnSetInfo;
    this.fnSetZecPrice = fnSetZecPrice;

    this.refreshTimerID = null;
    this.priceTimerID = null;
  }

  async configure(rpcConfig: RPCConfig) {
    this.rpcConfig = rpcConfig;

    if (!this.refreshTimerID) {
      this.refreshTimerID = setInterval(() => this.refresh(false), 60 * 1000);
    }

    if (!this.priceTimerID) {
      this.priceTimerID = setTimeout(() => this.getZecPrice(0), 1000);
    }

    // Immediately call the refresh after configure to update the UI
    this.refresh(true);
  }

  clearTimers() {
    if (this.refreshTimerID) {
      clearInterval(this.refreshTimerID);
      this.refreshTimerID = null;
    }

    if (this.priceTimerID) {
      clearTimeout(this.priceTimerID);
      this.priceTimerID = null;
    }
  }

  static doSync() {
    const syncstr = native.litelib_execute('sync', '');
    console.log(`Sync exec result: ${syncstr}`);
  }

  static doRescan() {
    const syncstr = native.litelib_execute('rescan', '');
    console.log(`rescan exec result: ${syncstr}`);
  }

  static doSyncStatus(): string {
    const syncstr = native.litelib_execute('syncstatus', '');
    console.log(`syncstatus: ${syncstr}`);
    return syncstr;
  }

  static doSave() {
    const savestr = native.litelib_execute('save', '');
    console.log(`Sync status: ${savestr}`);
  }

  async refresh(fullRefresh: boolean) {
    const latestBlockHeight = await this.fetchInfo();

    if (fullRefresh || !this.lastBlockHeight || this.lastBlockHeight < latestBlockHeight) {
      // If the latest block height has changed, make sure to sync. This will happen in a new thread
      RPC.doSync();

      // We need to wait for the sync to finish. The way we know the sync is done is
      // if the height matches the latestBlockHeight
      let retryCount = 0;
      const pollerID = setInterval(async () => {
        const walletHeight = RPC.fetchWalletHeight();
        retryCount += 1;

        // Wait a max of 30 retries (30 secs)
        if (walletHeight >= latestBlockHeight || retryCount > 30) {
          // We are synced. Cancel the poll timer
          clearInterval(pollerID);

          // And fetch the rest of the data.
          this.fetchTotalBalance();
          this.fetchTandZTransactions(latestBlockHeight);

          this.lastBlockHeight = latestBlockHeight;
          // All done, set up next fetch
          console.log(`Finished full refresh at ${latestBlockHeight}`);
        }
      }, 1000);
    } else {
      // Already at the latest block
      console.log('Already have latest block, waiting for next refresh');
    }
  }

  // Special method to get the Info object. This is used both internally and by the Loading screen
  static getInfoObject(): Info {
    const infostr = native.litelib_execute('info', '');
    try {
      const infoJSON = JSON.parse(infostr);

      const info = new Info();
      info.testnet = infoJSON.chain_name === 'test';
      info.latestBlock = infoJSON.latest_block_height;
      info.connections = 1;
      info.version = infoJSON.version;
      info.verificationProgress = 1;
      info.currencyName = info.testnet ? 'TAZ' : 'ZEC';
      info.solps = 0;

      const encStatus = native.litelib_execute('encryptionstatus', '');
      const encJSON = JSON.parse(encStatus);
      info.encrypted = encJSON.encrypted;
      info.locked = encJSON.locked;

      return info;
    } catch (err) {
      console.log('Failed to parse info', err);
    }
  }

  async fetchInfo(): Promise<number> {
    const info = RPC.getInfoObject();

    this.fnSetInfo(info);

    return info.latestBlock;
  }

  // This method will get the total balances
  fetchTotalBalance() {
    const balanceStr = native.litelib_execute('balance', '');
    const balanceJSON = JSON.parse(balanceStr);

    // Total Balance
    const balance = new TotalBalance();
    balance.private = balanceJSON.zbalance / 10 ** 8;
    balance.transparent = balanceJSON.tbalance / 10 ** 8;
    balance.verifiedPrivate = balanceJSON.verified_zbalance / 10 ** 8;
    balance.total = balance.private + balance.transparent;
    this.fnSetTotalBalance(balance);

    // Fetch pending notes and UTXOs
    const pendingNotes = native.litelib_execute('notes', '');
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

  static getPrivKeyAsString(address: string): string {
    const privKeyStr = native.litelib_execute('export', address);
    const privKeyJSON = JSON.parse(privKeyStr);

    return privKeyJSON[0].private_key;
  }

  static createNewAddress(zaddress: boolean) {
    const addrStr = native.litelib_execute('new', zaddress ? 'z' : 't');
    const addrJSON = JSON.parse(addrStr);

    return addrJSON[0];
  }

  static fetchSeed(): string {
    const seedStr = native.litelib_execute('seed', '');
    const seedJSON = JSON.parse(seedStr);

    return seedJSON.seed;
  }

  static fetchWalletHeight(): number {
    const heightStr = native.litelib_execute('height', '');
    const heightJSON = JSON.parse(heightStr);

    return heightJSON.height;
  }

  // Fetch all T and Z transactions
  fetchTandZTransactions(latestBlockHeight: number) {
    const listStr = native.litelib_execute('list', '');
    const listJSON = JSON.parse(listStr);

    let txlist = listJSON.map(tx => {
      const transaction = new Transaction();

      const type = tx.outgoing_metadata ? 'sent' : 'receive';

      transaction.address =
        // eslint-disable-next-line no-nested-ternary
        type === 'sent' ? (tx.outgoing_metadata.length > 0 ? tx.outgoing_metadata[0].address : '') : tx.address;
      transaction.type = type;
      transaction.amount = tx.amount / 10 ** 8;
      transaction.confirmations = tx.unconfirmed ? 0 : latestBlockHeight - tx.block_height + 1;
      transaction.txid = tx.txid;
      transaction.time = tx.datetime;
      transaction.position = tx.position;

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

    // If you send yourself transactions, the underlying SDK doesn't handle it very well, so
    // we supress these in the UI to make things a bit clearer.
    txlist = txlist.filter(tx => !(tx.type === 'sent' && tx.amount < 0 && tx.detailedTxns.length === 0));

    // Sort the list by confirmations
    txlist.sort((t1, t2) => t1.confirmations - t2.confirmations);

    this.fnSetTransactionsList(txlist);
  }

  // Send a transaction using the already constructed sendJson structure
  sendTransaction(sendJson: []): string {
    let sendStr;
    try {
      sendStr = native.litelib_execute('send', JSON.stringify(sendJson));
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
      this.refresh(true);

      return txid;
    }
  }

  async encryptWallet(password: string): Promise<boolean> {
    const resultStr = native.litelib_execute('encrypt', password);
    const resultJSON = JSON.parse(resultStr);

    // To update the wallet encryption status
    this.fetchInfo();

    // And save the wallet
    RPC.doSave();

    return resultJSON.result === 'success';
  }

  async decryptWallet(password: string): Promise<boolean> {
    const resultStr = native.litelib_execute('decrypt', password);
    const resultJSON = JSON.parse(resultStr);

    // To update the wallet encryption status
    this.fetchInfo();

    // And save the wallet
    RPC.doSave();

    return resultJSON.result === 'success';
  }

  async lockWallet(): Promise<boolean> {
    const resultStr = native.litelib_execute('lock', '');
    const resultJSON = JSON.parse(resultStr);

    // To update the wallet encryption status
    this.fetchInfo();

    return resultJSON.result === 'success';
  }

  async unlockWallet(password: string): Promise<boolean> {
    const resultStr = native.litelib_execute('unlock', password);
    const resultJSON = JSON.parse(resultStr);

    // To update the wallet encryption status
    this.fetchInfo();

    return resultJSON.result === 'success';
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
