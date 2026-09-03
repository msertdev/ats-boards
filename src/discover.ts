import type { Provider as AtsPanoSaglayici } from './types.ts'

/*
  Discovers applicant-tracking-system (ATS) board links inside a company's
  career page HTML. Pure module: no network, no environment.

  Why: most German employers do not host their own job list — the career
  page embeds or links to a board on Personio, JOIN, softgarden, Greenhouse,
  Workday, Oracle and so on, and those boards expose public endpoints. Once
  the board is known, its postings can be read directly (see readers.ts).

  Code = the identifier on the provider (sub-domain or first path segment).
  De-duplication is case-insensitive; the original case is kept for
  SmartRecruiters, Workday and Oracle because their APIs are case-sensitive.
*/

export type BulunanPano = { saglayici: AtsPanoSaglayici; kod: string; url: string }

/**
 * Sağlayıcıların kendi alt alanları ve sayfa içi araç yolları. Bunlar "şirket
 * kodu" değil: `www.personio.de` bir pano değil, `boards.greenhouse.io/embed`
 * bir şirket değil.
 */
const JENERIK_KODLAR = new Set([
  'www', 'jobs', 'job', 'app', 'apps', 'careers', 'career', 'karriere', 'api', 'cdn',
  'static', 'assets', 'images', 'img', 'help', 'support', 'docs', 'blog', 'login',
  'embed', 'widget', 'widgets', 'share', 'go', 'my', 'mail', 'email', 'link', 'links',
  'company', 'companies', 'demo', 'test', 'staging', 'dev', 'de', 'en', 'eu', 'us',
])

/** Kod olarak kabul edilen biçim: harf/rakam/tire, en az 2 karakter. */
const KOD_KALIBI = /^[a-z0-9][a-z0-9-]{1,62}$/i

/**
 * Tek bir kalıp, on sağlayıcının alan adı: HTML'de bunlardan birini içeren
 * her URL yakalanır, ayrıştırma sonra `URL` ile yapılır. `//` ile başlayan
 * (şema düşürülmüş) bağlantılar da yakalanıyor — Personio'nun gömülü
 * widget'ı bu biçimi kullanıyor.
 */
