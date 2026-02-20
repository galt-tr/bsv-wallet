# Task: Migrate All Agent Wallets to SPV-Native Schema

## What You Need to Do

1. Create `src/cli/migrate.ts` — a CLI command that:
   - Takes `--config <path>` (wallet-config.json) and `--db <path>` (wallet.db)
   - Backs up the DB first (copy to wallet.db.bak)
   - Opens wallet with the new schema (which auto-migrates via constructor)
   - For every UTXO in the DB:
     a. Fetch raw transaction from WhatsOnChain: `https://api.whatsonchain.com/v1/bsv/main/tx/${txid}/hex`
     b. Fetch merkle proof: `https://api.whatsonchain.com/v1/bsv/main/tx/${txid}/proof`
     c. Store raw tx in transactions table
     d. If proof exists, verify and mark UTXO as proven
   - Print summary: UTXOs migrated, proven count, balance before/after
   - Exit non-zero if balance changed (safety check)

2. Create `scripts/migrate-all-agents.sh` that runs the migration for each agent:
   - Treasury: `--config ~/.bsv-p2p/config.json --db ~/.bsv-p2p/wallet.db`
     NOTE: Treasury config uses `bsvPrivateKey` not `privateKey`, and has no `address` field
   - Coder: `--config ~/.openclaw/workspace-coder/wallet-config.json --db ~/.openclaw/workspace-coder/wallet.db`
   - Leto: `--config ~/.openclaw/workspace-leto/wallet-config.json --db ~/.openclaw/workspace-leto/wallet.db`
   - QA: `--config ~/.openclaw/workspace-qa/wallet-config.json --db ~/.openclaw/workspace-qa/wallet.db`
   - Writer: `--config ~/.openclaw/workspace-writer/wallet-config.json --db ~/.openclaw/workspace-writer/wallet.db`
   - Researcher: `--config ~/.openclaw/workspace-researcher/wallet-config.json --db ~/.openclaw/workspace-researcher/wallet.db`
   - Skip agents with no config (assistant has none)

3. Also add a `src/cli/verify.ts` command:
   - Takes same args
   - Checks every UTXO has a corresponding raw tx in transactions table
   - Checks proven status
   - Reports any gaps

## Key Details

- Wallet class is in `src/wallet.ts` — constructor already runs schema migrations
- `syncWithProofs()` method already exists and does most of the heavy lifting (fetches raw txs + merkle proofs)
- WhatsOnChain rate limit: be gentle, add 500ms delay between API calls
- The wallet constructor needs a private key — read it from config file
- Treasury config has `bsvPrivateKey` field (not `privateKey`)
- Agent configs have `privateKey` field

## Safety

- ALWAYS back up DB before migration
- Verify balance matches before and after
- If ANY wallet loses funds, abort immediately
- Log everything

## Build/Run

```bash
npx tsx src/cli/migrate.ts --config <path> --db <path>
npx tsx scripts/migrate-all-agents.sh
```

Do NOT actually run the migration. Just build the tools and commit.
