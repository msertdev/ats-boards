// Read several boards in sequence and keep only postings with full text.
// node examples/many-employers.mjs
import { readBoard } from 'ats-boards'

const boards = [
  ['greenhouse', 'celonis'],
  ['ashby', 'parloa'],
  ['smartrecruiters', 'BoschGroup'],
  ['workday', 'db.wd3/DBWebsite'],
]

for (const [provider, code] of boards) {
  const r = await readBoard(provider, code, {})
  if (r.durum !== 'tamam') { console.error(provider, code, r.sebep); continue }
  const withText = r.ilanlar.filter((p) => p.metin && p.metin.length > 200)
  console.log(`${provider}/${code}: ${r.ilanlar.length} postings, ${withText.length} with full text`)
}
