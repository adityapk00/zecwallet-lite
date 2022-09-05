import Modal from "react-modal";
import React, { useEffect, useState } from "react";
import cstyles from "./Common.module.css";
import { WalletSettings } from "./AppState";

type ModalProps = {
  walletSettings: WalletSettings;
  modalIsOpen: boolean;
  closeModal: () => void;
  setWalletSpamFilterThreshold: (threshold: number) => void;
};

export default function WalletSettingsModal({
  walletSettings,
  modalIsOpen,
  closeModal,
  setWalletSpamFilterThreshold,
}: ModalProps) {
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (walletSettings.spam_filter_threshold <= 0) {
      setSelected("no_filter");
    } else {
      setSelected("filter");
    }
  }, [walletSettings]);

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={cstyles.modal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={cstyles.marginbottomlarge} style={{ textAlign: "left", marginLeft: 10 }}>
          Filter out Spam Transactions
        </div>

        <div className={[cstyles.well, cstyles.verticalflex].join(" ")}>
          <div style={{ margin: "10px" }}>
            <input
              type="radio"
              name="filter"
              defaultChecked={selected === "filter"}
              value="filter"
              onClick={(e) => setWalletSpamFilterThreshold(50)}
            />
            Don't scan spammy transactions
          </div>

          <div style={{ margin: "10px" }}>
            <input
              type="radio"
              name="filter"
              value="no_filter"
              defaultChecked={selected === "no_filter"}
              onClick={(e) => setWalletSpamFilterThreshold(0)}
            />
            Scan all transactions
          </div>
        </div>

        <div className={cstyles.buttoncontainer}>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Save
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
