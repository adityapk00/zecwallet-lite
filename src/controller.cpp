#include "controller.h"

#include "addressbook.h"
#include "settings.h"
#include "version.h"
#include "websockets.h"

using json = nlohmann::json;

Controller::Controller(MainWindow* main) {
    auto cl = new ConnectionLoader(main, this);

    // Execute the load connection async, so we can set up the rest of RPC properly. 
    QTimer::singleShot(1, [=]() { cl->loadConnection(); });

    this->main = main;
    this->ui = main->ui;

    // Setup balances table model
    balancesTableModel = new BalancesTableModel(main->ui->balancesTable);
    main->ui->balancesTable->setModel(balancesTableModel);

    // Setup transactions table model
    transactionsTableModel = new TxTableModel(ui->transactionsTable);
    main->ui->transactionsTable->setModel(transactionsTableModel);
    
    // Set up timer to refresh Price
    priceTimer = new QTimer(main);
    QObject::connect(priceTimer, &QTimer::timeout, [=]() {
        if (Settings::getInstance()->getAllowFetchPrices())
            refreshhushPrice();
    });
    priceTimer->start(Settings::priceRefreshSpeed);  // Every hour

    // Set up a timer to refresh the UI every few seconds
    timer = new QTimer(main);
    QObject::connect(timer, &QTimer::timeout, [=]() {
        refresh();
    });
    timer->start(Settings::updateSpeed);    

    // Create the data model
    model = new DataModel();

    // Crate the hushdRPC 
    zrpc = new LiteInterface();
}

Controller::~Controller() {
    delete timer;
    delete txTimer;

    delete transactionsTableModel;
    delete balancesTableModel;

    delete model;
    delete zrpc;
}


// Called when a connection to hushd is available. 
void Controller::setConnection(Connection* c) {
    if (c == nullptr) return;

    this->zrpc->setConnection(c);

    ui->statusBar->showMessage("Your hushd is connected");

    // See if we need to remove the reindex/rescan flags from the hush.conf file
    auto hushConfLocation = Settings::getInstance()->gethushdConfLocation();
    Settings::removeFromhushConf(hushConfLocation, "rescan");
    Settings::removeFromhushConf(hushConfLocation, "reindex");

    // If we're allowed to get the hush Price, get the prices
    if (Settings::getInstance()->getAllowFetchPrices())
        refreshhushPrice();

    // If we're allowed to check for updates, check for a new release
    if (Settings::getInstance()->getCheckForUpdates())
        checkForUpdate();

    // Force update, because this might be coming from a settings update
    // where we need to immediately refresh
    refresh(true);
}


// Build the RPC JSON Parameters for this tx
void Controller::fillTxJsonParams(json& allRecepients, Tx tx) {   
    Q_ASSERT(allRecepients.is_array());

    // For each addr/amt/memo, construct the JSON and also build the confirm dialog box    
    for (int i=0; i < tx.toAddrs.size(); i++) {
        auto toAddr = tx.toAddrs[i];

        // Construct the JSON params
        json rec = json::object();
        rec["address"]      = toAddr.addr.toStdString();
        rec["amount"]       = toAddr.amount * 10000000;
        if (Settings::isZAddress(toAddr.addr) && !toAddr.memo.trimmed().isEmpty())
            rec["memo"]     = toAddr.memo.toStdString();

        allRecepients.push_back(rec);
    }

    // // Add fees if custom fees are allowed.
    // if (Settings::getInstance()->getAllowCustomFees()) {
    //     params.push_back(1); // minconf
    //     params.push_back(tx.fee);
    // }
}


void Controller::noConnection() {    
    QIcon i = QApplication::style()->standardIcon(QStyle::SP_MessageBoxCritical);
    main->statusIcon->setPixmap(i.pixmap(16, 16));
    main->statusIcon->setToolTip("");
    main->statusLabel->setText(QObject::tr("No Connection"));
    main->statusLabel->setToolTip("");
    main->ui->statusBar->showMessage(QObject::tr("No Connection"), 1000);

    // Clear balances table.
    QMap<QString, double> emptyBalances;
    QList<UnspentOutput>  emptyOutputs;
    balancesTableModel->setNewData(emptyBalances, emptyOutputs);

    // Clear Transactions table.
    QList<TransactionItem> emptyTxs;
    transactionsTableModel->replaceData(emptyTxs);

    // Clear balances
    ui->balSheilded->setText("");
    ui->balTransparent->setText("");
    ui->balTotal->setText("");

    ui->balSheilded->setToolTip("");
    ui->balTransparent->setToolTip("");
    ui->balTotal->setToolTip("");

    // Clear send tab from address
    ui->inputsCombo->clear();
}

