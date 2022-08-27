/* eslint-disable no-plusplus */
/* eslint-disable no-restricted-globals */
/* eslint-disable no-else-return */
/* eslint-disable radix */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react/prop-types */
/* eslint-disable max-classes-per-file */

import React, { PureComponent } from "react";
import Modal from "react-modal";
import TextareaAutosize from "react-textarea-autosize";
import { RouteComponentProps, withRouter } from "react-router-dom";
import styles from "./Send.module.css";
import cstyles from "./Common.module.css";
import {
  ToAddr,
  AddressBalance,
  SendPageState,
  Info,
  AddressBookEntry,
  TotalBalance,
  SendProgress,
  AddressDetail,
} from "./AppState";
import Utils from "../utils/utils";
import ScrollPane from "./ScrollPane";
import ArrowUpLight from "../assets/img/arrow_up_dark.png";
import { BalanceBlockHighlight } from "./BalanceBlocks";
import RPC from "../rpc";
import routes from "../constants/routes.json";
import { parseZcashURI, ZcashURITarget } from "../utils/uris";

type OptionType = {
  value: string;
  label: string;
};

const Spacer = () => {
  return <div style={{ marginTop: "24px" }} />;
};

type ToAddrBoxProps = {
  toaddr: ToAddr;
  zecPrice: number;
  updateToField: (
    id: number,
    address: React.ChangeEvent<HTMLInputElement> | null,
    amount: React.ChangeEvent<HTMLInputElement> | null,
    memo: React.ChangeEvent<HTMLTextAreaElement> | string | null
  ) => void;
  fromAddress: string;
  fromAmount: number;
  setSendButtonEnable: (sendButtonEnabled: boolean) => void;
  setMaxAmount: (id: number, total: number) => void;
  totalAmountAvailable: number;
};
const ToAddrBox = ({
  toaddr,
  zecPrice,
  updateToField,
  fromAddress,
  fromAmount,
  setMaxAmount,
  setSendButtonEnable,
  totalAmountAvailable,
}: ToAddrBoxProps) => {
  const isMemoDisabled = !(Utils.isZaddr(toaddr.to) || Utils.isUnified(toaddr.to));

  const addressIsValid =
    toaddr.to === "" || Utils.isUnified(toaddr.to) || Utils.isZaddr(toaddr.to) || Utils.isTransparent(toaddr.to);

  let amountError = null;
  if (toaddr.amount) {
    if (toaddr.amount < 0) {
      amountError = "Amount cannot be negative";
    }
    if (toaddr.amount > fromAmount) {
      amountError = "Amount Exceeds Balance";
    }
    if (toaddr.amount < 10 ** -8) {
      amountError = "Amount is too small";
    }
    const s = toaddr.amount.toString().split(".");
    if (s && s.length > 1 && s[1].length > 8) {
      amountError = "Too Many Decimals";
    }
  }

  if (isNaN(toaddr.amount)) {
    // Amount is empty
    amountError = "Amount cannot be empty";
  }

  let buttonstate = true;
  if (!addressIsValid || amountError || toaddr.to === "" || toaddr.amount === 0 || fromAmount === 0) {
    buttonstate = false;
  }

  setTimeout(() => {
    setSendButtonEnable(buttonstate);
  }, 10);

  const usdValue = Utils.getZecToUsdString(zecPrice, toaddr.amount);

  const addReplyTo = () => {
    if (toaddr.memo.endsWith(fromAddress)) {
      return;
    }

    if (fromAddress && toaddr.id) {
      updateToField(toaddr.id, null, null, `${toaddr.memo}\nReply-To:\n${fromAddress}`);
    }
  };

  return (
    <div>
      <div className={[cstyles.well, cstyles.verticalflex].join(" ")}>
        <div className={[cstyles.flexspacebetween].join(" ")}>
          <div className={cstyles.sublight}>To</div>
          <div className={cstyles.validationerror}>
            {addressIsValid ? (
              <i className={[cstyles.green, "fas", "fa-check"].join(" ")} />
            ) : (
              <span className={cstyles.red}>Invalid Address</span>
            )}
          </div>
        </div>
        <input
          type="text"
          placeholder="U | Z | T address"
          className={cstyles.inputbox}
          value={toaddr.to}
          onChange={(e) => updateToField(toaddr.id as number, e, null, null)}
        />
        <Spacer />
        <div className={[cstyles.flexspacebetween].join(" ")}>
          <div className={cstyles.sublight}>Amount</div>
          <div className={cstyles.validationerror}>
            {amountError ? <span className={cstyles.red}>{amountError}</span> : <span>{usdValue}</span>}
          </div>
        </div>
        <div className={[cstyles.flexspacebetween].join(" ")}>
          <input
            type="number"
            step="any"
            className={cstyles.inputbox}
            value={isNaN(toaddr.amount) ? "" : toaddr.amount}
            onChange={(e) => updateToField(toaddr.id as number, null, e, null)}
          />
          <img
            className={styles.toaddrbutton}
            src={ArrowUpLight}
            alt="Max"
            onClick={() => setMaxAmount(toaddr.id as number, totalAmountAvailable)}
          />
        </div>

        <Spacer />

        {isMemoDisabled && <div className={cstyles.sublight}>Memos only for sapling or UA addresses</div>}

        {!isMemoDisabled && (
          <div>
            <div className={[cstyles.flexspacebetween].join(" ")}>
              <div className={cstyles.sublight}>Memo</div>
              <div className={cstyles.validationerror}>{toaddr.memo.length}</div>
            </div>
            <TextareaAutosize
              className={cstyles.inputbox}
              value={toaddr.memo}
              disabled={isMemoDisabled}
              onChange={(e) => updateToField(toaddr.id as number, null, null, e)}
            />
            <input type="checkbox" onChange={(e) => e.target.checked && addReplyTo()} />
            Include Reply-To address
          </div>
        )}
        <Spacer />
      </div>
      <Spacer />
    </div>
  );
};

