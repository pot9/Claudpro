# 24/7 trade alerts → Discord — setup (5 minutes, free, works from your phone)

You will connect three things: **Discord** (where alerts arrive), **Cloudflare** (the free
robot that runs day and night), and the **trader's wallet** (who to watch).

Alerts look like this in your Discord channel:

> 🟢 **BrightStars BUY** 5000.0 shares @ 22.0¢ ($1,100.00)
> US x Iran permanent peace deal? · Yes
> https://polymarket.com/event/iran-deal

Latency: a new trade shows up in Discord within about **2–3 minutes**.

---

## Part 1 — Get a Discord webhook (1 minute)

1. In Discord, open the server/channel where you want the alerts (you must own it or be admin — creating your own private server is free).
2. Tap the channel name → **⚙️ Edit Channel** → **Integrations** → **Webhooks** → **New Webhook**.
3. Tap the new webhook → **Copy Webhook URL**. Keep it — you'll paste it in Part 2.
   (Treat this URL like a password: anyone who has it can post to your channel.)

## Part 2 — Create the watcher on Cloudflare (4 minutes)

1. Go to **dash.cloudflare.com** and sign up (free, no card).
2. In the left menu: **Storage & Databases → KV** → **Create namespace** → name it `watcher-state` → Create.
   *(This is the robot's tiny memory — it remembers which trades it already told you about.)*
3. Left menu: **Compute (Workers & Pages)** → **Create** → **Create Worker** → give it a name (e.g. `poly-watcher`) → **Deploy**.
4. Tap **Edit code** → delete everything → **paste the whole contents of [`worker.js`](./worker.js)**.
5. **Fill in your two values** at the very top of the code (between the quotes):
   ```js
   const CFG_WALLET  = "0x...your trader wallet...";
   const CFG_WEBHOOK = "https://discord.com/api/webhooks/...your URL...";
   ```
   *(This is simpler and more reliable than Cloudflare's Variables screen. Your webhook stays
   private inside your own Cloudflare account.)*
   Then tap **Deploy**.
6. Go to the **Bindings** tab → **Add binding** → **KV namespace**:
   - Variable name: `STATE` (exactly, capitals)
   - KV namespace: `watcher-state` → Save.
   *(Optional but recommended — without it the watcher still works but may repeat an alert
   after a restart.)*
7. **Settings** → **Triggers** → **Cron Triggers** → **Add** → every **1 minute** (`* * * * *`)
   or every 2 minutes (`*/2 * * * *`) → Save.

## Part 3 — Test it (30 seconds)

1. On the worker's page find its URL (like `https://poly-watcher.yourname.workers.dev`).
2. Open **`<that URL>?test=1`** in your browser.
3. A **✅ test message** should appear in your Discord channel. If it does — you're done. 🎉

Opening the URL *without* `?test=1` shows a status page (who it's watching, alerts sent).

---

## Good to know

- **First run is silent on purpose** — it won't spam his old trades; you only get trades that happen from now on.
- **Change trader:** edit the `WALLET` variable → then delete the `state` key in the KV namespace (Storage & Databases → KV → watcher-state) so it starts fresh.
- **Stop alerts:** delete the Cron Trigger (or the whole worker).
- **Free limits:** this uses ~720 checks/day of Cloudflare's 100,000/day free requests, and stays under the KV free write limit. You will not be charged — there is no card on file to charge.
- **If test fails:** re-check that `DISCORD_WEBHOOK` is pasted exactly, and that the KV binding is named `STATE`.
