/* eslint-disable no-else-return */
// @flow
/* eslint-disable react/destructuring-assignment */
/* eslint-disable react/prop-types */
import React, { PureComponent, ReactElement, useState } from "react";
import dateformat from "dateformat";
import Modal from "react-modal";
import { RouteComponentProps, withRouter } from "react-router";
import { Link } from "react-router-dom";
import TextareaAutosize from "react-textarea-autosize";
import styles from "./Sidebar.module.css";
import cstyles from "./Common.module.css";
import routes from "../constants/routes.json";
import Logo from "../assets/img/logobig.png";
import { Info, Transaction } from "./AppState";
import Utils from "../utils/utils";
import RPC from "../rpc";
import { parseZcashURI, ZcashURITarget } from "../utils/uris";

const { ipcRenderer, remote } = window.require("electron");
const fs = window.require("fs");

type ExportPrivKeyModalProps = {
  modalIsOpen: boolean;
  exportedPrivKeys: string[];
  closeModal: () => void;
};
const ExportPrivKeyModal = ({ modalIsOpen, exportedPrivKeys, closeModal }: ExportPrivKeyModalProps) => {
  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={cstyles.modal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={cstyles.marginbottomlarge} style={{ textAlign: "center" }}>
          Your Wallet Private Keys
        </div>

        <div className={[cstyles.marginbottomlarge, cstyles.center].join(" ")}>
          These are all the private keys in your wallet. Please store them carefully!
        </div>

        {exportedPrivKeys && (
          <TextareaAutosize value={exportedPrivKeys.join("\n")} className={styles.exportedPrivKeys} disabled />
        )}
      </div>

      <div className={cstyles.buttoncontainer}>
        <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
          Close
        </button>
      </div>
    </Modal>
  );
};

type ImportPrivKeyModalProps = {
  modalIsOpen: boolean;
  closeModal: () => void;
  doImportPrivKeys: (pk: string, birthday: string) => void;
};
const ImportPrivKeyModal = ({ modalIsOpen, closeModal, doImportPrivKeys }: ImportPrivKeyModalProps) => {
  const [pkey, setPKey] = useState("");
  const [birthday, setBirthday] = useState("0");

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={cstyles.modal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={cstyles.marginbottomlarge} style={{ textAlign: "center" }}>
          Import Spending or Viewing Key
        </div>

        <div className={cstyles.marginbottomlarge}>
          Please paste your private key here (spending key or viewing key).
        </div>

        <div className={[cstyles.well].join(" ")} style={{ textAlign: "center" }}>
          <TextareaAutosize
            className={cstyles.inputbox}
            placeholder="Spending or Viewing Key"
            value={pkey}
            onChange={(e) => setPKey(e.target.value)}
          />
        </div>

        <div className={cstyles.marginbottomlarge} />
        <div className={cstyles.marginbottomlarge}>
          Birthday (The earliest block height where this key was used. Ok to enter &lsquo;0&rsquo;)
        </div>
        <div className={cstyles.well}>
          <input
            type="number"
            className={cstyles.inputbox}
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
          />
        </div>
      </div>

      <div className={cstyles.buttoncontainer}>
        <button
          type="button"
          className={cstyles.primarybutton}
          onClick={() => {
            doImportPrivKeys(pkey, birthday);
            closeModal();
          }}
        >
          Import
        </button>
        <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
          Cancel
        </button>
      </div>
    </Modal>
  );
};

type PayURIModalProps = {
  modalIsOpen: boolean;
  modalInput?: string;
  setModalInput: (i: string) => void;
  closeModal: () => void;
  modalTitle: string;
  actionButtonName: string;
  actionCallback: (uri: string) => void;
};
const PayURIModal = ({
  modalIsOpen,
  modalInput,
  setModalInput,
  closeModal,
  modalTitle,
  actionButtonName,
  actionCallback,
}: PayURIModalProps) => {
  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={cstyles.modal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={cstyles.marginbottomlarge} style={{ textAlign: "center" }}>
          {modalTitle}
        </div>

        <div className={cstyles.well} style={{ textAlign: "center" }}>
          <input
            type="text"
            className={cstyles.inputbox}
            placeholder="URI"
            value={modalInput}
            onChange={(e) => setModalInput(e.target.value)}
          />
        </div>
      </div>

      <div className={cstyles.buttoncontainer}>
        {actionButtonName && (
          <button
            type="button"
            className={cstyles.primarybutton}
            onClick={() => {
              if (modalInput) {
                actionCallback(modalInput);
              }
              closeModal();
            }}
          >
            {actionButtonName}
          </button>
        )}

        <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
          Close
        </button>
      </div>
    </Modal>
  );
};

