SilenDragonLite is z-Addr first, Sapling compatible wallet lightwallet for hush still in very experimental status! Use it on your own Risk!

## Compiling from source
* silentdragon is written in C++ 14, and can be compiled with g++/clang++/visual c++. 
* It also depends on Qt5, which you can get from [here](https://www.qt.io/download). 
* You'll need Rust v1.37 +

### Building on Linux

```
git clone https://github.com/DenioD/SilenDragonLite.git
cd silentdragon
/path/to/qt5/bin/qmake silentdragon-lite.pro CONFIG+=debug
make -j$(nproc)

./silentdragon
```
Right now, you'll also need to run `lightwalletd` on your local machine for silentdragon to connect to. 

_PS: silentdragon is NOT an official wallet, and is not affiliated with the Electric Coin Company in any way._
