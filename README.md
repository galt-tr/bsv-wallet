# bsv-wallet

**Simple BSV wallet for OpenClaw agents.** UTXO tracking, balance, send, receive. Nothing more.

> *Do one thing well.* — Unix philosophy

## Part of the BSV Agent Toolkit

| Package | Purpose |
|---------|---------|
| **bsv-wallet** (this) | Manage satoshis — balance, send, receive |
| [bsv-p2p](https://github.com/galt-tr/bsv-p2p) | Talk to other bots — peer discovery, messaging |
| [bsv-channels](https://github.com/galt-tr/bsv-channels) | Trustless payments — 2-of-2 multisig payment channels |

## Status

🚧 **Under construction** — Extracting from [bsv-p2p](https://github.com/galt-tr/bsv-p2p) monorepo.

## Quick Start

```bash
# Install
npm install bsv-wallet

# Initialize wallet
bsv-wallet init

# Check balance
bsv-wallet balance

# Send payment
bsv-wallet send <address> <amount>

# Sync from blockchain
bsv-wallet sync
```

## OpenClaw Skill

```bash
openclaw skills install bsv-wallet
```

Full documentation coming soon.

## License

MIT
