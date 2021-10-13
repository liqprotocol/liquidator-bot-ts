import { AccountInfo, PublicKey } from '@solana/web3.js';
import invariant from 'tiny-invariant';
import { UserInfo, AccountParser, AssetPrice } from '@apricot-lend/sdk-ts';
import { LiquidatorBot } from '.';

export abstract class AccountWatcher {
  public abstract accountData?: unknown;
  protected children: { [key: string]: AccountWatcher } = {};
  private watchedKey: PublicKey | null = null;
  private subId?: number;

  constructor(public bot: LiquidatorBot) {}

  async init(watchedKey: PublicKey) {
    invariant(watchedKey, `${AccountWatcher.name}: invalid watched key`);
    this.watchedKey = watchedKey;

    this.bot.throttler.addNext(() => {
      this.bot.connection.getAccountInfo(this.watchedKey!).then(value => {
        console.log('updated at ' + this.watchedKey?.toString());
        this.onUpdate(value);
      });
      this.subId = this.bot.connection.onAccountChange(
        this.watchedKey!,
        (value, _ctx) => {
          this.onUpdate(value);
        },
        'confirmed',
      );
    });
  }
  async unsub() {
    invariant(this.subId, `${AccountWatcher.name}: invalid subId for unsub`);
    await this.bot.connection.removeAccountChangeListener(this.subId);
    Object.values(this.children).forEach(child => child.unsub());
  }
  abstract onUpdate(accountInfo: unknown): void;
}

export class UsersPageWatcher extends AccountWatcher {
  public pageId: number;
  public walletStrToUserInfoWatcher: { [key: string]: UserInfoWatcher } = {};
  public accountData: PublicKey[] = [];

  constructor(bot: LiquidatorBot, pageId: number) {
    super(bot);
    this.pageId = pageId;
    this.children = this.walletStrToUserInfoWatcher;
    const initializer = async () => {
      const [basePda] = await this.bot.addresses.getBasePda();
      this.init(await this.bot.addresses.getUsersPageKey(basePda, this.pageId));
    };
    initializer();
  }

  onUpdate(accountInfo: AccountInfo<Buffer>) {
    if (accountInfo === null) {
      console.log(`page ${this.pageId} not created`);
      return;
    }
    this.accountData = AccountParser.parseUsersPage(new Uint8Array(accountInfo.data));
    const walletStrList = this.accountData
      .map(k => k.toString())
      .filter(k => k !== '11111111111111111111111111111111');

    const walletStrSet = new Set(walletStrList);
    console.log(`${UsersPageWatcher.name}: wallets got at page ${this.pageId}:\n`, walletStrSet);

    // if user no longer exists on page, remove it
    Object.keys(this.walletStrToUserInfoWatcher).forEach(async walletStr => {
      if (!walletStrSet.has(walletStr)) {
        // TODO: make sure it should be async or sync
        await this.removeUser(walletStr);
      }
    });

    // if user not found in previous cache, add it
    walletStrList.forEach(walletStr => {
      if (!this.walletStrToUserInfoWatcher.hasOwnProperty(walletStr)) {
        this.addUser(walletStr);
      }
    });
  }

  private addUser(walletStr: string) {
    const walletKey = new PublicKey(walletStr);
    this.walletStrToUserInfoWatcher[walletStr] = new UserInfoWatcher(this.bot, walletKey);
  }

  private async removeUser(walletStr: string) {
    await this.walletStrToUserInfoWatcher[walletStr].unsub();
    delete this.walletStrToUserInfoWatcher[walletStr];
  }
}

export class UserInfoWatcher extends AccountWatcher {
  public userWalletKey: PublicKey;
  public accountData?: UserInfo;
  public lastFireTime = 0;

  constructor(bot: LiquidatorBot, userWalletKey: PublicKey) {
    super(bot);
    this.userWalletKey = userWalletKey;
    const initializer = async () => {
      this.init(await this.bot.addresses.getUserInfoKey(this.userWalletKey));
    };
    initializer();
  }

  onUpdate(accountInfo: AccountInfo<Buffer>) {
    this.accountData = AccountParser.parseUserInfo(new Uint8Array(accountInfo.data));
  }
}

export class PriceWatcher extends AccountWatcher {
  public accountData?: AssetPrice;

  constructor(bot: LiquidatorBot, public poolId: number, public mintKey: PublicKey) {
    super(bot);
    const initializer = async () => {
      const [pricePda] = await this.bot.addresses.getPricePda();
      this.init(await this.bot.addresses.getAssetPriceKey(pricePda, mintKey.toString()));
    };
    initializer();
  }

  onUpdate(accountInfo: AccountInfo<Buffer>) {
    this.accountData = AccountParser.parseAssetPrice(new Uint8Array(accountInfo.data));
  }
}
