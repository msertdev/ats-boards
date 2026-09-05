import assert from 'node:assert/strict'
import test from 'node:test'
import { readJobBoard, type Provider } from '../src/index.ts'

const originalFetch = globalThis.fetch

function json(body: unknown): Response {
  return Response.json(body)
}

function fixtureFetch(input: string | URL | Request): Promise<Response> {
  const url = String(input)

  if (url.endsWith('.jobs.personio.de/xml')) {
    return Promise.resolve(
      new Response(`
        <workzag-jobs><position><id>42</id><name>Engineer</name>
        <office>Berlin</office><schedule>full-time</schedule>
        <createdAt>2026-09-05</createdAt><jobDescriptions>Build things</jobDescriptions>
        </position></workzag-jobs>
      `),
    )
  }
  if (url.includes('boards-api.greenhouse.io')) {
    return Promise.resolve(json({ jobs: [{ id: 42, title: 'Engineer', location: { name: 'Berlin, Germany' } }] }))
  }
  if (url.includes('api.lever.co')) {
    return Promise.resolve(
      json([{ id: '42', text: 'Engineer', country: 'DE', categories: { location: 'Berlin', commitment: 'Full-time' } }]),
    )
  }
  if (url.includes('api.ashbyhq.com')) {
    return Promise.resolve(json({ jobs: [{ id: '42', title: 'Engineer', location: 'Berlin, Germany', isListed: true }] }))
  }
  if (url.includes('api.smartrecruiters.com')) {
    return Promise.resolve(
      json({
        totalFound: 1,
        content: [{ id: '42', name: 'Engineer', location: { city: 'Berlin', country: 'de' } }],
      }),
    )
  }
  if (url.endsWith('.recruitee.com/api/offers/')) {
    return Promise.resolve(
      json({ offers: [{ id: 42, title: 'Engineer', status: 'published', locations: [{ country_code: 'DE', city: 'Berlin' }] }] }),
    )
  }
  if (url.endsWith('.teamtailor.com/jobs.json')) {
    return Promise.resolve(
      json({
        title: 'Acme GmbH',
        items: [{
          id: '42',
          title: 'Engineer',
          _jobposting: {
            identifier: { value: 42 },
            jobLocation: [{ address: { addressCountry: 'DE', addressLocality: 'Berlin' } }],
          },
        }],
      }),
    )
  }
  if (url === 'https://join.com/companies/acme') {
    return Promise.resolve(new Response('<script>{"company":{"id":123}}</script>'))
  }
  if (url.includes('join.com/api/public/companies/123/jobs')) {
    return Promise.resolve(
      json({
        items: [{ id: 42, idParam: 'engineer-42', title: 'Engineer', country: { iso3166: 'DE' }, city: { cityName: 'Berlin' } }],
        pagination: { pageCount: 1 },
      }),
    )
  }
  if (url.includes('apply.workable.com/api/v1/widget/accounts')) {
    return Promise.resolve(
      json({
        name: 'Acme GmbH',
        jobs: [{ title: 'Engineer', shortcode: '42', locations: [{ countryCode: 'DE', city: 'Berlin' }] }],
      }),
    )
  }
  if (url.endsWith('.softgarden.io/de/vacancies')) {
    return Promise.resolve(new Response('<main>softgarden <a href="../job/42/engineer">Engineer</a></main>'))
  }
  if (url.includes('.softgarden.io/job/42')) {
    return Promise.resolve(
      new Response(`<script type="application/ld+json">${JSON.stringify({
        '@type': 'JobPosting',
        title: 'Engineer',
        jobLocation: { address: { addressCountry: 'DE', addressLocality: 'Berlin' } },
      })}</script>`),
    )
  }
  if (url.includes('myworkdayjobs.com/wday/cxs/acme/Careers/jobs')) {
    return Promise.resolve(json({ total: 1, jobPostings: [{ title: 'Engineer', externalPath: '/job/REQ-42', locationsText: 'Berlin, Germany' }] }))
  }
  if (url.includes('myworkdayjobs.com/wday/cxs/acme/Careers/job/REQ-42')) {
    return Promise.resolve(json({ jobPostingInfo: { jobDescription: '<p>Build things</p>', timeType: 'Full time' } }))
  }
  if (url.includes('recruitingCEJobRequisitionDetails')) {
    return Promise.resolve(json({ items: [{ ExternalDescriptionStr: '<p>Build things</p>' }] }))
  }
  if (url.includes('recruitingCEJobRequisitions')) {
    return Promise.resolve(
      json({ items: [{ requisitionList: [{ Id: '42', Title: 'Engineer', PrimaryLocationCountry: 'DE', PrimaryLocation: 'Berlin' }] }] }),
    )
  }

  return Promise.reject(new Error(`missing fixture for ${url}`))
}

test('every provider reader normalises a representative German posting', async (t) => {
  globalThis.fetch = fixtureFetch as typeof fetch
  const cases: [Provider, string][] = [
    ['personio', 'acme'],
    ['greenhouse', 'acme'],
    ['lever', 'acme'],
    ['ashby', 'acme'],
    ['smartrecruiters', 'Acme'],
    ['recruitee', 'acme'],
    ['teamtailor', 'acme'],
    ['join', 'acme'],
    ['workable', 'acme'],
    ['softgarden', 'acme'],
    ['workday', 'acme.wd3/Careers'],
    ['oracle', 'fa-acme.fa.ocs/CX_1'],
  ]

  try {
    for (const [provider, code] of cases) {
      await t.test(provider, async () => {
        const result = await readJobBoard(provider, code)
        assert.equal(result.ok, true, JSON.stringify(result))
        if (!result.ok) return
        assert.equal(result.postings.length, 1)
        assert.equal(result.postings[0]!.provider, provider)
        assert.equal(result.postings[0]!.title, 'Engineer')
        assert.equal(result.postings[0]!.locations[0]!.country, 'de')
      })
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})
