/* eslint-disable react/destructuring-assignment */
/* eslint-disable react/prop-types */
import React, { PureComponent } from 'react';
import type { Element } from 'react';
import url from 'url';
import querystring from 'querystring';
import Modal from 'react-modal';
import { withRouter } from 'react-router';
import { Link } from 'react-router-dom';
import { ipcRenderer } from 'electron';
import TextareaAutosize from 'react-textarea-autosize';
import PropTypes from 'prop-types';
import styles from './Sidebar.css';
import cstyles from './Common.css';
import routes from '../constants/routes.json';
import Logo from '../assets/img/logobig.png';
import { Info } from './AppState';
import Utils from '../utils/utils';
import RPC from '../rpc';

const ExportPrivKeyModal = ({ modalIsOpen, exportedPrivKeys, closeModal }) => {
  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={cstyles.modal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={[cstyles.verticalflex].join(' ')}>
        <div className={cstyles.marginbottomlarge} style={{ textAlign: 'center' }}>
          Your Wallet Private Keys
        </div>

        <div className={[cstyles.marginbottomlarge, cstyles.center].join(' ')}>
          These are all the private keys in your wallet. Please store them carefully!
        </div>

        {exportedPrivKeys && (
          <TextareaAutosize value={exportedPrivKeys.join('\n')} className={styles.exportedPrivKeys} disabled />
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

const PayURIModal = ({
  modalIsOpen,
  modalInput,
  setModalInput,
  closeModal,
  modalTitle,
  actionButtonName,
  actionCallback
}) => {
  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={cstyles.modal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={[cstyles.verticalflex].join(' ')}>
        <div className={cstyles.marginbottomlarge} style={{ textAlign: 'center' }}>
          {modalTitle}
        </div>

        <div className={cstyles.well} style={{ textAlign: 'center' }}>
          <input
            type="text"
            className={cstyles.inputbox}
            placeholder="URI"
            value={modalInput}
            onChange={e => setModalInput(e.target.value)}
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

const SidebarMenuItem = ({ name, routeName, currentRoute, iconname }) => {
  let isActive = false;

  if ((currentRoute.endsWith('app.html') && routeName === routes.HOME) || currentRoute === routeName) {
    isActive = true;
  }

  let activeColorClass = '';
  if (isActive) {
    activeColorClass = styles.sidebarmenuitemactive;
  }

  return (
    <div className={[styles.sidebarmenuitem, activeColorClass].join(' ')}>
      <Link to={routeName}>
        <span className={activeColorClass}>
          <i className={['fas', iconname].join(' ')} />
          &nbsp; &nbsp;
          {name}
        </span>
      </Link>
    </div>
  );
};

type Props = {
  info: Info,
  setRescanning: boolean => void,
  addresses: string[],
  setInfo: Info => void,
  setSendTo: (address: string, amount: number | null, memo: string | null) => void,
  getPrivKeyAsString: (address: string) => string,
  history: PropTypes.object.isRequired,
  openErrorModal: (title: string, body: string | Element<'div'>) => void,
  openPassword: (boolean, (string) => void, () => void, string) => void,
  openPasswordAndUnlockIfNeeded: (successCallback: () => void) => void,
  lockWallet: () => void,
  encryptWallet: string => void,
  decryptWallet: string => void
};

type State = {
  uriModalIsOpen: boolean,
  uriModalInputValue: string | null,
  exportPrivKeysModalIsOpen: boolean,
  exportedPrivKeys: string[] | null
};

class Sidebar extends PureComponent<Props, State> {
  constructor(props) {
    super(props);
    this.state = {
      uriModalIsOpen: false,
      uriModalInputValue: null,
      exportPrivKeysModalIsOpen: false,
      exportedPrivKeys: null
    };

    this.setupMenuHandlers();
  }

  // Handle menu items
  setupMenuHandlers = async () => {
    const { setSendTo, setInfo, setRescanning, history, openErrorModal, openPasswordAndUnlockIfNeeded } = this.props;

    // About
    ipcRenderer.on('about', () => {
      openErrorModal(
        'Zecwallet Lite',
        <div className={cstyles.verticalflex}>
          <div className={cstyles.margintoplarge}>Zecwallet Lite v1.1.0-beta1</div>
          <div className={cstyles.margintoplarge}>Built with Electron. Copyright (c) 2018-2020, Aditya Kulkarni.</div>
          <div className={cstyles.margintoplarge}>
            The MIT License (MIT) Copyright (c) 2018-2020 Zecwallet
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
    ipcRenderer.on('donate', () => {
      const { info } = this.props;

      setSendTo(
        Utils.getDonationAddress(info.testnet),
        Utils.getDefaultDonationAmount(info.testnet),
        Utils.getDefaultDonationMemo(info.testnet)
      );

      history.push(routes.SEND);
    });

    // Pay URI
    ipcRenderer.on('payuri', (event, uri) => {
      this.openURIModal(uri);
    });

    // Export Seed
    ipcRenderer.on('seed', () => {
      openPasswordAndUnlockIfNeeded(() => {
        const seed = RPC.fetchSeed();

        openErrorModal(
          'Wallet Seed',
          <div className={cstyles.verticalflex}>
            <div>
              This is your wallet&rsquo;s seed phrase. It can be used to recover your entire wallet.
              <br />
              PLEASE KEEP IT SAFE!
            </div>
            <hr />
            <div style={{ wordBreak: 'break-word', fontFamily: 'monospace, Roboto' }}>{seed}</div>
            <hr />
          </div>
        );
      });
    });

    // Encrypt wallet
    ipcRenderer.on('encrypt', async () => {
      const { info, lockWallet, encryptWallet, openPassword } = this.props;

      if (info.encrypted && info.locked) {
        openErrorModal('Already Encrypted', 'Your wallet is already encrypted and locked.');
      } else if (info.encrypted && !info.locked) {
        await lockWallet();
        openErrorModal('Locked', 'Your wallet has been locked. A password will be needed to spend funds.');
      } else {
        // Encrypt the wallet
        openPassword(
          true,
          async password => {
            await encryptWallet(password);
            openErrorModal('Encrypted', 'Your wallet has been encrypted. The password will be needed to spend funds.');
          },
          () => {
            openErrorModal('Cancelled', 'Your wallet was not encrypted.');
          },
          <div>
            Please enter a password to encrypt your wallet. <br />
            WARNING: If you forget this password, the only way to recover your wallet is from the seed phrase.
          </div>
        );
      }
    });

    // Remove wallet encryption
    ipcRenderer.on('decrypt', async () => {
      const { info, decryptWallet, openPassword } = this.props;

      if (!info.encrypted) {
        openErrorModal('Not Encrypted', 'Your wallet is not encrypted and ready for spending.');
      } else {
        // Remove the wallet remove the wallet encryption
        openPassword(
          false,
          async password => {
            const success = await decryptWallet(password);
            if (success) {
              openErrorModal(
                'Decrypted',
                `Your wallet's encryption has been removed. A password will no longer be needed to spend funds.`
              );
            } else {
              openErrorModal('Decryption Failed', 'Wallet decryption failed. Do you have the right password?');
            }
          },
          () => {
            openErrorModal('Cancelled', 'Your wallet is still encrypted.');
          }
        );
      }
    });

    // Unlock wallet
    ipcRenderer.on('unlock', () => {
      const { info } = this.props;
      if (!info.encrypted || !info.locked) {
        openErrorModal('Already Unlocked', 'Your wallet is already unlocked for spending');
      } else {
        openPasswordAndUnlockIfNeeded(async () => {
          openErrorModal('Unlocked', 'Your wallet is unlocked for spending');
        });
      }
    });

    // Rescan
    ipcRenderer.on('rescan', () => {
      // To rescan, we reset the wallet loading
      // So set info the default, and redirect to the loading screen
      RPC.doRescan();

      // Set the rescanning global state to true
      setRescanning(true);

      // Reset the info object, it will be refetched
      setInfo(new Info());

      history.push(routes.LOADING);
    });

    // Export all private keys
    ipcRenderer.on('exportall', async () => {
      // Get all the addresses and run export key on each of them.
      const { addresses, getPrivKeyAsString } = this.props;
      openPasswordAndUnlockIfNeeded(async () => {
        const privKeysPromise = addresses.map(async a => {
          const privKey = await getPrivKeyAsString(a);
          return `${privKey} #${a}`;
        });
        const exportedPrivKeys = await Promise.all(privKeysPromise);

        this.setState({ exportPrivKeysModalIsOpen: true, exportedPrivKeys });
      });
    });

    // View zcashd
    ipcRenderer.on('zcashd', () => {
      history.push(routes.ZCASHD);
    });

    // Connect mobile app
    ipcRenderer.on('connectmobile', () => {
      history.push(routes.CONNECTMOBILE);
    });
  };

  closeExportPrivKeysModal = () => {
    this.setState({ exportPrivKeysModalIsOpen: false, exportedPrivKeys: null });
  };

  openURIModal = (defaultValue: string | null) => {
    const uriModalInputValue = defaultValue || '';
    this.setState({ uriModalIsOpen: true, uriModalInputValue });
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

    const errTitle = 'URI Error';
    const errBody = (
      <span>
        The URI &quot;{escape(uri)}&quot; was not recognized.
        <br />
        Please type in a valid URI of the form &quot; zcash:address?amout=xx&memo=yy &quot;
      </span>
    );

    if (!uri || uri === '') {
      openErrorModal(errTitle, errBody);
      return;
    }

    const parsedUri = url.parse(uri);
    if (!parsedUri || parsedUri.protocol !== 'zcash:' || !parsedUri.query) {
      openErrorModal(errTitle, errBody);
      return;
    }

    const address = parsedUri.host;
    if (!address || !(Utils.isTransparent(address) || Utils.isZaddr(address))) {
      openErrorModal(errTitle, <span>The address ${address} was not recognized as a Zcash address</span>);
      return;
    }

    const parsedParams = querystring.parse(parsedUri.query);
    if (!parsedParams || (!parsedParams.amt && !parsedParams.amount)) {
      openErrorModal(errTitle, errBody);
      return;
    }

    const amount = parsedParams.amt || parsedParams.amount;
    const memo = parsedParams.memo || '';

    setSendTo(address, amount, memo);
    history.push(routes.SEND);
  };

  render() {
    const { location, info } = this.props;
    const { uriModalIsOpen, uriModalInputValue, exportPrivKeysModalIsOpen, exportedPrivKeys } = this.state;

    let state = 'DISCONNECTED';
    let progress = 100;
    if (info && info.version) {
      if (info.verificationProgress < 0.9999) {
        state = 'SYNCING';
        progress = (info.verificationProgress * 100).toFixed(1);
      } else {
        state = 'CONNECTED';
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

        {/* Exported (all) Private Keys */}
        <ExportPrivKeyModal
          modalIsOpen={exportPrivKeysModalIsOpen}
          exportedPrivKeys={exportedPrivKeys}
          closeModal={this.closeExportPrivKeysModal}
        />

        <div className={[cstyles.center, styles.sidebarlogobg].join(' ')}>
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
          {state === 'CONNECTED' && (
            <div className={[cstyles.padsmallall, cstyles.margintopsmall, cstyles.blackbg].join(' ')}>
              <i className={[cstyles.green, 'fas', 'fa-check'].join(' ')} />
              &nbsp; Connected
            </div>
          )}
          {state === 'SYNCING' && (
            <div className={[cstyles.padsmallall, cstyles.margintopsmall, cstyles.blackbg].join(' ')}>
              <div>
                <i className={[cstyles.yellow, 'fas', 'fa-sync'].join(' ')} />
                &nbsp; Syncing
              </div>
              <div>{`${progress}%`}</div>
            </div>
          )}
          {state === 'DISCONNECTED' && (
            <div className={[cstyles.padsmallall, cstyles.margintopsmall, cstyles.blackbg].join(' ')}>
              <i className={[cstyles.yellow, 'fas', 'fa-times-circle'].join(' ')} />
              &nbsp; Connected
            </div>
          )}
        </div>
      </div>
    );
  }
}

export default withRouter(Sidebar);
