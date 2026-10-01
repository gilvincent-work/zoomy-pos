#!/usr/bin/env node
// Regression guard against PostgREST's db-max-rows (1000) silent-truncation bug.
//
// Any Supabase `.select()` (top-level or embedded) silently caps at 1000 rows
// with NO error, so an unbounded read on a table that outgrows 1000 rows returns
// a truncated result that looks complete. This scanner FAILS (exit 1) on:
//
//   (A) any literal row limit > 1000 — `.limit(NNNN)` or `limit=NNNN` (NNNN>1000),
//       which can't lift the real 1000-row ceiling and gives a false sense of range.
//   (B) any supabase-js `.from('table').select(...)` statement with NO bound marker.
//       Markers: .range( | .limit( | .maybeSingle( | .single( | count: | head:
//       A paginated read carries `.range(` and so passes.
//
// Statements are formed by stripping comments, collapsing newlines, and splitting
// on `;`. A line ending with `// pagination-ok: <reason>` suppresses the statement
// it belongs to (use only for genuinely bounded or single-row/single-scope reads).
//
// Scans utils/**, lib/**, app/**, supabase/functions/** (skips node_modules, dist,
// .expo, coverage). Zero-dependency ESM; run via `node scripts/check-pagination.mjs`
// or `npm run check:pagination`. Local SQLite reads are unaffected and out of scope.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['utils', 'lib', 'app', 'supabase/functions'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.expo', 'coverage']);
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const BOUND_MARKERS = ['.range(', '.limit(', '.maybeSingle(', '.single(', 'count:', 'head:'];
const OK_RE = /\/\/\s*pagination-ok:\s*\S/; // trailing `// pagination-ok: <reason>` on a line

/** Collect every scannable source file under the target dirs. */
function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, {withFileTypes: true});
  } catch {
    return; // a target dir may not exist (e.g. no lib/) — skip quietly
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(full, out);
    } else if (e.isFile() && EXTS.has(path.extname(e.name))) {
      out.push(full);
    }
  }
}

/**
 * Blank out `//` line and block comments and string bodies (replaced with spaces,
 * newlines kept so line numbers still map). This keeps a `;` or `.select(` inside a
 * comment or string from forming or breaking a statement.
 */
function stripCommentsAndStrings(src) {
  let out = '';
  let state = 'code'; // code | line | block | sq | dq | tpl
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; out += '  '; i++; continue; }
      if (c === '/' && c2 === '*') { state = 'block'; out += '  '; i++; continue; }
      if (c === "'") { state = 'sq'; out += c; continue; }
      if (c === '"') { state = 'dq'; out += c; continue; }
      if (c === '`') { state = 'tpl'; out += c; continue; }
      out += c; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c; } else { out += ' '; }
      continue;
    }
    if (state === 'block') {
      if (c === '*' && c2 === '/') { state = 'code'; out += '  '; i++; } else { out += c === '\n' ? '\n' : ' '; }
      continue;
    }
    // inside a string literal
    if (c === '\\') { out += '  '; i++; continue; } // skip the escaped char
    const quote = state === 'sq' ? "'" : state === 'dq' ? '"' : '`';
    if (c === quote) { state = 'code'; out += c; continue; }
    out += c === '\n' ? '\n' : ' ';
  }
  return out;
}

/** Split comment/string-stripped source into `;`-terminated statements with line spans. */
function splitStatements(stripped) {
  const stmts = [];
  let buf = '';
  let line = 1;
  let start = null;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (start === null && !/\s/.test(ch)) start = line;
    if (ch === ';') {
      if (buf.trim()) stmts.push({text: buf, start: start ?? line, end: line});
      buf = '';
      start = null;
    } else {
      buf += ch;
    }
    if (ch === '\n') line++;
  }
  if (buf.trim()) stmts.push({text: buf, start: start ?? line, end: line});
  return stmts;
}

function scanFile(file, violations) {
  const src = fs.readFileSync(file, 'utf8');
  const rawLines = src.split('\n');

  // Lines carrying a trailing `// pagination-ok:` suppressor (1-based).
  const okLines = new Set();
  rawLines.forEach((l, idx) => {
    if (OK_RE.test(l)) okLines.add(idx + 1);
  });

  // Rule A: literal row limits > 1000 (per line), unless suppressed.
  rawLines.forEach((l, idx) => {
    const ln = idx + 1;
    if (okLines.has(ln)) return;
    for (const m of l.matchAll(/\.limit\(\s*(\d+)\s*\)/g)) {
      if (Number(m[1]) > 1000) violations.push({file, line: ln, rule: 'A', msg: `.limit(${m[1]}) exceeds PostgREST db-max-rows (1000)`});
    }
    for (const m of l.matchAll(/\blimit=(\d+)/g)) {
      if (Number(m[1]) > 1000) violations.push({file, line: ln, rule: 'A', msg: `limit=${m[1]} exceeds PostgREST db-max-rows (1000)`});
    }
  });

  // Rule B: unbounded supabase `.from().select()` statements.
  const stmts = splitStatements(stripCommentsAndStrings(src));
  for (const s of stmts) {
    if (!/\.from\(/.test(s.text) || !/\.select\(/.test(s.text)) continue;
    if (BOUND_MARKERS.some((m) => s.text.includes(m))) continue;
    let suppressed = false;
    for (let L = s.start; L <= s.end; L++) if (okLines.has(L)) { suppressed = true; break; }
    if (suppressed) continue;
    violations.push({
      file,
      line: s.start,
      rule: 'B',
      msg: 'supabase .from().select() with no row bound — paginate with .range()/fetchAllPaged, or add .single()/.maybeSingle()/.limit()/count/head (or // pagination-ok: <reason>)',
    });
  }
}

const files = [];
for (const d of SCAN_DIRS) walk(path.join(ROOT, d), files);
files.sort();

const violations = [];
for (const file of files) scanFile(file, violations);

if (violations.length > 0) {
  console.error(`check-pagination: ${violations.length} violation(s) found\n`);
  for (const v of violations) {
    console.error(`  ${path.relative(ROOT, v.file)}:${v.line}  [${v.rule}] ${v.msg}`);
  }
  console.error('');
  process.exit(1);
}

console.log(`check-pagination: OK — scanned ${files.length} file(s), no unbounded supabase reads.`);
process.exit(0);
