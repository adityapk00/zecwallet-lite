Zecwallet-Lite is z-Addr first, Sapling compatible wallet lightwallet for Zcash

## Compiling from source
* ZecWallet is written in C++ 14, and can be compiled with g++/clang++/visual c++. 
* It also depends on Qt5, which you can get from [here](https://www.qt.io/download). 
* You'll need Rust v1.37 +

### Building on Linux

```
git clone https://github.com/adityapk/zecwallet-lite.git
cd zecwallet-lite
/path/to/qt5/bin/qmake zecwallet-lite.pro CONFIG+=debug
make -j$(nproc)

./zecwallet-lite
```
_PS: Zecwallet-Lite is NOT an official wallet, and is not affiliated with the Electric Coin Company in any way._
