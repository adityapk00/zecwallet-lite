/* eslint-disable no-restricted-globals */
/* eslint-disable no-case-declarations */
/* eslint-disable vars-on-top */
/* eslint-disable no-restricted-syntax */
// @flow
import url from 'url';
import querystring from 'querystring';
import { Base64 } from 'js-base64';

import Utils from './utils';

export class ZcashURITarget {
  address: string;

  amount: number;

  label: string | null;

  message: string | null;

  memoBase64: string | null;

  memoString: string | null;
}

export const parseZcashURI = (uri: string): ZcashURITarget[] | string => {
  if (!uri || uri === '') {
    return 'Bad URI';
  }

  const parsedUri = url.parse(uri);
  if (!parsedUri || parsedUri.protocol !== 'zcash:' || !parsedUri.query) {
    return 'Bad URI';
  }

  if (!parsedUri || parsedUri.protocol !== 'zcash:' || !parsedUri.query) {
    return 'Invalid URI or protocol';
  }

  const targets: Map<number, ZcashURITarget> = new Map();

  // The first address is special, it can be the "host" part of the URI
  const address = parsedUri.host;
  if (address && !(Utils.isTransparent(address) || Utils.isZaddr(address))) {
    return `"${address || ''}" was not a valid zcash address`;
  }

  // Has to have at least 1 element
  const t = new ZcashURITarget();
  if (address) {
    t.address = address;
  }
  targets.set(0, t);

  // Go over all the query params
  const params = querystring.parse(parsedUri.query || '');
  for (const [q, value] of Object.entries(params)) {
    const [qName, qIdxS, extra] = q.split('.');
    if (typeof extra !== 'undefined') {
      return `${q} was not understood as a valid parameter`;
    }

    if (typeof value !== 'string') {
      return `Didn't understand param ${q}`;
    }

    const qIdx = parseInt(qIdxS, 10) || 0;

    if (!targets.has(parseInt(qIdx, 10))) {
      targets.set(qIdx, new ZcashURITarget());
    }

    const target = targets.get(qIdx);
    if (!target) {
      return `Unknown index ${qIdx}`;
    }

    switch (qName.toLowerCase()) {
      case 'address':
        if (typeof target.address !== 'undefined') {
          return `Duplicate param ${qName}`;
        }

        if (!(Utils.isTransparent(value) || Utils.isZaddr(value))) {
          return `${value} was not a recognized zcash address`;
        }
        target.address = value;
        break;
      case 'label':
        if (typeof target.label !== 'undefined') {
          return `Duplicate param ${qName}`;
        }
        target.label = value;
        break;
      case 'message':
        if (typeof target.message !== 'undefined') {
          return `Duplicate param ${qName}`;
        }
        target.message = value;
        break;
      case 'memo':
        if (typeof target.memoBase64 !== 'undefined') {
          return `Duplicate param ${qName}`;
        }

        // Parse as base64
        try {
          target.memoString = Base64.decode(value);
          target.memoBase64 = value;
        } catch (e) {
          return `Couldn't parse ${value} as base64`;
        }

        break;
      case 'amount':
        if (typeof target.amount !== 'undefined') {
          return `Duplicate param ${qName}`;
        }
        const a = parseFloat(value);
        if (isNaN(a)) {
          return `Amount ${value} could not be parsed`;
        }

        target.amount = a;
        break;
      default:
        return `Unknown parameter ${qName}`;
    }
  }

  // Make sure everyone has at least an amount and address
  for (const [key, value] of targets) {
    if (typeof value.amount === 'undefined') {
      return `URI ${key} didn't have an amount`;
    }

    if (typeof value.address === 'undefined') {
      return `URI ${key} didn't have an address`;
    }
  }

  // Convert to plain array
  const ans: ZcashURITarget[] = new Array(targets.size);
  targets.forEach((tgt, idx) => {
    ans[idx] = tgt;
  });

  return ans;
};
