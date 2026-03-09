export default async function handler(req, res) {
  const { sym } = req.query;
  if (!sym) return res.status(400).json({ error: 'sym required' });

  const ticker = sym.includes('.') ? sym : `${sym}.NS`;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const json = await r.json();
    const meta = json.chart.result[0].meta;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=300'); // cache 5 min on Vercel edge
    res.status(200).json({
      price: meta.regularMarketPrice,
      prev:  meta.chartPreviousClose || meta.previousClose,
      high:  meta.regularMarketDayHigh,
      low:   meta.regularMarketDayLow,
      vol:   meta.regularMarketVolume,
      w52h:  meta.fiftyTwoWeekHigh,
      w52l:  meta.fiftyTwoWeekLow,
      name:  meta.longName || meta.shortName,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
