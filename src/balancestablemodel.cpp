#include "balancestablemodel.h"
#include "addressbook.h"
#include "settings.h"
#include "camount.h"


BalancesTableModel::BalancesTableModel(QObject *parent)
    : QAbstractTableModel(parent) {    
}

void BalancesTableModel::setNewData(const QList<QString> zaddrs, const QList<QString> taddrs,
    const QMap<QString, CAmount> balances, const QList<UnspentOutput> outputs)
{    
    loading = false;

    int currentRows = rowCount(QModelIndex());
    // Copy over the utxos for our use
    delete unspentOutputs;
    unspentOutputs = new QList<UnspentOutput>();

    // This is a QList deep copy.
    *unspentOutputs = outputs;

    // Process the address balances into a list
    delete modeldata;
    modeldata = new QList<std::tuple<QString, CAmount>>();
    std::for_each(balances.keyBegin(), balances.keyEnd(), [=] (auto keyIt) {
        modeldata->push_back(std::make_tuple(keyIt, balances.value(keyIt)));
    });

    // Add all addresses that have no balances as well
    for (auto zaddr: zaddrs) {
        if (!balances.contains(zaddr)) {
            modeldata->push_back(std::make_tuple(zaddr, CAmount::fromqint64(0)));
        }
    }

    for (auto taddr: taddrs) {
        if (!balances.contains(taddr)) {
            modeldata->push_back(std::make_tuple(taddr, CAmount::fromqint64(0)));
        }
    }

    // And then update the data
    dataChanged(index(0, 0), index(modeldata->size()-1, columnCount(index(0,0))-1));

    // Change the layout only if the number of rows changed
    if (modeldata && modeldata->size() != currentRows)
        layoutChanged();
}

BalancesTableModel::~BalancesTableModel() {
    delete modeldata;
    delete unspentOutputs;
}

int BalancesTableModel::rowCount(const QModelIndex&) const
{
    if (modeldata == nullptr) {
        if (loading) 
            return 1;
        else 
            return 0;
    }
    return modeldata->size();
}

int BalancesTableModel::columnCount(const QModelIndex&) const
{
    return 2;
}

QVariant BalancesTableModel::data(const QModelIndex &index, int role) const
{
    if (loading) {
        if (role == Qt::DisplayRole) 
            return "Loading...";
        else
            return QVariant();
    }

    if (role == Qt::TextAlignmentRole && index.column() == 1) return QVariant(Qt::AlignRight | Qt::AlignVCenter);
    
    if (role == Qt::ForegroundRole) {
        // If any of the UTXOs for this address has zero confirmations, paint it in red
        const auto& addr = std::get<0>(modeldata->at(index.row()));
        for (auto unconfirmedOutput : *unspentOutputs) {
            if (unconfirmedOutput.address == addr && 
                    (!unconfirmedOutput.spendable || unconfirmedOutput.pending)) {
                QBrush b;
                b.setColor(Qt::red);
                return b;
            }
        }

        // Else, just return the default brush
        QBrush b;
        b.setColor(Qt::black);
        return b;    
    }
    
    if (role == Qt::DisplayRole) {
        switch (index.column()) {
        case 0: return AddressBook::addLabelToAddress(std::get<0>(modeldata->at(index.row())));
        case 1: return std::get<1>(modeldata->at(index.row())).toDecimalZECString();
        }
    }

    if(role == Qt::ToolTipRole) {
        switch (index.column()) {
        case 0: return AddressBook::addLabelToAddress(std::get<0>(modeldata->at(index.row())));
        case 1: return std::get<1>(modeldata->at(index.row())).toDecimalZECString();
        }
    }
    
    return QVariant();
}


QVariant BalancesTableModel::headerData(int section, Qt::Orientation orientation, int role) const
{
    if (role == Qt::TextAlignmentRole && section == 1) {
        return QVariant(Qt::AlignRight | Qt::AlignVCenter);
    }

    if (role == Qt::FontRole) {
        QFont f;
        f.setBold(true);
        return f;
    }

    if (role != Qt::DisplayRole)
        return QVariant();

    if (orientation == Qt::Horizontal) {
        switch (section) {
        case 0:                 return tr("Address");
        case 1:                 return tr("Amount");
        default:                return QVariant();
        }
    }
    return QVariant();
}

