/* eslint-disable react/jsx-props-no-spreading */
/* eslint-disable max-classes-per-file */
/* eslint-disable react/prop-types */
/* eslint-disable react/no-unused-state */
import React from "react";
import ReactModal from "react-modal";
import { Switch, Route } from "react-router";
import { ErrorModal, ErrorModalData } from "./components/ErrorModal";
import cstyles from "./components/Common.module.css";
import routes from "./constants/routes.json";
import Dashboard from "./components/Dashboard";
import Send, { SendManyJson } from "./components/Send";
import Receive from "./components/Receive";
import LoadingScreen from "./components/LoadingScreen";
import AppState, {
  AddressBalance,
  TotalBalance,
  Transaction,
  SendPageState,
  ToAddr,
  RPCConfig,
  Info,
  ReceivePageState,
  AddressBookEntry,
  PasswordState,
  ServerSelectState,
  SendProgress,
  AddressType,
  AddressDetail,
  WalletSettings,
} from "./components/AppState";
import RPC from "./rpc";
import Utils from "./utils/utils";
import { ZcashURITarget } from "./utils/uris";
import Zcashd from "./components/Zcashd";
import AddressBook from "./components/Addressbook";
import AddressbookImpl from "./utils/AddressbookImpl";
import Sidebar from "./components/Sidebar";
import Transactions from "./components/Transactions";
import PasswordModal from "./components/PasswordModal";
import ServerSelectModal from "./components/ServerSelectModal";

type Props = {};

export default class RouteApp extends React.Component<Props, AppState> {
  rpc: RPC;

  constructor(props: Props) {
    super(props);

    this.state = new AppState();

    // Create the initial ToAddr box
    // eslint-disable-next-line react/destructuring-assignment
    this.state.sendPageState.toaddrs = [new ToAddr(Utils.getNextToAddrID())];

    // Set the Modal's app element
    ReactModal.setAppElement("#root");

    this.rpc = new RPC(
      this.setTotalBalance,
      this.setAddressesWithBalances,
      this.setTransactionList,
      this.setAllAddresses,
      this.setInfo,
      this.setZecPrice,
      this.setWalletSettings
    );
  }

  componentDidMount() {
    // Read the address book
    (async () => {
      const addressBook = await AddressbookImpl.readAddressBook();
      if (addressBook) {
        this.setState({ addressBook });
      }
    })();
  }

  componentWillUnmount() {}

  getFullState = (): AppState => {
    return this.state;
  };

  openErrorModal = (title: string, body: string | JSX.Element) => {
    const errorModalData = new ErrorModalData();
    errorModalData.modalIsOpen = true;
    errorModalData.title = title;
    errorModalData.body = body;

    this.setState({ errorModalData });
  };

  closeErrorModal = () => {
    const errorModalData = new ErrorModalData();
    errorModalData.modalIsOpen = false;

    this.setState({ errorModalData });
  };

  openServerSelectModal = () => {
    const serverSelectState = new ServerSelectState();
    serverSelectState.modalIsOpen = true;

    this.setState({ serverSelectState });
  };

  closeServerSelectModal = () => {
    const serverSelectState = new ServerSelectState();
    serverSelectState.modalIsOpen = false;

    this.setState({ serverSelectState });
  };

  openPassword = (
    confirmNeeded: boolean,
    passwordCallback: (p: string) => void,
    closeCallback: () => void,
    helpText?: string | JSX.Element
  ) => {
    const passwordState = new PasswordState();

    passwordState.showPassword = true;
    passwordState.confirmNeeded = confirmNeeded;
    passwordState.helpText = helpText || "";

    // Set the callbacks, but before calling them back, we close the modals
    passwordState.passwordCallback = (password: string) => {
      this.setState({ passwordState: new PasswordState() });

      // Call the callback after a bit, so as to give time to the modal to close
      setTimeout(() => passwordCallback(password), 10);
    };
    passwordState.closeCallback = () => {
      this.setState({ passwordState: new PasswordState() });

      // Call the callback after a bit, so as to give time to the modal to close
      setTimeout(() => closeCallback(), 10);
    };

    this.setState({ passwordState });
  };

