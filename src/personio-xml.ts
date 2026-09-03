import type { EmploymentType as CalismaSuresi } from './types.ts'

/**
 * Parser for the Personio XML feed. Pure module: no network.
 *
 *   GET https://{company}.jobs.personio.de/xml
 *
 * The feed is small and fixed in shape, so it is parsed by hand and only for
 * the fields we read. A general XML parser is not worth carrying for four tags.
 */

export type PersonioIlani = {
  id: string
  ad: string
  ofisler: string[]
  program?: string
  tarih?: string
  metin?: string
}

function etiket(blok: string, ad: string): string | undefined {
  const m = blok.match(new RegExp(`<${ad}>([\\s\\S]*?)</${ad}>`))
  return m ? coz(m[1] ?? '') : undefined
}

function coz(deger: string): string {
  return deger
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function xmlAyristir(xml: string): PersonioIlani[] {
  const bloklar = xml.match(/<position>[\s\S]*?<\/position>/g) ?? []
  const cikti: PersonioIlani[] = []
  for (const blok of bloklar) {
    const id = etiket(blok, 'id')
    const ad = etiket(blok, 'name')
    if (!id || !ad) continue
    const ofisler = [...blok.matchAll(/<office>([^<]+)<\/office>/g)].map((m) => coz(m[1] ?? ''))
    cikti.push({
      id,
      ad,
      ofisler,
      program: etiket(blok, 'schedule'),
      tarih: etiket(blok, 'createdAt')?.slice(0, 10),
      metin: etiket(blok, 'jobDescriptions'),
    })
  }
  return cikti
}

export function personioCalismaSuresi(program: string | undefined): CalismaSuresi {
  if (program === 'full-time') return 'tam_zamanli'
  if (program === 'part-time') return 'yari_zamanli'
  return 'bilinmiyor'
}
