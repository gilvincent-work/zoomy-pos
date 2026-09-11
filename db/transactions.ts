import { getDatabase } from './database';

export type TransactionItem = {
  id: number;
  transaction_id: number;
  product_id: number | null;
  product_name: string;
  price: number;
  quantity: number;
  variant_id: number | null;
  variant_name: string | null;
};

export type PaymentMethod = 'cash' | 'qrph' | 'gcash' | 'card' | 'maya' | 'bpi' | 'bank_transfer';

export type Transaction = {
  id: number;
  total: number;
  cash_tendered: number;
  change: number;
  payment_method: PaymentMethod;
  ref_number: string | null;
  proof_photo_uri: string | null;
  customer_handle: string | null;
  is_bundle: boolean;
  status: 'completed' | 'voided';
  created_at: string;
  remarks: string | null;
  client_uuid: string | null;
  /** Set only once pushSale() confirms Coop has this sale; null = never confirmed synced. */
  synced_at: string | null;
  /** Null while a local void hasn't been confirmed on Coop; set once it has.
   *  Only meaningful when status === 'voided'. */
  void_synced_at: string | null;
  /** Null while a local remarks edit hasn't been confirmed on Coop; set once it
   *  has. Seeded to created_at for a sale with no remarks so it isn't "pending". */
  remarks_synced_at: string | null;
  items: TransactionItem[];
};

type InsertItem = {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
  variantId?: number;
  variantName?: string;
};

export async function insertTransaction(data: {
  total: number;
  cashTendered: number;
  change: number;
  paymentMethod: PaymentMethod;
  refNumber?: string;
  proofPhotoUri?: string;
  customerHandle?: string;
  isBundle?: boolean;
  remarks?: string;
  clientUuid?: string;
  items: InsertItem[];
}): Promise<number> {
  const db = await getDatabase();
  const createdAt = new Date().toISOString();
  const remarks = data.remarks ?? null;
  // remarks_synced_at seeds to created_at for a sale with no note (nothing to
  // push separately, so it isn't counted "pending"); a sale created *with* a
  // note is left null so the outbox drain pushes that note once the sale itself
  // lands on Coop (apply_pos_order doesn't carry remarks). void_synced_at stays
  // null by default — only meaningful once the sale is actually voided.
  const remarksSyncedAt = remarks ? null : createdAt;

  // Plain sequential inserts (unchanged happy path). The outbox drain never
  // reads an in-flight sale because getPendingSyncTransactions ignores rows
  // younger than DRAIN_MIN_AGE_MS — a transaction wrap wouldn't help anyway,
  // since a concurrent read on this shared expo-sqlite connection sees the
  // transaction's own uncommitted rows.
  const result = await db.runAsync(
    'INSERT INTO transactions (total, cash_tendered, change, payment_method, ref_number, proof_photo_uri, customer_handle, is_bundle, status, created_at, remarks, client_uuid, remarks_synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [data.total, data.cashTendered, data.change, data.paymentMethod, data.refNumber ?? null, data.proofPhotoUri ?? null, data.customerHandle ?? null, data.isBundle ? 1 : 0, 'completed', createdAt, remarks, data.clientUuid ?? null, remarksSyncedAt]
  );
  const transactionId = result.lastInsertRowId;

  for (const item of data.items) {
    await db.runAsync(
      'INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity, variant_id, variant_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [transactionId, item.productId, item.productName, item.price, item.quantity, item.variantId ?? null, item.variantName ?? null]
    );
  }

  return transactionId;
}

export async function importTransaction(data: {
  total: number;
  cashTendered: number;
  change: number;
  paymentMethod: PaymentMethod;
  refNumber?: string;
  proofPhotoUri?: string;
  customerHandle?: string;
  isBundle?: boolean;
  status: 'completed' | 'voided';
  createdAt: string;
  items: { productName: string; quantity: number; variantName?: string | null; price?: number }[];
}): Promise<number> {
  const db = await getDatabase();

  // Imported rows have no client_uuid, so the outbox never touches them; seed
  // remarks_synced_at to created_at anyway so they read as "nothing pending".
  const result = await db.runAsync(
    'INSERT INTO transactions (total, cash_tendered, change, payment_method, ref_number, proof_photo_uri, customer_handle, is_bundle, status, created_at, remarks, remarks_synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [data.total, data.cashTendered, data.change, data.paymentMethod, data.refNumber ?? null, data.proofPhotoUri ?? null, data.customerHandle ?? null, data.isBundle ? 1 : 0, data.status, data.createdAt, null, data.createdAt]
  );

  const transactionId = result.lastInsertRowId;

  for (const item of data.items) {
    await db.runAsync(
      'INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity, variant_id, variant_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [transactionId, 0, item.productName, item.price ?? 0, item.quantity, null, item.variantName ?? null]
    );
  }

  return transactionId;
}

