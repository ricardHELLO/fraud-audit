import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mock Supabase ---
const mockRpc = vi.fn()
const mockFrom = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockInsert = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => {
    const chain: Record<string, unknown> = {
      select: (...args: unknown[]) => { mockSelect(...args); return chain },
      eq: (...args: unknown[]) => { mockEq(...args); return chain },
      single: () => { mockSingle(); return Promise.resolve({ data: { credits_balance: 10 }, error: null }) },
      order: () => Promise.resolve({ data: [], error: null }),
      insert: (...args: unknown[]) => { mockInsert(...args); return Promise.resolve({ error: null }) },
    }
    return {
      rpc: mockRpc,
      from: () => chain,
    }
  },
}))

// Mock PostHog tracking (fire-and-forget, no assertions needed)
vi.mock('@/lib/posthog-server-events', () => ({
  serverTrackCreditEarned: vi.fn(),
  serverTrackCreditSpent: vi.fn(),
}))

describe('credits — deductCredit()', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns true and tracks when balance is sufficient', async () => {
    mockRpc.mockResolvedValueOnce({ data: 9, error: null })

    const { deductCredit } = await import('@/lib/credits')
    const result = await deductCredit('user-123', 'analysis', 'report-abc')

    expect(result).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('deduct_credits', {
      p_user_id: 'user-123',
      p_amount: 1,
      p_reason: 'analysis',
      p_reference_id: 'report-abc',
    })
  })

  it('returns false when PG function returns -1 (insufficient balance)', async () => {
    mockRpc.mockResolvedValueOnce({ data: -1, error: null })

    const { deductCredit } = await import('@/lib/credits')
    const result = await deductCredit('user-456', 'analysis')

    expect(result).toBe(false)
  })

  it('throws on database error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'DB down' } })

    const { deductCredit } = await import('@/lib/credits')
    await expect(deductCredit('user-789', 'analysis')).rejects.toThrow('Failed to deduct credit')
  })

  it('passes null reference_id when not provided', async () => {
    mockRpc.mockResolvedValueOnce({ data: 5, error: null })

    const { deductCredit } = await import('@/lib/credits')
    await deductCredit('user-123', 'analysis')

    expect(mockRpc).toHaveBeenCalledWith('deduct_credits', expect.objectContaining({
      p_reference_id: null,
    }))
  })
})

describe('credits — awardCredit()', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('CREDIT_REWARDS has expected reward types', async () => {
    const credits = await import('@/lib/credits')
    expect(credits.CREDIT_REWARDS.feedback).toBe(1)
    expect(credits.CREDIT_REWARDS.referral).toBe(2)
    expect(credits.CREDIT_REWARDS.signup_bonus).toBe(100)
  })

  it('returns false when PG function returns -1 (duplicate reference_id)', async () => {
    mockRpc.mockResolvedValueOnce({ data: -1, error: null })

    const { awardCreditsRaw } = await import('@/lib/credits')
    const result = await awardCreditsRaw('user-123', 5, 'purchase', 'cs_stripe_123')

    expect(result).toBe(-1)
  })

  it('returns -1 on unique constraint violation (code 23505)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate' } })

    const { awardCreditsRaw } = await import('@/lib/credits')
    const result = await awardCreditsRaw('user-123', 5, 'purchase', 'cs_stripe_123')

    expect(result).toBe(-1)
  })

  it('throws on non-duplicate database errors', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42P01', message: 'table not found' } })

    const { awardCreditsRaw } = await import('@/lib/credits')
    await expect(awardCreditsRaw('user-123', 5, 'purchase', 'cs_456'))
      .rejects.toThrow('Failed to award credits')
  })
})

describe('credits — constants', () => {
  it('CREDIT_COSTS.analysis is a positive integer', async () => {
    const { CREDIT_COSTS } = await import('@/lib/credits')
    expect(CREDIT_COSTS.analysis).toBe(1)
    expect(CREDIT_COSTS.analysis).toBeGreaterThan(0)
  })

  it('all CREDIT_REWARDS are positive', async () => {
    const { CREDIT_REWARDS } = await import('@/lib/credits')
    for (const [, value] of Object.entries(CREDIT_REWARDS)) {
      expect(value).toBeGreaterThan(0)
    }
  })

  it('signup_bonus is the largest reward', async () => {
    const { CREDIT_REWARDS } = await import('@/lib/credits')
    const maxNonSignup = Math.max(
      ...Object.entries(CREDIT_REWARDS)
        .filter(([key]) => key !== 'signup_bonus')
        .map(([, v]) => v)
    )
    expect(CREDIT_REWARDS.signup_bonus).toBeGreaterThan(maxNonSignup)
  })
})
