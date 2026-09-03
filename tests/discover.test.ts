import { test } from 'node:test'
import assert from 'node:assert/strict'
import { discoverBoards as panolariBul } from '../src/index.ts'

// Alman işverenlerin kariyer sayfalarında görülen bağlantı biçimleri (3 Eylül 2026).
const ORNEKLER: [string, { saglayici: string; kod: string }][] = [
  ['<a href="https://acme-gmbh.jobs.personio.de/">Stellen</a>', { saglayici: 'personio', kod: 'acme-gmbh' }],
  ['<a href="https://acme.jobs.personio.com/job/123">Job</a>', { saglayici: 'personio', kod: 'acme' }],
  ['<a href="https://jobs.personio.de/acme-neu?language=de">Neu</a>', { saglayici: 'personio', kod: 'acme-neu' }],
  ['<a href="https://join.com/companies/acme-gmbh">JOIN</a>', { saglayici: 'join', kod: 'acme-gmbh' }],
  ['<a href="https://acme.softgarden.io/de/vacancies">Jobs</a>', { saglayici: 'softgarden', kod: 'acme' }],
  ['<a href="https://careers.smartrecruiters.com/AcmeGmbH">SR</a>', { saglayici: 'smartrecruiters', kod: 'AcmeGmbH' }],
  ['<a href="https://jobs.smartrecruiters.com/AcmeGmbH/123">SR</a>', { saglayici: 'smartrecruiters', kod: 'AcmeGmbH' }],
  ['<a href="https://acme.recruitee.com/o/entwickler">R</a>', { saglayici: 'recruitee', kod: 'acme' }],
  ['<a href="https://acme.teamtailor.com/jobs">TT</a>', { saglayici: 'teamtailor', kod: 'acme' }],
  ['<a href="https://boards.greenhouse.io/acme">GH</a>', { saglayici: 'greenhouse', kod: 'acme' }],
  ['<a href="https://job-boards.greenhouse.io/acme/jobs/1">GH</a>', { saglayici: 'greenhouse', kod: 'acme' }],
  ['<script src="https://boards.greenhouse.io/embed/job_board/js?for=acme"></script>', { saglayici: 'greenhouse', kod: 'acme' }],
  ['<a href="https://jobs.lever.co/acme">Lever</a>', { saglayici: 'lever', kod: 'acme' }],
  ['<a href="https://jobs.ashbyhq.com/acme">Ashby</a>', { saglayici: 'ashby', kod: 'acme' }],
  ['<a href="https://apply.workable.com/acme/">Workable</a>', { saglayici: 'workable', kod: 'acme' }],
  ['<a href="https://acme.wd3.myworkdayjobs.com/de-DE/AcmeCareers">WD</a>', { saglayici: 'workday', kod: 'acme.wd3/AcmeCareers' }],
  ['<a href="https://acme.wd1.myworkdayjobs.com/Careers/job/Berlin/Dev_R1">WD</a>', { saglayici: 'workday', kod: 'acme.wd1/Careers' }],
  ['<a href="https://fa-abcd-saasfaeuraprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/de/sites/CX_4025/job/4210">OR</a>', { saglayici: 'oracle', kod: 'fa-abcd-saasfaeuraprod1.fa.ocs/CX_4025' }],
]

test('her sağlayıcı için tek örnek bağlantıdan pano çıkar', () => {
  for (const [html, beklenen] of ORNEKLER) {
    const panolar = panolariBul(html)
    assert.equal(panolar.length, 1, html)
    assert.equal(panolar[0]!.saglayici, beklenen.saglayici, html)
    assert.equal(panolar[0]!.kod, beklenen.kod, html)
    assert.ok(panolar[0]!.url.startsWith('https://'), html)
  }
})

test('Workday dil parçası ve site dışı yollar pano sayılmaz', () => {
  assert.equal(panolariBul('<a href="https://acme.wd3.myworkdayjobs.com/de-DE">x</a>').length, 0)
  assert.equal(panolariBul('<a href="https://fa-x.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/de/">x</a>').length, 0)
})

test('aynı pano menüde ve altbilgide geçse bir kez döner, ilk URL saklanır', () => {
  const html = `
    <a href="https://Acme.jobs.personio.de/">Karriere</a>
    <a href="https://acme.jobs.personio.de/job/42">Entwickler</a>
    <a href="https://careers.smartrecruiters.com/AcmeGmbH">SR</a>
    <a href="https://jobs.smartrecruiters.com/acmegmbh/1">SR</a>
  `
  const panolar = panolariBul(html)
  assert.equal(panolar.length, 2)
  assert.deepEqual(panolar[0], { saglayici: 'personio', kod: 'acme', url: 'https://acme.jobs.personio.de/' })
  assert.equal(panolar[1]!.kod, 'AcmeGmbH')
})

test('jenerik ve tek karakterli kodlar elenir; ilgisiz alanlar yakalanmaz', () => {
  const html = `
    <a href="https://www.personio.de/">Personio</a>
    <a href="https://jobs.personio.de/">Personio Jobs</a>
    <a href="https://www.join.com/">JOIN</a>
    <a href="https://join.com/companies/">liste</a>
    <a href="https://app.softgarden.io/login">Login</a>
    <a href="https://boards.greenhouse.io/embed/job_board">gömülü</a>
    <a href="https://x.recruitee.com/">tek harf</a>
    <a href="https://www.acme.de/karriere">bizim site</a>
    <a href="https://help.teamtailor.com/">yardım</a>
  `
  assert.deepEqual(panolariBul(html), [])
})

test('şema düşürülmüş ve HTML kaçışlı bağlantılar çözülür', () => {
  const html = `
    <script src="//acme.jobs.personio.de/widget.js"></script>
    <iframe src="https://boards.greenhouse.io/embed/job_board?for=beta&amp;b=1"></iframe>
  `
  const panolar = panolariBul(html)
  assert.deepEqual(
    panolar.map((p) => `${p.saglayici}:${p.kod}`),
    ['personio:acme', 'greenhouse:beta'],
  )
})
