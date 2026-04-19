import { getDatabase } from './database';

export type TransactionItem = {
  id: number;
  transaction_id: number;
  product_id: number | null;
  product_name: string;
  price: number;
  quantity: number;
};

export type PaymentMethod = 'cash' | 'gcash' | 'bank_transfer';

export type Transaction = {
  id: number;
  total: number;
  cash_tendered: number;
  change: number;
  payment_method: PaymentMethod;
  status: 'completed' | 'voided';
  created_at: string;
  items: TransactionItem[];
};

type InsertItem = {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
};

export async function insertTransaction(data: {
  total: number;
  cashTendered: number;
  change: number;
  paymentMethod: PaymentMethod;
  items: InsertItem[];
}): Promise<number> {
  const db = await getDatabase();

  const result = await db.runAsync(
    'INSERT INTO transactions (total, cash_tendered, change, payment_method, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [data.total, data.cashTendered, data.change, data.paymentMethod, 'completed', new Date().toISOString()]
  );

  const transactionId = result.lastInsertRowId;

  for (const item of data.items) {
    await db.runAsync(
      'INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)',
      [transactionId, item.productId, item.productName, item.price, item.quantity]
    );
  }

  return transactionId;
}

export async function voidTransaction(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE transactions SET status = 'voided' WHERE id = ?",
    [id]
  );
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await getDatabase();

  type Row = {
    t_id: number;
    t_total: number;
    t_cash: number;
    t_change: number;
    t_payment: string;
    t_status: string;
    t_created: string;
    ti_id: number | null;
    transaction_id: number | null;
    product_id: number | null;
    product_name: string | null;
    price: number | null;
    quantity: number | null;
  };

  const rows = await db.getAllAsync<Row>(
    `SELECT t.id AS t_id, t.total AS t_total, t.cash_tendered AS t_cash,
            t.change AS t_change, t.payment_method AS t_payment,
            t.status AS t_status, t.created_at AS t_created,
            ti.id AS ti_id, ti.transaction_id, ti.product_id, ti.product_name,
            ti.price, ti.quantity
     FROM transactions t
     LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
     ORDER BY t.created_at DESC`,
    undefined
  );

  const map = new Map<number, Transaction>();
  for (const row of rows) {
    if (!map.has(row.t_id)) {
      map.set(row.t_id, {
        id: row.t_id,
        total: row.t_total,
        cash_tendered: row.t_cash,
        change: row.t_change,
        payment_method: (row.t_payment || 'cash') as PaymentMethod,
        status: row.t_status as 'completed' | 'voided',
        created_at: row.t_created,
        items: [],
      });
    }
    if (row.ti_id) {
      map.get(row.t_id)!.items.push({
        id: row.ti_id,
        transaction_id: row.transaction_id!,
        product_id: row.product_id,
        product_name: row.product_name!,
        price: row.price!,
        quantity: row.quantity!,
      });
    }
  }

  return Array.from(map.values());
}
