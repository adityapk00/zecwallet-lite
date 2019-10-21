#include "connection.h"
#include "mainwindow.h"
#include "settings.h"
#include "ui_connection.h"
#include "ui_createhushconfdialog.h"
#include "controller.h"

#include "../lib/silentdragonlitelib.h"

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
    delete connD;
    delete d;
}

void ConnectionLoader::loadConnection() {
    QTimer::singleShot(1, [=]() { this->doAutoConnect(); });
    if (!Settings::getInstance()->isHeadless())
        d->exec();
}

void ConnectionLoader::doAutoConnect() {
    qDebug() << "Doing autoconnect";

    auto config = std::shared_ptr<ConnectionConfig>(new ConnectionConfig());
    config->dangerous = true;
    config->server = QString("127.0.0.1:9069");

    // Initialize the library
    main->logger->write(QObject::tr("Attempting to initialize"));
    litelib_initialze_existing(config->dangerous, config->server.toStdString().c_str());
    
    auto connection = makeConnection(config);

    // After the lib is initialized, try to do get info
    connection->doRPC("info", "", [=](auto reply) {
       // If success, set the connection
        main->logger->write("Connection is online.");
        this->doRPCSetConnection(connection); 
    }, [=](auto err) {});
}

void ConnectionLoader::doRPCSetConnection(Connection* conn) {
    rpc->setConnection(conn);
    
    d->accept();

    QTimer::singleShot(1, [=]() { delete this; });
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
    rpc->noConnection();

    QMessageBox::critical(main, QObject::tr("Connection Error"), explanation, QMessageBox::Ok);
    d->close();
}



/***********************************************************************************
 *  Connection, Executor and Callback Class
 ************************************************************************************/ 
void Executor::run() {
    char* resp = litelib_execute(this->cmd.toStdString().c_str(), this->args.toStdString().c_str());

    // Copy the string, since we need to return this back to rust
    char* resp_copy = new char[strlen(resp) + 1];
    strcpy(resp_copy, resp);
    litelib_rust_free_string(resp);

    QString reply = QString::fromStdString(resp_copy);
    memset(resp_copy, '-', strlen(resp_copy));
    delete[] resp_copy;

    qDebug() << "Reply=" << reply;
    auto parsed = json::parse(reply.toStdString().c_str(), nullptr, false);
    if (parsed.is_discarded() || parsed.is_null()) {
        emit handleError(reply);
    } else {
        const bool isGuiThread = 
                QThread::currentThread() == QCoreApplication::instance()->thread();
        qDebug() << "executing RPC: isGUI=" << isGuiThread;

        emit responseReady(parsed);
    }
}


void Callback::processRPCCallback(json resp) {
    const bool isGuiThread = QThread::currentThread() == QCoreApplication::instance()->thread();
    qDebug() << "Doing RPC callback: isGUI=" << isGuiThread;
    this->cb(resp);

    // Destroy self
    delete this;
}

void Callback::processError(QString resp) {
    const bool isGuiThread = QThread::currentThread() == QCoreApplication::instance()->thread();
    qDebug() << "Doing RPC callback: isGUI=" << isGuiThread;
    this->errCb(resp);

    // Destroy self
    delete this;
}

Connection::Connection(MainWindow* m, std::shared_ptr<ConnectionConfig> conf) {
    this->config      = conf;
    this->main        = m;

    // Register the JSON type as a type that can be passed between signals and slots.
    qRegisterMetaType<json>("json");
}

void Connection::doRPC(const QString cmd, const QString args, const std::function<void(json)>& cb, 
                       const std::function<void(QString)>& errCb) {
    if (shutdownInProgress) {
        // Ignoring RPC because shutdown in progress
        return;
    }

    const bool isGuiThread = 
        QThread::currentThread() == QCoreApplication::instance()->thread();
    qDebug() << "Doing RPC: isGUI=" << isGuiThread;

    // Create a runner.
    auto runner = new Executor(cmd, args);

    // Callback object. Will delete itself
    auto c = new Callback(cb, errCb);

    QObject::connect(runner, &Executor::responseReady, c, &Callback::processRPCCallback);
    QObject::connect(runner, &Executor::handleError, c, &Callback::processError);

    QThreadPool::globalInstance()->start(runner);    
}

void Connection::doRPCWithDefaultErrorHandling(const QString cmd, const QString args, const std::function<void(json)>& cb) {
    doRPC(cmd, args, cb, [=] (QString err) {
        this->showTxError(err);
    });
}

void Connection::doRPCIgnoreError(const QString cmd, const QString args, const std::function<void(json)>& cb) {
    doRPC(cmd, args, cb, [=] (auto) {
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
