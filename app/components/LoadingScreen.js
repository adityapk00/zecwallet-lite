/* eslint-disable radix */
/* eslint-disable max-classes-per-file */
import React, { Component } from 'react';
import { Redirect, withRouter } from 'react-router';
import { ipcRenderer } from 'electron';
import TextareaAutosize from 'react-textarea-autosize';
import native from '../../native/index.node';
import routes from '../constants/routes.json';
import { RPCConfig, Info } from './AppState';
import RPC from '../rpc';
import cstyles from './Common.css';
import styles from './LoadingScreen.css';
import Logo from '../assets/img/logobig.png';

type Props = {
  setRPCConfig: (rpcConfig: RPCConfig) => void,
  rescanning: boolean,
  setRescanning: boolean => void,
  setInfo: (info: Info) => void
};

class LoadingScreenState {
  currentStatus: string;

  loadingDone: boolean;

  rpcConfig: RPCConfig | null;

  url: string;

  walletScreen: number; // 0 -> no wallet, load existing wallet 1 -> show option 2-> create new 3 -> restore existing

  newWalletError: null | string; // Any errors when creating/restoring wallet

  seed: string; // The new seed phrase for a newly created wallet or the seed phrase to restore from

  birthday: number; // Wallet birthday if we're restoring

  getinfoRetryCount: number;

  constructor() {
    this.currentStatus = 'Loading...';
    this.loadingDone = false;
    this.rpcConfig = null;
    this.url = '';
    this.getinfoRetryCount = 0;
    this.walletScreen = 0;
    this.newWalletError = null;
    this.seed = '';
    this.birthday = 0;
  }
}

class LoadingScreen extends Component<Props, LoadingScreenState> {
  constructor(props: Props) {
    super(props);

    const state = new LoadingScreenState();
    state.url = 'https://lightwalletd.zecwallet.co:1443';
    this.state = state;
  }

  componentDidMount() {
    const { rescanning } = this.props;

    if (rescanning) {
      this.runSyncStatusPoller();
    } else {
      this.doFirstTimeSetup();
    }
  }

  doFirstTimeSetup = async () => {
    // Try to load the light client
    const { url } = this.state;

    // First, set up the exit handler
    this.setupExitHandler();

    // Test to see if the wallet exists
    if (!native.litelib_wallet_exists('main')) {
      // Show the wallet creation screen
      this.setState({ walletScreen: 1 });
    } else {
      const result = native.litelib_initialize_existing(true, url);
      console.log(`Intialization: ${result}`);
      if (result !== 'OK') {
        this.setState({
          currentStatus: (
            <span>
              Error Initializing Lightclient
              <br />
              {result}
            </span>
          )
        });

        return;
      }

      this.getInfo();
    }
  };

  setupExitHandler = () => {
    // App is quitting, make sure to save the wallet properly.
    ipcRenderer.on('appquitting', () => {
      RPC.doSave();

      // And reply that we're all done.
      ipcRenderer.send('appquitdone');
    });
  };

  getInfo() {
    // Try getting the info.
    try {
      // Do a sync at start
      this.setState({ currentStatus: 'Syncing...' });

      // This will do the sync in another thread, so we have to check for sync status
      RPC.doSync();

      this.runSyncStatusPoller();
    } catch (err) {
      // Not yet finished loading. So update the state, and setup the next refresh
      this.setState({ currentStatus: err });
    }
  }

  runSyncStatusPoller = () => {
    const me = this;

    const { setRPCConfig, setInfo, setRescanning } = this.props;
    const { url } = this.state;

    const info = RPC.getInfoObject();

    // And after a while, check the sync status.
    const poller = setInterval(() => {
      const syncstatus = RPC.doSyncStatus();
      const ss = JSON.parse(syncstatus);

      if (ss.syncing === 'false') {
        // First, save the wallet so we don't lose the just-synced data
        RPC.doSave();

        // Set the info object, so the sidebar will show
        console.log(info);
        setInfo(info);

        // This will cause a redirect to the dashboard
        me.setState({ loadingDone: true });

        setRescanning(false);

        // Configure the RPC, which will setup the refresh
        const rpcConfig = new RPCConfig();
        rpcConfig.url = url;
        setRPCConfig(rpcConfig);

        // And cancel the updater
        clearInterval(poller);
      } else {
        // Still syncing, grab the status and update the status
        const p = ss.synced_blocks;
        const t = ss.total_blocks;
        const currentStatus = `Syncing ${p} / ${t}`;

        me.setState({ currentStatus });
      }
    }, 1000);
  };

  createNewWallet = () => {
    const { url } = this.state;
    const result = native.litelib_initialize_new(true, url);

    if (result.startsWith('Error')) {
      this.setState({ newWalletError: result });
    } else {
      const r = JSON.parse(result);
      this.setState({ walletScreen: 2, seed: r.seed });
    }
  };

  startNewWallet = () => {
    // Start using the new wallet
    this.setState({ walletScreen: 0 });
    this.getInfo();
  };

  restoreExistingWallet = () => {
    this.setState({ walletScreen: 3 });
  };

  updateSeed = e => {
    this.setState({ seed: e.target.value });
  };

  updateBirthday = e => {
    this.setState({ birthday: e.target.value });
  };

  restoreWalletBack = () => {
    // Reset the seed and birthday and try again
    this.setState({ seed: '', birthday: 0, newWalletError: null, walletScreen: 3 });
  };

