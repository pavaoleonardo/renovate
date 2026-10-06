"use client";

import { useEffect, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";

/**
 * A textarea that grows with its content — including when the text is filled in
 * by code (the AI proposal) and not only by typing. A plain `onInput` handler
 * does not fire when React changes the `value`, so a note written by the AI kept
 * its old one-line height and the paragraph was unreadable. The resize therefore
 * lives in an effect that observes `value`.
 */
export default function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  className,
  minRows = 3,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Minimum height, in text lines, before the content starts pushing it taller. */
  minRows?: number;
} & Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "rows" | "placeholder"
>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // Grows for programmatic fills too, not just keystrokes.
  useEffect(resize, [value]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      placeholder={placeholder}
      className={className}
      onChange={(e) => {
        onChange(e.target.value);
        resize();
      }}
      {...rest}
    />
  );
}
