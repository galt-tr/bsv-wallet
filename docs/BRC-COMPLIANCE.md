# BRC Compliance Reference

**Status:** Minimal compliance (v1.0)  
**Last Updated:** February 20, 2026

This document tracks `bsv-wallet`'s compliance with Bitcoin SV BRCs (Bitcoin Request for Comments) and provides a roadmap for full implementation.

---

## Table of Contents

1. [Current Compliance Status](#current-compliance-status)
2. [BRC-12: Raw Transaction Format](#brc-12-raw-transaction-format)
3. [BRC-62: BEEF Format](#brc-62-beef-format) ❌
4. [BRC-67: SPV Verification](#brc-67-spv-verification) ❌
5. [BRC-74: BUMP Merkle Paths](#brc-74-bump-merkle-paths) ❌
6. [BRC-100: Wallet Interface](#brc-100-wallet-interface) ❌
7. [Implementation Roadmap](#implementation-roadmap)
8. [References](#references)

---

## Current Compliance Status

| BRC | Standard | Status | Implementation |
|-----|----------|--------|----------------|
| **BRC-12** | Raw Transaction Format | ✅ **Compliant** | Via `@bsv/sdk` Transaction class |
| **BRC-62** | BEEF Format | ❌ Not implemented | Planned for v2.0 |
| **BRC-67** | SPV Verification | ❌ Not implemented | Planned for v2.0 |
| **BRC-74** | BUMP Merkle Paths | ❌ Not implemented | Planned for v2.0 |
| **BRC-100** | Wallet Interface | ⚠️ Partial | Custom API (not BRC-100 aligned) |

### Design Philosophy

`bsv-wallet` is intentionally minimal. Version 1.0 focuses on:
- UTXO tracking
- Basic send/receive functionality
- Simple balance queries
- SQLite persistence

Full BRC compliance (BEEF, SPV, BUMP) is planned for v2.0 when payment channel integration and trustless verification become critical.

---

## BRC-12: Raw Transaction Format

**Status:** ✅ **Fully Compliant**

### Specification

[BRC-12](https://bsv.brc.dev/transactions/0012) defines the standard binary format for Bitcoin transactions:
- Version (4 bytes)
- Input count (varint)
- Inputs (txid + vout + scriptSig + sequence)
- Output count (varint)
- Outputs (value + scriptPubKey)
- Locktime (4 bytes)

### Implementation

Via `@bsv/sdk`'s `Transaction` class:

```typescript
import { Transaction } from '@bsv/sdk'

// Building transactions
const tx = new Transaction()
tx.addInput({ ... })
tx.addOutput({ ... })
await tx.sign()

// Serialization
const rawTx = tx.toHex()           // BRC-12 hex format
const rawBytes = tx.toBinary()     // BRC-12 binary format

// Parsing
const parsedTx = Transaction.fromHex(rawTx)
```

**Evidence:**
- `src/wallet.ts:185-204` — Transaction building in `send()` method
- `src/services.ts:53` — Transaction parsing from hex
- Test coverage: `test/wallet.test.ts`

### Compliance Details

- ✅ Standard input/output structure
- ✅ Proper signature serialization (SIGHASH flags)
- ✅ P2PKH script templates
- ✅ Fee calculation and UTXO selection
- ✅ Change output handling (dust limit: 546 sats)

---

## BRC-62: BEEF Format

**Status:** ❌ **Not Implemented**

### Specification

[BRC-62](https://bsv.brc.dev/transactions/0062) defines BEEF (Background Evaluation Extended Format):
- Self-contained transaction bundles
- Embedded merkle proofs for all inputs
- Allows SPV verification without blockchain queries
- Compact binary encoding

### Current Gap

`bsv-wallet` currently broadcasts raw transactions and relies on WhatsOnChain for UTXO verification. No BEEF support means:
- Recipients must trust blockchain indexers
- No trustless payment verification
- Cannot operate in fully offline mode

### Example BEEF Structure

```
BEEF Envelope:
┌─────────────────────────┐
│ Version (4 bytes)       │
├─────────────────────────┤
│ BUMPs (merkle proofs)   │  ← BRC-74 data
├─────────────────────────┤
│ Transactions (raw)      │  ← BRC-12 data
└─────────────────────────┘
```

### What's Needed

**Build BEEF:**
```typescript
interface BEEFBuilder {
  addTransaction(tx: Transaction, merkleProof: MerkleProof): void
  serialize(): Buffer  // BEEF binary format
}
```

**Parse BEEF:**
```typescript
interface BEEFParser {
  parse(beefData: Buffer): {
    version: number
    bumps: BUMP[]
    transactions: Transaction[]
  }
  verify(): boolean  // SPV verification
}
```

**Integration Points:**
1. `wallet.send()` — Instead of broadcasting raw hex, construct BEEF with merkle proofs
2. `wallet.recordPayment()` — Accept BEEF envelopes, verify SPV, extract UTXO
3. Storage — Save BEEF data for audit trail

**Dependencies:**
- BRC-74 (BUMP) implementation
- BRC-67 (SPV) verification logic
- ChainTracker for merkle proof fetching

**Estimated Effort:** 3-5 days for basic BEEF support

---

## BRC-67: SPV Verification

**Status:** ❌ **Not Implemented**

### Specification

[BRC-67](https://bsv.brc.dev/transactions/0067) defines Simplified Payment Verification:

**4-Step Verification Process:**
1. **Merkle Root Validation** — Verify transaction is in a block
2. **Chain Verification** — Confirm block is in longest chain
3. **Block Depth Check** — Require minimum confirmations
4. **Transaction Parsing** — Validate transaction structure

### Current Gap

`bsv-wallet` trusts WhatsOnChain API completely:
```typescript
// Currently: just fetch and believe
const tx = await fetchTransaction(txid)
const utxos = await fetchUTXOs(address)
```

No SPV means:
- Trusting third-party indexers
- Vulnerable to API spoofing
- Cannot verify payment authenticity

### SPV Verification Flow

```
┌─────────────────────────────────────────────┐
│ 1. Fetch Transaction + Merkle Proof (BUMP) │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 2. Compute Merkle Root from Proof          │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 3. Fetch Block Header                       │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 4. Verify Merkle Root Matches Header        │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 5. Check Header is in Longest Chain         │
│    (via ChainTracker or header chain sync)  │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 6. Verify Sufficient Depth (6+ blocks)      │
└─────────────────────────────────────────────┘
                    ↓
                  ✅ Valid
```

### Implementation Requirements

**SPV Verifier Interface:**
```typescript
interface SPVVerifier {
  verifyTransaction(
    tx: Transaction,
    merkleProof: BUMP,
    requiredDepth?: number
  ): Promise<{
    valid: boolean
    blockHash: string
    blockHeight: number
    depth: number
    merkleRoot: string
  }>
}
```

**ChainTracker Integration:**
```typescript
interface ChainTracker {
  getHeader(hash: string): Promise<BlockHeader>
  getHeaderByHeight(height: number): Promise<BlockHeader>
  isInLongestChain(hash: string): Promise<boolean>
  getChainTip(): Promise<{ hash: string; height: number }>
}
```

**Database Schema Extension:**
```sql
CREATE TABLE block_headers (
  hash TEXT PRIMARY KEY,
  height INTEGER NOT NULL,
  version INTEGER NOT NULL,
  previous_hash TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  bits INTEGER NOT NULL,
  nonce INTEGER NOT NULL,
  verified INTEGER DEFAULT 0,
  UNIQUE(height)
);

CREATE INDEX idx_headers_height ON block_headers(height);
CREATE INDEX idx_headers_previous ON block_headers(previous_hash);
```

**Estimated Effort:** 5-7 days (including ChainTracker integration)

---

## BRC-74: BUMP Merkle Paths

**Status:** ❌ **Not Implemented**

### Specification

[BRC-74](https://bsv.brc.dev/transactions/0074) defines BUMP (Bitcoin Unified Merkle Path):
- Compact merkle proof format
- Supports multiple transactions in one proof
- Enables efficient SPV verification
- Required for BRC-62 (BEEF)

### BUMP Structure

```typescript
interface BUMP {
  blockHeight: number         // Which block
  path: Array<{
    offset: number            // Position in merkle tree
    hash?: string             // Duplicate marker (if undefined)
    txid?: boolean            // Is this the target txid?
  }>
}
```

**Example:**
```
Block 800000 merkle tree:
       ROOT
      /    \
    H1      H2
   /  \    /  \
  A    B  C    D
  
If verifying tx B:
BUMP = {
  blockHeight: 800000,
  path: [
    { offset: 0, hash: A },      // Sibling at level 0
    { offset: 1, hash: H2 }      // Sibling at level 1
  ]
}

Verification:
  merkle(B, A) = H1
  merkle(H1, H2) = ROOT
  ROOT matches block header ✅
```

### Current Gap

No merkle proof storage or verification:
```typescript
// Currently: no proof tracking
interface TrackedUTXO {
  txid: string
  vout: number
  satoshis: number
  // ❌ No merkle proof
  // ❌ No block height
  // ❌ No verification status
}
```

### Implementation Requirements

**BUMP Storage:**
```typescript
interface StoredBUMP {
  txid: string
  blockHeight: number
  blockHash: string
  merkleRoot: string
  path: Array<{ offset: number; hash?: string }>
  verified: boolean
  verifiedAt?: number
}
```

**Database Schema:**
```sql
CREATE TABLE bumps (
  txid TEXT PRIMARY KEY,
  block_height INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  path_json TEXT NOT NULL,     -- JSON-encoded merkle path
  verified INTEGER DEFAULT 0,
  verified_at INTEGER,
  FOREIGN KEY (txid) REFERENCES utxos(txid)
);

CREATE INDEX idx_bumps_block ON bumps(block_height);
```

**BUMP Builder:**
```typescript
interface BUMPBuilder {
  buildProof(txid: string, blockHash: string): Promise<BUMP>
  verifyProof(txid: string, bump: BUMP): boolean
  serializeBUMP(bump: BUMP): Buffer
  parseBUMP(data: Buffer): BUMP
}
```

**Integration:**
- Fetch BUMP from WhatsOnChain: `GET /tx/{txid}/proof`
- Store alongside UTXO
- Verify before marking payment as confirmed

**Estimated Effort:** 2-3 days

---

## BRC-100: Wallet Interface

**Status:** ⚠️ **Partial Compliance**

### Specification

[BRC-100](https://bsv.brc.dev/wallet/0100) defines a standardized wallet interface:
- `createAction()` — Build transactions with labeled inputs/outputs
- `internalizeAction()` — Process received transactions
- `listActions()` — Query transaction history
- `listOutputs()` — Query UTXOs
- Action-based model (not raw transaction primitives)

### Current Implementation

`bsv-wallet` uses a simpler API:

```typescript
// Current (non-BRC-100)
wallet.send(toAddress, amount)           // ❌ Not BRC-100
wallet.getUTXOs()                        // ❌ Not BRC-100
wallet.getBalance()                      // ❌ Not BRC-100
wallet.sync()                            // ❌ Not BRC-100
```

**vs. BRC-100 Standard:**

```typescript
// BRC-100 compliant
wallet.createAction({                    // ✅ BRC-100
  description: 'Pay for service',
  inputs: [...],
  outputs: [...]
})

wallet.internalizeAction({               // ✅ BRC-100
  tx: beefData,
  outputs: [{ outputIndex: 0, protocol: 'basket', insertionRemittance: {...} }]
})
```

### Gap Analysis

| Feature | Current | BRC-100 | Gap |
|---------|---------|---------|-----|
| Transaction building | `send()` | `createAction()` | API mismatch |
| Receiving payments | `recordPayment()` | `internalizeAction()` | No BEEF support |
| UTXO queries | `getUTXOs()` | `listOutputs()` | No basket/tag filtering |
| History | `history` CLI | `listActions()` | No action metadata |
| Certificates | ❌ None | Certificate APIs | Not implemented |
| Encryption | ❌ None | `encrypt()`/`decrypt()` | Not implemented |

### Why Not BRC-100 Yet?

BRC-100 is designed for advanced wallet features:
- Overlay networks (UTXO tagging and filtering)
- Certificate-based identity
- Action-level metadata tracking
- Basket management (categorized UTXOs)

`bsv-wallet` v1.0 targets **simple bot-to-bot payments**:
- Send satoshis
- Track balance
- No identity layer
- No overlay protocols

**When to adopt BRC-100:**
- When integrating with overlay services (e.g., BSV Overlay)
- When adding identity/certificate features
- When building multi-app wallets with categorization

### Migration Path

If BRC-100 alignment becomes necessary:

**Phase 1: Wrapper Layer (backward compatible)**
```typescript
class BRC100Adapter {
  constructor(private wallet: Wallet) {}
  
  async createAction(args: CreateActionArgs): Promise<CreateActionResult> {
    // Translate BRC-100 createAction → wallet.send()
  }
  
  async internalizeAction(args: InternalizeActionArgs): Promise<InternalizeActionResult> {
    // Translate BRC-100 internalizeAction → wallet.recordPayment()
  }
}
```

**Phase 2: Native BRC-100 (breaking change)**
- Replace `Wallet` class with `BRC100Wallet`
- Add basket management to schema
- Add action metadata tracking
- Migrate `send()` users to `createAction()`

**Estimated Effort:** 
- Phase 1 (adapter): 1-2 days
- Phase 2 (native): 1-2 weeks

---

## Implementation Roadmap

### v1.0 (Current)
- ✅ BRC-12 compliance via `@bsv/sdk`
- ✅ Basic UTXO tracking
- ✅ Send/receive functionality
- ✅ SQLite persistence

### v1.1 (Hardening)
- Add transaction confirmation tracking
- Implement retry logic for broadcasts
- Add fee estimation
- Improve error handling

### v2.0 (SPV + BEEF)
**Target: Q2 2026**

**Milestone 1: BUMP Support**
- Implement BRC-74 BUMP builder/verifier
- Add merkle proof storage to database
- Fetch proofs from WhatsOnChain

**Milestone 2: SPV Verification**
- Implement BRC-67 SPV verifier
- Add ChainTracker integration
- Store block headers
- Verify incoming payments

**Milestone 3: BEEF Format**
- Implement BRC-62 BEEF serialization/parsing
- Modify `send()` to produce BEEF instead of raw tx
- Modify `recordPayment()` to accept BEEF
- Add BEEF verification pipeline

**Dependencies:**
- ChainTracker library or service
- WhatsOnChain merkle proof API
- Block header sync mechanism

### v3.0 (BRC-100 Alignment)
**Target: Q3 2026**

- Full BRC-100 API implementation
- Basket/tag management
- Certificate support (optional)
- Overlay protocol integration
- Migration guide for v1.x users

---

## How Payments Work End-to-End

### Current Flow (v1.0)

**Sending:**
```
1. User calls: wallet.send(address, amount)
2. Wallet selects UTXOs from database
3. Builds raw transaction (BRC-12)
4. Signs with private key
5. Broadcasts hex to WhatsOnChain
6. Marks UTXOs as spent locally
7. Returns txid
```

**Receiving:**
```
1. User calls: wallet.sync()
2. Queries WhatsOnChain for address UTXOs
3. Fetches full transaction hex for each
4. Parses scriptPubKey from outputs
5. Inserts into database (if new)
6. Returns count of new UTXOs
```

**Trust Model:**
- ⚠️ Fully trusts WhatsOnChain API
- ⚠️ No SPV verification
- ⚠️ No merkle proof validation

### Future Flow (v2.0 with BEEF/SPV)

**Sending:**
```
1. User calls: wallet.send(address, amount)
2. Wallet selects UTXOs
3. Builds transaction
4. Fetches BUMP for each input from WhatsOnChain
5. Constructs BEEF envelope (tx + BUMPs)
6. Signs transaction
7. Broadcasts BEEF (not raw hex)
8. Stores BUMPs locally
9. Returns txid + BEEF data
```

**Receiving:**
```
1. Peer sends BEEF envelope (not just txid)
2. wallet.internalizeAction(beefData)
3. Parse BEEF → extract tx + BUMPs
4. SPV verify each input:
   a. Compute merkle root from BUMP
   b. Fetch block header
   c. Verify root matches header
   d. Verify block is in longest chain
   e. Check confirmation depth
5. If valid → insert UTXO + BUMP into database
6. If invalid → reject and log
7. Return verification result
```

**Trust Model:**
- ✅ SPV verified (no need to trust indexers for confirmation)
- ✅ Merkle proofs validated
- ⚠️ Still trusts WhatsOnChain for block headers (unless full header sync implemented)

---

## Storage Schema Documentation

### Current Schema (v1.0)

**Table: `utxos`**
```sql
CREATE TABLE utxos (
  id TEXT PRIMARY KEY,              -- "{txid}:{vout}"
  txid TEXT NOT NULL,
  vout INTEGER NOT NULL,
  satoshis INTEGER NOT NULL,
  script_pub_key TEXT NOT NULL,     -- Hex-encoded locking script
  from_peer_id TEXT,                -- Optional: P2P peer ID
  memo TEXT,                        -- Optional: payment memo
  received_at INTEGER NOT NULL,     -- Unix timestamp (ms)
  spent INTEGER DEFAULT 0,          -- 0 = unspent, 1 = spent
  spent_txid TEXT,                  -- TXID that spent this UTXO
  UNIQUE(txid, vout)
);
```

**Indexes:**
- Primary key on `id`
- Unique constraint on `(txid, vout)`

**Limitations:**
- ❌ No merkle proof storage
- ❌ No block height tracking
- ❌ No SPV verification status
- ❌ No BEEF data
- ❌ No action metadata (BRC-100)

### Proposed Schema (v2.0)

**Extended `utxos` table:**
```sql
CREATE TABLE utxos (
  id TEXT PRIMARY KEY,
  txid TEXT NOT NULL,
  vout INTEGER NOT NULL,
  satoshis INTEGER NOT NULL,
  script_pub_key TEXT NOT NULL,
  from_peer_id TEXT,
  memo TEXT,
  received_at INTEGER NOT NULL,
  spent INTEGER DEFAULT 0,
  spent_txid TEXT,
  
  -- SPV fields
  block_height INTEGER,             -- Block containing this tx
  block_hash TEXT,                  -- Block hash
  confirmed INTEGER DEFAULT 0,      -- SPV verified?
  confirmed_at INTEGER,             -- When verification completed
  confirmation_depth INTEGER,       -- Current depth
  
  -- BEEF tracking
  beef_data BLOB,                   -- Stored BEEF envelope
  bump_verified INTEGER DEFAULT 0,  -- Merkle proof verified?
  
  UNIQUE(txid, vout)
);

CREATE INDEX idx_utxos_block_height ON utxos(block_height);
CREATE INDEX idx_utxos_confirmed ON utxos(confirmed);
```

**New table: `bumps`**
```sql
CREATE TABLE bumps (
  txid TEXT PRIMARY KEY,
  block_height INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  tree_height INTEGER NOT NULL,
  path_json TEXT NOT NULL,          -- JSON array of {offset, hash}
  verified INTEGER DEFAULT 0,
  verified_at INTEGER,
  FOREIGN KEY (txid) REFERENCES utxos(txid) ON DELETE CASCADE
);

CREATE INDEX idx_bumps_block ON bumps(block_height);
CREATE INDEX idx_bumps_verified ON bumps(verified);
```

**New table: `block_headers`**
```sql
CREATE TABLE block_headers (
  hash TEXT PRIMARY KEY,
  height INTEGER NOT NULL UNIQUE,
  version INTEGER NOT NULL,
  previous_hash TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  bits INTEGER NOT NULL,
  nonce INTEGER NOT NULL,
  chain_work TEXT,                  -- Cumulative proof of work (hex)
  verified INTEGER DEFAULT 0,       -- Header validated?
  in_longest_chain INTEGER DEFAULT 0
);

CREATE INDEX idx_headers_height ON block_headers(height);
CREATE INDEX idx_headers_previous ON block_headers(previous_hash);
CREATE INDEX idx_headers_longest_chain ON block_headers(in_longest_chain);
```

---

## References

### BRC Specifications
- **BRC-12:** Raw Transaction Format  
  https://bsv.brc.dev/transactions/0012

- **BRC-62:** BEEF (Background Evaluation Extended Format)  
  https://bsv.brc.dev/transactions/0062

- **BRC-67:** SPV (Simplified Payment Verification)  
  https://bsv.brc.dev/transactions/0067

- **BRC-74:** BUMP (Bitcoin Unified Merkle Path)  
  https://bsv.brc.dev/transactions/0074

- **BRC-100:** Wallet Interface  
  https://bsv.brc.dev/wallet/0100

### Documentation
- **@bsv/sdk Documentation:** https://docs.bsvblockchain.org
- **WhatsOnChain API:** https://developers.whatsonchain.com
- **Bitcoin SV Wiki:** https://wiki.bitcoinsv.io

### Related Projects
- **bsv-p2p:** P2P bot networking (https://github.com/galt-tr/bsv-p2p)
- **bsv-channels:** Payment channels (https://github.com/galt-tr/bsv-channels)
- **ChainTracker:** Block header sync (TBD)

---

## Audit Trail

This document tracks compliance for auditing purposes.

**Questions for Auditors:**

1. **BRC-12 Compliance:** Review `src/wallet.ts:send()` transaction building. Does it produce valid BRC-12 transactions?

2. **BEEF Readiness:** What's the effort to add BRC-62? Estimated 3-5 days — is this accurate?

3. **SPV Requirements:** For trustless agent payments, is SPV verification mandatory or optional?

4. **BRC-100 Priority:** Should simple wallets adopt BRC-100, or is a simpler API acceptable for bot-to-bot payments?

5. **Storage Schema:** Will the proposed v2.0 schema support efficient SPV verification queries?

**Last Reviewed:** February 20, 2026  
**Reviewer:** Writer (documentation agent)  
**Next Review:** After v2.0 milestone 1 completion

---

**End of BRC Compliance Reference**
