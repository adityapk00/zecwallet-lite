/* eslint-disable max-classes-per-file */
import axios from 'axios';
import { TotalBalance, AddressBalance, Transaction, RPCConfig, TxDetail, Info } from './components/AppState';
import native from '../native/index.node';

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

  async refresh(lastBlockHeight: number) {
    const latestBlockHeight = await this.fetchInfo();

    if (!lastBlockHeight || lastBlockHeight < latestBlockHeight) {
      // If the latest block height has changed, make sure to sync
      await RPC.doSync();

      const balP = this.fetchTotalBalance();
      const txns = this.fetchTandZTransactions(latestBlockHeight);

      await balP;
      await txns;

      // All done, set up next fetch
      console.log(`Finished full refresh at ${latestBlockHeight}`);
    } else {
      // Still at the latest block
      console.log('Already have latest block, waiting for next refresh');
    }

    this.setupNextFetch(latestBlockHeight);
  }

  // Special method to get the Info object. This is used both internally and by the Loading screen
  static getInfoObject() {
    const infostr = native.litelib_execute('info', '');
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
  }

  async fetchInfo(): number {
    const info = RPC.getInfoObject(this.rpcConfig);

    this.fnSetInfo(info);

    return info.latestBlock;
  }

  // This method will get the total balances
  async fetchTotalBalance() {
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

  // Fetch all T and Z transactions
  async fetchTandZTransactions(latestBlockHeight: number) {
    const listStr = native.litelib_execute('list', '');
    const listJSON = JSON.parse(listStr);

    const txlist = listJSON.map(tx => {
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
      this.refresh(null);

      return txid;
    }
  }

  async encryptWallet(password): boolean {
    const resultStr = native.litelib_execute('encrypt', password);
    const resultJSON = JSON.parse(resultStr);

    // To update the wallet encryption status
    this.fetchInfo();

    // And save the wallet
    RPC.doSave();

    return resultJSON.result === 'success';
  }

  async decryptWallet(password): boolean {
    const resultStr = native.litelib_execute('decrypt', password);
    const resultJSON = JSON.parse(resultStr);

    // To update the wallet encryption status
    this.fetchInfo();

    // And save the wallet
    RPC.doSave();

    return resultJSON.result === 'success';
  }

  async lockWallet(): boolean {
    const resultStr = native.litelib_execute('lock', '');
    const resultJSON = JSON.parse(resultStr);

    // To update the wallet encryption status
    this.fetchInfo();

    return resultJSON.result === 'success';
  }

  async unlockWallet(password: string): boolean {
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
        axios('https://api.coinmarketcap.com/v1/ticker/', {
          method: 'GET'
        })
          .then(r => resolve(r.data))
          .catch(err => {
            reject(err);
          });
      });

      const zecData = response.find(i => i.symbol.toUpperCase() === 'ZEC');
      if (zecData) {
        this.fnSetZecPrice(zecData.price_usd);
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
