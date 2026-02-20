/**
 * BSV Wallet — OpenClaw Plugin
 * 
 * Registers wallet tools for agent use:
 * - wallet_balance: Check current balance
 * - wallet_send: Send BSV to an address
 * - wallet_sync: Sync UTXOs from blockchain
 * - wallet_receive: Show deposit address
 * - wallet_history: UTXO/transaction history
 */

import { Wallet } from '../../src/wallet.js'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

function loadAgentWallet(agentId?: string): Wallet {
  const home = homedir()
  
  // Try agent-specific workspace first, then default
  const paths = [
    agentId ? join(home, '.openclaw', `workspace-${agentId}`, 'wallet-config.json') : null,
    join(home, '.bsv-wallet', 'config.json'),
    join(home, '.bsv-p2p', 'config.json'), // Legacy path
  ].filter(Boolean) as string[]

  for (const configPath of paths) {
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      const dbPath = config.dbPath || join(configPath, '..', 'wallet.db')
      return new Wallet({ privateKey: config.privateKey, dbPath })
    }
  }

  throw new Error('No wallet configured. Run: bsv-wallet init')
}

export default function register(api: any) {
  api.registerTool({
    name: 'wallet_balance',
    description: 'Check your BSV wallet balance. Returns balance in satoshis and UTXO count.',
    parameters: { type: 'object', properties: {} },
    async execute(ctx: any) {
      const wallet = loadAgentWallet(ctx?.agentId)
      const balance = wallet.getBalance()
      const utxos = wallet.getUTXOs()
      return {
        balance,
        utxoCount: utxos.length,
        address: wallet.getAddress()
      }
    }
  })

  api.registerTool({
    name: 'wallet_send',
    description: 'Send BSV satoshis to an address. Returns the transaction ID.',
    parameters: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Destination BSV address' },
        amount: { type: 'number', description: 'Amount in satoshis' }
      },
      required: ['address', 'amount']
    },
    async execute(ctx: any, params: { address: string; amount: number }) {
      const wallet = loadAgentWallet(ctx?.agentId)
      const txid = await wallet.send(params.address, params.amount)
      const balance = wallet.getBalance()
      return { txid, remainingBalance: balance }
    }
  })

  api.registerTool({
    name: 'wallet_sync',
    description: 'Sync wallet UTXOs from the blockchain. Call after receiving payments.',
    parameters: { type: 'object', properties: {} },
    async execute(ctx: any) {
      const wallet = loadAgentWallet(ctx?.agentId)
      const newUtxos = await wallet.sync()
      const balance = wallet.getBalance()
      return { newUtxos, balance, utxoCount: wallet.getUTXOs().length }
    }
  })

  api.registerTool({
    name: 'wallet_receive',
    description: 'Show your BSV deposit address. Share this to receive payments.',
    parameters: { type: 'object', properties: {} },
    async execute(ctx: any) {
      const wallet = loadAgentWallet(ctx?.agentId)
      return { address: wallet.getAddress() }
    }
  })

  api.registerTool({
    name: 'wallet_history',
    description: 'Show UTXO history — all tracked unspent and spent outputs.',
    parameters: { type: 'object', properties: {} },
    async execute(ctx: any) {
      const wallet = loadAgentWallet(ctx?.agentId)
      const utxos = wallet.getUTXOs()
      return {
        total: utxos.length,
        unspent: utxos.filter(u => !u.spent),
        spent: utxos.filter(u => u.spent)
      }
    }
  })
}
