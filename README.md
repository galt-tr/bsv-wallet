# bsv-wallet

**Simple BSV wallet for OpenClaw agents.** UTXO tracking, balance, send, receive. A minimal Bitcoin SV wallet library and CLI designed specifically for bot-to-bot payments. Manages your satoshis with SQLite persistence, blockchain sync via WhatsOnChain, and direct transaction broadcasting. No frills, no dependencies you don't need — just a working BSV wallet that gets out of your way.

> *Do one thing well.* — Unix philosophy

---

## Table of Contents

1. [Part of the BSV Agent Toolkit](#part-of-the-bsv-agent-toolkit)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Funding Your Wallet](#funding-your-wallet)
5. [Usage](#usage)
6. [OpenClaw Plugin Setup](#openclaw-plugin-setup)
7. [Agent Tool Reference](#agent-tool-reference)
8. [Troubleshooting](#troubleshooting)
9. [Architecture](#architecture)
10. [Next Steps](#next-steps)

---

## Part of the BSV Agent Toolkit

| Package | Purpose |
|---------|---------|
| **bsv-wallet** (this) | Manage satoshis — balance, send, receive |
| [bsv-p2p](https://github.com/galt-tr/bsv-p2p) | Talk to other bots — peer discovery, messaging |
| [bsv-channels](https://github.com/galt-tr/bsv-channels) | Trustless payments — 2-of-2 multisig payment channels |

Use `bsv-wallet` for initial funding and simple payments. For micropayments between agents at scale, see `bsv-channels`.

---

## Installation

### Via npm

```bash
npm install bsv-wallet
```

The CLI command `bsv-wallet` will be available after install.

### Manual (from source)

```bash
# Clone the repo
git clone https://github.com/galt-tr/bsv-wallet.git
cd bsv-wallet

# Install dependencies
npm install

# Build TypeScript
npm run build

# Link CLI globally (optional)
npm link
```

### Via OpenClaw Skill

If you're running OpenClaw, install the wallet as a skill:

```bash
openclaw skills install bsv-wallet
```

This gives your agents direct access to wallet tools (see [Agent Tool Reference](#agent-tool-reference)).

---

## Configuration

### Quick Start — Generate a Wallet

```bash
bsv-wallet init
```

**Expected output:**
```
Wallet initialized!
Address: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
Config:  /home/you/.bsv-wallet/config.json
DB:      /home/you/.bsv-wallet/wallet.db

Fund your wallet by sending BSV to the address above.
```

**What this does:**
- Generates a random secp256k1 private key
- Derives a P2PKH (Pay-to-PubKey-Hash) address
- Creates `~/.bsv-wallet/config.json` with your keys
- Creates an empty SQLite database at `~/.bsv-wallet/wallet.db`

### Config File Structure

**Location:** `~/.bsv-wallet/config.json`

```json
{
  "privateKey": "5Kb8kLf9zgWQnogidDA76MzPL6TsZZY36hWXMssSzNydYXYB9KF",
  "publicKey": "04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f",
  "address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "dbPath": "/home/you/.bsv-wallet/wallet.db",
  "createdAt": "2026-02-20T12:00:00.000Z"
}
```

**Fields:**
- `privateKey` — Your private key in hex format. **Keep this secret.** Anyone with this can spend your funds.
- `publicKey` — Your public key (derived from private key).
- `address` — Your BSV address for receiving payments (P2PKH format).
- `dbPath` — Path to the SQLite database where UTXOs are tracked.
- `createdAt` — Timestamp of wallet creation.

⚠️ **Security Note:** The `config.json` file contains your private key in plaintext. Protect it:
- Set permissions: `chmod 600 ~/.bsv-wallet/config.json`
- Never commit it to git
- Never share it
- Back it up securely (encrypted backup recommended)

### OpenClaw Agent Workspaces

When running as an OpenClaw agent, wallets are stored per-agent:

```
~/.openclaw/workspace-{agent-name}/wallet-config.json
~/.openclaw/workspace-{agent-name}/wallet.db
```

The OpenClaw plugin will automatically detect and use these workspace-specific wallets.

---

## Funding Your Wallet

Your wallet is empty until you send BSV to it. Here's how to fund it:

### 1. Get Your Address

```bash
bsv-wallet address
```

**Output:**
```
1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
```

### 2. Send BSV to That Address

Use any BSV wallet (HandCash, Money Button, ElectrumSV, etc.) to send satoshis to your address.

**Minimum recommended:** 10,000 sats (~$0.05 USD at $5/BSV)

### 3. Sync to Detect Incoming Payments

```bash
bsv-wallet sync
```

**Expected output:**
```
Syncing from blockchain...
Found 1 new UTXOs
Balance: 10000 sats
```

The `sync` command queries WhatsOnChain API for UTXOs belonging to your address and records them in the local database.

**When to sync:**
- After receiving a payment
- After restoring from a backup
- If your balance looks wrong

---

## Usage

### Check Balance

```bash
bsv-wallet balance
```

**Output:**
```
Balance: 10000 sats
UTXOs:   1
```

### Show Deposit Address

```bash
bsv-wallet address
```

**Output:**
```
1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
```

### Send Payment

```bash
bsv-wallet send <recipient-address> <amount-in-sats>
```

**Example:**
```bash
bsv-wallet send 1BitcoinEaterAddressDontSendf59kuE 5000
```

**Output:**
```
Sent 5000 sats to 1BitcoinEaterAddressDontSendf59kuE
TXID: a1b2c3d4e5f6...
```

**How it works:**
1. Selects enough UTXOs to cover the amount + fee (default: 200 sats)
2. Builds a transaction with:
   - Input(s) from your UTXOs
   - Output to recipient (specified amount)
   - Change output back to you (if any)
3. Signs with your private key
4. Broadcasts to WhatsOnChain
5. Marks spent UTXOs in your database
6. Records change as a new UTXO

**Transaction fees:**
- Default: 200 sats per transaction
- Hardcoded for simplicity (not adjustable via CLI)
- If you need custom fees, use the library API directly

### View Transaction History

```bash
bsv-wallet history
```

**Output:**
```
Total: 3 UTXOs

  ✓ unspent  4800 sats  a1b2c3d4e5f6...:1
  ✗ spent    5000 sats  b2c3d4e5f6a1...:0 (sent to 1BitcoinEater...)
  ✓ unspent  10000 sats  c3d4e5f6a1b2...:0
```

**Symbols:**
- `✓ unspent` — Available to spend
- `✗ spent` — Already used in a transaction

### Sync from Blockchain

```bash
bsv-wallet sync
```

**Output:**
```
Syncing from blockchain...
Found 2 new UTXOs
Balance: 15000 sats
```

**When this is needed:**
- You received a payment from someone else
- You restored your wallet from backup
- Your balance is incorrect (emergency resync)

---

## OpenClaw Plugin Setup

The `bsv-wallet` package includes an OpenClaw plugin that registers wallet tools for agent use.

### Install Plugin

```bash
# Clone and build
git clone https://github.com/galt-tr/bsv-wallet.git
cd bsv-wallet && npm install && npm run build

# Install as OpenClaw plugin
openclaw plugins install -l ./extensions/bsv-wallet

# Restart gateway for changes to take effect
openclaw gateway restart
```

### Verify Installation

```bash
openclaw plugins list
```

You should see `bsv-wallet` in the list of active plugins.

### Plugin Tool Loading

The plugin will automatically detect your wallet location:

1. **Agent workspace:** `~/.openclaw/workspace-{agent-id}/wallet-config.json`
2. **Default:** `~/.bsv-wallet/config.json`
3. **Legacy (bsv-p2p):** `~/.bsv-p2p/config.json`

The first matching path is used.

---

## Agent Tool Reference

When the OpenClaw plugin is active, agents have access to these tools:

### `wallet_balance`

**Description:** Check your BSV wallet balance.

**Parameters:** None

**Returns:**
```json
{
  "balance": 10000,
  "utxoCount": 1,
  "address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
}
```

**Example usage (from an agent):**
```
Check my wallet balance.
```

---

### `wallet_send`

**Description:** Send BSV satoshis to an address.

**Parameters:**
- `address` (string, required) — Destination BSV address
- `amount` (number, required) — Amount in satoshis

**Returns:**
```json
{
  "txid": "a1b2c3d4e5f6...",
  "remainingBalance": 4800
}
```

**Example usage:**
```
Send 5000 sats to 1BitcoinEaterAddressDontSendf59kuE
```

---

### `wallet_sync`

**Description:** Sync wallet UTXOs from the blockchain. Call after receiving payments.

**Parameters:** None

**Returns:**
```json
{
  "newUtxos": 1,
  "balance": 10000,
  "utxoCount": 1
}
```

**Example usage:**
```
Sync my wallet with the blockchain.
```

---

### `wallet_receive`

**Description:** Show your BSV deposit address. Share this to receive payments.

**Parameters:** None

**Returns:**
```json
{
  "address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
}
```

**Example usage:**
```
What's my BSV address?
```

---

### `wallet_history`

**Description:** Show UTXO history — all tracked unspent and spent outputs.

**Parameters:** None

**Returns:**
```json
{
  "total": 3,
  "unspent": [
    {
      "id": "a1b2c3d4:1",
      "txid": "a1b2c3d4e5f6...",
      "vout": 1,
      "satoshis": 4800,
      "spent": false,
      "receivedAt": 1708438800000
    }
  ],
  "spent": [
    {
      "id": "b2c3d4e5:0",
      "txid": "b2c3d4e5f6a1...",
      "vout": 0,
      "satoshis": 5000,
      "spent": true,
      "spentTxid": "c3d4e5f6a1b2...",
      "receivedAt": 1708438700000
    }
  ]
}
```

**Example usage:**
```
Show my wallet transaction history.
```

---

## Troubleshooting

### Problem: `No wallet configured. Run: bsv-wallet init`

**Cause:** You haven't initialized a wallet yet.

**Fix:**
```bash
bsv-wallet init
```

---

### Problem: `Insufficient balance: have 1000, need 5200`

**Cause:** You're trying to send more satoshis than you have (including the 200 sat transaction fee).

**Fix:**
1. Check your balance: `bsv-wallet balance`
2. Fund your wallet: Send more BSV to your address
3. Sync: `bsv-wallet sync`
4. Try again with a lower amount

---

### Problem: `Failed to fetch UTXOs: 404 Not Found`

**Cause:** Your address has never been used on-chain, or WhatsOnChain API is down.

**Fix:**
1. Verify your address: `bsv-wallet address`
2. Check if you've received any transactions at that address using a block explorer: https://whatsonchain.com
3. If the API is down, wait and retry

---

### Problem: Balance is wrong after sending

**Cause:** Local database is out of sync with blockchain state.

**Fix:**
```bash
bsv-wallet sync
```

This will re-fetch all UTXOs from WhatsOnChain and update your local balance.

---

### Problem: `Broadcast failed: ...`

**Possible causes:**
- Insufficient balance (you don't have enough to cover amount + fee)
- Invalid recipient address
- UTXO already spent (double-spend attempt)
- WhatsOnChain API error

**Fix:**
1. Verify recipient address is valid
2. Check your balance: `bsv-wallet balance`
3. Sync your wallet: `bsv-wallet sync`
4. Check WhatsOnChain status: https://whatsonchain.com
5. If persistent, check logs for detailed error

---

### Problem: Lost access to my wallet

**Cause:** Deleted `config.json` or lost the private key.

**Recovery:**
- **If you have a backup of `config.json`:** Restore it to `~/.bsv-wallet/config.json`
- **If you wrote down your private key:** Create a new `config.json` manually with the key
- **If you have neither:** Your funds are unrecoverable. This is Bitcoin. Not your keys, not your coins.

**Prevention:**
- Back up `~/.bsv-wallet/config.json` securely
- Consider encrypting your backup
- Store it somewhere safe (encrypted USB, password manager, etc.)

---

### Problem: OpenClaw plugin not loading

**Symptoms:** Agents don't have `wallet_*` tools available.

**Fix:**
1. Verify plugin is installed:
   ```bash
   openclaw plugins list
   ```
2. If not listed, reinstall:
   ```bash
   cd ~/bsv-wallet
   openclaw plugins install -l ./extensions/bsv-wallet
   ```
3. Restart gateway:
   ```bash
   openclaw gateway restart
   ```
4. Check plugin logs in `~/.openclaw/logs/`

---

### Problem: Permission denied when accessing wallet files

**Cause:** Incorrect file permissions on `config.json` or `wallet.db`.

**Fix:**
```bash
chmod 600 ~/.bsv-wallet/config.json
chmod 644 ~/.bsv-wallet/wallet.db
```

---

## Architecture

### How UTXOs Are Tracked

BSV uses a UTXO (Unspent Transaction Output) model. Each "coin" is represented as an output from a previous transaction.

**Example flow:**
1. Alice sends you 10,000 sats → Creates a UTXO: `txid_abc:0` with 10,000 sats
2. You send Bob 6,000 sats → Spends `txid_abc:0`, creates:
   - UTXO `txid_def:0` → 6,000 sats (to Bob)
   - UTXO `txid_def:1` → 3,800 sats (change back to you, after 200 sat fee)
3. Your wallet now has 3,800 sats available (from `txid_def:1`)

**Key concepts:**
- **UTXO:** An unspent transaction output — money you can spend
- **Spent UTXO:** Already used as input to another transaction (historical record)
- **Balance:** Sum of all unspent UTXOs you control

### Database Schema

**Location:** `~/.bsv-wallet/wallet.db` (SQLite)

**Table: `utxos`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | PRIMARY KEY — `{txid}:{vout}` |
| `txid` | TEXT | Transaction ID |
| `vout` | INTEGER | Output index |
| `satoshis` | INTEGER | Amount in satoshis |
| `script_pub_key` | TEXT | Locking script (hex) |
| `from_peer_id` | TEXT | Peer ID if received via P2P (optional) |
| `memo` | TEXT | Payment memo (optional) |
| `received_at` | INTEGER | Unix timestamp (ms) |
| `spent` | INTEGER | 0 = unspent, 1 = spent |
| `spent_txid` | TEXT | TXID that spent this UTXO (if spent) |

**Constraints:**
- `UNIQUE(txid, vout)` — Prevents duplicate UTXOs
- Primary key on `id` for fast lookups

**WAL Mode:** Enabled for better concurrent read performance.

### Blockchain Sync Strategy

1. **On `wallet.sync()`:**
   - Queries WhatsOnChain API: `GET /address/{address}/unspent`
   - Fetches full transaction hex for each UTXO
   - Parses locking script from the transaction output
   - Inserts new UTXOs into database (skips duplicates)

2. **On `wallet.send()`:**
   - Selects UTXOs to cover amount + fee
   - Builds transaction with inputs/outputs
   - Signs with private key
   - Broadcasts to WhatsOnChain
   - Marks spent UTXOs in database
   - Records change output as new UTXO

3. **Local-first:** All balance/history queries hit the local SQLite database, not the blockchain. This is fast but requires occasional syncing.

### Transaction Building

**Steps:**
1. **Select UTXOs:** Pick enough unspent outputs to cover `amount + fee`
2. **Fetch source transactions:** Download full transaction hex for each UTXO (needed for signing)
3. **Build transaction:**
   - Inputs: Selected UTXOs with P2PKH unlocking scripts
   - Outputs:
     - Payment output (amount to recipient)
     - Change output (remainder back to you, if > 546 sats dust limit)
4. **Sign:** Use private key to sign each input
5. **Broadcast:** POST transaction hex to WhatsOnChain
6. **Update database:** Mark spent UTXOs, record change

**Dependencies:**
- `@bsv/sdk` — Low-level Bitcoin primitives (keys, transactions, scripts)
- `better-sqlite3` — Fast SQLite bindings for UTXO tracking
- WhatsOnChain API — Blockchain query and broadcasting

---

## Next Steps

Once you've got your wallet funded and working, explore the rest of the BSV agent toolkit:

### 1. Peer-to-Peer Networking

**Package:** [bsv-p2p](https://github.com/galt-tr/bsv-p2p)

Build direct bot-to-bot communication networks:
- Libp2p-based peer discovery
- Encrypted messaging
- Payment notifications
- Multicast channels

**When to use:** When your agents need to talk to each other directly (no central server).

### 2. Payment Channels

**Package:** [bsv-channels](https://github.com/galt-tr/bsv-channels)

Trustless micropayment channels between bots:
- 2-of-2 multisig escrow
- Off-chain payment updates
- nSequence-based timelock protection
- Cooperative or unilateral channel close

**When to use:** When you need high-frequency micropayments (streaming sats, pay-per-API-call, etc.). Much more efficient than on-chain transactions.

---

## Contributing

Contributions welcome! This project follows the Unix philosophy — if you're adding complexity, you'd better have a damn good reason.

**Contribution guidelines:**
- Keep it simple
- No dependencies you don't absolutely need
- Write tests for new features
- Update documentation

**Testing:**
```bash
npm run test
```

**Linting:**
```bash
npm run lint
```

---

## License

MIT — See [LICENSE](./LICENSE) for details.

---

## Questions?

- **Issues:** https://github.com/galt-tr/bsv-wallet/issues
- **BSV Docs:** https://docs.bsvblockchain.org
- **OpenClaw:** https://openclaw.ai

---

**Built for agents, by agents.** 🤖⚡
