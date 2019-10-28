#!/bin/bash
if [ -z $QT_STATIC ]; then 
    echo "QT_STATIC is not set. Please set it to the base directory of a statically compiled Qt"; 
    exit 1; 
fi

if [ -z $APP_VERSION ]; then echo "APP_VERSION is not set"; exit 1; fi
if [ -z $PREV_VERSION ]; then echo "PREV_VERSION is not set"; exit 1; fi

echo -n "Version files.........."
# Replace the version number in the .pro file so it gets picked up everywhere
sed -i "s/${PREV_VERSION}/${APP_VERSION}/g" zecwallet-lite.pro > /dev/null

# Also update it in the README.md
sed -i "s/${PREV_VERSION}/${APP_VERSION}/g" README.md > /dev/null
echo "[OK]"

echo -n "Cleaning..............."
rm -rf bin/*
rm -rf artifacts/*
make distclean >/dev/null 2>&1
echo "[OK]"

echo ""
echo "[Building on" `lsb_release -r`"]"

echo -n "Configuring............"
QT_STATIC=$QT_STATIC bash src/scripts/dotranslations.sh >/dev/null
$QT_STATIC/bin/qmake zecwallet-lite.pro -spec linux-clang CONFIG+=release > /dev/null
echo "[OK]"


echo -n "Building..............."
rm -rf bin/zecwallet* > /dev/null
# Build the lib first
cd lib && make release && cd ..
make -j$(nproc) > /dev/null
echo "[OK]"


# Test for Qt
echo -n "Static link............"
if [[ $(ldd zecwallet-lite | grep -i "Qt") ]]; then
    echo "FOUND QT; ABORT"; 
    exit 1
fi
echo "[OK]"


echo -n "Packaging.............."
mkdir bin/zecwallet-lite-v$APP_VERSION > /dev/null
strip zecwallet-lite

cp zecwallet-lite                 bin/zecwallet-lite-v$APP_VERSION > /dev/null
cp README.md                      bin/zecwallet-lite-v$APP_VERSION > /dev/null
cp LICENSE                        bin/zecwallet-lite-v$APP_VERSION > /dev/null

cd bin && tar czf linux-zecwallet-lite-v$APP_VERSION.tar.gz zecwallet-lite-v$APP_VERSION/ > /dev/null
cd .. 

mkdir artifacts >/dev/null 2>&1
cp bin/linux-zecwallet-lite-v$APP_VERSION.tar.gz ./artifacts/linux-binaries-zecwallet-lite-v$APP_VERSION.tar.gz
echo "[OK]"


if [ -f artifacts/linux-binaries-zecwallet-lite-v$APP_VERSION.tar.gz ] ; then
    echo -n "Package contents......."
    # Test if the package is built OK
    if tar tf "artifacts/linux-binaries-zecwallet-lite-v$APP_VERSION.tar.gz" | wc -l | grep -q "4"; then 
        echo "[OK]"
    else
        echo "[ERROR]"
        exit 1
    fi    
else
    echo "[ERROR]"
    exit 1
fi

echo -n "Building deb..........."
debdir=bin/deb/zecwallet-lite-v$APP_VERSION
mkdir -p $debdir > /dev/null
mkdir    $debdir/DEBIAN
mkdir -p $debdir/usr/local/bin

cat src/scripts/control | sed "s/RELEASE_VERSION/$APP_VERSION/g" > $debdir/DEBIAN/control

cp zecwallet-lite                   $debdir/usr/local/bin/

mkdir -p $debdir/usr/share/pixmaps/
cp res/zecwallet-lite.xpm           $debdir/usr/share/pixmaps/

mkdir -p $debdir/usr/share/applications
cp src/scripts/desktopentry    $debdir/usr/share/applications/zecwallet-lite.desktop

dpkg-deb --build $debdir >/dev/null
cp $debdir.deb                 artifacts/linux-deb-zecwallet-lite-v$APP_VERSION.deb
echo "[OK]"



echo ""
echo "[Windows]"

if [ -z $MXE_PATH ]; then 
    echo "MXE_PATH is not set. Set it to ~/github/mxe/usr/bin if you want to build Windows"
    echo "Not building Windows"
    exit 0; 
fi

export PATH=$MXE_PATH:$PATH

echo -n "Configuring............"
make clean  > /dev/null
#rm -f zec-qt-wallet-mingw.pro
rm -rf release/
#Mingw seems to have trouble with precompiled headers, so strip that option from the .pro file
#cat zec-qt-wallet.pro | sed "s/precompile_header/release/g" | sed "s/PRECOMPILED_HEADER.*//g" > zec-qt-wallet-mingw.pro
echo "[OK]"


echo -n "Building..............."
# Build the lib first
cd lib && make winrelease && cd ..
x86_64-w64-mingw32.static-qmake-qt5 zecwallet-lite.pro CONFIG+=release > /dev/null
make -j32 > /dev/null
echo "[OK]"


echo -n "Packaging.............."
mkdir release/zecwallet-lite-v$APP_VERSION  
cp release/zecwallet-lite.exe          release/zecwallet-lite-v$APP_VERSION 
cp README.md                          release/zecwallet-lite-v$APP_VERSION 
cp LICENSE                            release/zecwallet-lite-v$APP_VERSION 
cd release && zip -r Windows-binaries-zecwallet-lite-v$APP_VERSION.zip zecwallet-lite-v$APP_VERSION/ > /dev/null
cd ..

mkdir artifacts >/dev/null 2>&1
cp release/Windows-binaries-zecwallet-lite-v$APP_VERSION.zip ./artifacts/
echo "[OK]"

if [ -f artifacts/Windows-binaries-zecwallet-lite-v$APP_VERSION.zip ] ; then
    echo -n "Package contents......."
    if unzip -l "artifacts/Windows-binaries-zecwallet-lite-v$APP_VERSION.zip" | wc -l | grep -q "9"; then 
        echo "[OK]"
    else
        echo "[ERROR]"
        exit 1
    fi
else
    echo "[ERROR]"
    exit 1
fi
