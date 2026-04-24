import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { Transaction } from '../db/transactions';

function csvCell(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  const date = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

function formatItems(transaction: Transaction): string {
  return transaction.items
    .map((i) => `${i.quantity} ${i.product_name}`)
    .join(', ');
}

function formatPaymentMethod(method: string, refNumber: string | null): string {
  const label = method === 'gcash' ? 'GCash' : method === 'bank_transfer' ? 'Bank Transfer' : 'Cash';
  return refNumber ? `${label} (${refNumber})` : label;
}

export async function exportTransactionsCsv(transactions: Transaction[], label: string): Promise<void> {
  const header = ['#', 'Time', 'Qty. & Items', 'Total Sales', 'Payment Method', 'Furbaby/IG Handle', 'Status'];

  const rows = transactions.map((t, index) => [
    csvCell(index + 1),
    csvCell(formatTime(t.created_at)),
    csvCell(formatItems(t)),
    csvCell(`₱${t.total.toFixed(2)}`),
    csvCell(formatPaymentMethod(t.payment_method, t.ref_number)),
    csvCell(t.customer_handle),
    csvCell(t.status === 'voided' ? 'VOIDED' : ''),
  ]);

  const csv = [header.map(csvCell), ...rows]
    .map((row) => row.join(','))
    .join('\n');

  const filename = `zoomy-sales-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
  const path = `${FileSystem.cacheDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export Transactions', UTI: 'public.comma-separated-values-text' });
}
