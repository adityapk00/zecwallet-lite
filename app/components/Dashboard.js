/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable no-plusplus */
/* eslint-disable react/prop-types */
// @flow
import React, { Component } from 'react';
import {
  AccordionItemButton,
  AccordionItem,
  AccordionItemHeading,
  AccordionItemPanel,
  Accordion
} from 'react-accessible-accordion';
import styles from './Dashboard.css';
import cstyles from './Common.css';
import { TotalBalance, Info, AddressBalance } from './AppState';
import Utils from '../utils/utils';
import ScrollPane from './ScrollPane';
import { BalanceBlockHighlight, BalanceBlock } from './BalanceBlocks';

const AddressBalanceItem = ({ currencyName, zecPrice, item }) => {
  const { bigPart, smallPart } = Utils.splitZecAmountIntoBigSmall(Math.abs(item.balance));

  return (
    <AccordionItem key={item.label} className={[cstyles.well, cstyles.margintopsmall].join(' ')} uuid={item.address}>
      <AccordionItemHeading>
        <AccordionItemButton className={cstyles.accordionHeader}>
          <div className={[cstyles.flexspacebetween].join(' ')}>
            <div>
              <div>{Utils.splitStringIntoChunks(item.address, 6).join(' ')}</div>
              {item.containsPending && (
                <div className={[cstyles.red, cstyles.small, cstyles.padtopsmall].join(' ')}>
                  Some transactions are pending. Balances may change.
                </div>
              )}
            </div>
            <div className={[styles.txamount, cstyles.right].join(' ')}>
              <div>
                <span>
                  {currencyName} {bigPart}
                </span>
                <span className={[cstyles.small, cstyles.zecsmallpart].join(' ')}>{smallPart}</span>
              </div>
              <div className={[cstyles.sublight, cstyles.small, cstyles.padtopsmall].join(' ')}>
                {Utils.getZecToUsdString(zecPrice, Math.abs(item.balance))}
              </div>
            </div>
          </div>
        </AccordionItemButton>
      </AccordionItemHeading>
      <AccordionItemPanel />
    </AccordionItem>
  );
};

type Props = {
  totalBalance: TotalBalance,
  info: Info,
  addressesWithBalance: AddressBalance[]
};

export default class Home extends Component<Props> {
  render() {
    const { totalBalance, info, addressesWithBalance } = this.props;

    const anyPending = addressesWithBalance && addressesWithBalance.find(i => i.containsPending);

    return (
      <div>
        <div className={[cstyles.well, cstyles.containermargin].join(' ')}>
          <div className={cstyles.balancebox}>
            <BalanceBlockHighlight
              zecValue={totalBalance.total}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.total)}
              currencyName={info.currencyName}
            />
            <BalanceBlock
              topLabel="Shielded"
              zecValue={totalBalance.private}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.private)}
              currencyName={info.currencyName}
            />
            <BalanceBlock
              topLabel="Transparent"
              zecValue={totalBalance.transparent}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.transparent)}
              currencyName={info.currencyName}
            />
          </div>
          <div>
            {anyPending && (
              <div className={[cstyles.red, cstyles.small, cstyles.padtopsmall].join(' ')}>
                Some transactions are pending. Balances may change.
              </div>
            )}
          </div>
        </div>

        <div className={styles.addressbalancecontainer}>
          <ScrollPane offsetHeight={200}>
            <div className={styles.addressbooklist}>
              <div className={[cstyles.flexspacebetween, cstyles.tableheader, cstyles.sublight].join(' ')}>
                <div>Address</div>
                <div>Balance</div>
              </div>
              {addressesWithBalance &&
                (addressesWithBalance.length === 0 ? (
                  <div className={[cstyles.center, cstyles.sublight].join(' ')}>No Addresses with a balance</div>
                ) : (
                  <Accordion>
                    {addressesWithBalance
                      .filter(ab => ab.balance > 0)
                      .map(ab => (
                        <AddressBalanceItem
                          key={ab.address}
                          item={ab}
                          currencyName={info.currencyName}
                          zecPrice={info.zecPrice}
                        />
                      ))}
                  </Accordion>
                ))}
            </div>
          </ScrollPane>
        </div>
      </div>
    );
  }
}
