// Daily low-stock DIGEST (Stock Forecast). Called by pg_cron (00:00 UTC = 08:00
// Manila) via pg_net. Recomputes the full forecast from live pos_* data, builds the
// morning recap email, and sends via Resend to pos_dashboard_users (+ EMAIL_TO
// fallback). Send-only: does NOT reconcile pos_stock_alert_log (the event-driven
// stock-alert function owns that). Faithful port of the batch backend's
// stock-forecast.js + stock-email.js so numbers match the dashboard. Always 200 so
// pg_net does not retry-storm. Pass ?dry=1 to compute + return JSON without sending.
//
// HTML uses single-quoted attributes on purpose (keeps this file free of double
// quotes so it deploys cleanly); font-family names are double-quoted inside.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'coop-alerts@hello.lanceamiel.site';
const EMAIL_TO_FALLBACK = (Deno.env.get('EMAIL_TO') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const INVENTORY_URL = Deno.env.get('INVENTORY_URL') ?? 'https://coop-brand-os-staging.vercel.app/inventory?channel=offline';
// Non-prod tag, self-configuring from the project ref (prod ref -> clean).
const ENV_TAG = SUPABASE_URL.includes('syxwixxzmytvhwhkwdvw') ? 'STAGING' : null;

const FORECAST_WINDOW_DAYS = 60;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const H = {apikey: SERVICE_KEY, authorization: 'Bearer ' + SERVICE_KEY, 'content-type': 'application/json'};
const rest = (path: string) => fetch(SUPABASE_URL + '/rest/v1/' + path, {headers: H}).then((r) => r.json());
const ok = (body: Record<string, unknown>) => new Response(JSON.stringify(body), {headers: {'content-type': 'application/json'}});

// -- Forecast (ported from zoomy-observability/src/observability/stock-forecast.js) --
const manilaDayKey = (iso: string) => new Date(new Date(iso).getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);

const DEFAULT_CONFIG = {threshold: 10, thresholdOverrides: {} as Record<string, number>, targetCoverEventDays: 6, leadTimeDays: 3, earlyWarningEvents: 3, eventWeekdays: [5, 6, 0]};
const DEFAULT_PLAN = {eventThisWeekend: true, multiplier: 1, byCategory: {} as Record<string, number>, byProduct: {} as Record<string, number>};

// deno-lint-ignore no-explicit-any
function parseConfig(value: any) {
  const v = value && typeof value === 'object' ? value : {};
  const num = (x: unknown, d: number) => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : d);
  // deno-lint-ignore no-explicit-any
  const map = (m: any) => {
    const out: Record<string, number> = {};
    if (m && typeof m === 'object') for (const [k, val] of Object.entries(m)) if (Number.isFinite(Number(val))) out[k] = Number(val);
    return out;
  };
  const days = Array.isArray(v.event_days) ? v.event_days.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
  return {
    threshold: num(v.threshold, DEFAULT_CONFIG.threshold),
    thresholdOverrides: map(v.threshold_overrides),
    targetCoverEventDays: num(v.target_cover_events, DEFAULT_CONFIG.targetCoverEventDays),
    leadTimeDays: num(v.lead_time_days, DEFAULT_CONFIG.leadTimeDays),
    earlyWarningEvents: num(v.early_warning_events, DEFAULT_CONFIG.earlyWarningEvents),
    eventWeekdays: days.length ? days : DEFAULT_CONFIG.eventWeekdays,
  };
}
// deno-lint-ignore no-explicit-any
function parsePlan(value: any) {
  const v = value && typeof value === 'object' ? value : {};
  const num = (x: unknown, d: number) => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : d);
  // deno-lint-ignore no-explicit-any
  const map = (m: any) => {
    const out: Record<string, number> = {};
    if (m && typeof m === 'object') for (const [k, val] of Object.entries(m)) if (Number.isFinite(Number(val))) out[k] = Number(val);
    return out;
  };
  return {eventThisWeekend: v.event_this_weekend !== false, multiplier: num(v.multiplier, 1) || 1, byCategory: map(v.by_category), byProduct: map(v.by_product)};
}

type Cfg = ReturnType<typeof parseConfig>;
type Plan = ReturnType<typeof parsePlan>;
type Prod = {product_id: string; name: string; category: string | null; stock: number};
type Move = {product_id: string; qty: number; day: string};

const effectiveThreshold = (config: Cfg, sku: string) => {
  const o = config.thresholdOverrides?.[sku];
  return Number.isFinite(o) && o >= 0 ? o : config.threshold;
};