type SidebarMenuItemProps = {
  name: string;
  routeName: string;
  currentRoute: string;
  iconname: string;
};
const SidebarMenuItem = ({ name, routeName, currentRoute, iconname }: SidebarMenuItemProps) => {
  let isActive = false;

  if ((currentRoute.endsWith("app.html") && routeName === routes.HOME) || currentRoute === routeName) {
    isActive = true;
  }

  let activeColorClass = "";
  if (isActive) {
    activeColorClass = styles.sidebarmenuitemactive;
  }

  return (
    <div className={[styles.sidebarmenuitem, activeColorClass].join(" ")}>
      <Link to={routeName}>
        <span className={activeColorClass}>
          <i className={["fas", iconname].join(" ")} />
          &nbsp; &nbsp;
          {name}
        </span>
      </Link>
    </div>
  );
};

type Props = {
  info: Info;
  setRescanning: (rescan: boolean, prevSyncId: number) => void;
  addresses: string[];
  transactions: Transaction[];
  setInfo: (info: Info) => void;
  clearTimers: () => void;
  setSendTo: (targets: ZcashURITarget[] | ZcashURITarget) => void;
  getPrivKeyAsString: (address: string) => string;
  importPrivKeys: (keys: string[], birthday: string) => Promise<boolean>;
  openErrorModal: (title: string, body: string | ReactElement) => void;
  openPassword: (
    confirmNeeded: boolean,
    passwordCallback: (p: string) => void,
    closeCallback: () => void,
    helpText?: string | JSX.Element
  ) => void;
  openPasswordAndUnlockIfNeeded: (successCallback: () => void | Promise<void>) => void;
  lockWallet: () => void;
  encryptWallet: (p: string) => void;
  decryptWallet: (p: string) => Promise<boolean>;
};

type State = {
  uriModalIsOpen: boolean;
  uriModalInputValue?: string;
  privKeyModalIsOpen: boolean;
  privKeyInputValue: string | null;
  exportPrivKeysModalIsOpen: boolean;
  exportedPrivKeys: string[];
};

class Sidebar extends PureComponent<Props & RouteComponentProps, State> {
  constructor(props: Props & RouteComponentProps) {
    super(props);
    this.state = {
      uriModalIsOpen: false,
      uriModalInputValue: undefined,
      privKeyModalIsOpen: false,
      exportPrivKeysModalIsOpen: false,
      exportedPrivKeys: [],
      privKeyInputValue: null,
    };

    this.setupMenuHandlers();
  }

