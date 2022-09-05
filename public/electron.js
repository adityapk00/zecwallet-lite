const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const isDev = require("electron-is-dev");
const path = require("path");
const settings = require("electron-settings");

class MenuBuilder {
  mainWindow;

  constructor(mainWindow) {
    this.mainWindow = mainWindow;
  }

  buildMenu() {
    const template = process.platform === "darwin" ? this.buildDarwinTemplate() : this.buildDefaultTemplate();

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    const selectionMenu = Menu.buildFromTemplate([{ role: "copy" }, { type: "separator" }, { role: "selectall" }]);

    const inputMenu = Menu.buildFromTemplate([
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { type: "separator" },
      { role: "selectall" },
    ]);

    this.mainWindow.webContents.on("context-menu", (e, props) => {
      const { selectionText, isEditable } = props;
      if (isEditable) {
        inputMenu.popup(this.mainWindow);
      } else if (selectionText && selectionText.trim() !== "") {
        selectionMenu.popup(this.mainWindow);
      } else if (process.env.NODE_ENV === "development" || process.env.DEBUG_PROD === "true") {
        const { x, y } = props;

        Menu.buildFromTemplate([
          {
            label: "Inspect element",
            click: () => {
              this.mainWindow.inspectElement(x, y);
            },
          },
        ]).popup(this.mainWindow);
      }
    });

    return menu;
  }

