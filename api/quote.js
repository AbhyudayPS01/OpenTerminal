export default async function handler(req, res) {
  const { sym, full, chart } = req.query;
  if (!sym) return res.status(400).json({ error: 'sym required' });

  const ticker = sym.includes('.') ? sym : `${sym}.NS`;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60');

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // Safe JSON fetch — returns null if response is HTML or invalid
  async function safeFetch(url, opts = {}) {
    try {
      const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers||{}) } });
      const text = await r.text();
      if (text.trim().startsWith('<')) return null; // HTML error page
      return JSON.parse(text);
    } catch(e) { return null; }
  }

  // Get crumb + cookie for authenticated YF requests
  async function getCrumb() {
    try {
      const c1 = await fetch('https://finance.yahoo.com', {
        headers: { 'User-Agent': UA, 'Accept': 'text/html' }, redirect: 'follow'
      });
      const rawCookies = c1.headers.get('set-cookie') || '';
      const cookieStr = rawCookies.split(',')
        .map(c => c.split(';')[0].trim())
        .filter(c => /^(A1|A3|A1S|GUC)=/.test(c))
        .join('; ');
      if (!cookieStr) return null;
      const c2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: { 'User-Agent': UA, 'Cookie': cookieStr }
      });
      const crumb = (await c2.text()).trim();
      if (!crumb || crumb.startsWith('<')) return null;
      return { crumb, cookieStr };
    } catch(e) { return null; }
  }

  try {
    // ── CHART REQUEST ──────────────────────────────────────────────
    if (chart) {
      const rangeMap    = { '1D':'1d','1W':'5d','1M':'1mo','3M':'3mo','6M':'6mo','1Y':'1y','3Y':'3y' };
      const intervalMap = { '1D':'5m','1W':'15m','1M':'1d','3M':'1d','6M':'1d','1Y':'1wk','3Y':'1wk' };
      const range    = rangeMap[chart] || '1mo';
      const interval = intervalMap[chart] || '1d';
      const j = await safeFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}&includePrePost=false`);
      const result = j?.chart?.result?.[0];
      if (!result) return res.status(404).json({ error: 'No chart data' });
      const ts = result.timestamp || [];
      const cl = result.indicators?.quote?.[0]?.close || [];
      return res.status(200).json({ points: ts.map((t,i) => ({t:t*1000,c:cl[i]})).filter(p=>p.c!=null) });
    }

    // ── PRICE — try query1 then query2 ────────────────────────────
    let priceJ = await safeFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`);
    if (!priceJ?.chart?.result?.[0]) {
      priceJ = await safeFetch(`https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`);
    }
    const pr = priceJ?.chart?.result?.[0];
    if (!pr) return res.status(404).json({ error: 'Price data unavailable — Yahoo Finance may be blocking this region' });

    const meta  = pr.meta;
    const price = meta.regularMarketPrice;
    const prev  = meta.chartPreviousClose || meta.previousClose;
    const chg   = price - prev;
    const pct   = (chg / prev) * 100;
    const base  = {
      ticker, price, prev, chg, pct, up: chg >= 0,
      high: meta.regularMarketDayHigh, low: meta.regularMarketDayLow,
      vol:  meta.regularMarketVolume,
      w52h: meta.fiftyTwoWeekHigh, w52l: meta.fiftyTwoWeekLow,
      name: meta.longName || meta.shortName || sym,
    };

    if (full !== '1') return res.status(200).json(base);

    // ── FUNDAMENTALS WITH CRUMB ────────────────────────────────────
    const modules = 'summaryDetail,defaultKeyStatistics,financialData,assetProfile,majorHoldersBreakdown,calendarEvents';
    const session = await getCrumb();
    let r = null, _src = null;

    if (session) {
      const { crumb, cookieStr } = session;
      for (const base_url of [
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}`,
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}`,
      ]) {
        const url = `${base_url}?modules=${encodeURIComponent(modules)}&crumb=${encodeURIComponent(crumb)}`;
        const j = await safeFetch(url, { headers: { 'Cookie': cookieStr } });
        if (j?.quoteSummary?.result?.length > 0) {
          r = j.quoteSummary.result[0];
          _src = base_url.includes('query2') ? 'crumb+q2' : 'crumb+q1';
          break;
        }
      }
    }

    // Fallback without crumb
    if (!r) {
      for (const url of [
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${encodeURIComponent(modules)}`,
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${encodeURIComponent(modules)}`,
        `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${ticker}?modules=${encodeURIComponent(modules)}&formatted=false`,
      ]) {
        const j = await safeFetch(url);
        if (j?.quoteSummary?.result?.length > 0) { r = j.quoteSummary.result[0]; _src = 'no-crumb'; break; }
      }
    }

    if (!r) return res.status(200).json({ ...base, fundamentals: { _src: 'ALL_FAILED' }, corpActions: [] });

    // ── PARSE FUNDAMENTALS ─────────────────────────────────────────
    const sd = r.summaryDetail || {}, ks = r.defaultKeyStatistics || {};
    const fd = r.financialData || {}, ap = r.assetProfile || {};
    const mh = r.majorHoldersBreakdown || {}, ce = r.calendarEvents || {};

    const fmt  = v => v?.raw ?? v ?? null;
    const fmtp = v => v?.raw != null ? (v.raw*100).toFixed(2) : (typeof v==='number'?(v*100).toFixed(2):null);
    const fmtc = n => {
      if(n==null||isNaN(n)) return null;
      if(n>=1e12) return (n/1e12).toFixed(2)+'T';
      if(n>=1e9)  return (n/1e9).toFixed(2)+'B';
      if(n>=1e7)  return (n/1e7).toFixed(2)+' Cr';
      return n.toLocaleString('en-IN');
    };
    const fmtDate = ts => ts ? new Date(ts*1000).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : null;

    const fundamentals = {
      pe: fmt(sd.trailingPE), forwardPE: fmt(sd.forwardPE), pb: fmt(ks.priceToBook),
      evEbitda: fmt(ks.enterpriseToEbitda), marketCap: fmtc(sd.marketCap?.raw),
      roe: fmtp(fd.returnOnEquity), roa: fmtp(fd.returnOnAssets),
      profitMargin: fmtp(fd.profitMargins), grossMargin: fmtp(fd.grossMargins),
      ebitdaMargin: fmtp(fd.ebitdaMargins), debtToEquity: fmt(fd.debtToEquity),
      currentRatio: fmt(fd.currentRatio), revenueGrowth: fmtp(fd.revenueGrowth),
      earningsGrowth: fmtp(fd.earningsGrowth), revenue: fmtc(fd.totalRevenue?.raw),
      netIncome: fmtc(fd.netIncomeToCommon?.raw), totalCash: fmtc(fd.totalCash?.raw),
      totalDebt: fmtc(fd.totalDebt?.raw), divYield: fmtp(sd.dividendYield),
      beta: fmt(sd.beta), eps: fmt(ks.trailingEps), bookValue: fmt(ks.bookValue),
      sector: ap.sector||null, industry: ap.industry||null,
      employees: ap.fullTimeEmployees||null, description: ap.longBusinessSummary||null,
      website: ap.website||null, insiderPct: fmtp(mh.insidersPercentHeld),
      instPct: fmtp(mh.institutionsPercentHeld), _src,
    };

    const corpActions = [];
    if (ce.earnings?.earningsDate?.[0]?.raw) {
      const lo=ce.earnings.earningsDate[0].raw, hi=ce.earnings.earningsDate[1]?.raw;
      corpActions.push({type:'earnings',label:'EARNINGS',upcoming:true,date:fmtDate(lo),
        text:'Quarterly results expected',
        sub:'Expected: '+(hi&&hi!==lo?fmtDate(lo)+' – '+fmtDate(hi):fmtDate(lo))});
    }
    if (sd.exDividendDate?.raw) {
      const ex=sd.exDividendDate.raw;
      corpActions.push({type:'div',label:'DIVIDEND',date:fmtDate(ex),upcoming:new Date(ex*1000)>new Date(),
        text:sd.dividendRate?.raw?'₹'+sd.dividendRate.raw.toFixed(2)+' per share':'Dividend declared',
        sub:'Ex-Date: '+fmtDate(ex)});
    }
    if (ks.lastSplitDate?.raw) {
      corpActions.push({type:'split',label:'SPLIT',upcoming:false,date:fmtDate(ks.lastSplitDate.raw),
        text:ks.lastSplitFactor?'Stock split '+(ks.lastSplitFactor?.raw||ks.lastSplitFactor):'Stock split',
        sub:'Effective: '+fmtDate(ks.lastSplitDate.raw)});
    }

    return res.status(200).json({ ...base, fundamentals, corpActions });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