const URL_KALIBI =
  /(?:https?:)?\/\/[a-z0-9.-]*(?:personio\.(?:de|com)|join\.com|softgarden\.io|smartrecruiters\.com|recruitee\.com|teamtailor\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|myworkdayjobs\.com|oraclecloud\.com)(?:[/?#][^\s"'<>()\\]*)?/gi

/** Workday ve Oracle kodları iki parçalı (`{alan}/{site}`); kalıp panolar.ts ile aynı. */
const KOD_KALIBI_IKI_PARCALI = /^[a-z0-9-]{2,40}\.[a-z0-9.]{2,12}\/[A-Za-z0-9_-]{2,64}$/

function kodGecerliMi(saglayici: AtsPanoSaglayici, kod: string): boolean {
  if (saglayici === 'workday' || saglayici === 'oracle') return KOD_KALIBI_IKI_PARCALI.test(kod)
  return KOD_KALIBI.test(kod) && !JENERIK_KODLAR.has(kod.toLowerCase())
}

/** `a.b.c.tld` → ilk etiket, ama yalnızca tam olarak `{kod}.{sabit}` biçimindeyse. */
function altAlanKodu(host: string, sabit: string): string | null {
  if (!host.endsWith(`.${sabit}`)) return null
  const on = host.slice(0, -sabit.length - 1)
  // İç içe alt alan ("x.y.softgarden.io") pano değil, araç ucu.
  if (on.includes('.')) return null
  return on
}

/** Yolun ilk parçası (boş değilse). */
function ilkYolParcasi(url: URL): string | null {
  const parca = url.pathname.split('/').find((p) => p.length > 0)
  return parca ? decodeURIComponent(parca) : null
}

function panoyuCoz(url: URL): { saglayici: AtsPanoSaglayici; kod: string } | null {
  const host = url.hostname.toLowerCase()

  // Personio: `{slug}.jobs.personio.de` (eski) ve `jobs.personio.de/{slug}` (yeni).
  for (const sabit of ['jobs.personio.de', 'jobs.personio.com']) {
    if (host === sabit) {
      const kod = ilkYolParcasi(url)
      return kod ? { saglayici: 'personio', kod } : null
    }
    const kod = altAlanKodu(host, sabit)
    if (kod) return { saglayici: 'personio', kod }
  }

  if (host === 'join.com' || host === 'www.join.com') {
    const parcalar = url.pathname.split('/').filter((p) => p.length > 0)
    if (parcalar[0] !== 'companies' || !parcalar[1]) return null
    return { saglayici: 'join', kod: decodeURIComponent(parcalar[1]) }
  }

  {
    const kod = altAlanKodu(host, 'softgarden.io')
    if (kod) return { saglayici: 'softgarden', kod }
  }

  if (host === 'careers.smartrecruiters.com' || host === 'jobs.smartrecruiters.com') {
    const kod = ilkYolParcasi(url)
    return kod ? { saglayici: 'smartrecruiters', kod } : null
  }

  {
    const kod = altAlanKodu(host, 'recruitee.com')
    if (kod) return { saglayici: 'recruitee', kod }
  }

  {
    const kod = altAlanKodu(host, 'teamtailor.com')
    if (kod) return { saglayici: 'teamtailor', kod }
  }

  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    const ilk = ilkYolParcasi(url)
    /* Gömülü pano: `boards.greenhouse.io/embed/job_board?for={slug}` — kod
       yolda değil sorguda. */
    if (ilk === 'embed') {
      const kod = url.searchParams.get('for')
      return kod ? { saglayici: 'greenhouse', kod } : null
    }
    return ilk ? { saglayici: 'greenhouse', kod: ilk } : null
  }

  if (host === 'jobs.lever.co') {
    const kod = ilkYolParcasi(url)
    return kod ? { saglayici: 'lever', kod } : null
  }

  if (host === 'jobs.ashbyhq.com') {
    const kod = ilkYolParcasi(url)
    return kod ? { saglayici: 'ashby', kod } : null
  }

  if (host === 'apply.workable.com') {
    const kod = ilkYolParcasi(url)
    return kod ? { saglayici: 'workable', kod } : null
  }

  /* Workday: `{kiracı}.wd{N}.myworkdayjobs.com/{dil?}/{site}` — dil parçası
     ("de-DE", "en-US") atlanır; site adı harf duyarlı (DBWebsite). */
  {
    const m = host.match(/^([a-z0-9-]+\.wd\d{1,2})\.myworkdayjobs\.com$/)
    if (m && m[1]) {
      const parcalar = url.pathname.split('/').filter((p) => p.length > 0)
      const site = parcalar.find((p) => !/^[a-z]{2}-[A-Za-z]{2}$/.test(p))
      if (!site || !/^[A-Za-z0-9_-]{2,64}$/.test(site) || site === 'job' || site === 'wday') return null
      return { saglayici: 'workday', kod: `${m[1]}/${site}` }
    }
  }

  /* Oracle: `{önek}.oraclecloud.com/hcmUI/CandidateExperience/{dil}/sites/CX_1234/…` */
  {
    const m = host.match(/^([a-z0-9-]+\.fa\.[a-z0-9]{2,6})\.oraclecloud\.com$/)
    if (m && m[1]) {
      const site = url.pathname.match(/\/sites\/(CX_[0-9A-Za-z]{1,12})(?:[/?#]|$)/)?.[1]
      return site ? { saglayici: 'oracle', kod: `${m[1]}/${site}` } : null
    }
  }

  return null
}

/**
 * HTML içindeki href/src/düz URL'lerden tanınan ATS panolarını çıkarır.
 * Aynı pano birden çok bağlantıda geçiyorsa (menü + altbilgi) bir kez döner;
 * ilk görülen URL saklanır.
 */
export function panolariBul(html: string): BulunanPano[] {
  // Sorgu dizelerindeki `&amp;` ayrıştırmayı bozmasın.
  const metin = html.replace(/&amp;/gi, '&').replace(/&#47;|&#x2f;/gi, '/')

  const bulunan: BulunanPano[] = []
  const gorulen = new Set<string>()

  for (const eslesme of metin.matchAll(URL_KALIBI)) {
    const ham = eslesme[0].startsWith('//') ? `https:${eslesme[0]}` : eslesme[0]
    // Cümle sonuna yapışan noktalama URL'nin parçası değil.
    const adres = ham.replace(/[.,;:!?]+$/, '')

    let url: URL
    try {
      url = new URL(adres)
    } catch {
      continue
    }

    const pano = panoyuCoz(url)
    if (!pano || !kodGecerliMi(pano.saglayici, pano.kod)) continue

    /* SmartRecruiters, Workday ve Oracle dışında kod küçük harfe indiriliyor;
       alt alan adları zaten harf duyarsız. Tekilleştirme her durumda küçük harfle. */
    const harfDuyarli = pano.saglayici === 'smartrecruiters' || pano.saglayici === 'workday' || pano.saglayici === 'oracle'
    const kod = harfDuyarli ? pano.kod : pano.kod.toLowerCase()
    const anahtar = `${pano.saglayici}:${kod.toLowerCase()}`
    if (gorulen.has(anahtar)) continue
    gorulen.add(anahtar)

    bulunan.push({ saglayici: pano.saglayici, kod, url: url.toString() })
  }

  return bulunan
}
