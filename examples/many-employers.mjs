// Read several boards in sequence and keep only postings with full text.
// node examples/many-employers.mjs
import { readJobBoard } from 'ats-boards'

const boards = [
  ['greenhouse', 'celonis'],
  ['ashby', 'parloa'],
  ['smartrecruiters', 'BoschGroup'],
  ['workday', 'db.wd3/DBWebsite'],
]

for (const [provider, code] of boards) {
  const result = await readJobBoard(provider, code)
  if (!result.ok) { console.error(provider, code, result.reason); continue }
  const withText = result.postings.filter((posting) => posting.description && posting.description.length > 200)
  console.log(`${provider}/${code}: ${result.postings.length} postings, ${withText.length} with full text`)
}
