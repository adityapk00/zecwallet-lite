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

    void doAutoConnect(bool tryEzcashdStart = true);

    void showError(QString explanation);
    void showInformation(QString info, QString detail = "");

    void doRPCSetConnection(Connection* conn);

    QDialog*                d;
    Ui_ConnectionDialog*    connD;

    MainWindow*             main;
    Controller*             rpc;
};

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

private:
    QString cmd;
    QString args;    
};

/**
 * Represents a connection to a zcashd. It may even start a new zcashd if needed.
 * This is also a UI class, so it may show a dialog waiting for the connection.
*/
class Connection : public QObject {
public:
    Connection(MainWindow* m, std::shared_ptr<ConnectionConfig> conf);
    ~Connection();

    std::shared_ptr<ConnectionConfig>   config;
    MainWindow*                         main;

    void shutdown();

    void doRPC(const QString cmd, const QString args, const std::function<void(json)>& cb, 
               const std::function<void(QNetworkReply*, const json&)>& ne);
    void doRPCWithDefaultErrorHandling(const QString cmd, const QString args, const std::function<void(json)>& cb);
    void doRPCIgnoreError(const QString cmd, const QString args, const std::function<void(json)>& cb) ;

    void showTxError(const QString& error);

private:
    bool shutdownInProgress = false;    
};

#endif
