import assert from 'node:assert/strict'
import test from 'node:test'
import {
  discoverJobBoards,
  readJobBoard,
  toJobPosting,
  type Posting,
} from '../src/index.ts'

test('discoverJobBoards exposes English field names', () => {
  const boards = discoverJobBoards(
    '<a href="https://boards.greenhouse.io/acme">Open roles</a>',
  )

  assert.deepEqual(boards, [
    {
      provider: 'greenhouse',
      code: 'acme',
      url: 'https://boards.greenhouse.io/acme',
    },
  ])
  assert.equal('saglayici' in boards[0]!, false)
  assert.equal('kod' in boards[0]!, false)
})

test('toJobPosting maps the full legacy shape without losing fields', () => {
  const legacy: Posting = {
    kaynak: 'personio',
    kaynakKimligi: 'acme:42',
    baslik: 'Platform Engineer',
    isveren: 'Acme GmbH',
    sirketAlanAdi: 'acme.example',
    konumlar: [
      {
        sehir: 'Berlin',
        posta_kodu: '10115',
        ulke: 'de',
        enlem: 52.52,
        boylam: 13.405,
      },
    ],
    meslekAdi: 'Softwareentwickler',
    metin: 'Build reliable systems.',
    calismaSuresi: 'tam_zamanli',
    yayinTarihi: '2026-09-05',
    ilanUrl: 'https://example.com/jobs/42',
    yillikBrutEur: 80_000,
  }

  assert.deepEqual(toJobPosting(legacy), {
    provider: 'personio',
    providerPostingId: 'acme:42',
    title: 'Platform Engineer',
    employer: 'Acme GmbH',
    companyDomain: 'acme.example',
    locations: [
      {
        city: 'Berlin',
        postalCode: '10115',
        country: 'de',
        latitude: 52.52,
        longitude: 13.405,
      },
    ],
    occupation: 'Softwareentwickler',
    description: 'Build reliable systems.',
    employmentType: 'full_time',
    publishedDate: '2026-09-05',
    url: 'https://example.com/jobs/42',
    annualGrossEur: 80_000,
  })
})

test('readJobBoard maps validation failures to the English error contract', async () => {
  const result = await readJobBoard('greenhouse', 'x')

  assert.deepEqual(result, {
    ok: false,
    reason: 'format',
    message: 'greenhouse: geçersiz kod "x"',
  })
})
