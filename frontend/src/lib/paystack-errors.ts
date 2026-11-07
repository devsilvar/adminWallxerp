/**
 * Paystack error → user-facing UI message mapping.
 *
 * The backend `AppError` carries `details.paystackCode` and `details.type`
 * on every `PAYSTACK_ERROR` response (see
 * backend/src/lib/payment/paystack.provider.ts → request()). Without this
 * map every Paystack failure renders as a raw toast like
 * "Customer not found" — accurate but useless for a non-technical SME.
 *
 * Each mapping is keyed on the canonical Paystack `code` field
 * (snake_case). Mappings return one of three intents:
 *
 *   silent  — don't show the user anything; service self-heals
 *             (e.g. `customer_not_found` is auto-recovered by
 *             dva.service.ts:137 — the user should never see it).
 *   inline  — render where the action originated (form-field error,
 *             card-level banner). Caller decides placement.
 *   toast   — surface as a top-right react-hot-toast.
 *
 * The default fallthrough is `toast` with the upstream message — safest
 * default since unmapped codes are by definition new ones we haven't
 * categorised yet.
 *
 * NOTE: This file knows nothing about React or react-hot-toast directly.
 * It returns a structured `MappedError` that callers wire to whichever
 * surface they prefer. Keeps the module trivial to test and reuse.
 */

export type ErrorIntent = 'silent' | 'inline' | 'toast';

export interface MappedError {
  intent: ErrorIntent;
  title: string;
  body: string;
  /** Optional CTA — e.g. "Activate your Paystack account" linking out. */
  action?: { label: string; href?: string };
  /** Original code for telemetry / tests. */
  paystackCode?: string;
}

/**
 * The shape of an Axios error from our backend's AppError. Loosely typed
 * so callers can pass `err.response` or the unwrapped object — we read
 * defensively.
 */
export interface BackendErrorLike {
  response?: {
    data?: {
      error?: {
        code?: string;
        message?: string;
        details?: { paystackCode?: string; type?: string; [k: string]: unknown };
      };
    };
  };
  message?: string;
}

interface MappingRule {
  intent: ErrorIntent;
  title: string;
  body: string;
  action?: { label: string; href?: string };
}

/**
 * Canonical mappings. Keep keys lowercase + snake_case (Paystack's
 * convention). Add new codes here as we encounter them in prod.
 */
const RULES: Record<string, MappingRule> = {
  // Self-heal path in dva.service.ts:137. Should never bubble to the UI;
  // if it does the silent intent prevents a confusing flash.
  customer_not_found: {
    intent: 'silent',
    title: 'Reconnecting your account',
    body: 'We re-linked your Paystack record automatically. Please retry.',
  },

  // Paystack merchant has not finished KYC / business verification.
  // Actionable only by the operator (us), not the SME — point them at us.
  disabled_merchant: {
    intent: 'inline',
    title: 'Your Paystack account needs activation',
    body:
      'Paystack has not finished activating the business account behind ' +
      'WallXERP. Email support@paymytax.ng so we can complete the KYC ' +
      'checks — your tax records are unaffected.',
  },

  // SME needs to validate BVN + bank-account before DVA creation.
  // Frontend renders the BVN form when it sees this.
  validation_required: {
    intent: 'inline',
    title: 'Identity verification needed',
    body:
      'Paystack requires your BVN and a bank account in your name before ' +
      'issuing a virtual account.',
  },

  // Payment lookup miss — usually a stale reference the user reloaded.
  transaction_not_found: {
    intent: 'toast',
    title: "Payment not found",
    body:
      "We couldn't find this payment on Paystack. If you just paid, give " +
      'it 30 seconds and try the Verify button again.',
  },

  // Payment failed at the gateway. Body comes from the upstream gateway
  // message so we don't second-guess it — callers should pass the
  // upstream message through if available.
  transaction_failed: {
    intent: 'toast',
    title: 'Payment failed',
    body:
      'Paystack rejected the payment. Try a different card, or use the ' +
      'virtual account number on the Account page.',
  },

  // Customer's bank declined the card.
  insufficient_funds: {
    intent: 'toast',
    title: 'Card declined',
    body:
      "Your customer's bank declined the card (insufficient funds). Ask " +
      'them to use a different card or pay via transfer.',
  },

  // Paystack queue backlog or processor blip. Almost always transient.
  unprocessed_transaction: {
    intent: 'toast',
    title: 'Payment still processing',
    body:
      'Paystack is busy. Retry in a minute — if the payment did go ' +
      'through, the Verify button will pick it up.',
  },

  // BVN validation errors
  invalid_bvn: {
    intent: 'inline',
    title: 'Invalid BVN',
    body:
      'The BVN you entered is not valid. Please check and try again.',
  },

  bvn_mismatch: {
    intent: 'inline',
    title: 'BVN mismatch',
    body:
      'The BVN does not match the account details you provided. Ensure the account number is registered to the same BVN.',
  },

  invalid_account_number: {
    intent: 'inline',
    title: 'Invalid account number',
    body:
      'The account number you entered could not be verified with your bank. Please check and try again.',
  },

  customer_identification_failed: {
    intent: 'inline',
    title: 'Verification failed',
    body:
      'Paystack could not verify your identity. Ensure your BVN and bank account details are correct and match.',
  },
};

/**
 * Map a backend error (Axios error or unwrapped envelope) to a
 * UI-renderable `MappedError`.
 *
 * Returns a sensible default for non-Paystack errors so callers can
 * always render *something* — the caller decides whether to display
 * `silent` results.
 */
export function mapPaystackError(err: BackendErrorLike): MappedError {
  const envelope = err.response?.data?.error;
  const paystackCode = envelope?.details?.paystackCode;
  const message = envelope?.message || err.message || 'Something went wrong';

  if (paystackCode && RULES[paystackCode]) {
    const rule = RULES[paystackCode];
    return { ...rule, paystackCode };
  }

  // Non-Paystack-coded but still a Paystack-wrapped error — preserve the
  // upstream message so the user sees actionable text.
  if (envelope?.code === 'PAYSTACK_ERROR') {
    return {
      intent: 'toast',
      title: 'Payment provider error',
      body: message,
      paystackCode,
    };
  }

  // Generic fallthrough.
  return {
    intent: 'toast',
    title: 'Something went wrong',
    body: message,
  };
}
