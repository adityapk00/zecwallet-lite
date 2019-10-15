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
    litelib_initialze(config->dangerous, config->server.toStdString().c_str());
    auto connection = makeConnection(config);

    // After the lib is initialized, try to do get info
    connection->doRPC("info", "", [=](auto reply) {
       // If success, set the connection
        d->hide();
        main->logger->write("Connection is online.");
        this->doRPCSetConnection(connection); 
    }, [=](auto err, auto errJson) {});
}

void ConnectionLoader::doRPCSetConnection(Connection* conn) {
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
    char* resp = litelib_execute(this->cmd.toStdString().c_str());
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
    });
    
    QThreadPool::globalInstance()->start(runner);    
}

void Connection::doRPCWithDefaultErrorHandling(const QString cmd, const QString args, const std::function<void(json)>& cb) {
    doRPC(cmd, args, cb, [=] (auto reply, auto parsed) {
        if (!parsed.is_discarded() && !parsed["error"]["message"].is_null()) {
            this->showTxError(QString::fromStdString(parsed["error"]["message"]));    
        } else {
            this->showTxError(reply->errorString());
        }
    });
}

void Connection::doRPCIgnoreError(const QString cmd, const QString args, const std::function<void(json)>& cb) {
    doRPC(cmd, args, cb, [=] (auto, auto) {
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