export type SendManyJson = {
  address: string;
  amount: number;
  memo?: string;
};

function getSendManyJSON(sendPageState: SendPageState): SendManyJson[] {
  const json = sendPageState.toaddrs.flatMap((to) => {
    const memo = to.memo || "";
    const amount = parseInt((to.amount * 10 ** 8).toFixed(0));

    if (memo === "") {
      return { address: to.to, amount, memo: undefined };
    } else if (memo.length <= 512) {
      return { address: to.to, amount, memo };
    } else {
      // If the memo is more than 512 bytes, then we split it into multiple transactions.
      // Each memo will be `(xx/yy)memo_part`. The prefix "(xx/yy)" is 7 bytes long, so
      // we'll split the memo into 512-7 = 505 bytes length
      const splits = Utils.utf16Split(memo, 505);
      const tos = [];

      // The first one contains all the tx value
      tos.push({ address: to.to, amount, memo: `(1/${splits.length})${splits[0]}` });

      for (let i = 1; i < splits.length; i++) {
        tos.push({ address: to.to, amount: 0, memo: `(${i + 1}/${splits.length})${splits[i]}` });
      }

      return tos;
    }
  });

  console.log("Sending:");
  console.log(json);

  return json;
}

type ConfirmModalToAddrProps = {
  toaddr: ToAddr;
  info: Info;
};
const ConfirmModalToAddr = ({ toaddr, info }: ConfirmModalToAddrProps) => {
  const { bigPart, smallPart } = Utils.splitZecAmountIntoBigSmall(toaddr.amount);

  const memo: string = toaddr.memo ? toaddr.memo : "";

  return (
    <div className={cstyles.well}>
      <div className={[cstyles.flexspacebetween, cstyles.margintopsmall].join(" ")}>
        <div className={[styles.confirmModalAddress].join(" ")}>
          {Utils.splitStringIntoChunks(toaddr.to, 6).join(" ")}
        </div>
        <div className={[cstyles.verticalflex, cstyles.right].join(" ")}>
          <div className={cstyles.large}>
            <div>
              <span>
                {info.currencyName} {bigPart}
              </span>
              <span className={[cstyles.small, styles.zecsmallpart].join(" ")}>{smallPart}</span>
            </div>
          </div>
          <div>{Utils.getZecToUsdString(info.zecPrice, toaddr.amount)}</div>
        </div>
      </div>
      <div className={[cstyles.sublight, cstyles.breakword, cstyles.memodiv].join(" ")}>{memo}</div>
    </div>
  );
};

// Internal because we're using withRouter just below
type ConfirmModalProps = {
  sendPageState: SendPageState;
  totalBalance: TotalBalance;
  info: Info;
  sendTransaction: (sendJson: SendManyJson[], setSendProgress: (p?: SendProgress) => void) => Promise<string>;
  clearToAddrs: () => void;
  closeModal: () => void;
  modalIsOpen: boolean;
  openErrorModal: (title: string, body: string) => void;
  openPasswordAndUnlockIfNeeded: (successCallback: () => void | Promise<void>) => void;
};

