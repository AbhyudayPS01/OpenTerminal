# ⬡ OpenTerminal

> **Bloomberg's data. Groww's soul.**  
> A free, open-source financial intelligence terminal for Indian retail investors.

**Live:** [open-terminal-pearl.vercel.app](https://open-terminal-pearl.vercel.app)

---

## The Problem

5,000+ companies are listed on NSE/BSE. Publicly available data exists — but it's inaccessible and undigested for most retail investors. Brokers have a conflict of interest. Financial media is noise.

The stock is not the problem. The person buying it is.

OpenTerminal has no commercial interest in what you buy — only in you buying well.

---

## What It Does

OpenTerminal gives retail investors the same quality of information that institutional investors have, explained in plain language.

### 5 Layers of Understanding

**1. Understand the Company**
- Key metrics with plain-language explanations (click any metric)
- Company Health Score
- Price history — ATH, ATL, 52W High/Low
- Candlestick chart with multiple timeframes
- AI Research Summary
- Automatic warnings — illiquidity, promoter pledge, valuation

**2. Understand the Context**
- Sector intelligence — what sector does this company operate in, and what drives it?
- Peer comparison across large/mid/small cap
- Shareholding trends — FII/DII/Promoter movements over 4 quarters
- Corporate actions — dividends, bonuses, splits, AGMs

**3. Understand the Timing**
- Macro Dashboard — India + 6 global economies (Repo Rate, CPI, GDP, FII Flow, US Fed, Brent Crude...)
- Economic Calendar — upcoming events that will move markets
- Bond Market — yield curve and what it means for your stocks

**4. Understand Yourself**
- Investor Fitness Check — stock-specific risk questions before you add to portfolio
- Portfolio Tracker — buy price, P&L, STCG/LTCG tax estimate
- Multiple watchlists

**5. Stay Informed**
- Smart Alerts — promoter pledge changes, dividend announcements, unusual volume
- Instant Terminal — verified investor messaging (coming soon)
- MF / ETF tab — live NAV data from AMFI, 1Y/3Y returns, NAV history chart

---

## Data Sources

| Source | Data | Cost |
|--------|------|------|
| AMFI (`api.mfapi.in`) | Mutual Fund NAVs | Free |
| Yahoo Finance | Stock prices (15-min delayed) | Free |
| Anthropic Claude API | AI research summaries, chat | Pay per use |
| RBI website | Repo rate, inflation | Free |

---

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS — no framework, no build step
- **Backend:** Vercel Serverless Functions (Node.js)
- **AI:** Anthropic Claude (`claude-sonnet-4-20250514`)
- **Hosting:** Vercel (free tier)
- **Fonts:** Space Mono + DM Sans

Single file frontend. Zero dependencies. Anyone can read, fork, and contribute.

---

## Running Locally

```bash
git clone https://github.com/AbhyudayPS01/OpenTerminal.git
cd OpenTerminal
# For live prices (needs Vercel CLI):
npm i -g vercel
vercel dev
# OR just open index.html — everything works except live stock prices
open index.html
```

---

## Roadmap

- [ ] Real NSE/BSE data via official APIs
- [ ] MF X-Ray — see exactly what stocks your SIP owns
- [ ] Mobile responsive layout
- [ ] User accounts + watchlist sync
- [ ] Broker integration — "Buy on Zerodha" referral
- [ ] Smart Alerts backend (currently demo data)
- [ ] Expand stock database beyond Nifty 50

---

## Contributing

This is MIT licensed. Fork it, improve it, submit a PR.

Areas that need the most help:
- Real NSE/BSE data integration
- Mobile CSS
- More stock data (filings, shareholding, corporate actions)
- Testing across browsers

---

## Philosophy

> *"Curious, not intimidated."*

Every number in OpenTerminal invites exploration. Click any metric and understand what it means for this specific company in this specific sector. No jargon, no noise, no conflict of interest.

OpenTerminal will always be free for users. MIT licensed. No ads.

---

## License

MIT © 2025 OpenTerminal Contributors
