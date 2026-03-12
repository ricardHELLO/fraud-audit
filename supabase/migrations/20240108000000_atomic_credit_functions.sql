-- ============================================================
-- Atomic credit operations — eliminates race conditions
-- ============================================================

-- Idempotency index: prevents duplicate credit transactions
-- for the same (reason, reference_id) pair (e.g., duplicate Stripe webhooks)
CREATE UNIQUE INDEX idx_credit_tx_idempotent
  ON credit_transactions (reason, reference_id)
  WHERE reference_id IS NOT NULL;

-- ============================================================
-- deduct_credits: Atomically deducts credits from a user
--
-- Returns: new balance on success, -1 if insufficient funds
-- ============================================================
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_reference_id TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  -- Atomic: only succeeds if balance >= amount
  UPDATE users
  SET credits_balance = credits_balance - p_amount
  WHERE id = p_user_id
    AND credits_balance >= p_amount
  RETURNING credits_balance INTO v_new_balance;

  -- No rows updated = insufficient funds
  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  -- Record the transaction
  INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
  VALUES (p_user_id, -p_amount, p_reason, p_reference_id);

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- award_credits: Atomically awards credits to a user
--
-- Returns: new balance on success
--          -1 if reference_id already processed (idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION award_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_reference_id TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  v_new_balance INTEGER;
  v_existing INTEGER;
BEGIN
  -- Idempotency check: if reference_id provided, ensure not already processed
  IF p_reference_id IS NOT NULL THEN
    SELECT 1 INTO v_existing
    FROM credit_transactions
    WHERE reason = p_reason
      AND reference_id = p_reference_id;

    IF FOUND THEN
      RETURN -1; -- Already processed
    END IF;
  END IF;

  -- Atomic balance update
  UPDATE users
  SET credits_balance = credits_balance + p_amount
  WHERE id = p_user_id
  RETURNING credits_balance INTO v_new_balance;

  -- User not found
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;

  -- Record the transaction
  INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
  VALUES (p_user_id, p_amount, p_reason, p_reference_id);

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;