function velocityByProduct(movements: Move[]) {
  const units = new Map<string, number>();
  const days = new Map<string, Set<string>>();
  for (const m of movements) {
    if (!(m.qty > 0)) continue;
    units.set(m.product_id, (units.get(m.product_id) ?? 0) + m.qty);
    const set = days.get(m.product_id) ?? new Set<string>();
    set.add(m.day);
    days.set(m.product_id, set);
  }
  const out = new Map<string, {units: number; days: number}>();
  for (const [pid, u] of units) out.set(pid, {units: u, days: days.get(pid)?.size ?? 0});
  return out;
}

const weekdayOf = (dayKey: string) => new Date(dayKey + 'T00:00:00Z').getUTCDay();
function addDaysKey(dayKey: string, n: number) {
  const d = new Date(dayKey + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function nthUpcomingEventDay(startKey: string, n: number, eventWeekdays: number[]) {
  let key = startKey;
  let found = 0;
  for (let guard = 0; guard < 800; guard++) {
    if (eventWeekdays.includes(weekdayOf(key))) {
      found++;
      if (found === n) return key;
    }
    key = addDaysKey(key, 1);
  }
  return key;
}

function computeForecast(products: Prod[], movements: Move[], plan: Plan, config: Cfg, now: Date) {
  const vel = velocityByProduct(movements);
  const todayKey = manilaDayKey(now.toISOString());
  const eventDaysPerWeekend = Math.max(1, config.eventWeekdays.length);

  const rows = products.map((p) => {
    const v = vel.get(p.product_id);
    const soldPerEventDay = v && v.days > 0 ? v.units / v.days : 0;
    const stock = p.stock;
    const coverEventDays = soldPerEventDay > 0 ? stock / soldPerEventDay : null;
    const threshold = effectiveThreshold(config, p.product_id);

    let status: 'out' | 'low' | 'healthy';
    if (stock <= 0) status = 'out';
    else if (stock <= threshold || (coverEventDays != null && coverEventDays <= config.earlyWarningEvents)) status = 'low';
    else status = 'healthy';

    let runsOut: string | null = null;
    if (stock <= 0) runsOut = todayKey;
    else if (soldPerEventDay > 0) runsOut = nthUpcomingEventDay(todayKey, Math.max(1, Math.ceil(stock / soldPerEventDay)), config.eventWeekdays);

    let reorderQty: number | null = null;
    if (status !== 'healthy' && soldPerEventDay > 0) reorderQty = Math.max(0, Math.ceil(config.targetCoverEventDays * soldPerEventDay - stock));

    const manual = plan.byProduct?.[p.product_id];
    const hasManual = Number.isFinite(manual) && manual >= 0;
    const mult = (p.category && plan.byCategory?.[p.category] > 0 ? plan.byCategory[p.category] : plan.multiplier) || 1;
    const expected = hasManual ? Math.round(manual) : Math.round(soldPerEventDay * eventDaysPerWeekend * mult);
    const surgeShort = Math.max(0, expected - stock);

    return {product_id: p.product_id, name: p.name, category: p.category ?? null, stock, soldPerEventDay, coverEventDays, status, runsOut, reorderQty, surgeExpected: expected, surgeShort};
  });

  const rank: Record<string, number> = {out: 0, low: 1, healthy: 2};
  rows.sort((a, b) => (rank[a.status] - rank[b.status]) || ((a.coverEventDays ?? Infinity) - (b.coverEventDays ?? Infinity)) || a.name.localeCompare(b.name));

  const summary = {
    out: rows.filter((r) => r.status === 'out').length,
    low: rows.filter((r) => r.status === 'low').length,
    healthy: rows.filter((r) => r.status === 'healthy').length,
    surgeShort: rows.filter((r) => r.surgeShort > 0).length,
  };
  return {rows, summary};
}

// -- Email (ported from zoomy-observability/src/observability/stock-email.js) --
const PAPER = '#f4f5f2', CARD = '#ffffff', INK = '#1b1e1c', MUTED = '#6b716a', LINE = '#ecece6', OCHRE = '#b06f2b';
const OUT = '#6d4c9a', OUT_BG = '#efe9f6', LOW = '#b7791f', LOW_BG = '#f7eeda';
const FONT = '"Poppins","Segoe UI",Roboto,-apple-system,Helvetica,Arial,sans-serif';
const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';
const esc = (s: unknown) => String(s).replace(/[&<>]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c] as string));

