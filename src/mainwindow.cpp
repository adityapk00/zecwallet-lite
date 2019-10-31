#include "mainwindow.h"
#include "addressbook.h"
#include "viewalladdresses.h"
#include "ui_encryption.h"
#include "ui_mainwindow.h"
#include "ui_mobileappconnector.h"
#include "ui_addressbook.h"
#include "ui_privkey.h"
#include "ui_about.h"
#include "ui_settings.h"
#include "ui_viewalladdresses.h"
#include "controller.h"
#include "balancestablemodel.h"
#include "settings.h"
#include "version.h"
#include "connection.h"
#include "requestdialog.h"
#include "websockets.h"

using json = nlohmann::json;

MainWindow::MainWindow(QWidget *parent) :
    QMainWindow(parent),
    ui(new Ui::MainWindow)
{
	// Include css    
    QString theme_name;
    try
    {
       theme_name = Settings::getInstance()->get_theme_name();
    }
    catch (...)
    {
        theme_name = "default";
    }

    this->slot_change_theme(theme_name);

	    
    ui->setupUi(this);
    logger = new Logger(this, QDir(QStandardPaths::writableLocation(QStandardPaths::AppDataLocation)).filePath("zec-qt-wallet.log"));

    // Status Bar
    setupStatusBar();
    
    // Settings editor 
    setupSettingsModal();

    // Set up exit action
    QObject::connect(ui->actionExit, &QAction::triggered, this, &MainWindow::close);

    // Set up donate action
    QObject::connect(ui->actionDonate, &QAction::triggered, this, &MainWindow::donate);

    // File a bug
    QObject::connect(ui->actionFile_a_bug, &QAction::triggered, [=]() {
        QDesktopServices::openUrl(QUrl("https://github.com/adityapk00/zecwallet-lite/issues/new"));
    });

    // Set up check for updates action
    QObject::connect(ui->actionCheck_for_Updates, &QAction::triggered, [=] () {
        // Silent is false, so show notification even if no update was found
        rpc->checkForUpdate(false);
    });

    // Recurring payments 
    QObject::connect(ui->action_Recurring_Payments, &QAction::triggered, [=]() {
        Recurring::getInstance()->showRecurringDialog(this);
    });

    // Request zcash
    QObject::connect(ui->actionRequest_zcash, &QAction::triggered, [=]() {
        RequestDialog::showRequestZcash(this);
    });

    // Pay Zcash URI
    QObject::connect(ui->actionPay_URI, &QAction::triggered, [=] () {
        payZcashURI();
    });

    // Wallet encryption
    QObject::connect(ui->actionEncrypt_Wallet, &QAction::triggered, [=]() {
        encryptWallet();
    });

    QObject::connect(ui->actionRemove_Wallet_Encryption, &QAction::triggered, [=]() {
        removeWalletEncryption();
    });

    // Export All Private Keys
    QObject::connect(ui->actionExport_All_Private_Keys, &QAction::triggered, this, &MainWindow::exportAllKeys);

    // Backup wallet.dat
    QObject::connect(ui->actionExport_Seed, &QAction::triggered, this, &MainWindow::exportSeed);

    // Export transactions
    QObject::connect(ui->actionExport_transactions, &QAction::triggered, this, &MainWindow::exportTransactions);

    // Connect mobile app
    QObject::connect(ui->actionConnect_Mobile_App, &QAction::triggered, this, [=] () {
        if (rpc->getConnection() == nullptr)
            return;

        AppDataServer::getInstance()->connectAppDialog(this);
    });

    // Address Book
    QObject::connect(ui->action_Address_Book, &QAction::triggered, this, &MainWindow::addressBook);

    // Set up about action
    QObject::connect(ui->actionAbout, &QAction::triggered, [=] () {
        QDialog aboutDialog(this);
        Ui_about about;
        about.setupUi(&aboutDialog);
        Settings::saveRestore(&aboutDialog);

        QString version    = QString("Version ") % QString(APP_VERSION) % " (" % QString(__DATE__) % ")";
        about.versionLabel->setText(version);
        
        aboutDialog.exec();
    });

    // Initialize to the balances tab
    ui->tabWidget->setCurrentIndex(0);


    // The zcashd tab is hidden by default, and only later added in if the embedded zcashd is started
    zcashdtab = ui->tabWidget->widget(4);
    ui->tabWidget->removeTab(4);

    setupSendTab();
    setupTransactionsTab();
    setupReceiveTab();
    setupBalancesTab();
    setupZcashdTab();

    rpc = new Controller(this);

    restoreSavedStates();

    if (AppDataServer::getInstance()->isAppConnected()) {
        auto ads = AppDataServer::getInstance();

        QString wormholecode = "";
        if (ads->getAllowInternetConnection())
            wormholecode = ads->getWormholeCode(ads->getSecretHex());

        createWebsocket(wormholecode);
    }
}
 
void MainWindow::createWebsocket(QString wormholecode) {
    qDebug() << "Listening for app connections on port 8237";
    // Create the websocket server, for listening to direct connections
    wsserver = new WSServer(8237, false, this);

    if (!wormholecode.isEmpty()) {
        // Connect to the wormhole service
        wormhole = new WormholeClient(this, wormholecode);
    }
}

void MainWindow::stopWebsocket() {
    delete wsserver;
    wsserver = nullptr;

    delete wormhole;
    wormhole = nullptr;

    qDebug() << "Websockets for app connections shut down";
}

bool MainWindow::isWebsocketListening() {
    return wsserver != nullptr;
}

void MainWindow::replaceWormholeClient(WormholeClient* newClient) {
    delete wormhole;
    wormhole = newClient;
}

