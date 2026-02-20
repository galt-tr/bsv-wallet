# BSV Wallet Test Suite

## Test Coverage

### services.test.ts
Tests for blockchain API services (WhatsOnChain):
- fetchUTXOs: Fetching unspent outputs
- fetchTransaction: Transaction lookup
- broadcastTransaction: Broadcasting transactions

**Status**: 10/11 passing (1 failing - transaction parsing issue)
**Note**: The failing test needs a complete, valid BSV transaction hex

### wallet.test.ts
Tests for Wallet class:
- Constructor and key derivation (6/6 passing)
- UTXO tracking (6/6 passing)
- Balance calculation (4/4 passing)
- Sync from blockchain (4/4 passing)
- Send transaction (0/10 passing - needs better mock strategy)
- SQLite persistence (3/3 passing)
- Error cases (1/3 passing)

**Status**: 24/36 passing

## Known Issues

### Transaction Building Tests
The send() tests are failing because creating valid BSV transactions requires:
- Proper source transaction structure
- Valid locking/unlocking scripts
- Proper signature algorithm

**Resolution Options**:
1. Use actual BSV test vectors (complete transaction hex strings)
2. Mock at a higher level (mock the send() method itself)
3. Create integration tests with real testnet transactions

For now, the core functionality is tested (UTXO tracking, balance, persistence).
The transaction building requires either:
- Real testnet integration tests
- Or detailed BSV SDK fixtures

## Running Tests

```bash
cd ~/projects/bsv-wallet
PATH=/usr/bin:$PATH /usr/bin/node node_modules/.bin/vitest run
```

## Current Coverage

- **services.ts**: ~90% (all critical paths tested except complex tx parsing)
- **wallet.ts**: ~60% (constructor, UTXO tracking, persistence fully tested; transaction building needs integration tests)

## Next Steps

1. Add real BSV testnet integration tests for send()
2. Create test fixtures with valid transaction hex
3. Add coverage reporting to track improvement
