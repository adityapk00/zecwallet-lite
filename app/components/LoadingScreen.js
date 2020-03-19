/* eslint-disable radix */
/* eslint-disable max-classes-per-file */
import React, { Component } from 'react';
import { Redirect, withRouter } from 'react-router';
import TextareaAutosize from 'react-textarea-autosize';
import routes from '../constants/routes.json';
import { RPCConfig, Info } from './AppState';
import RPC from '../rpc';
import cstyles from './Common.module.css';
import styles from './LoadingScreen.module.css';
import Logo from '../assets/img/logobig.png';
import ScrollPane from './ScrollPane';



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

  walletScreen: number; // -1 -> warning 0 -> no wallet, load existing wallet 1 -> show option 2-> create new 3 -> restore existing

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
    this.walletScreen = -1;
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

  async componentDidMount() {
    const { rescanning } = this.props;

    if (rescanning) {
      this.runSyncStatusPoller();
    } else {
      const { walletScreen } = this.state;
      if (walletScreen !== -1) {
        this.doFirstTimeSetup();
      }
    }


  }

  closeWarning = () => {
    this.setState({ walletScreen: 0 });
    this.doFirstTimeSetup();
  };

  doFirstTimeSetup = async () => {
    // Try to load the light client
    const { url } = this.state;

    // Test to see if the wallet exists.
    const walletHex = RPC.readWalletFromLocalStorage();

    if (!walletHex) {
      // Show the wallet creation screen
      this.setState({ walletScreen: 1 });
    } else {
      const result = await RPC.doReadExistingWallet(walletHex);
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


  getInfo() {
    // Try getting the info.
    try {
      // Do a sync at start
      this.setState({ currentStatus: 'Syncing...' });

      // This method is async, so we'll just let it run without await-ing it.
      RPC.doSync();

      this.runSyncStatusPoller();
    } catch (err) {
      console.log("Error: ", err);
      // Not yet finished loading. So update the state, and setup the next refresh
      this.setState({ currentStatus: err });
    }
  }

  runSyncStatusPoller = async () => {
    const me = this;

    const { setRPCConfig, setInfo, setRescanning } = this.props;
    const { url } = this.state;

    const info = await RPC.getInfoObject();

    // And after a while, check the sync status.
    const poller = setInterval(async () => {
      const syncstatus = await RPC.doSyncStatus();
      const ss = JSON.parse(syncstatus);

      if (ss.syncing === 'false') {
        setInfo(info);

        // This will cause a redirect to the dashboard
        me.setState({ loadingDone: true });

        setRescanning(false);

        // Configure the RPC, which will setup the refresh
        const rpcConfig = new RPCConfig();
        rpcConfig.url = url;
        setRPCConfig(rpcConfig);

        // Save the wallet into local storage
        RPC.saveWalletToLocalStorage();

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

  createNewWallet = async () => {
    const result = await RPC.doNewWallet();

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

  doRestoreWallet = async () => {
    const { seed, birthday, url } = this.state;

    const result = await RPC.doRestoreWallet(seed, parseInt(birthday));

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
          {walletScreen === -1 && (
            <div>
              <div>
                <img src={Logo} width="200px;" alt="Logo" />
              </div>
              <ScrollPane offsetHeight={250}>
                <div className={[cstyles.well, styles.newwalletcontainer].join(' ')}>
                  <div className={cstyles.verticalflex}>
                    <div className={cstyles.flexspacebetween}>
                      <div>
                        <i className={['fas', 'fa-exclamation-triangle', 'fa-2x', cstyles.red].join(' ')} />
                      </div>
                      <div className={cstyles.xlarge}>Experimental</div>
                      <div>
                        <i className={['fas', 'fa-exclamation-triangle', 'fa-2x', cstyles.red].join(' ')} />
                      </div>
                    </div>
                    <div className={cstyles.margintoplarge}>
                      Zecwallet Web is experimental software. Your private keys are stored in the browser, and if your
                      browser is compromised, you&lsquo;ll likely lose your funds.
                    </div>
                    <div className={cstyles.margintoplarge}>
                      Please only use Zecwallet Web with small amounts of money, and don&lsquo;t use it on machines and
                      browsers you don&lsquo;t trust.
                    </div>
                    <div className={cstyles.margintoplarge}>
                      For a more stable Zcash Lightclient, please{' '}
                      <a href="http://www.zecwallet.co" target="_blank" className={cstyles.highlight}>
                        download Zecwallet Lite
                      </a>
                    </div>
                    <div className={cstyles.margintoplarge}>
                      <ul>
                        <li className={styles.circlebullet}>
                          Zecwallet Web has not been audited, so it likely has bugs and other vulnerabilities
                        </li>
                        <li className={styles.circlebullet}>
                          While you get blockchain privacy if you use z-addresses, using Zecwallet Web likely exposes your
                          IP address and might be used to link your on-chain transactions
                        </li>
                        <li className={styles.circlebullet}>
                          Zecwallet Web uses a custom fork of librustzcash that replaces some libraries with their
                          pure-rust implementations. This might cause unexpected bugs or security issues.
                        </li>
                      </ul>
                    </div>
                    <div className={[cstyles.buttoncontainer].join(' ')}>
                      <button type="button" className={cstyles.primarybutton} onClick={this.closeWarning}>
                        I Understand
                      </button>
                    </div>
                  </div>
                </div>
              </ScrollPane>
            </div>
          )}

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
