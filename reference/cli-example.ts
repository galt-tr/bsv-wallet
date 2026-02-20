#!/usr/bin/env node

import { Command } from 'commander'
import chalk from 'chalk'
import { createInterface } from 'readline'
import { loadConfig, saveConfig, getConfigDir } from './config.js'
import { 
  initWallet, 
  importWallet, 
  unlockWallet, 
  getWalletInfo, 
  isWalletInitialized,
  deriveAddress,
  resetWallet
} from './wallet.js'
import { FallbackChainTracker } from './chaintracker.js'
import { Utils } from '@bsv/sdk'

const program = new Command()

program
  .name('bsv-wallet')
  .description('BSV Wallet CLI - Local SPV wallet using @bsv/wallet-toolbox')
  .version('0.1.0')

// Helper to prompt for password
async function promptPassword(prompt: string, hide = false): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

// Helper to format satoshis
function formatSats(sats: number): string {
  if (sats >= 100_000_000) {
    return `${(sats / 100_000_000).toFixed(8)} BSV`
  }
  return `${sats.toLocaleString()} sats`
}

// ============ STATUS COMMAND ============
program
  .command('status')
  .description('Show wallet status and configuration')
  .action(async () => {
    const config = loadConfig()
    const info = getWalletInfo()
    
    console.log(chalk.bold('\n🔐 BSV Wallet Status\n'))
    console.log(`${chalk.gray('Config dir:')}     ${getConfigDir()}`)
    console.log(`${chalk.gray('Wallet file:')}    ${config.walletPath}`)
    console.log(`${chalk.gray('Network:')}        ${config.chain === 'main' ? chalk.green('mainnet') : chalk.yellow('testnet')}`)
    console.log(`${chalk.gray('ChainTracks:')}    ${config.chaintracksUrl}`)
    console.log(`${chalk.gray('Fallback:')}       ${config.chaintracksUrlFallback}`)
    console.log()
    
    if (info.initialized) {
      console.log(chalk.green('✓ Wallet initialized'))
      console.log(`${chalk.gray('Identity Key:')}   ${info.identityKey}`)
      if (info.identityKey) {
        const address = deriveAddress(info.identityKey, config.chain)
        console.log(`${chalk.gray('Address:')}        ${address}`)
      }
    } else {
      console.log(chalk.yellow('✗ Wallet not initialized'))
      console.log(chalk.gray('  Run: bsv-wallet init'))
    }
    console.log()
  })

// ============ INIT COMMAND ============
program
  .command('init')
  .description('Initialize a new wallet')
  .action(async () => {
    if (isWalletInitialized()) {
      console.log(chalk.red('Error: Wallet already initialized'))
      console.log(chalk.gray('Use "bsv-wallet reset" to start fresh'))
      process.exit(1)
    }

    console.log(chalk.bold('\n🔐 Initialize New BSV Wallet\n'))
    
    const password = await promptPassword('Enter password to encrypt wallet: ')
    const confirmPassword = await promptPassword('Confirm password: ')
    
    if (password !== confirmPassword) {
      console.log(chalk.red('Error: Passwords do not match'))
      process.exit(1)
    }

    if (password.length < 8) {
      console.log(chalk.red('Error: Password must be at least 8 characters'))
      process.exit(1)
    }

    try {
      console.log(chalk.gray('\nGenerating wallet...'))
      const { rootKeyHex, identityKey } = await initWallet(password)
      
      const config = loadConfig()
      const address = deriveAddress(identityKey, config.chain)
      
      console.log(chalk.green('\n✓ Wallet created successfully!\n'))
      console.log(chalk.bold.red('⚠️  BACKUP YOUR ROOT KEY - IT CANNOT BE RECOVERED!\n'))
      console.log(chalk.yellow(`Root Key (hex): ${rootKeyHex}`))
      console.log()
      console.log(`${chalk.gray('Identity Key:')} ${identityKey}`)
      console.log(`${chalk.gray('Address:')}      ${address}`)
      console.log()
    } catch (err: any) {
      console.log(chalk.red(`Error: ${err.message}`))
      process.exit(1)
    }
  })

