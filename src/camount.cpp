#include "camount.h"
#include "settings.h"

#include "precompiled.h"

const int NUMPLACES = 8;
const qint64 COIN = 100000000;

double CAmount::toDecimalDouble() const {
    return static_cast<double>(this->amount) / COIN;
}

QString CAmount::toDecimalString() const {
    if (amount < 0) {
        CAmount negative(-1 * this->amount);
        return "-" + negative.toDecimalString();
    }

    int wholePart = amount / COIN;
    int decimalPart = amount % COIN;

    QString r = QString::number(wholePart);
    if (decimalPart > 0) {
        QString decimalPartStr = QString::number(decimalPart);
        r = r + "." + decimalPartStr.rightJustified(NUMPLACES, '0');

        // Trim tailing 0s
        while (r.right(1) == "0") {
            r = r.left(r.length() - 1);
        }
    }

    return r;
}

QString CAmount::toDecimalUSDString() const {
    double dblAmount = static_cast<double>(this->amount) / COIN;
    double price = Settings::getInstance()->getZECPrice();

    return "$" + QLocale(QLocale::English).toString(dblAmount*price, 'f', 2);
}

QString CAmount::toDecimalZECString() const {
    return this->toDecimalString() % " " % Settings::getTokenName();
}

QString CAmount::toDecimalZECUSDString() const {
    auto usdString = this->toDecimalUSDString();
    if (!usdString.isEmpty())
        return this->toDecimalZECString() % " (" % usdString % ")";
    else
        return this->toDecimalZECString();
}

CAmount CAmount::fromDecimalString(QString decimalString) {
    auto amtParts = decimalString.split(".");
    qint64 r = amtParts[0].toULongLong() * COIN;
    if (amtParts.length() == 2) {
        auto trailingZeros = QString("0").repeated(NUMPLACES - amtParts[1].length());
        r += QString(amtParts[1] + trailingZeros).toULongLong();
    }

    return CAmount(r);
}