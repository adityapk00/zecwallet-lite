#include "firsttimewizard.h"

#include "ui_newseed.h"
#include "ui_restoreseed.h"
#include "ui_newwallet.h"

#include "../lib/zecwalletlitelib.h"

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
    setTitle("Your new wallet");

    QWidget* pageWidget = new QWidget();
    Ui_NewSeedForm form;
    form.setupUi(pageWidget);

    QVBoxLayout *layout = new QVBoxLayout;
    layout->addWidget(pageWidget);
    
    setLayout(layout);

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
            tr("Couldn't save the wallet. Error") + "\n" + reply,
            QMessageBox::Ok);
        return false;
    } else {
        return true;
    }
}


RestoreSeedPage::RestoreSeedPage(FirstTimeWizard *parent) : QWizardPage(parent) {
    setTitle("Restore wallet from seed");

    QWidget* pageWidget = new QWidget();
    Ui_RestoreSeedForm form;
    form.setupUi(pageWidget);

    QVBoxLayout *layout = new QVBoxLayout;
    layout->addWidget(pageWidget);
    
    setLayout(layout);
}