/// This will refresh all the balance data from hushd
void Controller::refresh(bool force) {
    if (!zrpc->haveConnection()) 
        return noConnection();

    getInfoThenRefresh(force);
}

void Controller::getInfoThenRefresh(bool force) {
    if (!zrpc->haveConnection()) 
        return noConnection();

    static bool prevCallSucceeded = false;

    zrpc->fetchInfo([=] (const json& reply) {   
        qDebug() << "Info updated";

        prevCallSucceeded = true;

        // Testnet?
        QString chainName;
        if (!reply["chain_name"].is_null()) {
            chainName = QString::fromStdString(reply["chain_name"].get<json::string_t>());
            Settings::getInstance()->setTestnet(chainName == "test");
        };

        // Recurring pamynets are testnet only
        if (!Settings::getInstance()->isTestnet())
            main->disableRecurring();

        static int    lastBlock = 0;
        int curBlock  = reply["latest_block_height"].get<json::number_integer_t>();
        model->setLatestBlock(curBlock);

        // Connected, so display checkmark.
        QIcon i(":/icons/res/connected.gif");
        main->statusLabel->setText(chainName + "(" + QString::number(curBlock) + ")");
        main->statusIcon->setPixmap(i.pixmap(16, 16));

        //int version = reply["version"].get<json::string_t>();
        int version = 1;
        Settings::getInstance()->sethushdVersion(version);

        // See if recurring payments needs anything
        Recurring::getInstance()->processPending(main);

        if ( force || (curBlock != lastBlock) ) {
            // Something changed, so refresh everything.
            lastBlock = curBlock;

            refreshBalances();        
            refreshAddresses();     // This calls refreshZSentTransactions() and refreshReceivedZTrans()
            refreshTransactions();
        }
    }, [=](QString err) {
        // hushd has probably disappeared.
        this->noConnection();

        // Prevent multiple dialog boxes, because these are called async
        static bool shown = false;
        if (!shown && prevCallSucceeded) { // show error only first time
            shown = true;
            QMessageBox::critical(main, QObject::tr("Connection Error"), QObject::tr("There was an error connecting to hushd. The error was") + ": \n\n"
                + err, QMessageBox::StandardButton::Ok);
            shown = false;
        }

        prevCallSucceeded = false;
    });
}

void Controller::refreshAddresses() {
    if (!zrpc->haveConnection()) 
        return noConnection();
    
    auto newzaddresses = new QList<QString>();
    auto newtaddresses = new QList<QString>();

    zrpc->fetchAddresses([=] (json reply) {
        auto zaddrs = reply["z_addresses"].get<json::array_t>();
        for (auto& it : zaddrs) {   
            auto addr = QString::fromStdString(it.get<json::string_t>());
            newzaddresses->push_back(addr);
        }

        model->replaceZaddresses(newzaddresses);

        auto taddrs = reply["t_addresses"].get<json::array_t>();
        for (auto& it : taddrs) {   
            auto addr = QString::fromStdString(it.get<json::string_t>());
            if (Settings::isTAddress(addr))
                newtaddresses->push_back(addr);
        }

        model->replaceTaddresses(newtaddresses);

        // Refresh the sent and received txs from all these z-addresses
        refreshTransactions();
    });
    
}

// Function to create the data model and update the views, used below.
void Controller::updateUI(bool anyUnconfirmed) {    
    ui->unconfirmedWarning->setVisible(anyUnconfirmed);

    // Update balances model data, which will update the table too
    balancesTableModel->setNewData(model->getAllBalances(), model->getUTXOs());

    // Update from address
    main->updateFromCombo();
};

