import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { Wallet } from '/home/dylan/projects/bsv-wallet/src/wallet.js'
import { Transaction, Hash } from '@bsv/sdk'

async function main() {
  const configPath = join(homedir(), '.bsv-wallet', 'config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf-8'))
  const wallet = new Wallet({ privateKey: config.privateKey })
  
  const result = await wallet.send('1Jey9iAAfkqT1pDb5UDzacAmYCccc5EXAy', 100)
  console.log('Returned TXID:', result.txid)
  
  // Now read back from DB
  const txRow = (wallet as any).db.prepare('SELECT raw_tx FROM transactions WHERE txid = ?').get(result.txid) as any
  if (txRow) {
    const storedTx = Transaction.fromBinary(Array.from(txRow.raw_tx))
    console.log('Stored TXID:', storedTx.id('hex'))
    console.log('Match:', result.txid === storedTx.id('hex'))
  } else {
    console.log('TX not found in DB!')
  }
  
  // Check the BEEF 
  if (result.beef) {
    const { Beef } = await import('@bsv/sdk')
    const beef = Beef.fromString(result.beef)
    console.log('BEEF BUMPs:', beef.bumps?.length)
    console.log('BEEF txs:', beef.txs?.length)
    // Check last tx in beef
    const lastTx = beef.txs?.[beef.txs.length - 1]
    if (lastTx) {
      console.log('BEEF last tx id:', lastTx.tx?.id('hex'))
      console.log('Matches returned txid:', lastTx.tx?.id('hex') === result.txid)
    }
  }
}

main().catch(console.error)
