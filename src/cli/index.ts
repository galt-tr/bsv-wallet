#!/usr/bin/env node
/**
 * bsv-wallet CLI
 * 
 * Usage:
 *   bsv-wallet init              Generate keys and create config
 *   bsv-wallet balance            Show wallet balance
 *   bsv-wallet send <addr> <amt>  Send satoshis to an address
 *   bsv-wallet sync               Sync UTXOs from blockchain
 *   bsv-wallet address            Show deposit address
 *   bsv-wallet history            Show UTXO history
 */

import { Wallet } from '../wallet.js'
import { PrivateKey } from '@bsv/sdk'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.bsv-wallet')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')
const DB_PATH = join(CONFIG_DIR, 'wallet.db')

interface Config {
  privateKey: string
  publicKey: string
  address: string
  dbPath: string
  createdAt: string
}

function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    console.error('No wallet configured. Run: bsv-wallet init')
    process.exit(1)
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
}

function loadWallet(): Wallet {
  const config = loadConfig()
  return new Wallet({
    privateKey: config.privateKey,
    dbPath: config.dbPath || DB_PATH
  })
}

async function cmdInit() {
  if (existsSync(CONFIG_PATH)) {
    console.error('Wallet already exists at', CONFIG_PATH)
    console.error('Delete it first if you want to reinitialize.')
    process.exit(1)
  }

  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }

  const privKey = PrivateKey.fromRandom()
  const wallet = new Wallet({
    privateKey: privKey.toHex(),
    dbPath: DB_PATH
  })

  const config: Config = {
    privateKey: privKey.toHex(),
    publicKey: privKey.toPublicKey().toString(),
    address: wallet.getAddress(),
    dbPath: DB_PATH,
    createdAt: new Date().toISOString()
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  console.log('Wallet initialized!')
  console.log(`Address: ${config.address}`)
  console.log(`Config:  ${CONFIG_PATH}`)
  console.log(`DB:      ${DB_PATH}`)
  console.log('\nFund your wallet by sending BSV to the address above.')
}

async function cmdBalance() {
  const wallet = loadWallet()
  const balance = wallet.getBalance()
  const utxos = wallet.getUTXOs()
  console.log(`Balance: ${balance} sats`)
  console.log(`UTXOs:   ${utxos.length}`)
}

async function cmdSend(address: string, amount: string) {
  if (!address || !amount) {
    console.error('Usage: bsv-wallet send <address> <amount>')
    process.exit(1)
  }

  const sats = parseInt(amount, 10)
  if (isNaN(sats) || sats <= 0) {
    console.error('Invalid amount:', amount)
    process.exit(1)
  }

  const wallet = loadWallet()
  try {
    const txid = await wallet.send(address, sats)
    console.log(`Sent ${sats} sats to ${address}`)
    console.log(`TXID: ${txid}`)
  } catch (err: any) {
    console.error('Send failed:', err.message)
    process.exit(1)
  }
}

async function cmdSync() {
  const wallet = loadWallet()
  console.log('Syncing from blockchain...')
  const newUtxos = await wallet.sync()
  const balance = wallet.getBalance()
  console.log(`Found ${newUtxos} new UTXOs`)
  console.log(`Balance: ${balance} sats`)
}

async function cmdAddress() {
  const wallet = loadWallet()
  console.log(wallet.getAddress())
}

async function cmdHistory() {
  const wallet = loadWallet()
  const utxos = wallet.getUTXOs()
  
  if (utxos.length === 0) {
    console.log('No UTXOs tracked. Run: bsv-wallet sync')
    return
  }

  console.log(`Total: ${utxos.length} UTXOs\n`)
  for (const utxo of utxos) {
    const status = utxo.spent ? '✗ spent' : '✓ unspent'
    const memo = utxo.memo ? ` (${utxo.memo})` : ''
    console.log(`  ${status}  ${utxo.satoshis} sats  ${utxo.txid}:${utxo.vout}${memo}`)
  }
}

// Main
const [,, command, ...args] = process.argv

switch (command) {
  case 'init':
    cmdInit(); break
  case 'balance':
    cmdBalance(); break
  case 'send':
    cmdSend(args[0], args[1]); break
  case 'sync':
    cmdSync(); break
  case 'address':
    cmdAddress(); break
  case 'history':
    cmdHistory(); break
  default:
    console.log(`bsv-wallet — Simple BSV wallet

Commands:
  init              Generate keys and create wallet
  balance           Show wallet balance
  send <addr> <amt> Send satoshis to an address
  sync              Sync UTXOs from blockchain
  address           Show deposit address
  history           Show UTXO history

Config: ~/.bsv-wallet/config.json`)
}
