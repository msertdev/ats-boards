// node examples/to-csv.mjs greenhouse celonis > celonis.csv
import { readJobBoard } from 'ats-boards'

const [provider, code] = process.argv.slice(2)
const result = await readJobBoard(provider, code)
if (!result.ok) { console.error(result.reason, result.message ?? ''); process.exit(1) }

const q = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
console.log(['title', 'city', 'employment', 'published', 'url'].join(','))
for (const p of result.postings) {
  console.log([p.title, p.locations.map((location) => location.city).join(' / '), p.employmentType, p.publishedDate, p.url].map(q).join(','))
}
