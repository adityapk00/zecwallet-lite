import Modal from "react-modal";
import React, { useEffect, useState } from "react";
import cstyles from "./Common.module.css";
import Utils from "../utils/utils";
const { ipcRenderer } = window.require("electron");

type ModalProps = {
  modalIsOpen: boolean;
  closeModal: () => void;
  openErrorModal: (title: string, body: string) => void;
};

export default function ServerSelectModal({ modalIsOpen, closeModal, openErrorModal }: ModalProps) {
  const [selected, setSelected] = useState("");
  const [custom, setCustom] = useState("");

  useEffect(() => {
    (async () => {
      const settings = await ipcRenderer.invoke("loadSettings");
      const server = settings?.lwd?.serveruri || "";
      setCustom(server);
    })();
  }, []);

  const switchServer = () => {
    let serveruri = selected;
    if (serveruri === "custom") {
      serveruri = custom;
    }

    ipcRenderer.invoke("saveSettings", { key: "lwd.serveruri", value: serveruri });

    closeModal();

    setTimeout(() => {
      openErrorModal("Restart Zecwallet Lite", "Please restart Zecwallet Lite to connect to the new server");
    }, 10);
  };

  const servers = [
    { name: "Zecwallet (Default)", uri: Utils.V3_LIGHTWALLETD },
    { name: "Zecwallet Zebra (Experimental)", uri: "https://zebra-lwd.zecwallet.co:9067" },
    { name: "Zcash Community", uri: "https://mainnet.lightwalletd.com:9067" },
  ];

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={cstyles.modal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={cstyles.marginbottomlarge} style={{ textAlign: "left", marginLeft: 10 }}>
          Switch LightwalletD server
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
