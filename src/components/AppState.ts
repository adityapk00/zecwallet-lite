/* eslint-disable max-classes-per-file */

import { ErrorModalData } from "./ErrorModal";

export enum AddressType {
  transparent,
  sapling,
  unified,
}

export class TotalBalance {
  // Total t address, confirmed and spendable
  transparent: number;

  // Total orchard balance
  uabalance: number;

  // Total private, confirmed + unconfirmed
  zbalance: number;

  // Total private, confirmed funds that have been verified
  verifiedZ: number;

  // Total private that are waiting for confirmation
  unverifiedZ: number;

  // Total private funds that are spendable
  spendableZ: number;

  // Total unconfirmed + spendable
  total: number;

  constructor() {
    this.uabalance = 0;
    this.zbalance = 0;
    this.transparent = 0;
    this.verifiedZ = 0;
    this.unverifiedZ = 0;
    this.spendableZ = 0;
    this.total = 0;
  }
}

export class AddressBalance {
  address: string;

  balance: number;

  containsPending: boolean;
  label?: string;

  constructor(address: string, balance: number) {
    this.address = address;
    this.balance = balance;
    this.containsPending = false;
  }
}

export class AddressBookEntry {
  label: string;

  address: string;

  constructor(label: string, address: string) {
    this.label = label;
    this.address = address;
  }
}

export class TxDetail {
  address: string;

  amount: string;

  memo: string | null;

  constructor() {
    this.address = "";
    this.amount = "";
    this.memo = null;
  }
}

// List of transactions. TODO: Handle memos, multiple addresses etc...
export class Transaction {
  type: string;
  address: string;
  amount: number;
  position: string;
  confirmations: number;
  txid: string;
  time: number;
  detailedTxns: TxDetail[];
  zecPrice: any;

  constructor() {
    this.type = "";
    this.address = "";
    this.amount = 0;
    this.position = "";
    this.confirmations = 0;
    this.txid = "";
    this.time = 0;
    this.detailedTxns = [];
  }
}

export class ToAddr {
  id?: number;

  to: string;
  amount: number;
  memo: string;

  constructor(id: number) {
    this.id = id;

    this.to = "";
    this.amount = 0;
    this.memo = "";
  }
}

export class SendPageState {
  fromaddr: string;

  toaddrs: ToAddr[];

  constructor() {
    this.fromaddr = "";
    this.toaddrs = [];
  }
}

export class ReceivePageState {
  // A newly created address to show by default
  newAddress: string;

  // The key used for the receive page component.
  // Increment to force re-render
  rerenderKey: number;

  constructor() {
    this.newAddress = "";
    this.rerenderKey = 0;
  }
}

export class RPCConfig {
  url: string;

  constructor() {
    this.url = "";
  }
}

export class Info {
  testnet: boolean;
  latestBlock: number;
  connections: number;
  version: string;
  verificationProgress: number;
  currencyName: string;
  solps: number;
  zecPrice: number;
  zcashdVersion: string;
  encrypted: boolean;
  locked: boolean;
  walletHeight: number;

  constructor() {
    this.testnet = false;
    this.latestBlock = 0;
    this.connections = 0;
    this.version = "";
    this.zcashdVersion = "";
    this.verificationProgress = 0;
    this.currencyName = "";
    this.solps = 0;
    this.zecPrice = 0;
    this.encrypted = false;
    this.locked = false;
    this.walletHeight = 0;
  }
}

export class ServerSelectState {
  modalIsOpen: boolean;
  constructor() {
    this.modalIsOpen = false;
  }
}

export class PasswordState {
  showPassword: boolean;

  confirmNeeded: boolean;

  passwordCallback: (password: string) => void;

  closeCallback: () => void;

  helpText?: string | JSX.Element;

  constructor() {
    this.showPassword = false;
    this.confirmNeeded = false;
    this.passwordCallback = (p) => {};
    this.closeCallback = () => {};
    this.helpText = undefined;
  }
}

export class SendProgress {
  sendInProgress: boolean;

  progress: number;

  total: number;

  etaSeconds: number;

  constructor() {
    this.sendInProgress = false;
    this.progress = 0;
    this.total = 0;
    this.etaSeconds = 0;
  }
}

export class WalletSettings {
  download_memos: string;
  spam_filter_threshold: number;

  constructor() {
    this.download_memos = "wallet";
    this.spam_filter_threshold = 0;
  }
}

export class AddressDetail {
  address: string;
  type: AddressType;
  account?: number;
  diversifier?: number;

  constructor(address: string, type: AddressType, account?: number, diversifier?: number) {
    this.address = address;
    this.type = type;
    this.account = account;
    this.diversifier = diversifier;
  }
}

// eslint-disable-next-line max-classes-per-file
export default class AppState {
  // The total confirmed and unconfirmed balance in this wallet
  totalBalance: TotalBalance;

  // The list of all t and z addresses that have a current balance. That is, the list of
  // addresses that have a (confirmed or unconfirmed) UTXO or note pending.
  addressesWithBalance: AddressBalance[];

  // A map type that contains address -> privatekey/viewkey mapping, for display on the receive page
  // This mapping is ephemeral, and will disappear when the user navigates away.
  addressPrivateKeys: Map<string, string>;

  addressViewKeys: Map<string, string>;

  // List of all addresses in the wallet, including change addresses and addresses
  // that don't have any balance or are unused
  addresses: AddressDetail[];

  // List of Address / Label pairs
  addressBook: AddressBookEntry[];

  // List of all T and Z transactions
  transactions: Transaction[];

  // The state of the send page, as the user constructs a transaction
  sendPageState: SendPageState;

  // Any state for the receive page
  receivePageState: ReceivePageState;

  // The Current configuration of the RPC params
  rpcConfig: RPCConfig;

  // getinfo and getblockchaininfo result
  info: Info;

  walletSettings: WalletSettings;

  // Error modal data
  errorModalData: ErrorModalData;

  // Server selection
  serverSelectState: ServerSelectState;

  // Is the app rescanning?
  rescanning: boolean;

  // Last sync ID
  prevSyncId: number;

  // Callbacks for the password dialog box
  passwordState: PasswordState;

  constructor() {
    this.totalBalance = new TotalBalance();
    this.addressesWithBalance = [];
    this.addressPrivateKeys = new Map();
    this.addressViewKeys = new Map();
    this.addresses = [];
    this.addressBook = [];
    this.transactions = [];
    this.errorModalData = new ErrorModalData();
    this.serverSelectState = new ServerSelectState();
    this.sendPageState = new SendPageState();
    this.receivePageState = new ReceivePageState();
    this.rpcConfig = new RPCConfig();
    this.info = new Info();
    this.rescanning = false;
    this.prevSyncId = -1;
    this.passwordState = new PasswordState();
    this.walletSettings = new WalletSettings();
  }
}
