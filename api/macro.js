export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
  };

  const nseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': '*/*',
    'Referer': 'https://www.nseindia.com/',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  try {
    // 1. Yahoo Finance — all market tickers in one call
    const tickers = [
      '^NSEI', '^BSESN', '^NSEBANK',   // Indian indices
      'USDINR=X', 'EURINR=X', 'GBPINR=X', // Currency
      '^GSPC', '^IXIC', '^DJI', '^FTSE', '^N225', '^HSI', // Global
      'BZ=F', 'GC=F', 'SI=F',           // Commodities: Brent, Gold, Silver
      '^TNX',                            // US 10Y yield
      '^IN10YT=RR',                      // India 10Y GSec yield
      'INR=X',                           // USD/INR cross check
    ];

    const yfUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers.join(',')}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,shortName,regularMarketTime`;
    const yfRes = await fetch(yfUrl, { headers });
    const yfJson = await yfRes.json();
    const quotes = yfJson?.quoteResponse?.result || [];

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

    // 2. NSE FII/DII — public endpoint (no auth needed with right headers)
    let fiiDii = null;
    try {
      // First hit NSE homepage to get cookies
      const cookieRes = await fetch('https://www.nseindia.com', { headers: nseHeaders });
      const cookies = cookieRes.headers.get('set-cookie') || '';

      const fiiRes = await fetch('https://www.nseindia.com/api/fiidiiTradeReact', {
        headers: { ...nseHeaders, 'Cookie': cookies }
      });
      const fiiJson = await fiiRes.json();
      if (fiiJson && Array.isArray(fiiJson)) {
        // Latest entry
        const latest = fiiJson[0];
        fiiDii = {
          date: latest?.date || '',
          fii_buy: latest?.fiiBuy || 0,
          fii_sell: latest?.fiiSell || 0,
          fii_net: latest?.fiiNet || 0,
          dii_buy: latest?.diiBuy || 0,
          dii_sell: latest?.diiSell || 0,
          dii_net: latest?.diiNet || 0,
        };
      }
    } catch(e) {
      fiiDii = null; // fail silently, use static fallback
    }

    // 3. RBI/Macro static data — these change at most 6x/year (MPC meetings)
    // We version these manually when RBI meets. Current as of Feb 2026.
    const rbiStatic = {
      repo_rate: '5.25%',
      repo_change: '↓ Cut 25bps Feb 7, 2025',
      repo_note: 'Next MPC: Apr 7–9, 2026',
      cpi: '4.31%',
      cpi_note: 'Feb 2026 — Within 2%–6% band',
      cpi_change: '↓ From 5.22% prev month',
      gdp: '8.2%',
      gdp_note: 'Q2 FY26 — Fastest G20 economy',
      gdp_change: '↑ Revised up from 6.4%',
      crr: '3.00%',
      sdf: '5.00%',
      msf: '5.50%',
      fx_reserves: '$654.9B',
      fx_note: 'As of Feb 28, 2026',
    };

    return res.status(200).json({
      mkt,
      fiiDii,
      rbi: rbiStatic,
      ts: Date.now(),
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
