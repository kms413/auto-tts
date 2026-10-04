/** Resolve speaking-tone display text, falling back to the raw key. */

import { zhCN, type MessageId } from './messages/zh-CN'
import type { Translate } from './t'

function resolve(id: string): MessageId | null {
  return id in zhCN ? (id as MessageId) : null
}

/** Localised label for a tone key; unknown keys fall back to the key itself. */
export function toneLabelText(t: Translate, key: string): string {
  const id = resolve(`tone.${key}`)
  return id ? t(id) : key
}

/** Localised hint for a tone key, or null when the tone is unknown. */
export function toneHintText(t: Translate, key: string): string | null {
  const id = resolve(`tone.${key}.hint`)
  return id ? t(id) : null
}