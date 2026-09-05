import { panolariBul } from './discover.ts'
import { panoOku } from './readers.ts'
import type { EmploymentType, Posting, Provider } from './types.ts'

/** A discovered ATS board with English field names. */
export type JobBoard = {
  provider: Provider
  code: string
  url: string
}

export type JobEmploymentType = 'full_time' | 'part_time' | 'shift' | 'unknown'

export type JobLocation = {
  city?: string
  postalCode?: string
  country: string
  latitude?: number
  longitude?: number
}

/** The stable, provider-independent shape returned by `readJobBoard`. */
export type JobPosting = {
  provider: string
  providerPostingId: string
  title: string
  employer?: string
  companyDomain?: string
  locations: JobLocation[]
  occupation?: string
  description?: string
  employmentType: JobEmploymentType
  publishedDate?: string
  url?: string
  annualGrossEur?: number
}

export type JobBoardReadOptions = {
  employer?: string
  companyDomain?: string
}

export type JobBoardReadResult =
  | { ok: true; postings: JobPosting[]; total?: number }
  | {
      ok: false
      reason: 'access' | 'permission' | 'rate_limit' | 'format'
      message?: string
    }

const EMPLOYMENT_TYPES: Record<EmploymentType, JobEmploymentType> = {
  tam_zamanli: 'full_time',
  yari_zamanli: 'part_time',
  vardiyali: 'shift',
  bilinmiyor: 'unknown',
}

const ERROR_REASONS = {
  erisim: 'access',
  yetki: 'permission',
  kota: 'rate_limit',
  bicim: 'format',
} as const

/** Discover boards without exposing the original Turkish internal field names. */
export function discoverJobBoards(html: string): JobBoard[] {
  return panolariBul(html).map(({ saglayici, kod, url }) => ({
    provider: saglayici,
    code: kod,
    url,
  }))
}

/** Convert a result from the original API to the English public shape. */
export function toJobPosting(posting: Posting): JobPosting {
  return {
    provider: posting.kaynak,
    providerPostingId: posting.kaynakKimligi,
    title: posting.baslik,
    employer: posting.isveren,
    companyDomain: posting.sirketAlanAdi,
    locations: posting.konumlar.map((location) => ({
      city: location.sehir,
      postalCode: location.posta_kodu,
      country: location.ulke,
      latitude: location.enlem,
      longitude: location.boylam,
    })),
    occupation: posting.meslekAdi,
    description: posting.metin,
    employmentType: EMPLOYMENT_TYPES[posting.calismaSuresi],
    publishedDate: posting.yayinTarihi,
    url: posting.ilanUrl,
    annualGrossEur: posting.yillikBrutEur,
  }
}

/**
 * Read one board through the English API. The original `readBoard` export stays
 * available unchanged for existing users.
 */
export async function readJobBoard(
  provider: Provider,
  code: string,
  options: JobBoardReadOptions = {},
): Promise<JobBoardReadResult> {
  const result = await panoOku(provider, code, {
    isveren: options.employer,
    alanAdi: options.companyDomain,
  })

  if (result.durum === 'tamam') {
    return {
      ok: true,
      postings: result.ilanlar.map(toJobPosting),
      ...(result.toplam === undefined ? {} : { total: result.toplam }),
    }
  }

  return {
    ok: false,
    reason: ERROR_REASONS[result.sebep],
    message: result.mesaj,
  }
}