  // Handle menu items
  setupMenuHandlers = async () => {
    const { clearTimers, setSendTo, setInfo, setRescanning, history, openErrorModal, openPasswordAndUnlockIfNeeded } =
      this.props;

    // About
    ipcRenderer.on("about", () => {
      openErrorModal(
        "Zecwallet Lite",
        <div className={cstyles.verticalflex}>
          <div className={cstyles.margintoplarge}>Zecwallet Lite v1.7.12</div>
          <div className={cstyles.margintoplarge}>Built with Electron. Copyright (c) 2018-2021, Aditya Kulkarni.</div>
          <div className={cstyles.margintoplarge}>
            The MIT License (MIT) Copyright (c) 2018-2021 Zecwallet
            <br />
            <br />
            Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
            documentation files (the &quot;Software&quot;), to deal in the Software without restriction, including
            without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
            copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
            following conditions:
            <br />
            <br />
            The above copyright notice and this permission notice shall be included in all copies or substantial
            portions of the Software.
            <br />
            <br />
            THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
            NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
            NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
            IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
            USE OR OTHER DEALINGS IN THE SOFTWARE.
          </div>
        </div>
      );
    });

    // Donate button
    ipcRenderer.on("donate", () => {
      const { info } = this.props;

      setSendTo(
        new ZcashURITarget(
          Utils.getDonationAddress(info.testnet),
          Utils.getDefaultDonationAmount(info.testnet),
          Utils.getDefaultDonationMemo(info.testnet)
        )
      );

      history.push(routes.SEND);
    });

    // Import a Private Key
    ipcRenderer.on("import", () => {
      this.openImportPrivKeyModal(null);
    });

    // Pay URI
    ipcRenderer.on("payuri", (event: any, uri: string) => {
      this.openURIModal(uri);
    });

    // Export Seed
    ipcRenderer.on("seed", () => {
      openPasswordAndUnlockIfNeeded(() => {
        const seed = RPC.fetchSeed();

        openErrorModal(
          "Wallet Seed",
          <div className={cstyles.verticalflex}>
            <div>
              This is your wallet&rsquo;s seed phrase. It can be used to recover your entire wallet.
              <br />
              PLEASE KEEP IT SAFE!
            </div>
            <hr />
            <div
              style={{
                wordBreak: "break-word",
                fontFamily: "monospace, Roboto",
              }}
            >
              {seed}
            </div>
            <hr />
          </div>
        );
      });
    });

    // Export All Transactions
    ipcRenderer.on("exportalltx", async () => {
      const save = await remote.dialog.showSaveDialog({
        title: "Save Transactions As CSV",
        defaultPath: "zecwallet_transactions.csv",
        filters: [{ name: "CSV File", extensions: ["csv"] }],
        properties: ["showOverwriteConfirmation"],
      });

      if (save.filePath) {
        // Construct a CSV
        const { transactions } = this.props;
        const rows = transactions.flatMap((t) => {
          if (t.detailedTxns) {
            return t.detailedTxns.map((dt) => {
              const normaldate = dateformat(t.time * 1000, "mmm dd yyyy hh::MM tt");

              // Add a single quote "'" into the memo field to force interpretation as a string, rather than as a
              // formula from a rogue memo
              const escapedMemo = dt.memo ? `'${dt.memo.replace(/"/g, '""')}'` : "";
              const price = t.zecPrice ? t.zecPrice.toFixed(2) : "--";

              return `${t.time},"${normaldate}","${t.txid}","${t.type}",${dt.amount},"${dt.address}","${price}","${escapedMemo}"`;
            });
          } else {
            return [];
          }
        });

        const header = [`UnixTime, Date, Txid, Type, Amount, Address, ZECPrice, Memo`];

        try {
          await fs.promises.writeFile(save.filePath, header.concat(rows).join("\n"));
        } catch (err) {
          openErrorModal("Error Exporting Transactions", `${err}`);
        }
      }
    });

    // Encrypt wallet
    ipcRenderer.on("encrypt", async () => {
      const { info, lockWallet, encryptWallet, openPassword } = this.props;

      if (info.encrypted && info.locked) {
        openErrorModal("Already Encrypted", "Your wallet is already encrypted and locked.");
      } else if (info.encrypted && !info.locked) {
        await lockWallet();
        openErrorModal("Locked", "Your wallet has been locked. A password will be needed to spend funds.");
      } else {
        // Encrypt the wallet
        openPassword(
          true,
          async (password) => {
            await encryptWallet(password);
            openErrorModal("Encrypted", "Your wallet has been encrypted. The password will be needed to spend funds.");
          },
          () => {
            openErrorModal("Cancelled", "Your wallet was not encrypted.");
          },
          <div>
            Please enter a password to encrypt your wallet. <br />
            WARNING: If you forget this password, the only way to recover your wallet is from the seed phrase.
          </div>
        );
      }
    });

    // Remove wallet encryption
    ipcRenderer.on("decrypt", async () => {
      const { info, decryptWallet, openPassword } = this.props;

      if (!info.encrypted) {
        openErrorModal("Not Encrypted", "Your wallet is not encrypted and ready for spending.");
      } else {
        // Remove the wallet remove the wallet encryption
        openPassword(
          false,
          async (password) => {
            const success = await decryptWallet(password);
            if (success) {
              openErrorModal(
                "Decrypted",
                `Your wallet's encryption has been removed. A password will no longer be needed to spend funds.`
              );
            } else {
              openErrorModal("Decryption Failed", "Wallet decryption failed. Do you have the right password?");
            }
          },
          () => {
            openErrorModal("Cancelled", "Your wallet is still encrypted.");
          },
          ""
        );
      }
    });

    // Unlock wallet
    ipcRenderer.on("unlock", () => {
      const { info } = this.props;
      if (!info.encrypted || !info.locked) {
        openErrorModal("Already Unlocked", "Your wallet is already unlocked for spending");
      } else {
        openPasswordAndUnlockIfNeeded(async () => {
          openErrorModal("Unlocked", "Your wallet is unlocked for spending");
        });
      }
    });

    // Rescan
    ipcRenderer.on("rescan", () => {
      // To rescan, we reset the wallet loading
      // So set info the default, and redirect to the loading screen
      clearTimers();

      // Grab the previous sync ID.
      const prevSyncId = JSON.parse(RPC.doSyncStatus()).sync_id;

      RPC.doRescan();

      // Set the rescanning global state to true
      setRescanning(true, prevSyncId);

      // Reset the info object, it will be refetched
      setInfo(new Info());

      history.push(routes.LOADING);
    });

    // Export all private keys
    ipcRenderer.on("exportall", async () => {
      // Get all the addresses and run export key on each of them.
      const { addresses, getPrivKeyAsString } = this.props;
      openPasswordAndUnlockIfNeeded(async () => {
        const privKeysPromise = addresses.map(async (a) => {
          const privKey = await getPrivKeyAsString(a);
          return `${privKey} #${a}`;
        });
        const exportedPrivKeys = await Promise.all(privKeysPromise);

        this.setState({ exportPrivKeysModalIsOpen: true, exportedPrivKeys });
      });
    });

    // View zcashd
    ipcRenderer.on("zcashd", () => {
      history.push(routes.ZCASHD);
    });

    // Connect mobile app
    ipcRenderer.on("connectmobile", () => {
      history.push(routes.CONNECTMOBILE);
    });
  };

