import { Connection, Keypair } from '@solana/web3.js';
import { sleep, Throttler } from './utils';
import { PriceWatcher, UsersPageWatcher } from './AccountWatcher';
import { PoolIdToPrice } from './types';
import { LiquidationPlanner } from './LiquidationPlanner';
import invariant from 'tiny-invariant';
import * as fs from 'fs';
import {
  Addresses,
  ALPHA_CONFIG,
  assert,
  MINTS,
  PUBLIC_CONFIG,
  TokenID,
  TransactionBuilder,
} from '@apricot-lend/sdk-ts';
import { RAYDIUM_BTC_USDC_MARKET, RAYDIUM_ETH_USDC_MARKET, RAYDIUM_SOL_USDC_MARKET, Swapper } from '@apricot-lend/solana-swaps-js';
import * as swappers from '@apricot-lend/solana-swaps-js';

export const SUPPORTED_MARKETS: {[key in TokenID]?: Swapper} = {
  [TokenID.BTC]: RAYDIUM_BTC_USDC_MARKET,
  [TokenID.ETH]: RAYDIUM_ETH_USDC_MARKET,
  [TokenID.SOL]: RAYDIUM_SOL_USDC_MARKET,
};

export const TOK_ID_TRANSLATE = {
  [TokenID.BTC]: swappers.TokenID.BTC,
  [TokenID.ETH]: swappers.TokenID.ETH,
  [TokenID.SOL]: swappers.TokenID.SOL,
}

const date = new Date();
const dateStr = date.toISOString();
const dateStrSub = dateStr
  .substr(0, dateStr.indexOf('.'))
  .split(':')
  .join('-');
const updateTimedLogger = fs.createWriteStream(`./liquidator.updates.timed.${dateStrSub}`, {});
const actionTimedLogger = fs.createWriteStream(`./liquidator.actions.timed.${dateStrSub}`, {});

const [, , keyLocation, alphaStr, pageStart, pageEnd] = process.argv;

if (alphaStr !== 'alpha' && alphaStr !== 'public') {
  throw new Error('alphaStr should be either alpha or public');
}

invariant(parseInt(pageStart) >= 0);
invariant(parseInt(pageEnd) > parseInt(pageStart));

const config = alphaStr === 'alpha' ? ALPHA_CONFIG : PUBLIC_CONFIG;
assert(config !== null);
const addresses = new Addresses(config);
const keyStr = fs.readFileSync(keyLocation, 'utf8');
const privateKey = JSON.parse(keyStr);
const assistKeypair = Keypair.fromSecretKey(new Uint8Array(privateKey));

export class LiquidatorBot {
  priceWatchers: PriceWatcher[];
  pageWatchers: UsersPageWatcher[];
  builder: TransactionBuilder;

  maxLiquidationSize: number; // maximum liquidation value in USD
  maxTradeSlippage: number;   // trade slippage tolerance. Better <= 2, but if too tight will lead to certain trades not going through
  clearResidual: boolean;     // whether to sell extra tokens at the end of every liquidation tx

  constructor(
    public addresses: Addresses,
    public connection: Connection,
    public throttler: Throttler,
    public keypair: Keypair,
    public startPage: number,
    public endPage: number,
  ) {
    this.priceWatchers = [];
    this.pageWatchers = [];
    this.builder = new TransactionBuilder(addresses);

    this.maxLiquidationSize = 1000;
    this.maxTradeSlippage = 0.02; // 2%. Probably should never set this to greater than 3%
    this.clearResidual = true;
  }
  async step() {
    console.log(`================== ${new Date().toISOString()} ==================`);
    const poolIdToPrice = this.getPoolIdToPrice();
    for (const pageWatcher of this.pageWatchers) {
      const userInfoWatchers = Object.values(pageWatcher.walletStrToUserInfoWatcher);
      for (let uiw of userInfoWatchers) {
        // uiw could be undefined
        if (!uiw?.accountData) {
          continue;
        }
        const planner = new LiquidationPlanner(
          this,
          this.addresses.config,
          uiw.accountData,
          uiw.userWalletKey,
          poolIdToPrice,
        );
        // check for assist hook
        if (planner.shouldLiquidate()) {
          let nowTime = new Date().getTime();
          // at most fire once every 20 seconds
          if (nowTime - uiw.lastFireTime > 20 * 1000) {
            try {
              await planner.fireLiquidation(this.builder, this.connection, this.keypair, SUPPORTED_MARKETS, TOK_ID_TRANSLATE);
            } catch (e) {
              console.log(e);
            }
            uiw.lastFireTime = nowTime;
          }
        }
      }
    }
  }

  async start() {
    // 1. watch prices
    // 2. watch all user pages
    // 3. wait for prices to become available
    // 4. loop

    this.throttler.run();
    const watchedTokenIds = Object.keys(config.tokenIdToPoolId);

    // 1
    watchedTokenIds.forEach(async tokenId => {
      const mint = MINTS[tokenId as TokenID];
      const poolId = this.addresses.config.tokenIdToPoolId[tokenId as TokenID]!;
      this.priceWatchers.push(new PriceWatcher(this, poolId, mint));
    });

    // 2
    for (let pageId = this.startPage; pageId < this.endPage; pageId++) {
      this.pageWatchers.push(new UsersPageWatcher(this, pageId));
    }

    // 3
    while (this.priceWatchers.filter(priceWatcher => !priceWatcher.accountData).length > 0) {
      const unmetLength = this.priceWatchers.filter(
        priceWatcher => priceWatcher.accountData === null,
      ).length;
      console.log(unmetLength);
      await sleep(1000);
    }

    this.logAction('All prices loaded');

    // 4
    while (true) {
      this.logUpdate('Stepping');
      await this.step();
      await sleep(10 * 1000);
    }
  }

  logUpdate(str: string) {
    const time = new Date();
    updateTimedLogger.write(time.toISOString() + ': ' + str + '\n');
    console.log(str);
  }

  logAction(str: string) {
    const time = new Date();
    actionTimedLogger.write(time.toISOString() + ': ' + str + '\n');
    console.log(str);
  }
  getPoolIdToPrice(): PoolIdToPrice {
    const result: PoolIdToPrice = {};
    this.priceWatchers.forEach(pWatcher => {
      const poolId = pWatcher.poolId;
      const assetPrice = pWatcher.accountData!;
      console.log(assetPrice);
      result[poolId] = assetPrice.price_in_usd.toNumber();
    });
    return result;
  }
}

const connection = new Connection('https://lokidfxnwlabdq.main.genesysgo.net:8899/', 'confirmed');
const throttler = new Throttler(5);
const bot = new LiquidatorBot(
  addresses,
  connection,
  throttler,
  assistKeypair,
  parseInt(pageStart),
  parseInt(pageEnd),
);
bot.start();
