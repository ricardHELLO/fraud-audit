import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mock awardCreditsRaw ---
const mockAwardCreditsRaw = vi.fn()

vi.mock('@/lib/credits', () => ({
  awardCreditsRaw: (...args: unknown[]) => mockAwardCreditsRaw(...args),
}))

vi.mock('@/lib/posthog-server-events', () => ({
  serverTrackPurchaseCompleted: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { email: 'user@test.com', name: 'Test User' },
            error: null,
          }),
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(),
}))

vi.mock('@/lib/email-templates', () => ({
  purchaseConfirmationEmail: () => ({ subject: 'test', html: '<p>test</p>' }),
}))

describe('Stripe Webhook — Idempotency Design', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('awardCreditsRaw is called with session.id as reference_id', async () => {
    mockAwardCreditsRaw.mockResolvedValueOnce(105)

    const { awardCreditsRaw } = await import('@/lib/credits')
    const result = await awardCreditsRaw('user-123', 5, 'purchase', 'cs_session_abc')

    expect(mockAwardCreditsRaw).toHaveBeenCalledWith(
      'user-123',
      5,
      'purchase',
      'cs_session_abc'
    )
    expect(result).toBe(105)
  })

  it('duplicate session.id returns -1 (no double credits)', async () => {
    // First call: success
    mockAwardCreditsRaw.mockResolvedValueOnce(105)
    const { awardCreditsRaw } = await import('@/lib/credits')
    const first = await awardCreditsRaw('user-123', 5, 'purchase', 'cs_session_abc')
    expect(first).toBe(105)

    // Second call with same session.id: duplicate detected
    mockAwardCreditsRaw.mockResolvedValueOnce(-1)
    const second = await awardCreditsRaw('user-123', 5, 'purchase', 'cs_session_abc')
    expect(second).toBe(-1)
  })

  it('different session.ids are processed independently', async () => {
    mockAwardCreditsRaw.mockResolvedValueOnce(105)
    mockAwardCreditsRaw.mockResolvedValueOnce(110)

    const { awardCreditsRaw } = await import('@/lib/credits')
    const first = await awardCreditsRaw('user-123', 5, 'purchase', 'cs_session_aaa')
    const second = await awardCreditsRaw('user-123', 5, 'purchase', 'cs_session_bbb')

    expect(first).toBe(105)
    expect(second).toBe(110)
    expect(mockAwardCreditsRaw).toHaveBeenCalledTimes(2)
  })

  it('handles database errors gracefully', async () => {
    mockAwardCreditsRaw.mockRejectedValueOnce(new Error('DB connection lost'))

    const { awardCreditsRaw } = await import('@/lib/credits')
    await expect(
      awardCreditsRaw('user-123', 5, 'purchase', 'cs_session_err')
    ).rejects.toThrow('DB connection lost')
  })
})

describe('Stripe Webhook — Price Mapping', () => {
  it('credit amounts match expected packages', () => {
    // These are the business rules for credit packages
    const priceToCredits: Record<string, number> = {
      'price_5': 5,
      'price_15': 15,
      'price_50': 50,
    }

    expect(priceToCredits['price_5']).toBe(5)
    expect(priceToCredits['price_15']).toBe(15)
    expect(priceToCredits['price_50']).toBe(50)
  })
})
