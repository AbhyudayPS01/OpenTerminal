export default async function handler(req, res) {
  const { sym, full, chart } = req.query;
  if (!sym) return res.status(400).json({ error: 'sym required' });

  const ticker = sym.includes('.') ? sym : `${sym}.NS`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
  };

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60');

  try {
    // ── CHART REQUEST ──────────────────────────────────────────────
    if (chart) {
      const rangeMap    = { '1D':'1d','1W':'5d','1M':'1mo','3M':'3mo','6M':'6mo','1Y':'1y','3Y':'3y' };
      const intervalMap = { '1D':'5m','1W':'15m','1M':'1d','3M':'1d','6M':'1d','1Y':'1wk','3Y':'1wk' };
      const range    = rangeMap[chart]    || '1mo';
      const interval = intervalMap[chart] || '1d';
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}&includePrePost=false`;
      const r = await fetch(url, { headers });
      const j = await r.json();
      const result = j?.chart?.result?.[0];
      if (!result) return res.status(404).json({ error: 'No chart data' });
      const timestamps = result.timestamp || [];
      const closes     = result.indicators?.quote?.[0]?.close || [];
      const points     = timestamps.map((t, i) => ({ t: t * 1000, c: closes[i] })).filter(p => p.c != null);
      return res.status(200).json({ points });
    }

    // ── PRICE + FUNDAMENTALS ───────────────────────────────────────
    // v8/chart with modules — SAME endpoint as chart, proven to work on Vercel
    // Request 1yr range so meta has full stats + use modules param for fundamentals
    const fmtc = n => {
      if (n == null || isNaN(n)) return null;
      if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
      if (n >= 1e9)  return (n / 1e9).toFixed(2) + 'B';
      if (n >= 1e7)  return (n / 1e7).toFixed(2) + ' Cr';
      return n.toLocaleString('en-IN');
    };

    // Fetch chart with financialData modules included
    const modules = 'financialData,defaultKeyStatistics,summaryDetail,assetProfile,majorHoldersBreakdown,calendarEvents';
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y&includePrePost=false&modules=${encodeURIComponent(modules)}`;
    const r1 = await fetch(chartUrl, { headers });
    const j1 = await r1.json();
    const result = j1?.chart?.result?.[0];

    if (!result) {
      const errMsg = j1?.chart?.error?.description || 'Ticker not found';
      return res.status(404).json({ error: errMsg });
    }

    const meta = result.meta;
    const price = meta.regularMarketPrice;
    const prev  = meta.chartPreviousClose || meta.previousClose;
    const chg   = price - prev;
    const pct   = (chg / prev) * 100;

    const base = {
      ticker, price, prev, chg, pct,
      up:   chg >= 0,
      high: meta.regularMarketDayHigh,
      low:  meta.regularMarketDayLow,
      vol:  meta.regularMarketVolume,
      w52h: meta.fiftyTwoWeekHigh,
      w52l: meta.fiftyTwoWeekLow,
      name: meta.longName || meta.shortName || sym,
    };

    if (full !== '1') return res.status(200).json(base);

    // ── EXTRACT FUNDAMENTALS FROM CHART META ───────────────────────
    // v8/chart meta contains: trailingPE, trailingAnnualDividendYield,
    // regularMarketVolume, fiftyTwoWeekHigh/Low, marketCap (in exchangeDataDelayedBy)
    // Plus the modules we requested get appended to the response

    // Check if modules came back (they do when requested via modules param)
    const fd = result.financialData        || {};
    const ks = result.defaultKeyStatistics  || {};
    const sd = result.summaryDetail         || {};
    const ap = result.assetProfile          || {};
    const mh = result.majorHoldersBreakdown || {};
    const ce = result.calendarEvents        || {};

    const hasModules = Object.keys(fd).length > 0 || Object.keys(ks).length > 0;

    let fundamentals;

    if (hasModules) {
      // Full fundamentals from modules
      const fmt  = v => v?.raw ?? v ?? null;
      const fmtp = v => v?.raw != null ? (v.raw * 100).toFixed(2) : (typeof v === 'number' ? (v * 100).toFixed(2) : null);

      fundamentals = {
        pe:            fmt(sd.trailingPE)          ?? meta.trailingPE ?? null,
        forwardPE:     fmt(sd.forwardPE)           ?? null,
        pb:            fmt(ks.priceToBook)         ?? null,
        evEbitda:      fmt(ks.enterpriseToEbitda)  ?? null,
        marketCap:     fmtc(sd.marketCap?.raw ?? meta.marketCap),
        roe:           fmtp(fd.returnOnEquity),
        roa:           fmtp(fd.returnOnAssets),
        profitMargin:  fmtp(fd.profitMargins),
        grossMargin:   fmtp(fd.grossMargins),
        ebitdaMargin:  fmtp(fd.ebitdaMargins),
        debtToEquity:  fmt(fd.debtToEquity),
        currentRatio:  fmt(fd.currentRatio),
        revenueGrowth: fmtp(fd.revenueGrowth),
        earningsGrowth:fmtp(fd.earningsGrowth),
        revenue:       fmtc(fd.totalRevenue?.raw),
        netIncome:     fmtc(fd.netIncomeToCommon?.raw),
        totalCash:     fmtc(fd.totalCash?.raw),
        totalDebt:     fmtc(fd.totalDebt?.raw),
        divYield:      fmtp(sd.dividendYield)      ?? (meta.trailingAnnualDividendYield ? (meta.trailingAnnualDividendYield * 100).toFixed(2) : null),
        beta:          fmt(sd.beta)                ?? meta.beta ?? null,
        eps:           fmt(ks.trailingEps)         ?? meta.epsTrailingTwelveMonths ?? null,
        bookValue:     fmt(ks.bookValue)           ?? null,
        sector:        ap.sector                  || null,
        industry:      ap.industry                || null,
        employees:     ap.fullTimeEmployees        || null,
        description:   ap.longBusinessSummary      || null,
        website:       ap.website                  || null,
        insiderPct:    fmtp(mh.insidersPercentHeld),
        instPct:       fmtp(mh.institutionsPercentHeld),
        _src: 'v8+modules',
      };
    } else {
      // Modules didn't come back — extract what we can from meta alone
      // meta reliably has: trailingPE, marketCap, 52wk, volume, eps, beta, dividendYield
      fundamentals = {
        pe:        meta.trailingPE                  || null,
        forwardPE: meta.forwardPE                   || null,
        eps:       meta.epsTrailingTwelveMonths      || null,
        beta:      meta.beta                        || null,
        marketCap: fmtc(meta.marketCap),
        divYield:  meta.trailingAnnualDividendYield ? (meta.trailingAnnualDividendYield * 100).toFixed(2) : null,
        w52h:      meta.fiftyTwoWeekHigh,
        w52l:      meta.fiftyTwoWeekLow,
        _src: 'v8meta',
      };
    }

    // ── CORP ACTIONS ───────────────────────────────────────────────
    const fmtDate = ts => ts ? new Date(ts * 1000).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : null;
    const corpActions = [];

    if (ce.earnings?.earningsDate?.[0]?.raw) {
      const lo = ce.earnings.earningsDate[0].raw;
      const hi = ce.earnings.earningsDate[1]?.raw;
      corpActions.push({ type:'earnings', label:'EARNINGS', upcoming:true, date:fmtDate(lo),
        text:'Quarterly results expected', sub:`Expected: ${hi && hi!==lo ? fmtDate(lo)+' – '+fmtDate(hi) : fmtDate(lo)}` });
    }
    if (sd.exDividendDate?.raw) {
      const ex = sd.exDividendDate.raw;
      corpActions.push({ type:'div', label:'DIVIDEND', date:fmtDate(ex), upcoming: new Date(ex*1000)>new Date(),
        text: sd.dividendRate?.raw ? `₹${sd.dividendRate.raw.toFixed(2)} per share` : 'Dividend declared',
        sub: `Ex-Date: ${fmtDate(ex)}` });
    }
    if (ks.lastSplitDate?.raw) {
      corpActions.push({ type:'split', label:'SPLIT', upcoming:false, date:fmtDate(ks.lastSplitDate.raw),
        text: ks.lastSplitFactor ? `Stock split ${ks.lastSplitFactor.raw||ks.lastSplitFactor}` : 'Stock split',
        sub: `Effective: ${fmtDate(ks.lastSplitDate.raw)}` });
    }

    return res.status(200).json({ ...base, fundamentals, corpActions });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
