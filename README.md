# liquidator-bot-ts

Apricot's USDC-only liquidator. This is a simple liquidator that maintains inventory in USDC only. This means that:
- When it needs to repay in a token other than USDC, it will swap USDC to that token on the spot
- After it acquires collateral through liquidation, it will immediately swap that collateral back to USDC

How to launch:
```bash
yarn install
yarn build
# this launches it in indirect subscription mode
node dist/index.js public YOUR_LIQUIDATOR_PRIVATE_KEY.json 0 0
```

The liquidator bot has 2 modes of operation:
- Direct subscription mode (the hard, but possibly faster one)
- Indirect subscription mode (the easy one)

# Direct subscription mode
Under direct subscription mode, the liquidator bot subscribes to changes on the Solana chain directly via solana RPC
servers. In our experience, however, RPC connections can become unstable after some time (missing update notifications
etc.) so running the liquidator bot in this mode isn't always reliable. The Apricot team uses the attached `launcher.sh`
to launch a group of liquidators, and then periodically restart the liquidators (automated) to prevent any connection
issues from persisting.

Long story short, this mode is probably faster. However, it consumes a lot more resources and you'd need to launch
things using the `launcher.sh` script.

Launch command:
```
KEY_LOC=your_private_key.json launcher.sh
```

# Indirect subscription mode
Under the indirect subscription mode, the liquidator bot subscribes to a Google Firebase database maintained by the
Apricot team for candidate accounts that need to be liquidated. This mode is a lot ligher on resources and way easier to
run. But it could be slightly slower than the direct subscription mode (since it goes through another database layer).

Launch command:
```
node dist/index.js public liquidator_private_key.json 0 0
```


# Private key/wallet Set up

You need to set up a private key, give it enough SOL to fire transactions, and deposit X USDC into its
associated USDC account.

After that, you need to change `maxLiquidationSize` in `liquidator_config.json` to the maximum amount of liquidation you
are able to execute at once. I would just set it to slightly smaller than X.