  // This will:
  //  1. Check if the wallet is encrypted and locked
  //  2. If it is, open the password dialog
  //  3. Attempt to unlock wallet.
  //    a. If unlock suceeds, do the callback
  //    b. If the unlock fails, show an error
  //  4. If wallet is not encrypted or already unlocked, just call the successcallback.
  openPasswordAndUnlockIfNeeded = (successCallback: () => void) => {
    // Check if it is locked
    const { info } = this.state;

    if (info.encrypted && info.locked) {
      this.openPassword(
        false,
        (password: string) => {
          (async () => {
            const success = await this.unlockWallet(password);

            if (success) {
              // If the unlock succeeded, do the submit
              successCallback();
            } else {
              this.openErrorModal("Wallet unlock failed", "Could not unlock the wallet with the password.");
            }
          })();
        },
        // Close callback is a no-op
        () => {}
      );
    } else {
      successCallback();
    }
  };

  unlockWallet = async (password: string): Promise<boolean> => {
    const success = await this.rpc.unlockWallet(password);

    return success;
  };

  lockWallet = async (): Promise<boolean> => {
    const success = await this.rpc.lockWallet();
    return success;
  };

  encryptWallet = async (password: string): Promise<boolean> => {
    const success = await this.rpc.encryptWallet(password);
    return success;
  };

  decryptWallet = async (password: string): Promise<boolean> => {
    const success = await this.rpc.decryptWallet(password);
    return success;
  };

  setTotalBalance = (totalBalance: TotalBalance) => {
    this.setState({ totalBalance });
  };

  setWalletSettings = (walletSettings: WalletSettings) => {
    this.setState({ walletSettings });
  };

  updateWalletSettings = async () => {
    await this.rpc.fetchWalletSettings();
  };

  setAddressesWithBalances = (addressesWithBalance: AddressBalance[]) => {
    this.setState({ addressesWithBalance });

    const { sendPageState } = this.state;

    // If there is no 'from' address, we'll set a default one
    if (!sendPageState.fromaddr) {
      // Find a z-address with the highest balance
      const defaultAB = addressesWithBalance
        .filter((ab) => Utils.isSapling(ab.address))
        .reduce((prev: AddressBalance | null, ab) => {
          // We'll start with a sapling address
          if (!prev) {
            return ab;
          } else if (prev.balance < ab.balance) {
            // Find the sapling address with the highest balance
            return ab;
          } else {
            return prev;
          }
        }, null);

      if (defaultAB) {
        const newSendPageState = new SendPageState();
        newSendPageState.fromaddr = defaultAB.address;
        newSendPageState.toaddrs = sendPageState.toaddrs;

        this.setState({ sendPageState: newSendPageState });
      }
    }
  };

  setTransactionList = (transactions: Transaction[]) => {
    this.setState({ transactions });
  };

  setAllAddresses = (addresses: AddressDetail[]) => {
    this.setState({ addresses });
  };

  setSendPageState = (sendPageState: SendPageState) => {
    this.setState({ sendPageState });
  };

  importPrivKeys = async (keys: string[], birthday: string): Promise<boolean> => {
    console.log(keys);

    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < keys.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      const result = await RPC.doImportPrivKey(keys[i], birthday);
      if (result === "OK") {
        return true;
        // eslint-disable-next-line no-else-return
      } else {
        this.openErrorModal(
          "Failed to import key",
          <span>
            A private key failed to import.
            <br />
            The error was:
            <br />
            {result}
          </span>
        );

        return false;
      }
    }

