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
  res.setHeader('Cache-Control', 's-maxage=300');

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
    // Use v8/chart with modules=financialData etc — same endpoint that works for charts
    // This avoids quoteSummary which is heavily blocked on server IPs
    const modules = 'financialData,defaultKeyStatistics,summaryDetail,assetProfile,majorHoldersBreakdown,calendarEvents';
    
    // Try v8 chart first (most reliable — same one that loads the chart)
    // Then fall back to quoteSummary endpoints
    const priceUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d&includePrePost=false`;
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

    // ── FUNDAMENTALS — try 4 endpoints in order ────────────────────
    let r = null;
    let _src = null;

    const qsUrls = [
      // v7/finance/quote — lightweight, less blocked
      { url: `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}&fields=trailingPE,forwardPE,priceToBook,trailingEps,bookValue,fiftyTwoWeekHigh,fiftyTwoWeekLow,marketCap,dividendYield,beta,regularMarketVolume,epsTrailingTwelveMonths`, type: 'v7quote' },
      // quoteSummary endpoints
      { url: `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}&corsDomain=finance.yahoo.com`, type: 'q1v10' },
      { url: `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}`, type: 'q2v10' },
      { url: `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${ticker}?modules=${modules}&formatted=false`, type: 'v11' },
    ];

    for (const { url, type } of qsUrls) {
      try {
        const resp = await fetch(url, { headers });
        const j    = await resp.json();
        if (type === 'v7quote') {
          const q = j?.quoteResponse?.result?.[0];
          if (q) { r = { _v7: q }; _src = type; break; }
        } else {
          if (j?.quoteSummary?.result?.length > 0) {
            r = j.quoteSummary.result[0]; _src = type; break;
          }
        }
      } catch(_) {}
    }

    // ── PARSE FUNDAMENTALS ─────────────────────────────────────────
    const fmt  = v => v?.raw ?? v ?? null;
    const fmtp = v => v?.raw != null ? (v.raw * 100).toFixed(2) : (typeof v === 'number' ? (v * 100).toFixed(2) : null);
    const fmtc = v => {
      const n = v?.raw ?? v;
      if (n == null || isNaN(n)) return null;
      if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
      if (n >= 1e9)  return (n / 1e9).toFixed(2) + 'B';
      if (n >= 1e7)  return (n / 1e7).toFixed(2) + ' Cr';
      return n.toLocaleString('en-IN');
    };

    let fundamentals = {};

    if (r?._v7) {
      // v7/quote fields — partial but reliable
      const q = r._v7;
      fundamentals = {
        pe:        q.trailingPE || null,
        forwardPE: q.forwardPE  || null,
        pb:        q.priceToBook || null,
        eps:       q.epsTrailingTwelveMonths || null,
        bookValue: q.bookValue  || null,
        marketCap: fmtc(q.marketCap),
        divYield:  q.dividendYield ? (q.dividendYield * 100).toFixed(2) : null,
        beta:      q.beta || null,
        w52h:      q.fiftyTwoWeekHigh,
        w52l:      q.fiftyTwoWeekLow,
        _src,
      };
    } else if (r) {
      const sd = r.summaryDetail        || {};
      const ks = r.defaultKeyStatistics  || {};
      const fd = r.financialData         || {};
      const ap = r.assetProfile          || {};
      const mh = r.majorHoldersBreakdown || {};
      const ce = r.calendarEvents        || {};

      fundamentals = {
        pe:            fmt(sd.trailingPE),
        forwardPE:     fmt(sd.forwardPE),
        pb:            fmt(ks.priceToBook),
        evEbitda:      fmt(ks.enterpriseToEbitda),
        marketCap:     fmtc(sd.marketCap),
        roe:           fmtp(fd.returnOnEquity),
        roa:           fmtp(fd.returnOnAssets),
        profitMargin:  fmtp(fd.profitMargins),
        grossMargin:   fmtp(fd.grossMargins),
        ebitdaMargin:  fmtp(fd.ebitdaMargins),
        debtToEquity:  fmt(fd.debtToEquity),
        currentRatio:  fmt(fd.currentRatio),
        revenueGrowth: fmtp(fd.revenueGrowth),
        earningsGrowth:fmtp(fd.earningsGrowth),
        revenue:       fmtc(fd.totalRevenue),
        netIncome:     fmtc(fd.netIncomeToCommon),
        totalCash:     fmtc(fd.totalCash),
        totalDebt:     fmtc(fd.totalDebt),
        divYield:      fmtp(sd.dividendYield),
        beta:          fmt(sd.beta),
        eps:           fmt(ks.trailingEps),
        bookValue:     fmt(ks.bookValue),
        sector:        ap.sector          || null,
        industry:      ap.industry        || null,
        employees:     ap.fullTimeEmployees || null,
        description:   ap.longBusinessSummary || null,
        website:       ap.website         || null,
        insiderPct:    fmtp(mh.insidersPercentHeld),
        instPct:       fmtp(mh.institutionsPercentHeld),
        _src,

        // ── Corp Actions ────────────────────────────────────────────
        _earningsDate: ce.earnings?.earningsDate?.[0]?.raw,
        _earningsHigh: ce.earnings?.earningsDate?.[1]?.raw,
        _exDivDate:    sd.exDividendDate?.raw,
        _divAmount:    sd.dividendRate?.raw,
        _divYieldRaw:  sd.dividendYield?.raw,
        _splitFactor:  ks.lastSplitFactor?.raw || ks.lastSplitFactor,
        _splitDate:    ks.lastSplitDate?.raw,
      };
    } else {
      // All endpoints failed — return base price with empty fundamentals
      return res.status(200).json({ ...base, fundamentals: { _src: 'ALL_FAILED' }, corpActions: [] });
    }

    // ── BUILD CORP ACTIONS ─────────────────────────────────────────
    const fmtDate = ts => {
      if (!ts) return null;
      return new Date(ts * 1000).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
    };

    const corpActions = [];
    if (fundamentals._earningsDate) {
      const lo = fundamentals._earningsDate, hi = fundamentals._earningsHigh;
      corpActions.push({
        type: 'earnings', label: 'EARNINGS', upcoming: true,
        date: fmtDate(lo),
        text: 'Quarterly results expected',
        sub:  `Expected: ${hi && hi !== lo ? fmtDate(lo) + ' – ' + fmtDate(hi) : fmtDate(lo)}`,
      });
    }
    if (fundamentals._exDivDate) {
      corpActions.push({
        type: 'div', label: 'DIVIDEND',
        date: fmtDate(fundamentals._exDivDate),
        upcoming: new Date(fundamentals._exDivDate * 1000) > new Date(),
        text: fundamentals._divAmount ? `₹${fundamentals._divAmount.toFixed(2)} per share` : 'Dividend declared',
        sub:  `Ex-Date: ${fmtDate(fundamentals._exDivDate)}${fundamentals._divYieldRaw ? ` · Yield: ${(fundamentals._divYieldRaw*100).toFixed(2)}%` : ''}`,
      });
    }
    if (fundamentals._splitDate) {
      corpActions.push({
        type: 'split', label: 'SPLIT', upcoming: false,
        date: fmtDate(fundamentals._splitDate),
        text: fundamentals._splitFactor ? `Stock split ${fundamentals._splitFactor}` : 'Stock split',
        sub:  `Effective: ${fmtDate(fundamentals._splitDate)}`,
      });
    }
    // Clean internal fields
    ['_earningsDate','_earningsHigh','_exDivDate','_divAmount','_divYieldRaw','_splitFactor','_splitDate'].forEach(k => delete fundamentals[k]);

    return res.status(200).json({ ...base, fundamentals, corpActions });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