  buildDarwinTemplate() {
    const { mainWindow } = this;

    const subMenuAbout = {
      label: "Zecwallet Lite",
      submenu: [
        {
          label: "About Zecwallet Lite",
          selector: "orderFrontStandardAboutPanel:",
          click: () => {
            mainWindow.webContents.send("about");
          },
        },
        { type: "separator" },
        { label: "Services", submenu: [] },
        { type: "separator" },
        {
          label: "Hide Zecwallet Lite",
          accelerator: "Command+H",
          selector: "hide:",
        },
        {
          label: "Hide Others",
          accelerator: "Command+Shift+H",
          selector: "hideOtherApplications:",
        },
        { label: "Show All", selector: "unhideAllApplications:" },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "Command+Q",
          click: () => {
            app.quit();
          },
        },
      ],
    };
    const subMenuEdit = {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "Command+Z", selector: "undo:" },
        { label: "Redo", accelerator: "Shift+Command+Z", selector: "redo:" },
        { type: "separator" },
        { label: "Cut", accelerator: "Command+X", selector: "cut:" },
        { label: "Copy", accelerator: "Command+C", selector: "copy:" },
        { label: "Paste", accelerator: "Command+V", selector: "paste:" },
        {
          label: "Select All",
          accelerator: "Command+A",
          selector: "selectAll:",
        },
      ],
    };
    const subMenuViewDev = {
      label: "Wallet",
      submenu: [
        {
          label: "Wallet Seed",
          click: () => {
            mainWindow.webContents.send("seed");
          },
        },
        {
          label: "&Import Private Keys",
          click: () => {
            mainWindow.webContents.send("import");
          },
        },
        {
          label: "&Export All Private Keys",
          click: () => {
            mainWindow.webContents.send("exportall");
          },
        },
        { type: "separator" },
        {
          label: "&Pay URI",
          accelerator: "Ctrl+P",
          click: () => {
            mainWindow.webContents.send("payuri");
          },
        },
        {
          label: "Export All &Transactions",
          click: () => {
            mainWindow.webContents.send("exportalltx");
          },
        },
        {
          label: "&Rescan",
          click: () => {
            mainWindow.webContents.send("rescan");
          },
        },
        {
          label: "View Lightwalletd Info",
          click: () => {
            this.mainWindow.webContents.send("zcashd");
          },
        },
        { type: "separator" },
        {
          label: "Remove Wallet Encryption",
          click: () => {
            this.mainWindow.webContents.send("decrypt");
          },
        },
        {
          label: "Unlock",
          click: () => {
            this.mainWindow.webContents.send("unlock");
          },
        },
        // { type: 'separator' },
        // {
        //   label: 'Toggle Developer Tools',
        //   accelerator: 'Alt+Command+I',
        //   click: () => {
        //     this.mainWindow.toggleDevTools();
        //   }
        // }
      ],
    };
    const subMenuViewProd = {
      label: "Wallet",
      submenu: [
        {
          label: "Wallet Seed",
          click: () => {
            mainWindow.webContents.send("seed");
          },
        },
        {
          label: "&Import Private Keys",
          click: () => {
            mainWindow.webContents.send("import");
          },
        },
        {
          label: "&Export All Private Keys",
          click: () => {
            mainWindow.webContents.send("exportall");
          },
        },
        { type: "separator" },
        {
          label: "&Pay URI",
          accelerator: "Ctrl+P",
          click: () => {
            mainWindow.webContents.send("payuri");
          },
        },
        {
          label: "Export All &Transactions",
          click: () => {
            mainWindow.webContents.send("exportalltx");
          },
        },
        {
          label: "&Rescan",
          click: () => {
            mainWindow.webContents.send("rescan");
          },
        },
        {
          label: "Wallet Settings",
          click: () => {
            this.mainWindow.webContents.send("walletSettings");
          },
        },
        {
          label: "Server info",
          click: () => {
            this.mainWindow.webContents.send("zcashd");
          },
        },
        { type: "separator" },
        {
          label: "Remove Wallet Encryption",
          click: () => {
            this.mainWindow.webContents.send("decrypt");
          },
        },
        {
          label: "Unlock",
          click: () => {
            this.mainWindow.webContents.send("unlock");
          },
        },
      ],
    };
    const subMenuWindow = {
      label: "Window",
      submenu: [
        {
          label: "Minimize",
          accelerator: "Command+M",
          selector: "performMiniaturize:",
        },
        { label: "Close", accelerator: "Command+W", selector: "performClose:" },
        { type: "separator" },
        { label: "Bring All to Front", selector: "arrangeInFront:" },
      ],
    };
    const subMenuHelp = {
      label: "Help",
      submenu: [
        {
          label: "Donate",
          click() {
            mainWindow.webContents.send("donate");
          },
        },
        {
          label: "Check github.com for updates",
          click() {
            shell.openExternal("https://github.com/adityapk00/zecwallet-lite/releases");
          },
        },
        {
          label: "File a bug...",
          click() {
            shell.openExternal("https://github.com/adityapk00/zecwallet-lite/issues");
          },
        },
      ],
    };

    const subMenuView = process.env.NODE_ENV === "development" ? subMenuViewDev : subMenuViewProd;

    return [subMenuAbout, subMenuEdit, subMenuView, subMenuWindow, subMenuHelp];
  }

  buildDefaultTemplate() {
    const { mainWindow } = this;

    const templateDefault = [
      {
        label: "&File",
        submenu: [
          {
            label: "&Pay URI",
            accelerator: "Ctrl+P",
            click: () => {
              mainWindow.webContents.send("payuri");
            },
          },
          {
            label: "&Close",
            accelerator: "Ctrl+W",
            click: () => {
              this.mainWindow.close();
            },
          },
        ],
      },
      {
        label: "&Wallet",
        submenu: [
          {
            label: "Wallet Seed",
            click: () => {
              mainWindow.webContents.send("seed");
            },
          },
          {
            label: "&Import Private Keys",
            click: () => {
              mainWindow.webContents.send("import");
            },
          },
          {
            label: "&Export All Private Keys",
            click: () => {
              mainWindow.webContents.send("exportall");
            },
          },
          { type: "separator" },
          {
            label: "Export All &Transactions",
            click: () => {
              mainWindow.webContents.send("exportalltx");
            },
          },
          {
            label: "&Rescan",
            click: () => {
              mainWindow.webContents.send("rescan");
            },
          },
          {
            label: "Wallet Settings",
            click: () => {
              this.mainWindow.webContents.send("walletSettings");
            },
          },
          {
            label: "Server info",
            click: () => {
              this.mainWindow.webContents.send("zcashd");
            },
          },
          // {
          //   label: 'Devtools',
          //   click: () => {
          //     mainWindow.webContents.openDevTools();
          //   }
          // },
          { type: "separator" },
          {
            label: "Remove Wallet Encryption",
            click: () => {
              this.mainWindow.webContents.send("decrypt");
            },
          },
          {
            label: "Unlock",
            click: () => {
              this.mainWindow.webContents.send("unlock");
            },
          },
        ],
      },
      {
        label: "Help",
        submenu: [
          {
            label: "About Zecwallet Lite",
            click: () => {
              mainWindow.webContents.send("about");
            },
          },
          {
            label: "Donate",
            click() {
              mainWindow.webContents.send("donate");
            },
          },
          {
            label: "Check github.com for updates",
            click() {
              shell.openExternal("https://github.com/adityapk00/zecwallet-lite/releases");
            },
          },
          {
            label: "File a bug...",
            click() {
              shell.openExternal("https://github.com/adityapk00/zecwallet-lite/issues");
            },
          },
        ],
      },
    ];

    return templateDefault;
  }
}

