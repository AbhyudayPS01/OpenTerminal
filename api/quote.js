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
    // Chart-only request — return OHLC history
    if (chart) {
      const rangeMap = { '1D':'1d','1W':'5d','1M':'1mo','3M':'3mo','6M':'6mo','1Y':'1y','3Y':'3y' };
      const intervalMap = { '1D':'5m','1W':'15m','1M':'1d','3M':'1d','6M':'1d','1Y':'1wk','3Y':'1wk' };
      const range = rangeMap[chart] || '1mo';
      const interval = intervalMap[chart] || '1d';
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}&includePrePost=false`;
      const r = await fetch(url, { headers });
      const j = await r.json();
      const result = j?.chart?.result?.[0];
      if (!result) return res.status(404).json({ error: 'No chart data' });
      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const points = timestamps.map((t, i) => ({ t: t * 1000, c: closes[i] })).filter(p => p.c != null);
      return res.status(200).json({ points });
    }

    // Always fetch price data
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

    if (full === '1') {
      const modules = 'summaryDetail,defaultKeyStatistics,financialData,assetProfile,majorHoldersBreakdown,calendarEvents';
      
      // Try multiple endpoints - Yahoo keeps changing which one works
      let r = null;
      let _debugEndpoint = null;
      const urls = [
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}&corsDomain=finance.yahoo.com`,
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}`,
        `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${ticker}?modules=${modules}&formatted=false`,
      ];

      for (const url of urls) {
        try {
          const resp = await fetch(url, { headers });
          const j = await resp.json();
          if (j?.quoteSummary?.result?.length > 0) {
            r = j.quoteSummary.result[0];
            _debugEndpoint = url.includes('v11') ? 'v11' : url.includes('query2') ? 'query2/v10' : 'query1/v10';
            break;
          }
        } catch(_) {}
      }

      if (!r) {
        return res.status(200).json({ ...base, fundamentals: {}, _debug: 'quoteSummary failed all 3 endpoints' });
      }

      const sd  = r.summaryDetail        || {};
      const ks  = r.defaultKeyStatistics  || {};
      const fd  = r.financialData         || {};
      const ap  = r.assetProfile          || {};
      const mh  = r.majorHoldersBreakdown || {};
      const ce  = r.calendarEvents        || {};

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
        sector:        ap.sector || null,
        industry:      ap.industry || null,
        employees:     ap.fullTimeEmployees || null,
        description:   ap.longBusinessSummary || null,
        website:       ap.website || null,
        insiderPct:    fmtp(mh.insidersPercentHeld),
        instPct:       fmtp(mh.institutionsPercentHeld),
        _endpoint:     _debugEndpoint,
      };

      // ── Corporate Actions from calendarEvents ──────────────────────
      const fmtDate = ts => {
        if (!ts) return null;
        const d = new Date(ts * 1000);
        return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
      };

      const corpActions = [];

      // Upcoming earnings
      const earningsDate = ce.earnings?.earningsDate?.[0]?.raw;
      const earningsLow  = ce.earnings?.earningsDate?.[0]?.raw;
      const earningsHigh = ce.earnings?.earningsDate?.[1]?.raw;
      if (earningsDate) {
        const range = earningsHigh && earningsHigh !== earningsLow
          ? `${fmtDate(earningsLow)} – ${fmtDate(earningsHigh)}`
          : fmtDate(earningsDate);
        corpActions.push({
          type: 'earnings',
          date: fmtDate(earningsDate),
          label: 'EARNINGS',
          text: 'Quarterly results expected',
          sub: `Expected: ${range}`,
          upcoming: true,
        });
      }

      // Dividend ex-date
      const exDivDate  = sd.exDividendDate?.raw;
      const divAmount  = sd.dividendRate?.raw;
      const divYieldRaw = sd.dividendYield?.raw;
      if (exDivDate) {
        corpActions.push({
          type: 'div',
          date: fmtDate(exDivDate),
          label: 'DIVIDEND',
          text: divAmount ? `₹${divAmount.toFixed(2)} per share` : 'Dividend declared',
          sub: `Ex-Date: ${fmtDate(exDivDate)}${divYieldRaw ? ` · Yield: ${(divYieldRaw*100).toFixed(2)}%` : ''}`,
          upcoming: new Date(exDivDate * 1000) > new Date(),
        });
      }

      // Last split
      const lastSplitFactor = ks.lastSplitFactor?.raw || ks.lastSplitFactor;
      const lastSplitDate   = ks.lastSplitDate?.raw;
      if (lastSplitDate) {
        corpActions.push({
          type: 'split',
          date: fmtDate(lastSplitDate),
          label: 'SPLIT',
          text: lastSplitFactor ? `Stock split ${lastSplitFactor}` : 'Stock split',
          sub: `Effective: ${fmtDate(lastSplitDate)}`,
          upcoming: false,
        });
      }

      // Sort: upcoming first, then by date desc
      corpActions.sort((a, b) => {
        if (a.upcoming && !b.upcoming) return -1;
        if (!a.upcoming && b.upcoming) return 1;
        return 0;
      });

      return res.status(200).json({ ...base, fundamentals, corpActions });
    }

    return res.status(200).json(base);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