void MainWindow::restoreSavedStates() {
    QSettings s;
    restoreGeometry(s.value("geometry").toByteArray());

    auto balance_geom = s.value("baltablegeom");
    if (balance_geom == QVariant()) {
        ui->balancesTable->setColumnWidth(0, 500);
    } else {
        ui->balancesTable->horizontalHeader()->restoreState(balance_geom.toByteArray());
    }

    auto tx_geom = s.value("tratablegeom");
    if (tx_geom == QVariant()) {
        ui->transactionsTable->setColumnWidth(1, 500);
    } else {
        ui->transactionsTable->horizontalHeader()->restoreState(tx_geom.toByteArray());
    }
}

void MainWindow::doClose() {
    closeEvent(nullptr);
}

void MainWindow::closeEvent(QCloseEvent* event) {
    QSettings s;

    s.setValue("geometry", saveGeometry());
    s.setValue("baltablegeom", ui->balancesTable->horizontalHeader()->saveState());
    s.setValue("tratablegeom", ui->transactionsTable->horizontalHeader()->saveState());

    s.sync();

    // Let the RPC know to shut down any running service.
    rpc->shutdownZcashd();

    // Bubble up
    if (event)
        QMainWindow::closeEvent(event);
}


void MainWindow::encryptWallet() {
    // Check if wallet is already encrypted
    auto encStatus = rpc->getModel()->getEncryptionStatus();
    if (encStatus.first) {
        QMessageBox::information(this, tr("Wallet is already encrypted"), 
                    tr("Your wallet is already encrypted with a password.\nPlease use 'Remove Wallet Encryption' if you want to remove the wallet encryption."),
                    QMessageBox::Ok
                );
        return;
    }

    QDialog d(this);
    Ui_encryptionDialog ed;
    ed.setupUi(&d);

    // Handle edits on the password box
    auto fnPasswordEdited = [=](const QString&) {
        // Enable the OK button if the passwords match.
        if (!ed.txtPassword->text().isEmpty() && 
                ed.txtPassword->text() == ed.txtConfirmPassword->text()) {
            ed.lblPasswordMatch->setText("");
            ed.buttonBox->button(QDialogButtonBox::Ok)->setEnabled(true);
        } else {
            ed.lblPasswordMatch->setText(tr("Passwords don't match"));
            ed.buttonBox->button(QDialogButtonBox::Ok)->setEnabled(false);
        }
    };

    QObject::connect(ed.txtConfirmPassword, &QLineEdit::textChanged, fnPasswordEdited);
    QObject::connect(ed.txtPassword, &QLineEdit::textChanged, fnPasswordEdited);

    ed.txtPassword->setText("");
    ed.buttonBox->button(QDialogButtonBox::Ok)->setEnabled(false);

    auto fnShowError = [=](QString title, const json& res) {
        QMessageBox::critical(this, title,
            tr("Error was:\n") + QString::fromStdString(res.dump()),
            QMessageBox::Ok
        );
    };

    if (d.exec() == QDialog::Accepted) {
        rpc->encryptWallet(ed.txtPassword->text(), [=](json res) {
            if (isJsonResultSuccess(res)) {
                // Save the wallet
                rpc->saveWallet([=] (json reply) {
                    if (isJsonResultSuccess(reply)) {
                        QMessageBox::information(this, tr("Wallet Encrypted"), 
                            tr("Your wallet was successfully encrypted! The password will be needed to send funds or export private keys."),
                            QMessageBox::Ok
                        );
                    } else {
                        fnShowError(tr("Wallet Encryption Failed"), reply);
                    }
                });

                // And then refresh the UI
                rpc->refresh(true);
            } else {
                fnShowError(tr("Wallet Encryption Failed"), res);
            }
        });
    }
}

void MainWindow::removeWalletEncryption() {
    // Check if wallet is already encrypted
    auto encStatus = rpc->getModel()->getEncryptionStatus();
    if (!encStatus.first) {
        QMessageBox::information(this, tr("Wallet is not encrypted"), 
                    tr("Your wallet is not encrypted with a password."),
                    QMessageBox::Ok
                );
        return;
    }

    bool ok;
    QString password = QInputDialog::getText(this, tr("Wallet Password"), 
                            tr("Please enter your wallet password"), QLineEdit::Password, "", &ok);

    // If cancel was pressed, just return
    if (!ok) {
        return;
    }

    if (password.isEmpty()) {
        QMessageBox::critical(this, tr("Wallet Decryption Failed"),
            tr("Please enter a password to decrypt your wallet!"),
            QMessageBox::Ok
        );
        return;
    }

    rpc->removeWalletEncryption(password, [=] (json res) {
        if (isJsonResultSuccess(res)) {
                // Save the wallet
                rpc->saveWallet([=] (json reply) {
                    if(isJsonResultSuccess(reply)) {
                        QMessageBox::information(this, tr("Wallet Encryption Removed"), 
                            tr("Your wallet was successfully decrypted! You will no longer need a password to send funds or export private keys."),
                            QMessageBox::Ok
                        );
                    } else {
                        QMessageBox::critical(this, tr("Wallet Decryption Failed"),
                            QString::fromStdString(reply["error"].get<json::string_t>()),
                            QMessageBox::Ok
                        );
                    }
                });

                // And then refresh the UI
                rpc->refresh(true);
            } else {
                QMessageBox::critical(this, tr("Wallet Decryption Failed"),
                    QString::fromStdString(res["error"].get<json::string_t>()),
                    QMessageBox::Ok
                );
            }
    });            
}

