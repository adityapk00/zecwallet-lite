#ifndef ZCASHDRPC_H
#define ZCASHDRPC_H

#include "precompiled.h"

#include "connection.h"

using json = nlohmann::json;

// Since each transaction can contain multiple outputs, we separate them out individually
// into a struct with address, amount, memo
struct TransactionItemDetail {
    QString         address;
    qint64          amount;
    QString         memo;
};

// Represents a row in the transactions table. Note that each transaction can contain
// multiple addresses (i.e., Multiple TransctionItemDetail)
struct TransactionItem {
    QString         type;
    qint64          datetime;
    QString         address;
    QString         txid;
    long            confirmations;

    QList<TransactionItemDetail> items;
};


class LiteInterface {
public:
    LiteInterface();
    ~LiteInterface();

    bool haveConnection();
    void setConnection(Connection* c);
    Connection* getConnection() { return conn; }

    void fetchUnspent             (const std::function<void(json)>& cb);
    void fetchTransactions        (const std::function<void(json)>& cb);
    void fetchAddresses          (const std::function<void(json)>& cb);

    void fetchReceivedZTrans(QList<QString> zaddrs, const std::function<void(QString)> usedAddrFn,
        const std::function<void(QList<TransactionItem>)> txdataFn);
    void fetchReceivedTTrans(QList<QString> txids, QList<TransactionItem> sentZtxs,
    const std::function<void(QList<TransactionItem>)> txdataFn);

    void fetchInfo(const std::function<void(json)>& cb, 
                    const std::function<void(QString)>& err);
    void fetchBlockchainInfo(const std::function<void(json)>& cb);
    void fetchNetSolOps(const std::function<void(qint64)> cb);
    void fetchOpStatus(const std::function<void(json)>& cb);

    void fetchMigrationStatus(const std::function<void(json)>& cb);
    void setMigrationStatus(bool enabled);

    void fetchBalance(const std::function<void(json)>& cb);

    void createNewZaddr(bool sapling, const std::function<void(json)>& cb);
    void createNewTaddr(const std::function<void(json)>& cb);

    void fetchZPrivKey(QString addr, const std::function<void(json)>& cb);
    void fetchTPrivKey(QString addr, const std::function<void(json)>& cb);
    void importZPrivKey(QString addr, bool rescan, const std::function<void(json)>& cb);
    void importTPrivKey(QString addr, bool rescan, const std::function<void(json)>& cb);
    void validateAddress(QString address, const std::function<void(json)>& cb);

    void fetchAllPrivKeys(const std::function<void(QList<QPair<QString, QString>>)>);

    void sendTransaction(QString params, const std::function<void(json)>& cb, const std::function<void(QString)>& err);

private:
    Connection*  conn                        = nullptr;
};

#endif // ZCASHDRPC_H
