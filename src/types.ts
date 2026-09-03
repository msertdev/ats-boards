/** Supported applicant-tracking providers. */
export type Provider =
  | 'personio'
  | 'join'
  | 'softgarden'
  | 'smartrecruiters'
  | 'recruitee'
  | 'teamtailor'
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workable'
  | 'workday'
  | 'oracle'

export type EmploymentType = 'tam_zamanli' | 'yari_zamanli' | 'vardiyali' | 'bilinmiyor'

export type Location = { sehir?: string; posta_kodu?: string; ulke: string; enlem?: number; boylam?: number }

/** One job posting in the common shape every reader returns. */
export type Posting = {
  /** Provider id, e.g. "greenhouse". */
  kaynak: string
  /** Stable id inside the provider: "{boardCode}:{jobId}". */
  kaynakKimligi: string
  baslik: string
  isveren?: string
  sirketAlanAdi?: string
  konumlar: Location[]
  meslekAdi?: string
  /** Full text (HTML stripped) when the provider returns it. */
  metin?: string
  calismaSuresi: EmploymentType
  /** ISO date (YYYY-MM-DD) when the provider gives one. */
  yayinTarihi?: string
  ilanUrl?: string
  yillikBrutEur?: number
}

export type ReadResult =
  | { durum: 'tamam'; ilanlar: Posting[]; toplam?: number }
  | { durum: 'hata'; sebep: 'erisim' | 'yetki' | 'kota' | 'bicim'; mesaj?: string }