void MainWindow::setupStatusBar() {
    // Status Bar
    loadingLabel = new QLabel();
    loadingMovie = new QMovie(":/icons/res/loading.gif");
    loadingMovie->setScaledSize(QSize(32, 16));
    loadingMovie->start();
    loadingLabel->setAttribute(Qt::WA_NoSystemBackground);
    loadingLabel->setMovie(loadingMovie);

    ui->statusBar->addPermanentWidget(loadingLabel);
    loadingLabel->setVisible(false);

    // Custom status bar menu
    ui->statusBar->setContextMenuPolicy(Qt::CustomContextMenu);
    QObject::connect(ui->statusBar, &QStatusBar::customContextMenuRequested, [=](QPoint pos) {
        auto msg = ui->statusBar->currentMessage();
        QMenu menu(this);

        if (!msg.isEmpty() && msg.startsWith(Settings::txidStatusMessage)) {
            auto txid = msg.split(":")[1].trimmed();
            menu.addAction(tr("Copy txid"), [=]() {
                QGuiApplication::clipboard()->setText(txid);
            });
            menu.addAction(tr("View tx on block explorer"), [=]() {
                Settings::openTxInExplorer(txid);
            });
        }

        menu.addAction(tr("Refresh"), [=]() {
            rpc->refresh(true);
        });
        QPoint gpos(mapToGlobal(pos).x(), mapToGlobal(pos).y() + this->height() - ui->statusBar->height());
        menu.exec(gpos);
    });

    statusLabel = new QLabel();
    ui->statusBar->addPermanentWidget(statusLabel);

    statusIcon = new QLabel();
    ui->statusBar->addPermanentWidget(statusIcon);
}

void MainWindow::setupSettingsModal() {    
    // Set up File -> Settings action
    QObject::connect(ui->actionSettings, &QAction::triggered, [=]() {
        QDialog settingsDialog(this);
        Ui_Settings settings;
        settings.setupUi(&settingsDialog);
        Settings::saveRestore(&settingsDialog);

        // Setup theme combo
        int theme_index = settings.comboBoxTheme->findText(Settings::getInstance()->get_theme_name(), Qt::MatchExactly);
        settings.comboBoxTheme->setCurrentIndex(theme_index);

        QObject::connect(settings.comboBoxTheme, &QComboBox::currentTextChanged, [=] (QString theme_name) {
            this->slot_change_theme(theme_name);
            // Tell the user to restart
            QMessageBox::information(this, tr("Restart"), tr("Please restart ZecWallet to have the theme apply"), QMessageBox::Ok);
        });

        // Check for updates
        settings.chkCheckUpdates->setChecked(Settings::getInstance()->getCheckForUpdates());

        // Fetch prices
        settings.chkFetchPrices->setChecked(Settings::getInstance()->getAllowFetchPrices());
        
        // Load current values into the dialog        
        auto conf = Settings::getInstance()->getSettings();
        settings.txtServer->setText(conf.server);

        // Connection tab by default
        settings.tabWidget->setCurrentIndex(0);

        // Enable the troubleshooting options only if using embedded zcashd
        if (!rpc->isEmbedded()) {
            settings.chkRescan->setEnabled(false);
            settings.chkRescan->setToolTip(tr("You're using an external zcashd. Please restart zcashd with -rescan"));
        }

        if (settingsDialog.exec() == QDialog::Accepted) {
            // Check for updates
            Settings::getInstance()->setCheckForUpdates(settings.chkCheckUpdates->isChecked());

            // Allow fetching prices
            Settings::getInstance()->setAllowFetchPrices(settings.chkFetchPrices->isChecked());

            // Save the server
            Settings::getInstance()->saveSettings(settings.txtServer->text().trimmed());

            if (false /* connection needs reloading?*/) {
                // Save settings
                Settings::getInstance()->saveSettings(settings.txtServer->text());
                
                auto cl = new ConnectionLoader(this, rpc);
                cl->loadConnection();
            }
        }
    });
}

void MainWindow::addressBook() {
    // Check to see if there is a target.
    QRegExp re("Address[0-9]+", Qt::CaseInsensitive);
    for (auto target: ui->sendToWidgets->findChildren<QLineEdit *>(re)) {
        if (target->hasFocus()) {
            AddressBook::open(this, target);
            return;
        }
    };

    // If there was no target, then just run with no target.
    AddressBook::open(this);
}


void MainWindow::donate() {
    // Set up a donation to me :)
    clearSendForm();

    ui->Address1->setText(Settings::getDonationAddr());
    ui->Address1->setCursorPosition(0);
    ui->Amount1->setText("0.01");
    ui->MemoTxt1->setText(tr("Thanks for supporting ZecWallet!"));

    ui->statusBar->showMessage(tr("Donate 0.01 ") % Settings::getTokenName() % tr(" to support ZecWallet"));

    // And switch to the send tab.
    ui->tabWidget->setCurrentIndex(1);
}

// void MainWindow::doImport(QList<QString>* keys) {
//     if (rpc->getConnection() == nullptr) {
//         // No connection, just return
//         return;
//     }

//     if (keys->isEmpty()) {
//         delete keys;
//         ui->statusBar->showMessage(tr("Private key import rescan finished"));
//         return;
//     }

//     // Pop the first key
//     QString key = keys->first();
//     keys->pop_front();
//     bool rescan = keys->isEmpty();

//     if (key.startsWith("SK") ||
//         key.startsWith("secret")) { // Z key
//         rpc->importZPrivKey(key, rescan, [=] (auto) { this->doImport(keys); });                   
//     } else {
//         rpc->importTPrivKey(key, rescan, [=] (auto) { this->doImport(keys); });
//     }
// }


