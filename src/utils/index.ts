export const sleep = async (interval = 10000) => {
  await new Promise(r => setTimeout(r, interval));
};

type Task = () => void;

export class Throttler {
  // Used by AccountWatcher to throttle getAccountInfo requests.
  // If we fire too many requests within a short time, window RPC server may refuse our requests.
  constructor(public interval: number, private readonly tasks: Task[] = []) {}

  addNext(f: Task) {
    this.tasks.push(f);
  }
  async run() {
    while (true) {
      if (this.tasks.length > 0) {
        const f = this.tasks.shift()!;
        f();
      }
      // 4 TPS
      await sleep(this.interval);
    }
  }
}

export const stringToEnumValue = <T, K extends keyof T>(
  enumObj: T,
  value: string,
): T[keyof T] | undefined =>
  enumObj[
    Object.keys(enumObj).filter(
      k => ((enumObj[k as K] as unknown) as string) === value,
    )[0] as keyof typeof enumObj
  ];

export const JSONStringifySupportBigInt = (object: Object) => {
  return JSON.stringify(
    object,
    (_key, value) => (typeof value === 'bigint' ? value.toString() : value), // return everything else unchanged
  );
};
