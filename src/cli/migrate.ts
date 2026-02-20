#!/usr/bin/env node
/**
 * Migrate Wallet to SPV-Native Schema
 *
 * Fetches raw transactions and merkle proofs for all UTXOs,
 * storing them in the new SPV-enabled database schema.
 */

import { Wallet } from '../wallet.js'
import { fetchTransaction, fetchMerkleProof } from '../services.js'
import { readFileSync, copyFileSync, existsSync } from 'fs'
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
Usage: migrate.ts --config <path> --db <path>

Migrate wallet to SPV-native schema with full transaction data.

Options:
  -c, --config <path>  Path to wallet config JSON
  -d, --db <path>      Path to wallet database
  -h, --help           Show this help message

Example:
  npx tsx src/cli/migrate.ts --config ~/.bsv-p2p/config.json --db ~/.bsv-p2p/wallet.db
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

// Delay helper for rate limiting
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function migrate(): Promise<void> {
  console.log('=== Wallet SPV Migration ===')
  console.log(`Config: ${configPath}`)
  console.log(`Database: ${dbPath}`)
  console.log('')

  // 1. Back up database
  const backupPath = `${dbPath}.bak`
  console.log(`Backing up database to: ${backupPath}`)
  copyFileSync(dbPath, backupPath)
  console.log('✓ Backup created')
  console.log('')

  // 2. Read config
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

  // 3. Open wallet (auto-migrates schema)
  console.log('Opening wallet (auto-migrating schema)...')
  const wallet = new Wallet({
    privateKey,
    dbPath
  })
  console.log('✓ Wallet opened, schema migrated')
  console.log('')

  // 4. Get balance before
  const balanceBefore = wallet.getBalance()
  console.log(`Balance before: ${balanceBefore} satoshis`)
  console.log('')

  // 5. Get all UTXOs
  const utxos = wallet.getUTXOs()
  console.log(`Found ${utxos.length} UTXOs to migrate`)
  console.log('')

  // 6. Fetch raw transactions and proofs for each UTXO
  let migratedCount = 0
  let provenCount = 0
  let errorCount = 0

  for (let i = 0; i < utxos.length; i++) {
    const utxo = utxos[i]
    console.log(`[${i+1}/${utxos.length}] Processing ${utxo.txid}:${utxo.vout}`)

    try {
      // Fetch raw transaction
      console.log(`  Fetching raw transaction...`)
      const txInfo = await fetchTransaction(utxo.txid)

      // Store raw transaction
      const rawTx = Buffer.from(txInfo.hex, 'hex')
      const db = (wallet as any).db  // Access private db property

      // Check if transaction already exists
      const existingTx = db.prepare('SELECT txid FROM transactions WHERE txid = ?').get(utxo.txid)

      if (!existingTx) {
        // Insert new transaction
        db.prepare(`
          INSERT INTO transactions (txid, raw_tx, block_height, status, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          utxo.txid,
          rawTx,
          txInfo.blockHeight || null,
          txInfo.blockHeight ? 'confirmed' : 'unproven',
          Date.now()
        )
        console.log(`  ✓ Stored raw transaction`)
      } else {
        console.log(`  ✓ Transaction already exists`)
      }

      // Try to fetch merkle proof if confirmed
      if (txInfo.blockHeight) {
        console.log(`  Fetching merkle proof...`)
        try {
          const proof = await fetchMerkleProof(utxo.txid)

          if (proof) {
            // Update transaction with proof
            db.prepare(`
              UPDATE transactions
              SET merkle_path = ?, status = ?, proven_at = ?, block_height = ?
              WHERE txid = ?
            `).run(
              JSON.stringify(proof),
              'proven',
              Date.now(),
              txInfo.blockHeight,
              utxo.txid
            )

            // Mark UTXO as proven
            db.prepare(`
              UPDATE utxos
              SET proven = 1, block_height = ?
              WHERE txid = ?
            `).run(txInfo.blockHeight, utxo.txid)

            console.log(`  ✓ Stored merkle proof`)
            provenCount++
          } else {
            console.log(`  ⚠ No merkle proof available yet`)
          }
        } catch (proofErr) {
          console.log(`  ⚠ Could not fetch proof: ${proofErr}`)
        }
      } else {
        console.log(`  ⚠ Transaction not confirmed yet`)
      }

      migratedCount++

      // Rate limit: 500ms between API calls
      await delay(500)

    } catch (err) {
      console.error(`  ✗ Error: ${err}`)
      errorCount++
    }

    console.log('')
  }

  // 7. Get balance after
  const balanceAfter = wallet.getBalance()

  // 8. Print summary
  console.log('=== Migration Summary ===')
  console.log(`UTXOs processed: ${utxos.length}`)
  console.log(`Successfully migrated: ${migratedCount}`)
  console.log(`With proofs: ${provenCount}`)
  console.log(`Errors: ${errorCount}`)
  console.log('')
  console.log(`Balance before: ${balanceBefore} satoshis`)
  console.log(`Balance after:  ${balanceAfter} satoshis`)
  console.log('')

  // 9. Safety check
  if (balanceBefore !== balanceAfter) {
    console.error('ERROR: Balance changed during migration!')
    console.error(`Lost: ${balanceBefore - balanceAfter} satoshis`)
    console.error('')
    console.error('MIGRATION FAILED - Balance mismatch detected')
    console.error(`Backup saved at: ${backupPath}`)
    process.exit(1)
  }

  console.log('✓ Migration completed successfully')
  console.log(`✓ Balance unchanged (${balanceAfter} satoshis)`)
  console.log('')
  console.log(`Backup saved at: ${backupPath}`)
}

// Run migration
migrate().catch(err => {
  console.error('FATAL ERROR:', err)
  process.exit(1)
})