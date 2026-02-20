/**
 * BSV Blockchain Services
 * 
 * Wallet-level blockchain access via WhatsOnChain API:
 * - UTXO fetching
 * - Transaction lookup
 * - Transaction broadcasting
 */

import { Transaction } from '@bsv/sdk'

// WhatsOnChain API
const WOC_BASE = 'https://api.whatsonchain.com/v1/bsv/main'

export interface UTXO {
  txid: string
  vout: number
  satoshis: number
  scriptPubKey: string
}

export interface TxInfo {
  txid: string
  hex: string
  blockHeight?: number
  blockHash?: string
  merkleProof?: any
}

/**
 * Fetch UTXOs for an address from WhatsOnChain
 */
export async function fetchUTXOs(address: string): Promise<UTXO[]> {
  const response = await fetch(`${WOC_BASE}/address/${address}/unspent`)
  if (!response.ok) {
    throw new Error(`Failed to fetch UTXOs: ${response.statusText}`)
  }
  
  const utxos = await response.json()
  
  // Get script for each UTXO
  const result: UTXO[] = []
  for (const utxo of utxos) {
    const txResponse = await fetch(`${WOC_BASE}/tx/${utxo.tx_hash}/hex`)
    if (txResponse.ok) {
      const txHex = await txResponse.text()
      const tx = Transaction.fromHex(txHex)
      const output = tx.outputs[utxo.tx_pos]
      
      result.push({
        txid: utxo.tx_hash,
        vout: utxo.tx_pos,
        satoshis: utxo.value,
        scriptPubKey: output.lockingScript.toHex()
      })
    }
  }
  
  return result
}

/**
 * Fetch a transaction by txid
 */
export async function fetchTransaction(txid: string): Promise<TxInfo> {
  const hexResponse = await fetch(`${WOC_BASE}/tx/${txid}/hex`)
  if (!hexResponse.ok) {
    throw new Error(`Failed to fetch transaction: ${hexResponse.statusText}`)
  }
  
  const hex = await hexResponse.text()
  
  // Get confirmation info
  const infoResponse = await fetch(`${WOC_BASE}/tx/${txid}`)
  let blockHeight: number | undefined
  let blockHash: string | undefined
  
  if (infoResponse.ok) {
    const info = await infoResponse.json()
    if (info.blockheight) {
      blockHeight = info.blockheight
      blockHash = info.blockhash
    }
  }
  
  return { txid, hex, blockHeight, blockHash }
}

/**
 * Broadcast a transaction
 */
export async function broadcastTransaction(txHex: string): Promise<string> {
  const response = await fetch(`${WOC_BASE}/tx/raw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txhex: txHex })
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Broadcast failed: ${error}`)
  }
  
  const txid = await response.text()
  return txid.replace(/"/g, '').trim()
}
