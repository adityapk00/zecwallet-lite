#-------------------------------------------------
#
# Project created by QtCreator 2018-10-05T09:54:45
#
#-------------------------------------------------

QT       += core gui network

CONFIG += precompile_header

PRECOMPILED_HEADER = src/precompiled.h

QT += widgets
QT += websockets

TARGET = zecwallet-lite

TEMPLATE = app

# The following define makes your compiler emit warnings if you use
# any feature of Qt which has been marked as deprecated (the exact warnings
# depend on your compiler). Please consult the documentation of the
# deprecated API in order to know how to port your code away from it.
DEFINES += \
    QT_DEPRECATED_WARNINGS

INCLUDEPATH  += src/3rdparty/
INCLUDEPATH  += src/

RESOURCES     = application.qrc

MOC_DIR = bin
OBJECTS_DIR = bin
UI_DIR = src

CONFIG += c++14

SOURCES += \
    src/firsttimewizard.cpp \
    src/main.cpp \
    src/mainwindow.cpp \
    src/balancestablemodel.cpp \
    src/3rdparty/qrcode/BitBuffer.cpp \
    src/3rdparty/qrcode/QrCode.cpp \
    src/3rdparty/qrcode/QrSegment.cpp \
    src/settings.cpp \
    src/sendtab.cpp \
    src/txtablemodel.cpp \
    src/qrcodelabel.cpp \
    src/connection.cpp \
    src/fillediconlabel.cpp \
    src/addressbook.cpp \
    src/logger.cpp \
    src/addresscombo.cpp \
    src/websockets.cpp \
    src/mobileappconnector.cpp \
    src/recurring.cpp \
    src/requestdialog.cpp \
    src/memoedit.cpp \
    src/viewalladdresses.cpp \
    src/datamodel.cpp \
    src/controller.cpp \
    src/liteinterface.cpp \
    src/camount.cpp

HEADERS += \
    src/firsttimewizard.h \
    src/mainwindow.h \
    src/precompiled.h \
    src/balancestablemodel.h \
    src/3rdparty/qrcode/BitBuffer.hpp \
    src/3rdparty/qrcode/QrCode.hpp \
    src/3rdparty/qrcode/QrSegment.hpp \
    src/3rdparty/json/json.hpp \
    src/settings.h \
    src/txtablemodel.h \
    src/qrcodelabel.h \
    src/connection.h \
    src/fillediconlabel.h \
    src/addressbook.h \
    src/logger.h \
    src/addresscombo.h \
    src/websockets.h \
    src/mobileappconnector.h \
    src/recurring.h \
    src/requestdialog.h \
    src/memoedit.h \
    src/viewalladdresses.h \
    src/datamodel.h \
    src/controller.h \
    src/liteinterface.h \
    src/camount.h \
    lib/zecwalletlitelib.h 

FORMS += \
    src/encryption.ui \
    src/mainwindow.ui \
    src/migration.ui \
    src/newseed.ui \
    src/newwallet.ui \
    src/recurringpayments.ui \
    src/restoreseed.ui \
    src/settings.ui \
    src/about.ui \
    src/confirm.ui \
    src/privkey.ui \
    src/memodialog.ui \ 
    src/viewalladdresses.ui \
    src/connection.ui \
    src/addressbook.ui \
    src/mobileappconnector.ui \
    src/createzcashconfdialog.ui \
    src/recurringdialog.ui \
    src/newrecurring.ui \
    src/requestdialog.ui \
    src/recurringmultiple.ui 


TRANSLATIONS = res/zec_qt_wallet_es.ts \
               res/zec_qt_wallet_fr.ts \
               res/zec_qt_wallet_de.ts \
               res/zec_qt_wallet_pt.ts \
               res/zec_qt_wallet_it.ts \
               res/zec_qt_wallet_zh.ts \
               res/zec_qt_wallet_tr.ts 

include(singleapplication/singleapplication.pri)
DEFINES += QAPPLICATION_CLASS=QApplication

QMAKE_INFO_PLIST = res/Info.plist

win32: RC_ICONS = res/icon.ico
ICON = res/logo.icns

# Default rules for deployment.
qnx: target.path = /tmp/$${TARGET}/bin
else: unix:!android: target.path = /opt/$${TARGET}/bin
!isEmpty(target.path): INSTALLS += target


libsodium.target = $$PWD/res/libsodium.a
libsodium.commands = res/libsodium/buildlibsodium.sh

unix:        librust.target   = $$PWD/lib/target/release/libzecwalletlite.a
else:win32:  librust.target   = $$PWD/lib/target/x86_64-pc-windows-gnu/release/zecwalletlite.lib

unix:        librust.commands = $(MAKE) -C $$PWD/lib 
else:win32:  librust.commands = $(MAKE) -C $$PWD/lib winrelease

librust.depends = lib/Cargo.toml lib/src/lib.rs

librustclean.commands = "rm -rf $$PWD/lib/target"
distclean.depends += librustclean


QMAKE_EXTRA_TARGETS += librust libsodium librustclean distclean
QMAKE_CLEAN += $$PWD/lib/target/release/libzecwalletlite.a res/libsodium.a

win32: LIBS += -L$$PWD/lib/target/x86_64-pc-windows-gnu/release -lzecwalletlite -L$$PWD/res/ -llibsodium
else:macx: LIBS += -L$$PWD/lib/target/release -lzecwalletlite -framework Security -framework Foundation -L$$PWD/res/ -lsodium
else:unix: LIBS += -L$$PWD/lib/target/release -lzecwalletlite -ldl -L$$PWD/res/ -lsodium

win32: PRE_TARGETDEPS += $$PWD/lib/target/x86_64-pc-windows-gnu/release/zecwalletlite.lib $$PWD/res/liblibsodium.a
else:unix::PRE_TARGETDEPS += $$PWD/lib/target/release/libzecwalletlite.a $$PWD/res/libsodium.a

INCLUDEPATH += $$PWD/res
DEPENDPATH += $$PWD/res

DISTFILES +=
