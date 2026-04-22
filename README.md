# ⬡ OpenTerminal

> **Free. Open Source. Built for India.**  
> A Bloomberg-style financial terminal for Indian retail investors — no paywall, no login, no ads.

**Live → [open-terminal-pearl.vercel.app](https://open-terminal-pearl.vercel.app)**

---

## Why

Bloomberg Terminal costs $24,000/year. Retail investors in India have no equivalent.

OpenTerminal gives you institutional-quality data — live prices, 20+ fundamental metrics, macro dashboard, AI research — completely free, in your browser, with no account required.

---

## What's Working Today

### Terminal
- **Live stock data** — Price, P&L, Volume for 317 Nifty 500 stocks
- **20 fundamental metrics** — Market Cap, P/E, Forward P/E, P/B, EV/EBITDA, EPS, Book Value, Revenue, Gross Margin, Profit Margin, EBITDA Margin, ROE, ROA, Rev Growth, Earnings Growth, Debt/Equity, Total Cash, Total Debt, Div Yield, Beta
- **Ownership data** — Insider % and Institutional %
- **Price history** — ATH, ATL, 52W High/Low, Day High/Low
- **Interactive chart** — 1D / 1W / 1M / 3M / 6M / 1Y / 3Y timeframes
- **About** — Company description, employees, website, sector, industry
- **Corp Actions** — Upcoming earnings date, ex-dividend date, last stock split
- **AI Research** — Plain English stock analysis powered by Gemini (bring your own free API key)
- **Metric explainer** — Click any metric to understand what it means

### Header Bar (Live)
NIFTY 50 · GIFT NIFTY · SENSEX · ₹/$ · GOLD · SILVER · BRENT — all live

### Macro Dashboard
- Indian indices — Nifty 50, Sensex, Bank Nifty
- Global markets — S&P 500, Nasdaq, Dow, FTSE, Nikkei, Hang Seng
- Currencies — USD/INR, EUR/INR, GBP/INR
- Commodities — Brent Crude, Gold, Silver
- Bonds — US 10Y, India 10Y GSec
- FII/DII flows — Daily institutional buying/selling
- RBI data — Repo Rate, CPI, GDP, CRR, Forex Reserves

### Other
- Multiple watchlists + portfolio tracker
- Search across 317 NSE-listed companies

---

## Coming Soon (Contributions Welcome)

- [ ] Shareholding tab — FII/DII/Promoter quarterly trends
- [ ] Peer comparison — sector peers side by side
- [ ] Bonds tab — live yield curve
- [ ] F&O data — OI, PCR, IV
- [ ] Mobile responsive layout
- [ ] MF / ETF tab — live AMFI NAV data
- [ ] Smart Alerts — promoter pledge, unusual volume
- [ ] Expand stock list to full Nifty 500 + BSE 500

---

## AI Research Setup

OpenTerminal uses Google Gemini for AI stock analysis. Each user brings their own free API key — your key stays in your browser, never on our servers.

1. Get a free key at [aistudio.google.com](https://aistudio.google.com) — 1500 calls/day free, no credit card
2. Open any stock → Overview tab → click **↻ REFRESH** in the AI Research section
3. Paste your key when prompted — saved locally in your browser, never shared

---

## Data Sources

| Source | Data |
|--------|------|
| Yahoo Finance | Live prices, fundamentals, charts |
| NSE India | FII/DII daily flows |
| Google Gemini | AI research (user's own key) |
| RBI | Repo rate, CPI, GDP (updated at MPC meetings) |

All data is free. No paid APIs.

---

## Tech Stack

- **Frontend** — Vanilla HTML/CSS/JS. No framework, no build step, no npm
- **Backend** — Vercel Serverless Functions (Node.js) — 2 files: `api/quote.js` and `api/macro.js`
- **Hosting** — Vercel free tier
- **Fonts** — Space Mono + DM Sans

Single HTML file frontend. Two API files. Read the entire codebase in an afternoon.

---

## Running Locally

```bash
git clone https://github.com/AbhyudayPS01/OpenTerminal.git
cd OpenTerminal

# With live prices (requires Vercel CLI):
npm i -g vercel
vercel dev

# Without live prices (everything else works):
open index.html
```

---

## Contributing

MIT licensed. Fork it, fix it, improve it, submit a PR.

**Codebase:**
- `index.html` — entire frontend
- `api/quote.js` — stock price + fundamentals
- `api/macro.js` — macro dashboard data

**Most needed:**
- Mobile CSS — India is mobile-first, biggest gap right now
- Shareholding tab — BSE/NSE quarterly data
- Peer comparison
- F&O data — OI, PCR, IV (biggest differentiator if someone builds this)
- Full Nifty 500 + BSE 500 stock coverage

No gatekeeping. Open a PR.

---

## Philosophy

> *The stock is not the problem. The person buying it is.*

OpenTerminal has no commercial interest in what you buy — only in you buying well.

No ads. No broker referrals. No paywalls. MIT licensed forever.

---

## License

MIT © 2026 OpenTerminal Contributors  
Built with ♥ in Ankleshwar, Gujarat, India
