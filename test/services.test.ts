/**
 * Unit tests for blockchain services (WhatsOnChain API)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchUTXOs, fetchTransaction, broadcastTransaction } from '../src/services.js'

// Mock fetch globally
global.fetch = vi.fn()

describe('fetchUTXOs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch UTXOs for an address', async () => {
    const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    
    // Valid P2PKH transaction hex (1 input, 1 output)
    const validTxHex = '0100000001000000000000000000000000000000000000000000000000000000000000000000000000ffffffff01a086010000000000001976a914000000000000000000000000000000000000000088ac00000000'
    
    // Mock UTXO list response
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        tx_hash: 'abc123',
        tx_pos: 0,
        value: 50000
      }]
    })
    
    // Mock transaction hex response
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => validTxHex
    })
    
    const utxos = await fetchUTXOs(address)
    
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/address/${address}/unspent`)
    )
    expect(utxos).toBeInstanceOf(Array)
    expect(utxos).toHaveLength(1)
    expect(utxos[0]).toMatchObject({
      txid: 'abc123',
      vout: 0,
      satoshis: 50000
    })
  })

  it('should throw error on failed UTXO fetch', async () => {
    const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found'
    })
    
    await expect(fetchUTXOs(address)).rejects.toThrow('Failed to fetch UTXOs')
  })

  it('should handle empty UTXO list', async () => {
    const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    })
    
    const utxos = await fetchUTXOs(address)
    
    expect(utxos).toEqual([])
  })

  it('should skip UTXOs with failed tx fetch', async () => {
    const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        tx_hash: 'abc123',
        tx_pos: 0,
        value: 50000
      }]
    })
    
    // Mock failed transaction hex response
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false
    })
    
    const utxos = await fetchUTXOs(address)
    
    expect(utxos).toEqual([])
  })
})

describe('fetchTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch transaction hex', async () => {
    const txid = 'abc123'
    const mockHex = '0100000001...'
    
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => mockHex
    })
    
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        blockheight: 123456,
        blockhash: 'block123'
      })
    })
    
    const tx = await fetchTransaction(txid)
    
    expect(tx).toEqual({
      txid,
      hex: mockHex,
      blockHeight: 123456,
      blockHash: 'block123'
    })
  })

  it('should handle unconfirmed transactions', async () => {
    const txid = 'abc123'
    const mockHex = '0100000001...'
    
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => mockHex
    })
    
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}) // No block info
    })
    
    const tx = await fetchTransaction(txid)
    
    expect(tx).toEqual({
      txid,
      hex: mockHex
    })
  })

  it('should throw error on failed fetch', async () => {
    const txid = 'abc123'
    
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found'
    })
    
    await expect(fetchTransaction(txid)).rejects.toThrow('Failed to fetch transaction')
  })
})

describe('broadcastTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should broadcast transaction and return txid', async () => {
    const txHex = '0100000001...'
    const txid = 'abc123'
    
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => `"${txid}"`
    })
    
    const result = await broadcastTransaction(txHex)
    
    expect(result).toBe(txid)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/tx/raw'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txhex: txHex })
      })
    )
  })

  it('should strip quotes and whitespace from txid', async () => {
    const txHex = '0100000001...'
    const txid = 'abc123'
    
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => `  "${txid}"  \n`
    })
    
    const result = await broadcastTransaction(txHex)
    
    expect(result).toBe(txid)
  })

  it('should throw error on failed broadcast', async () => {
    const txHex = '0100000001...'
    
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      text: async () => 'Transaction rejected'
    })
    
    await expect(broadcastTransaction(txHex)).rejects.toThrow('Broadcast failed')
  })

  it('should handle network errors', async () => {
    const txHex = '0100000001...'
    
    ;(global.fetch as any).mockRejectedValueOnce(new Error('Network error'))
    
    await expect(broadcastTransaction(txHex)).rejects.toThrow('Network error')
  })
})