// Callback invoked when the RPC has finished loading all the balances, and the UI 
// is now ready to send transactions.
void MainWindow::balancesReady() {
    // First-time check
    if (uiPaymentsReady)
        return;

    uiPaymentsReady = true;
    qDebug() << "Payment UI now ready!";

    // There is a pending URI payment (from the command line, or from a secondary instance),
    // process it.
    if (!pendingURIPayment.isEmpty()) {
        qDebug() << "Paying zcash URI";
        payZcashURI(pendingURIPayment);
        pendingURIPayment = "";
    }

    // Execute any pending Recurring payments
    Recurring::getInstance()->processPending(this);
}

// Event filter for MacOS specific handling of payment URIs
bool MainWindow::eventFilter(QObject *object, QEvent *event) {
    if (event->type() == QEvent::FileOpen) {
        QFileOpenEvent *fileEvent = static_cast<QFileOpenEvent*>(event);
        if (!fileEvent->url().isEmpty())
            payZcashURI(fileEvent->url().toString());

        return true;
    }

    return QObject::eventFilter(object, event);
}


// Pay the Zcash URI by showing a confirmation window. If the URI parameter is empty, the UI
// will prompt for one. If the myAddr is empty, then the default from address is used to send
// the transaction.
void MainWindow::payZcashURI(QString uri, QString myAddr) {
    // If the Payments UI is not ready (i.e, all balances have not loaded), defer the payment URI
    if (!isPaymentsReady()) {
        qDebug() << "Payment UI not ready, waiting for UI to pay URI";
        pendingURIPayment = uri;
        return;
    }

    // If there was no URI passed, ask the user for one.
    if (uri.isEmpty()) {
        uri = QInputDialog::getText(this, tr("Paste Zcash URI"),
            "Zcash URI" + QString(" ").repeated(180));
    }

    // If there's no URI, just exit
    if (uri.isEmpty())
        return;

    // Extract the address
    qDebug() << "Received URI " << uri;
    PaymentURI paymentInfo = Settings::parseURI(uri);
    if (!paymentInfo.error.isEmpty()) {
        QMessageBox::critical(this, tr("Error paying zcash URI"), 
                tr("URI should be of the form 'zcash:<addr>?amt=x&memo=y") + "\n" + paymentInfo.error);
        return;
    }

    // Now, set the fields on the send tab
    clearSendForm();

    ui->Address1->setText(paymentInfo.addr);
    ui->Address1->setCursorPosition(0);
    ui->Amount1->setText(paymentInfo.amt);
    ui->MemoTxt1->setText(paymentInfo.memo);

    // And switch to the send tab.
    ui->tabWidget->setCurrentIndex(1);
    raise();

    // And click the send button if the amount is > 0, to validate everything. If everything is OK, it will show the confirm box
    // else, show the error message;
    if (paymentInfo.amt > 0) {
        sendButton();
    }
}


// void MainWindow::importPrivKey() {
//     QDialog d(this);
//     Ui_PrivKey pui;
//     pui.setupUi(&d);
//     Settings::saveRestore(&d);

//     pui.buttonBox->button(QDialogButtonBox::Save)->setVisible(false);
//     pui.helpLbl->setText(QString() %
//                         tr("Please paste your private keys (z-Addr or t-Addr) here, one per line") % ".\n" %
//                         tr("The keys will be imported into your connected zcashd node"));  

//     if (d.exec() == QDialog::Accepted && !pui.privKeyTxt->toPlainText().trimmed().isEmpty()) {
//         auto rawkeys = pui.privKeyTxt->toPlainText().trimmed().split("\n");

//         QList<QString> keysTmp;
//         // Filter out all the empty keys.
//         std::copy_if(rawkeys.begin(), rawkeys.end(), std::back_inserter(keysTmp), [=] (auto key) {
//             return !key.startsWith("#") && !key.trimmed().isEmpty();
//         });

//         auto keys = new QList<QString>();
//         std::transform(keysTmp.begin(), keysTmp.end(), std::back_inserter(*keys), [=](auto key) {
//             return key.trimmed().split(" ")[0];
//         });

//         // Special case. 
//         // Sometimes, when importing from a paperwallet or such, the key is split by newlines, and might have 
//         // been pasted like that. So check to see if the whole thing is one big private key
//         if (Settings::getInstance()->isValidSaplingPrivateKey(keys->join(""))) {
//             auto multiline = keys;
//             keys = new QList<QString>();
//             keys->append(multiline->join(""));
//             delete multiline;
//         }

//         // Start the import. The function takes ownership of keys
//         QTimer::singleShot(1, [=]() {doImport(keys);});

//         // Show the dialog that keys will be imported. 
//         QMessageBox::information(this,
//             "Imported", tr("The keys were imported. It may take several minutes to rescan the blockchain. Until then, functionality may be limited"),
//             QMessageBox::Ok);
//     }
// }

/** 
 * Export transaction history into a CSV file
 */
void MainWindow::exportTransactions() {
    // First, get the export file name
    QString exportName = "zcash-transactions-" + QDateTime::currentDateTime().toString("yyyyMMdd") + ".csv";

    QUrl csvName = QFileDialog::getSaveFileUrl(this, 
            tr("Export transactions"), exportName, "CSV file (*.csv)");

    if (csvName.isEmpty())
        return;

    if (!rpc->getTransactionsModel()->exportToCsv(csvName.toLocalFile())) {
        QMessageBox::critical(this, tr("Error"), 
            tr("Error exporting transactions, file was not saved"), QMessageBox::Ok);
    }
} 

