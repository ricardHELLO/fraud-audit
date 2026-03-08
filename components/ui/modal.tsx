'use client'

import React, { useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Close icon                                                         */
/* ------------------------------------------------------------------ */

function CloseIcon({ className }: { className?: string }) {
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  Modal component                                                    */
/* ------------------------------------------------------------------ */

export interface ModalProps {
  /** Controls visibility. */
  open: boolean
  /** Called when the user clicks the backdrop or presses Escape. */
  onClose: () => void
  /** Optional heading rendered inside the modal. */
  title?: string
  /** Content rendered inside the modal body. */
  children: React.ReactNode
  /** Additional class names for the modal panel. */
  className?: string
}

function Modal({ open, onClose, title, children, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  /* Close on Escape ------------------------------------------------ */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    // Prevent body scroll while the modal is open
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prev
    }
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          'relative z-10 mx-4 w-full max-w-lg rounded-xl border border-stone-200 bg-white shadow-xl',
          'animate-in fade-in zoom-in-95 duration-200',
          className
        )}
      >
        {/* Header */}
        {(title !== undefined) && (
          <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
        )}

        {/* Close button when there is no title */}
        {title === undefined && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        )}

        {/* Body */}
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  )
}

export { Modal }