export async function transactionExists(createdAtMinute: string, total: number): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM transactions WHERE total = ? AND substr(created_at, 1, 16) = ?',
    [total, createdAtMinute]
  );
  return row !== null;
}

export async function updateTransactionRemarks(id: number, remarks: string | null): Promise<void> {
  const db = await getDatabase();
  // Null remarks_synced_at so the outbox re-pushes this note (or its clearing)
  // if the inline Coop write fails.
  await db.runAsync('UPDATE transactions SET remarks = ?, remarks_synced_at = NULL WHERE id = ?', [remarks, id]);
}

export async function voidTransaction(id: number): Promise<void> {
  const db = await getDatabase();
  // Null void_synced_at so the outbox re-pushes this void if the inline Coop
  // write fails (or if the sale itself hasn't reached Coop yet).
  await db.runAsync(
    "UPDATE transactions SET status = 'voided', void_synced_at = NULL WHERE id = ?",
    [id]
  );
}

/** Marks a sale as confirmed-synced once pushSale() succeeds. See the schema
 *  migration for why this exists: it's the sole gate for pruning a local row
 *  when Coop no longer has it. */
export async function markTransactionSynced(clientUuid: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE transactions SET synced_at = ? WHERE client_uuid = ?',
    [new Date().toISOString(), clientUuid]
  );
}

/** Marks a void confirmed on Coop (paired with voidTransaction / the drain). */
export async function markVoidSynced(clientUuid: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE transactions SET void_synced_at = ? WHERE client_uuid = ?',
    [new Date().toISOString(), clientUuid]
  );
}

/** Marks a remarks edit confirmed on Coop (paired with updateTransactionRemarks / the drain). */
export async function markRemarksSynced(clientUuid: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE transactions SET remarks_synced_at = ? WHERE client_uuid = ?',
    [new Date().toISOString(), clientUuid]
  );
}

/** Predicate for a transaction whose sale, void, or remarks still owe Coop a
 *  write. Only rows with a client_uuid can be pushed at all (imported rows have
 *  none), so they're excluded. Shared by the drain query and the pending count
 *  so the "N pending" marker and what actually drains never disagree. */
const PENDING_SYNC_PREDICATE =
  `t.client_uuid IS NOT NULL AND (
     t.synced_at IS NULL
     OR (t.status = 'voided' AND t.void_synced_at IS NULL)
     OR t.remarks_synced_at IS NULL
   )`;

/** Count of local transactions with any unsynced sale/void/remarks change.
 *  Drives the "N pending" marker. */
