'use client'

import Link from 'next/link'
import { trackLandingCTA } from '@/lib/posthog-events'

interface LandingCTALinkProps {
  href: string
  className?: string
  position: 'hero' | 'mid' | 'bottom'
  children: React.ReactNode
}

export function LandingCTALink({ href, className, position, children }: LandingCTALinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => trackLandingCTA(position)}
    >
      {children}
    </Link>
  )
}
