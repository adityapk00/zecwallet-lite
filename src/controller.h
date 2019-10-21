#ifndef RPCCLIENT_H
#define RPCCLIENT_H

#include "precompiled.h"

#include "datamodel.h"
#include "balancestablemodel.h"
#include "txtablemodel.h"
#include "ui_mainwindow.h"
#include "mainwindow.h"
#include "liteinterface.h"
#include "connection.h"

using json = nlohmann::json;

struct WatchedTx {
    QString opid;
    Tx tx;
    std::function<void(QString, QString)> completed;
    std::function<void(QString, QString)> error;
};

struct MigrationStatus {
    bool            available;     // Whether the underlying hushd supports migration?
    bool            enabled;
    QString         saplingAddress;
    double          unmigrated;
    double          migrated;
    QList<QString>  txids;
};

class Controller
{
public:
    Controller(MainWindow* main);
    ~Controller();

    DataModel* getModel() { return model; }

    Connection* getConnection() { return zrpc->getConnection(); }
    void setConnection(Connection* c);

    void refresh(bool force = false);
    void refreshAddresses();    
    
    void checkForUpdate(bool silent = true);
    void refreshhushPrice();
    //void getZboardTopics(std::function<void(QMap<QString, QString>)> cb);

    void executeStandardUITransaction(Tx tx); 

    void executeTransaction(Tx tx, 
        const std::function<void(QString txid)> submitted,
        const std::function<void(QString txid, QString errStr)> error);

    void fillTxJsonParams(json& params, Tx tx);
    
    const TxTableModel*               getTransactionsModel() { return transactionsTableModel; }

    void shutdownhushd();
    void noConnection();
    bool isEmbedded() { return ehushd != nullptr; }

    void createNewZaddr(bool sapling, const std::function<void(json)>& cb) { zrpc->createNewZaddr(sapling, cb); }
    void createNewTaddr(const std::function<void(json)>& cb) { zrpc->createNewTaddr(cb); }

    void fetchPrivKey(QString addr, const std::function<void(json)>& cb) { zrpc->fetchPrivKey(addr, cb); }
    void fetchAllPrivKeys(const std::function<void(json)> cb) { zrpc->fetchAllPrivKeys(cb); }

    // void importZPrivKey(QString addr, bool rescan, const std::function<void(json)>& cb) { zrpc->importZPrivKey(addr, rescan, cb); }
    // void importTPrivKey(QString addr, bool rescan, const std::function<void(json)>& cb) { zrpc->importTPrivKey(addr, rescan, cb); }

    QString getDefaultSaplingAddress();
    QString getDefaultTAddress();   
    
private:
    void refreshBalances();

    void refreshTransactions();    

    bool processUnspent     (const json& reply, QMap<QString, qint64>* newBalances, QList<UnspentOutput>* newUtxos);
    void updateUI           (bool anyUnconfirmed);

    void getInfoThenRefresh(bool force);
    
    QProcess*                   ehushd                     = nullptr;

    TxTableModel*               transactionsTableModel      = nullptr;
    BalancesTableModel*         balancesTableModel          = nullptr;

    DataModel*                  model;
    LiteInterface*               zrpc;

    QTimer*                     timer;
    QTimer*                     txTimer;
    QTimer*                     priceTimer;

    Ui::MainWindow*             ui;
    MainWindow*                 main;


    // Current balance in the UI. If this number updates, then refresh the UI
    QString                     currentBalance;
};

#endif // RPCCLIENT_H
