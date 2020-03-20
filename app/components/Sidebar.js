// @flow
/* eslint-disable react/destructuring-assignment */
/* eslint-disable react/prop-types */
import React, { PureComponent } from 'react';
import type { Element } from 'react';
import url from 'url';
import querystring from 'querystring';
import Modal from 'react-modal';
import { withRouter } from 'react-router';
import { Link } from 'react-router-dom';
import TextareaAutosize from 'react-textarea-autosize';
import PropTypes from 'prop-types';
import styles from './Sidebar.module.css';
import cstyles from './Common.module.css';
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
  location: PropTypes.object.isRequired,
  info: Info,
  setRescanning: boolean => void,
  addresses: string[],
  setInfo: Info => void,
  setSendTo: (address: string, amount: number | null, memo: string | null) => void,
  getPrivKeyAsString: (address: string) => string,
  history: PropTypes.object.isRequired,
  openErrorModal: (title: string, body: string | Element<'div'> | Element<'span'>) => void,
  openPassword: (boolean, (string) => void | Promise<void>, () => void, string | null | Element<"div">) => void,
  openPasswordAndUnlockIfNeeded: (successCallback: () => void | Promise<void>) => void,
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
    const { history } = this.props;

    const exportAllMenu = async () => {
      const { openPasswordAndUnlockIfNeeded } = this.props;

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
    };

    // Connect mobile app
    const connectMobile = () => {
      history.push(routes.CONNECTMOBILE);
    };
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
    const errBody =
      <span>
        The URI &quot;{escape(uri)}&quot; was not recognized.
        <br />
        Please type in a valid URI of the form &quot; zcash:address?amout=xx&memo=yy &quot;
      </span>
    ;

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
            name="Connection"
            routeName={routes.CONNECTION}
            currentRoute={location.pathname}
            iconname="fa-server"
          />
          <SidebarMenuItem
            name="Companion App"
            routeName={routes.CONNECTMOBILE}
            currentRoute={location.pathname}
            iconname="fa-mobile"
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

// $FlowFixMe
export default withRouter(Sidebar);
