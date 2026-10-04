/** Provides locale state, the react-intl provider and document-level metadata. */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { IntlProvider } from 'react-intl'

import { LocaleContext, useLocale } from './locale-context'
import { DEFAULT_LOCALE, detectLocale, persistLocale, type Locale } from './locale'
import { catalogs } from './messages'
import { useT } from './t'

/** Keeps <html lang> and the document title in sync with the active locale. */
function DocumentMeta() {
  const { locale } = useLocale()
  const t = useT()

  useEffect(() => {
    document.documentElement.lang = locale
    document.title = t('app.title')
  }, [locale, t])

  return null
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    persistLocale(next)
  }, [])

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <IntlProvider
        locale={locale}
        defaultLocale={DEFAULT_LOCALE}
        messages={catalogs[locale]}
        onError={(error) => {
          if (import.meta.env.DEV) {
            console.warn(`[i18n] ${error.code} (${locale}): ${error.message}`)
          }
        }}
      >
        <DocumentMeta />
        {children}
      </IntlProvider>
    </LocaleContext.Provider>
  )
}