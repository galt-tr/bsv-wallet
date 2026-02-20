import { PrivateKey, PublicKey, Hash, Utils, CachedKeyDeriver } from '@bsv/sdk'
import { Wallet, WalletStorageManager, Services, Monitor, StorageKnex } from '@bsv/wallet-toolbox'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { dirname } from 'path'
import Knex from 'knex'
import { loadConfig, WalletConfig } from './config.js'
import { FallbackChainTracker } from './chaintracker.js'

export interface WalletInfo {
  initialized: boolean
  chain: 'main' | 'test'
  identityKey?: string
  address?: string
}

/**
 * Get the encrypted key file path
 */
function getKeyFilePath(config: WalletConfig): string {
  return config.walletPath.replace('.sqlite', '.key')
}

/**
 * Simple key encryption using XOR with password hash
 * Note: In production, use proper encryption (AES-GCM with PBKDF2/Argon2)
 */
function encryptKey(rootKeyHex: string, password: string): string {
  // Convert hex string to bytes
  const keyBytes = Utils.toArray(rootKeyHex, 'hex')
  // Hash password to get encryption key
  const passHash = Hash.sha256(password)
  // XOR each byte
  const encrypted = keyBytes.map((b, i) => b ^ passHash[i % passHash.length])
  // Return as hex (will be valid hex chars 00-ff)
  return Utils.toHex(encrypted)
}

function decryptKey(encryptedHex: string, password: string): string {
  // Convert hex string to bytes
  const encrypted = Utils.toArray(encryptedHex, 'hex')
  // Hash password (same as encryption)
  const passHash = Hash.sha256(password)
  // XOR to decrypt (XOR is symmetric)
  const decrypted = encrypted.map((b, i) => b ^ passHash[i % passHash.length])
  // Return as hex
  return Utils.toHex(decrypted)
}

/**
 * Check if wallet is initialized
 */
export function isWalletInitialized(): boolean {
  const config = loadConfig()
  const keyPath = getKeyFilePath(config)
  return existsSync(keyPath)
}

/**
 * Create wallet components directly (without Setup helper)
 */
async function createWalletDirect(
  chain: 'main' | 'test',
  rootKeyHex: string,
  filePath: string,
  databaseName: string
): Promise<Wallet> {
  const rootKey = PrivateKey.fromHex(rootKeyHex)
  const identityKey = rootKey.toPublicKey().toString()
  const keyDeriver = new CachedKeyDeriver(rootKey)

  // Create SQLite storage via Knex
  mkdirSync(dirname(filePath), { recursive: true })
  
  const knex = Knex({
    client: 'sqlite3',
    connection: {
      filename: filePath
    },
    useNullAsDefault: true
  })

  const storageKnex = new StorageKnex({
    chain,
    knex,
    databaseName
  })
  await storageKnex.migrate(identityKey, databaseName)
  await storageKnex.makeAvailable()

  const storage = new WalletStorageManager(identityKey, storageKnex)
  if (storage.canMakeAvailable()) await storage.makeAvailable()

  // Create services with default options
  const serviceOptions = Services.createDefaultOptions(chain)
  // Note: taalApiKey would be needed for production broadcasting
  // For now, we'll work without it for local operations
  const services = new Services(serviceOptions)

  // Create monitor for background tasks
  const monopts = Monitor.createDefaultWalletMonitorOptions(chain, storage, services)
  const monitor = new Monitor(monopts)
  monitor.addDefaultTasks()

  const wallet = new Wallet({
    chain,
    keyDeriver,
    storage,
    services,
    monitor
  })

  return wallet
}

/**
 * Initialize a new wallet
 */
export async function initWallet(password: string): Promise<{ rootKeyHex: string; identityKey: string }> {
  const config = loadConfig()
  
  if (isWalletInitialized()) {
    throw new Error('Wallet already initialized. Use "wallet reset" to start fresh.')
  }

  // Generate new root key
  const rootKey = PrivateKey.fromRandom()
  const rootKeyHex = rootKey.toString()
  
  // Derive identity key (compressed public key)
  const identityKey = rootKey.toPublicKey().toString()

  // Encrypt and save root key
  const keyPath = getKeyFilePath(config)
  mkdirSync(dirname(keyPath), { recursive: true })
  
  const encrypted = encryptKey(rootKeyHex, password)
  writeFileSync(keyPath, JSON.stringify({
    encrypted,
    identityKey,
    createdAt: new Date().toISOString()
  }), 'utf-8')

  // Create the wallet with SQLite storage
  await createWalletDirect(
    config.chain,
    rootKeyHex,
    config.walletPath,
    config.databaseName
  )

  return { rootKeyHex, identityKey }
}

