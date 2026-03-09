export default async function handler(req, res) {
  const { sym, full } = req.query;
  if (!sym) return res.status(400).json({ error: 'sym required' });

  const ticker = sym.includes('.') ? sym : `${sym}.NS`;
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300');

  try {
    // Always fetch price data
    const priceUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`;
    const priceRes = await fetch(priceUrl, { headers });
    const priceJson = await priceRes.json();
    const priceResult = priceJson?.chart?.result;
    if (!priceResult || priceResult.length === 0) {
      const errMsg = priceJson?.chart?.error?.description || 'Ticker not found on Yahoo Finance';
      return res.status(404).json({ error: errMsg });
    }
    const meta = priceResult[0].meta;

    const price = meta.regularMarketPrice;
    const prev  = meta.chartPreviousClose || meta.previousClose;
    const chg   = price - prev;
    const pct   = (chg / prev) * 100;

    const base = {
      ticker,
      price,
      prev,
      chg,
      pct,
      up:   chg >= 0,
      high: meta.regularMarketDayHigh,
      low:  meta.regularMarketDayLow,
      vol:  meta.regularMarketVolume,
      w52h: meta.fiftyTwoWeekHigh,
      w52l: meta.fiftyTwoWeekLow,
      name: meta.longName || meta.shortName || sym,
    };

    // If full=1, also fetch quoteSummary for fundamentals
    if (full === '1') {
      const modules = 'summaryDetail,defaultKeyStatistics,financialData,assetProfile,majorHoldersBreakdown';
      const summaryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}`;
      const summaryRes = await fetch(summaryUrl, { headers });
      const summaryJson = await summaryRes.json();
      const summaryResult = summaryJson?.quoteSummary?.result;
      if (!summaryResult || summaryResult.length === 0) {
        // Return base data without fundamentals rather than crashing
        return res.status(200).json({ ...base, fundamentals: {} });
      }
      const r = summaryResult[0];

      const sd  = r.summaryDetail        || {};
      const ks  = r.defaultKeyStatistics  || {};
      const fd  = r.financialData         || {};
      const ap  = r.assetProfile          || {};
      const mh  = r.majorHoldersBreakdown || {};

      const fmt   = v => v?.raw ?? null;
      const fmtp  = v => v?.raw != null ? (v.raw * 100).toFixed(2) : null;
      const fmtc  = v => {
        const n = v?.raw;
        if (n == null) return null;
        if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
        if (n >= 1e9)  return (n / 1e9).toFixed(2) + 'B';
        if (n >= 1e7)  return (n / 1e7).toFixed(2) + ' Cr';
        return n.toLocaleString('en-IN');
      };

      const fundamentals = {
        pe:           fmt(sd.trailingPE),
        forwardPE:    fmt(sd.forwardPE),
        pb:           fmt(ks.priceToBook),
        evEbitda:     fmt(ks.enterpriseToEbitda),
        marketCap:    fmtc(sd.marketCap),
        roe:          fmtp(fd.returnOnEquity),
        roa:          fmtp(fd.returnOnAssets),
        profitMargin: fmtp(fd.profitMargins),
        grossMargin:  fmtp(fd.grossMargins),
        ebitdaMargin: fmtp(fd.ebitdaMargins),
        debtToEquity: fmt(fd.debtToEquity),
        currentRatio: fmt(fd.currentRatio),
        revenueGrowth:fmtp(fd.revenueGrowth),
        earningsGrowth:fmtp(fd.earningsGrowth),
        revenue:      fmtc(fd.totalRevenue),
        netIncome:    fmtc(fd.netIncomeToCommon),
        totalCash:    fmtc(fd.totalCash),
        totalDebt:    fmtc(fd.totalDebt),
        divYield:     fmtp(sd.dividendYield),
        beta:         fmt(sd.beta),
        eps:          fmt(ks.trailingEps),
        bookValue:    fmt(ks.bookValue),
        sector:       ap.sector || null,
        industry:     ap.industry || null,
        employees:    ap.fullTimeEmployees || null,
        description:  ap.longBusinessSummary || null,
        website:      ap.website || null,
        insiderPct:   fmtp(mh.insidersPercentHeld),
        instPct:      fmtp(mh.institutionsPercentHeld),
      };

      return res.status(200).json({ ...base, fundamentals });
    }

    return res.status(200).json(base);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