    return true;
  };

  setSendTo = (targets: ZcashURITarget[] | ZcashURITarget) => {
    // Clear the existing send page state and set up the new one
    const { sendPageState } = this.state;

    const newSendPageState = new SendPageState();
    newSendPageState.toaddrs = [];
    newSendPageState.fromaddr = sendPageState.fromaddr;

    // If a single object is passed, accept that as well.
    let tgts = targets;
    if (!Array.isArray(tgts)) {
      tgts = [targets as ZcashURITarget];
    }

    tgts.forEach((tgt) => {
      const to = new ToAddr(Utils.getNextToAddrID());
      if (tgt.address) {
        to.to = tgt.address;
      }
      if (tgt.amount) {
        to.amount = tgt.amount;
      }
      if (tgt.memoString) {
        to.memo = tgt.memoString;
      }

      newSendPageState.toaddrs.push(to);
    });

    this.setState({ sendPageState: newSendPageState });
  };

  setRPCConfig = (rpcConfig: RPCConfig) => {
    this.setState({ rpcConfig });
    console.log(rpcConfig);

    this.rpc.configure(rpcConfig);
  };

  setZecPrice = (price?: number) => {
    console.log(`Price = ${price}`);
    const { info } = this.state;

    const newInfo = new Info();
    Object.assign(newInfo, info);
    if (price) {
      newInfo.zecPrice = price;
    }

    this.setState({ info: newInfo });
  };

  setRescanning = (rescanning: boolean, prevSyncId: number) => {
    this.setState({ rescanning });
    this.setState({ prevSyncId });
  };

  setInfo = (newInfo: Info) => {
    // If the price is not set in this object, copy it over from the current object
    const { info } = this.state;
    if (!newInfo.zecPrice) {
      // eslint-disable-next-line no-param-reassign
      newInfo.zecPrice = info.zecPrice;
    }

    console.log(newInfo);

    this.setState({ info: newInfo });
  };

  sendTransaction = async (sendJson: SendManyJson[], setSendProgress: (p?: SendProgress) => void): Promise<string> => {
    try {
      const txid = await this.rpc.sendTransaction(sendJson, setSendProgress);

      if (txid.toLowerCase().startsWith("error")) {
        throw txid;
      }

      return txid;
    } catch (err) {
      console.log("route sendtx error", err);
      throw err;
    }
  };

  // Get a single private key for this address, and return it as a string.
  // Wallet needs to be unlocked
  getPrivKeyAsString = (address: string): string => {
    const pk = RPC.getPrivKeyAsString(address);
    return pk;
  };

  // Getter methods, which are called by the components to update the state
  fetchAndSetSinglePrivKey = async (address: string) => {
    this.openPasswordAndUnlockIfNeeded(async () => {
      let key = await RPC.getPrivKeyAsString(address);
      if (key === "") {
        key = "<No Key Available>";
      }
      const addressPrivateKeys = new Map();
      addressPrivateKeys.set(address, key);

      this.setState({ addressPrivateKeys });
    });
  };

  fetchAndSetSingleViewKey = async (address: string) => {
    this.openPasswordAndUnlockIfNeeded(async () => {
      const key = await RPC.getViewKeyAsString(address);
      const addressViewKeys = new Map();
      addressViewKeys.set(address, key);

      this.setState({ addressViewKeys });
    });
  };

  addAddressBookEntry = (label: string, address: string) => {
    // Add an entry into the address book
    const { addressBook } = this.state;
    const newAddressBook = addressBook.concat(new AddressBookEntry(label, address));

    // Write to disk. This method is async
    AddressbookImpl.writeAddressBook(newAddressBook);

    this.setState({ addressBook: newAddressBook });
  };

  removeAddressBookEntry = (label: string) => {
    const { addressBook } = this.state;
    const newAddressBook = addressBook.filter((i) => i.label !== label);

    // Write to disk. This method is async
    AddressbookImpl.writeAddressBook(newAddressBook);

    this.setState({ addressBook: newAddressBook });
  };

  createNewAddress = async (type: AddressType) => {
    this.openPasswordAndUnlockIfNeeded(async () => {
      // Create a new address
      const newaddress = RPC.createNewAddress(type);
      console.log(`Created new Address ${newaddress}`);

      // And then fetch the list of addresses again to refresh (totalBalance gets all addresses)
      this.rpc.fetchTotalBalance();

      const { receivePageState } = this.state;
      const newRerenderKey = receivePageState.rerenderKey + 1;

      const newReceivePageState = new ReceivePageState();
      newReceivePageState.newAddress = newaddress;
      newReceivePageState.rerenderKey = newRerenderKey;

      this.setState({ receivePageState: newReceivePageState });
    });
  };

  doRefresh = () => {
    this.rpc.refresh(false);
  };

  clearTimers = () => {
    this.rpc.clearTimers();
  };

  render() {
    const {
      totalBalance,
      transactions,
      addressesWithBalance,
      addressPrivateKeys,
      addressViewKeys,
      addresses,
      addressBook,
      sendPageState,
      receivePageState,
      rpcConfig,
      info,
      rescanning,
      prevSyncId,
      errorModalData,
      serverSelectState,
      passwordState,
      walletSettings,
    } = this.state;

    const standardProps = {
      openErrorModal: this.openErrorModal,
      closeErrorModal: this.closeErrorModal,
      setSendTo: this.setSendTo,
      info,
      openPasswordAndUnlockIfNeeded: this.openPasswordAndUnlockIfNeeded,
    };

    const hasLatestBlock = info && info.latestBlock > 0 ? true : false;

    return (
      <>
        <ErrorModal
          title={errorModalData.title}
          body={errorModalData.body}
          modalIsOpen={errorModalData.modalIsOpen}
          closeModal={this.closeErrorModal}
        />

        <PasswordModal
          modalIsOpen={passwordState.showPassword}
          confirmNeeded={passwordState.confirmNeeded}
          passwordCallback={passwordState.passwordCallback}
          closeCallback={passwordState.closeCallback}
          helpText={passwordState.helpText}
        />

        <ServerSelectModal
          modalIsOpen={serverSelectState.modalIsOpen}
          closeModal={this.closeServerSelectModal}
          openErrorModal={this.openErrorModal}
        />

        <div style={{ overflow: "hidden" }}>
          {hasLatestBlock && (
            <div className={cstyles.sidebarcontainer}>
              <Sidebar
                setInfo={this.setInfo}
                setRescanning={this.setRescanning}
                getPrivKeyAsString={this.getPrivKeyAsString}
                addresses={addresses}
                importPrivKeys={this.importPrivKeys}
                transactions={transactions}
                lockWallet={this.lockWallet}
                encryptWallet={this.encryptWallet}
                decryptWallet={this.decryptWallet}
                openPassword={this.openPassword}
                clearTimers={this.clearTimers}
                walletSettings={walletSettings}
                updateWalletSettings={this.updateWalletSettings}
                {...standardProps}
              />
            </div>
          )}

          <div className={cstyles.contentcontainer}>
            <Switch>
              <Route
                path={routes.SEND}
                render={() => (
                  <Send
                    addresses={addresses}
                    sendTransaction={this.sendTransaction}
                    sendPageState={sendPageState}
                    setSendPageState={this.setSendPageState}
                    totalBalance={totalBalance}
                    addressBook={addressBook}
                    {...standardProps}
                  />
                )}
              />
              <Route
                path={routes.RECEIVE}
                render={() => (
                  <Receive
                    rerenderKey={receivePageState.rerenderKey}
                    addresses={addresses}
                    addressesWithBalance={addressesWithBalance}
                    addressPrivateKeys={addressPrivateKeys}
                    addressViewKeys={addressViewKeys}
                    receivePageState={receivePageState}
                    addressBook={addressBook}
                    {...standardProps}
                    fetchAndSetSinglePrivKey={this.fetchAndSetSinglePrivKey}
                    fetchAndSetSingleViewKey={this.fetchAndSetSingleViewKey}
                    createNewAddress={this.createNewAddress}
                  />
                )}
              />
              <Route
                path={routes.ADDRESSBOOK}
                render={() => (
                  <AddressBook
                    addressBook={addressBook}
                    addAddressBookEntry={this.addAddressBookEntry}
                    removeAddressBookEntry={this.removeAddressBookEntry}
                    {...standardProps}
                  />
                )}
              />
              <Route
                path={routes.DASHBOARD}
                // eslint-disable-next-line react/jsx-props-no-spreading
                render={() => (
                  <Dashboard totalBalance={totalBalance} info={info} addressesWithBalance={addressesWithBalance} />
                )}
              />
              <Route
                path={routes.TRANSACTIONS}
                render={() => (
                  <Transactions
                    transactions={transactions}
                    info={info}
                    addressBook={addressBook}
                    setSendTo={this.setSendTo}
                  />
                )}
              />

              <Route
                path={routes.ZCASHD}
                render={() => (
                  <Zcashd
                    info={info}
                    rpcConfig={rpcConfig}
                    refresh={this.doRefresh}
                    openServerSelectModal={this.openServerSelectModal}
                  />
                )}
              />

              <Route
                path={routes.LOADING}
                render={() => (
                  <LoadingScreen
                    setRPCConfig={this.setRPCConfig}
                    rescanning={rescanning}
                    prevSyncId={prevSyncId}
                    setRescanning={this.setRescanning}
                    setInfo={this.setInfo}
                    openServerSelectModal={this.openServerSelectModal}
                  />
                )}
              />
            </Switch>
          </div>
        </div>
      </>
    );
  }
}
