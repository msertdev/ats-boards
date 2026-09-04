#!/usr/bin/env node
/**
 * Command line:
 *
 *   ats-boards <career-page-url>            discover boards in a page, read them
 *   ats-boards <provider> <board-code>      read one board directly
 *   ats-boards ... --json                   print postings as JSON instead of a table
 */
import { discoverBoards, readBoard, setUserAgent } from './index.ts'
import type { Posting, Provider } from './types.ts'

const PROVIDERS: Provider[] = [
  'personio', 'join', 'softgarden', 'smartrecruiters', 'recruitee', 'teamtailor',
  'greenhouse', 'lever', 'ashby', 'workable', 'workday', 'oracle',
]

const args = process.argv.slice(2)
const json = args.includes('--json')
const positional = args.filter((a) => !a.startsWith('--'))

if (positional.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`Usage:
  ats-boards <career-page-url> [--json]
  ats-boards <provider> <board-code> [--json]

Providers: ${PROVIDERS.join(', ')}

Examples:
  ats-boards https://www.scalable.capital/en/careers
  ats-boards greenhouse celonis
  ats-boards workday db.wd3/DBWebsite --json`)
  process.exit(positional.length === 0 ? 1 : 0)
}

setUserAgent('Mozilla/5.0 (compatible; ats-boards-cli/0.2; +https://github.com/msertdev/ats-boards)')

type Target = { provider: Provider; code: string }

async function targets(): Promise<Target[]> {
  const first = positional[0] ?? ''
  const second = positional[1]
  if (PROVIDERS.includes(first as Provider)) {
    if (!second) fail(`Board code missing. Example: ats-boards ${first} <code>`)
    return [{ provider: first as Provider, code: second }]
  }
  let url: URL
  try {
    url = new URL(first.startsWith('http') ? first : `https://${first}`)
  } catch {
    return fail(`Not a URL and not a provider name: ${first}`)
  }
  let html: string
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; ats-boards-cli/0.2)' }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) fail(`${url.href} returned HTTP ${res.status}`)
    html = await res.text()
  } catch (e) {
    return fail(`Could not fetch ${url.href}: ${e instanceof Error ? e.message : String(e)}`)
  }
  const found = discoverBoards(html)
  if (found.length === 0) fail(`No ATS board found in ${url.href}. The page may load its jobs with JavaScript, or the employer hosts its own list.`)
  if (!json) console.error(`Found ${found.length} board(s): ${found.map((b) => `${b.saglayici}/${b.kod}`).join(', ')}`)
  return found.map((b) => ({ provider: b.saglayici, code: b.kod }))
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function table(rows: Posting[]): string {
  const cells = rows.map((p) => [
    p.baslik.length > 58 ? `${p.baslik.slice(0, 57)}…` : p.baslik,
    p.konumlar.map((k) => k.sehir).filter(Boolean).join(', ') || '—',
    p.yayinTarihi ?? '',
    p.ilanUrl ?? '',
  ])
  const widths = [0, 1, 2].map((i) => Math.max(...cells.map((c) => (c[i]?.length ?? 0)), 5))
  return cells.map((c) => c.map((v, i) => (i < 3 ? v.padEnd(widths[i] ?? 0) : v)).join('  ')).join('\n')
}

const all: Posting[] = []
for (const t of await targets()) {
  const result = await readBoard(t.provider, t.code, {})
  if (result.durum !== 'tamam') {
    console.error(`${t.provider}/${t.code}: ${result.sebep}${result.mesaj ? ` — ${result.mesaj}` : ''}`)
    continue
  }
  if (!json) console.error(`${t.provider}/${t.code}: ${result.ilanlar.length} posting(s) in Germany`)
  all.push(...result.ilanlar)
}

if (json) console.log(JSON.stringify(all, null, 2))
else if (all.length > 0) console.log(table(all))
