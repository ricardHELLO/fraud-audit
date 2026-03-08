'use client'

import React from 'react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TabItem {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

/* ------------------------------------------------------------------ */
/*  TabsList                                                           */
/* ------------------------------------------------------------------ */

export interface TabsListProps {
  tabs: TabItem[]
  activeTab: string
  onTabChange: (value: string) => void
  className?: string
}

function TabsList({ tabs, activeTab, onTabChange, className }: TabsListProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-lg bg-stone-100 p-1',
        className
      )}
      role="tablist"
    >
      {tabs.map((tab) => (
        <TabsTrigger
          key={tab.value}
          value={tab.value}
          active={activeTab === tab.value}
          disabled={tab.disabled}
          onClick={() => onTabChange(tab.value)}
        >
          {tab.label}
        </TabsTrigger>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  TabsTrigger                                                        */
/* ------------------------------------------------------------------ */

interface TabsTriggerProps {
  value: string
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}

function TabsTrigger({
  active,
  disabled,
  onClick,
  children,
  className,
}: TabsTriggerProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1',
        'disabled:pointer-events-none disabled:opacity-50',
        active
          ? 'bg-white text-stone-900 shadow-sm'
          : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50',
        className
      )}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  TabsContent                                                        */
/* ------------------------------------------------------------------ */

export interface TabsContentProps {
  value: string
  activeTab: string
  children: React.ReactNode
  className?: string
}

function TabsContent({
  value,
  activeTab,
  children,
  className,
}: TabsContentProps) {
  if (value !== activeTab) return null

  return (
    <div
      role="tabpanel"
      className={cn('mt-4 focus-visible:outline-none', className)}
    >
      {children}
    </div>
  )
}

export { TabsList, TabsTrigger, TabsContent }
