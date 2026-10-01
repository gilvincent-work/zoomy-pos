/**
 * PostgREST caps any single response at db-max-rows (~1000) regardless of the
 * requested range or a `.limit()`, so a one-shot `.select()` silently returns
 * only the first 1000 rows with no error. During a busy bazaar pos_order_items
 * and pos_products both crossed that line, and orders past the cut rendered with
 * an empty item list (blank rows). Page every unbounded remote read so we get all
 * rows regardless of table size. Each read must carry a stable, unique `.order(...)`
 * (the table PK) so paging is deterministic and a concurrent insert mid-pull lands
 * past the cursor and can't shift a row across a page boundary.
 */
const PAGE_SIZE = 1000;

/**
 * Read every row of a query in PAGE_SIZE pages until a short page ends it.
 * Returns {ok:false} on any page error so the caller can fall back to its local
 * copy rather than acting on a silently-truncated result. `makeQuery` must apply
 * `.range(from, to)` plus a stable unique `.order(...)` to the supabase query.
 */
export async function fetchAllPaged<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{data: T[] | null; error: unknown}>,
): Promise<{ok: true; rows: T[]} | {ok: false}> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const {data, error} = await makeQuery(from, from + PAGE_SIZE - 1);
    if (error || !data) return {ok: false};
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return {ok: true, rows};
}
