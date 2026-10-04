/** Locale context, split from the provider so component files stay HMR-friendly. */

import { createContext, useContext } from 'react'

import type { Locale } from './locale'

export interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const LocaleContext = createContext<LocaleContextValue | null>(null)

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext)
  if (value === null) {
    throw new Error('useLocale must be used within a LocaleProvider')
  }
  return value
}