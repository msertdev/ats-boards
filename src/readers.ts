import type { Provider as AtsPanoSaglayici, EmploymentType as CalismaSuresi, Posting as Ilan, ReadResult as IlanSonucu } from './types.ts'
import { almanyaMi } from './germany.ts'
import { personioCalismaSuresi, xmlAyristir } from './personio-xml.ts'

/**
 * Board readers — one provider + one board code → `Posting[]`.
 *
 * Every endpoint is public and keyless; each reader was verified against a
 * live employer (named in the provider block below) and the field names were
 * written from those real responses. softgarden has no anonymous REST API,
 * so it is read from the JobPosting JSON-LD on the posting pages.
 *
 * Network rules:
 *  - Her istek 15 sn zaman aşımı, tanıtıcı user-agent (setUserAgent ile değiştirilebilir).
 *  - 404 → `{ durum: 'tamam', ilanlar: [] }`: the board does not exist; not an error.
 *  - 429 → 'kota'. Diğer HTTP hataları → 'erisim'. Beklenmeyen JSON → 'bicim'.
 *  - Ayrıntı (ilan başına) çağrısı YOK: liste ne veriyorsa o. SmartRecruiters
 *    ve JOIN listede metin vermiyor; orada `metin` boş kalır, uydurulmaz.
 *
 * SSRF kapısı (guvenli-getir.ts) burada kullanılmıyor: ana bilgisayar adları
 * sabit sağlayıcı alanları, tek değişken parça `kod` ve o da hem kalıpla
 * denetleniyor hem `encodeURIComponent` ile kaçırılıyor.
 */

const ZAMAN_ASIMI_MS = 15_000
/** Override with `setUserAgent()` so the site owner can see who is reading. */
let USER_AGENT = 'Mozilla/5.0 (compatible; ats-boards/1.0; +https://github.com/msertdev/ats-boards)'

export function setUserAgent(deger: string): void {
  USER_AGENT = deger
}

/** Tek sayfada gelen sağlayıcılar hariç: en fazla bu kadar sayfa okunur. */
const AZAMI_SAYFA = 10

const KOD_KALIBI = /^[a-z0-9-]{2,64}$/
/* SmartRecruiters kodu harf duyarlı ("BoschGroup"); pano-kesif de büyük
   harfi koruyor. */
const KOD_KALIBI_HARF_DUYARLI = /^[A-Za-z0-9-]{2,64}$/
/* Workday: `{kiracı}.wd{N}/{site}` (db.wd3/DBWebsite). Oracle:
   `{sunucu-öneki}/{CX_site}` (fa-eycl-saasfaeuraprod1.fa.ocs/CX_4025). İki
   parça da sağlayıcı alanının içinde kalıyor; `/` yalnızca ayırıcı. */
const KOD_KALIBI_WORKDAY = /^[a-z0-9-]{2,40}\.wd\d{1,2}\/[A-Za-z0-9_-]{2,64}$/
const KOD_KALIBI_ORACLE = /^[a-z0-9-]{2,40}\.fa\.[a-z0-9]{2,6}\/CX_[0-9A-Za-z]{1,12}$/

/**
 * Ayrıntı isteği gerektiren panolarda (Workday, Oracle) tur başına en fazla
 * bu kadar ilanın metni çekilir; pencere saatle döner ki gün içinde
 * pano baştan sona bir kez okunmuş olsun. Penceresi gelmeyen ilan liste
 * bilgisiyle (başlık, yer, tarih) yine yazılır — metni sonraki turda gelir.
 */
const AYRINTI_PENCERESI = 40

function ayrintiPenceresi(adet: number): { bas: number; son: number } {
  if (adet <= AYRINTI_PENCERESI) return { bas: 0, son: adet }
  const dilim = Math.ceil(adet / AYRINTI_PENCERESI)
  const bas = (new Date().getUTCHours() % dilim) * AYRINTI_PENCERESI
  return { bas, son: Math.min(adet, bas + AYRINTI_PENCERESI) }
}

type Ek = { isveren?: string | null; alanAdi?: string | null }

/** Sağlayıcının kendi kimliği + bizim eklediklerimiz — her çeviriciye geçer. */
type Baglam = { saglayici: AtsPanoSaglayici; kod: string; ek: Ek }

/* Sınıflar Node'un tip soymasıyla da çalışsın diye parametre özelliği yok
   (`constructor(readonly x)` silinemeyen sözdizimi). */
class HttpHatasi extends Error {
  durum: number
  constructor(durum: number, mesaj: string) {
    super(mesaj)
    this.durum = durum
  }
}

/** Yanıt geldi ama beklenen biçimde değil: JSON değil, dizi değil, XML değil. */
class BicimHatasi extends Error {}

/* ---------- ortak yardımcılar ---------- */

