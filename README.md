## ZecWallet Lite
Zecwallet-Lite is z-Addr first, Sapling compatible lightwallet client for Zcash. It has full support for all Zcash features:
- Send + Receive fully shielded transactions
- Supports transparent addresses and transactions
- Full support for incoming and outgoing memos
- Fully encrypt your private keys, using viewkeys to sync the blockchain

## Download
Download compiled binaries from our [release page](https://github.com/adityapk00/zecwallet-lite/releases)

## Privacy 
* While all the keys and transaction detection happens on the client, the server can learn what blocks contain your shielded transactions.
* The server also learns other metadata about you like your ip address etc...
* Also remember that t-addresses don't provide any privacy protection.


### Note Management
Zecwallet-Lite does automatic note and utxo management, which means it doesn't allow you to manually select which address to send outgoing transactions from. It follows these principles:
* Defaults to sending shielded transactions, even if you're sending to a transparent address
* Sapling funds need at least 5 confirmations before they can be spent
* Can select funds from multiple shielded addresses in the same transaction
* Will automatically shield your transparent funds at the first opportunity
    * When sending an outgoing transaction to a shielded address, Zecwallet-Lite can decide to use the transaction to additionally shield your transparent funds (i.e., send your transparent funds to your own shielded address in the same transaction)

## Compiling from source
* ZecWallet is written in C++ 14, and can be compiled with g++/clang++/visual c++. 
* It also depends on Qt5, which you can get from [here](https://www.qt.io/download). 
* You'll need Rust v1.37 +

### Building on Linux

```
git clone https://github.com/adityapk00/zecwallet-lite.git
cd zecwallet-lite
/path/to/qt5/bin/qmake zecwallet-lite.pro CONFIG+=debug
make -j$(nproc)

./zecwallet-lite
```
_PS: Zecwallet-Lite is NOT an official wallet, and is not affiliated with the Electric Coin Company in any way._