function doc(title: string, inner: string) {
  return "<!DOCTYPE html>\n" +
`<html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta name='color-scheme' content='light'>
<title>${esc(title)}</title>
<link href='https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap' rel='stylesheet'>
<style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');body{margin:0;padding:0;background:${PAPER};-webkit-font-smoothing:antialiased;}a{text-decoration:none;}</style>
</head><body style='margin:0;padding:0;background:${PAPER};'>
  <table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:${PAPER};'><tr><td align='center' style='padding:32px 16px;'>
    <table role='presentation' width='560' cellpadding='0' cellspacing='0' style='width:560px;max-width:560px;background:${CARD};border:1px solid ${LINE};border-radius:16px;overflow:hidden;'>
      ${inner}
      <tr><td style='padding:18px 28px 24px;border-top:1px solid ${LINE};'><div style='font-family:${MONO};font-size:11px;color:${MUTED};line-height:1.5;'>Coop &middot; Offline stock forecast<br>You are receiving this because you use the Coop dashboard.</div></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
function envChip(tag: string) {
  return `<div style='margin:0 0 12px;'><span style='font-family:${MONO};font-size:10.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#ffffff;background:${INK};padding:3px 8px;border-radius:5px;'>${esc(tag)}</span></div>`;
}
function header(emoji: string, title: string, sub: string, tag: string | null) {
  return `<tr><td style='padding:28px 28px 0;'>
    ${tag ? envChip(tag) : ''}
    <div style='font-family:${FONT};font-size:19px;font-weight:700;letter-spacing:-0.02em;color:${INK};'>${emoji}&nbsp; ${esc(title)}</div>
    <div style='height:3px;width:34px;background:${OCHRE};border-radius:3px;margin:14px 0 0;'></div>
    ${sub ? `<p style='font-family:${FONT};font-size:14px;line-height:1.6;color:${MUTED};margin:16px 0 0;'>${sub}</p>` : ''}
  </td></tr>`;
}
function surgeCallout(shortCount: number, multiplier: number) {
  if (!shortCount) return '';
  const n = `<b>${shortCount} product${shortCount > 1 ? 's' : ''}</b>`;
  const msg = Number(multiplier) > 1
    ? `${n} will run short for the next event at <b>${esc(multiplier)}&times;</b> the usual volume.`
    : `${n} will run short of what the next event is expected to sell.`;
  return `<tr><td style='padding:18px 28px 0;'><table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:${LOW_BG};border:1px solid #e6d4ad;border-radius:10px;'><tr><td style='padding:12px 15px;font-family:${FONT};font-size:13px;color:${INK};line-height:1.55;'><span style='font-size:15px;'>&#128200;</span>&nbsp; ${msg}</td></tr></table></td></tr>`;
}
function pill(label: string, color: string, bg: string) {
  return `<span style='font-family:${FONT};font-size:12px;font-weight:600;color:${color};background:${bg};padding:4px 11px;border-radius:20px;white-space:nowrap;'>${esc(label)}</span>`;
}
// deno-lint-ignore no-explicit-any
function productRow(r: any, isLast: boolean) {
  const isOut = r.status === 'out';
  const label = (isOut ? 'Out' : 'Low') + (r.reorderQty ? ' &middot; reorder ' + r.reorderQty : '');
  const badge = pill(label, isOut ? OUT : LOW, isOut ? OUT_BG : LOW_BG);
  const border = isLast ? '' : `border-bottom:1px solid ${LINE};`;
  return `<tr><td style='padding:14px 0;${border}'><table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr><td style='font-family:${FONT};font-size:14px;font-weight:600;color:${INK};'>${esc(r.name)}<div style='font-family:${MONO};font-size:11px;font-weight:400;color:${MUTED};margin-top:2px;'>${r.stock} on hand</div></td><td align='right' style='vertical-align:top;'>${badge}</td></tr></table></td></tr>`;
}
// deno-lint-ignore no-explicit-any
function list(rows: any[]) {
  return `<tr><td style='padding:20px 28px 4px;'><table role='presentation' width='100%' cellpadding='0' cellspacing='0'>${rows.map((r, i) => productRow(r, i === rows.length - 1)).join('')}</table></td></tr>`;
}
function cta(link: string) {
  if (!link) return '';
  return `<tr><td style='padding:24px 28px 40px;'><a href='${esc(link)}' style='font-family:${FONT};display:inline-block;background:${INK};color:#ffffff;font-size:13.5px;font-weight:600;padding:11px 20px;border-radius:9px;'>Open Inventory &rarr;</a></td></tr>`;
}
// deno-lint-ignore no-explicit-any
function digestEmail(forecast: any, plan: Plan, link: string, envTag: string | null) {
  const {summary} = forecast;
  const lowOut = forecast.rows.filter((r: {status: string}) => r.status !== 'healthy');
  const headline = `Stock digest &middot; ${summary.out} out &middot; ${summary.low} low`;
  const subjTag = envTag ? '[' + envTag + '] ' : '';
  const subject = subjTag + `\u{1F4E6} Stock digest · ${summary.out} out · ${summary.low} low`;
  const body = lowOut.length
    ? surgeCallout(summary.surgeShort, plan.multiplier) + list(lowOut)
    : `<tr><td style='padding:20px 28px 4px;font-family:${FONT};font-size:14px;color:${MUTED};'>Everything is comfortably stocked. Nothing low or out.</td></tr>`;
  const html = doc(headline.replace(/&middot;/g, '·'), header('&#128230;', headline, 'Where inventory stands this morning. Reorder quantity holds the target cover window at recent selling-day sell through.', envTag) + body + cta(link));
  return {subject, html};
}

