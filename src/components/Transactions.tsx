/* eslint-disable react/prop-types */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, { Component } from "react";
import Modal from "react-modal";
import dateformat from "dateformat";
import { RouteComponentProps, withRouter } from "react-router";
import { BalanceBlockHighlight } from "./BalanceBlocks";
import styles from "./Transactions.module.css";
import cstyles from "./Common.module.css";
import { Transaction, Info, AddressBookEntry, TxDetail } from "./AppState";
import ScrollPane from "./ScrollPane";
import Utils from "../utils/utils";
import { ZcashURITarget } from "../utils/uris";
import routes from "../constants/routes.json";
import RPC from "../rpc";

const { shell } = window.require("electron");

type TxModalInternalProps = {
  modalIsOpen: boolean;
  closeModal: () => void;
  tx?: Transaction;
  currencyName: string;
  setSendTo: (targets: ZcashURITarget | ZcashURITarget[]) => void;
};

const TxModalInternal: React.FC<RouteComponentProps & TxModalInternalProps> = ({
  modalIsOpen,
  tx,
  closeModal,
  currencyName,
  setSendTo,
  history,
}) => {
  let txid = "";
  let type = "";
  let typeIcon = "";
  let typeColor = "";
  let confirmations = 0;
  let detailedTxns: TxDetail[] = [];
  let amount = 0;
  let datePart = "";
  let timePart = "";
  let price = 0;
  let priceString = "";

  if (tx) {
    txid = tx.txid;
    type = tx.type;
    if (tx.type === "receive") {
      typeIcon = "fa-arrow-circle-down";
      typeColor = "green";
    } else {
      typeIcon = "fa-arrow-circle-up";
      typeColor = "red";
    }

    datePart = dateformat(tx.time * 1000, "mmm dd, yyyy");
    timePart = dateformat(tx.time * 1000, "hh:MM tt");

    confirmations = tx.confirmations;
    detailedTxns = tx.detailedTxns;
    amount = Math.abs(tx.amount);
    price = tx.zecPrice;
    if (price) {
      priceString = `USD ${price.toFixed(2)} / ZEC`;
    }
  }

  const openTxid = () => {
    if (currencyName === "TAZ") {
      shell.openExternal(`https://chain.so/tx/ZECTEST/${txid}`);
    } else {
      shell.openExternal(`https://zcha.in/transactions/${txid}`);
    }
  };

  const doReply = (address: string) => {
    const defaultFee = RPC.getDefaultFee();
    setSendTo(new ZcashURITarget(address, defaultFee));
    closeModal();

    history.push(routes.SEND);
  };

  const totalAmounts =
    tx && tx.detailedTxns ? tx.detailedTxns.reduce((s, t) => Math.abs(parseFloat(t.amount)) + s, 0) : 0;
  const fees = tx ? Math.abs(tx.amount) - totalAmounts : 0;

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={styles.txmodal}
      overlayClassName={styles.txmodalOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={[cstyles.marginbottomlarge, cstyles.center].join(" ")}>Transaction Status</div>

        <div className={[cstyles.center].join(" ")}>
          <i className={["fas", typeIcon].join(" ")} style={{ fontSize: "96px", color: typeColor }} />
        </div>

        <div className={[cstyles.center].join(" ")}>
          {type}
          <BalanceBlockHighlight
            zecValue={amount}
            usdValue={Utils.getZecToUsdString(price, Math.abs(amount))}
            currencyName={currencyName}
          />
        </div>

        <div className={[cstyles.flexspacebetween].join(" ")}>
          <div>
            <div className={[cstyles.sublight].join(" ")}>Time</div>
            <div>
              {datePart} {timePart}
            </div>
          </div>

          {type === "sent" && (
            <div>
              <div className={[cstyles.sublight].join(" ")}>Fees</div>
              <div>ZEC {Utils.maxPrecisionTrimmed(fees)}</div>
            </div>
          )}

          <div>
            <div className={[cstyles.sublight].join(" ")}>Confirmations</div>
            <div>{confirmations}</div>
          </div>
        </div>

        <div className={cstyles.margintoplarge} />

        <div className={[cstyles.flexspacebetween].join(" ")}>
          <div>
            <div className={[cstyles.sublight].join(" ")}>TXID</div>
            <div>{txid}</div>
          </div>

          <div className={cstyles.primarybutton} onClick={openTxid}>
            View TXID &nbsp;
            <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
          </div>
        </div>

        <div className={cstyles.margintoplarge} />
        <hr />

        {detailedTxns.map((txdetail) => {
          const { bigPart, smallPart } = Utils.splitZecAmountIntoBigSmall(Math.abs(parseFloat(txdetail.amount)));

          let { address } = txdetail;
          const { memo } = txdetail;

          if (!address) {
            address = "(Shielded)";
          }

          let replyTo: string = "";
          if (tx && tx.type === "receive" && memo) {
            const split = memo.split(/[ :\n\r\t]+/);
            if (split && split.length > 0 && Utils.isSapling(split[split.length - 1])) {
              replyTo = split[split.length - 1];
            }
          }

          return (
            <div key={address} className={cstyles.verticalflex}>
              <div className={[cstyles.sublight].join(" ")}>Address</div>
              <div>{Utils.splitStringIntoChunks(address, 6).join(" ")}</div>

              <div className={cstyles.margintoplarge} />

              <div className={[cstyles.sublight].join(" ")}>Amount</div>
              <div className={[cstyles.flexspacebetween].join(" ")}>
                <div className={[cstyles.verticalflex].join(" ")}>
                  <div>
                    <span>
                      {currencyName} {bigPart}
                    </span>
                    <span className={[cstyles.small, cstyles.zecsmallpart].join(" ")}>{smallPart}</span>
                  </div>
                  <div>{Utils.getZecToUsdString(price, Math.abs(amount))}</div>
                </div>
                <div className={[cstyles.verticalflex, cstyles.margintoplarge].join(" ")}>
                  <div className={[cstyles.sublight].join(" ")}>{priceString}</div>
                </div>
              </div>

              <div className={cstyles.margintoplarge} />

              {memo && (
                <div>
                  <div className={[cstyles.sublight].join(" ")}>Memo</div>
                  <div className={[cstyles.flexspacebetween].join(" ")}>
                    <div className={[cstyles.memodiv].join(" ")}>{memo}</div>
                    {replyTo && (
                      <div className={cstyles.primarybutton} onClick={() => doReply(replyTo)}>
                        Reply
                      </div>
                    )}
                  </div>
                </div>
              )}

              <hr />
            </div>
          );
        })}

        <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

const TxModal = withRouter(TxModalInternal);

type TxItemBlockProps = {
  transaction: Transaction;
  currencyName: string;
  zecPrice: number;
  txClicked: (tx: Transaction) => void;
  addressBookMap: Map<string, string>;
};
const TxItemBlock = ({ transaction, currencyName, zecPrice, txClicked, addressBookMap }: TxItemBlockProps) => {
  const txDate = new Date(transaction.time * 1000);
  const datePart = dateformat(txDate, "mmm dd, yyyy");
  const timePart = dateformat(txDate, "hh:MM tt");

  return (
    <div>
      <div className={[cstyles.small, cstyles.sublight, styles.txdate].join(" ")}>{datePart}</div>
      <div
        className={[cstyles.well, styles.txbox].join(" ")}
        onClick={() => {
          txClicked(transaction);
        }}
      >
        <div className={styles.txtype}>
          <div>{transaction.type}</div>
          <div className={[cstyles.padtopsmall, cstyles.sublight].join(" ")}>{timePart}</div>
        </div>
        <div className={styles.txaddressamount}>
          {transaction.detailedTxns.map((txdetail) => {
            const { bigPart, smallPart } = Utils.splitZecAmountIntoBigSmall(Math.abs(parseFloat(txdetail.amount)));

            let { address } = txdetail;
            const { memo } = txdetail;

            if (!address) {
              address = "(Shielded)";
            }

            const label = addressBookMap.get(address) || "";

            return (
              <div key={address} className={cstyles.padtopsmall}>
                <div className={styles.txaddress}>
                  <div className={cstyles.highlight}>{label}</div>
                  <div>{Utils.splitStringIntoChunks(address, 6).join(" ")}</div>
                  <div
                    className={[
                      cstyles.small,
                      cstyles.sublight,
                      cstyles.padtopsmall,
                      cstyles.memodiv,
                      styles.txmemo,
                    ].join(" ")}
                  >
                    {memo}
                  </div>
                </div>
                <div className={[styles.txamount, cstyles.right].join(" ")}>
                  <div>
                    <span>
                      {currencyName} {bigPart}
                    </span>
                    <span className={[cstyles.small, cstyles.zecsmallpart].join(" ")}>{smallPart}</span>
                  </div>
                  <div className={[cstyles.sublight, cstyles.small, cstyles.padtopsmall].join(" ")}>
                    {Utils.getZecToUsdString(zecPrice, Math.abs(parseFloat(txdetail.amount)))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

type Props = {
  transactions: Transaction[];
  addressBook: AddressBookEntry[];
  info: Info;
  setSendTo: (targets: ZcashURITarget[] | ZcashURITarget) => void;
};

type State = {
  clickedTx?: Transaction;
  modalIsOpen: boolean;
  numTxnsToShow: number;
};

export default class Transactions extends Component<Props, State> {
  constructor(props: Props) {
    super(props);

    this.state = { clickedTx: undefined, modalIsOpen: false, numTxnsToShow: 100 };
  }

  txClicked = (tx: Transaction) => {
    // Show the modal
    if (!tx) return;
    this.setState({ clickedTx: tx, modalIsOpen: true });
  };

  closeModal = () => {
    this.setState({ clickedTx: undefined, modalIsOpen: false });
  };

  show100MoreTxns = () => {
    const { numTxnsToShow } = this.state;

    this.setState({ numTxnsToShow: numTxnsToShow + 100 });
  };

  render() {
    const { transactions, info, addressBook, setSendTo } = this.props;
    const { clickedTx, modalIsOpen, numTxnsToShow } = this.state;

    const isLoadMoreEnabled = transactions && numTxnsToShow < transactions.length;

    const addressBookMap: Map<string, string> = addressBook.reduce((m, obj) => {
      m.set(obj.address, obj.label);
      return m;
    }, new Map());

    return (
      <div>
        <div className={[cstyles.xlarge, cstyles.padall, cstyles.center].join(" ")}>Transactions</div>

        {/* Change the hardcoded height */}
        <ScrollPane offsetHeight={100}>
          {
            /* If no transactions, show the "loading..." text */
            !transactions && <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>Loading...</div>
          }

          {transactions && transactions.length === 0 && (
            <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>No Transactions Yet</div>
          )}
          {transactions &&
            transactions.slice(0, numTxnsToShow).map((t) => {
              const key = t.type + t.txid + (t.position || "");
              return (
                <TxItemBlock
                  key={key}
                  transaction={t}
                  currencyName={info.currencyName}
                  zecPrice={info.zecPrice}
                  txClicked={this.txClicked}
                  addressBookMap={addressBookMap}
                />
              );
            })}

          {isLoadMoreEnabled && (
            <div
              style={{ marginLeft: "45%", width: "100px" }}
              className={cstyles.primarybutton}
              onClick={this.show100MoreTxns}
            >
              Load more
            </div>
          )}
        </ScrollPane>

        <TxModal
          modalIsOpen={modalIsOpen}
          tx={clickedTx}
          closeModal={this.closeModal}
          currencyName={info.currencyName}
          setSendTo={setSendTo}
        />
      </div>
    );
  }
}
