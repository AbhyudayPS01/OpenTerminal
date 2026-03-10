export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300');

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const headers = {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
  };

  const tickers = [
    '^NSEI', '^BSESN', '^NSEBANK', 'NIFTY50FUT.NS',
    'USDINR=X', 'EURINR=X', 'GBPINR=X',
    '^GSPC', '^IXIC', '^DJI', '^FTSE', '^N225', '^HSI',
    'BZ=F', 'GC=F', 'SI=F',
    '^TNX', '^IN10YT=RR',
  ];

  // ── GET CRUMB (same pattern that works for quote.js) ───────────
  async function getCrumb() {
    try {
      const c1 = await fetch('https://finance.yahoo.com', {
        headers: { 'User-Agent': UA, 'Accept': 'text/html' },
        redirect: 'follow',
      });
      const rawCookies = c1.headers.get('set-cookie') || '';
      const cookieStr = rawCookies.split(',')
        .map(c => c.split(';')[0].trim())
        .filter(c => /^(A1|A3|A1S|GUC)=/.test(c))
        .join('; ');
      const c2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: { 'User-Agent': UA, 'Cookie': cookieStr },
      });
      const crumb = (await c2.text()).trim();
      if (!crumb || crumb.startsWith('<')) return null;
      return { crumb, cookieStr };
    } catch(e) { return null; }
  }

  try {
    // ── FETCH MARKET DATA WITH CRUMB ───────────────────────────────
    const session = await getCrumb();
    let quotes = [];

    if (session) {
      const { crumb, cookieStr } = session;
      // v7/quote with crumb — authenticated, works from Vercel
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers.join(',')}&crumb=${encodeURIComponent(crumb)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,shortName,regularMarketTime`;
      try {
        const r = await fetch(url, { headers: { ...headers, 'Cookie': cookieStr } });
        const j = await r.json();
        quotes = j?.quoteResponse?.result || [];
      } catch(_) {}
    }

    // Fallback — try without crumb
    if (quotes.length === 0) {
      try {
        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers.join(',')}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,shortName,regularMarketTime`;
        const r = await fetch(url, { headers });
        const j = await r.json();
        quotes = j?.quoteResponse?.result || [];
      } catch(_) {}
    }

    // Also try query2 if still empty
    if (quotes.length === 0) {
      try {
        const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${tickers.join(',')}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,shortName`;
        const r = await fetch(url, { headers });
        const j = await r.json();
        quotes = j?.quoteResponse?.result || [];
      } catch(_) {}
    }

    const mkt = {};
    quotes.forEach(q => {
      mkt[q.symbol] = {
        price: q.regularMarketPrice,
        chg:   q.regularMarketChange,
        pct:   q.regularMarketChangePercent,
        up:    q.regularMarketChange >= 0,
        name:  q.shortName || q.symbol,
        ts:    q.regularMarketTime,
      };
    });

    // ── NSE FII/DII ────────────────────────────────────────────────
    let fiiDii = null;
    try {
      const nseHeaders = {
        'User-Agent': UA,
        'Accept': '*/*',
        'Referer': 'https://www.nseindia.com/',
        'Accept-Language': 'en-US,en;q=0.9',
      };
      const cookieRes = await fetch('https://www.nseindia.com', { headers: nseHeaders });
      const cookies = cookieRes.headers.get('set-cookie') || '';
      const fiiRes = await fetch('https://www.nseindia.com/api/fiidiiTradeReact', {
        headers: { ...nseHeaders, 'Cookie': cookies }
      });
      const fiiJson = await fiiRes.json();
      if (Array.isArray(fiiJson) && fiiJson.length > 0) {
        const latest = fiiJson[0];
        fiiDii = {
          date:      latest?.date     || '',
          fii_buy:   latest?.fiiBuy   || 0,
          fii_sell:  latest?.fiiSell  || 0,
          fii_net:   latest?.fiiNet   || 0,
          dii_buy:   latest?.diiBuy   || 0,
          dii_sell:  latest?.diiSell  || 0,
          dii_net:   latest?.diiNet   || 0,
        };
      }
    } catch(_) {}

    // ── RBI STATIC (updated manually at each MPC meeting) ─────────
    const rbi = {
      repo_rate:   '5.25%',
      repo_change: '↓ Cut 25bps Feb 7, 2025',
      repo_note:   'Next MPC: Apr 7–9, 2026',
      cpi:         '4.31%',
      cpi_note:    'Feb 2026 — Within 2%–6% band',
      cpi_change:  '↓ From 5.22% prev month',
      gdp:         '8.2%',
      gdp_note:    'Q2 FY26 — Fastest G20 economy',
      gdp_change:  '↑ Revised up from 6.4%',
      crr:         '3.00%',
      sdf:         '5.00%',
      msf:         '5.50%',
      fx_reserves: '$654.9B',
      fx_note:     'As of Feb 28, 2026',
    };

    return res.status(200).json({ mkt, fiiDii, rbi, ts: Date.now(), _quotes: quotes.length });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
