#include "firsttimewizard.h"

#include "ui_newseed.h"
#include "ui_restoreseed.h"
#include "ui_newwallet.h"

#include "../lib/silentdragonlitelib.h"

using json = nlohmann::json;

FirstTimeWizard::FirstTimeWizard(bool dangerous, QString server)
{
    setWindowTitle("New wallet wizard");
    this->dangerous = dangerous;
    this->server = server;

    // Create the pages
    setPage(Page_NewOrRestore, new NewOrRestorePage(this));
    setPage(Page_New, new NewSeedPage(this));
    setPage(Page_Restore,new RestoreSeedPage(this));
}

int FirstTimeWizard::nextId() const {
    switch (currentId()) {
        case Page_NewOrRestore:
            if (field("intro.new").toBool()) {
                return Page_New;
            } else {
                return Page_Restore;
            }            
        case Page_New:
        case Page_Restore:
        default:
            return -1;
    }
}

NewOrRestorePage::NewOrRestorePage(FirstTimeWizard *parent) : QWizardPage(parent) {
    setTitle("Create or Restore wallet.");

    QWidget* pageWidget = new QWidget();
    Ui_CreateWalletForm form;
    form.setupUi(pageWidget);

    // Exclusive buttons
    QObject::connect(form.radioNewWallet,  &QRadioButton::clicked, [=](bool checked) {
        if (checked) {
            form.radioRestoreWallet->setChecked(false);
        }
    });

    QObject::connect(form.radioRestoreWallet, &QRadioButton::clicked, [=](bool checked) {
        if (checked) {
            form.radioNewWallet->setChecked(false);
        }
    });
    form.radioNewWallet->setChecked(true);

    registerField("intro.new", form.radioNewWallet);

    QVBoxLayout *layout = new QVBoxLayout;
    layout->addWidget(pageWidget);
    setLayout(layout);
    setCommitPage(true);
    setButtonText(QWizard::CommitButton, "Next");
}

NewSeedPage::NewSeedPage(FirstTimeWizard *parent) : QWizardPage(parent) {
    this->parent = parent;

    setTitle("Your new wallet");

    QWidget* pageWidget = new QWidget();
    form.setupUi(pageWidget);

    QVBoxLayout *layout = new QVBoxLayout;
    layout->addWidget(pageWidget);
    
    setLayout(layout);
}

void NewSeedPage::initializePage() {
    // Call the library to create a new wallet.
    char* resp = litelib_initialize_new(parent->dangerous, parent->server.toStdString().c_str());
    QString reply = litelib_process_response(resp);

    auto parsed = json::parse(reply.toStdString().c_str(), nullptr, false);
    if (parsed.is_discarded() || parsed.is_null() || parsed.find("seed") == parsed.end()) {
        form.txtSeed->setPlainText(tr("Error creating a wallet") + "\n" + reply);
    } else {
        QString seed = QString::fromStdString(parsed["seed"].get<json::string_t>());
        form.txtSeed->setPlainText(seed);
    }
}

// Will be called just before closing. Make sure we can save the seed in the wallet
// before we allow the page to be closed
bool NewSeedPage::validatePage() {
    char* resp = litelib_execute("save", "");
    QString reply = litelib_process_response(resp);

    auto parsed = json::parse(reply.toStdString().c_str(), nullptr, false);
    if (parsed.is_discarded() || parsed.is_null() || parsed.find("result") == parsed.end()) {
        QMessageBox::warning(this, tr("Failed to save wallet"), 
            tr("Couldn't save the wallet") + "\n" + reply,
            QMessageBox::Ok);
        return false;
    } else {
        return true;
    }
}


RestoreSeedPage::RestoreSeedPage(FirstTimeWizard *parent) : QWizardPage(parent) {
    this->parent = parent;

    setTitle("Restore wallet from seed");

    QWidget* pageWidget = new QWidget();
    form.setupUi(pageWidget);

    QVBoxLayout *layout = new QVBoxLayout;
    layout->addWidget(pageWidget);
    
    setLayout(layout);
}

bool RestoreSeedPage::validatePage() {
    // 1. Validate that we do have 24 words
    QString seed = form.txtSeed->toPlainText().replace(QRegExp("[ \n\r\t]+"), " ");
    if (seed.trimmed().split(" ").length() != 24) {
        QMessageBox::warning(this, tr("Failed to restore wallet"), 
            tr("SilentDragonLite needs 24 words to restore wallet"),
            QMessageBox::Ok);
        return false;
    }

    // 2. Validate birthday
    QString birthday_str = form.txtBirthday->text();
    bool ok;
    qint64 birthday = birthday_str.toUInt(&ok);
    if (!ok) {
        QMessageBox::warning(this, tr("Failed to parse wallet birthday"), 
            tr("Couldn't understand wallet birthday. This should be a block height from where to rescan the wallet. You can leave it as '0' if you don't know what it should be."),
            QMessageBox::Ok);
        return false;
    }

    // 3. Attempt to restore wallet with the seed phrase
    {
        char* resp = litelib_initialize_new_from_phrase(parent->dangerous, parent->server.toStdString().c_str(),
                seed.toStdString().c_str(), birthday);
        QString reply = litelib_process_response(resp);

        if (reply.toUpper().trimmed() != "OK") {
            QMessageBox::warning(this, tr("Failed to restore wallet"), 
                tr("Couldn't restore the wallet") + "\n" + reply,
                QMessageBox::Ok);
            return false;
        } 
    }

    // 4. Finally attempt to save the wallet
    {
        char* resp = litelib_execute("save", "");
        QString reply = litelib_process_response(resp);

        auto parsed = json::parse(reply.toStdString().c_str(), nullptr, false);
        if (parsed.is_discarded() || parsed.is_null() || parsed.find("result") == parsed.end()) {
            QMessageBox::warning(this, tr("Failed to save wallet"), 
                tr("Couldn't save the wallet") + "\n" + reply,
                QMessageBox::Ok);
            return false;
        } else {
            return true;
        }         
    }
}