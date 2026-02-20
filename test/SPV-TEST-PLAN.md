# SPV / BEEF / BUMP Test Plan

**Status:** Test suite created, awaiting implementation  
**Location:** `test/spv-beef.test.ts`  
**Total Test Cases:** 60+

## Test Coverage

### 1. BEEF Builder (5 tests)
- ✓ Create BEEF with correct magic bytes (0100BEEF)
- ✓ Include all transactions in correct order
- ✓ Include BUMP for each transaction
- ✓ Handle empty transaction list
- ✓ Validate transaction dependencies

### 2. BEEF Parser (6 tests)
- ✓ Parse known-good BEEF binary
- ✓ Extract all transactions from BEEF
- ✓ Extract BUMPs for each transaction
- ✓ Reject BEEF with wrong magic bytes
- ✓ Reject truncated BEEF data
- ✓ Handle BEEF with no transactions

### 3. BUMP (Merkle Path) Verification (6 tests)
- ✓ Verify valid merkle path
- ✓ Reject invalid merkle path
- ✓ Handle merkle path for tx at index 0
- ✓ Handle merkle path for tx at max index
- ✓ Verify merkle path for block with single tx
- ✓ Compute correct merkle root from path

### 4. Script Evaluation (5 tests)
- ✓ Validate correct unlock script
- ✓ Reject invalid signature in unlock script
- ✓ Reject malformed script
- ✓ Handle OP_RETURN scripts
- ✓ Validate multisig scripts

### 5. Fee Validation (5 tests)
- ✓ Accept transaction with valid fee
- ✓ Reject transaction with zero fee
- ✓ Reject transaction with negative fee
- ✓ Reject transaction with excessive fee
- ✓ Calculate fee from inputs and outputs

### 6. Database Schema Migration (5 tests)
- ✓ Migrate from old schema to new schema
- ✓ Preserve existing data during migration
- ✓ Set null values for new SPV columns
- ✓ Handle migration rollback on error
- ✓ Skip migration if already applied

### 7. ChainTracker (5 tests)
- ✓ Fetch block header by height
- ✓ Fetch block header by hash
- ✓ Cache fetched headers
- ✓ Handle network errors gracefully
- ✓ Verify header chain continuity

### 8. Integration: Full Send Flow (4 tests)
- ✓ Build transaction with inputs and outputs
- ✓ Package transaction into BEEF
- ✓ Verify created BEEF is valid
- ✓ Include all dependent transactions in BEEF

### 9. Integration: Full Receive Flow (5 tests)
- ✓ Parse incoming BEEF
- ✓ Verify SPV proofs in BEEF
- ✓ Store verified UTXOs with proofs
- ✓ Update wallet balance after receiving BEEF
- ✓ Reject BEEF with invalid SPV proof

### 10. Integration: Sync with Proofs (3 tests)
- ✓ Sync UTXOs from blockchain with SPV proofs
- ✓ Verify all synced UTXOs have valid proofs
- ✓ Handle large UTXO set efficiently

### 11. Integration: Bounty Payment (4 tests)
- ✓ Create BEEF for bounty payment
- ✓ Verify received bounty BEEF
- ✓ Update balance after verified bounty
- ✓ Reject bounty BEEF with no proofs

## Implementation Status

All tests are currently **placeholders** with `expect(true).toBe(true)`.  
This serves as a **specification** for the SPV/BEEF implementation.

## Next Steps

1. **Implement BEEF Builder**
   - Create `createBEEF(transactions, merkleProofs)` function
   - Use BEEF format spec: 4-byte version (0x01000000) + "BEEF" magic
   - Topologically sort transactions (parents before children)

2. **Implement BEEF Parser**
   - Create `parseBEEF(beefBinary)` function
   - Extract transactions and BUMPs
   - Validate structure

3. **Implement BUMP Verification**
   - Create `verifyMerklePath(txid, bump, blockHeader)` function
   - Compute merkle root from path
   - Compare with header's merkleRoot

4. **Implement ChainTracker**
   - Create service to fetch block headers
   - Cache headers in database
   - Verify chain continuity

5. **Update Wallet Methods**
   - Enhance `send()` to create BEEF
   - Enhance `receive()` to parse and verify BEEF
   - Add `syncWithProofs()` for full SPV sync

## Test Data Needed

- **Real mainnet BEEF examples** for parser tests
- **Known block headers** for BUMP verification
- **Valid/invalid merkle paths** for edge cases

## References

- BEEF Spec: https://bsv.brc.dev/transactions/0062
- BUMP Spec: https://bsv.brc.dev/transactions/0058
- BSV SDK: https://docs.bsvblockchain.org/
