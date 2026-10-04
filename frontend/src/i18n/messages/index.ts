/** Aggregates the message catalogues keyed by locale. */

import type { Locale } from '../locale'
import { enUS } from './en-US'
import { zhCN, type Catalog } from './zh-CN'
import { zhTW } from './zh-TW'

export const catalogs: Record<Locale, Catalog> = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'zh-TW': zhTW,
}

export { zhCN }
export type { Catalog, MessageId } from './zh-CN'