  closeExportPrivKeysModal = () => {
    this.setState({ exportPrivKeysModalIsOpen: false, exportedPrivKeys: [] });
  };

  openImportPrivKeyModal = (defaultValue: string | null) => {
    const privKeyInputValue = defaultValue || "";
    this.setState({ privKeyModalIsOpen: true, privKeyInputValue });
  };

  setImprovPrivKeyInputValue = (privKeyInputValue: string) => {
    this.setState({ privKeyInputValue });
  };

  closeImportPrivKeyModal = () => {
    this.setState({ privKeyModalIsOpen: false });
  };

  openURIModal = (defaultValue: string | null) => {
    const uriModalInputValue = defaultValue || "";
    this.setState({ uriModalIsOpen: true, uriModalInputValue });
  };

  doImportPrivKeys = async (key: string, birthday: string) => {
    const { importPrivKeys, openErrorModal, setInfo, clearTimers, setRescanning, history, info } = this.props;

    // eslint-disable-next-line no-control-regex
    if (key) {
      // eslint-disable-next-line no-control-regex
      let keys = key.split(new RegExp("[\n\r]+"));
      if (!keys || keys.length === 0) {
        openErrorModal("No Keys Imported", "No keys were specified, so none were imported");
        return;
      }

      // Filter out empty lines and clean up the private keys
      keys = keys.filter((k) => !(k.trim().startsWith("#") || k.trim().length === 0));

      // Special case.
      // Sometimes, when importing from a paperwallet or such, the key is split by newlines, and might have
      // been pasted like that. So check to see if the whole thing is one big private key
      if (Utils.isValidSaplingPrivateKey(keys.join("")) || Utils.isValidSaplingViewingKey(keys.join(""))) {
        keys = [keys.join("")];
      }

      if (keys.length > 1) {
        openErrorModal("Multiple Keys Not Supported", "Please import one key at a time");
        return;
      }

      if (!Utils.isValidSaplingPrivateKey(keys[0]) && !Utils.isValidSaplingViewingKey(keys[0])) {
        openErrorModal(
          "Bad Key",
          "The input key was not recognized as either a sapling spending key or a sapling viewing key"
        );
        return;
      }

      // in order to import a viewing key, the wallet can be encrypted,
      // but it must be unlocked
      if (Utils.isValidSaplingViewingKey(keys[0]) && info.locked) {
        openErrorModal(
          "Wallet Is Locked",
          "In order to import a Sapling viewing key, your wallet must be unlocked. If you wish to continue, unlock your wallet and try again."
        );
        return;
      }

      // in order to import a private key, the wallet must be unencrypted
      if (Utils.isValidSaplingPrivateKey(keys[0]) && info.encrypted) {
        openErrorModal(
          "Wallet Is Encrypted",
          "In order to import a Sapling private key, your wallet cannot be encrypted. If you wish to continue, remove the encryption from your wallet and try again."
        );
        return;
      }

      // To rescan, we reset the wallet loading
      // So set info the default, and redirect to the loading screen
      clearTimers();

      // Grab the previous sync ID.
      const prevSyncId = JSON.parse(RPC.doSyncStatus()).sync_id;
      const success = await importPrivKeys(keys, birthday);

      if (success) {
        // Set the rescanning global state to true
        setRescanning(true, prevSyncId);

        // Reset the info object, it will be refetched
        setInfo(new Info());

        history.push(routes.LOADING);
      }
    }
  };

  setURIInputValue = (uriModalInputValue: string) => {
    this.setState({ uriModalInputValue });
  };

