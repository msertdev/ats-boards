# ats-boards

[![CI](https://github.com/msertdev/ats-boards/actions/workflows/ci.yml/badge.svg)](https://github.com/msertdev/ats-boards/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/ats-boards)](https://www.npmjs.com/package/ats-boards) [![downloads](https://img.shields.io/npm/dm/ats-boards)](https://www.npmjs.com/package/ats-boards) [![license](https://img.shields.io/npm/l/ats-boards)](LICENSE) ![node](https://img.shields.io/node/v/ats-boards)

![ats-boards — discover and read the public ATS job boards of German employers](docs/preview.png)

Discover and read the **public job boards** of the applicant-tracking systems German employers use — without scraping job portals.

Most companies do not host their own job list. The career page embeds a board on Personio, SmartRecruiters, Greenhouse, Workday, Oracle, softgarden … and those boards expose public, keyless endpoints. This package finds the board link in a career page and reads the postings from it, in one common shape.

| Provider | Discovery pattern | Read from | Verified against |
|---|---|---|---|
| Personio | `{code}.jobs.personio.de`, `jobs.personio.de/{code}` | `/xml` feed | clark |
| SmartRecruiters | `careers.smartrecruiters.com/{Code}` | posting API | BoschGroup (790 DE postings) |
| Greenhouse | `boards.greenhouse.io/{code}`, embed `?for=` | boards API | celonis |
| Lever | `jobs.lever.co/{code}` | postings API | kolibrigames |
| Ashby | `jobs.ashbyhq.com/{code}` | posting API | statista, parloa |
| Recruitee | `{code}.recruitee.com` | offers API | everdrop |
| Teamtailor | `{code}.teamtailor.com` | JSON feed | — |
| JOIN | `join.com/companies/{code}` | public JSON | — |
| Workable | `apply.workable.com/{code}` | widget API | — |
| Workday | `{tenant}.wd{N}.myworkdayjobs.com/{Site}` | CXS JSON (Germany facet) | db.wd3/DBWebsite (257) |
| Oracle Recruiting | `{host}.fa.{region}.oraclecloud.com/…/sites/CX_…` | `recruitingCEJobRequisitions` | Sana Kliniken (1,117) |
| softgarden | `{code}.softgarden.io` | JobPosting JSON-LD on posting pages | visiolife-group |

Only Germany-located postings are returned; the location filter is intentionally conservative (see `germany.ts`).

## Install

```bash
npm i ats-boards
```

Node 22+. No runtime dependencies.

## Try it without writing code

```bash
npx ats-boards https://www.scalable.capital/en/careers
# Found 1 board(s): smartrecruiters/ScalableGmbH
# smartrecruiters/ScalableGmbH: 94 posting(s) in Germany
# (Associate) Product Manager (m/f/x)   Berlin   2026-09-03  https://jobs.smartrecruiters.com/ScalableGmbH/744000147296099
# ...

npx ats-boards greenhouse celonis          # read one board directly
npx ats-boards workday db.wd3/DBWebsite --json > db.json
```

Discovery works on server-rendered career pages that link to the board. If a page loads its jobs with JavaScript, pass the provider and board code directly.

## Use

The recommended API uses English field names. The original API remains
available unchanged for existing users.

```ts
import { discoverJobBoards, readJobBoard, setUserAgent } from 'ats-boards'

// Identify yourself to the sites you read.
setUserAgent('Mozilla/5.0 (compatible; MyCrawler/1.0; +https://example.com/bot)')

// 1. Find boards in a career page you already fetched.
const html = await (await fetch('https://www.example-gmbh.de/karriere')).text()
const boards = discoverJobBoards(html)
// → [{ provider: 'personio', code: 'example-gmbh', url: 'https://example-gmbh.jobs.personio.de/' }]

// 2. Read the postings.
for (const b of boards) {
  const result = await readJobBoard(b.provider, b.code, {
    employer: 'Example GmbH',
    companyDomain: 'example-gmbh.de',
  })
  if (result.ok) {
    for (const p of result.postings) console.log(p.title, p.locations[0]?.city, p.url)
  } else {
    console.warn(result.reason, result.message)
    // 'access' | 'permission' | 'rate_limit' | 'format'
  }
}
```

`readJobBoard` returns `{ ok: true, postings: [] }` for a board that no
longer exists (HTTP 404) — that means “no postings”, not a transport error.
Rate limits return `{ ok: false, reason: 'rate_limit' }`.

### Posting shape

```ts
type JobPosting = {
  provider: string
  providerPostingId: string // "{boardCode}:{jobId}", stable per provider
  title: string
  employer?: string
  companyDomain?: string
  locations: { city?: string; postalCode?: string; country: string }[]
  occupation?: string
  description?: string      // HTML stripped when the provider supplies it
  employmentType: 'full_time' | 'part_time' | 'shift' | 'unknown'
  publishedDate?: string    // YYYY-MM-DD
  url?: string
  annualGrossEur?: number
}
```

### Existing API

`discoverBoards` and `readBoard` keep their original Turkish result fields for
backward compatibility. New integrations should prefer `discoverJobBoards`
and `readJobBoard`; `toJobPosting` converts an existing `Posting` value without
another network request.

## Notes on behaviour

- Every request has a 15 s timeout and a descriptive user agent.
- List endpoints are paged up to 10 pages (20 for Workday). Workday and Oracle need one extra request per posting for the full text; those are read in a rotating window of 40 per call so a large board is covered over a day rather than in one burst.
- Only what the provider returns is used. Nothing is inferred; if a board does not give a description, that field stays empty.
- These are the same endpoints the providers' own career pages call. Check each provider's terms for your use case; this package does not bypass any authentication.

## Examples

- [`examples/career-page.mjs`](examples/career-page.mjs) — career page URL in, postings out
- [`examples/to-csv.mjs`](examples/to-csv.mjs) — one board to CSV
- [`examples/many-employers.mjs`](examples/many-employers.mjs) — several boards, keep postings with full text

## Development

```bash
npm test            # offline discovery, contract and date tests
npm run build       # TypeScript → dist/
npm run check       # build + complete test suite
```

Adding a provider: a discovery rule in `src/discover.ts`, a reader in `src/readers.ts` (verify it against a real employer and note which one), and a test line in `tests/discover.test.ts`.

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
provider checklist and [SECURITY.md](SECURITY.md) for private vulnerability
reporting.

## Why this exists

Built for [Kelyvaro](https://kelyvaro.com), a tool that helps job seekers from Turkey apply to German employers directly. The matching and application parts stay in the product; the board readers are generic and useful to anyone collecting German job postings, so they live here.

MIT © Murat Sert
