import React from 'react';
import cstyles from './Common.css';
import Utils from '../utils/utils';

// eslint-disable-next-line react/prop-types
export const BalanceBlockHighlight = ({ zecValue, usdValue, topLabel, currencyName }) => {
  const { bigPart, smallPart } = Utils.splitZecAmountIntoBigSmall(zecValue);

  return (
    <div style={{ padding: '1em' }}>
      {topLabel && <div className={[cstyles.small].join(' ')}>{topLabel}</div>}
      <div className={[cstyles.highlight, cstyles.xlarge].join(' ')}>
        <span>
          {currencyName} {bigPart}
        </span>
        <span className={[cstyles.small, cstyles.zecsmallpart].join(' ')}>{smallPart}</span>
      </div>
      <div className={[cstyles.sublight, cstyles.small].join(' ')}>{usdValue}</div>
    </div>
  );
};

// eslint-disable-next-line react/prop-types
export const BalanceBlock = ({ zecValue, usdValue, topLabel, currencyName }) => {
  const { bigPart, smallPart } = Utils.splitZecAmountIntoBigSmall(zecValue);

  return (
    <div className={cstyles.padall}>
      <div className={[cstyles.small].join(' ')}>{topLabel}</div>
      <div className={[cstyles.highlight, cstyles.large].join(' ')}>
        <span>
          {currencyName} {bigPart}
        </span>
        <span className={[cstyles.small, cstyles.zecsmallpart].join(' ')}>{smallPart}</span>
      </div>
      <div className={[cstyles.sublight, cstyles.small].join(' ')}>{usdValue}</div>
    </div>
  );
};
