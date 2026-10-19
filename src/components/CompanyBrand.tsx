'use client'

import { useState } from 'react'
import { companyInitials, usableLogoUrl } from '@/lib/company-brand'

/**
 * The company's face: its logo, or a tile with the initials when there is no
 * logo or the file behind the URL has been deleted. It is a client component for
 * that second case only — a broken image can only be replaced after the browser
 * has already tried and failed, which the server never sees.
 */
export default function CompanyBrand({
  name,
  logoUrl,
  size = 'nav',
}: {
  name: string | null;
  logoUrl: string | null;
  size?: 'nav' | 'lg';
}) {
  const [failed, setFailed] = useState(false)
  const url = failed ? null : usableLogoUrl(logoUrl)
  const initials = companyInitials(name)

  const tile =
    size === 'lg'
      ? 'h-14 w-14 sm:h-16 sm:w-16 rounded-2xl p-2'
      : 'h-7 w-7 sm:h-8 sm:w-8 rounded-lg p-1'
  const letters = size === 'lg' ? 'text-xl' : 'text-[11px] sm:text-xs'

  return (
    <div
      className={`${tile} shrink-0 grid place-items-center overflow-hidden ${
        url ? 'bg-white ring-1 ring-zinc-200' : 'bg-blue-600'
      }`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name ? `Logo de ${name}` : 'Logo de la empresa'}
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
          loading="eager"
        />
      ) : (
        <span className={`${letters} font-extrabold tracking-tight text-white`} aria-hidden="true">
          {initials || '·'}
        </span>
      )}
    </div>
  )
}
