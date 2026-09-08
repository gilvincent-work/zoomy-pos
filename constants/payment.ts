import type { PaymentMethod } from '../db/transactions';

/**
 * The tap-to-record methods offered inline on the cart Pay control. These are
 * the fast, no-detail paths (no reference # or proof photo). Richer capture
 * (Maya / BPI, ref #, receipt photo) still lives in the full payment modal.
 */
export const QUICK_PAYMENT_METHODS: { key: PaymentMethod; label: string; emoji: string }[] = [
  { key: 'cash',  label: 'Cash',  emoji: '💵' },
  { key: 'gcash', label: 'GCash', emoji: '📱' },
  { key: 'maya',  label: 'Maya',  emoji: '📲' },
  { key: 'card',  label: 'Card',  emoji: '💳' },
];

/** Label + emoji for a method, falling back to Cash for anything not quick-listed. */
export function quickMethodMeta(method: PaymentMethod) {
  return QUICK_PAYMENT_METHODS.find((m) => m.key === method) ?? QUICK_PAYMENT_METHODS[0];
}
