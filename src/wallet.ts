/**
 * Simple BSV Wallet for Bot-to-Bot Payments
 * 
 * Tracks UTXOs and enables direct payments between bots.
 * This is for initial funding, not payment channels.
 */

import { PrivateKey, P2PKH, Transaction, Hash, Beef } from '@bsv/sdk'
import { fetchUTXOs, fetchTransaction, broadcastTransaction, UTXO } from './services.js'
import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'

const { hash160 } = Hash

export interface WalletConfig {
  privateKey: string  // Hex
  dbPath?: string     // SQLite path
}

export interface TrackedUTXO extends UTXO {
  id: string
  fromPeerId?: string
  memo?: string
  receivedAt: number
  spent: boolean
  spentTxid?: string
}

export class Wallet {
  private privateKey: PrivateKey
  private address: string
  private db: Database.Database
  private p2pkh: P2PKH
  
  constructor(config: WalletConfig) {
    this.privateKey = PrivateKey.fromHex(config.privateKey)
    this.p2pkh = new P2PKH()
    
    // Derive address from public key
    const pubKeyHash = hash160(this.privateKey.toPublicKey().encode(true))
    this.address = this.pubKeyHashToAddress(pubKeyHash)
    
    // Initialize database
    const dbPath = config.dbPath ?? join(homedir(), '.bsv-p2p', 'wallet.db')
    const dir = dirname(dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.initDb()
  }
  
  private pubKeyHashToAddress(pubKeyHash: number[]): string {
    // Mainnet P2PKH address (version byte 0x00)
    const versionedHash = [0x00, ...pubKeyHash]
    const checksum = Hash.sha256(Hash.sha256(versionedHash)).slice(0, 4)
    const addressBytes = [...versionedHash, ...checksum]
    return this.base58Encode(addressBytes)
  }
  
  private base58Encode(bytes: number[]): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    let num = BigInt(0)
    for (const byte of bytes) {
      num = num * BigInt(256) + BigInt(byte)
    }
    let encoded = ''
    while (num > 0) {
      encoded = ALPHABET[Number(num % BigInt(58))] + encoded
      num = num / BigInt(58)
    }
    // Leading zeros
    for (const byte of bytes) {
      if (byte === 0) encoded = '1' + encoded
      else break
    }
    return encoded
  }
  
