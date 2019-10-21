#!/bin/bash
if [ -z $QT_STATIC ]; then 
    echo "QT_STATIC is not set. Please set it to the base directory of a statically compiled Qt"; 
    exit 1; 
fi

if [ -z $APP_VERSION ]; then echo "APP_VERSION is not set"; exit 1; fi
if [ -z $PREV_VERSION ]; then echo "PREV_VERSION is not set"; exit 1; fi

if [ -z $hush_DIR ]; then
    echo "hush_DIR is not set. Please set it to the base directory of a hush project with built hush binaries."
    exit 1;
fi

if [ ! -f $hush_DIR/artifacts/hushd ]; then
    echo "Couldn't find hushd in $hush_DIR/artifacts/. Please build hushd."
    exit 1;
fi

if [ ! -f $hush_DIR/artifacts/hush-cli ]; then
    echo "Couldn't find hush-cli in $hush_DIR/artifacts/. Please build hushd."
    exit 1;
fi

# Ensure that hushd is the right build
echo -n "hushd version........."
if grep -q "zqwMagicBean" $hush_DIR/artifacts/hushd && ! readelf -s $hush_DIR/artifacts/hushd | grep -q "GLIBC_2\.25"; then 
    echo "[OK]"
else
    echo "[ERROR]"
    echo "hushd doesn't seem to be a zqwMagicBean build or hushd is built with libc 2.25"
    exit 1
fi

echo -n "hushd.exe version....."
if grep -q "zqwMagicBean" $hush_DIR/artifacts/hushd.exe; then 
    echo "[OK]"
else
    echo "[ERROR]"
    echo "hushd doesn't seem to be a zqwMagicBean build"
    exit 1
fi

echo -n "Version files.........."
# Replace the version number in the .pro file so it gets picked up everywhere
sed -i "s/${PREV_VERSION}/${APP_VERSION}/g" hush-qt-wallet.pro > /dev/null

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
$QT_STATIC/bin/qmake hush-qt-wallet.pro -spec linux-clang CONFIG+=release > /dev/null
echo "[OK]"


echo -n "Building..............."
rm -rf bin/hush-qt-wallet* > /dev/null
rm -rf bin/silentdragon* > /dev/null
make clean > /dev/null
make -j$(nproc) > /dev/null
echo "[OK]"


# Test for Qt
echo -n "Static link............"
if [[ $(ldd silentdragon | grep -i "Qt") ]]; then
    echo "FOUND QT; ABORT"; 
    exit 1
fi
echo "[OK]"


echo -n "Packaging.............."
mkdir bin/silentdragon-v$APP_VERSION > /dev/null
strip silentdragon

cp silentdragon                  bin/silentdragon-v$APP_VERSION > /dev/null
cp $hush_DIR/artifacts/hushd    bin/silentdragon-v$APP_VERSION > /dev/null
cp $hush_DIR/artifacts/hush-cli bin/silentdragon-v$APP_VERSION > /dev/null
cp README.md                      bin/silentdragon-v$APP_VERSION > /dev/null
cp LICENSE                        bin/silentdragon-v$APP_VERSION > /dev/null

cd bin && tar czf linux-silentdragon-v$APP_VERSION.tar.gz silentdragon-v$APP_VERSION/ > /dev/null
cd .. 

mkdir artifacts >/dev/null 2>&1
cp bin/linux-silentdragon-v$APP_VERSION.tar.gz ./artifacts/linux-binaries-silentdragon-v$APP_VERSION.tar.gz
echo "[OK]"


if [ -f artifacts/linux-binaries-silentdragon-v$APP_VERSION.tar.gz ] ; then
    echo -n "Package contents......."
    # Test if the package is built OK
    if tar tf "artifacts/linux-binaries-silentdragon-v$APP_VERSION.tar.gz" | wc -l | grep -q "6"; then 
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
debdir=bin/deb/silentdragon-v$APP_VERSION
mkdir -p $debdir > /dev/null
mkdir    $debdir/DEBIAN
mkdir -p $debdir/usr/local/bin

cat src/scripts/control | sed "s/RELEASE_VERSION/$APP_VERSION/g" > $debdir/DEBIAN/control

cp silentdragon                   $debdir/usr/local/bin/
cp $hush_DIR/artifacts/hushd $debdir/usr/local/bin/zqw-hushd

mkdir -p $debdir/usr/share/pixmaps/
cp res/silentdragon.xpm           $debdir/usr/share/pixmaps/

mkdir -p $debdir/usr/share/applications
cp src/scripts/desktopentry    $debdir/usr/share/applications/hush-qt-wallet.desktop

dpkg-deb --build $debdir >/dev/null
cp $debdir.deb                 artifacts/linux-deb-silentdragon-v$APP_VERSION.deb
echo "[OK]"



echo ""
echo "[Windows]"

if [ -z $MXE_PATH ]; then 
    echo "MXE_PATH is not set. Set it to ~/github/mxe/usr/bin if you want to build Windows"
    echo "Not building Windows"
    exit 0; 
fi

if [ ! -f $hush_DIR/artifacts/hushd.exe ]; then
    echo "Couldn't find hushd.exe in $hush_DIR/artifacts/. Please build hushd.exe"
    exit 1;
fi


if [ ! -f $hush_DIR/artifacts/hush-cli.exe ]; then
    echo "Couldn't find hush-cli.exe in $hush_DIR/artifacts/. Please build hushd.exe"
    exit 1;
fi

export PATH=$MXE_PATH:$PATH

echo -n "Configuring............"
make clean  > /dev/null
rm -f hush-qt-wallet-mingw.pro
rm -rf release/
#Mingw seems to have trouble with precompiled headers, so strip that option from the .pro file
cat hush-qt-wallet.pro | sed "s/precompile_header/release/g" | sed "s/PRECOMPILED_HEADER.*//g" > hush-qt-wallet-mingw.pro
echo "[OK]"


echo -n "Building..............."
x86_64-w64-mingw32.static-qmake-qt5 hush-qt-wallet-mingw.pro CONFIG+=release > /dev/null
make -j32 > /dev/null
echo "[OK]"


echo -n "Packaging.............."
mkdir release/silentdragon-v$APP_VERSION  
cp release/silentdragon.exe          release/silentdragon-v$APP_VERSION 
cp $hush_DIR/artifacts/hushd.exe    release/silentdragon-v$APP_VERSION > /dev/null
cp $hush_DIR/artifacts/hush-cli.exe release/silentdragon-v$APP_VERSION > /dev/null
cp README.md                          release/silentdragon-v$APP_VERSION 
cp LICENSE                            release/silentdragon-v$APP_VERSION 
cd release && zip -r Windows-binaries-silentdragon-v$APP_VERSION.zip silentdragon-v$APP_VERSION/ > /dev/null
cd ..

mkdir artifacts >/dev/null 2>&1
cp release/Windows-binaries-silentdragon-v$APP_VERSION.zip ./artifacts/
echo "[OK]"

if [ -f artifacts/Windows-binaries-silentdragon-v$APP_VERSION.zip ] ; then
    echo -n "Package contents......."
    if unzip -l "artifacts/Windows-binaries-silentdragon-v$APP_VERSION.zip" | wc -l | grep -q "11"; then 
        echo "[OK]"
    else
        echo "[ERROR]"
        exit 1
    fi
else
    echo "[ERROR]"
    exit 1
fi
