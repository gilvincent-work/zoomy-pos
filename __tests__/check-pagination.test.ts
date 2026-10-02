import {execFileSync} from 'node:child_process';
import path from 'node:path';

/**
 * Enforces the pagination guard as part of the jest suite: any new unbounded
 * supabase `.from().select()` (which PostgREST silently truncates at 1000 rows)
 * or a literal row limit > 1000 fails here, not just in CI. The scanner lives in
 * scripts/check-pagination.mjs so it can also run standalone via `npm run
 * check:pagination`.
 */
describe('pagination guard (db-max-rows truncation)', () => {
  it('reports zero unbounded supabase reads across utils/lib/app/functions', () => {
    const root = path.resolve(__dirname, '..');
    const script = path.join(root, 'scripts', 'check-pagination.mjs');
    let output = '';
    try {
      output = execFileSync(process.execPath, [script], {cwd: root, encoding: 'utf8'});
    } catch (e) {
      const err = e as {stdout?: string; stderr?: string};
      throw new Error(`check-pagination found violations:\n${err.stdout ?? ''}${err.stderr ?? ''}`);
    }
    expect(output).toContain('no unbounded supabase reads');
  });
});
