// Polymarket trader watcher — Cloudflare Worker
//
// Watches one trader's wallet and posts every new BUY/SELL to a Discord webhook.
// Runs on a Cron Trigger (suggested: */2 * * * *). See SETUP.md for the setup.

// ================= FILL THESE TWO IN (paste between the quotes), then Deploy =================
const CFG_WALLET  = "";   // the trader's wallet, e.g. "0x095fbca2e0eaf0c9841005135427e1e0117190b2"
const CFG_WEBHOOK = "";   // your Discord webhook URL, e.g. "https://discord.com/api/webhooks/..."
const CFG_MIN_USD = "";   // optional: skip trades under this many dollars, e.g. "50" (leave "" for all)
// ============================================================================================
//
// (Advanced: instead of the two lines above you can set WALLET / DISCORD_WEBHOOK / MIN_USD as
//  Worker Variables — env values win over the constants. Either way works.)
//
// KV binding STATE (any KV namespace) remembers which trades were already sent. If it isn't
// bound the worker still runs using temporary memory (it may repeat an alert after a restart).

const API = "https://data-api.polymarket.com";
const OVERLAP_S = 300;   // re-check the last 5 min (API indexing lag)
const MAX_MSGS = 10;     // per run, then one "…and N more" line
const SEEN_KEEP = 300;   // dedupe keys to remember

const num = v => (typeof v === "number" ? v : parseFloat(v)) || 0;
const tradeKey = t => `${t.transactionHash || ""}|${t.asset || ""}|${t.side || ""}|${t.size || ""}|${t.timestamp || ""}`;

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    let res;
    try { res = await fetch(url, { headers: { accept: "application/json" } }); }
    catch (e) { if (i === tries - 1) throw e; continue; }
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : (data && data.data) || [];
    }
    if (!(res.status === 408 || res.status === 429 || res.status >= 500) || i === tries - 1) {
      throw new Error(`API HTTP ${res.status}`);
    }
    await new Promise(r => setTimeout(r, 800 * (i + 1)));
  }
  return [];
}

function formatTrade(t) {
  const side = String(t.side || "").toUpperCase();
  const emoji = side === "BUY" ? "\u{1F7E2}" : "\u{1F534}";
  const shares = num(t.size), price = num(t.price);
  const usd = shares * price;
  const who = t.name || t.pseudonym || "Trader";
  const title = t.title || t.eventSlug || "market";
  const outcome = t.outcome ? ` · ${t.outcome}` : "";
  const link = t.eventSlug ? `\nhttps://polymarket.com/event/${t.eventSlug}` : "";
  return `${emoji} **${who} ${side}** ${shares.toFixed(1)} shares @ ${(price * 100).toFixed(1)}¢` +
         ` ($${usd.toFixed(2)})\n${title}${outcome}${link}`;
}

async function postDiscord(webhook, content) {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content })
  });
  if (!res.ok && res.status !== 204) throw new Error(`Discord HTTP ${res.status}`);
}

// Resolve config: a Worker Variable (env) wins, else the CFG_* constant above.
const cfgWallet  = env => String(env.WALLET || CFG_WALLET || "").toLowerCase();
const cfgWebhook = env => env.DISCORD_WEBHOOK || CFG_WEBHOOK || "";
const cfgMinUsd  = env => num(env.MIN_USD || CFG_MIN_USD);

// KV is optional: if STATE isn't bound, fall back to temporary in-memory storage so the
// worker never crashes (may repeat an alert after a cold start — harmless).
let MEM = null;
const store = env => env.STATE || {
  get: async () => MEM,
  put: async (_k, v) => { MEM = v; }
};

// One polling pass. Exported for offline tests.
async function check(env, nowS) {
  const wallet = cfgWallet(env);
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) throw new Error("Wallet is not set (fill CFG_WALLET or the WALLET variable)");
  const webhook = cfgWebhook(env);
  const minUsd = cfgMinUsd(env);
  const kv = store(env);

  const raw = await kv.get("state");
  let state = null;
  try { state = raw ? JSON.parse(raw) : null; } catch (e) { state = null; }

  // First run: remember "now" and do NOT spam his old trades.
  if (!state || !state.ts) {
    state = { ts: nowS, seen: [], checked: nowS, alerts: 0 };
    await kv.put("state", JSON.stringify(state));
    return { sent: 0, first: true };
  }

  const trades = await getJSON(`${API}/trades?user=${wallet}&limit=50`);
  const seen = new Set(state.seen || []);
  const fresh = trades
    .filter(t => num(t.timestamp) > state.ts - OVERLAP_S)
    .filter(t => !seen.has(tradeKey(t)))
    .filter(t => num(t.size) * num(t.price) >= minUsd)
    .sort((a, b) => num(a.timestamp) - num(b.timestamp));   // oldest first, reads naturally

  let sent = 0;
  for (const t of fresh.slice(0, MAX_MSGS)) {
    await postDiscord(webhook, formatTrade(t));
    sent++;
  }
  if (fresh.length > MAX_MSGS) {
    await postDiscord(webhook, `…and ${fresh.length - MAX_MSGS} more trades in the same window.`);
  }

  // Save only when something changed (KV free tier allows 1,000 writes/day).
  if (fresh.length > 0) {
    for (const t of fresh) seen.add(tradeKey(t));
    let maxTs = state.ts;
    for (const t of fresh) if (num(t.timestamp) > maxTs) maxTs = num(t.timestamp);
    state = { ts: maxTs, seen: [...seen].slice(-SEEN_KEEP),
              checked: nowS, alerts: (state.alerts || 0) + sent };
    await kv.put("state", JSON.stringify(state));
  }
  return { sent, fresh: fresh.length };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(check(env, Math.floor(Date.now() / 1000)));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const wallet = cfgWallet(env);
    const webhook = cfgWebhook(env);
    if (url.searchParams.get("test") === "1") {
      if (!webhook) return new Response("Discord test FAILED: webhook not set — fill CFG_WEBHOOK in the code (or the DISCORD_WEBHOOK variable), then Deploy.", { status: 500 });
      try {
        await postDiscord(webhook,
          `✅ Watcher is working. Watching **${wallet || "(no wallet set!)"}** — you will get a message here on every buy/sell.`);
        return new Response("Test message sent — check your Discord channel.");
      } catch (e) {
        return new Response("Discord test FAILED: " + e.message, { status: 500 });
      }
    }
    let state = null;
    try { state = JSON.parse((await store(env).get("state")) || "null"); } catch (e) {}
    const lines = [
      "Polymarket trader watcher — alive ✅",
      `Watching: ${wallet || "(wallet not set — fill CFG_WALLET in the code, then Deploy)"}`,
      `Discord webhook: ${webhook ? "set ✅" : "NOT set — fill CFG_WEBHOOK, then Deploy"}`,
      `Memory (KV): ${env.STATE ? "connected ✅" : "using temporary memory (bind STATE for best results)"}`,
      state ? `Watermark: ${new Date(state.ts * 1000).toISOString()}` : "First check has not run yet (waiting for the cron trigger).",
      state ? `Alerts sent so far: ${state.alerts || 0}` : "",
      "",
      "Add ?test=1 to this URL to send a test Discord message."
    ];
    return new Response(lines.filter(Boolean).join("\n"), { headers: { "content-type": "text/plain" } });
  }
};

export { check, formatTrade, tradeKey };   // for offline tests
