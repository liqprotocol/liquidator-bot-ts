import { PriceWatcher } from './AccountWatcher';
import { TokenID } from '@apricot-lend/sdk-ts';

export type PoolIdToPriceWatcher = {
  [id in TokenID]?: PriceWatcher;
};

export type PoolIdToPrice = Record<number, number>;
