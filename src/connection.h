#ifndef CONNECTION_H
#define CONNECTION_H

#include "mainwindow.h"
#include "ui_connection.h"
#include "precompiled.h"

using json = nlohmann::json;

class Controller;

struct ConnectionConfig {
    QString server;
    bool    dangerous;
    QString proxy;
};

class Connection;

class ConnectionLoader {

public:
    ConnectionLoader(MainWindow* main, Controller* rpc);
    ~ConnectionLoader();

    void loadConnection();

private:
    std::shared_ptr<ConnectionConfig> autoDetectZcashConf();
    std::shared_ptr<ConnectionConfig> loadFromSettings();

    Connection* makeConnection(std::shared_ptr<ConnectionConfig> config);

    void doAutoConnect();

    void createOrRestore(bool dangerous, QString server);

    void showError(QString explanation);
    void showInformation(QString info, QString detail = "");

    void doRPCSetConnection(Connection* conn);

    QTimer*                 syncTimer   = nullptr;
    QAtomicInteger<bool>*   isSyncing   = nullptr;

    QDialog*                d           = nullptr;
    Ui_ConnectionDialog*    connD       = nullptr;

    MainWindow*             main        = nullptr;
    Controller*             rpc         = nullptr;
};

/**
 * An object that will call the callback function in the GUI thread, and destroy itself after the callback is finished
 */
class Callback: public QObject {
    Q_OBJECT
public:
    Callback(const std::function<void(json)> cb, const std::function<void(QString)> errCb) { this->cb = cb; this->errCb = errCb;}
    ~Callback() = default;

public slots:
    void processRPCCallback(json resp);
    void processError(QString error);

private: 
    std::function<void(json)> cb;
    std::function<void(QString)> errCb;

};

/**
 * A runnable that runs some lightclient Command in a non-UI thread.
 * It emits the "responseReady" signal, which should be processed in a GUI thread.
 * 
 * Since the autoDelete flag is ON, the runnable should be destroyed automatically
 * by the threadpool. 
 */
class Executor : public QObject, public QRunnable {
    Q_OBJECT

public: 
    Executor(QString cmd, QString args) {
        this->cmd = cmd;
        this->args = args;
    };

    ~Executor() = default;
    bool autoDelete() const { return true; }

    virtual void run();

signals:
    void responseReady(json);
    void handleError(QString);

private:
    QString cmd;
    QString args;    
};

/**
 * Represents a connection to a zcashd. It may even start a new zcashd if needed.
 * This is also a UI class, so it may show a dialog waiting for the connection.
*/
class Connection : public QObject {
Q_OBJECT

public:
    Connection(MainWindow* m, std::shared_ptr<ConnectionConfig> conf);
    ~Connection() = default;

    std::shared_ptr<ConnectionConfig>   config;
    MainWindow*                         main;

    void shutdown();

    
    void doRPC(const QString cmd, const QString args, const std::function<void(json)>& cb, 
               const std::function<void(QString)>& errCb);
    void doRPCWithDefaultErrorHandling(const QString cmd, const QString args, const std::function<void(json)>& cb);
    void doRPCIgnoreError(const QString cmd, const QString args, const std::function<void(json)>& cb) ;

    void showTxError(const QString& error);

    json    getInfo() { return serverInfo; }
    void    setInfo(const json& info) { serverInfo = info; }

private:
    bool shutdownInProgress = false;
    json serverInfo;
};

#endif
