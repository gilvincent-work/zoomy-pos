import type { PaymentMethod } from '../db/transactions';

/**
 * The full set of tap-to-record methods the cart Pay control can offer. These
 * are the fast, no-detail paths (no reference # or proof photo). Richer capture
 * (ref #, receipt photo) still lives in the full payment modal. Which of these
 * actually show at checkout is configurable (Settings -> Payment Options,
 * db/settings.ts getEnabledPaymentMethods) — this is the fixed master order.
 */
export const QUICK_PAYMENT_METHODS: { key: PaymentMethod; label: string; emoji: string }[] = [
  { key: 'cash',  label: 'Cash',  emoji: '💵' },
  { key: 'qrph',  label: 'QRPH',  emoji: '🔳' },
  { key: 'gcash', label: 'GCash', emoji: '📱' },
  { key: 'maya',  label: 'Maya',  emoji: '📲' },
  { key: 'card',  label: 'Card',  emoji: '💳' },
];

/** The default enabled subset until Settings -> Payment Options is changed. */
export const DEFAULT_ENABLED_PAYMENT_METHODS: PaymentMethod[] = ['cash', 'qrph'];

/** Label + emoji for a method, falling back to Cash for anything not quick-listed. */
export function quickMethodMeta(method: PaymentMethod) {
  return QUICK_PAYMENT_METHODS.find((m) => m.key === method) ?? QUICK_PAYMENT_METHODS[0];
}
