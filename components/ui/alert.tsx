import React from 'react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Variant styles                                                     */
/* ------------------------------------------------------------------ */

const variantStyles = {
  info: {
    wrapper: 'border-blue-400 bg-blue-50',
    icon: 'text-blue-500',
    title: 'text-blue-800',
    description: 'text-blue-700',
  },
  warning: {
    wrapper: 'border-yellow-400 bg-yellow-50',
    icon: 'text-yellow-500',
    title: 'text-yellow-800',
    description: 'text-yellow-700',
  },
  danger: {
    wrapper: 'border-red-400 bg-red-50',
    icon: 'text-red-500',
    title: 'text-red-800',
    description: 'text-red-700',
  },
  success: {
    wrapper: 'border-green-400 bg-green-50',
    icon: 'text-green-500',
    title: 'text-green-800',
    description: 'text-green-700',
  },
} as const

type AlertVariant = keyof typeof variantStyles

/* ------------------------------------------------------------------ */
/*  Default icons per variant (inline SVGs)                            */
/* ------------------------------------------------------------------ */

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function DangerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  )
}

function SuccessIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

const defaultIcons: Record<AlertVariant, React.FC<{ className?: string }>> = {
  info: InfoIcon,
  warning: WarningIcon,
  danger: DangerIcon,
  success: SuccessIcon,
}

/* ------------------------------------------------------------------ */
/*  Alert component                                                    */
/* ------------------------------------------------------------------ */

export interface AlertProps {
  variant?: AlertVariant
  /** Override the default icon. Pass `null` to hide the icon. */
  icon?: React.ReactNode | null
  title?: string
  description?: string
  children?: React.ReactNode
  className?: string
}

function Alert({
  variant = 'info',
  icon,
  title,
  description,
  children,
  className,
}: AlertProps) {
  const styles = variantStyles[variant]

  const DefaultIcon = defaultIcons[variant]
  const renderedIcon =
    icon === null
      ? null
      : icon !== undefined
        ? icon
        : <DefaultIcon className={cn('mt-0.5 shrink-0', styles.icon)} />

  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg border-l-4 p-4',
        styles.wrapper,
        className
      )}
      role="alert"
    >
      {renderedIcon}

      <div className="min-w-0 flex-1">
        {title && (
          <p className={cn('text-sm font-semibold', styles.title)}>{title}</p>
        )}
        {description && (
          <p className={cn('mt-0.5 text-sm', styles.description)}>
            {description}
          </p>
        )}
        {children}
      </div>
    </div>
  )
}

export { Alert }