/**
 * Export the seed phrase.
*/
void MainWindow::exportSeed() {
    if (!rpc->getConnection())
        return;

    

    rpc->fetchSeed([=](json reply) {
        if (isJsonError(reply)) {
            return;
        }
        
        QDialog d(this);
        Ui_PrivKey pui;
        pui.setupUi(&d);
        
        // Make the window big by default
        auto ps = this->geometry();
        QMargins margin = QMargins() + 50;
        d.setGeometry(ps.marginsRemoved(margin));

        Settings::saveRestore(&d);

        pui.privKeyTxt->setReadOnly(true);
        pui.privKeyTxt->setLineWrapMode(QPlainTextEdit::LineWrapMode::NoWrap);
        pui.privKeyTxt->setPlainText(QString::fromStdString(reply.dump()));
        
        pui.helpLbl->setText(tr("This is your wallet seed. Please back it up carefully and safely."));

        // Wire up save button
        QObject::connect(pui.buttonBox->button(QDialogButtonBox::Save), &QPushButton::clicked, [=] () {
            QString fileName = QFileDialog::getSaveFileName(this, tr("Save File"),
                            "zcash-seed.txt");
            QFile file(fileName);
            if (!file.open(QIODevice::WriteOnly)) {
                QMessageBox::information(this, tr("Unable to open file"), file.errorString());
                return;
            }        
            QTextStream out(&file);
            out << pui.privKeyTxt->toPlainText();
        });

        pui.buttonBox->button(QDialogButtonBox::Save)->setEnabled(true);
        
        d.exec();
    });
}

void MainWindow::exportAllKeys() {
    exportKeys("");
}

void MainWindow::exportKeys(QString addr) {
    if (!rpc->getConnection())
        return;

    bool allKeys = addr.isEmpty() ? true : false;

    auto fnUpdateUIWithKeys = [=](json reply) {
        if (isJsonError(reply)) {
            return;                
        }

        if (reply.is_discarded() || !reply.is_array()) {
            QMessageBox::critical(this, tr("Error getting private keys"),
                tr("Error loading private keys: ") + QString::fromStdString(reply.dump()),
                QMessageBox::Ok);
            return;
        }
            
        QDialog d(this);
        Ui_PrivKey pui;
        pui.setupUi(&d);
        
        // Make the window big by default
        auto ps = this->geometry();
        QMargins margin = QMargins() + 50;
        d.setGeometry(ps.marginsRemoved(margin));

        Settings::saveRestore(&d);

        pui.privKeyTxt->setReadOnly(true);
        pui.privKeyTxt->setLineWrapMode(QPlainTextEdit::LineWrapMode::NoWrap);

        if (allKeys)
            pui.helpLbl->setText(tr("These are all the private keys for all the addresses in your wallet"));
        else
            pui.helpLbl->setText(tr("Private key for ") + addr);


        // Wire up save button
        QObject::connect(pui.buttonBox->button(QDialogButtonBox::Save), &QPushButton::clicked, [=] () {
            QString fileName = QFileDialog::getSaveFileName(this, tr("Save File"),
                            allKeys ? "zcash-all-privatekeys.txt" : "zcash-privatekey.txt");
            QFile file(fileName);
            if (!file.open(QIODevice::WriteOnly)) {
                QMessageBox::information(this, tr("Unable to open file"), file.errorString());
                return;
            }        
            QTextStream out(&file);
            out << pui.privKeyTxt->toPlainText();
        });

        QString allKeysTxt;
        for (auto i : reply.get<json::array_t>()) {
            allKeysTxt = allKeysTxt % QString::fromStdString(i["private_key"]) % " # addr=" % QString::fromStdString(i["address"]) % "\n";
        }

        pui.privKeyTxt->setPlainText(allKeysTxt);
        pui.buttonBox->button(QDialogButtonBox::Save)->setEnabled(true);

        d.exec();
    };

    if (allKeys) {
        rpc->fetchAllPrivKeys(fnUpdateUIWithKeys);
    }
    else { 
        rpc->fetchPrivKey(addr, fnUpdateUIWithKeys);                
    }    
}

void MainWindow::setupBalancesTab() {
    ui->unconfirmedWarning->setVisible(false);
    ui->lblSyncWarning->setVisible(false);
    ui->lblSyncWarningReceive->setVisible(false);


    // Setup context menu on balances tab
    ui->balancesTable->setContextMenuPolicy(Qt::CustomContextMenu);
    QObject::connect(ui->balancesTable, &QTableView::customContextMenuRequested, [=] (QPoint pos) {
        QModelIndex index = ui->balancesTable->indexAt(pos);
        if (index.row() < 0) return;

        index = index.sibling(index.row(), 0);
        auto addr = AddressBook::addressFromAddressLabel(
                            ui->balancesTable->model()->data(index).toString());

        QMenu menu(this);

        menu.addAction(tr("Copy address"), [=] () {
            QClipboard *clipboard = QGuiApplication::clipboard();
            clipboard->setText(addr);            
            ui->statusBar->showMessage(tr("Copied to clipboard"), 3 * 1000);
        });

        menu.addAction(tr("Get private key"), [=] () {
            this->exportKeys(addr);
        });


        if (Settings::isTAddress(addr)) {
            menu.addAction(tr("View on block explorer"), [=] () {
                Settings::openAddressInExplorer(addr);
            });
        }

        menu.exec(ui->balancesTable->viewport()->mapToGlobal(pos));            
    });
}

void MainWindow::setupZcashdTab() {    
    ui->zcashdlogo->setBasePixmap(QPixmap(":/img/res/zcashdlogo.gif"));
}

