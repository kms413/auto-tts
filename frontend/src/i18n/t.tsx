/** Typed wrappers around react-intl so message ids are checked at compile time. */

import { useCallback, type ComponentProps } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'

import type { MessageId } from './messages/zh-CN'

/** Values accepted by <FormattedMessage>, including rich-text tag renderers. */
export type MsgValues = ComponentProps<typeof FormattedMessage>['values']

/** Signature of the translator returned by `useT`. */
export type Translate = (id: MessageId, values?: Record<string, string | number>) => string

/** Returns a translator usable for attributes such as placeholder and aria-label. */
export function useT(): Translate {
  const intl = useIntl()
  return useCallback(
    (id: MessageId, values?: Record<string, string | number>) =>
      intl.formatMessage({ id }, values),
    [intl],
  )
}

/** Renders a message as a node, for messages that embed rich-text tags. */
export function Msg({ id, values }: { id: MessageId; values?: MsgValues }) {
  return <FormattedMessage id={id} values={values} />
}