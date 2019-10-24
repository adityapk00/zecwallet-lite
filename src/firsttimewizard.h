#ifndef FIRSTTIMEWIZARD_H
#define FIRSTTIMEWIZARD_H

#include "precompiled.h"

class FirstTimeWizard: public QWizard
{
public:
    FirstTimeWizard(bool dangerous, QString server);

protected:
    int nextId() const;

private:
    enum {
        Page_NewOrRestore,
        Page_New,
        Page_Restore
    };

    bool dangerous;
    QString server;

    friend class NewOrRestorePage;
    friend class NewSeedPage;
    friend class RestoreSeedPage;
};

class NewOrRestorePage: public QWizardPage {
public:
    NewOrRestorePage(FirstTimeWizard* parent);
};


class NewSeedPage: public QWizardPage {
public:
    NewSeedPage(FirstTimeWizard* parent);
protected:
    bool validatePage();    
};


class RestoreSeedPage: public QWizardPage {
public:
    RestoreSeedPage(FirstTimeWizard* parent);
};



#endif // FIRSTTIMEWIZARD_H
