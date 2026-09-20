// Immediate low-stock alert (Stock Forecast, event-driven path).
//
// Called by a DB trigger (pos_stock_movements AFTER INSERT, via pg_net) with a
// { product_id }. Recomputes that product's band from live data, dedupes against
// pos_stock_alert_log (fire once per crossing, resolve on recovery), and emails
// via Resend the moment a product crosses into low/out. Fetch-based, no imports:
// uses PostgREST with the function's built-in service-role key. The Resend key is
// a FUNCTION SECRET (never in the database). Always returns 200 so pg_net does not
// retry-storm; problems are logged.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'coop-alerts@hello.lanceamiel.site';
const EMAIL_TO_FALLBACK = (Deno.env.get('EMAIL_TO') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const INVENTORY_URL = Deno.env.get('INVENTORY_URL') ?? 'https://coop-brand-os-staging.vercel.app/inventory?channel=offline';
// Tag non-prod alert emails so a staging test is unmistakable; prod stays clean.
// Self-configuring: each project's function has its own SUPABASE_URL, so the staging
// project ref identifies staging with no secret. (Prod ref -> null -> no tag.)
const ENV_TAG = SUPABASE_URL.includes('syxwixxzmytvhwhkwdvw') ? 'STAGING' : null;

const FORECAST_WINDOW_DAYS = 60;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const H = {apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json'};
const rest = (path: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {...init, headers: {...H, ...(init.headers ?? {})}});
const manilaDay = (iso: string) => new Date(new Date(iso).getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);

const ok = (body: Record<string, unknown>) => new Response(JSON.stringify(body), {headers: {'content-type': 'application/json'}});

Deno.serve(async (req) => {
  try {
    const dry = new URL(req.url).searchParams.get('dry') === '1';
    const {product_id} = await req.json().catch(() => ({}));
    if (!product_id) return ok({ok: false, error: 'no product_id'});

    // Live on-hand + name + sale movements (for the event-aware velocity, which
    // drives BOTH the low band and the suggested reorder).
    const since = new Date(Date.now() - FORECAST_WINDOW_DAYS * 86400000).toISOString();
    const [invRows, prodRows, cfgRows, moves] = await Promise.all([
      rest(`pos_inventory?product_id=eq.${product_id}&select=stock`).then((r) => r.json()),
      rest(`pos_products?product_id=eq.${product_id}&select=name`).then((r) => r.json()),
      rest(`pos_settings?key=eq.stock_forecast_config&select=value`).then((r) => r.json()),
      rest(`pos_stock_movements?product_id=eq.${product_id}&reason=eq.sale&created_at=gte.${since}&select=delta,created_at`).then((r) => r.json()),
    ]);
    // Defensive: a transient PostgREST hiccup returns a NON-array error object, not
    // a row set. Crucially, distinguish that from a valid-but-empty array:
    //   - inventory []  = genuinely no stock (out) -> a real alert
    //   - inventory {..error..} = we don't know the stock -> MUST NOT default to 0,
    //     or we'd fabricate a false "out of stock" alert. Skip and let the next
    //     movement re-run it. Same for the product/config reads.
    if (!Array.isArray(invRows) || !Array.isArray(prodRows) || !Array.isArray(cfgRows)) {
      return ok({ok: false, action: 'skipped-transient-read', product_id});
    }
    if (!prodRows.length) return ok({ok: false, error: 'unknown product'});
    // Movements are safe to degrade to []: worst case velocity is 0 (no coverage
    // signal), and threshold-based low still works. Never fabricates an alert.
    const movesArr = Array.isArray(moves) ? moves : [];
    const stock = Number(invRows[0]?.stock ?? 0);
    const name = prodRows[0].name as string;
    const cfg = cfgRows[0]?.value ?? {};
    const override = cfg.threshold_overrides?.[product_id];
    const threshold = Number.isFinite(Number(override)) ? Number(override) : Number(cfg.threshold ?? 10);
    const earlyWarning = Number(cfg.early_warning_events ?? 3);
    const targetCover = Number(cfg.target_cover_events ?? 6);

    // Event-aware velocity: units per distinct selling day (mirrors the dashboard).
    const days = new Set<string>();
    let units = 0;
    for (const m of movesArr) {
      units += Math.abs(Number(m.delta ?? 0));
      days.add(manilaDay(m.created_at));
    }
    const perDay = days.size ? units / days.size : 0;
    const coverEventDays = perDay > 0 ? stock / perDay : null;
    const reorderQty = perDay > 0 ? Math.max(0, Math.ceil(targetCover * perDay - stock)) : null;

    // Low band matches the dashboard/digest exactly: below the flat threshold OR
    // too few selling-days of cover left (fast movers with a healthy-looking count).
    const level = stock <= 0
      ? 'out'
      : stock <= threshold || (coverEventDays != null && coverEventDays <= earlyWarning)
        ? 'low'
        : null;

    // Safe verification hook: compute + report, no writes, no send.
    if (dry) return ok({ok: true, dry: true, product_id, stock, threshold, coverEventDays, earlyWarning, level, reorderQty});

    // Current open alert for this product.
    const openRows = await rest(`pos_stock_alert_log?product_id=eq.${product_id}&resolved_at=is.null&select=id,level_at_fire,stock_at_fire&order=id.desc&limit=1`).then((r) => r.json());
    const open = Array.isArray(openRows) ? openRows[0] : undefined;

    // Not low/out right now. Only RESOLVE an open alert on a genuine restock (stock
    // went back UP), never on velocity wobble: coverage (stock / sales-per-day) is
    // non-monotonic, so cover can drift back over the early-warning line while stock
    // keeps falling. Resolving on that would re-fire on the next dip -> email spam.
    // Holding the alert open until real replenishment gives one email per low episode.
    if (!level) {
      if (open && stock > Number(open.stock_at_fire)) {
        await rest(`pos_stock_alert_log?id=eq.${open.id}`, {method: 'PATCH', body: JSON.stringify({resolved_at: new Date().toISOString()})});
        return ok({ok: true, action: 'resolved', product_id});
      }
      return ok({ok: true, action: open ? 'held' : 'noop', product_id});
    }

    // If we can't actually send, DON'T claim the crossing (no dedup insert), so it
    // still alerts once the key/recipients are in place. Check before writing.
    const userRows = await rest('pos_dashboard_users?select=email').then((r) => r.json());
    const set = new Set<string>();
    const recipients: string[] = [];
    for (const e of [...(Array.isArray(userRows) ? userRows : []).map((u: {email: string}) => u.email), ...EMAIL_TO_FALLBACK]) {
      const k = String(e).trim().toLowerCase();
      if (k && !set.has(k)) {
        set.add(k);
        recipients.push(String(e).trim());
      }
    }
    if (!RESEND_API_KEY) return ok({ok: false, error: 'RESEND_API_KEY not set', action: 'not-sent', product_id});
    if (recipients.length === 0) return ok({ok: false, error: 'no recipients', action: 'not-sent', product_id});

    // Low or out. Decide whether this is a fresh crossing worth emailing.
    let shouldSend = false;
    if (!open) {
      const res = await rest('pos_stock_alert_log', {
        method: 'POST',
        headers: {prefer: 'return=minimal'},
        body: JSON.stringify({product_id, level_at_fire: level, stock_at_fire: stock}),
      });
      if (res.status === 409) return ok({ok: true, action: 'race-deduped', product_id}); // lost the unique race
      shouldSend = res.ok;
    } else if (open.level_at_fire === 'low' && level === 'out') {
      await rest(`pos_stock_alert_log?id=eq.${open.id}`, {method: 'PATCH', body: JSON.stringify({level_at_fire: 'out', stock_at_fire: stock, fired_at: new Date().toISOString()})});
      shouldSend = true; // escalation
    } else {
      return ok({ok: true, action: 'already-alerted', product_id});
    }
    if (!shouldSend) return ok({ok: false, error: 'dedupe insert failed', product_id});

    const {subject, html} = buildEmail({name, stock, level, reorderQty, envTag: ENV_TAG});
    const send = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json'},
      body: JSON.stringify({from: EMAIL_FROM, to: recipients, subject, html}),
    });
    if (!send.ok) return ok({ok: false, error: `resend ${send.status}`, product_id});
    return ok({ok: true, action: 'sent', product_id, level, recipients: recipients.length});
  } catch (e) {
    return ok({ok: false, error: String(e) });
  }
});

