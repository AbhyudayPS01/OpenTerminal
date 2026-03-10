// Fetches historical corporate actions for a stock from NSE India
// GET /api/nseactions?sym=RELIANCE&from=01-01-2023&to=31-12-2024

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600'); // Cache 1 hour

  const { sym, from, to } = req.query;
  if (!sym) return res.status(400).json({ error: 'sym required' });

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.nseindia.com/',
    'Connection': 'keep-alive',
  };

  try {
    // Step 1: get cookies from NSE homepage
    const homeRes = await fetch('https://www.nseindia.com', { headers });
    const rawCookies = homeRes.headers.get('set-cookie') || '';
    const cookieStr = rawCookies
      .split(/,(?=[^;]+=[^;])/)
      .map(c => c.split(';')[0].trim())
      .join('; ');

    // Step 2: fetch corporate actions
    const today   = new Date();
    const twoYAgo = new Date(); twoYAgo.setFullYear(today.getFullYear() - 2);
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}`;

    const fromDate = from || fmt(twoYAgo);
    const toDate   = to   || fmt(today);

    const url = `https://www.nseindia.com/api/corporates-corporateActions?index=equities&symbol=${encodeURIComponent(sym)}&from_date=${fromDate}&to_date=${toDate}`;

    const actionRes = await fetch(url, {
      headers: { ...headers, 'Cookie': cookieStr }
    });

    if (!actionRes.ok) {
      return res.status(200).json({ actions: [], error: `NSE returned ${actionRes.status}` });
    }

    const raw = await actionRes.json();

    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(200).json({ actions: [] });
    }

    // Parse NSE's free-text "purpose" field
    const parseAction = item => {
      const purpose = (item.purpose || '').toUpperCase();
      const exDate  = item.exDate || item.ex_date || '';
      const recDate = item.record_date || item.recDate || '';
      const dateStr = exDate || recDate || '';

      let type  = 'div';
      let label = 'DIVIDEND';
      let text  = item.purpose || 'Corporate Action';
      let sub   = '';

      if (purpose.includes('BONUS'))        { type = 'bonus';  label = 'BONUS'; }
      else if (purpose.includes('SPLIT'))   { type = 'split';  label = 'SPLIT'; }
      else if (purpose.includes('RIGHTS'))  { type = 'rights'; label = 'RIGHTS'; }
      else if (purpose.includes('AGM') || purpose.includes('ANNUAL GENERAL')) {
        type = 'agm'; label = 'AGM';
      }
      else if (purpose.includes('DIVIDEND') || purpose.includes('INTERIM') || purpose.includes('FINAL')) {
        type = 'div'; label = 'DIVIDEND';
        // Try to extract amount e.g. "FINAL DIVIDEND - RS 8.50 PER SHARE"
        const amtMatch = purpose.match(/RS\.?\s*([\d.]+)\s*PER/i);
        if (amtMatch) sub = `₹${amtMatch[1]} per share`;
      }

      // Format date from NSE format dd-MMM-yyyy to readable
      let dateDisplay = dateStr;
      try {
        if (dateStr) {
          const d = new Date(dateStr.replace(/-/g, ' '));
          if (!isNaN(d)) {
            dateDisplay = d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
          }
        }
      } catch(_) {}

      if (exDate) sub = (sub ? sub + ' · ' : '') + `Ex-Date: ${dateDisplay}`;
      else if (recDate) sub = (sub ? sub + ' · ' : '') + `Record: ${dateDisplay}`;

      return { type, label, date: dateDisplay, text: item.purpose || text, sub };
    };

    const actions = raw.map(parseAction);

    return res.status(200).json({ actions, count: actions.length, source: 'nse' });

  } catch (e) {
    return res.status(200).json({ actions: [], error: e.message });
  }
}
