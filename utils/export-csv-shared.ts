import type { Transaction } from '../db/transactions';

export const EXPORT_HEADER = [
  '#', 'Time', 'Item', 'Flavor', 'Qty', 'Item Total', 'Transaction Total',
  'Payment Method', 'Furbaby/IG Handle', 'Proof Photo', 'Status',
];

export function csvCell(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatTime(isoString: string): string {
  const d = new Date(isoString);
  const date = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

export function formatPaymentMethod(method: string, refNumber: string | null, isBundle: boolean): string {
  const label = method === 'gcash' ? 'GCash' : method === 'maya' ? 'Maya' : method === 'bpi' ? 'BPI' : method === 'bank_transfer' ? 'Bank Transfer' : 'Cash';
  const withRef = refNumber ? `${label} (${refNumber})` : label;
  return isBundle ? `${withRef} · Bundle` : withRef;
}

export function proofFileName(transactionId: number): string {
  return `proof_txn_${transactionId}.jpg`;
}

export function buildItemRows(transactions: Transaction[], photoFilenames: Map<number, string>): string[][] {
  const rows: string[][] = [];

  transactions.forEach((t, index) => {
    const txnNumber = String(index + 1);
    const photoFilename = photoFilenames.get(t.id) ?? '';
    const paymentLabel = formatPaymentMethod(t.payment_method, t.ref_number, t.is_bundle);
    const timeLabel = formatTime(t.created_at);
    const statusLabel = t.status === 'voided' ? 'VOIDED' : '';

    for (const item of t.items) {
      rows.push([
        csvCell(txnNumber),
        csvCell(timeLabel),
        csvCell(item.product_name),
        csvCell(item.variant_name ?? ''),
        csvCell(item.quantity),
        csvCell(`₱${(item.price * item.quantity).toFixed(2)}`),
        csvCell(`₱${t.total.toFixed(2)}`),
        csvCell(paymentLabel),
        csvCell(t.customer_handle),
        csvCell(photoFilename),
        csvCell(statusLabel),
      ]);
    }
  });

  return rows;
}
