export type LanguageDirection = "ltr" | "rtl";

export interface GameLanguageDefinition {
  /** Canonical project identifier. BCP 47 unless `legacy` is true. */
  code: string;
  englishName: string;
  nativeName: string;
  direction: LanguageDirection;
  /** Steamworks API name where Steam exposes one for this language. */
  steamCode?: string;
  /** True for Reed's original Griko identifier, retained for existing projects. */
  legacy?: boolean;
}

/**
 * A curated, offline catalog for game projects. It includes Steam's platform
 * languages plus regional variants and additional locales commonly requested
 * by game-localization teams. The project can still use any valid BCP 47 tag.
 */
export const GAME_LANGUAGE_CATALOG: readonly GameLanguageDefinition[] = [
  { code: "ar", englishName: "Arabic", nativeName: "العربية", direction: "rtl", steamCode: "arabic" },
  { code: "bg", englishName: "Bulgarian", nativeName: "Български", direction: "ltr", steamCode: "bulgarian" },
  { code: "ca", englishName: "Catalan", nativeName: "Català", direction: "ltr" },
  { code: "zh-Hans", englishName: "Chinese (Simplified)", nativeName: "简体中文", direction: "ltr", steamCode: "schinese" },
  { code: "zh-Hant", englishName: "Chinese (Traditional)", nativeName: "繁體中文", direction: "ltr", steamCode: "tchinese" },
  { code: "hr", englishName: "Croatian", nativeName: "Hrvatski", direction: "ltr" },
  { code: "cs", englishName: "Czech", nativeName: "Čeština", direction: "ltr", steamCode: "czech" },
  { code: "da", englishName: "Danish", nativeName: "Dansk", direction: "ltr", steamCode: "danish" },
  { code: "nl", englishName: "Dutch", nativeName: "Nederlands", direction: "ltr", steamCode: "dutch" },
  { code: "en", englishName: "English", nativeName: "English", direction: "ltr", steamCode: "english" },
  { code: "en-AU", englishName: "English (Australia)", nativeName: "English (Australia)", direction: "ltr" },
  { code: "en-GB", englishName: "English (United Kingdom)", nativeName: "English (United Kingdom)", direction: "ltr" },
  { code: "en-US", englishName: "English (United States)", nativeName: "English (United States)", direction: "ltr" },
  { code: "fil", englishName: "Filipino", nativeName: "Filipino", direction: "ltr" },
  { code: "fi", englishName: "Finnish", nativeName: "Suomi", direction: "ltr", steamCode: "finnish" },
  { code: "fr", englishName: "French", nativeName: "Français", direction: "ltr", steamCode: "french" },
  { code: "fr-CA", englishName: "French (Canada)", nativeName: "Français (Canada)", direction: "ltr" },
  { code: "de", englishName: "German", nativeName: "Deutsch", direction: "ltr", steamCode: "german" },
  { code: "el", englishName: "Greek", nativeName: "Ελληνικά", direction: "ltr", steamCode: "greek" },
  { code: "he", englishName: "Hebrew", nativeName: "עברית", direction: "rtl" },
  { code: "hi", englishName: "Hindi", nativeName: "हिन्दी", direction: "ltr" },
  { code: "hu", englishName: "Hungarian", nativeName: "Magyar", direction: "ltr", steamCode: "hungarian" },
  { code: "id", englishName: "Indonesian", nativeName: "Bahasa Indonesia", direction: "ltr", steamCode: "indonesian" },
  { code: "it", englishName: "Italian", nativeName: "Italiano", direction: "ltr", steamCode: "italian" },
  { code: "ja", englishName: "Japanese", nativeName: "日本語", direction: "ltr", steamCode: "japanese" },
  { code: "ko", englishName: "Korean", nativeName: "한국어", direction: "ltr", steamCode: "koreana" },
  { code: "ms", englishName: "Malay", nativeName: "Bahasa Melayu", direction: "ltr", steamCode: "malay" },
  { code: "no", englishName: "Norwegian", nativeName: "Norsk", direction: "ltr", steamCode: "norwegian" },
  { code: "fa", englishName: "Persian", nativeName: "فارسی", direction: "rtl" },
  { code: "pl", englishName: "Polish", nativeName: "Polski", direction: "ltr", steamCode: "polish" },
  { code: "pt-PT", englishName: "Portuguese (Portugal)", nativeName: "Português (Portugal)", direction: "ltr", steamCode: "portuguese" },
  { code: "pt-BR", englishName: "Portuguese (Brazil)", nativeName: "Português (Brasil)", direction: "ltr", steamCode: "brazilian" },
  { code: "ro", englishName: "Romanian", nativeName: "Română", direction: "ltr", steamCode: "romanian" },
  { code: "ru", englishName: "Russian", nativeName: "Русский", direction: "ltr", steamCode: "russian" },
  { code: "sr-Cyrl", englishName: "Serbian (Cyrillic)", nativeName: "Српски", direction: "ltr" },
  { code: "sr-Latn", englishName: "Serbian (Latin)", nativeName: "Srpski", direction: "ltr" },
  { code: "sk", englishName: "Slovak", nativeName: "Slovenčina", direction: "ltr" },
  { code: "sl", englishName: "Slovenian", nativeName: "Slovenščina", direction: "ltr" },
  { code: "es-ES", englishName: "Spanish (Spain)", nativeName: "Español (España)", direction: "ltr", steamCode: "spanish" },
  { code: "es-419", englishName: "Spanish (Latin America)", nativeName: "Español (Latinoamérica)", direction: "ltr", steamCode: "latam" },
  { code: "sv", englishName: "Swedish", nativeName: "Svenska", direction: "ltr", steamCode: "swedish" },
  { code: "th", englishName: "Thai", nativeName: "ไทย", direction: "ltr", steamCode: "thai" },
  { code: "tr", englishName: "Turkish", nativeName: "Türkçe", direction: "ltr", steamCode: "turkish" },
  { code: "uk", englishName: "Ukrainian", nativeName: "Українська", direction: "ltr", steamCode: "ukrainian" },
  { code: "vi", englishName: "Vietnamese", nativeName: "Tiếng Việt", direction: "ltr", steamCode: "vietnamese" },
  { code: "griko", englishName: "Griko", nativeName: "Griko", direction: "ltr", legacy: true },
  { code: "x-griko", englishName: "Griko (private-use tag)", nativeName: "Griko", direction: "ltr" },
] as const;