// ============ IMPORT COMMAND ============
program
  .command('import <key>')
  .description('Import wallet from WIF or hex private key')
  .action(async (key: string) => {
    if (isWalletInitialized()) {
      console.log(chalk.red('Error: Wallet already initialized'))
      console.log(chalk.gray('Use "bsv-wallet reset" to start fresh'))
      process.exit(1)
    }

    console.log(chalk.bold('\n🔐 Import BSV Wallet\n'))
    
    const password = await promptPassword('Enter password to encrypt wallet: ')
    const confirmPassword = await promptPassword('Confirm password: ')
    
    if (password !== confirmPassword) {
      console.log(chalk.red('Error: Passwords do not match'))
      process.exit(1)
    }

    try {
      console.log(chalk.gray('\nImporting wallet...'))
      const { identityKey } = await importWallet(key, password)
      
      const config = loadConfig()
      const address = deriveAddress(identityKey, config.chain)
      
      console.log(chalk.green('\n✓ Wallet imported successfully!\n'))
      console.log(`${chalk.gray('Identity Key:')} ${identityKey}`)
      console.log(`${chalk.gray('Address:')}      ${address}`)
      console.log()
    } catch (err: any) {
      console.log(chalk.red(`Error: ${err.message}`))
      process.exit(1)
    }
  })

// ============ RESET COMMAND ============
program
  .command('reset')
  .description('Reset wallet (delete all data)')
  .option('-f, --force', 'Skip confirmation')
  .action(async (options) => {
    if (!isWalletInitialized()) {
      console.log(chalk.yellow('Wallet not initialized, nothing to reset'))
      process.exit(0)
    }

    if (!options.force) {
      const confirm = await promptPassword(chalk.red('⚠️  This will DELETE your wallet. Type "DELETE" to confirm: '))
      if (confirm !== 'DELETE') {
        console.log('Aborted')
        process.exit(0)
      }
    }

    try {
      resetWallet()
      console.log(chalk.green('✓ Wallet reset successfully'))
    } catch (err: any) {
      console.log(chalk.red(`Error: ${err.message}`))
      process.exit(1)
    }
  })

// ============ BALANCE COMMAND ============
program
  .command('balance')
  .description('Show wallet balance')
  .option('-d, --detailed', 'Show UTXO details')
  .action(async (options) => {
    if (!isWalletInitialized()) {
      console.log(chalk.red('Error: Wallet not initialized'))
      console.log(chalk.gray('Run: bsv-wallet init'))
      process.exit(1)
    }

    const password = await promptPassword('Password: ')
    
    try {
      console.log(chalk.gray('\nUnlocking wallet...'))
      const wallet = await unlockWallet(password)
      
      console.log(chalk.bold('\n💰 Balance\n'))
      
      // Get balance
      const totalBalance = await wallet.balance()
      console.log(`${chalk.gray('Total:')} ${chalk.green(formatSats(totalBalance))}`)
      
      if (options.detailed) {
        // Get detailed UTXO info
        const balanceInfo = await wallet.balanceAndUtxos()
        console.log(`${chalk.gray('Spendable:')} ${formatSats(balanceInfo.satoshis)}`)
        console.log(`${chalk.gray('UTXOs:')} ${balanceInfo.utxoCount}`)
        
        // List spendable outputs
        const outputs = await wallet.listOutputs({
          basket: 'default',
          spendable: true,
          limit: 20
        })
        
        if (outputs.outputs && outputs.outputs.length > 0) {
          console.log(chalk.gray('\nSpendable Outputs:'))
          for (const output of outputs.outputs) {
            console.log(`  ${chalk.gray(output.outpoint)} - ${formatSats(output.satoshis)}`)
          }
        }
      }
      
      await wallet.destroy()
      console.log()
    } catch (err: any) {
      console.log(chalk.red(`Error: ${err.message}`))
      process.exit(1)
    }
  })

// ============ RECEIVE COMMAND ============
program
  .command('receive')
  .description('Show receive address')
  .action(async () => {
    const info = getWalletInfo()
    
    if (!info.initialized || !info.identityKey) {
      console.log(chalk.red('Error: Wallet not initialized'))
      console.log(chalk.gray('Run: bsv-wallet init'))
      process.exit(1)
    }

    const config = loadConfig()
    const address = deriveAddress(info.identityKey, config.chain)
    
    console.log(chalk.bold('\n📥 Receive Address\n'))
    console.log(`${chalk.gray('Address:')}      ${chalk.green(address)}`)
    console.log(`${chalk.gray('Identity Key:')} ${info.identityKey}`)
    console.log()
    console.log(chalk.gray('Note: For BRC-100 payments, share your identity key.'))
    console.log(chalk.gray('For legacy P2PKH payments, use the address above.'))
    console.log()
  })