void MainWindow::setupTransactionsTab() {
    // Double click opens up memo if one exists
    QObject::connect(ui->transactionsTable, &QTableView::doubleClicked, [=] (auto index) {
        auto txModel = dynamic_cast<TxTableModel *>(ui->transactionsTable->model());
        QString memo = txModel->getMemo(index.row());

        if (!memo.isEmpty()) {
            QMessageBox mb(QMessageBox::Information, tr("Memo"), memo, QMessageBox::Ok, this);
            mb.setTextInteractionFlags(Qt::TextSelectableByMouse | Qt::TextSelectableByKeyboard);
            mb.exec();
        }
    });

    // Set up context menu on transactions tab
    ui->transactionsTable->setContextMenuPolicy(Qt::CustomContextMenu);

    // Table right click
    QObject::connect(ui->transactionsTable, &QTableView::customContextMenuRequested, [=] (QPoint pos) {
        QModelIndex index = ui->transactionsTable->indexAt(pos);
        if (index.row() < 0) return;

        QMenu menu(this);

        auto txModel = dynamic_cast<TxTableModel *>(ui->transactionsTable->model());

        QString txid = txModel->getTxId(index.row());
        QString memo = txModel->getMemo(index.row());
        QString addr = txModel->getAddr(index.row());

        menu.addAction(tr("Copy txid"), [=] () {            
            QGuiApplication::clipboard()->setText(txid);
            ui->statusBar->showMessage(tr("Copied to clipboard"), 3 * 1000);
        });

        if (!addr.isEmpty()) {
            menu.addAction(tr("Copy address"), [=] () {
                QGuiApplication::clipboard()->setText(addr);
                ui->statusBar->showMessage(tr("Copied to clipboard"), 3 * 1000);
            });
        }

        menu.addAction(tr("View on block explorer"), [=] () {
            Settings::openTxInExplorer(txid);
        });

        // Payment Request
        if (!memo.isEmpty() && memo.startsWith("zcash:")) {
            menu.addAction(tr("View Payment Request"), [=] () {
                RequestDialog::showPaymentConfirmation(this, memo);
            });
        }

        // View Memo
        if (!memo.isEmpty()) {
            menu.addAction(tr("View Memo"), [=] () {               
                QMessageBox mb(QMessageBox::Information, tr("Memo"), memo, QMessageBox::Ok, this);
                mb.setTextInteractionFlags(Qt::TextSelectableByMouse | Qt::TextSelectableByKeyboard);
                mb.exec();
            });
        }

        // If memo contains a reply to address, add a "Reply to" menu item
        if (!memo.isEmpty()) {
            int lastPost     = memo.trimmed().lastIndexOf(QRegExp("[\r\n]+"));
            QString lastWord = memo.right(memo.length() - lastPost - 1);
            
            if (Settings::getInstance()->isSaplingAddress(lastWord) || 
                Settings::getInstance()->isSproutAddress(lastWord)) {
                menu.addAction(tr("Reply to ") + lastWord.left(25) + "...", [=]() {
                    // First, cancel any pending stuff in the send tab by pretending to click
                    // the cancel button
                    cancelButton();

                    // Then set up the fields in the send tab
                    ui->Address1->setText(lastWord);
                    ui->Address1->setCursorPosition(0);
                    ui->Amount1->setText("0.0001");

                    // And switch to the send tab.
                    ui->tabWidget->setCurrentIndex(1);

                    qApp->processEvents();

                    // Click the memo button
                    this->memoButtonClicked(1, true);
                });
            }
        }

        menu.exec(ui->transactionsTable->viewport()->mapToGlobal(pos));        
    });
}

void MainWindow::addNewZaddr(bool sapling) {
    rpc->createNewZaddr(sapling, [=] (json reply) {
        QString addr = QString::fromStdString(reply.get<json::array_t>()[0]);
        // Make sure the RPC class reloads the z-addrs for future use
        rpc->refreshAddresses();

        // Just double make sure the z-address is still checked
        if ( sapling && ui->rdioZSAddr->isChecked() ) {
            ui->listReceiveAddresses->insertItem(0, addr); 
            ui->listReceiveAddresses->setCurrentIndex(0);

            ui->statusBar->showMessage(QString::fromStdString("Created new zAddr") %
                                       (sapling ? "(Sapling)" : "(Sprout)"), 
                                       10 * 1000);
        }
    });
}


// Adds sapling or sprout z-addresses to the combo box. Technically, returns a
// lambda, which can be connected to the appropriate signal
std::function<void(bool)> MainWindow::addZAddrsToComboList(bool sapling) {
    return [=] (bool checked) { 
        if (checked) { 
            auto addrs = this->rpc->getModel()->getAllZAddresses();

            // Save the current address, so we can update it later
            auto zaddr = ui->listReceiveAddresses->currentText();
            ui->listReceiveAddresses->clear();

            std::for_each(addrs.begin(), addrs.end(), [=] (auto addr) {
                if ( (sapling &&  Settings::getInstance()->isSaplingAddress(addr)) ||
                    (!sapling && !Settings::getInstance()->isSaplingAddress(addr))) {                        
                        auto bal = rpc->getModel()->getAllBalances().value(addr);
                        ui->listReceiveAddresses->addItem(addr, bal);
                }
            }); 
            
            if (!zaddr.isEmpty() && Settings::isZAddress(zaddr)) {
                ui->listReceiveAddresses->setCurrentText(zaddr);
            }

            // If z-addrs are empty, then create a new one.
            if (addrs.isEmpty()) {
                addNewZaddr(sapling);
            }
        } 
    };
}