// Function to process reply of the listunspent and z_listunspent API calls, used below.
bool Controller::processUnspent(const json& reply, QMap<QString, double>* balancesMap, QList<UnspentOutput>* newUtxos) {
    bool anyUnconfirmed = false;

    auto processFn = [=](const json& array) {
        for (auto& it : array) {
            QString qsAddr  = QString::fromStdString(it["address"]);
            int block       = it["created_in_block"].get<json::number_unsigned_t>();
            QString txid    = QString::fromStdString(it["created_in_txid"]);
            QString amount  = Settings::getDecimalString(it["value"].get<json::number_float_t>());

            newUtxos->push_back(UnspentOutput{ qsAddr, txid, amount, block, true });

            (*balancesMap)[qsAddr] = ((*balancesMap)[qsAddr] + it["value"].get<json::number_float_t>()) /10000000;
        }    
    };

    processFn(reply["unspent_notes"].get<json::array_t>());
    processFn(reply["utxos"].get<json::array_t>());

    return anyUnconfirmed;
};

void Controller::refreshBalances() {    
    if (!zrpc->haveConnection()) 
        return noConnection();

    // 1. Get the Balances
    zrpc->fetchBalance([=] (json reply) {    
        auto balT      = reply["tbalance"].get<json::number_float_t>();
        auto balZ      = reply["zbalance"].get<json::number_float_t>();
        auto balTotal  = balT + balZ;

        AppDataModel::getInstance()->setBalances(balT, balZ);

        ui->balSheilded   ->setText(Settings::gethushDisplayFormat(balZ /10000000));
        ui->balTransparent->setText(Settings::gethushDisplayFormat(balT /10000000));
        ui->balTotal      ->setText(Settings::gethushDisplayFormat(balTotal /10000000));


        ui->balSheilded   ->setToolTip(Settings::gethushDisplayFormat(balZ /10000000));
        ui->balTransparent->setToolTip(Settings::gethushDisplayFormat(balT /10000000));
        ui->balTotal      ->setToolTip(Settings::gethushDisplayFormat(balTotal /10000000));

      
    });

    // 2. Get the UTXOs
    // First, create a new UTXO list. It will be replacing the existing list when everything is processed.
    auto newUtxos = new QList<UnspentOutput>();
    auto newBalances = new QMap<QString, double>();

    // Call the Transparent and Z unspent APIs serially and then, once they're done, update the UI
    zrpc->fetchUnspent([=] (json reply) {
        auto anyUnconfirmed = processUnspent(reply, newBalances, newUtxos);

        // Swap out the balances and UTXOs
        model->replaceBalances(newBalances);
        model->replaceUTXOs(newUtxos);

        updateUI(anyUnconfirmed);

        main->balancesReady();
    });
}

void Controller::refreshTransactions() {    
    if (!zrpc->haveConnection()) 
        return noConnection();

    zrpc->fetchTransactions([=] (json reply) {
        QList<TransactionItem> txdata;        

        for (auto& it : reply.get<json::array_t>()) {  
            QString address;
            double total_amount;
            QList<TransactionItemDetail> items;

            // First, check if there's outgoing metadata
            if (!it["outgoing_metadata"].is_null()) {
            
                for (auto o: it["outgoing_metadata"].get<json::array_t>()) {
                    QString address = QString::fromStdString(o["address"]);
                    double amount = -1 * o["value"].get<json::number_float_t>() /10000000;// Sent items are -ve
                    
                    QString memo;
                    if (!o["memo"].is_null()) {
                        memo = QString::fromStdString(o["memo"]);
                    }

                    items.push_back(TransactionItemDetail{address, amount, memo});
                    total_amount += amount;
                }

                if (items.length() == 1) {
                    address = items[0].address;
                } else {
                    address = "(Multiple)";
                }

                txdata.push_back(TransactionItem{
                   "Sent",
                   it["datetime"].get<json::number_unsigned_t>(),
                   address,
                   QString::fromStdString(it["txid"]),
                   model->getLatestBlock() - it["block_height"].get<json::number_unsigned_t>(), 
                   items
                });
            } else {
                // Incoming Transaction
                address = (it["address"].is_null() ? "" : QString::fromStdString(it["address"]));
                model->markAddressUsed(address);

                items.push_back(TransactionItemDetail{
                    address,
                    it["amount"].get<json::number_float_t>(),
                    ""
                });

                TransactionItem tx{
                    "Receive",
                    it["datetime"].get<json::number_unsigned_t>(),
                    address,
                    QString::fromStdString(it["txid"]),
                    model->getLatestBlock() - it["block_height"].get<json::number_unsigned_t>(),
                    items
                };

                txdata.push_back(tx);
            }
            
        }

        // Update model data, which updates the table view
        transactionsTableModel->replaceData(txdata);        
    });
}

