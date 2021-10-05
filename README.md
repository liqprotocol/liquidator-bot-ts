# liquidator-bot-ts

Apricot's USDC-only liquidator. This is a simple liquidator that maintains inventory in USDC only. This means that:
- When it needs to repay in a token other than USDC, it will swap USDC to that token on the spot
- After it acquires collateral through liquidation, it will immediately swap that collateral back to USDC

How to launch:
```
yarn install
yarn build
node dist/index.js YOUR_LIQUIDATOR_PRIVATE_KEY.json alpha START_PAGE END_PAGE
```

For the last command, a specific example:
```
node dist/index.js liquidator_private_key.json alpha 0 1
```

Note that Apricot keeps a list of all active users. This list is paginated. So when you specify `START_PAGE` and
`END_PAGE`, you're specifying which subset of users the liquidator bot is monitoring.


Currently only the Apricot alpha contract is active on mainnet. Subsequently when we launch our public mainnet contract,
the launch command would then change to:

```
node dist/index.js PRIVATE_KEY.json public START_PAGE END_PAGE
```
