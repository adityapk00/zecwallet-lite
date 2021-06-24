import React from "react";
import cstyles from "./Common.module.css";
import Utils from "../utils/utils";

type BalanceBlockType = {
  zecValue: number;
  usdValue: string;
  currencyName: string;
  topLabel?: string;
  tooltip?: string;
};
export const BalanceBlockHighlight = ({ zecValue, usdValue, topLabel, currencyName, tooltip }: BalanceBlockType) => {
  const { bigPart, smallPart } = Utils.splitZecAmountIntoBigSmall(zecValue);

  return (
    <div style={{ padding: "1em" }} title={tooltip}>
      {topLabel && (
        <div className={[cstyles.small].join(" ")}>
          {topLabel}
          {tooltip && (
            <span>
              &nbsp;
              <i className={[cstyles.green, "fas", "fa-info-circle"].join(" ")} />
            </span>
          )}
        </div>
      )}

      <div className={[cstyles.highlight, cstyles.xlarge].join(" ")}>
        <span>
          {currencyName} {bigPart}
        </span>
        <span className={[cstyles.small, cstyles.zecsmallpart].join(" ")}>{smallPart}</span>
      </div>
      <div className={[cstyles.sublight, cstyles.small].join(" ")}>{usdValue}</div>
    </div>
  );
};

export const BalanceBlock = ({ zecValue, usdValue, topLabel, currencyName }: BalanceBlockType) => {
  const { bigPart, smallPart } = Utils.splitZecAmountIntoBigSmall(zecValue);

  return (
    <div className={cstyles.padall}>
      <div className={[cstyles.small].join(" ")}>{topLabel}</div>
      <div className={[cstyles.highlight, cstyles.large].join(" ")}>
        <span>
          {currencyName} {bigPart}
        </span>
        <span className={[cstyles.small, cstyles.zecsmallpart].join(" ")}>{smallPart}</span>
      </div>
      <div className={[cstyles.sublight, cstyles.small].join(" ")}>{usdValue}</div>
    </div>
  );
};