/**
 * Execute a transaction with the standard UI. i.e., standard status bar message and standard error
 * handling
 */
void Controller::executeStandardUITransaction(Tx tx) {
    executeTransaction(tx,
        [=] (QString txid) { 
            ui->statusBar->showMessage(Settings::txidStatusMessage + " " + txid);
        },
        [=] (QString opid, QString errStr) {
            ui->statusBar->showMessage(QObject::tr(" Tx ") % opid % QObject::tr(" failed"), 15 * 1000);

            if (!opid.isEmpty())
                errStr = QObject::tr("The transaction with id ") % opid % QObject::tr(" failed. The error was") + ":\n\n" + errStr; 

            QMessageBox::critical(main, QObject::tr("Transaction Error"), errStr, QMessageBox::Ok);            
        }
    );
}


// Execute a transaction!
void Controller::executeTransaction(Tx tx, 
        const std::function<void(QString txid)> submitted,
        const std::function<void(QString txid, QString errStr)> error) {
    // First, create the json params
    json params = json::array();
    fillTxJsonParams(params, tx);
    std::cout << std::setw(2) << params << std::endl;

    zrpc->sendTransaction(QString::fromStdString(params.dump()), [=](const json& reply) {
        if (reply.find("txid") == reply.end()) {
            error("", "Couldn't understand Response: " + QString::fromStdString(reply.dump()));
        }

        QString txid = QString::fromStdString(reply["txid"].get<json::string_t>());
        submitted(txid);
    },
    [=](QString errStr) {
        error("", errStr);
    });
}


void Controller::checkForUpdate(bool silent) {
    if (!zrpc->haveConnection()) 
        return noConnection();

    QUrl cmcURL("https://api.github.com/repos/MyHush/SilentDragonLite/releases");

    QNetworkRequest req;
    req.setUrl(cmcURL);
    
    QNetworkAccessManager *manager = new QNetworkAccessManager(this->main);
    QNetworkReply *reply = manager->get(req);

    QObject::connect(reply, &QNetworkReply::finished, [=] {
        reply->deleteLater();
        manager->deleteLater();

        try {
            if (reply->error() == QNetworkReply::NoError) {

                auto releases = QJsonDocument::fromJson(reply->readAll()).array();
                QVersionNumber maxVersion(0, 0, 0);

                for (QJsonValue rel : releases) {
                    if (!rel.toObject().contains("tag_name"))
                        continue;

                    QString tag = rel.toObject()["tag_name"].toString();
                    if (tag.startsWith("v"))
                        tag = tag.right(tag.length() - 1);

                    if (!tag.isEmpty()) {
                        auto v = QVersionNumber::fromString(tag);
                        if (v > maxVersion)
                            maxVersion = v;
                    }
                }

                auto currentVersion = QVersionNumber::fromString(APP_VERSION);
                
                // Get the max version that the user has hidden updates for
                QSettings s;
                auto maxHiddenVersion = QVersionNumber::fromString(s.value("update/lastversion", "0.0.0").toString());

                qDebug() << "Version check: Current " << currentVersion << ", Available " << maxVersion;

                if (maxVersion > currentVersion && (!silent || maxVersion > maxHiddenVersion)) {
                    auto ans = QMessageBox::information(main, QObject::tr("Update Available"), 
                        QObject::tr("A new release v%1 is available! You have v%2.\n\nWould you like to visit the releases page?")
                            .arg(maxVersion.toString())
                            .arg(currentVersion.toString()),
                        QMessageBox::Yes, QMessageBox::Cancel);
                    if (ans == QMessageBox::Yes) {
                        QDesktopServices::openUrl(QUrl("https://github.com/MyHush/SilentDragonLite/releases"));
                    } else {
                        // If the user selects cancel, don't bother them again for this version
                        s.setValue("update/lastversion", maxVersion.toString());
                    }
                } else {
                    if (!silent) {
                        QMessageBox::information(main, QObject::tr("No updates available"), 
                            QObject::tr("You already have the latest release v%1")
                                .arg(currentVersion.toString()));
                    }
                } 
            }
        }
        catch (...) {
            // If anything at all goes wrong, just set the price to 0 and move on.
            qDebug() << QString("Caught something nasty");
        }       
    });
}

