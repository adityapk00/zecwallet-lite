/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { Info, RPCConfig } from "./AppState";
import cstyles from "./Common.module.css";
import styles from "./Zcashd.module.css";
import ScrollPane from "./ScrollPane";
import Heart from "../assets/img/zcashdlogo.gif";

type DetailLineProps = {
  label: string;
  value: string;
};
const DetailLine = ({ label, value }: DetailLineProps) => {
  return (
    <div className={styles.detailline}>
      <div className={[cstyles.sublight].join(" ")}>{label} :</div>
      <div className={cstyles.breakword}>{value}</div>
    </div>
  );
};

type Props = {
  info: Info;
  refresh: () => void;
  rpcConfig: RPCConfig;
  openServerSelectModal: () => void;
};

export default class Zcashd extends Component<Props> {
  render() {
    const { info, rpcConfig, refresh, openServerSelectModal } = this.props;
    const { url } = rpcConfig;

    if (!info || !info.latestBlock) {
      return (
        <div>
          <div className={[cstyles.verticalflex, cstyles.center].join(" ")}>
            <div style={{ marginTop: "100px" }}>
              <i className={["fas", "fa-times-circle"].join(" ")} style={{ fontSize: "96px", color: "red" }} />
            </div>
            <div className={cstyles.margintoplarge}>Not Connected</div>
          </div>
        </div>
      );
      // eslint-disable-next-line no-else-return
    } else {
      let height = `${info.latestBlock}`;
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
                  <DetailLine label="Version" value={info.version} />
                  <DetailLine label="Node" value={info.zcashdVersion} />
                  <DetailLine label="Lightwallet Server" value={url} />
                  <DetailLine label="Network" value={info.testnet ? "Testnet" : "Mainnet"} />
                  <DetailLine label="Block Height" value={height} />
                  <DetailLine label="ZEC Price" value={`USD ${info.zecPrice.toFixed(2)}`} />
                </div>
              </div>

              <div className={cstyles.buttoncontainer}>
                <button className={cstyles.primarybutton} type="button" onClick={openServerSelectModal}>
                  Switch LightwalletD Server
                </button>
                <button className={cstyles.primarybutton} type="button" onClick={refresh}>
                  Refresh All Data
                </button>
              </div>

              <div className={cstyles.margintoplarge} />
            </ScrollPane>
          </div>
        </div>
      );
    }
  }
}