void MainWindow::setupReceiveTab() {
    auto addNewTAddr = [=] () {
        rpc->createNewTaddr([=] (json reply) {
            QString addr = QString::fromStdString(reply.get<json::array_t>()[0]);
            // Make sure the RPC class reloads the t-addrs for future use
            rpc->refreshAddresses();

            // Just double make sure the t-address is still checked
            if (ui->rdioTAddr->isChecked()) {
                ui->listReceiveAddresses->insertItem(0, addr);
                ui->listReceiveAddresses->setCurrentIndex(0);

                ui->statusBar->showMessage(tr("Created new t-Addr"), 10 * 1000);
            }
        });
    };

    // Connect t-addr radio button
    QObject::connect(ui->rdioTAddr, &QRadioButton::toggled, [=] (bool checked) { 
        // Whenever the t-address is selected, we generate a new address, because we don't
        // want to reuse t-addrs
        if (checked) { 
            updateTAddrCombo(checked);
        } 

        // Toggle the "View all addresses" button as well
        ui->btnViewAllAddresses->setVisible(checked);
    });

    // View all addresses goes to "View all private keys"
    QObject::connect(ui->btnViewAllAddresses, &QPushButton::clicked, [=] () {
        // If there's no RPC, return
        if (!getRPC())
            return;

        QDialog d(this);
        Ui_ViewAddressesDialog viewaddrs;
        viewaddrs.setupUi(&d);
        Settings::saveRestore(&d);
        Settings::saveRestoreTableHeader(viewaddrs.tblAddresses, &d, "viewalladdressestable");
        viewaddrs.tblAddresses->horizontalHeader()->setStretchLastSection(true);

        ViewAllAddressesModel model(viewaddrs.tblAddresses, getRPC()->getModel()->getAllTAddresses(), getRPC());
        viewaddrs.tblAddresses->setModel(&model);

        QObject::connect(viewaddrs.btnExportAll, &QPushButton::clicked,  this, &MainWindow::exportAllKeys);

        viewaddrs.tblAddresses->setContextMenuPolicy(Qt::CustomContextMenu);
        QObject::connect(viewaddrs.tblAddresses, &QTableView::customContextMenuRequested, [=] (QPoint pos) {
            QModelIndex index = viewaddrs.tblAddresses->indexAt(pos);
            if (index.row() < 0) return;

            index = index.sibling(index.row(), 0);
            QString addr = viewaddrs.tblAddresses->model()->data(index).toString();

            QMenu menu(this);
            menu.addAction(tr("Export Private Key"), [=] () {                
                if (addr.isEmpty())
                    return;

                this->exportKeys(addr);
            });
            menu.addAction(tr("Copy Address"), [=]() {
                QGuiApplication::clipboard()->setText(addr);
            });
            menu.exec(viewaddrs.tblAddresses->viewport()->mapToGlobal(pos));
        });

        d.exec();
    });

    QObject::connect(ui->rdioZSAddr, &QRadioButton::toggled, addZAddrsToComboList(true));

    // Explicitly get new address button.
    QObject::connect(ui->btnReceiveNewAddr, &QPushButton::clicked, [=] () {
        if (!rpc->getConnection())
            return;

        if (ui->rdioZSAddr->isChecked()) {
            addNewZaddr(true);
        } else if (ui->rdioTAddr->isChecked()) {
            addNewTAddr();
        }
    });

    // Focus enter for the Receive Tab
    QObject::connect(ui->tabWidget, &QTabWidget::currentChanged, [=] (int tab) {
        if (tab == 2) {
            // Switched to receive tab, select the z-addr radio button
            ui->rdioZSAddr->setChecked(true);
            ui->btnViewAllAddresses->setVisible(false);
            
            // And then select the first one
            ui->listReceiveAddresses->setCurrentIndex(0);
        }
    });

    // Validator for label
    QRegExpValidator* v = new QRegExpValidator(QRegExp(Settings::labelRegExp), ui->rcvLabel);
    ui->rcvLabel->setValidator(v);

    // Select item in address list
    QObject::connect(ui->listReceiveAddresses, 
        QOverload<int>::of(&QComboBox::currentIndexChanged), [=] (int index) {
        QString addr = ui->listReceiveAddresses->itemText(index);
        if (addr.isEmpty()) {
            // Draw empty stuff

            ui->rcvLabel->clear();
            ui->rcvBal->clear();
            ui->txtReceive->clear();
            ui->qrcodeDisplay->clear();
            return;
        }

        auto label = AddressBook::getInstance()->getLabelForAddress(addr);
        if (label.isEmpty()) {
            ui->rcvUpdateLabel->setText("Add Label");
        }
        else {
            ui->rcvUpdateLabel->setText("Update Label");
        }
        
        ui->rcvLabel->setText(label);
        ui->rcvBal->setText(rpc->getModel()->getAllBalances().value(addr).toDecimalZECUSDString());
        ui->txtReceive->setPlainText(addr);       
        ui->qrcodeDisplay->setQrcodeString(addr);
        if (rpc->getModel()->getUsedAddresses().value(addr, false)) {
            ui->rcvBal->setToolTip(tr("Address has been previously used"));
        } else {
            ui->rcvBal->setToolTip(tr("Address is unused"));
        }
        
    });    

    // Receive tab add/update label
    QObject::connect(ui->rcvUpdateLabel, &QPushButton::clicked, [=]() {
        QString addr = ui->listReceiveAddresses->currentText();
        if (addr.isEmpty())
            return;

        auto curLabel = AddressBook::getInstance()->getLabelForAddress(addr);
        auto label = ui->rcvLabel->text().trimmed();

        if (curLabel == label)  // Nothing to update
            return;

        QString info;

        if (!curLabel.isEmpty() && label.isEmpty()) {
            info = "Removed Label '" % curLabel % "'";
            AddressBook::getInstance()->removeAddressLabel(curLabel, addr);
        }
        else if (!curLabel.isEmpty() && !label.isEmpty()) {
            info = "Updated Label '" % curLabel % "' to '" % label % "'";
            AddressBook::getInstance()->updateLabel(curLabel, addr, label);
        }
        else if (curLabel.isEmpty() && !label.isEmpty()) {
            info = "Added Label '" % label % "'";
            AddressBook::getInstance()->addAddressLabel(label, addr);
        }

        // Update labels everywhere on the UI
        updateLabels();

        // Show the user feedback
        if (!info.isEmpty()) {
            QMessageBox::information(this, "Label", info, QMessageBox::Ok);
        }
    });

    // Receive Export Key
    QObject::connect(ui->exportKey, &QPushButton::clicked, [=]() {
        QString addr = ui->listReceiveAddresses->currentText();
        if (addr.isEmpty())
            return;

        this->exportKeys(addr);
    });
}

