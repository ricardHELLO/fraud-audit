import { createServerClient } from './supabase'

// --- Types ---

export interface CreditTransaction {
  id: string
  user_id: string
  amount: number
  reason: string
  reference_id: string | null
  created_at: string
}

// --- Constants ---

export const CREDIT_COSTS = {
  analysis: -1,
} as const

export const CREDIT_REWARDS = {
  signup_bonus: 1,
  feedback: 1,
  referral: 2,
  referred_bonus: 1,
  first_share_view: 1,
  bug_report: 1,
  second_source: 1,
  first_update: 1,
} as const

export const REWARD_LIMITS = {
  max_referral_credits: 10,
  max_bug_report_credits: 3,
  feedback_per_report: 1,
  share_bonus_per_report: 1,
} as const

// --- Functions ---

/**
 * Get the current credit balance for a user.
 */
export async function getBalance(userId: string): Promise<number> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('users')
    .select('credits_balance')
    .eq('id', userId)
    .single()

  if (error) {
    throw new Error(`Failed to get balance for user ${userId}: ${error.message}`)
  }

  return data?.credits_balance ?? 0
}

/**
 * Deduct a credit from the user's balance.
 * Returns false if the user has insufficient credits.
 */
export async function deductCredit(
  userId: string,
  reason: string,
  referenceId?: string
): Promise<boolean> {
  const supabase = createServerClient()

  // Check current balance
  const balance = await getBalance(userId)
  if (balance < 1) {
    return false
  }

  // Insert negative transaction
  const { error: txError } = await supabase
    .from('credit_transactions')
    .insert({
      user_id: userId,
      amount: CREDIT_COSTS.analysis,
      reason,
      reference_id: referenceId ?? null,
    })

  if (txError) {
    throw new Error(`Failed to insert deduction transaction: ${txError.message}`)
  }

  // Update user balance
  const { error: updateError } = await supabase
    .from('users')
    .update({ credits_balance: balance + CREDIT_COSTS.analysis })
    .eq('id', userId)

  if (updateError) {
    throw new Error(`Failed to update user balance: ${updateError.message}`)
  }

  return true
}

/**
 * Award credits to a user for a specific reward type.
 * Returns false if the user has exceeded the limit for this reward type.
 */
export async function awardCredit(
  userId: string,
  reason: keyof typeof CREDIT_REWARDS,
  referenceId?: string
): Promise<boolean> {
  const supabase = createServerClient()

  // Check if user can still earn this reward
  const canEarn = await canEarnReward(userId, reason)
  if (!canEarn) {
    return false
  }

  const amount = CREDIT_REWARDS[reason]

  // Insert positive transaction
  const { error: txError } = await supabase
    .from('credit_transactions')
    .insert({
      user_id: userId,
      amount,
      reason,
      reference_id: referenceId ?? null,
    })

  if (txError) {
    throw new Error(`Failed to insert reward transaction: ${txError.message}`)
  }

  // Update user balance
  const balance = await getBalance(userId)
  const { error: updateError } = await supabase
    .from('users')
    .update({ credits_balance: balance + amount })
    .eq('id', userId)

  if (updateError) {
    throw new Error(`Failed to update user balance: ${updateError.message}`)
  }

  return true
}

/**
 * Get the full transaction history for a user, ordered by most recent first.
 */
export async function getTransactionHistory(
  userId: string
): Promise<CreditTransaction[]> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to get transaction history: ${error.message}`)
  }

  return (data as CreditTransaction[]) ?? []
}

/**
 * Check whether a user can still earn a specific reward type
 * based on anti-abuse limits.
 */
export async function canEarnReward(
  userId: string,
  rewardType: keyof typeof CREDIT_REWARDS
): Promise<boolean> {
  const supabase = createServerClient()

  // Query existing transactions of this reward type
  const { data: existing, error } = await supabase
    .from('credit_transactions')
    .select('id, reference_id')
    .eq('user_id', userId)
    .eq('reason', rewardType)

  if (error) {
    throw new Error(`Failed to check reward eligibility: ${error.message}`)
  }

  const count = existing?.length ?? 0

  switch (rewardType) {
    case 'signup_bonus':
      // Only one signup bonus ever
      return count === 0

    case 'referral':
      // Max total referral credits = max_referral_credits / reward_per_referral
      return count < REWARD_LIMITS.max_referral_credits / CREDIT_REWARDS.referral

    case 'referred_bonus':
      // Only one referred bonus ever
      return count === 0

    case 'bug_report':
      // Max bug report credits
      return count < REWARD_LIMITS.max_bug_report_credits

    case 'feedback':
      // One feedback reward per unique report (reference_id)
      // If no referenceId provided, just check global count is reasonable
      return count < 100 // generous global cap

    case 'first_share_view':
      // One share-view bonus per report (reference_id)
      return count < 100 // generous global cap

    case 'second_source':
      // One per report
      return count < 100

    case 'first_update':
      // One per report
      return count < 100

    default:
      return false
  }
}
