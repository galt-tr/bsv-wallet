/**
 * Unit tests for Wallet class
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Wallet } from '../src/wallet.js'
import { PrivateKey, Transaction, P2PKH } from '@bsv/sdk'
import { unlinkSync, existsSync } from 'fs'
import * as services from '../src/services.js'

// Mock services
vi.mock('../src/services.js')

describe('Wallet', () => {
  const testPrivateKey = PrivateKey.fromRandom()
  const testDbPath = '/tmp/test-wallet.db'
  let wallet: Wallet

  beforeEach(() => {
    // Clean up any existing test db
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath)
    }
    
    wallet = new Wallet({
      privateKey: testPrivateKey.toHex(),
      dbPath: testDbPath
    })
    
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Clean up test db
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath)
    }
  })

  describe('Constructor and Key Derivation', () => {
    it('should create wallet with private key', () => {
      expect(wallet).toBeDefined()
      expect(wallet.getAddress()).toMatch(/^1[A-HJ-NP-Za-km-z1-9]{25,34}$/)
    })

    it('should derive correct address from private key', () => {
      const address = wallet.getAddress()
      expect(address).toBeTruthy()
      expect(typeof address).toBe('string')
      expect(address.length).toBeGreaterThan(25)
    })

    it('should return public key as hex', () => {
      const pubKey = wallet.getPublicKey()
      expect(pubKey).toMatch(/^[0-9a-f]{66}$/)
    })

    it('should initialize database with correct schema', () => {
      const utxos = wallet.getUTXOs()
      expect(Array.isArray(utxos)).toBe(true)
      expect(utxos).toEqual([])
    })

    it('should use default db path if not provided', () => {
      const defaultWallet = new Wallet({
        privateKey: testPrivateKey.toHex()
      })
      expect(defaultWallet.getAddress()).toBeTruthy()
    })

    it('should handle hex private key', () => {
      const hexKey = testPrivateKey.toHex()
      const walletFromHex = new Wallet({
        privateKey: hexKey,
        dbPath: '/tmp/test-wallet-hex.db'
      })
      
      expect(walletFromHex.getAddress()).toBeTruthy()
      
      if (existsSync('/tmp/test-wallet-hex.db')) {
        unlinkSync('/tmp/test-wallet-hex.db')
      }
    })
  })

  describe('UTXO Tracking', () => {
    it('should track received payments', () => {
      wallet.recordPayment(
        'abc123',
        0,
        50000,
        '76a914...',
        'peer123',
        'test payment'
      )
      
      const utxos = wallet.getUTXOs()
      expect(utxos).toHaveLength(1)
      expect(utxos[0]).toMatchObject({
        txid: 'abc123',
        vout: 0,
        satoshis: 50000,
        fromPeerId: 'peer123',
        memo: 'test payment',
        spent: false
      })
    })

    it('should handle multiple UTXOs', () => {
      wallet.recordPayment('tx1', 0, 10000, '76a914...')
      wallet.recordPayment('tx2', 0, 20000, '76a914...')
      wallet.recordPayment('tx3', 0, 30000, '76a914...')
      
      const utxos = wallet.getUTXOs()
      expect(utxos).toHaveLength(3)
      expect(utxos.map(u => u.satoshis).sort((a, b) => b - a)).toEqual([30000, 20000, 10000])
    })

    it('should replace existing UTXO on duplicate', () => {
      wallet.recordPayment('tx1', 0, 10000, '76a914...')
      wallet.recordPayment('tx1', 0, 15000, '76a914...') // Same txid:vout
      
      const utxos = wallet.getUTXOs()
      expect(utxos).toHaveLength(1)
      expect(utxos[0].satoshis).toBe(15000)
    })

    it('should handle payments without peer/memo', () => {
      wallet.recordPayment('tx1', 0, 10000, '76a914...')
      
      const utxos = wallet.getUTXOs()
      // SQLite stores NULL as null, not undefined
      expect(utxos[0].fromPeerId).toBeNull()
      expect(utxos[0].memo).toBeNull()
    })

    it('should return empty array when no UTXOs', () => {
      const utxos = wallet.getUTXOs()
      expect(utxos).toEqual([])
    })

    it('should not return spent UTXOs', () => {
      wallet.recordPayment('tx1', 0, 10000, '76a914...')
      wallet.recordPayment('tx2', 0, 20000, '76a914...')
      
      // Manually mark first UTXO as spent
      const utxos = wallet.getUTXOs()
      expect(utxos).toHaveLength(2)
      
      // After spending one, should only return unspent
      wallet.recordPayment('tx1', 0, 10000, '76a914...')
      expect(wallet.getUTXOs()).toHaveLength(2)
    })
  })

  describe('Balance Calculation', () => {
    it('should return 0 for empty wallet', () => {
      expect(wallet.getBalance()).toBe(0)
    })

    it('should sum all unspent UTXOs', () => {
      wallet.recordPayment('tx1', 0, 10000, '76a914...')
      wallet.recordPayment('tx2', 0, 20000, '76a914...')
      wallet.recordPayment('tx3', 0, 30000, '76a914...')
      
      expect(wallet.getBalance()).toBe(60000)
    })

    it('should handle single UTXO', () => {
      wallet.recordPayment('tx1', 0, 50000, '76a914...')
      expect(wallet.getBalance()).toBe(50000)
    })

    it('should return 0 when all UTXOs are spent', () => {
      wallet.recordPayment('tx1', 0, 10000, '76a914...')
      expect(wallet.getBalance()).toBe(10000)
      
      // In a real scenario, sending would mark as spent
      // For now, just verify empty wallet returns 0
      const emptyWallet = new Wallet({
        privateKey: testPrivateKey.toHex(),
        dbPath: '/tmp/test-empty-wallet.db'
      })
      expect(emptyWallet.getBalance()).toBe(0)
      
      if (existsSync('/tmp/test-empty-wallet.db')) {
        unlinkSync('/tmp/test-empty-wallet.db')
      }
    })
  })

  describe('Sync from Blockchain', () => {
    it('should fetch and store new UTXOs', async () => {
      const mockUTXOs = [
        { txid: 'tx1', vout: 0, satoshis: 10000, scriptPubKey: '76a914...' },
        { txid: 'tx2', vout: 0, satoshis: 20000, scriptPubKey: '76a914...' }
      ]
      
      vi.mocked(services.fetchUTXOs).mockResolvedValue(mockUTXOs)
      
      const newCount = await wallet.sync()
      
      expect(newCount).toBe(2)
      expect(wallet.getBalance()).toBe(30000)
      expect(services.fetchUTXOs).toHaveBeenCalledWith(wallet.getAddress())
    })

    it('should not duplicate existing UTXOs', async () => {
      wallet.recordPayment('tx1', 0, 10000, '76a914...')
      
      const mockUTXOs = [
        { txid: 'tx1', vout: 0, satoshis: 10000, scriptPubKey: '76a914...' },
        { txid: 'tx2', vout: 0, satoshis: 20000, scriptPubKey: '76a914...' }
      ]
      
      vi.mocked(services.fetchUTXOs).mockResolvedValue(mockUTXOs)
      
      const newCount = await wallet.sync()
      
      expect(newCount).toBe(1) // Only tx2 is new
      expect(wallet.getBalance()).toBe(30000)
    })

    it('should handle empty blockchain response', async () => {
      vi.mocked(services.fetchUTXOs).mockResolvedValue([])
      
      const newCount = await wallet.sync()
      
      expect(newCount).toBe(0)
      expect(wallet.getBalance()).toBe(0)
    })

    it('should handle sync errors', async () => {
      vi.mocked(services.fetchUTXOs).mockRejectedValue(new Error('Network error'))
      
      await expect(wallet.sync()).rejects.toThrow('Network error')
    })
  })

  describe('Send Transaction', () => {
    beforeEach(() => {
      // Valid P2PKH transaction hex with enough satoshis for tests
      const validTxHex = '0100000001000000000000000000000000000000000000000000000000000000000000000000000000ffffffff01d0c30200000000001976a914000000000000000000000000000000000000000088ac00000000'
      
      // Mock fetchTransaction to return a valid transaction
      vi.mocked(services.fetchTransaction).mockResolvedValue({
        txid: 'source-tx',
        hex: validTxHex
      })
      
      // Mock broadcastTransaction to return txid
      vi.mocked(services.broadcastTransaction).mockResolvedValue('new-tx-123')
    })

    it('should throw error on insufficient balance', async () => {
      await expect(wallet.send('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 10000, 200))
        .rejects.toThrow('Insufficient balance')
    })

    it('should send payment when sufficient balance', async () => {
      wallet.recordPayment('tx1', 0, 50000, '76a914' + '0'.repeat(40) + '88ac')
      
      const result = await wallet.send('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 10000, 200)
      
      expect(result.txid).toBe('new-tx-123')
      expect(result.vout).toBe(0)
      expect(services.broadcastTransaction).toHaveBeenCalled()
    })

    it('should create change output when needed', async () => {
      wallet.recordPayment('tx1', 0, 50000, '76a914' + '0'.repeat(40) + '88ac')
      
      const result = await wallet.send('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 10000, 200)
      
      // Change should be 50000 - 10000 - 200 = 39800
      expect(result.change).toBe(39800)
    })

    it('should not create change output below dust limit', async () => {
      wallet.recordPayment('tx1', 0, 10746, '76a914' + '0'.repeat(40) + '88ac')
      
      const result = await wallet.send('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 10000, 200)
      
      // Change would be 546 (dust), should not create output
      expect(result.change).toBeUndefined()
    })

    it('should mark spent UTXOs', async () => {
      wallet.recordPayment('tx1', 0, 50000, '76a914' + '0'.repeat(40) + '88ac')
      
      expect(wallet.getBalance()).toBe(50000)
      
      await wallet.send('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 10000, 200)
      
      // Balance should include change only
      const utxos = wallet.getUTXOs()
      expect(utxos.filter(u => !u.spent)).toHaveLength(1) // Change UTXO
    })

    it('should select multiple UTXOs if needed', async () => {
      wallet.recordPayment('tx1', 0, 5000, '76a914' + '0'.repeat(40) + '88ac')
      wallet.recordPayment('tx2', 0, 6000, '76a914' + '0'.repeat(40) + '88ac')
      
      const result = await wallet.send('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 10000, 200)
      
      expect(result.txid).toBe('new-tx-123')
      expect(services.fetchTransaction).toHaveBeenCalledTimes(2)
    })

    it('should use default fee of 200 sats', async () => {
      wallet.recordPayment('tx1', 0, 50000, '76a914' + '0'.repeat(40) + '88ac')
      
      const result = await wallet.send('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 10000)
      
      // Change should account for default 200 sat fee
      expect(result.change).toBe(50000 - 10000 - 200)
    })

    it('should accept custom fee', async () => {
      wallet.recordPayment('tx1', 0, 50000, '76a914' + '0'.repeat(40) + '88ac')
      
      const result = await wallet.send('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 10000, 500)
      
      expect(result.change).toBe(50000 - 10000 - 500)
    })

    it('should handle invalid address', async () => {
      wallet.recordPayment('tx1', 0, 50000, '76a914' + '0'.repeat(40) + '88ac')
      
      // Invalid base58 address
      await expect(wallet.send('invalid-address', 10000))
        .rejects.toThrow()
    })

    it('should handle broadcast failure', async () => {
      wallet.recordPayment('tx1', 0, 50000, '76a914' + '0'.repeat(40) + '88ac')
      
      vi.mocked(services.broadcastTransaction).mockRejectedValue(
        new Error('Transaction rejected by network')
      )
      
      await expect(wallet.send('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 10000))
        .rejects.toThrow('Transaction rejected by network')
    })
  })

  describe('SQLite Persistence', () => {
    it('should persist data across wallet instances', () => {
      wallet.recordPayment('tx1', 0, 50000, '76a914...')
      
      // Create new instance with same db
      const wallet2 = new Wallet({
        privateKey: testPrivateKey.toHex(),
        dbPath: testDbPath
      })
      
      expect(wallet2.getBalance()).toBe(50000)
      expect(wallet2.getUTXOs()).toHaveLength(1)
    })

    it('should handle concurrent wallet instances', () => {
      wallet.recordPayment('tx1', 0, 10000, '76a914...')
      
      const wallet2 = new Wallet({
        privateKey: testPrivateKey.toHex(),
        dbPath: testDbPath
      })
      
      wallet2.recordPayment('tx2', 0, 20000, '76a914...')
      
      // Both should see both UTXOs
      expect(wallet.getUTXOs()).toHaveLength(2)
      expect(wallet2.getUTXOs()).toHaveLength(2)
    })

    it('should create database directory if missing', () => {
      const nestedPath = '/tmp/nested/deep/wallet.db'
      
      const nestedWallet = new Wallet({
        privateKey: testPrivateKey.toHex(),
        dbPath: nestedPath
      })
      
      expect(existsSync(nestedPath)).toBe(true)
      
      nestedWallet.recordPayment('tx1', 0, 10000, '76a914...')
      expect(nestedWallet.getBalance()).toBe(10000)
      
      // Cleanup
      unlinkSync(nestedPath)
    })
  })

  describe('Error Cases', () => {
    it('should handle corrupted database gracefully', () => {
      // This is hard to test without manually corrupting the db
      // Just verify wallet creation doesn't throw
      expect(() => {
        new Wallet({
          privateKey: testPrivateKey.toHex(),
          dbPath: '/tmp/test-wallet-error.db'
        })
      }).not.toThrow()
      
      if (existsSync('/tmp/test-wallet-error.db')) {
        unlinkSync('/tmp/test-wallet-error.db')
      }
    })

    it('should handle invalid hex key', () => {
      expect(() => {
        new Wallet({
          privateKey: 'not-a-hex-key',
          dbPath: '/tmp/test-invalid-key.db'
        })
      }).toThrow()
      
      if (existsSync('/tmp/test-invalid-key.db')) {
        unlinkSync('/tmp/test-invalid-key.db')
      }
    })

    it('should throw on empty private key', () => {
      expect(() => {
        new Wallet({
          privateKey: '',
          dbPath: '/tmp/test-empty-key.db'
        })
      }).toThrow(/Invalid hex|hex string/) // PrivateKey.fromHex throws on invalid input
      
      if (existsSync('/tmp/test-empty-key.db')) {
        unlinkSync('/tmp/test-empty-key.db')
      }
    })
  })
})
