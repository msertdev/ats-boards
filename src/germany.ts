/** Lower-case + Turkish/German diacritics folded, for tolerant matching. */
export function sadelestir(metin: string): string {
  return metin
    .toLocaleLowerCase('tr')
    .replaceAll('ı', 'i')
    .replaceAll('ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('ş', 's')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c')
    .replaceAll('ä', 'a')
    .replaceAll('ß', 'ss')
    .trim()
}

/**
 * Yer adından Almanya'yı tanıma — ATS panolarının ortak yardımcısı.
 *
 * Greenhouse, Ashby ve Lever'ın bir kısmı ülke kodu vermiyor, "Berlin, Germany"
 * ya da "München" gibi düz metin veriyor. Ülke kodu veren sağlayıcılarda
 * (SmartRecruiters, Recruitee, Teamtailor, JOIN, Workable) bu fonksiyon
 * yalnızca yedek: kod 'DE' ise zaten kabul ediliyor.
 *
 * Liste bilerek kısa ve büyük şehirlerle sınırlı: "Essen", "Halle" gibi
 * İngilizce/Almanca sözcüklerle çakışan adlar yanlış pozitif üretir, o yüzden
 * burada değil. Kaçırılan küçük şehir, yanlış ülkeden ilandan daha ucuz.
 *
 * Karşılaştırma `sadelestir` ile: küçük harf + Türkçe aksan indirgeme.
 * Almanca umlaut'lar ayrıca hem özgün (münchen) hem çevriyazı (muenchen)
 * biçimiyle listede; `sadelestir` ü→u yaptığı için "münchen" de "munchen"
 * olarak eşleşir.
 */
const ALMANYA_IZLERI = [
  'germany',
  'deutschland',
  'berlin',
  'munich',
  'münchen',
  'muenchen',
  'hamburg',
  'frankfurt',
  'köln',
  'koeln',
  'cologne',
  'stuttgart',
  'düsseldorf',
  'duesseldorf',
  'leipzig',
  'dresden',
  'nürnberg',
  'nuernberg',
  'nuremberg',
  'hannover',
  'bremen',
  'karlsruhe',
  'heidelberg',
  'mannheim',
  'bonn',
  'münster',
  'muenster',
  'dortmund',
  'freiburg',
  'aachen',
  'walldorf',
].map(sadelestir)

export function almanyaMi(yer?: string | null): boolean {
  if (!yer) return false
  const s = sadelestir(yer)
  return ALMANYA_IZLERI.some((iz) => s.includes(iz))
}