async function getir(url: string, kabul: string): Promise<Response> {
  const yanit = await fetch(url, {
    headers: { accept: kabul, 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
  })
  if (!yanit.ok) throw new HttpHatasi(yanit.status, `${yanit.status} ${url}`)
  return yanit
}

async function jsonGetir(url: string): Promise<unknown> {
  const yanit = await getir(url, 'application/json')
  try {
    return await yanit.json()
  } catch {
    throw new BicimHatasi(`JSON değil: ${url}`)
  }
}

function nesneMi(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function dizi(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function metin(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/**
 * HTML'i düz metne çevir. greenhouse.ts'deki `metniCoz` kalıbı, artı sayısal
 * varlıklar (`&#8211;`, `&#x27;`): Teamtailor ve Recruitee metinleri bunlarla
 * dolu. Eşleştirme motoru yalnızca sözcük arıyor; biçim korunmuyor.
 */
export function htmlDenMetne(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Herhangi bir ISO/"YYYY-MM-DD hh:mm:ss UTC" damgasından günü al. */
function gun(v: unknown): string | undefined {
  const s = metin(v)
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined
}

/** Milisaniye damgası (Lever) → YYYY-MM-DD. */
function gunMs(v: unknown): string | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  return new Date(v).toISOString().slice(0, 10)
}

/**
 * Sağlayıcıların çalışma süresi etiketleri — yalnızca doğrulanmış değerler
 * eşleniyor, gerisi 'bilinmiyor'. Serbest metinden tahmin yok.
 */
function calismaSuresi(etiket: unknown): CalismaSuresi {
  const s = metin(etiket)?.toLowerCase().replace(/[\s_-]/g, '')
  if (!s) return 'bilinmiyor'
  if (s === 'fulltime' || s.startsWith('fulltime')) return 'tam_zamanli'
  if (s === 'parttime' || s.startsWith('parttime')) return 'yari_zamanli'
  return 'bilinmiyor'
}

function ulkeAlmanyaMi(kod: unknown): boolean {
  return typeof kod === 'string' && kod.toLowerCase() === 'de'
}

/* ---------- sağlayıcılar ---------- */

type Okuyucu = (b: Baglam) => Promise<Ilan[]>

/**
 * Personio — `https://{kod}.jobs.personio.de/xml`
 * Doğrulama: clark (3 Eylül 2026). Ayrıştırma personio-xml.ts'de.
 */
const personioOku: Okuyucu = async ({ kod, ek }) => {
  const kok = `https://${encodeURIComponent(kod)}.jobs.personio.de`
  const xml = await (await getir(`${kok}/xml`, 'application/xml')).text()
  if (!xml.includes('<workzag-jobs') && !xml.includes('<position>')) {
    throw new BicimHatasi('personio: XML değil')
  }
  return xmlAyristir(xml)
    .filter((k) => k.ofisler.some((o) => almanyaMi(o)))
    .map((k) => ({
      kaynak: 'personio',
      kaynakKimligi: `${kod}:${k.id}`,
      baslik: k.ad,
      isveren: ek.isveren ?? undefined,
      sirketAlanAdi: ek.alanAdi ?? undefined,
      konumlar: k.ofisler.map((o) => ({ ulke: 'de', sehir: o })),
      metin: k.metin,
      calismaSuresi: personioCalismaSuresi(k.program),
      yayinTarihi: k.tarih,
      ilanUrl: `${kok}/job/${k.id}`,
    }))
}

/**
 * Greenhouse — `https://boards-api.greenhouse.io/v1/boards/{kod}/jobs?content=true`
 * Doğrulama: celonis. Alanlar: id, title, absolute_url, first_published,
 * updated_at, content (HTML, kaçışlı), company_name, location.name.
 * Ülke kodu yok; yer adından tanınıyor.
 */
const greenhouseOku: Okuyucu = async ({ kod, ek }) => {
  const govde = await jsonGetir(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(kod)}/jobs?content=true`,
  )
  if (!nesneMi(govde)) throw new BicimHatasi('greenhouse: nesne değil')
  const ilanlar: Ilan[] = []
  for (const ham of dizi(govde.jobs)) {
    if (!nesneMi(ham)) continue
    const yer = nesneMi(ham.location) ? metin(ham.location.name) : undefined
    if (!almanyaMi(yer)) continue
    const baslik = metin(ham.title)
    const id = ham.id
    if (!baslik || (typeof id !== 'number' && typeof id !== 'string')) continue
    const icerik = metin(ham.content)
    ilanlar.push({
      kaynak: 'greenhouse',
      kaynakKimligi: `${kod}:${id}`,
      baslik,
      isveren: ek.isveren ?? metin(ham.company_name),
      sirketAlanAdi: ek.alanAdi ?? undefined,
      konumlar: [{ ulke: 'de', sehir: yer }],
      metin: icerik ? htmlDenMetne(icerik) : undefined,
      calismaSuresi: 'bilinmiyor',
      yayinTarihi: gun(ham.first_published) ?? gun(ham.updated_at),
      ilanUrl: metin(ham.absolute_url),
    })
  }
  return ilanlar
}

/**
 * Lever — `https://api.lever.co/v0/postings/{kod}?mode=json`
 * Doğrulama: kolibrigames, brevo. Yanıt düz dizi. Alanlar: id, text (başlık),
 * country ('DE' — her panoda dolu değil), categories.{location, allLocations,
 * commitment}, createdAt (ms), descriptionPlain, lists[].content (HTML),
 * additionalPlain, hostedUrl. Bilinmeyen pano 404 + {"ok":false} döner.
 */
const leverOku: Okuyucu = async ({ kod, ek }) => {
  const govde = await jsonGetir(`https://api.lever.co/v0/postings/${encodeURIComponent(kod)}?mode=json`)
  if (!Array.isArray(govde)) throw new BicimHatasi('lever: dizi değil')
  const ilanlar: Ilan[] = []
  for (const ham of govde) {
    if (!nesneMi(ham)) continue
    const kat = nesneMi(ham.categories) ? ham.categories : {}
    const yerler = [metin(kat.location), ...dizi(kat.allLocations).map(metin)].filter(
      (y): y is string => typeof y === 'string',
    )
    const almanya = ulkeAlmanyaMi(ham.country) || yerler.some((y) => almanyaMi(y))
    if (!almanya) continue
    const baslik = metin(ham.text)
    const id = metin(ham.id)
    if (!baslik || !id) continue
    const parcalar = [
      metin(ham.descriptionPlain),
      ...dizi(ham.lists).map((l) => (nesneMi(l) ? metin(l.content) : undefined)),
      metin(ham.additionalPlain),
    ].filter((p): p is string => typeof p === 'string')
    ilanlar.push({
      kaynak: 'lever',
      kaynakKimligi: `${kod}:${id}`,
      baslik,
      isveren: ek.isveren ?? undefined,
      sirketAlanAdi: ek.alanAdi ?? undefined,
      konumlar: [...new Set(yerler)].map((y) => ({ ulke: 'de', sehir: y })),
      metin: parcalar.length > 0 ? htmlDenMetne(parcalar.join(' ')) : undefined,
      calismaSuresi: calismaSuresi(kat.commitment),
      yayinTarihi: gunMs(ham.createdAt),
      ilanUrl: metin(ham.hostedUrl),
    })
  }
  return ilanlar
}

/**
 * Ashby — `https://api.ashbyhq.com/posting-api/job-board/{kod}`
 * Doğrulama: parloa. Alanlar: jobs[].{id, title, employmentType ('FullTime'),
 * location, secondaryLocations[].location, publishedAt, isListed, jobUrl,
 * descriptionPlain, descriptionHtml, address}. `address` doğrulanan panoda
 * hep null geldi; ülke, yer adından tanınıyor.
 */
const ashbyOku: Okuyucu = async ({ kod, ek }) => {
  const govde = await jsonGetir(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(kod)}`)
  if (!nesneMi(govde)) throw new BicimHatasi('ashby: nesne değil')
  const ilanlar: Ilan[] = []
  for (const ham of dizi(govde.jobs)) {
    if (!nesneMi(ham) || ham.isListed === false) continue
    const yerler = [
      metin(ham.location),
      ...dizi(ham.secondaryLocations).map((s) => (nesneMi(s) ? metin(s.location) : undefined)),
    ].filter((y): y is string => typeof y === 'string')
    if (!yerler.some((y) => almanyaMi(y))) continue
    const baslik = metin(ham.title)
    const id = metin(ham.id)
    if (!baslik || !id) continue
    const duz = metin(ham.descriptionPlain)
    const html = metin(ham.descriptionHtml)
    ilanlar.push({
      kaynak: 'ashby',
      kaynakKimligi: `${kod}:${id}`,
      baslik,
      isveren: ek.isveren ?? undefined,
      sirketAlanAdi: ek.alanAdi ?? undefined,
      konumlar: yerler.map((y) => ({ ulke: 'de', sehir: y })),
      metin: duz ? duz.replace(/\s+/g, ' ').trim() : html ? htmlDenMetne(html) : undefined,
      calismaSuresi: calismaSuresi(ham.employmentType),
      yayinTarihi: gun(ham.publishedAt),
      ilanUrl: metin(ham.jobUrl),
    })
  }
  return ilanlar
}

/**
 * SmartRecruiters — `https://api.smartrecruiters.com/v1/companies/{kod}/postings`
 * Doğrulama: BoschGroup (790 Almanya ilanı). `country=de` süzgeci sunucuda
 * çalışıyor (totalFound 4796 → 790), sayfa `limit`/`offset` ile. Alanlar:
 * content[].{id, name, releasedDate, company.name, location.{city, country,
 * fullLocation}, typeOfEmployment.label}. Listede ilan metni yok; ayrıntı
 * ucu ilan başına bir çağrı isterdi, bütçe yüzünden yapılmıyor.
 * İlan sayfası: `https://jobs.smartrecruiters.com/{kod}/{id}`.
 */
const smartrecruitersOku: Okuyucu = async ({ kod, ek }) => {
  const kokUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(kod)}/postings`
  const ilanlar: Ilan[] = []
  const limit = 100
  for (let sayfa = 0; sayfa < AZAMI_SAYFA; sayfa++) {
    const govde = await jsonGetir(`${kokUrl}?limit=${limit}&offset=${sayfa * limit}&country=de`)
    if (!nesneMi(govde)) throw new BicimHatasi('smartrecruiters: nesne değil')
    const icerik = dizi(govde.content)
    for (const ham of icerik) {
      if (!nesneMi(ham)) continue
      const yer = nesneMi(ham.location) ? ham.location : {}
      // Süzgeç sunucuda ama güvenmiyoruz: ülke kodu yanıtta da denetleniyor.
      if (!ulkeAlmanyaMi(yer.country) && !almanyaMi(metin(yer.fullLocation))) continue
      const baslik = metin(ham.name)
      const id = metin(ham.id)
      if (!baslik || !id) continue
      ilanlar.push({
        kaynak: 'smartrecruiters',
        kaynakKimligi: `${kod}:${id}`,
        baslik,
        isveren: ek.isveren ?? (nesneMi(ham.company) ? metin(ham.company.name) : undefined),
        sirketAlanAdi: ek.alanAdi ?? undefined,
        konumlar: [{ ulke: 'de', sehir: metin(yer.city) }],
        calismaSuresi: calismaSuresi(nesneMi(ham.typeOfEmployment) ? ham.typeOfEmployment.label : undefined),
        yayinTarihi: gun(ham.releasedDate),
        ilanUrl: `https://jobs.smartrecruiters.com/${encodeURIComponent(kod)}/${encodeURIComponent(id)}`,
      })
    }
    const toplam = typeof govde.totalFound === 'number' ? govde.totalFound : 0
    if (icerik.length < limit || (sayfa + 1) * limit >= toplam) break
  }
  return ilanlar
}

/**
 * Recruitee — `https://{kod}.recruitee.com/api/offers/`
 * Doğrulama: everdrop. Alanlar: offers[].{id, title, status ('published'),
 * published_at ('YYYY-MM-DD hh:mm:ss UTC'), careers_url, country_code ('DE'),
 * city, locations[].{country_code, city}, employment_type_code
 * ('fulltime_permanent'), description (HTML), requirements (HTML),
 * company_name}.
 */
const recruiteeOku: Okuyucu = async ({ kod, ek }) => {
  const govde = await jsonGetir(`https://${encodeURIComponent(kod)}.recruitee.com/api/offers/`)
  if (!nesneMi(govde)) throw new BicimHatasi('recruitee: nesne değil')
  const ilanlar: Ilan[] = []
  for (const ham of dizi(govde.offers)) {
    if (!nesneMi(ham)) continue
    if (metin(ham.status) && ham.status !== 'published') continue
    const konumlar = dizi(ham.locations)
      .filter(nesneMi)
      .filter((k) => ulkeAlmanyaMi(k.country_code))
      .map((k) => ({ ulke: 'de', sehir: metin(k.city) }))
    if (konumlar.length === 0) {
      if (!ulkeAlmanyaMi(ham.country_code) && !almanyaMi(metin(ham.location))) continue
      konumlar.push({ ulke: 'de', sehir: metin(ham.city) })
    }
    const baslik = metin(ham.title)
    const id = ham.id
    if (!baslik || (typeof id !== 'number' && typeof id !== 'string')) continue
    const html = [metin(ham.description), metin(ham.requirements)].filter(
      (p): p is string => typeof p === 'string',
    )
    ilanlar.push({
      kaynak: 'recruitee',
      kaynakKimligi: `${kod}:${id}`,
      baslik,
      isveren: ek.isveren ?? metin(ham.company_name),
      sirketAlanAdi: ek.alanAdi ?? undefined,
      konumlar,
      metin: html.length > 0 ? htmlDenMetne(html.join(' ')) : undefined,
      calismaSuresi: calismaSuresi(ham.employment_type_code),
      yayinTarihi: gun(ham.published_at) ?? gun(ham.created_at),
      ilanUrl: metin(ham.careers_url),
    })
  }
  return ilanlar
}

/**
 * Teamtailor — `https://{kod}.teamtailor.com/jobs.json` (JSON Feed 1.1)
 * Doğrulama: hrneuefische. Alanlar: title (şirket), items[].{id (uuid), title,
 * url, date_published, content_html, _jobposting.{identifier.value (sayısal
 * ilan no), hiringOrganization.name, jobLocation[].address.{addressLocality,
 * addressCountry}, employmentType}}. `/jobs.rss` de var (tt:locations ile)
 * ama JSON yeterli. `/feed` ve `/jobs.xml` yok.
 */
const teamtailorOku: Okuyucu = async ({ kod, ek }) => {
  const govde = await jsonGetir(`https://${encodeURIComponent(kod)}.teamtailor.com/jobs.json`)
  if (!nesneMi(govde) || !Array.isArray(govde.items)) throw new BicimHatasi('teamtailor: JSON Feed değil')
  const sirket = metin(govde.title)
  const ilanlar: Ilan[] = []
  for (const ham of govde.items) {
    if (!nesneMi(ham)) continue
    const jp = nesneMi(ham._jobposting) ? ham._jobposting : {}
    const adresler = dizi(jp.jobLocation)
      .map((y) => (nesneMi(y) && nesneMi(y.address) ? y.address : null))
      .filter((a): a is Record<string, unknown> => a !== null)
    const konumlar = adresler
      .filter((a) => ulkeAlmanyaMi(a.addressCountry) || almanyaMi(metin(a.addressLocality)))
      .map((a) => ({ ulke: 'de', sehir: metin(a.addressLocality) }))
    if (konumlar.length === 0) continue
    const baslik = metin(ham.title)
    const kimlik = nesneMi(jp.identifier) ? jp.identifier.value : undefined
    const id = typeof kimlik === 'number' || typeof kimlik === 'string' ? String(kimlik) : metin(ham.id)
    if (!baslik || !id) continue
    const html = metin(ham.content_html)
    const org = nesneMi(jp.hiringOrganization) ? metin(jp.hiringOrganization.name) : undefined
    ilanlar.push({
      kaynak: 'teamtailor',
      kaynakKimligi: `${kod}:${id}`,
      baslik,
      isveren: ek.isveren ?? org ?? sirket,
      sirketAlanAdi: ek.alanAdi ?? undefined,
      konumlar,
      metin: html ? htmlDenMetne(html) : undefined,
      calismaSuresi: calismaSuresi(jp.employmentType),
      yayinTarihi: gun(ham.date_published) ?? gun(jp.datePosted),
      ilanUrl: metin(ham.url),
    })
  }
  return ilanlar
}

/**
 * JOIN — iki adım, çünkü herkese açık uç şirketi slug ile değil sayısal
 * kimlikle tanıyor:
 *
 *   1. `https://join.com/companies/{slug}` sayfasındaki `__NEXT_DATA__`
 *      içinden `"company":{"id":N` okunur (kod zaten sayısalsa bu adım yok).
 *   2. `https://join.com/api/public/companies/{N}/jobs?page=P&pageSize=5`
 *      — pageSize 1..5 dışını 422 ile reddediyor (denendi: 10, 20, 50, 100),
 *      sayfa `pagination.pageCount` ile ilerliyor.
 *
 * Doğrulama: join (id 54), gsg1 (id 129752). Alanlar: items[].{id, idParam,
 * title, createdAt, employmentType.name ('Employee'), country.iso3166 ('DE'),
 * city.cityName, workplaceType}. Listede ilan metni yok. İlan sayfası:
 * `https://join.com/companies/{slug}/{idParam}`.
 *
 * Bilinmeyen slug için sayfa 404 döner → pano yok. Sayısal kod verildiğinde
 * slug bilinmediği için `ilanUrl` boş kalır; pano-kesif hep slug çıkardığı
 * için pratikte olmuyor.
 */
const joinOku: Okuyucu = async ({ kod, ek }) => {
  let sirketId: string
  let slug: string | undefined
  if (/^\d+$/.test(kod)) {
    sirketId = kod
  } else {
    slug = kod
    const html = await (await getir(`https://join.com/companies/${encodeURIComponent(kod)}`, 'text/html')).text()
    const m = html.match(/"company":\{"id":(\d+)/)
    if (!m?.[1]) throw new BicimHatasi('join: şirket kimliği sayfada bulunamadı')
    sirketId = m[1]
  }

  const ilanlar: Ilan[] = []
  const sayfaBoyu = 5
  // JOIN sayfa başına 5 verdiği için üst sınır burada daha yüksek: 100 ilan.
  for (let sayfa = 1; sayfa <= AZAMI_SAYFA * 2; sayfa++) {
    const govde = await jsonGetir(
      `https://join.com/api/public/companies/${sirketId}/jobs?page=${sayfa}&pageSize=${sayfaBoyu}`,
    )
    if (!nesneMi(govde)) throw new BicimHatasi('join: nesne değil')
    for (const ham of dizi(govde.items)) {
      if (!nesneMi(ham)) continue
      const ulke = nesneMi(ham.country) ? ham.country.iso3166 : undefined
      const sehir = nesneMi(ham.city) ? metin(ham.city.cityName) : undefined
      if (!ulkeAlmanyaMi(ulke) && !almanyaMi(sehir)) continue
      const baslik = metin(ham.title)
      const id = ham.id
      if (!baslik || (typeof id !== 'number' && typeof id !== 'string')) continue
      const idParam = metin(ham.idParam)
      ilanlar.push({
        kaynak: 'join',
        kaynakKimligi: `${kod}:${id}`,
        baslik,
        isveren: ek.isveren ?? undefined,
        sirketAlanAdi: ek.alanAdi ?? undefined,
        konumlar: [{ ulke: 'de', sehir }],
        // JOIN'in employmentType'ı sözleşme türü ('Employee', 'Intern'), süre değil.
        calismaSuresi: 'bilinmiyor',
        yayinTarihi: gun(ham.createdAt),
        ilanUrl: slug && idParam ? `https://join.com/companies/${encodeURIComponent(slug)}/${idParam}` : undefined,
      })
    }
    const sayfalama = nesneMi(govde.pagination) ? govde.pagination : {}
    const sayfaSayisi = typeof sayfalama.pageCount === 'number' ? sayfalama.pageCount : 0
    if (sayfa >= sayfaSayisi) break
  }
  return ilanlar
}

/**
 * Workable — `https://apply.workable.com/api/v1/widget/accounts/{kod}?details=true`
 * Doğrulama: caresyntax-2 (enpal ve flixbus hesapları var ama boş).
 * `details=true` olmadan `description` gelmiyor. Alanlar: name (şirket),
 * jobs[].{title, shortcode, employment_type ('Full-time'), url, published_on
 * ('YYYY-MM-DD'), country, city, locations[].{countryCode, city}, description
 * (HTML)}. Bilinmeyen hesap 404.
 */
const workableOku: Okuyucu = async ({ kod, ek }) => {
  const govde = await jsonGetir(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(kod)}?details=true`,
  )
  if (!nesneMi(govde)) throw new BicimHatasi('workable: nesne değil')
  const sirket = metin(govde.name)
  const ilanlar: Ilan[] = []
  for (const ham of dizi(govde.jobs)) {
    if (!nesneMi(ham)) continue
    const konumlar = dizi(ham.locations)
      .filter(nesneMi)
      .filter((k) => ulkeAlmanyaMi(k.countryCode) || almanyaMi(metin(k.country)))
      .map((k) => ({ ulke: 'de', sehir: metin(k.city) }))
    if (konumlar.length === 0) {
      if (!almanyaMi(metin(ham.country))) continue
      konumlar.push({ ulke: 'de', sehir: metin(ham.city) })
    }
    const baslik = metin(ham.title)
    const id = metin(ham.shortcode)
    if (!baslik || !id) continue
    const html = metin(ham.description)
    ilanlar.push({
      kaynak: 'workable',
      kaynakKimligi: `${kod}:${id}`,
      baslik,
      isveren: ek.isveren ?? sirket,
      sirketAlanAdi: ek.alanAdi ?? undefined,
      konumlar,
      metin: html ? htmlDenMetne(html) : undefined,
      calismaSuresi: calismaSuresi(ham.employment_type),
      yayinTarihi: gun(ham.published_on) ?? gun(ham.created_at),
      ilanUrl: metin(ham.url),
    })
  }
  return ilanlar
}

/**
 * softgarden — `https://{kod}.softgarden.io/de/vacancies` (liste, HTML) +
 * her ilanın sayfasındaki JobPosting JSON-LD. Doğrulama: visiolife-group
 * (3 Eylül 2026). REST ucu (`api.softgarden.io/.../jobslist/{channelId}`)
 * anonim değil (401), kanal kimliği de slug'dan türetilemiyor; ama ilan
 * sayfaları Google için JobPosting yapılandırılmış verisi yayımlıyor —
 * başlık, tarih, adres (ülke adıyla), tam metin ve işveren adı orada.
 *
 * Liste sayfası ilanları `../job/{id}/{slug}?jobDbPVId=…` bağlantılarıyla
 * veriyor; kimlik `{id}`. Ayrıntı isteği ilan başına bir tane, üst sınır
 * AZAMI_SOFTGARDEN_ILAN — büyük pano bütçeyi yemesin.
 */
const AZAMI_SOFTGARDEN_ILAN = 80

function jsonLdBloklari(html: string): unknown[] {
  const sonuc: unknown[] = []
  const kalip = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const m of html.matchAll(kalip)) {
    try {
      sonuc.push(JSON.parse(m[1] ?? ''))
    } catch {
      /* bozuk blok — atla */
    }
  }
  return sonuc
}

function softgardenCalismaSuresi(v: unknown): CalismaSuresi {
  const liste = Array.isArray(v) ? v : [v]
  const s = liste.map((x) => metin(x)?.toUpperCase() ?? '')
  if (s.includes('FULL_TIME')) return 'tam_zamanli'
  if (s.includes('PART_TIME')) return 'yari_zamanli'
  return 'bilinmiyor'
}

const softgardenOku: Okuyucu = async ({ kod, ek }) => {
  const kok = `https://${encodeURIComponent(kod)}.softgarden.io`
  const liste = await (await getir(`${kok}/de/vacancies`, 'text/html')).text()
  if (!liste.includes('softgarden')) throw new BicimHatasi('softgarden: liste sayfası değil')

  const kimlikler = new Set<string>()
  for (const m of liste.matchAll(/href="(?:\.\.\/|\/)?job\/(\d+)\/[^"]*"/g)) if (m[1]) kimlikler.add(m[1])

  const ilanlar: Ilan[] = []
  for (const id of [...kimlikler].slice(0, AZAMI_SOFTGARDEN_ILAN)) {
    let html: string
    try {
      html = await (await getir(`${kok}/job/${id}?l=de`, 'text/html')).text()
    } catch (e) {
      if (e instanceof HttpHatasi && e.durum === 404) continue
      throw e
    }
    const ham = jsonLdBloklari(html).find((b) => nesneMi(b) && b['@type'] === 'JobPosting')
    if (!nesneMi(ham)) continue
    const baslik = metin(ham.title)
    if (!baslik) continue

    const yer = nesneMi(ham.jobLocation) ? ham.jobLocation : undefined
    const adres = yer && nesneMi(yer.address) ? yer.address : undefined
    const ulke = adres ? metin(adres.addressCountry) : undefined
    const sehir = adres ? metin(adres.addressLocality) : undefined
    const almanya =
      ulkeAlmanyaMi(ulke) || (ulke ? almanyaMi(ulke) : false) || almanyaMi(sehir)
    if (!almanya) continue

    const kurum = nesneMi(ham.hiringOrganization) ? metin(ham.hiringOrganization.name) : undefined
    const icerik = metin(ham.description)
    ilanlar.push({
      kaynak: 'softgarden',
      kaynakKimligi: `${kod}:${id}`,
      baslik,
      isveren: ek.isveren ?? kurum,
      sirketAlanAdi: ek.alanAdi ?? undefined,
      konumlar: [{ ulke: 'de', sehir }],
      metin: icerik ? htmlDenMetne(icerik) : undefined,
      calismaSuresi: softgardenCalismaSuresi(ham.employmentType),
      yayinTarihi: gun(ham.datePosted),
      ilanUrl: `${kok}/job/${id}?l=de`,
    })
  }
  return ilanlar
}


/**
 * Workday — `POST https://{kiracı}.wd{N}.myworkdayjobs.com/wday/cxs/{kiracı}/{site}/jobs`
 * Kariyer sayfasının kendi kullandığı uç; belgesiz ama anonim. Doğrulama:
 * db.wd3/DBWebsite (3 Eylül 2026): total, jobPostings[{title, externalPath,
 * locationsText, postedOn("Posted Today"/"Posted 3 Days Ago")}], facets.
 * Almanya süzgeci: `Country` yüzü, Workday'de Almanya'nın kimliği sabit
 * (dcc5b7608d8644b3a93716604e78e995) — kiracıdan bağımsız. Sayfa 20 sabit.
 * Ayrıntı: `GET …/{site}{externalPath}` → jobPostingInfo{jobDescription
 * (HTML), startDate, timeType, location}.
 */
const WORKDAY_ALMANYA = 'dcc5b7608d8644b3a93716604e78e995'
const WORKDAY_SAYFA = 20
/* Sayfa 20 sabit olduğu için genel sınır (10) 200 ilanda keserdi; Almanya
   süzgeci zaten uygulanıyor, 20 sayfa = 400 ilan. */
const WORKDAY_AZAMI_SAYFA = 20

function workdayGun(v: unknown): string | undefined {
  const s = metin(v)?.toLowerCase()
  if (!s) return undefined
  const simdi = new Date()
  if (s.includes('today')) return simdi.toISOString().slice(0, 10)
  if (s.includes('yesterday')) return new Date(simdi.getTime() - 864e5).toISOString().slice(0, 10)
  const m = s.match(/(\d+)\+?\s*days?/)
  if (m && m[1]) return new Date(simdi.getTime() - Number(m[1]) * 864e5).toISOString().slice(0, 10)
  return undefined
}

function workdayCalismaSuresi(v: unknown): CalismaSuresi {
  const s = metin(v)?.toLowerCase()
  if (!s) return 'bilinmiyor'
  if (s.includes('full')) return 'tam_zamanli'
  if (s.includes('part')) return 'yari_zamanli'
  return 'bilinmiyor'
}

const workdayOku: Okuyucu = async ({ kod, ek }) => {
  const [kiraciWd, site] = kod.split('/') as [string, string]
  const kiraci = kiraciWd.split('.')[0] ?? ''
  const kok = `https://${kiraciWd}.myworkdayjobs.com`
  const uc = `${kok}/wday/cxs/${kiraci}/${site}`

  type Satir = { baslik: string; yol: string; yer?: string; tarih?: string }
  const satirlar: Satir[] = []
  /* `total` yalnızca ilk sayfada dolu geliyor, sonrakilerde 0 — ilk değeri tut. */
  let toplam = Number.POSITIVE_INFINITY
  for (let sayfa = 0; sayfa < WORKDAY_AZAMI_SAYFA; sayfa++) {
    const yanit = await fetch(`${uc}/jobs`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': USER_AGENT },
      body: JSON.stringify({
        appliedFacets: { Country: [WORKDAY_ALMANYA] },
        limit: WORKDAY_SAYFA,
        offset: sayfa * WORKDAY_SAYFA,
        searchText: '',
      }),
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
    })
    if (!yanit.ok) throw new HttpHatasi(yanit.status, `${yanit.status} ${uc}/jobs`)
    let govde: unknown
    try {
      govde = await yanit.json()
    } catch {
      throw new BicimHatasi(`JSON değil: ${uc}/jobs`)
    }
    if (!nesneMi(govde) || !Array.isArray(govde.jobPostings)) throw new BicimHatasi('workday: jobPostings yok')
    for (const ham of govde.jobPostings) {
      if (!nesneMi(ham)) continue
      const baslik = metin(ham.title)
      const yol = metin(ham.externalPath)
      if (!baslik || !yol) continue
      satirlar.push({ baslik, yol, yer: metin(ham.locationsText), tarih: workdayGun(ham.postedOn) })
    }
    if (sayfa === 0 && typeof govde.total === 'number') toplam = govde.total
    if (govde.jobPostings.length < WORKDAY_SAYFA || satirlar.length >= toplam) break
  }

  const pencere = ayrintiPenceresi(satirlar.length)
  const ilanlar: Ilan[] = []
  for (const [i, s] of satirlar.entries()) {
    const kimlik = s.yol.split('/').pop() ?? s.yol
    const ilan: Ilan = {
      kaynak: 'workday',
      kaynakKimligi: `${kod}:${kimlik}`,
      baslik: s.baslik,
      isveren: ek.isveren ?? undefined,
      sirketAlanAdi: ek.alanAdi ?? undefined,
      konumlar: [{ ulke: 'de', sehir: s.yer?.split(',')[0]?.trim() }],
      calismaSuresi: 'bilinmiyor',
      yayinTarihi: s.tarih,
      ilanUrl: `${kok}/${site}${s.yol}`,
    }
    if (i >= pencere.bas && i < pencere.son) {
      try {
        const ayrinti = await jsonGetir(`${uc}${s.yol}`)
        const bilgi = nesneMi(ayrinti) && nesneMi(ayrinti.jobPostingInfo) ? ayrinti.jobPostingInfo : undefined
        if (bilgi) {
          const html = metin(bilgi.jobDescription)
          if (html) ilan.metin = htmlDenMetne(html)
          ilan.calismaSuresi = workdayCalismaSuresi(bilgi.timeType)
          ilan.yayinTarihi = gun(bilgi.startDate) ?? ilan.yayinTarihi
        }
      } catch (e) {
        // Tek ilanın ayrıntısı düşerse liste verisiyle devam.
        if (!(e instanceof HttpHatasi)) throw e
      }
    }
    ilanlar.push(ilan)
  }
  return ilanlar
}

/**
 * Oracle Recruiting Cloud —
 * `GET https://{önek}.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions`
 * `?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber={CX},limit=100,offset=N`
 * Kariyer sitesinin kendi ucu, anonim. Doğrulama: Sana Kliniken
 * (fa-eycl-saasfaeuraprod1.fa.ocs/CX_4025, 1.117 ilan, 3 Eylül 2026).
 * `expand=requisitionList` olmadan liste boş dönüyor. Satır: Id, Title,
 * PostedDate, PrimaryLocation, PrimaryLocationCountry ('DE'), LegalEmployer,
 * JobSchedule. Ayrıntı: recruitingCEJobRequisitionDetails
 * `finder=ById;Id="{id}",siteNumber="{CX}"` → ExternalDescriptionStr,
 * ExternalQualificationsStr, ExternalResponsibilitiesStr (HTML).
 * Başlık `ora-irc-language: de` Almanca metni seçer.
 */
const ORACLE_SAYFA = 100

const oracleOku: Okuyucu = async ({ kod, ek }) => {
  const [onek, site] = kod.split('/') as [string, string]
  const kok = `https://${onek}.oraclecloud.com/hcmRestApi/resources/latest`
  const basliklar = { accept: 'application/json', 'ora-irc-language': 'de', 'user-agent': USER_AGENT }

  async function oracleJson(url: string): Promise<unknown> {
    const yanit = await fetch(url, { headers: basliklar, signal: AbortSignal.timeout(ZAMAN_ASIMI_MS) })
    if (!yanit.ok) throw new HttpHatasi(yanit.status, `${yanit.status} ${url}`)
    try {
      return await yanit.json()
    } catch {
      throw new BicimHatasi(`JSON değil: ${url}`)
    }
  }

  type Satir = { id: string; baslik: string; yer?: string; tarih?: string; isveren?: string; sure: CalismaSuresi }
  const satirlar: Satir[] = []
  for (let sayfa = 0; sayfa < AZAMI_SAYFA; sayfa++) {
    const url =
      `${kok}/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList` +
      `&finder=findReqs;siteNumber=${encodeURIComponent(site)},limit=${ORACLE_SAYFA},offset=${sayfa * ORACLE_SAYFA}`
    const govde = await oracleJson(url)
    const ilk = nesneMi(govde) ? dizi(govde.items)[0] : undefined
    if (!nesneMi(ilk)) throw new BicimHatasi('oracle: items yok')
    const liste = dizi(ilk.requisitionList)
    for (const ham of liste) {
      if (!nesneMi(ham)) continue
      const id = metin(ham.Id)
      const baslik = metin(ham.Title)
      if (!id || !baslik) continue
      const ulke = metin(ham.PrimaryLocationCountry)
      const yer = metin(ham.PrimaryLocation)
      if (!ulkeAlmanyaMi(ulke) && !almanyaMi(yer)) continue
      const program = metin(ham.JobSchedule)?.toLowerCase() ?? ''
      satirlar.push({
        id,
        baslik,
        yer,
        tarih: gun(ham.PostedDate),
        isveren: metin(ham.LegalEmployer),
        sure:
          program.includes('vollzeit') || program.includes('full')
            ? 'tam_zamanli'
            : program.includes('teilzeit') || program.includes('part')
              ? 'yari_zamanli'
              : 'bilinmiyor',
      })
    }
    if (liste.length < ORACLE_SAYFA) break
  }

  const pencere = ayrintiPenceresi(satirlar.length)
  const ilanlar: Ilan[] = []
  for (const [i, s] of satirlar.entries()) {
    const ilan: Ilan = {
      kaynak: 'oracle',
      kaynakKimligi: `${kod}:${s.id}`,
      baslik: s.baslik,
      isveren: ek.isveren ?? s.isveren,
      sirketAlanAdi: ek.alanAdi ?? undefined,
      konumlar: [{ ulke: 'de', sehir: s.yer?.split(',')[0]?.trim() }],
      calismaSuresi: s.sure,
      yayinTarihi: s.tarih,
      ilanUrl: `https://${onek}.oraclecloud.com/hcmUI/CandidateExperience/de/sites/${site}/job/${s.id}`,
    }
    if (i >= pencere.bas && i < pencere.son) {
      try {
        const url =
          `${kok}/recruitingCEJobRequisitionDetails?onlyData=true&expand=all` +
          `&finder=ById;Id=%22${encodeURIComponent(s.id)}%22,siteNumber=%22${encodeURIComponent(site)}%22`
        const govde = await oracleJson(url)
        const ayrinti = nesneMi(govde) ? dizi(govde.items)[0] : undefined
        if (nesneMi(ayrinti)) {
          const parcalar = [ayrinti.ExternalDescriptionStr, ayrinti.ExternalResponsibilitiesStr, ayrinti.ExternalQualificationsStr]
            .map((p) => metin(p))
            .filter((p): p is string => !!p)
          if (parcalar.length > 0) ilan.metin = htmlDenMetne(parcalar.join(' '))
          const program = metin(ayrinti.JobSchedule)?.toLowerCase() ?? ''
          if (program.includes('vollzeit') || program.includes('full')) ilan.calismaSuresi = 'tam_zamanli'
          else if (program.includes('teilzeit') || program.includes('part')) ilan.calismaSuresi = 'yari_zamanli'
        }
      } catch (e) {
        if (!(e instanceof HttpHatasi)) throw e
      }
    }
    ilanlar.push(ilan)
  }
  return ilanlar
}

const OKUYUCULAR: Record<AtsPanoSaglayici, Okuyucu> = {
  personio: personioOku,
  greenhouse: greenhouseOku,
  lever: leverOku,
  ashby: ashbyOku,
  smartrecruiters: smartrecruitersOku,
  recruitee: recruiteeOku,
  teamtailor: teamtailorOku,
  join: joinOku,
  workable: workableOku,
  softgarden: softgardenOku,
  workday: workdayOku,
  oracle: oracleOku,
}

/* ---------- giriş ---------- */

export async function panoOku(saglayici: AtsPanoSaglayici, kod: string, ek: Ek): Promise<IlanSonucu> {
  const kalip =
    saglayici === 'smartrecruiters'
      ? KOD_KALIBI_HARF_DUYARLI
      : saglayici === 'workday'
        ? KOD_KALIBI_WORKDAY
        : saglayici === 'oracle'
          ? KOD_KALIBI_ORACLE
          : KOD_KALIBI
  if (!kalip.test(kod)) {
    return { durum: 'hata', sebep: 'bicim', mesaj: `${saglayici}: geçersiz kod "${kod}"` }
  }

  try {
    const ilanlar = await OKUYUCULAR[saglayici]({ saglayici, kod, ek })
    return { durum: 'tamam', ilanlar }
  } catch (e) {
    if (e instanceof BicimHatasi) {
      return { durum: 'hata', sebep: 'bicim', mesaj: e.message }
    }
    if (e instanceof HttpHatasi) {
      // 404: pano yok ya da kapanmış. Hata değil, sıfır ilan.
      if (e.durum === 404) return { durum: 'tamam', ilanlar: [] }
      if (e.durum === 429) return { durum: 'hata', sebep: 'kota', mesaj: e.message }
      return { durum: 'hata', sebep: 'erisim', mesaj: e.message }
    }
    // Zaman aşımı, DNS, TLS: hepsi erişim.
    return { durum: 'hata', sebep: 'erisim', mesaj: e instanceof Error ? e.message : String(e) }
  }
}