// -- Handler --
Deno.serve(async (req) => {
  try {
    const dry = new URL(req.url).searchParams.get('dry') === '1';
    const since = new Date(Date.now() - FORECAST_WINDOW_DAYS * 86400000).toISOString();
    const [cfgRows, planRows, products, inventory, movesRaw, userRows] = await Promise.all([
      rest('pos_settings?key=eq.stock_forecast_config&select=value'),
      rest('pos_settings?key=eq.next_event_plan&select=value'),
      rest('pos_products?select=product_id,name,category&order=name.asc'),
      rest('pos_inventory?select=product_id,stock'),
      rest('pos_stock_movements?reason=eq.sale&created_at=gte.' + since + '&select=product_id,delta,created_at&limit=100000'),
      rest('pos_dashboard_users?select=email'),
    ]);

    const stockByProduct = new Map((Array.isArray(inventory) ? inventory : []).map((r: {product_id: string; stock: number}) => [r.product_id, Number(r.stock ?? 0)]));
    const productsWithStock: Prod[] = (Array.isArray(products) ? products : []).map((p: {product_id: string; name: string; category: string | null}) => ({
      product_id: p.product_id, name: p.name, category: p.category ?? null, stock: stockByProduct.get(p.product_id) ?? 0,
    }));
    const saleMoves: Move[] = (Array.isArray(movesRaw) ? movesRaw : []).map((m: {product_id: string; delta: number; created_at: string}) => ({
      product_id: m.product_id, qty: Math.abs(Number(m.delta ?? 0)), day: manilaDayKey(m.created_at),
    }));

    const config = parseConfig((Array.isArray(cfgRows) ? cfgRows[0]?.value : null));
    const plan = parsePlan((Array.isArray(planRows) ? planRows[0]?.value : null));
    const forecast = computeForecast(productsWithStock, saleMoves, plan, config, new Date());
    const {subject, html} = digestEmail(forecast, plan, INVENTORY_URL, ENV_TAG);

    const set = new Set<string>();
    const recipients: string[] = [];
    for (const e of [...(Array.isArray(userRows) ? userRows : []).map((u: {email: string}) => u.email), ...EMAIL_TO_FALLBACK]) {
      const k = String(e).trim().toLowerCase();
      if (k && !set.has(k)) { set.add(k); recipients.push(String(e).trim()); }
    }

    if (dry) return ok({ok: true, dry: true, summary: forecast.summary, subject, recipients});
    if (!RESEND_API_KEY) return ok({ok: false, error: 'RESEND_API_KEY not set', summary: forecast.summary});
    if (recipients.length === 0) return ok({ok: false, error: 'no recipients', summary: forecast.summary});

    const send = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {authorization: 'Bearer ' + RESEND_API_KEY, 'content-type': 'application/json'},
      body: JSON.stringify({from: EMAIL_FROM, to: recipients, subject, html}),
    });
    if (!send.ok) return ok({ok: false, error: 'resend ' + send.status, summary: forecast.summary});
    return ok({ok: true, action: 'sent', summary: forecast.summary, recipients: recipients.length});
  } catch (e) {
    return ok({ok: false, error: String(e)});
  }
});
