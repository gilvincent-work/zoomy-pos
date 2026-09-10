import type {Transaction} from '../db/transactions';

/**
 * Merge this device's local sales with the ones pulled from Coop into one list,
 * newest first. Local rows are the source of truth (they carry the rich detail:
 * cash tendered, proof, remarks, void status), so a remote row is dropped when
 * it is the same sale already held locally.
 *
 * Dedup key: the shared `client_uuid`. For legacy local sales saved before that
 * column existed (client_uuid null), fall back to same-minute + same-total,
 * which is how the CSV importer already detects duplicates.
 *
 * Remote-only survivors get a stable negative `id` so they render with unique
 * keys and the screen can tell them apart from local rows (which have real,
 * positive ids) to disable per-device actions like void or remarks.
 */
export function mergeTransactions(local: Transaction[], remote: Transaction[]): Transaction[] {
  const minuteTotalKey = (t: Transaction) => `${t.created_at.slice(0, 16)}|${Math.round(t.total)}`;

  const remoteByUuid = new Map<string, Transaction>();
  for (const r of remote) {
    if (r.client_uuid) remoteByUuid.set(r.client_uuid, r);
  }
  const localUuids = new Set<string>();
  const localMinuteTotals = new Set<string>();
  for (const t of local) {
    if (t.client_uuid) localUuids.add(t.client_uuid);
    localMinuteTotals.add(minuteTotalKey(t));
  }

  // Overlay Coop's cross-device fields onto a local row that also lives on Coop:
  // void is monotonic (voided on either side -> voided), and remarks are
  // Coop-authoritative (a remark edited on another device wins), falling back to
  // the local remark when Coop has none. The rich local fields (cash tendered,
  // proof) are untouched.
  const localMerged = local.map((t) => {
    const r = t.client_uuid ? remoteByUuid.get(t.client_uuid) : undefined;
    if (!r) return t;
    const status: Transaction['status'] = t.status === 'voided' || r.status === 'voided' ? 'voided' : t.status;
    return {...t, status, remarks: r.remarks ?? t.remarks};
  });

  const remoteOnly: Transaction[] = [];
  for (const r of remote) {
    if (r.client_uuid && localUuids.has(r.client_uuid)) continue;
    if (localMinuteTotals.has(minuteTotalKey(r))) continue;
    remoteOnly.push({...r, id: -(remoteOnly.length + 1)});
  }

  return [...localMerged, ...remoteOnly].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** A row is local (has real detail, supports void/remarks) when its id is positive. */
export function isLocalTransaction(t: Transaction): boolean {
  return t.id > 0;
}
