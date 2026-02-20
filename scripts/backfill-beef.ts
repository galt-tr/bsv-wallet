import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'

async function main() {
  const db = new Database(join(homedir(), '.bsv-wallet', 'wallet.db'))
  
  // Add beef column if not exists
  try {
    db.prepare('ALTER TABLE transactions ADD COLUMN beef TEXT').run()
    console.log('Added beef column')
  } catch {
    // Already exists
  }
  
  // Fetch BEEF for all transactions that don't have it
  const txs = db.prepare("SELECT txid FROM transactions WHERE beef IS NULL").all() as { txid: string }[]
  console.log(`${txs.length} txs need BEEF`)
  
  let fetched = 0, failed = 0
  for (const { txid } of txs) {
    try {
      const r = await fetch(`https://api.whatsonchain.com/v1/bsv/main/tx/${txid}/beef`)
      if (r.ok) {
        const beefHex = await r.text()
        if (beefHex.startsWith('0100beef') || beefHex.startsWith('0200beef')) {
          db.prepare('UPDATE transactions SET beef = ? WHERE txid = ?').run(beefHex.trim(), txid)
          fetched++
          if (fetched % 10 === 0) console.log(`  Fetched ${fetched}...`)
        } else {
          console.log(`  ${txid.substring(0,16)}... unexpected response: ${beefHex.substring(0,40)}`)
          failed++
        }
      } else {
        console.log(`  ${txid.substring(0,16)}... ${r.status} (probably unconfirmed)`)
        failed++
      }
      await new Promise(r => setTimeout(r, 200)) // Rate limit
    } catch (err: any) {
      console.log(`  ${txid.substring(0,16)}... error: ${err.message}`)
      failed++
    }
  }
  
  console.log(`\nFetched ${fetched}, failed ${failed}`)
  
  // Summary
  const stats = db.prepare("SELECT COUNT(*) as total, COUNT(beef) as with_beef FROM transactions").get() as any
  console.log(`Total: ${stats.total}, with BEEF: ${stats.with_beef}`)
}

main().catch(console.error)
