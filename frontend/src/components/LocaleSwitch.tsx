import { LOCALES, type Locale } from '../i18n/locale'
import { useLocale } from '../i18n/locale-context'
import { useT } from '../i18n/t'

/** Endonyms: each option is written in its own language. */
const LABELS: Record<Locale, string> = {
  'zh-CN': '简体',
  'en-US': 'EN',
  'zh-TW': '繁體',
}

export default function LocaleSwitch() {
  const { locale, setLocale } = useLocale()
  const t = useT()

  return (
    <div className="switch switch--locale" role="group" aria-label={t('locale.switchLabel')}>
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          className={code === locale ? 'switch__btn is-on' : 'switch__btn'}
          aria-pressed={code === locale}
          onClick={() => setLocale(code)}
        >
          {LABELS[code]}
        </button>
      ))}
    </div>
  )
}