// Conditionally include the dev tools installer to load React Dev Tools
let installExtension, REACT_DEVELOPER_TOOLS;

if (isDev) {
  const devTools = require("electron-devtools-installer");
  installExtension = devTools.default;
  REACT_DEVELOPER_TOOLS = devTools.REACT_DEVELOPER_TOOLS;
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1300,
    height: 728,
    minHeight: 500,
    minWidth: 1100,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      nodeIntegrationInWorker: true,
      enableRemoteModule: true,
    },
  });

  // Load from localhost if in development
  // Otherwise load index.html file
  mainWindow.loadURL(isDev ? "http://localhost:3000" : `file://${path.join(__dirname, "../build/index.html")}`);

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  let waitingForClose = false;
  let proceedToClose = false;

  ipcMain.handle("loadSettings", async () => {
    return await settings.get("all");
  });

  ipcMain.handle("saveSettings", async (event, kv) => {
    return await settings.set(`all.${kv.key}`, kv.value);
  });

  mainWindow.on("close", (event) => {
    // If we are clear to close, then return and allow everything to close
    if (proceedToClose) {
      return;
    }

    // If we're already waiting for close, then don't allow another close event to actually close the window
    if (waitingForClose) {
      console.log("Waiting for close... Timeout in 10s");
      event.preventDefault();
      return;
    }

    waitingForClose = true;
    event.preventDefault();

    ipcMain.on("appquitdone", () => {
      waitingForClose = false;
      proceedToClose = true;
      app.quit();
    });

    mainWindow.webContents.send("appquitting");

    // Failsafe, timeout after 5 seconds
    setTimeout(() => {
      waitingForClose = false;
      proceedToClose = true;
      console.log("Timeout, quitting");

      app.quit();
    }, 5 * 1000);
  });

  // Open DevTools if in dev mode
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.commandLine.appendSwitch("in-process-gpu");

// Create a new browser window by invoking the createWindow
// function once the Electron application is initialized.
// Install REACT_DEVELOPER_TOOLS as well if isDev
app.whenReady().then(() => {
  if (isDev) {
    installExtension(REACT_DEVELOPER_TOOLS)
      .then((name) => console.log(`Added Extension:  ${name}`))
      .catch((error) => console.log(`An error occurred: , ${error}`));
  }

  createWindow();
});

// Add a new listener that tries to quit the application when
// it no longer has any open windows. This listener is a no-op
// on macOS due to the operating system's window management behavior.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Add a new listener that creates a new browser window only if
// when the application has no visible windows after being activated.
// For example, after launching the application for the first time,
// or re-launching the already running application.
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// The code above has been adapted from a starter example in the Electron docs:
// https://www.electronjs.org/docs/tutorial/quick-start#create-the-main-script-file