const gameLanguagePreset: string[] = [];
for (const language of GAME_LANGUAGE_CATALOG) {
  if (language.steamCode) gameLanguagePreset.push(language.code);
}

/** Languages exposed by Steam as supported game languages, in catalog order. */
export const GAME_LANGUAGE_PRESET: readonly string[] = gameLanguagePreset;

const catalogByCode = new Map(GAME_LANGUAGE_CATALOG.map((language) => [language.code.toLowerCase(), language]));

// RFC 5646-compatible structural validation. Registry membership is not
// required so private-use and studio-specific registered subtags remain usable.
const LANGUAGE_TAG_PATTERN = /^(?:(?:[A-Za-z]{2,3}(?:-[A-Za-z]{3}){0,3}|[A-Za-z]{5,8})(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?(?:-[A-Za-z0-9]{5,8}|-[0-9][A-Za-z0-9]{3})*(?:-[0-9A-WY-Za-wy-z](?:-[A-Za-z0-9]{2,8})+)*(?:-x(?:-[A-Za-z0-9]{1,8})+)?|x(?:-[A-Za-z0-9]{1,8})+)$/;

export function isLanguageCode(value: string): boolean {
  return value.length <= 63 && LANGUAGE_TAG_PATTERN.test(value);
}

export function canonicalizeLanguageCode(value: string): string {
  const normalized = value.trim().replaceAll("_", "-");
  if (!isLanguageCode(normalized)) return normalized;
  if (normalized.toLowerCase() === "griko") return "griko";
  try {
    return Intl.getCanonicalLocales(normalized)[0] ?? normalized;
  } catch {
    const [language = "", ...subtags] = normalized.split("-");
    return [language.toLowerCase(), ...subtags.map((subtag) => {
      if (/^[A-Za-z]{4}$/.test(subtag)) return `${subtag[0]?.toUpperCase() ?? ""}${subtag.slice(1).toLowerCase()}`;
      if (/^[A-Za-z]{2}$/.test(subtag) || /^[0-9]{3}$/.test(subtag)) return subtag.toUpperCase();
      return subtag.toLowerCase();
    })].join("-");
  }
}

export function getLanguageDefinition(code: string): GameLanguageDefinition | undefined {
  return catalogByCode.get(canonicalizeLanguageCode(code).toLowerCase());
}

export function languageDisplayName(code: string): string {
  return getLanguageDefinition(code)?.englishName ?? code;
}

export function languageNativeName(code: string): string {
  return getLanguageDefinition(code)?.nativeName ?? code;
}

export function languageDirection(code: string): LanguageDirection {
  return getLanguageDefinition(code)?.direction ?? "ltr";
}

export function localeForGodot(code: string): string {
  const canonical = canonicalizeLanguageCode(code);
  if (canonical === "zh-Hans") return "zh_CN";
  if (canonical === "zh-Hant") return "zh_TW";
  return canonical.replaceAll("-", "_");
}

export function localeForUnity(code: string): string {
  const canonical = canonicalizeLanguageCode(code);
  if (canonical === "griko") return "x-griko";
  return canonical;
}

export function localeForUnreal(code: string): string {
  const canonical = canonicalizeLanguageCode(code);
  if (canonical === "zh-Hans") return "zh-Hans";
  if (canonical === "zh-Hant") return "zh-Hant";
  if (canonical === "griko") return "x-griko";
  return canonical;
}
