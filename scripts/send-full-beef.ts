import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { Wallet } from '/home/dylan/projects/bsv-wallet/src/wallet.js'
import { Beef, Transaction, MerklePath } from '@bsv/sdk'

async function main() {
  const configPath = join(homedir(), '.bsv-wallet', 'config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf-8'))
  const wallet = new Wallet({ privateKey: config.privateKey })
  const db = (wallet as any).db
  
  console.log('Balance:', wallet.getBalance())
  
  // Send 1000 sats  
  const result = await wallet.send('1Jey9iAAfkqT1pDb5UDzacAmYCccc5EXAy', 1000)
  console.log('TXID:', result.txid)
  
  // Now build proper BEEF manually by walking the chain
  const beef = new Beef()
  
  // Walk the tx chain from our new tx back to a confirmed ancestor
  async function addTxChain(txid: string, depth: number) {
    if (depth > 10) return
    
    const txRow = db.prepare('SELECT raw_tx, merkle_path, block_height FROM transactions WHERE txid = ?').get(txid) as any
    if (!txRow?.raw_tx) {
      console.log(`  ${'  '.repeat(depth)}${txid.substring(0,16)} - not in DB, skipping`)
      return
    }
    
    const tx = Transaction.fromBinary(Array.from(txRow.raw_tx))
    
    // Try to add merkle proof
    if (txRow.merkle_path && txRow.block_height) {
      const tscProof = JSON.parse(txRow.merkle_path)
      if (Array.isArray(tscProof) && tscProof[0]?.nodes) {
        const tsc = tscProof[0]
        const txIndex = tsc.index
        const height = txRow.block_height
        
        const path: any[][] = []
        let idx = txIndex
        for (let level = 0; level < tsc.nodes.length; level++) {
          const node = tsc.nodes[level]
          const siblingOffset = idx ^ 1
          const levelEntries: any[] = []
          // At level 0, mark the tx's own position
          if (level === 0) {
            levelEntries.push({ offset: idx, hash: txid, txid: true })
          }
          // Add the sibling hash
          if (node === '*') {
            levelEntries.push({ offset: siblingOffset, duplicate: true })
          } else {
            levelEntries.push({ offset: siblingOffset, hash: node })
          }
          path.push(levelEntries)
          idx = idx >> 1
        }
        tx.merklePath = new MerklePath(height, path)
        console.log(`  ${'  '.repeat(depth)}${txid.substring(0,16)} - PROVEN at height ${height}`)
      }
    } else {
      console.log(`  ${'  '.repeat(depth)}${txid.substring(0,16)} - unproven`)
      
      // Walk to parent
      const raw = Buffer.from(txRow.raw_tx).toString('hex')
      const parentTxid = raw.substring(10, 74).match(/../g)!.reverse().join('')
      await addTxChain(parentTxid, depth + 1)
    }
    
    beef.mergeTransaction(tx)
  }
  
  // Start from our new tx's parent
  const newTxRow = db.prepare('SELECT raw_tx FROM transactions WHERE txid = ?').get(result.txid) as any
  if (newTxRow) {
    const raw = Buffer.from(newTxRow.raw_tx).toString('hex')
    const parentTxid = raw.substring(10, 74).match(/../g)!.reverse().join('')
    await addTxChain(parentTxid, 0)
  }
  
  // Add our new tx last
  const newTx = Transaction.fromBinary(Array.from(newTxRow.raw_tx))
  beef.mergeTransaction(newTx)
  
  const beefHex = beef.toHex()
  console.log('\nBEEF hex length:', beefHex.length)
  console.log('BUMPs:', beef.bumps?.length ?? 0)
  console.log('Txs:', beef.txs?.length ?? 0)
  
  // Output for P2P send
  console.log('\n=== SEND COMMAND ===')
  console.log(JSON.stringify({
    peerId: '12D3KooWAeZWjLvvhDUg9yZpkVzT3jCwS4qqMCjkiMWCan2PxZ4a',
    multiaddr: '/ip4/167.172.134.84/tcp/4001/p2p/12D3KooWAcdYkneggrQd3eWBMdcjqHiTNSV81HABRcgrvXywcnDs/p2p-circuit/p2p/12D3KooWAeZWjLvvhDUg9yZpkVzT3jCwS4qqMCjkiMWCan2PxZ4a',
    txid: result.txid,
    vout: 0,
    amount: 1000,
    toAddress: '1Jey9iAAfkqT1pDb5UDzacAmYCccc5EXAy',
    memo: '1000 sats with full BEEF chain — includes merkle proof!',
    beef: beefHex
  }))
}

main().catch(console.error)
