// Nifty 500 stock master — fetched from niftyindices.com (official NSE subsidiary)
// This is a PUBLIC static CSV file, no auth/cookies needed — works from Vercel
// Updated monthly by NSE Indices; we cache for 24hrs on Vercel CDN

let cachedList = null;
let cacheTime  = 0;
const TTL = 24 * 60 * 60 * 1000; // 24 hours

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400');

  if (cachedList && Date.now() - cacheTime < TTL) {
    return res.status(200).json({ stocks: cachedList, source: 'cache', count: cachedList.length });
  }

  // niftyindices.com is an NSE subsidiary — serves plain CSV, no bot protection
  const CSV_URL = 'https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv';

  try {
    const r = await fetch(CSV_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'text/csv,text/plain,*/*',
        'Referer': 'https://www.niftyindices.com/',
      }
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const csv = await r.text();

    // CSV format: Company Name,Industry,Symbol,Series,ISIN Code
    const lines = csv.trim().split('\n');
    const stocks = [];

    for (let i = 1; i < lines.length; i++) {  // skip header row
      const cols = lines[i].split(',');
      if (cols.length < 3) continue;

      const name   = cols[0]?.trim();
      const sector = cols[1]?.trim();
      const sym    = cols[2]?.trim();

      if (sym && name) {
        stocks.push({ sym, name, sector: sector || '' });
      }
    }

    if (stocks.length < 100) throw new Error(`Only got ${stocks.length} stocks — likely bad response`);

    cachedList = stocks;
    cacheTime  = Date.now();

    return res.status(200).json({ stocks, source: 'niftyindices', count: stocks.length });

  } catch (e) {
    // If live fetch fails, try GitHub raw fallback (same CSV mirrored)
    try {
      const ghUrl = 'https://raw.githubusercontent.com/Hpareek07/NSEData/master/ind_nifty500list.csv';
      const r2 = await fetch(ghUrl);
      const csv2 = await r2.text();
      const lines = csv2.trim().split('\n');
      const stocks = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < 3) continue;
        const name = cols[0]?.trim(), sector = cols[1]?.trim(), sym = cols[2]?.trim();
        if (sym && name) stocks.push({ sym, name, sector: sector || '' });
      }
      if (stocks.length > 50) {
        cachedList = stocks;
        cacheTime  = Date.now();
        return res.status(200).json({ stocks, source: 'github-mirror', count: stocks.length });
      }
    } catch(_) {}

    // Final fallback — return error so frontend uses its own FALLBACK_MASTER
    return res.status(500).json({ error: e.message, stocks: [] });
  }
}