/**
 * Import wallet from WIF or hex private key
 */
export async function importWallet(keyInput: string, password: string): Promise<{ identityKey: string }> {
  const config = loadConfig()
  
  if (isWalletInitialized()) {
    throw new Error('Wallet already initialized. Use "wallet reset" to start fresh.')
  }

  let rootKeyHex: string
  
  // Detect format
  if (keyInput.length === 64 && /^[0-9a-fA-F]+$/.test(keyInput)) {
    // Hex format
    rootKeyHex = keyInput.toLowerCase()
  } else if (keyInput.startsWith('5') || keyInput.startsWith('K') || keyInput.startsWith('L')) {
    // WIF format
    const privKey = PrivateKey.fromWif(keyInput)
    rootKeyHex = privKey.toString()
  } else {
    throw new Error('Invalid key format. Expected 64-char hex or WIF.')
  }

  const rootKey = PrivateKey.fromHex(rootKeyHex)
  const identityKey = rootKey.toPublicKey().toString()

  // Encrypt and save
  const keyPath = getKeyFilePath(config)
  mkdirSync(dirname(keyPath), { recursive: true })
  
  const encrypted = encryptKey(rootKeyHex, password)
  writeFileSync(keyPath, JSON.stringify({
    encrypted,
    identityKey,
    importedAt: new Date().toISOString()
  }), 'utf-8')

  // Create wallet storage
  await createWalletDirect(
    config.chain,
    rootKeyHex,
    config.walletPath,
    config.databaseName
  )

  return { identityKey }
}

/**
 * Load and unlock wallet
 */
export async function unlockWallet(password: string): Promise<Wallet> {
  const config = loadConfig()
  
  if (!isWalletInitialized()) {
    throw new Error('Wallet not initialized. Run "wallet init" first.')
  }

  const keyPath = getKeyFilePath(config)
  const keyData = JSON.parse(readFileSync(keyPath, 'utf-8'))
  
  const rootKeyHex = decryptKey(keyData.encrypted, password)
  
  // Verify the key decrypts correctly by checking identity key
  const rootKey = PrivateKey.fromHex(rootKeyHex)
  const derivedIdentityKey = rootKey.toPublicKey().toString()
  
  if (derivedIdentityKey !== keyData.identityKey) {
    throw new Error('Invalid password')
  }

  // Load wallet
  return await createWalletDirect(
    config.chain,
    rootKeyHex,
    config.walletPath,
    config.databaseName
  )
}

/**
 * Get wallet info without unlocking
 */
export function getWalletInfo(): WalletInfo {
  const config = loadConfig()
  
  if (!isWalletInitialized()) {
    return {
      initialized: false,
      chain: config.chain
    }
  }

  const keyPath = getKeyFilePath(config)
  const keyData = JSON.parse(readFileSync(keyPath, 'utf-8'))

  return {
    initialized: true,
    chain: config.chain,
    identityKey: keyData.identityKey
  }
}

/**
 * Reset/delete wallet
 */
export function resetWallet(): void {
  const config = loadConfig()
  const keyPath = getKeyFilePath(config)
  
  if (existsSync(keyPath)) {
    unlinkSync(keyPath)
  }
  if (existsSync(config.walletPath)) {
    unlinkSync(config.walletPath)
  }
}

/**
 * Derive a P2PKH address from identity key
 */
export function deriveAddress(identityKey: string, chain: 'main' | 'test'): string {
  const pubKey = PublicKey.fromString(identityKey)
  const pubKeyHash = Hash.hash160(pubKey.encode(true))
  
  // Version byte: 0x00 for mainnet, 0x6f for testnet
  const version = chain === 'main' ? 0x00 : 0x6f
  const payload = [version, ...pubKeyHash]
  
  // Double SHA256 for checksum
  const checksum = Hash.sha256(Hash.sha256(payload)).slice(0, 4)
  const fullPayload = [...payload, ...checksum]
  
  return Utils.toBase58(fullPayload)
}
