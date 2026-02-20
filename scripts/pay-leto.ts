import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { Wallet } from '../src/wallet.js'

async function main() {
  const config = JSON.parse(readFileSync(join(homedir(), '.bsv-wallet', 'config.json'), 'utf-8'))
  const wallet = new Wallet({ privateKey: config.privateKey })
  
  console.log('Balance:', wallet.getBalance())
  
  const result = await wallet.send('1Jey9iAAfkqT1pDb5UDzacAmYCccc5EXAy', 1000)
  console.log('TXID:', result.txid)
  console.log('BEEF length:', result.beef?.length ?? 0)
  
  // Send via P2P
  const payload = {
    peerId: '12D3KooWAeZWjLvvhDUg9yZpkVzT3jCwS4qqMCjkiMWCan2PxZ4a',
    multiaddr: '/ip4/167.172.134.84/tcp/4001/p2p/12D3KooWAcdYkneggrQd3eWBMdcjqHiTNSV81HABRcgrvXywcnDs/p2p-circuit/p2p/12D3KooWAeZWjLvvhDUg9yZpkVzT3jCwS4qqMCjkiMWCan2PxZ4a',
    txid: result.txid,
    vout: 0,
    amount: 1000,
    toAddress: '1Jey9iAAfkqT1pDb5UDzacAmYCccc5EXAy',
    memo: '1000 sats with WoC-sourced BEEF. Try Beef.fromString() + receiveBeef()!',
    beef: result.beef
  }
  
  const r = await fetch('http://127.0.0.1:4003/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const resp = await r.json()
  console.log('P2P send:', JSON.stringify(resp))
}

main().catch(console.error)
