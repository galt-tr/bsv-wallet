/**
 * bsv-wallet — Simple BSV wallet for OpenClaw agents
 */

export { Wallet } from './wallet.js'
export type { WalletConfig, TrackedUTXO } from './wallet.js'
export { fetchUTXOs, fetchTransaction, broadcastTransaction, getRawTx, broadcastBeef, fetchMerkleProof } from './services.js'
export type { UTXO, TxInfo, MerkleProof } from './services.js'
export { FallbackChainTracker, createDefaultChainTracker } from './chain-tracker.js'
