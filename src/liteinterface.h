#ifndef ZCASHDRPC_H
#define ZCASHDRPC_H

#include "precompiled.h"

#include "camount.h"
#include "connection.h"

using json = nlohmann::json;

// Since each transaction can contain multiple outputs, we separate them out individually
// into a struct with address, amount, memo
struct TransactionItemDetail {
    QString         address;
    CAmount         amount;
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
    void fetchAddresses           (const std::function<void(json)>& cb);

    void fetchInfo(const std::function<void(json)>& cb, 
                    const std::function<void(QString)>& err);

    void fetchLatestBlock(const std::function<void(json)>& cb, 
                        const std::function<void(QString)>& err);
    
    void fetchBalance(const std::function<void(json)>& cb);

    void createNewZaddr(bool sapling, const std::function<void(json)>& cb);
    void createNewTaddr(const std::function<void(json)>& cb);

    void fetchPrivKey(QString addr, const std::function<void(json)>& cb);
    void fetchAllPrivKeys(const std::function<void(json)>);
    void fetchSeed(const std::function<void(json)>&);

    void saveWallet(const std::function<void(json)>& cb);
    void clearWallet(const std::function<void(json)>& cb);

    void fetchWalletEncryptionStatus(const std::function<void(json)>& cb);
    void encryptWallet(QString password, const std::function<void(json)>& cb);
    void unlockWallet(QString password, const std::function<void(json)>& cb);
    void removeWalletEncryption(QString password, const std::function<void(json)>& cb);

    //void importZPrivKey(QString addr, bool rescan, const std::function<void(json)>& cb);
    //void importTPrivKey(QString addr, bool rescan, const std::function<void(json)>& cb);
   
    void sendTransaction(QString params, const std::function<void(json)>& cb, const std::function<void(QString)>& err);

private:
    Connection*  conn                        = nullptr;
};

#endif // ZCASHDRPC_H
