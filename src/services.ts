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

export interface MerkleProof {
  index: number
  txOrId: string
  target: string
  nodes: string[]
  targetType?: string
  proofType?: string
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

/**
 * Fetch merkle proof for a transaction
 * Returns TSC/BUMP format merkle path
 */
export async function fetchMerkleProof(txid: string): Promise<MerkleProof | null> {
  const response = await fetch(`${WOC_BASE}/tx/${txid}/proof/tsc`)
  
  if (!response.ok) {
    // Transaction might not be confirmed yet
    if (response.status === 404) {
      return null
    }
    throw new Error(`Failed to fetch merkle proof: ${response.statusText}`)
  }
  
  const proof = await response.json()
  // WoC /proof/tsc returns an array; take the first entry
  const entry = Array.isArray(proof) ? proof[0] : proof
  return entry as MerkleProof
}

/**
 * Fetch raw transaction hex by txid
 * Alias for fetchTransaction but returns just hex
 */
export async function getRawTx(txid: string): Promise<string> {
  const response = await fetch(`${WOC_BASE}/tx/${txid}/hex`)
  if (!response.ok) {
    throw new Error(`Failed to fetch raw transaction: ${response.statusText}`)
  }
  return await response.text()
}

/**
 * Broadcast BEEF envelope (BRC-62)
 * Tries ARC endpoint first, falls back to raw tx broadcast
 */
export async function broadcastBeef(beefHex: string): Promise<string> {
  // TODO: Implement ARC endpoint when available
  // For now, fall back to extracting the transaction and broadcasting raw
  
  // ARC endpoint would be:
  // const response = await fetch('https://arc.taal.com/v1/tx', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/octet-stream' },
  //   body: Buffer.from(beefHex, 'hex')
  // })
  
  // Fallback: broadcast as raw transaction
  // Extract the transaction from BEEF and broadcast it
  // (The transaction is the last entry in the BEEF envelope)
  
  console.warn('[broadcastBeef] ARC endpoint not configured, falling back to raw tx broadcast')
  
  // For now, caller should handle broadcasting the raw tx separately
  throw new Error('ARC endpoint not yet implemented, use broadcastTransaction() fallback')
}
