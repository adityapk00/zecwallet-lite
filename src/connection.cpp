#include "connection.h"
#include "mainwindow.h"
#include "settings.h"
#include "ui_connection.h"
#include "ui_createzcashconfdialog.h"
#include "controller.h"

#include "../lib/zecwalletlitelib.h"

#include "precompiled.h"

using json = nlohmann::json;

ConnectionLoader::ConnectionLoader(MainWindow* main, Controller* rpc) {
    this->main = main;
    this->rpc  = rpc;

    d = new QDialog(main);
    connD = new Ui_ConnectionDialog();
    connD->setupUi(d);
    QPixmap logo(":/img/res/logobig.gif");
    connD->topIcon->setBasePixmap(logo.scaled(256, 256, Qt::KeepAspectRatio, Qt::SmoothTransformation));
}

ConnectionLoader::~ConnectionLoader() {    
    delete d;
    delete connD;
}

void ConnectionLoader::loadConnection() {
    QTimer::singleShot(1, [=]() { this->doAutoConnect(); });
    if (!Settings::getInstance()->isHeadless())
        d->exec();
}

void ConnectionLoader::doAutoConnect(bool tryEzcashdStart) {
    auto config = std::shared_ptr<ConnectionConfig>(new ConnectionConfig());
    config->dangerous = true;
    config->server = QString("https://127.0.0.1:9067");

    // Initialize the library
    main->logger->write(QObject::tr("Attempting to initialize"));
    litelib_initialze(config->dangerous, config->server.toStdString());
    auto connection = makeConnection(config);

    // After the lib is initialized, try to do get info
    connection->doRPC("info", [=](auto reply) {
       // If success, set the connection
        d->hide();
        main->logger->write("Connection is online.");
        this->doRPCSetConnection(connection); 
    }, [=](auto err, auto errJson) {});



    if (config.get() != nullptr) {
        auto connection = makeConnection(config);

        refreshZcashdState(connection, [=] () {
            // Refused connection. So try and start embedded zcashd
            if (Settings::getInstance()->useEmbedded()) {
                if (tryEzcashdStart) {
                    this->showInformation(QObject::tr("Starting embedded zcashd"));
                    if (this->startEmbeddedZcashd()) {
                        // Embedded zcashd started up. Wait a second and then refresh the connection
                        main->logger->write("Embedded zcashd started up, trying autoconnect in 1 sec");
                        QTimer::singleShot(1000, [=]() { doAutoConnect(); } );
                    } else {
                        if (config->zcashDaemon) {
                            // zcashd is configured to run as a daemon, so we must wait for a few seconds
                            // to let it start up. 
                            main->logger->write("zcashd is daemon=1. Waiting for it to start up");
                            this->showInformation(QObject::tr("zcashd is set to run as daemon"), QObject::tr("Waiting for zcashd"));
                            QTimer::singleShot(5000, [=]() { doAutoConnect(/* don't attempt to start ezcashd */ false); });
                        } else {
                            // Something is wrong. 
                            // We're going to attempt to connect to the one in the background one last time
                            // and see if that works, else throw an error
                            main->logger->write("Unknown problem while trying to start zcashd");
                            QTimer::singleShot(2000, [=]() { doAutoConnect(/* don't attempt to start ezcashd */ false); });
                        }
                    }
                } else {
                    // We tried to start ezcashd previously, and it didn't work. So, show the error. 
                    main->logger->write("Couldn't start embedded zcashd for unknown reason");
                    QString explanation;
                    if (config->zcashDaemon) {
                        explanation = QString() % QObject::tr("You have zcashd set to start as a daemon, which can cause problems "
                            "with ZecWallet\n\n."
                            "Please remove the following line from your zcash.conf and restart ZecWallet\n"
                            "daemon=1");
                    } else {
                        explanation = QString() % QObject::tr("Couldn't start the embedded zcashd.\n\n" 
                            "Please try restarting.\n\nIf you previously started zcashd with custom arguments, you might need to reset zcash.conf.\n\n" 
                            "If all else fails, please run zcashd manually.") %  
                            (ezcashd ? QObject::tr("The process returned") + ":\n\n" % ezcashd->errorString() : QString(""));
                    }
                    
                    this->showError(explanation);
                }                
            } else {
                // zcash.conf exists, there's no connection, and the user asked us not to start zcashd. Error!
                main->logger->write("Not using embedded and couldn't connect to zcashd");
                QString explanation = QString() % QObject::tr("Couldn't connect to zcashd configured in zcash.conf.\n\n" 
                                      "Not starting embedded zcashd because --no-embedded was passed");
                this->showError(explanation);
            }
        });
    } else {
        if (Settings::getInstance()->useEmbedded()) {
            // zcash.conf was not found, so create one
            createZcashConf();
        } else {
            // Fall back to manual connect
            doManualConnect();
        }
    } 
}

