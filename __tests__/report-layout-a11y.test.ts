import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * B9 (AUDIT-001) — WAI-ARIA tablist keyboard navigation is a required
 * a11y contract. A regression that removes the keyboard handler leaves
 * screen-reader and keyboard-only users stranded: the roving tabIndex
 * pattern explicitly sets non-active tabs to tabIndex=-1, so without
 * arrow-key handling, non-active tabs become unreachable.
 *
 * We parse the source via readFileSync (same pattern as BIZ-04 and the
 * pseudonymize tests) because testing React keyboard events would require
 * adding @testing-library/react to devDependencies just for one test — not
 * worth the build-time and lockfile churn for a contract that's easier to
 * verify by source inspection.
 *
 * The manual browser test lives in e2e/a11y-tablist.spec.ts (PR #11 harness).
 */
describe('B9: ReportLayout tablist keyboard navigation', () => {
  const source = readFileSync(
    join(process.cwd(), 'components', 'report', 'ReportLayout.tsx'),
    'utf8'
  )

  it('defines a handleTabKeyDown function', () => {
    expect(source).toMatch(/function\s+handleTabKeyDown/)
  })

  it('handles ArrowRight / ArrowLeft keys', () => {
    expect(source).toContain("'ArrowRight'")
    expect(source).toContain("'ArrowLeft'")
  })

  it('handles Home / End keys', () => {
    expect(source).toContain("'Home'")
    expect(source).toContain("'End'")
  })

  it('wires onKeyDown to the tab buttons with the current index', () => {
    expect(source).toMatch(/onKeyDown=\{\(event\) => handleTabKeyDown\(event, index\)\}/)
  })

  it('wraps index arithmetic so ArrowLeft at position 0 goes to the last tab', () => {
    // The classic JS `% n` bug: `-1 % 9 === -1`. The correct wrap is `(i - 1 + n) % n`.
    expect(source).toMatch(/\(currentIndex - 1 \+ TABS\.length\) % TABS\.length/)
  })

  it('moves focus to the newly-selected tab after state commit', () => {
    // requestAnimationFrame or similar deferral is required so React has
    // committed the tabIndex update before we .focus() the new tab.
    expect(source).toMatch(/requestAnimationFrame/)
    expect(source).toMatch(/getElementById\(`tab-\$\{nextTab\.key\}`\)/)
  })

  it('calls event.preventDefault() so the arrow keys do not scroll the page', () => {
    expect(source).toMatch(/event\.preventDefault\(\)/)
  })

  it('emits trackReportTabClicked for keyboard-driven tab changes too', () => {
    // Accessibility parity: keyboard users should be counted in the same
    // PostHog event as mouse users.
    const handlerSection = source.match(
      /function\s+handleTabKeyDown[\s\S]+?(?=\n\s{2}function\s+renderTab)/
    )
    expect(handlerSection).not.toBeNull()
    expect(handlerSection![0]).toContain('trackReportTabClicked')
  })
})