// ============ SEND COMMAND ============
program
  .command('send <address> <amount>')
  .description('Send BSV to an address')
  .option('-m, --message <msg>', 'Transaction description')
  .action(async (address: string, amount: string, options) => {
    if (!isWalletInitialized()) {
      console.log(chalk.red('Error: Wallet not initialized'))
      process.exit(1)
    }

    // Parse amount
    let satoshis: number
    if (amount.toLowerCase().endsWith('bsv')) {
      satoshis = Math.floor(parseFloat(amount) * 100_000_000)
    } else {
      satoshis = parseInt(amount, 10)
    }

    if (isNaN(satoshis) || satoshis <= 0) {
      console.log(chalk.red('Error: Invalid amount'))
      process.exit(1)
    }

    // Validate address (basic check)
    if (!address.match(/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/)) {
      console.log(chalk.red('Error: Invalid BSV address'))
      process.exit(1)
    }

    console.log(chalk.bold('\n📤 Send BSV\n'))
    console.log(`${chalk.gray('To:')}     ${address}`)
    console.log(`${chalk.gray('Amount:')} ${formatSats(satoshis)}`)
    console.log()

    const password = await promptPassword('Password: ')
    const confirm = await promptPassword(chalk.yellow('Confirm send? (yes/no): '))
    
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('Aborted')
      process.exit(0)
    }

    try {
      console.log(chalk.gray('\nCreating transaction...'))
      const wallet = await unlockWallet(password)
      
      // Create P2PKH output using Setup helper
      const { Setup } = await import('@bsv/wallet-toolbox')
      const outputs = Setup.createP2PKHOutputs([{
        address,
        satoshis,
        outputDescription: options.message || 'Payment'
      }])

      // Create and broadcast transaction
      const result = await wallet.createAction({
        description: options.message || 'Send BSV',
        outputs,
        options: {
          acceptDelayedBroadcast: false  // Wait for broadcast
        }
      })

      if (result.txid) {
        console.log(chalk.green('\n✓ Transaction sent!\n'))
        console.log(`${chalk.gray('TXID:')} ${result.txid}`)
        console.log(`${chalk.gray('View:')} https://whatsonchain.com/tx/${result.txid}`)
      } else {
        console.log(chalk.yellow('\nTransaction created but not yet broadcast'))
        if (result.noSendChange) {
          console.log(chalk.gray('Use wallet sync to complete broadcast'))
        }
      }
      
      await wallet.destroy()
      console.log()
    } catch (err: any) {
      console.log(chalk.red(`\nError: ${err.message}`))
      if (err.details) console.log(chalk.gray(JSON.stringify(err.details, null, 2)))
      process.exit(1)
    }
  })

// ============ HISTORY COMMAND ============
program
  .command('history')
  .description('Show transaction history')
  .option('-l, --limit <n>', 'Number of transactions', '10')
  .option('-v, --verbose', 'Show full details')
  .action(async (options) => {
    if (!isWalletInitialized()) {
      console.log(chalk.red('Error: Wallet not initialized'))
      process.exit(1)
    }

    const password = await promptPassword('Password: ')
    const limit = parseInt(options.limit, 10) || 10

    try {
      console.log(chalk.gray('\nLoading history...'))
      const wallet = await unlockWallet(password)
      
      const result = await wallet.listActions({
        labels: [],  // All labels
        includeLabels: true,
        includeOutputs: options.verbose,
        includeInputs: options.verbose,
        limit
      })

      console.log(chalk.bold('\n📜 Transaction History\n'))
      
      if (!result.actions || result.actions.length === 0) {
        console.log(chalk.gray('No transactions found'))
      } else {
        for (const action of result.actions) {
          const date = new Date(action.created_at).toLocaleString()
          const status = action.status === 'completed' ? chalk.green('✓') : 
                        action.status === 'failed' ? chalk.red('✗') :
                        chalk.yellow('⋯')
          
          console.log(`${status} ${chalk.gray(date)} ${action.description || 'Transaction'}`)
          console.log(`  ${chalk.gray('TXID:')} ${action.txid || 'pending'}`)
          console.log(`  ${chalk.gray('Satoshis:')} ${formatSats(action.satoshis || 0)}`)
          
          if (action.labels && action.labels.length > 0) {
            console.log(`  ${chalk.gray('Labels:')} ${action.labels.join(', ')}`)
          }
          
          if (options.verbose && action.outputs) {
            console.log(`  ${chalk.gray('Outputs:')}`)
            for (const out of action.outputs) {
              console.log(`    ${out.outputIndex}: ${formatSats(out.satoshis)} ${out.spendable ? '(spendable)' : ''}`)
            }
          }
          console.log()
        }
        
        console.log(chalk.gray(`Showing ${result.actions.length} of ${result.totalActions || result.actions.length} transactions`))
      }
      
      await wallet.destroy()
      console.log()
    } catch (err: any) {
      console.log(chalk.red(`Error: ${err.message}`))
      process.exit(1)
    }
  })

