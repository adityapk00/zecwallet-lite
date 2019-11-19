#!/bin/bash

# Accept the variables as command line arguments as well
POSITIONAL=()
while [[ $# -gt 0 ]]
do
key="$1"

case $key in
    -q|--qt_path)
    QT_PATH="$2"
    shift # past argument
    shift # past value
    ;;
    -c|--certificate)
    CERTIFICATE="$2"
    shift # past argument
    shift # past value
    ;;
    -v|--version)
    APP_VERSION="$2"
    shift # past argument
    shift # past value
    ;;
    *)    # unknown option
    POSITIONAL+=("$1") # save it in an array for later
    shift # past argument
    ;;
esac
done
set -- "${POSITIONAL[@]}" # restore positional parameters

if [ -z $QT_PATH ]; then 
    echo "QT_PATH is not set. Please set it to the base directory of Qt"; 
    exit 1; 
fi

if [ -z $CERTIFICATE ]; then 
    echo "CERTIFICATE is not set. Please set it the name of the MacOS developer certificate to sign the binary with"; 
    exit 1; 
fi

if [ -z $APP_VERSION ]; then
    echo "APP_VERSION is not set. Please set it to the current release version of the app";
    exit 1;
fi

if ! cat src/version.h | grep -q "$APP_VERSION"; then
    echo "Version mismatch in src/version.h"
    exit 1
fi

export PATH=$PATH:/usr/local/bin

#Clean
echo -n "Cleaning..............."
make distclean >/dev/null 2>&1
rm -f artifacts/macOS-zecwallet-v$APP_VERSION.dmg 
rm -rf Zecwallet-Lite.app/ zecwallet-lite.app/
echo "[OK]"


echo -n "Configuring............"
# Build
QT_STATIC=$QT_PATH src/scripts/dotranslations.sh >/dev/null
$QT_PATH/bin/qmake zecwallet-lite.pro CONFIG+=release >/dev/null
echo "[OK]"


echo -n "Building..............."
make -j4 >/dev/null
echo "[OK]"

#Qt deploy
echo -n "Deploying.............."
mkdir artifacts >/dev/null 2>&1
rm -f artifcats/zecwallet-lite.dmg >/dev/null 2>&1
rm -f artifacts/rw* >/dev/null 2>&1
$QT_PATH/bin/macdeployqt zecwallet-lite.app 
codesign --deep --force --verify --verbose -s "$CERTIFICATE" --options runtime --timestamp zecwallet-lite.app/
echo "[OK]"


# Code Signing Note:
# On MacOS, you still need to run these 3 commands:
# xcrun altool --notarize-app -t osx -f macOS-zecwallet-lite-v1.0.0.dmg --primary-bundle-id="com.yourcompany.zecwallet-lite" -u "apple developer id@email.com" -p "one time password" 
# xcrun altool --notarization-info <output from pervious command> -u "apple developer id@email.com" -p "one time password" 
#...wait for the notarization to finish...
# xcrun stapler staple macOS-zecwallet-lite-v1.0.0.dmg

echo -n "Building dmg..........."
mv zecwallet-lite.app Zecwallet-Lite.app
create-dmg --volname "Zecwallet-Lite-v$APP_VERSION" --volicon "res/logo.icns" --window-pos 200 120 --icon "Zecwallet-Lite.app" 200 190  --app-drop-link 600 185 --hide-extension "Zecwallet-Lite.app"  --window-size 800 400 --hdiutil-quiet --background res/dmgbg.png  artifacts/macOS-zecwallet-lite-v$APP_VERSION.dmg Zecwallet-Lite.app >/dev/null 2>&1

if [ ! -f artifacts/macOS-zecwallet-lite-v$APP_VERSION.dmg ]; then
    echo "[ERROR]"
    exit 1
fi
echo  "[OK]"
