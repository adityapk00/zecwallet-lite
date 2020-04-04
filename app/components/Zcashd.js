// @flow
/* eslint-disable react/prop-types */
import React, { Component } from 'react';
import type { Element } from 'react';
import { Info, RPCConfig } from './AppState';
import cstyles from './Common.module.css';
import styles from './Zcashd.module.css';
import ScrollPane from './ScrollPane';
import Utils from '../utils/utils';
import Heart from '../assets/img/zcashdlogo.gif';
import routes from '../constants/routes.json';
import PropTypes from 'prop-types';
import RPC from '../rpc';
import { withRouter } from 'react-router';

const DetailLine = ({ label, value }) => {
  return (
    <div className={styles.detailline}>
      <div className={[cstyles.sublight].join(' ')}>{label} :</div>
      <div className={cstyles.breakword}>{value}</div>
    </div>
  );
};

type Props = {
  history: PropTypes.object.isRequired,
  info: Info,
  refresh: PropTypes.object.isRequired,
  setInfo: Info => void,
  setRescanning: boolean => void,
  setSendTo: (address: string, amount: number | null, memo: string | null) => void,
  openErrorModal: (title: string, body: string | Element<'div'> | Element<'span'>) => void,
  openPassword: (boolean, (string) => void | Promise<void>, () => void, string | null | Element<"div">) => void,
  openPasswordAndUnlockIfNeeded: (successCallback: () => void | Promise<void>) => void,
  rpcConfig: RPCConfig
};

class ZcashdInternal extends Component<Props> {
  aboutMenu = () => {
    const { openErrorModal } = this.props;

    openErrorModal(
      'Zecwallet Web',
      <div className={cstyles.verticalflex}>
        <div className={cstyles.margintoplarge}>ZecwalletWeb v0.1</div>
        <div className={cstyles.margintoplarge}>Built with React & Rust. Copyright (c) 2018-2020, Aditya Kulkarni.</div>
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
  };

  donateMenu = () => {
    const { info, setSendTo, history } = this.props;

    setSendTo(
      Utils.getDonationAddress(info.testnet),
      Utils.getDefaultDonationAmount(info.testnet),
      Utils.getDefaultDonationMemo(info.testnet)
    );

    history.push(routes.SEND);
  };

  exportMenu  = () => {
    const { openErrorModal, openPasswordAndUnlockIfNeeded } = this.props;

    openPasswordAndUnlockIfNeeded(async () => {
      const seed = await RPC.fetchSeed();

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
  };

  rescanMenu = () => {
    const { setInfo, setRescanning, history } = this.props;

    // To rescan, we reset the wallet loading
    // So set info the default, and redirect to the loading screen
    RPC.doRescan();

    // Set the rescanning global state to true
    setRescanning(true);

    // Reset the info object, it will be refetched
    setInfo(new Info());

    history.push(routes.LOADING);
  };

  componentDidMount() {
    const { info, history } = this.props;
    if (!(info && info.version)) {
      history.push(routes.LOADING);
    }
  };

  render() {
    const { info, rpcConfig, refresh } = this.props;
    const { url } = rpcConfig;

    if (!info || !info.version) {
      return (
        <div>
          <div className={[cstyles.verticalflex, cstyles.center].join(' ')}>
            <div style={{ marginTop: '100px' }}>
              <i className={['fas', 'fa-times-circle'].join(' ')} style={{ fontSize: '96px', color: 'red' }} />
            </div>
            <div className={cstyles.margintoplarge}>Not Connected</div>
          </div>
        </div>
      );
      // eslint-disable-next-line no-else-return
    } else {
      let height = info.latestBlock;
      if (info.verificationProgress < 0.9999) {
        const progress = (info.verificationProgress * 100).toFixed(1);
        height = `${height} (${progress}%)`;
      }

      return (
        <div>
          <div className={styles.container}>
            <ScrollPane offsetHeight={0}>
              <div className={styles.imgcontainer}>
                <img src={Heart} alt="heart" />
              </div>

              <div className={styles.detailcontainer}>
                <div className={styles.detaillines}>
                  <DetailLine label="version" value={info.version} />
                  <DetailLine label="Lightwallet Server" value={url} />
                  <DetailLine label="Network" value={info.testnet ? 'Testnet' : 'Mainnet'} />
                  <DetailLine label="Block Height" value={height} />
                </div>
              </div>

              <div className={cstyles.buttoncontainer}>
                <button className={cstyles.primarybutton} type="button" onClick={refresh}>
                  Refresh All Data
                </button>
              </div>

              <div className={cstyles.margintoplarge} />

              <div className={cstyles.buttoncontainer}>
              <button className={cstyles.primarybutton} type="button" onClick={this.aboutMenu}>
                About
              </button>

              <button className={cstyles.primarybutton} type="button" onClick={this.donateMenu}>
                Donate
              </button>

              <button className={cstyles.primarybutton} type="button" onClick={this.exportMenu}>
                Export Wallet Seed
              </button>

              <button className={cstyles.primarybutton} type="button" onClick={this.rescanMenu}>
                Rescan
              </button>
            </div>

            </ScrollPane>
          </div>
        </div>
      );
    }
  }
}

// $FlowFixMe
export default withRouter(ZcashdInternal);