void MainWindow::updateTAddrCombo(bool checked) {
    if (checked) {
        auto utxos = this->rpc->getModel()->getUTXOs();

        // Save the current address so we can restore it later
        auto currentTaddr = ui->listReceiveAddresses->currentText();

        ui->listReceiveAddresses->clear();

        // Maintain a set of addresses so we don't duplicate any, because we'll be adding
        // t addresses multiple times
        QSet<QString> addrs;

        // 1. Add all t addresses that have a balance
        std::for_each(utxos.begin(), utxos.end(), [=, &addrs](auto& utxo) {
            auto addr = utxo.address;
            if (Settings::isTAddress(addr) && !addrs.contains(addr)) {
                auto bal = rpc->getModel()->getAllBalances().value(addr);
                ui->listReceiveAddresses->addItem(addr, bal);

                addrs.insert(addr);
            }
        });
        
        // 2. Add all t addresses that have a label
        auto allTaddrs = this->rpc->getModel()->getAllTAddresses();
        QSet<QString> labels;
        for (auto p : AddressBook::getInstance()->getAllAddressLabels()) {
            labels.insert(p.second);
        }
        std::for_each(allTaddrs.begin(), allTaddrs.end(), [=, &addrs] (auto& taddr) {
            // If the address is in the address book, add it. 
            if (labels.contains(taddr) && !addrs.contains(taddr)) {
                addrs.insert(taddr);
                ui->listReceiveAddresses->addItem(taddr, CAmount::fromqint64(0));
            }
        });

        // 3. Add all t-addresses. We won't add more than 20 total t-addresses,
        // since it will overwhelm the dropdown
        for (int i=0; addrs.size() < 20 && i < allTaddrs.size(); i++) {
            auto addr = allTaddrs.at(i);
            if (!addrs.contains(addr))  {
                addrs.insert(addr);
                // Balance is zero since it has not been previously added
                ui->listReceiveAddresses->addItem(addr, CAmount::fromqint64(0));
            }
        }

        // 4. Add the previously selected t-address
        if (!currentTaddr.isEmpty() && Settings::isTAddress(currentTaddr)) {
            // Make sure the current taddr is in the list
            if (!addrs.contains(currentTaddr)) {
                auto bal = rpc->getModel()->getAllBalances().value(currentTaddr);
                ui->listReceiveAddresses->addItem(currentTaddr, bal);
            }
            ui->listReceiveAddresses->setCurrentText(currentTaddr);
        }

        // 5. Add a last, disabled item if there are remaining items
        if (allTaddrs.size() > addrs.size()) {
            auto num = QString::number(allTaddrs.size() - addrs.size());
            ui->listReceiveAddresses->addItem("-- " + num + " more --", CAmount::fromqint64(0));

            QStandardItemModel* model = qobject_cast<QStandardItemModel*>(ui->listReceiveAddresses->model());
            QStandardItem* item =  model->findItems("--", Qt::MatchStartsWith)[0];
            item->setFlags(item->flags() & ~Qt::ItemIsEnabled);
        }
    }
};

// Updates the labels everywhere on the UI. Call this after the labels have been updated
void MainWindow::updateLabels() {
    // Update the Receive tab
    if (ui->rdioTAddr->isChecked()) {
        updateTAddrCombo(true);
    }
    else {
        addZAddrsToComboList(ui->rdioZSAddr->isChecked())(true);
    }

    // Update the autocomplete
    updateLabelsAutoComplete();
}

void MainWindow::slot_change_theme(const QString& theme_name)
{
    Settings::getInstance()->set_theme_name(theme_name);

    // Include css
    QString saved_theme_name;
    try
    {
       saved_theme_name = Settings::getInstance()->get_theme_name();
    }
    catch (...)
    {
        saved_theme_name = "default";
    }

    QFile qFile(":/css/res/css/" + saved_theme_name +".css");
    if (qFile.open(QFile::ReadOnly))
    {
      QString styleSheet = QLatin1String(qFile.readAll());
      this->setStyleSheet(""); // reset styles    
      this->setStyleSheet(styleSheet);
    }

}

MainWindow::~MainWindow()
{
    delete ui;
    delete rpc;
    delete labelCompleter;

    delete sendTxRecurringInfo;
    delete amtValidator;
    delete feesValidator;

    delete loadingMovie;
    delete logger;

    delete wsserver;
    delete wormhole;
}