// ============ VERIFY COMMAND ============
program
  .command('verify <beef>')
  .description('Verify a BEEF transaction (hex or file path)')
  .action(async (beefInput: string) => {
    const config = loadConfig()
    
    console.log(chalk.bold('\n🔍 Verify BEEF Transaction\n'))
    
    // Determine if input is hex or file path
    let beefHex: string
    if (beefInput.match(/^[0-9a-fA-F]+$/)) {
      beefHex = beefInput
    } else {
      // Try to read as file
      try {
        const { readFileSync } = await import('fs')
        beefHex = readFileSync(beefInput, 'utf-8').trim()
      } catch {
        console.log(chalk.red('Error: Invalid BEEF hex or file not found'))
        process.exit(1)
      }
    }

    try {
      // Parse BEEF
      const { BEEF } = await import('@bsv/sdk')
      const beef = BEEF.fromHex(beefHex)
      
      console.log(`${chalk.gray('BEEF Version:')} ${beef.version}`)
      console.log(`${chalk.gray('Transactions:')} ${beef.txs.length}`)
      console.log(`${chalk.gray('BUMPs:')} ${beef.bumps.length}`)
      
      // Verify merkle proofs against ChainTracks
      const tracker = new FallbackChainTracker(
        config.chaintracksUrl,
        config.chaintracksUrlFallback
      )
      
      console.log(chalk.gray('\nVerifying merkle proofs...'))
      
      let allValid = true
      for (const bump of beef.bumps) {
        const height = bump.blockHeight
        // Get the merkle root from the bump
        const root = bump.path[bump.path.length - 1][0].hash
        
        if (root) {
          const valid = await tracker.isValidRootForHeight(root, height)
          if (valid) {
            console.log(chalk.green(`  ✓ Block ${height}: Valid merkle proof`))
          } else {
            console.log(chalk.red(`  ✗ Block ${height}: Invalid merkle proof`))
            allValid = false
          }
        }
      }
      
      // Show transaction details
      console.log(chalk.gray('\nTransactions:'))
      for (const tx of beef.txs) {
        const txid = tx.id('hex')
        console.log(`  ${chalk.gray('TXID:')} ${txid}`)
        console.log(`  ${chalk.gray('Inputs:')} ${tx.inputs.length}`)
        console.log(`  ${chalk.gray('Outputs:')} ${tx.outputs.length}`)
        
        let totalOutput = 0
        for (const output of tx.outputs) {
          totalOutput += output.satoshis || 0
        }
        console.log(`  ${chalk.gray('Total Output:')} ${formatSats(totalOutput)}`)
        console.log()
      }
      
      if (allValid) {
        console.log(chalk.green('✓ BEEF verification passed'))
      } else {
        console.log(chalk.red('✗ BEEF verification failed'))
        process.exit(1)
      }
      
    } catch (err: any) {
      console.log(chalk.red(`Error: ${err.message}`))
      process.exit(1)
    }
  })

// ============ INTERNALIZE COMMAND ============
program
  .command('internalize <beef>')
  .description('Internalize a received BEEF payment')
  .option('-d, --description <desc>', 'Payment description', 'Received payment')
  .action(async (beefInput: string, options) => {
    if (!isWalletInitialized()) {
      console.log(chalk.red('Error: Wallet not initialized'))
      process.exit(1)
    }

    console.log(chalk.bold('\n📥 Internalize Payment\n'))
    
    // Parse BEEF
    let beefHex: string
    if (beefInput.match(/^[0-9a-fA-F]+$/)) {
      beefHex = beefInput
    } else {
      try {
        const { readFileSync } = await import('fs')
        beefHex = readFileSync(beefInput, 'utf-8').trim()
      } catch {
        console.log(chalk.red('Error: Invalid BEEF hex or file not found'))
        process.exit(1)
      }
    }

    const password = await promptPassword('Password: ')

    try {
      const wallet = await unlockWallet(password)
      const beefBytes = Utils.toArray(beefHex, 'hex')
      
      // Internalize the payment
      const result = await wallet.internalizeAction({
        tx: beefBytes,
        outputs: [],  // Auto-detect outputs for this wallet
        description: options.description
      })

      if (result.accepted) {
        console.log(chalk.green('\n✓ Payment internalized successfully!'))
      } else {
        console.log(chalk.yellow('\nPayment processed with warnings'))
      }
      
      await wallet.destroy()
      console.log()
    } catch (err: any) {
      console.log(chalk.red(`Error: ${err.message}`))
      process.exit(1)
    }
  })

