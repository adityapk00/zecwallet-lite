#ifndef CAMOUNT_H
#define CAMOUNT_H

#include "precompiled.h"

class CAmount {
private:
    CAmount(qint64 amount) {
        this->amount = amount;
    }

    qint64 amount;

public:
    static CAmount fromDecimalString(QString decimalString);
    static CAmount fromqint64(qint64 a) {
        return CAmount(a);
    }
    static CAmount fromDouble(double d) {
        return CAmount::fromDecimalString(QString::number(d, 'f', 8));
    }

    CAmount() : amount(0) {};
    CAmount(const CAmount&) = default;
    ~CAmount() = default;

    double  toDecimalDouble() const;
    QString toDecimalString() const;
    QString toDecimalUSDString() const;
    QString toDecimalZECString() const;
    QString toDecimalZECUSDString() const;
    qint64  toqint64() const { return amount; };

    CAmount operator+ (const CAmount& other) const {
        return CAmount(this->amount + other.amount);
    }  

    CAmount operator- (const CAmount& other) const {
        return CAmount(this->amount - other.amount);
    }

    bool operator< (const CAmount& other) const {
        return this->amount < other.amount;
    }

    bool operator< (const qint64& other) const {
        return this->amount < other;
    }

    bool operator> (const CAmount& other) const {
        return this->amount > other.amount;
    }
};

#endif // CAMOUNT_H
