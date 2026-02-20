#!/usr/bin/env node
/**
 * Verify Wallet SPV Migration
 *
 * Checks that all UTXOs have corresponding raw transactions
 * and reports on proof status.
 */

import { Wallet } from '../wallet.js'
import { readFileSync, existsSync } from 'fs'
import { parseArgs } from 'util'

// Parse command line arguments
const { values } = parseArgs({
  options: {
    config: {
      type: 'string',
      short: 'c',
      description: 'Path to wallet config JSON'
    },
    db: {
      type: 'string',
      short: 'd',
      description: 'Path to wallet database'
    },
    help: {
      type: 'boolean',
      short: 'h',
      description: 'Show help message'
    }
  }
})

// Show help
if (values.help) {
  console.log(`
Usage: verify.ts --config <path> --db <path>

Verify wallet SPV migration status.

Options:
  -c, --config <path>  Path to wallet config JSON
  -d, --db <path>      Path to wallet database
  -h, --help           Show this help message

Example:
  npx tsx src/cli/verify.ts --config ~/.bsv-p2p/config.json --db ~/.bsv-p2p/wallet.db
`)
  process.exit(0)
}

// Validate arguments
if (!values.config || !values.db) {
  console.error('ERROR: Both --config and --db are required')
  console.error('Run with --help for usage')
  process.exit(1)
}

const configPath = values.config as string
const dbPath = values.db as string

// Check files exist
if (!existsSync(configPath)) {
  console.error(`ERROR: Config file not found: ${configPath}`)
  process.exit(1)
}

if (!existsSync(dbPath)) {
  console.error(`ERROR: Database file not found: ${dbPath}`)
  process.exit(1)
}

async function verify(): Promise<void> {
  console.log('=== Wallet SPV Verification ===')
  console.log(`Config: ${configPath}`)
  console.log(`Database: ${dbPath}`)
  console.log('')

  // Read config
  let config: any
  try {
    const configText = readFileSync(configPath, 'utf8')
    config = JSON.parse(configText)
  } catch (err) {
    console.error(`ERROR: Failed to read config: ${err}`)
    process.exit(1)
  }

  // Extract private key (handle both treasury and agent formats)
  const privateKey = config.bsvPrivateKey || config.privateKey
  if (!privateKey) {
    console.error('ERROR: No private key found in config (looked for privateKey and bsvPrivateKey)')
    process.exit(1)
  }

  // Open wallet
  console.log('Opening wallet...')
  const wallet = new Wallet({
    privateKey,
    dbPath
  })
  console.log('✓ Wallet opened')
  console.log('')

  // Get all UTXOs
  const utxos = wallet.getUTXOs()
  console.log(`Found ${utxos.length} UTXOs`)
  console.log('')

  // Access database directly
  const db = (wallet as any).db

  // Check each UTXO
  let missingTxCount = 0
  let unprovenCount = 0
  let provenCount = 0
  const gaps: string[] = []

  console.log('Checking UTXO transaction data...')
  console.log('')

  for (const utxo of utxos) {
    // Check if transaction exists
    const tx = db.prepare(`
      SELECT txid, status, block_height, merkle_path
      FROM transactions
      WHERE txid = ?
    `).get(utxo.txid) as any

    if (!tx) {
      console.log(`✗ MISSING TX: ${utxo.txid}`)
      console.log(`  UTXO: ${utxo.txid}:${utxo.vout} (${utxo.satoshis} sats)`)
      gaps.push(`Missing transaction: ${utxo.txid}`)
      missingTxCount++
    } else {
      // Check proof status
      if (tx.status === 'proven' && tx.merkle_path) {
        provenCount++
      } else {
        console.log(`⚠ UNPROVEN: ${utxo.txid}`)
        console.log(`  Status: ${tx.status}`)
        console.log(`  Block height: ${tx.block_height || 'unconfirmed'}`)
        console.log(`  Has proof: ${tx.merkle_path ? 'yes' : 'no'}`)
        unprovenCount++
      }
    }
  }

  console.log('')
  console.log('=== Verification Summary ===')
  console.log(`Total UTXOs: ${utxos.length}`)
  console.log(`✓ Proven: ${provenCount}`)
  console.log(`⚠ Unproven: ${unprovenCount}`)
  console.log(`✗ Missing transactions: ${missingTxCount}`)
  console.log('')

  // Check transaction table
  const txCount = db.prepare('SELECT COUNT(*) as count FROM transactions').get() as { count: number }
  const provenTxCount = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE status = ?').get('proven') as { count: number }

  console.log('Transaction Table:')
  console.log(`  Total transactions: ${txCount.count}`)
  console.log(`  Proven transactions: ${provenTxCount.count}`)
  console.log('')

  // Report balance
  const balance = wallet.getBalance()
  console.log(`Wallet balance: ${balance} satoshis`)
  console.log('')

  // Report gaps if any
  if (gaps.length > 0) {
    console.log('=== GAPS DETECTED ===')
    for (const gap of gaps) {
      console.log(`  - ${gap}`)
    }
    console.log('')
    console.log('⚠ Wallet needs migration to fill these gaps')
    process.exit(1)
  } else if (unprovenCount > 0) {
    console.log('⚠ Some transactions are unproven (may need to wait for confirmations)')
    console.log('✓ No critical gaps detected')
  } else {
    console.log('✓ All UTXOs have transaction data')
    console.log('✓ All transactions are proven')
    console.log('✓ Wallet is fully migrated and verified')
  }
}

// Run verification
verify().catch(err => {
  console.error('FATAL ERROR:', err)
  process.exit(1)
})