// ============ CONFIG COMMAND ============
program
  .command('config')
  .description('View or update configuration')
  .option('--chain <chain>', 'Set chain (main/test)')
  .option('--chaintracks <url>', 'Set primary ChainTracks URL')
  .option('--fallback <url>', 'Set fallback ChainTracks URL')
  .action(async (options) => {
    let config = loadConfig()
    
    if (options.chain) {
      if (options.chain !== 'main' && options.chain !== 'test') {
        console.log(chalk.red('Error: Chain must be "main" or "test"'))
        process.exit(1)
      }
      config = saveConfig({ chain: options.chain })
      console.log(chalk.green(`✓ Chain set to ${options.chain}`))
    }
    
    if (options.chaintracks) {
      config = saveConfig({ chaintracksUrl: options.chaintracks })
      console.log(chalk.green(`✓ ChainTracks URL set to ${options.chaintracks}`))
    }
    
    if (options.fallback) {
      config = saveConfig({ chaintracksUrlFallback: options.fallback })
      console.log(chalk.green(`✓ Fallback URL set to ${options.fallback}`))
    }
    
    if (!options.chain && !options.chaintracks && !options.fallback) {
      console.log(chalk.bold('\n⚙️  Configuration\n'))
      console.log(JSON.stringify(config, null, 2))
      console.log()
    }
  })

// ============ HEADERS COMMAND ============
program
  .command('headers')
  .description('Test ChainTracks connection and show chain tip')
  .action(async () => {
    const config = loadConfig()
    
    console.log(chalk.bold('\n⛓️  ChainTracks Status\n'))
    console.log(`${chalk.gray('Primary:')}  ${config.chaintracksUrl}`)
    console.log(`${chalk.gray('Fallback:')} ${config.chaintracksUrlFallback}`)
    console.log()
    
    const tracker = new FallbackChainTracker(
      config.chaintracksUrl,
      config.chaintracksUrlFallback
    )
    
    try {
      console.log(chalk.gray('Querying chain tip...'))
      const height = await tracker.currentHeight()
      console.log(chalk.green(`\n✓ Connected! Chain height: ${height}`))
      
      const status = tracker.getStatus()
      if (status.usingFallback) {
        console.log(chalk.yellow(`  (Using fallback: ${status.fallback})`))
      }
      
      // Get latest header
      try {
        const header = await tracker.getHeaderForHeight(height)
        if (header && typeof header === 'string') {
          console.log(`${chalk.gray('Latest header:')} ${header.slice(0, 32)}...`)
        }
      } catch {
        // Header fetch optional
      }
      
      console.log()
    } catch (err: any) {
      console.log(chalk.red(`\n✗ Connection failed: ${err.message}`))
      process.exit(1)
    }
  })

// ============ SYNC COMMAND ============
program
  .command('sync')
  .description('Sync wallet with network')
  .action(async () => {
    if (!isWalletInitialized()) {
      console.log(chalk.red('Error: Wallet not initialized'))
      process.exit(1)
    }

    const password = await promptPassword('Password: ')

    try {
      console.log(chalk.gray('\nSyncing wallet...'))
      const wallet = await unlockWallet(password)
      
      // Check for pending no-send transactions
      const noSend = await wallet.listNoSendActions({ labels: [], limit: 100 })
      if (noSend.actions && noSend.actions.length > 0) {
        console.log(`${chalk.yellow('Found')} ${noSend.actions.length} ${chalk.yellow('pending transactions')}`)
      }
      
      // Check for failed transactions
      const failed = await wallet.listFailedActions({ labels: [], limit: 100 })
      if (failed.actions && failed.actions.length > 0) {
        console.log(`${chalk.red('Found')} ${failed.actions.length} ${chalk.red('failed transactions')}`)
      }
      
      // Get network height
      const heightResult = await wallet.getHeight({})
      console.log(`${chalk.gray('Network height:')} ${heightResult.height}`)
      
      await wallet.destroy()
      console.log(chalk.green('\n✓ Sync complete'))
      console.log()
    } catch (err: any) {
      console.log(chalk.red(`Error: ${err.message}`))
      process.exit(1)
    }
  })

program.parse()
