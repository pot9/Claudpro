# Polymarket Copy-Trade Backtester

A single-file web app that answers one question: **if I had copied this Polymarket
trader, would I have made money?**

You give it a trader's wallet, a look-back window and a bankroll. It pulls the
trader's *real* past trades from Polymarket's public data API, replays them in
order, copies each one at your chosen ratio, applies trading fees and copy-lag
slippage, exits when the trader exits, and reports the resulting P&L with an
equity curve.

It is one `index.html` file — **no backend, no build step, no dependencies** — so
you can run it from your phone.

## How to run it

### Option A — open the URL on your phone (recommended)
Host it free on GitHub Pages and bookmark it:

1. Push this repo to GitHub (it already is).
2. On GitHub: **Settings → Pages → Build and deployment → Source: "Deploy from a
   branch"**, pick the branch and `/ (root)` folder, **Save**.
3. After a minute, open the published URL (e.g. `https://<you>.github.io/Claudpro/`)
   on your phone. Add it to your home screen for an app-like shortcut.

### Option B — just open the file
Download `index.html` and open it in any browser (desktop or mobile). It works
straight from the filesystem.

## How to use it

| Field | Meaning |
|-------|---------|
| **Trader wallet** | The trader's Polymarket proxy wallet — the `0x…` in their profile URL (`polymarket.com/profile/0x…`). |
| **Look back** | How far back to pull trades (1 day … 1 year). |
| **Bankroll** | Starting capital in USDC. |
| **Copy ratio** | Fraction of his size you copy. `0.1` = 10% of every trade he makes. |
| **Slippage %** | Adverse price move you eat because you copy *after* he fills (1% default). |
| **Fee %** (advanced) | Per-side trading fee. Polymarket spot fee is currently 0%; raise it to stress-test. |
| **Cash policy** (advanced) | Partially fill or skip a buy when you don't have enough cash. |
| **CORS proxy** (advanced) | Only needed if your browser blocks the direct API call — see below. |

Tap **Run backtest** and you get: total return, ending equity, realized vs.
unrealized P&L, free cash, max drawdown, trade count, sell win-rate, an equity
curve, your still-open positions, and the full copied-trade log.

## How the simulation works

- Trades are fetched from `https://data-api.polymarket.com/trades?user=<wallet>`
  (paginated) and replayed oldest → newest.
- **Buys:** you buy `his_size × copy_ratio` shares at his price moved *against* you
  by the slippage %, plus fee. If cash is short, the buy is partially filled (or
  skipped, per your setting).
- **Exits / sells:** when he sells, you mirror the *fraction* of the position he's
  closing — if he dumps 100% of a position, you sell 100% of yours; if he trims
  50%, you trim 50%. Sells fill at his price moved against you by slippage, minus
  fee. This is how "exit when he exits" is enforced.
- **Slippage** is applied as an adverse % on every fill (buys pay more, sells
  receive less), modelling the price difference from copying after you see his
  trade.
- **Open positions** left at the end of the window are marked at the last price
  seen for that market (mark-to-market), since the future/resolution is unknown.

## Limitations (read these)

- **Open positions are marked at last seen price, not at market resolution.**
  Unrealized P&L is an estimate; a position that later resolves to $1 or $0 will
  differ. For the cleanest read, use a window where the trader has already closed
  most positions.
- Uses **executed trades only** — it does not model the trader's redemptions,
  merges/splits, or USDC deposits/withdrawals.
- Slippage is a **flat assumption**, not order-book depth. Large copy ratios on
  thin markets would realistically slip more than the flat number.
- The wallet must be the trader's **proxy wallet** (the one in their profile URL),
  which is what the data API keys on.

## If the API call is blocked (CORS)

The app talks to Polymarket directly from your browser. If your browser blocks
that with a CORS/network error, open **Advanced settings** and paste a CORS proxy
prefix (e.g. `https://corsproxy.io/?`) into the *CORS proxy prefix* field, then
run again. Note this routes the request through a third party.

---

*Educational tool. Not financial advice. Past performance does not guarantee
future results.*
