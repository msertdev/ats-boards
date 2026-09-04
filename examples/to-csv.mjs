// node examples/to-csv.mjs greenhouse celonis > celonis.csv
import { readBoard } from 'ats-boards'

const [provider, code] = process.argv.slice(2)
const result = await readBoard(provider, code, {})
if (result.durum !== 'tamam') { console.error(result.sebep, result.mesaj ?? ''); process.exit(1) }

const q = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
console.log(['title', 'city', 'employment', 'published', 'url'].join(','))
for (const p of result.ilanlar) {
  console.log([p.baslik, p.konumlar.map((k) => k.sehir).join(' / '), p.calismaSuresi, p.yayinTarihi, p.ilanUrl].map(q).join(','))
}