  closeURIModal = () => {
    this.setState({ uriModalIsOpen: false });
  };

  payURI = (uri: string) => {
    console.log(`Paying ${uri}`);
    const { openErrorModal, setSendTo, history } = this.props;

    const errTitle = "URI Error";
    const getErrorBody = (explain: string): ReactElement => {
      return (
        <div>
          <span>{explain}</span>
          <br />
        </div>
      );
    };

    if (!uri || uri === "") {
      openErrorModal(errTitle, getErrorBody("URI was not found or invalid"));
      return;
    }

    const parsedUri = parseZcashURI(uri);
    if (typeof parsedUri === "string") {
      openErrorModal(errTitle, getErrorBody(parsedUri));
      return;
    }

    setSendTo(parsedUri);
    history.push(routes.SEND);
  };

  render() {
    const { location, info } = this.props;
    const {
      uriModalIsOpen,
      uriModalInputValue,
      privKeyModalIsOpen,
      //privKeyInputValue,
      exportPrivKeysModalIsOpen,
      exportedPrivKeys,
    } = this.state;

    let state = "DISCONNECTED";
    let progress = "100";
    if (info && info.latestBlock) {
      if (info.verificationProgress < 0.9999) {
        state = "SYNCING";
        progress = (info.verificationProgress * 100).toFixed(1);
      } else {
        state = "CONNECTED";
      }
    }

    return (
      <div>
        {/* Payment URI Modal */}
        <PayURIModal
          modalInput={uriModalInputValue}
          setModalInput={this.setURIInputValue}
          modalIsOpen={uriModalIsOpen}
          closeModal={this.closeURIModal}
          modalTitle="Pay URI"
          actionButtonName="Pay URI"
          actionCallback={this.payURI}
        />

        {/* Import Private Key Modal */}
        <ImportPrivKeyModal
          modalIsOpen={privKeyModalIsOpen}
          // setModalInput={this.setImprovPrivKeyInputValue}
          // modalInput={privKeyInputValue}
          closeModal={this.closeImportPrivKeyModal}
          doImportPrivKeys={this.doImportPrivKeys}
        />

        {/* Exported (all) Private Keys */}
        <ExportPrivKeyModal
          modalIsOpen={exportPrivKeysModalIsOpen}
          exportedPrivKeys={exportedPrivKeys}
          closeModal={this.closeExportPrivKeysModal}
        />

        <div className={[cstyles.center, styles.sidebarlogobg].join(" ")}>
          <img src={Logo} width="70" alt="logo" />
        </div>

        <div className={styles.sidebar}>
          <SidebarMenuItem
            name="Dashboard"
            routeName={routes.DASHBOARD}
            currentRoute={location.pathname}
            iconname="fa-home"
          />
          <SidebarMenuItem
            name="Send"
            routeName={routes.SEND}
            currentRoute={location.pathname}
            iconname="fa-paper-plane"
          />
          <SidebarMenuItem
            name="Receive"
            routeName={routes.RECEIVE}
            currentRoute={location.pathname}
            iconname="fa-download"
          />
          <SidebarMenuItem
            name="Transactions"
            routeName={routes.TRANSACTIONS}
            currentRoute={location.pathname}
            iconname="fa-list"
          />
          <SidebarMenuItem
            name="Address Book"
            routeName={routes.ADDRESSBOOK}
            currentRoute={location.pathname}
            iconname="fa-address-book"
          />
        </div>

        <div className={cstyles.center}>
          {state === "CONNECTED" && (
            <div className={[cstyles.padsmallall, cstyles.margintopsmall, cstyles.blackbg].join(" ")}>
              <i className={[cstyles.green, "fas", "fa-check"].join(" ")} />
              &nbsp; Connected
            </div>
          )}
          {state === "SYNCING" && (
            <div className={[cstyles.padsmallall, cstyles.margintopsmall, cstyles.blackbg].join(" ")}>
              <div>
                <i className={[cstyles.yellow, "fas", "fa-sync"].join(" ")} />
                &nbsp; Syncing
              </div>
              <div>{`${progress}%`}</div>
            </div>
          )}
          {state === "DISCONNECTED" && (
            <div className={[cstyles.padsmallall, cstyles.margintopsmall, cstyles.blackbg].join(" ")}>
              <i className={[cstyles.yellow, "fas", "fa-times-circle"].join(" ")} />
              &nbsp; Connected
            </div>
          )}
        </div>
      </div>
    );
  }
}

// $FlowFixMe
export default withRouter(Sidebar);
