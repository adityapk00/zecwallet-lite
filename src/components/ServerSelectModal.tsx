// @flow
import Modal from "react-modal";
import React, { useState } from "react";
import cstyles from "./Common.module.css";
import Utils from "../utils/utils";

type ModalProps = {
  modalIsOpen: boolean;
  closeModal: () => void;
  openErrorModal: (title: string, body: string) => void;
};

export default function ServerSelectModal({ modalIsOpen, closeModal, openErrorModal }: ModalProps) {
  //const store = new Store<Record<string, string>>();
  //const currentServer = store.get('lightd/serveruri', '');
  const currentServer = "";

  const [selected, setSelected] = useState("");
  const [custom, setCustom] = useState(currentServer);

  const switchServer = () => {
    let serveruri = selected;
    if (serveruri === "custom") {
      serveruri = custom;
    }

    //store.set('lightd/serveruri', serveruri);

    closeModal();

    setTimeout(() => {
      openErrorModal("Restart Zecwallet Lite", "Please restart Zecwallet Lite to connect to the new server");
    }, 10);
  };

  const servers = [
    { name: "Zecwallet (Default)", uri: Utils.V3_LIGHTWALLETD },
    { name: "Zecwallet (Backup)", uri: Utils.V2_LIGHTWALLETD },
    { name: "ZcashFR (Community)", uri: "https://lightd-main.zcashfr.io:443" },
  ];

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={cstyles.modal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={cstyles.marginbottomlarge} style={{ textAlign: "center" }}>
          Select LightwalletD server
        </div>

        <div className={[cstyles.well, cstyles.verticalflex].join(" ")}>
          {servers.map((s) => (
            <div style={{ margin: "10px" }} key={s.uri}>
              <input type="radio" name="server" value={s.uri} onClick={(e) => setSelected(e.currentTarget.value)} />
              {`${s.name} - ${s.uri}`}
            </div>
          ))}

          <div style={{ margin: "10px" }}>
            <input type="radio" name="server" value="custom" onClick={(e) => setSelected(e.currentTarget.value)} />
            Custom
            <input
              type="text"
              className={cstyles.inputbox}
              style={{ marginLeft: "20px" }}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          </div>
        </div>

        <div className={cstyles.buttoncontainer}>
          <button type="button" className={cstyles.primarybutton} onClick={switchServer} disabled={selected === ""}>
            Switch Server
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