// Single-product immediate email. Poppins with a system fallback, warm palette,
// status pill, no em/en dashes. Mirrors the digest template's look.
function buildEmail({name, stock, level, reorderQty, envTag}: {name: string; stock: number; level: 'low' | 'out'; reorderQty: number | null; envTag?: string | null}) {
  const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c] as string));
  const FONT = "'Poppins','Segoe UI',Roboto,-apple-system,Helvetica,Arial,sans-serif";
  const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";
  const INK = '#1b1e1c', MUTED = '#6b716a', LINE = '#ecece6', OCHRE = '#b06f2b';
  const isOut = level === 'out';
  const pillColor = isOut ? '#6d4c9a' : '#b7791f';
  const pillBg = isOut ? '#efe9f6' : '#f7eeda';
  const headline = isOut ? `${name} is out of stock` : `${name} just dropped to low`;
  const badge = (isOut ? 'Out' : 'Low') + (reorderQty ? ` · reorder ${reorderQty}` : '');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">
<style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
body{margin:0;padding:0;background:#f4f5f2}</style></head>
<body style="margin:0;padding:0;background:#f4f5f2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f2"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;background:#fff;border:1px solid ${LINE};border-radius:16px;overflow:hidden">
<tr><td style="padding:28px 28px 0">
${envTag ? `<div style="margin:0 0 12px"><span style="font-family:${MONO};font-size:10.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#fff;background:${INK};padding:3px 8px;border-radius:5px">${esc(envTag)}</span></div>` : ''}
<div style="font-family:${FONT};font-size:19px;font-weight:700;letter-spacing:-0.02em;color:${INK}">${isOut ? '&#128308;' : '&#128992;'}&nbsp; ${esc(headline)}</div>
<div style="height:3px;width:34px;background:${OCHRE};border-radius:3px;margin:14px 0 0"></div>
<p style="font-family:${FONT};font-size:14px;line-height:1.6;color:${MUTED};margin:16px 0 0">${isOut ? 'It just hit zero during today&rsquo;s selling. Bring more if you can.' : 'It crossed the low line during today&rsquo;s selling. Restock before it runs out.'}</p>
</td></tr>
<tr><td style="padding:20px 28px 4px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-family:${FONT};font-size:14px;font-weight:600;color:${INK}">${esc(name)}
<div style="font-family:${MONO};font-size:11px;font-weight:400;color:${MUTED};margin-top:2px">${stock} on hand</div></td>
<td align="right"><span style="font-family:${FONT};font-size:12px;font-weight:600;color:${pillColor};background:${pillBg};padding:4px 11px;border-radius:20px;white-space:nowrap">${esc(badge)}</span></td>
</tr></table></td></tr>
<tr><td style="padding:24px 28px 40px">
<a href="${esc(INVENTORY_URL)}" style="font-family:${FONT};display:inline-block;background:${INK};color:#fff;font-size:13.5px;font-weight:600;padding:11px 20px;border-radius:9px;text-decoration:none">Open Inventory &rarr;</a>
</td></tr>
<tr><td style="padding:18px 28px 24px;border-top:1px solid ${LINE}">
<div style="font-family:${MONO};font-size:11px;color:${MUTED};line-height:1.5">Coop · Offline stock forecast<br>You are receiving this because you use the Coop dashboard.</div>
</td></tr>
</table></td></tr></table></body></html>`;
  const subject = `${envTag ? `[${envTag}] ` : ''}${isOut ? '🔴' : '🟠'} ${headline}`;
  return {subject, html};
}
