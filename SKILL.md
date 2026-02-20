# bsv-wallet — BSV Wallet Skill

> Manage BSV satoshis. Balance, send, receive, sync.

## Installation

```bash
# Clone and install
git clone https://github.com/galt-tr/bsv-wallet.git
cd bsv-wallet && npm install && npm run build

# Install as OpenClaw plugin
openclaw plugins install -l ./extensions/bsv-wallet

# Restart gateway
openclaw gateway restart
```

## Setup

```bash
# Initialize wallet (generates keys, creates config)
bsv-wallet init
```

## Agent Tools

| Tool | Description |
|------|-------------|
| `wallet_balance` | Check current wallet balance |
| `wallet_send` | Send BSV to an address |
| `wallet_sync` | Sync UTXOs from blockchain |
| `wallet_receive` | Show deposit address |
| `wallet_history` | Transaction history |

## Related Skills

- [bsv-p2p](https://github.com/galt-tr/bsv-p2p) — Peer discovery and messaging
- [bsv-channels](https://github.com/galt-tr/bsv-channels) — Payment channels (requires this skill)
