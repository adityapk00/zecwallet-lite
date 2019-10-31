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
    int  getLatestBlock() { QReadLocker locker(lock); return this->latestBlock; }

    void setEncryptionStatus(bool encrypted, bool locked) { this->isEncrypted = encrypted; this->isLocked = locked; }
    QPair<bool, bool> getEncryptionStatus() { return qMakePair(this->isEncrypted, this->isLocked); }

    const QList<QString>             getAllZAddresses()     { QReadLocker locker(lock); return *zaddresses; }
    const QList<QString>             getAllTAddresses()     { QReadLocker locker(lock); return *taddresses; }
    const QList<UnspentOutput>       getUTXOs()             { QReadLocker locker(lock); return *utxos; }
    const QMap<QString, CAmount>     getAllBalances()       { QReadLocker locker(lock); return *balances; }
    const QMap<QString, bool>        getUsedAddresses()     { QReadLocker locker(lock); return *usedAddresses; }
    
    CAmount                    getAvailableBalance()          { QReadLocker locker(lock); return availableBalance; }
    void                       setAvailableBalance(CAmount a) { QReadLocker locker(lock); this->availableBalance = a; }

    CAmount                    getBalT()          { QReadLocker locker(lock); return balT; }
    void                       setBalT(CAmount a) { QReadLocker locker(lock); this->balT = a; }

    CAmount                    getBalZ()          { QReadLocker locker(lock); return balZ; }
    void                       setBalZ(CAmount a) { QReadLocker locker(lock); this->balZ = a; }

    CAmount                    getBalVerified()          { QReadLocker locker(lock); return balVerified; }
    void                       setBalVerified(CAmount a) { QReadLocker locker(lock); this->balVerified = a; }

    CAmount                    getTotalPending()          { QReadLocker locker(lock); return totalPending; }
    void                       setTotalPending(CAmount a) { QReadLocker locker(lock); this->totalPending = a; }

    DataModel();
    ~DataModel();
private: 
    int latestBlock;

    bool isEncrypted    = false;
    bool isLocked       = false;

    QList<UnspentOutput>*   utxos           = nullptr;
    QMap<QString, CAmount>* balances        = nullptr;
    QMap<QString, bool>*    usedAddresses   = nullptr;
    QList<QString>*         zaddresses      = nullptr;
    QList<QString>*         taddresses      = nullptr;

    CAmount                 availableBalance;
    CAmount                 totalPending;   // Outgoing pending is -ve

    CAmount                 balT;
    CAmount                 balZ;
    CAmount                 balVerified;

    QReadWriteLock* lock;
};

#endif // DATAMODEL_H