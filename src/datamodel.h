#ifndef DATAMODEL_H
#define DATAMODEL_H

#include "camount.h"
#include "precompiled.h"


struct UnspentOutput {
    QString address;
    QString txid;
    CAmount amount;    
    int     blockCreated;
    bool    spendable;
    bool    pending;
};


// Data class that holds all the data about the wallet.
class DataModel {
public:
    void replaceZaddresses(QList<QString>* newZ);
    void replaceTaddresses(QList<QString>* newZ);
    void replaceBalances(QMap<QString, CAmount>* newBalances);
    void replaceUTXOs(QList<UnspentOutput>* utxos);

    void markAddressUsed(QString address);

    void setLatestBlock(int blockHeight);
    int  getLatestBlock() { return this->latestBlock; }

    const QList<QString>             getAllZAddresses()     { QReadLocker locker(lock); return *zaddresses; }
    const QList<QString>             getAllTAddresses()     { QReadLocker locker(lock); return *taddresses; }
    const QList<UnspentOutput>       getUTXOs()             { QReadLocker locker(lock); return *utxos; }
    const QMap<QString, CAmount>     getAllBalances()       { QReadLocker locker(lock); return *balances; }
    const QMap<QString, bool>        getUsedAddresses()     { QReadLocker locker(lock); return *usedAddresses; }
    
    CAmount                    getAvailableBalance()          { return availableBalance; }
    void                       setAvailableBalance(CAmount a) { this->availableBalance = a; }

    DataModel();
    ~DataModel();
private: 
    int latestBlock;

    QList<UnspentOutput>*   utxos           = nullptr;
    QMap<QString, CAmount>* balances        = nullptr;
    QMap<QString, bool>*    usedAddresses   = nullptr;
    QList<QString>*         zaddresses      = nullptr;
    QList<QString>*         taddresses      = nullptr;

    CAmount                 availableBalance;

    QReadWriteLock* lock;

};

#endif // DATAMODEL_H