const ConfirmModalInternal: React.FC<RouteComponentProps & ConfirmModalProps> = ({
  sendPageState,
  totalBalance,
  info,
  sendTransaction,
  clearToAddrs,
  closeModal,
  modalIsOpen,
  openErrorModal,
  openPasswordAndUnlockIfNeeded,
  history,
}) => {
  const defaultFee = RPC.getDefaultFee();
  const sendingTotal = sendPageState.toaddrs.reduce((s, t) => s + t.amount, 0.0) + defaultFee;
  const { bigPart, smallPart } = Utils.splitZecAmountIntoBigSmall(sendingTotal);

  // Determine the tx privacy level
  let privacyLevel = "";
  // 1. If we're sending to a t-address, it is "transparent"
  const isToTransparent = sendPageState.toaddrs.map((to) => Utils.isTransparent(to.to)).reduce((p, c) => p || c, false);
  if (isToTransparent) {
    privacyLevel = "Transparent";
  } else {
    // 2. If we're sending to sapling or orchard, and don't have enough funds in the pool, it is "AmountsRevealed"
    const toSapling = sendPageState.toaddrs
      .map((to) => (Utils.isSapling(to.to) ? to.amount : 0))
      .reduce((s, c) => s + c, 0);
    const toOrchard = sendPageState.toaddrs
      .map((to) => (Utils.isUnified(to.to) ? to.amount : 0))
      .reduce((s, c) => s + c, 0);
    if (toSapling > totalBalance.spendableZ || toOrchard > totalBalance.uabalance) {
      privacyLevel = "AmountsRevealed";
    } else {
      // Else, it is a shielded transaction
      privacyLevel = "Shielded";
    }
  }

  const sendButton = () => {
    // First, close the confirm modal.
    closeModal();

    // This will be replaced by either a success TXID or error message that the user
    // has to close manually.
    openErrorModal("Computing Transaction", "Please wait...This could take a while");
    const setSendProgress = (progress?: SendProgress) => {
      if (progress && progress.sendInProgress) {
        openErrorModal(
          `Computing Transaction`,
          `Step ${progress.progress} of ${progress.total}. ETA ${progress.etaSeconds}s`
        );
      }
    };

    // Now, send the Tx in a timeout, so that the error modal above has a chance to display
    setTimeout(() => {
      openPasswordAndUnlockIfNeeded(() => {
        // Then send the Tx async
        (async () => {
          const sendJson = getSendManyJSON(sendPageState);
          let txid = "";

          try {
            txid = await sendTransaction(sendJson, setSendProgress);
            console.log(txid);

            openErrorModal(
              "Successfully Broadcast Transaction",
              `Transaction was successfully broadcast.\nTXID: ${txid}`
            );

            clearToAddrs();

            // Redirect to dashboard after
            history.push(routes.DASHBOARD);
          } catch (err) {
            // If there was an error, show the error modal
            openErrorModal("Error Sending Transaction", `${err}`);
          }
        })();
      });
    }, 10);
  };

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={styles.confirmModal}
      overlayClassName={styles.confirmOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={[cstyles.marginbottomlarge, cstyles.center].join(" ")}>Confirm Transaction</div>
        <div className={cstyles.flex}>
          <div
            className={[
              cstyles.highlight,
              cstyles.xlarge,
              cstyles.flexspacebetween,
              cstyles.well,
              cstyles.maxwidth,
            ].join(" ")}
          >
            <div>Total</div>
            <div className={[cstyles.right, cstyles.verticalflex].join(" ")}>
              <div>
                <span>
                  {info.currencyName} {bigPart}
                </span>
                <span className={[cstyles.small, styles.zecsmallpart].join(" ")}>{smallPart}</span>
              </div>

              <div className={cstyles.normal}>{Utils.getZecToUsdString(info.zecPrice, sendingTotal)}</div>
            </div>
          </div>
        </div>

        <ScrollPane offsetHeight={400}>
          <div className={[cstyles.verticalflex, cstyles.margintoplarge].join(" ")}>
            {sendPageState.toaddrs.map((t) => (
              <ConfirmModalToAddr key={t.to} toaddr={t} info={info} />
            ))}
          </div>
          <ConfirmModalToAddr toaddr={{ to: "Fee", amount: defaultFee, memo: "" }} info={info} />

          <div className={cstyles.well}>
            <div className={[cstyles.flexspacebetween, cstyles.margintoplarge].join(" ")}>
              <div className={[styles.confirmModalAddress].join(" ")}>Privacy Level</div>
              <div className={[cstyles.verticalflex, cstyles.right].join(" ")}>
                <div className={cstyles.large}>
                  <div>
                    <span>{privacyLevel}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollPane>

        <div className={cstyles.buttoncontainer}>
          <button type="button" className={cstyles.primarybutton} onClick={() => sendButton()}>
            Send
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
};

const ConfirmModal = withRouter(ConfirmModalInternal);

type Props = {
  addresses: AddressDetail[];
  totalBalance: TotalBalance;
  addressBook: AddressBookEntry[];
  sendPageState: SendPageState;
  setSendTo: (targets: ZcashURITarget[] | ZcashURITarget) => void;
  sendTransaction: (sendJson: SendManyJson[], setSendProgress: (p?: SendProgress) => void) => Promise<string>;
  setSendPageState: (sendPageState: SendPageState) => void;
  openErrorModal: (title: string, body: string) => void;
  info: Info;
  openPasswordAndUnlockIfNeeded: (successCallback: () => void) => void;
};

class SendState {
  modalIsOpen: boolean;

  sendButtonEnabled: boolean;

  constructor() {
    this.modalIsOpen = false;
    this.sendButtonEnabled = false;
  }
}

export default class Send extends PureComponent<Props, SendState> {
  constructor(props: Props) {
    super(props);

    this.state = new SendState();
  }

  addToAddr = () => {
    const { sendPageState, setSendPageState } = this.props;
    const newToAddrs = sendPageState.toaddrs.concat(new ToAddr(Utils.getNextToAddrID()));

    // Create the new state object
    const newState = new SendPageState();
    newState.fromaddr = sendPageState.fromaddr;
    newState.toaddrs = newToAddrs;

    setSendPageState(newState);
  };

  clearToAddrs = () => {
    const { sendPageState, setSendPageState } = this.props;
    const newToAddrs = [new ToAddr(Utils.getNextToAddrID())];

    // Create the new state object
    const newState = new SendPageState();
    newState.fromaddr = sendPageState.fromaddr;
    newState.toaddrs = newToAddrs;

    setSendPageState(newState);
  };

  changeFrom = (selectedOption: OptionType) => {
    const { sendPageState, setSendPageState } = this.props;

    // Create the new state object
    const newState = new SendPageState();
    newState.fromaddr = selectedOption.value;
    newState.toaddrs = sendPageState.toaddrs;

    setSendPageState(newState);
  };

  updateToField = (
    id: number,
    address: React.ChangeEvent<HTMLInputElement> | null,
    amount: React.ChangeEvent<HTMLInputElement> | null,
    memo: React.ChangeEvent<HTMLTextAreaElement> | string | null
  ) => {
    const { sendPageState, setSendPageState, setSendTo } = this.props;

    const newToAddrs = sendPageState.toaddrs.slice(0);
    // Find the correct toAddr
    const toAddr = newToAddrs.find((a) => a.id === id) as ToAddr;
    if (address) {
      // First, check if this is a URI
      // $FlowFixMe
      const parsedUri = parseZcashURI(address.target.value);
      if (Array.isArray(parsedUri)) {
        setSendTo(parsedUri);
        return;
      }

      toAddr.to = address.target.value.replace(/ /g, ""); // Remove spaces
    }

    if (amount) {
      // Check to see the new amount if valid
      // $FlowFixMe
      const newAmount = parseFloat(amount.target.value);
      if (newAmount < 0 || newAmount > 21 * 10 ** 6) {
        return;
      }
      // $FlowFixMe
      toAddr.amount = newAmount;
    }

    if (memo) {
      if (typeof memo === "string") {
        toAddr.memo = memo;
      } else {
        // $FlowFixMe
        toAddr.memo = memo.target.value;
      }
    }

    // Create the new state object
    const newState = new SendPageState();
    newState.fromaddr = sendPageState.fromaddr;
    newState.toaddrs = newToAddrs;

    setSendPageState(newState);
  };

  setMaxAmount = (id: number, total: number) => {
    const { sendPageState, setSendPageState } = this.props;

    const newToAddrs = sendPageState.toaddrs.slice(0);

    let totalOtherAmount: number = newToAddrs.filter((a) => a.id !== id).reduce((s, a) => s + a.amount, 0);

    // Add Fee
    totalOtherAmount += RPC.getDefaultFee();

    // Find the correct toAddr
    const toAddr = newToAddrs.find((a) => a.id === id) as ToAddr;
    toAddr.amount = total - totalOtherAmount;
    if (toAddr.amount < 0) toAddr.amount = 0;
    //toAddr.amount = Utils.maxPrecisionTrimmed(toAddr.amount);

    // Create the new state object
    const newState = new SendPageState();
    newState.fromaddr = sendPageState.fromaddr;
    newState.toaddrs = newToAddrs;

    setSendPageState(newState);
  };

  setSendButtonEnable = (sendButtonEnabled: boolean) => {
    this.setState({ sendButtonEnabled });
  };

  openModal = () => {
    this.setState({ modalIsOpen: true });
  };

  closeModal = () => {
    this.setState({ modalIsOpen: false });
  };

  getBalanceForAddress = (addr: string, addressesWithBalance: AddressBalance[]): number => {
    // Find the addr in addressesWithBalance
    const addressBalance = addressesWithBalance.find((ab) => ab.address === addr) as AddressBalance;

    if (!addressBalance) {
      return 0;
    }

    return addressBalance.balance;
  };

  getLabelForFromAddress = (addr: string, addressesWithBalance: AddressBalance[], currencyName: string) => {
    // Find the addr in addressesWithBalance
    const { addressBook } = this.props;
    const label = addressBook.find((ab) => ab.address === addr);
    const labelStr = label ? ` [ ${label.label} ]` : "";

    const balance = this.getBalanceForAddress(addr, addressesWithBalance);

    return `[ ${currencyName} ${balance.toString()} ]${labelStr} ${addr}`;
  };

  render() {
    const { modalIsOpen, sendButtonEnabled } = this.state;
    const {
      addresses,
      sendTransaction,
      sendPageState,
      info,
      totalBalance,
      openErrorModal,
      openPasswordAndUnlockIfNeeded,
    } = this.props;

    const totalAmountAvailable = totalBalance.transparent + totalBalance.spendableZ + totalBalance.uabalance;
    const fromaddr = addresses.find((a) => Utils.isSapling(a.address))?.address || "";

    // If there are unverified funds, then show a tooltip
    let tooltip: string = "";
    if (totalBalance.unverifiedZ) {
      tooltip = `Waiting for confirmation of ZEC ${totalBalance.unverifiedZ} with 5 blocks (approx 6 minutes)`;
    }

    return (
      <div>
        <div className={[cstyles.xlarge, cstyles.padall, cstyles.center].join(" ")}>Send</div>

        <div className={styles.sendcontainer}>
          <div className={[cstyles.well, cstyles.balancebox, cstyles.containermargin].join(" ")}>
            <BalanceBlockHighlight
              topLabel="Spendable Funds"
              zecValue={totalAmountAvailable}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalAmountAvailable)}
              currencyName={info.currencyName}
              tooltip={tooltip}
            />
            <BalanceBlockHighlight
              topLabel="All Funds"
              zecValue={totalBalance.total}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.total)}
              currencyName={info.currencyName}
            />
          </div>

          <ScrollPane className={cstyles.containermargin} offsetHeight={320}>
            {sendPageState.toaddrs.map((toaddr) => {
              return (
                <ToAddrBox
                  key={toaddr.id}
                  toaddr={toaddr}
                  zecPrice={info.zecPrice}
                  updateToField={this.updateToField}
                  fromAddress={fromaddr}
                  fromAmount={totalAmountAvailable}
                  setMaxAmount={this.setMaxAmount}
                  setSendButtonEnable={this.setSendButtonEnable}
                  totalAmountAvailable={totalAmountAvailable}
                />
              );
            })}
            <div style={{ textAlign: "right" }}>
              <button type="button" onClick={this.addToAddr}>
                <i className={["fas", "fa-plus"].join(" ")} />
              </button>
            </div>
          </ScrollPane>

          <div className={cstyles.center}>
            <button
              type="button"
              disabled={!sendButtonEnabled}
              className={cstyles.primarybutton}
              onClick={this.openModal}
            >
              Send
            </button>
            <button type="button" className={cstyles.primarybutton} onClick={this.clearToAddrs}>
              Cancel
            </button>
          </div>

          <ConfirmModal
            sendPageState={sendPageState}
            totalBalance={totalBalance}
            info={info}
            sendTransaction={sendTransaction}
            openErrorModal={openErrorModal}
            closeModal={this.closeModal}
            modalIsOpen={modalIsOpen}
            clearToAddrs={this.clearToAddrs}
            openPasswordAndUnlockIfNeeded={openPasswordAndUnlockIfNeeded}
          />
        </div>
      </div>
    );
  }
}