void ConnectionLoader::doRPCSetConnection(Connection* conn) {
    rpc->setEZcashd(ezcashd);
    rpc->setConnection(conn);
    
    d->accept();

    delete this;
}

Connection* ConnectionLoader::makeConnection(std::shared_ptr<ConnectionConfig> config) {
    return new Connection(main, config);
}

// Update the UI with the status
void ConnectionLoader::showInformation(QString info, QString detail) {
    static int rescanCount = 0;
    if (detail.toLower().startsWith("rescan")) {
        rescanCount++;
    }
    
    if (rescanCount > 10) {
        detail = detail + "\n" + QObject::tr("This may take several hours");
    }

    connD->status->setText(info);
    connD->statusDetail->setText(detail);

    if (rescanCount < 10)
        main->logger->write(info + ":" + detail);
}

/**
 * Show error will close the loading dialog and show an error. 
*/
void ConnectionLoader::showError(QString explanation) {    
    rpc->setEZcashd(nullptr);
    rpc->noConnection();

    QMessageBox::critical(main, QObject::tr("Connection Error"), explanation, QMessageBox::Ok);
    d->close();
}

void Executor::run() {
    const char* resp = litelib_execute(this->cmd.toStdString().c_str());
    QString reply = QString::fromStdString(resp);
    litelib_rust_free_string(resp);

    auto parsed = json::parse(reply.toStdString().c_str(), nullptr, false);

    emit responseReady(parsed);
}



/***********************************************************************************
 *  Connection Class
 ************************************************************************************/ 
Connection::Connection(MainWindow* m, std::shared_ptr<ConnectionConfig> conf) {
    this->config      = conf;
    this->main        = m;
}

Connection::~Connection() {    
}

void Connection::doRPC(const QString cmd, const QString args, const std::function<void(json)>& cb, 
                       const std::function<void(QNetworkReply*, const json&)>& ne) {
    if (shutdownInProgress) {
        // Ignoring RPC because shutdown in progress
        return;
    }

    // Create a runner.
    auto runner = new Executor(cmd, args);
    QObject::connect(runner, &Executor::responseReady, [=] (json resp) {
        cb(resp);
    })
    QThreadPool::globalInstance()->start(runner);    
}

void Connection::doRPCWithDefaultErrorHandling(const json& payload, const std::function<void(json)>& cb) {
    doRPC(payload, cb, [=] (auto reply, auto parsed) {
        if (!parsed.is_discarded() && !parsed["error"]["message"].is_null()) {
            this->showTxError(QString::fromStdString(parsed["error"]["message"]));    
        } else {
            this->showTxError(reply->errorString());
        }
    });
}

void Connection::doRPCIgnoreError(const json& payload, const std::function<void(json)>& cb) {
    doRPC(payload, cb, [=] (auto, auto) {
        // Ignored error handling
    });
}

void Connection::showTxError(const QString& error) {
    if (error.isNull()) return;

    // Prevent multiple dialog boxes from showing, because they're all called async
    static bool shown = false;
    if (shown)
        return;

    shown = true;
    QMessageBox::critical(main, QObject::tr("Transaction Error"), QObject::tr("There was an error sending the transaction. The error was:") + "\n\n"
        + error, QMessageBox::StandardButton::Ok);
    shown = false;
}

/**
 * Prevent all future calls from going through
 */ 
void Connection::shutdown() {
    shutdownInProgress = true;
}
