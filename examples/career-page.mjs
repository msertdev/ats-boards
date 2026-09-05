// node examples/career-page.mjs https://www.scalable.capital/en/careers
import { discoverJobBoards, readJobBoard } from 'ats-boards'

const url = process.argv[2] ?? 'https://www.scalable.capital/en/careers'
const html = await (await fetch(url)).text()

for (const board of discoverJobBoards(html)) {
  const result = await readJobBoard(board.provider, board.code)
  if (!result.ok) { console.error(board, result.reason); continue }
  for (const p of result.postings) {
    console.log(`${p.title} — ${p.locations.map((location) => location.city).join(', ')} — ${p.url}`)
  }
}
