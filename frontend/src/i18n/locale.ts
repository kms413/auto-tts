/** Supported locales, locale detection and persistence. */

export const LOCALES = ['zh-CN', 'en-US', 'zh-TW'] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'zh-CN'

/** Storage key for the visitor's explicit language choice. */
export const STORAGE_KEY = 'auto-tts.locale'

/** Map any BCP-47 tag onto one of the supported locales. */
export function normalizeLocale(raw?: string | null): Locale {
  if (!raw) return DEFAULT_LOCALE
  const tag = raw.replace('_', '-').toLowerCase()
  if (tag.startsWith('zh')) {
    // Traditional-script regions and script subtags resolve to zh-TW.
    if (
      tag.includes('hant') ||
      tag.includes('tw') ||
      tag.includes('hk') ||
      tag.includes('mo')
    ) {
      return 'zh-TW'
    }
    return 'zh-CN'
  }
  if (tag.startsWith('en')) return 'en-US'
  return DEFAULT_LOCALE
}

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}

/** Resolve the startup locale from storage first, then the browser language. */
export function detectLocale(): Locale {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored && isLocale(stored)) return stored
  return normalizeLocale(window.navigator.language)
}

/** Persist an explicit language choice. */
export function persistLocale(locale: Locale): void {
  window.localStorage.setItem(STORAGE_KEY, locale)
}