  doRestoreWallet = () => {
    const { seed, birthday, url } = this.state;
    console.log(`Restoring ${seed} with ${birthday}`);

    const result = native.litelib_initialize_new_from_phrase(false, url, seed, parseInt(birthday));
    if (result.startsWith('Error')) {
      this.setState({ newWalletError: result });
    } else {
      this.setState({ walletScreen: 0 });
      this.getInfo();
    }
  };

  render() {
    const { loadingDone, currentStatus, walletScreen, newWalletError, seed, birthday } = this.state;

    // If still loading, show the status
    if (!loadingDone) {
      return (
        <div className={[cstyles.verticalflex, cstyles.center, styles.loadingcontainer].join(' ')}>
          {walletScreen === 0 && (
            <div>
              <div style={{ marginTop: '100px' }}>
                <img src={Logo} width="200px;" alt="Logo" />
              </div>
              <div>{currentStatus}</div>
            </div>
          )}

          {walletScreen === 1 && (
            <div>
              <div>
                <img src={Logo} width="200px;" alt="Logo" />
              </div>
              <div className={[cstyles.well, styles.newwalletcontainer].join(' ')}>
                <div className={cstyles.verticalflex}>
                  <div className={[cstyles.large, cstyles.highlight].join(' ')}>Create A New Wallet</div>
                  <div className={cstyles.padtopsmall}>
                    Creates a new wallet with a new randomly generated seed phrase. Please save the seed phrase
                    carefully, it&rsquo;s the only way to restore your wallet.
                  </div>
                  <div className={cstyles.margintoplarge}>
                    <button type="button" className={cstyles.primarybutton} onClick={this.createNewWallet}>
                      Create New
                    </button>
                  </div>
                </div>
                <div className={[cstyles.verticalflex, cstyles.margintoplarge].join(' ')}>
                  <div className={[cstyles.large, cstyles.highlight].join(' ')}>Restore Wallet From Seed</div>
                  <div className={cstyles.padtopsmall}>
                    If you already have a seed phrase, you can restore it to this wallet. This will rescan the
                    blockchain for all transactions from the seed phrase.
                  </div>
                  <div className={cstyles.margintoplarge}>
                    <button type="button" className={cstyles.primarybutton} onClick={this.restoreExistingWallet}>
                      Restore Existing
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {walletScreen === 2 && (
            <div>
              <div>
                <img src={Logo} width="200px;" alt="Logo" />
              </div>
              <div className={[cstyles.well, styles.newwalletcontainer].join(' ')}>
                <div className={cstyles.verticalflex}>
                  {newWalletError && (
                    <div>
                      <div className={[cstyles.large, cstyles.highlight].join(' ')}>Error Creating New Wallet</div>
                      <div className={cstyles.padtopsmall}>There was an error creating a new wallet</div>
                      <hr />
                      <div className={cstyles.padtopsmall}>{newWalletError}</div>
                      <hr />
                    </div>
                  )}

                  {!newWalletError && (
                    <div>
                      <div className={[cstyles.large, cstyles.highlight].join(' ')}>Your New Wallet</div>
                      <div className={cstyles.padtopsmall}>
                        This is your new wallet. Below is your seed phrase. PLEASE STORE IT CAREFULLY! The seed phrase
                        is the only way to recover your funds and transactions.
                      </div>
                      <hr />
                      <div className={cstyles.padtopsmall}>{seed}</div>
                      <hr />
                      <div className={cstyles.margintoplarge}>
                        <button type="button" className={cstyles.primarybutton} onClick={this.startNewWallet}>
                          Start Wallet
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {walletScreen === 3 && (
            <div>
              <div>
                <img src={Logo} width="200px;" alt="Logo" />
              </div>
              <div className={[cstyles.well, styles.newwalletcontainer].join(' ')}>
                <div className={cstyles.verticalflex}>
                  {newWalletError && (
                    <div>
                      <div className={[cstyles.large, cstyles.highlight].join(' ')}>Error Restoring Wallet</div>
                      <div className={cstyles.padtopsmall}>There was an error restoring your seed phrase</div>
                      <hr />
                      <div className={cstyles.padtopsmall}>{newWalletError}</div>
                      <hr />
                      <div className={cstyles.margintoplarge}>
                        <button type="button" className={cstyles.primarybutton} onClick={this.restoreWalletBack}>
                          Back
                        </button>
                      </div>
                    </div>
                  )}

                  {!newWalletError && (
                    <div>
                      <div className={[cstyles.large].join(' ')}>Please enter your seed phrase</div>
                      <TextareaAutosize className={cstyles.inputbox} value={seed} onChange={e => this.updateSeed(e)} />

                      <div className={[cstyles.large, cstyles.margintoplarge].join(' ')}>
                        Wallet Birthday. If you don&rsquo;t know this, it is OK to enter &lsquo;0&rsquo;
                      </div>
                      <input
                        type="number"
                        className={cstyles.inputbox}
                        value={birthday}
                        onChange={e => this.updateBirthday(e)}
                      />

                      <div className={cstyles.margintoplarge}>
                        <button type="button" className={cstyles.primarybutton} onClick={this.doRestoreWallet}>
                          Restore Wallet
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return <Redirect to={routes.DASHBOARD} />;
  }
}

export default withRouter(LoadingScreen);
