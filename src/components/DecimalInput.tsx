'use client'

import { useEffect, useRef, useState } from 'react'
import { formatPriceInput, parsePriceInput } from '@/lib/price-input'

/**
 * A number field that accepts what a Spanish keyboard actually types.
 *
 * `type="number"` refuses a comma, and a comma is how a price is written here
 * («12,50»). On a phone it is worse: the numeric keypad has no comma on many
 * Android keyboards, so «12,50» becomes «1250» — a price a hundred times too
 * high. This field is plain text with a decimal keypad hint, and it reads what
 * was typed with `parsePriceInput`, the same reader the catalogue and the Excel
 * importer use, so all three understand «12,50» the same way.
 *
 * While the field has focus it keeps its own draft: typing "12," must not be
 * rewritten to "12" before the decimals arrive. Outside focus it follows `value`,
 * which is what makes the ± quantity buttons and picking a partida from the
 * catalogue update the field without fighting the caret.
 */
export default function DecimalInput({
  value,
  onValueChange,
  className = '',
  placeholder,
  title,
  ariaLabel,
  disabled,
}: {
  value: number | null | undefined
  /** Called only when there is a number to read: letters leave the previous price alone. */
  onValueChange: (value: number) => void
  className?: string
  placeholder?: string
  title?: string
  ariaLabel?: string
  disabled?: boolean
}) {
  const [draft, setDraft] = useState(() => formatPriceInput(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(formatPriceInput(value))
  }, [value])

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="done"
      value={draft}
      placeholder={placeholder}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onFocus={() => {
        focused.current = true
      }}
      onChange={(event) => {
        const raw = event.target.value
        setDraft(raw)
        const parsed = parsePriceInput(raw)
        if (parsed !== null) onValueChange(parsed)
        // Clearing the field means zero, not "keep the old number": the row has to
        // follow what is on screen, or the total would contradict the field.
        else if (raw.trim() === '') onValueChange(0)
      }}
      onBlur={() => {
        focused.current = false
        setDraft(formatPriceInput(value))
      }}
      className={className}
    />
  )
}