// Get the hush->USD price from coinmarketcap using their API
void Controller::refreshhushPrice() {
    if (!zrpc->haveConnection()) 
        return noConnection();

       // TODO: use/render all this data
    QUrl cmcURL("ncies=btc%2Cusd%2Ceur&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true");
   
    QNetworkRequest req;
    req.setUrl(cmcURL);

    QNetworkAccessManager *manager = new QNetworkAccessManager(this->main);
    QNetworkReply *reply = manager->get(req);

    QObject::connect(reply, &QNetworkReply::finished, [=] {
        reply->deleteLater();
        manager->deleteLater();

        try {
            if (reply->error() != QNetworkReply::NoError) {
                auto parsed = json::parse(reply->readAll(), nullptr, false);
                if (!parsed.is_discarded() && !parsed["error"]["message"].is_null()) {
                    qDebug() << QString::fromStdString(parsed["error"]["message"]);
                } else {
                    qDebug() << reply->errorString();
                }
                Settings::getInstance()->sethushPrice(0);
                return;
            }

            qDebug() << "No network errors";
            auto all = reply->readAll();
            auto parsed = json::parse(all, nullptr, false);
            if (parsed.is_discarded()) {
                Settings::getInstance()->sethushPrice(0);
                return;
            }

            qDebug() << "Parsed JSON";

            const json& item  = parsed.get<json::object_t>();
            const json& hush  = item["Hush"].get<json::object_t>();

            if (hush["usd"] >= 0) {
                qDebug() << "Found hush key in price json";
                // TODO: support BTC/EUR prices as well
                QString price = QString::fromStdString(hush["usd"].get<json::string_t>());
                qDebug() << "HUSH = $" << QString::number((double)hush["usd"]);
                Settings::getInstance()->sethushPrice( hush["usd"] );

                return;
            } else {
                qDebug() << "No hush key found in JSON! API might be down or we are rate-limited\n";
            }
        } catch (const std::exception& e) {
            // If anything at all goes wrong, just set the price to 0 and move on.
            qDebug() << QString("Caught something nasty: ") << e.what();
        }

        // If nothing, then set the price to 0;
        Settings::getInstance()->sethushPrice(0);
    });
}

void Controller::shutdownhushd() {
    // Save the wallet and exit the lightclient library cleanly.
    if (zrpc->haveConnection()) {
        QDialog d(main);
        Ui_ConnectionDialog connD;
        connD.setupUi(&d);
        connD.topIcon->setBasePixmap(QIcon(":/icons/res/icon.ico").pixmap(256, 256));
        connD.status->setText(QObject::tr("Please wait for SilentDragonLite to exit"));
        connD.statusDetail->setText(QObject::tr("Waiting for hushd to exit"));

        bool finished = false;

        zrpc->saveWallet([&] (json) {        
            if (!finished)
                d.accept();
            finished = true;
        });

        if (!finished)
            d.exec();
    }
}

/** 
 * Get a Sapling address from the user's wallet
 */ 
QString Controller::getDefaultSaplingAddress() {
    for (QString addr: model->getAllZAddresses()) {
        if (Settings::getInstance()->isSaplingAddress(addr))
            return addr;
    }

    return QString();
}

QString Controller::getDefaultTAddress() {
    if (model->getAllTAddresses().length() > 0)
        return model->getAllTAddresses().at(0);
    else 
        return QString();
}