  private initDb(): void {
    // Run migrations
    this.runMigrations()
    
    // Create tables with current schema
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        txid TEXT PRIMARY KEY,
        raw_tx BLOB NOT NULL,
        merkle_path TEXT,
        block_height INTEGER,
        status TEXT DEFAULT 'unproven',
        created_at INTEGER NOT NULL,
        proven_at INTEGER
      )
    `)
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS utxos (
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
        block_height INTEGER,
        proven INTEGER DEFAULT 0,
        UNIQUE(txid, vout)
      )
    `)
  }
  
  private runMigrations(): void {
    // Get current schema version
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `)
    
    const currentVersion = this.db.prepare(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
    ).get() as { version: number } | undefined
    
    const version = currentVersion?.version ?? 0
    
    // Migration 1: Add SPV columns to utxos table
    if (version < 1) {
      console.log('[Wallet] Running migration 1: Adding SPV columns to utxos')
      
      // Check if columns exist (table might be fresh)
      const tableInfo = this.db.prepare('PRAGMA table_info(utxos)').all() as any[]
      const hasBlockHeight = tableInfo.some(col => col.name === 'block_height')
      const hasProven = tableInfo.some(col => col.name === 'proven')
      
      if (tableInfo.length > 0) {
        // Table exists, add columns if missing
        if (!hasBlockHeight) {
          this.db.exec('ALTER TABLE utxos ADD COLUMN block_height INTEGER')
        }
        if (!hasProven) {
          this.db.exec('ALTER TABLE utxos ADD COLUMN proven INTEGER DEFAULT 0')
        }
      }
      
      // Record migration
      this.db.prepare(
        'INSERT INTO schema_version (version, applied_at) VALUES (?, ?)'
      ).run(1, Date.now())
    }
    
    // Migration 2: Create transactions table (already handled by CREATE IF NOT EXISTS)
    if (version < 2) {
      console.log('[Wallet] Running migration 2: Creating transactions table')
      this.db.prepare(
        'INSERT INTO schema_version (version, applied_at) VALUES (?, ?)'
      ).run(2, Date.now())
    }
  }
  
  /**
   * Get our BSV address
   */
  getAddress(): string {
    return this.address
  }
  
  /**
   * Get our public key (hex)
   */
  getPublicKey(): string {
    return this.privateKey.toPublicKey().toString()
  }
  
  /**
   * Sync UTXOs from the blockchain
   */
  async sync(): Promise<number> {
    const utxos = await fetchUTXOs(this.address)
    let newCount = 0
    
    for (const utxo of utxos) {
      const existing = this.db.prepare(
        'SELECT id FROM utxos WHERE txid = ? AND vout = ?'
      ).get(utxo.txid, utxo.vout)
      
      if (!existing) {
        const id = `${utxo.txid}:${utxo.vout}`
        this.db.prepare(`
          INSERT INTO utxos (id, txid, vout, satoshis, script_pub_key, received_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, utxo.txid, utxo.vout, utxo.satoshis, utxo.scriptPubKey, Date.now())
        newCount++
      }
    }
    
    return newCount
  }
  
  /**
   * Record a received payment (from P2P notification)
   */
  recordPayment(txid: string, vout: number, satoshis: number, scriptPubKey: string, fromPeerId?: string, memo?: string): void {
    const id = `${txid}:${vout}`
    this.db.prepare(`
      INSERT OR REPLACE INTO utxos (id, txid, vout, satoshis, script_pub_key, from_peer_id, memo, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, txid, vout, satoshis, scriptPubKey, fromPeerId ?? null, memo ?? null, Date.now())
  }
  
  /**
   * Get unspent UTXOs
   */
  getUTXOs(): TrackedUTXO[] {
    const rows = this.db.prepare(
      'SELECT * FROM utxos WHERE spent = 0 ORDER BY satoshis DESC'
    ).all() as any[]
    
    return rows.map(row => ({
      id: row.id,
      txid: row.txid,
      vout: row.vout,
      satoshis: row.satoshis,
      scriptPubKey: row.script_pub_key,
      fromPeerId: row.from_peer_id,
      memo: row.memo,
      receivedAt: row.received_at,
      spent: row.spent === 1,
      spentTxid: row.spent_txid
    }))
  }
  
  /**
   * Get total balance
   */
  getBalance(): number {
    const result = this.db.prepare(
      'SELECT SUM(satoshis) as total FROM utxos WHERE spent = 0'
    ).get() as { total: number | null }
    return result?.total ?? 0
  }
  
  /**
   * Send payment to an address
   * 
   * @param toAddress - Recipient's BSV address
   * @param amount - Amount in satoshis
   * @param fee - Transaction fee (default: 200 sats)
   * @returns Transaction details including BEEF envelope
   */
  async send(toAddress: string, amount: number, fee: number = 200): Promise<{
    txid: string
    vout: number
    change?: number
    beef: string  // BEEF envelope as hex string
    beefBinary: number[]  // BEEF envelope as binary array
  }> {
    const utxos = this.getUTXOs()
    
    // Select UTXOs to cover amount + fee
    let total = 0
    const selected: TrackedUTXO[] = []
    for (const utxo of utxos) {
      selected.push(utxo)
      total += utxo.satoshis
      if (total >= amount + fee) break
    }
    
    if (total < amount + fee) {
      throw new Error(`Insufficient balance: have ${total}, need ${amount + fee}`)
    }
    
    // Build transaction
    const tx = new Transaction()
    
    for (const utxo of selected) {
      // Fetch source transaction
      const sourceTxInfo = await fetchTransaction(utxo.txid)
      const sourceTx = Transaction.fromHex(sourceTxInfo.hex)
      
      tx.addInput({
        sourceTXID: utxo.txid,
        sourceOutputIndex: utxo.vout,
        sourceTransaction: sourceTx,
        unlockingScriptTemplate: this.p2pkh.unlock(this.privateKey)
      })
    }
    
    // Payment output
    const recipientPubKeyHash = this.addressToPubKeyHash(toAddress)
    tx.addOutput({
      satoshis: amount,
      lockingScript: this.p2pkh.lock(recipientPubKeyHash)
    })
    
    // Change output
    const change = total - amount - fee
    if (change > 546) { // Dust limit
      tx.addOutput({
        satoshis: change,
        lockingScript: this.p2pkh.lock(hash160(this.privateKey.toPublicKey().encode(true)))
      })
    }
    
    // Sign
    await tx.sign()
    
    // Broadcast
    const txid = (await broadcastTransaction(tx.toHex())).trim()
    
    // Create BEEF envelope
    const beef = new Beef()
    beef.mergeTransaction(tx)
    const beefBinary = beef.toBinary()
    const beefHex = beef.toHex()
    
    // Mark UTXOs as spent
    for (const utxo of selected) {
      this.db.prepare(
        'UPDATE utxos SET spent = 1, spent_txid = ? WHERE id = ?'
      ).run(txid, utxo.id)
    }
    
    // Record change as new UTXO if present
    if (change > 546) {
      const changeVout = 1 // Change is always second output
      const changeScript = this.p2pkh.lock(hash160(this.privateKey.toPublicKey().encode(true))).toHex()
      this.recordPayment(txid, changeVout, change, changeScript)
    }
    
    return {
      txid,
      vout: 0, // Payment is first output
      change: change > 546 ? change : undefined,
      beef: beefHex,
      beefBinary
    }
  }
  
  /**
   * Receive and import a BEEF payment
   * 
   * @param beefData - BEEF envelope as hex string or binary array
   * @param expectedTxid - Optional txid to verify
   * @returns Transaction details of the imported payment
   */
  async receiveBeef(beefData: string | number[] | Uint8Array, expectedTxid?: string): Promise<{
    txid: string
    utxos: Array<{ vout: number; satoshis: number }>
    totalReceived: number
  }> {
    // Parse BEEF
    let beef: Beef
    if (typeof beefData === 'string') {
      beef = Beef.fromString(beefData, 'hex')
    } else {
      beef = Beef.fromBinary(beefData)
    }
    
    // Validate BEEF structure
    if (!beef.isValid()) {
      throw new Error('Invalid BEEF structure')
    }
    
    // Get all valid transactions from BEEF
    const validTxids = beef.getValidTxids()
    
    if (validTxids.length === 0) {
      throw new Error('No valid transactions in BEEF')
    }
    
    // The payment transaction is typically the last (newest) transaction
    const paymentTxid = expectedTxid || validTxids[validTxids.length - 1]
    
    const beefTx = beef.findTxid(paymentTxid)
    if (!beefTx || !beefTx.rawTx) {
      throw new Error(`Payment transaction ${paymentTxid} not found in BEEF`)
    }
    
    // Parse the transaction
    const tx = Transaction.fromBinary(beefTx.rawTx)
    const txid = tx.id('hex')
    
    // Find outputs belonging to this wallet
    const myPubKeyHash = hash160(this.privateKey.toPublicKey().encode(true))
    const receivedUtxos: Array<{ vout: number; satoshis: number }> = []
    let totalReceived = 0
    
    for (let vout = 0; vout < tx.outputs.length; vout++) {
      const output = tx.outputs[vout]
      const scriptHex = output.lockingScript.toHex()
      
      // Check if this output is for us (P2PKH to our address)
      // P2PKH script: OP_DUP OP_HASH160 <pubkeyhash> OP_EQUALVERIFY OP_CHECKSIG
      if (scriptHex.startsWith('76a914') && scriptHex.endsWith('88ac')) {
        const pubKeyHashInScript = scriptHex.slice(6, -4) // Extract pubkeyhash
        const myPubKeyHashHex = Buffer.from(myPubKeyHash).toString('hex')
        
        if (pubKeyHashInScript === myPubKeyHashHex) {
          // This output is for us!
          const satoshis = output.satoshis ?? 0
          receivedUtxos.push({ vout, satoshis })
          totalReceived += satoshis
          
          // Record the UTXO
          this.recordPayment(txid, vout, satoshis, scriptHex)
        }
      }
    }
    
    if (receivedUtxos.length === 0) {
      throw new Error('No outputs for this wallet found in transaction')
    }
    
    return {
      txid,
      utxos: receivedUtxos,
      totalReceived
    }
  }
  
  private addressToPubKeyHash(address: string): number[] {
    // Decode base58check
    const bytes = this.base58Decode(address)
    // Remove version byte (first) and checksum (last 4)
    return bytes.slice(1, 21)
  }
  
  private base58Decode(str: string): number[] {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    let num = BigInt(0)
    for (const char of str) {
      num = num * BigInt(58) + BigInt(ALPHABET.indexOf(char))
    }
    
    // Convert to bytes
    const bytes: number[] = []
    while (num > 0) {
      bytes.unshift(Number(num % BigInt(256)))
      num = num / BigInt(256)
    }
    
    // Add leading zeros
    for (const char of str) {
      if (char === '1') bytes.unshift(0)
      else break
    }
    
    return bytes
  }
  
  /**
   * Store a transaction with optional SPV proof
   */
  storeTransaction(txid: string, rawTx: Buffer, merklePath?: string, blockHeight?: number): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO transactions (txid, raw_tx, merkle_path, block_height, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      txid,
      rawTx,
      merklePath ?? null,
      blockHeight ?? null,
      merklePath ? 'proven' : 'unproven',
      Date.now()
    )
  }
  
  /**
   * Update transaction proof status
   */
  updateTransactionProof(txid: string, merklePath: string, blockHeight: number): void {
    this.db.prepare(`
      UPDATE transactions 
      SET merkle_path = ?, block_height = ?, status = 'proven', proven_at = ?
      WHERE txid = ?
    `).run(merklePath, blockHeight, Date.now(), txid)
  }
  
  /**
   * Get transaction by txid
   */
  getTransaction(txid: string): { txid: string; rawTx: Buffer; merklePath?: string; blockHeight?: number; status: string } | null {
    const row = this.db.prepare(
      'SELECT txid, raw_tx, merkle_path, block_height, status FROM transactions WHERE txid = ?'
    ).get(txid) as any
    
    if (!row) return null
    
    return {
      txid: row.txid,
      rawTx: row.raw_tx,
      merklePath: row.merkle_path,
      blockHeight: row.block_height,
      status: row.status
    }
  }
  
  /**
   * Mark UTXO as proven (has valid merkle proof)
   */
  markUTXOProven(txid: string, vout: number, blockHeight: number): void {
    const id = `${txid}:${vout}`
    this.db.prepare(`
      UPDATE utxos SET proven = 1, block_height = ? WHERE id = ?
    `).run(blockHeight, id)
  }
  
  /**
   * Get proven UTXOs (for SPV compliance)
   */
  getProvenUTXOs(): TrackedUTXO[] {
    const rows = this.db.prepare(
      'SELECT * FROM utxos WHERE spent = 0 AND proven = 1 ORDER BY satoshis DESC'
    ).all() as any[]
    
    return rows.map(row => ({
      id: row.id,
      txid: row.txid,
      vout: row.vout,
      satoshis: row.satoshis,
      scriptPubKey: row.script_pub_key,
      fromPeerId: row.from_peer_id,
      memo: row.memo,
      receivedAt: row.received_at,
      spent: Boolean(row.spent),
      spentTxid: row.spent_txid
    }))
  }
}