export async function getPendingSyncCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transactions t WHERE ${PENDING_SYNC_PREDICATE}`
  );
  return row?.n ?? 0;
}

/** Permanently removes local transactions (and their items) by client_uuid.
 *  Only ever called for rows already proven safe to prune — see
 *  utils/merge-transactions.ts transactionsToPrune(). */
export async function deleteTransactionsByClientUuids(clientUuids: string[]): Promise<void> {
  if (clientUuids.length === 0) return;
  const db = await getDatabase();
  // Chunk the IN-list so a large prune (a heavily-tested device can accumulate
  // many synced rows Coop no longer has) never exceeds SQLite's bound-parameter
  // limit and throws — which would otherwise abort the Transactions reload.
  const CHUNK = 200;
  for (let i = 0; i < clientUuids.length; i += CHUNK) {
    const batch = clientUuids.slice(i, i + CHUNK);
    const placeholders = batch.map(() => '?').join(',');
    await db.runAsync(
      `DELETE FROM transaction_items WHERE transaction_id IN (SELECT id FROM transactions WHERE client_uuid IN (${placeholders}))`,
      batch
    );
    await db.runAsync(`DELETE FROM transactions WHERE client_uuid IN (${placeholders})`, batch);
  }
}

type TxRow = {
  t_id: number;
  t_total: number;
  t_cash: number;
  t_change: number;
  t_payment: string;
  t_ref: string | null;
  t_proof: string | null;
  t_handle: string | null;
  t_bundle: number;
  t_status: string;
  t_created: string;
  t_remarks: string | null;
  t_client_uuid: string | null;
  t_synced_at: string | null;
  t_void_synced_at: string | null;
  t_remarks_synced_at: string | null;
  ti_id: number | null;
  transaction_id: number | null;
  product_id: number | null;
  product_name: string | null;
  price: number | null;
  quantity: number | null;
  variant_id: number | null;
  variant_name: string | null;
};

// Shared column list + joins for reading transactions with their items.
// Show the LIVE product / variant name (so a later rename — e.g. from a Coop
// catalog sync — is reflected in history), falling back to the at-sale name
// snapshot when the product/variant no longer exists. The sale AMOUNT stays
// the snapshot (ti.price) — a rename must never rewrite what was charged.
const TX_SELECT =
  `SELECT t.id AS t_id, t.total AS t_total, t.cash_tendered AS t_cash,
          t.change AS t_change, t.payment_method AS t_payment,
          t.ref_number AS t_ref, t.proof_photo_uri AS t_proof,
          t.customer_handle AS t_handle, t.is_bundle AS t_bundle,
          t.status AS t_status, t.created_at AS t_created, t.remarks AS t_remarks,
          t.client_uuid AS t_client_uuid, t.synced_at AS t_synced_at,
          t.void_synced_at AS t_void_synced_at, t.remarks_synced_at AS t_remarks_synced_at,
          ti.id AS ti_id, ti.transaction_id, ti.product_id,
          COALESCE(p.name, ti.product_name) AS product_name,
          ti.price, ti.quantity, ti.variant_id,
          COALESCE(pv.name, ti.variant_name) AS variant_name
   FROM transactions t
   LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
   LEFT JOIN products p ON p.id = ti.product_id
   LEFT JOIN product_variants pv ON pv.id = ti.variant_id`;

/** Group flat join rows (one per item) into Transaction objects, preserving
 *  the row order the query returned them in. */
function mapTxRows(rows: TxRow[]): Transaction[] {
  const map = new Map<number, Transaction>();
  for (const row of rows) {
    if (!map.has(row.t_id)) {
      map.set(row.t_id, {
        id: row.t_id,
        total: row.t_total,
        cash_tendered: row.t_cash,
        change: row.t_change,
        payment_method: (row.t_payment || 'cash') as PaymentMethod,
        ref_number: row.t_ref ?? null,
        proof_photo_uri: row.t_proof ?? null,
        customer_handle: row.t_handle ?? null,
        is_bundle: row.t_bundle === 1,
        status: row.t_status as 'completed' | 'voided',
        created_at: row.t_created,
        remarks: row.t_remarks ?? null,
        client_uuid: row.t_client_uuid ?? null,
        synced_at: row.t_synced_at ?? null,
        void_synced_at: row.t_void_synced_at ?? null,
        remarks_synced_at: row.t_remarks_synced_at ?? null,
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
        variant_id: row.variant_id ?? null,
        variant_name: row.variant_name ?? null,
      });
    }
  }
  return Array.from(map.values());
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TxRow>(`${TX_SELECT} ORDER BY t.created_at DESC`);
  return mapTxRows(rows);
}

/** A pending row must be at least this old before the drain will push it, so a
 *  brand-new sale still mid-write (row inserted, its items not all inserted yet)
 *  is never read and pushed partially. The sale's own inline push already covers
 *  t=0; the drain is only the retry for ones that failed, so a few seconds' delay
 *  is invisible. Reads on the shared expo-sqlite connection see uncommitted rows,
 *  so this age gate — not a transaction wrap — is what guarantees a complete read. */
const DRAIN_MIN_AGE_MS = 5_000;

/** Transactions (with items) that still owe Coop a sale/void/remarks write and
 *  have settled (older than DRAIN_MIN_AGE_MS), oldest first — the outbox drains
 *  them in order so a sale always reaches Coop before its own later void/remarks. */
export async function getPendingSyncTransactions(): Promise<Transaction[]> {
  const db = await getDatabase();
  const cutoff = new Date(Date.now() - DRAIN_MIN_AGE_MS).toISOString();
  const rows = await db.getAllAsync<TxRow>(
    `${TX_SELECT} WHERE ${PENDING_SYNC_PREDICATE} AND t.created_at <= ? ORDER BY t.created_at ASC`,
    [cutoff]
  );
  return mapTxRows(rows);
}
