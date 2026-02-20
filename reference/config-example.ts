import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface WalletConfig {
  chain: 'main' | 'test'
  chaintracksUrl: string
  chaintracksUrlFallback: string
  walletPath: string
  databaseName: string
}

const DEFAULT_CONFIG: WalletConfig = {
  chain: 'main',
  // Babbage as primary (arcade ChainTracks endpoint TBD)
  chaintracksUrl: 'https://mainnet-chaintracks.babbage.systems',
  chaintracksUrlFallback: 'https://mainnet-chaintracks.babbage.systems', // Same for now
  walletPath: join(homedir(), '.bsv-wallet', 'wallet.sqlite'),
  databaseName: 'bsv-wallet'
}

const CONFIG_DIR = join(homedir(), '.bsv-wallet')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

export function loadConfig(): WalletConfig {
  ensureConfigDir()
  
  if (existsSync(CONFIG_PATH)) {
    try {
      const data = readFileSync(CONFIG_PATH, 'utf-8')
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) }
    } catch {
      return DEFAULT_CONFIG
    }
  }
  
  return DEFAULT_CONFIG
}

export function saveConfig(config: Partial<WalletConfig>): WalletConfig {
  ensureConfigDir()
  const current = loadConfig()
  const updated = { ...current, ...config }
  writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2))
  return updated
}

export function getConfigDir(): string {
  return CONFIG_DIR
}
