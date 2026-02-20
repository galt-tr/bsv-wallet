/**
 * bsv-wallet — Simple BSV wallet for OpenClaw agents
 */

export { Wallet } from './wallet.js'
export type { WalletConfig, TrackedUTXO } from './wallet.js'
export { fetchUTXOs, fetchTransaction, broadcastTransaction } from './services.js'
export type { UTXO, TxInfo } from './services.js'
