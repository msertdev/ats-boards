// node examples/career-page.mjs https://www.scalable.capital/en/careers
import { discoverBoards, readBoard } from 'ats-boards'

const url = process.argv[2] ?? 'https://www.scalable.capital/en/careers'
const html = await (await fetch(url)).text()

for (const board of discoverBoards(html)) {
  const result = await readBoard(board.saglayici, board.kod, {})
  if (result.durum !== 'tamam') { console.error(board, result.sebep); continue }
  for (const p of result.ilanlar) {
    console.log(`${p.baslik} — ${p.konumlar.map((k) => k.sehir).join(', ')} — ${p.ilanUrl}`)
  }
}
