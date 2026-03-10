export default async function handler(req, res) {
  const { sym, full, chart } = req.query;
  if (!sym) return res.status(400).json({ error: 'sym required' });

  const ticker = sym.includes('.') ? sym : `${sym}.NS`;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300');

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // ── GET CRUMB + COOKIE ─────────────────────────────────────────
  // Yahoo Finance requires a crumb (CSRF token) + A3 cookie for quoteSummary
  async function getCrumb() {
    try {
      // Step 1: hit the consent page to get cookie
      const c1 = await fetch('https://finance.yahoo.com/quote/' + ticker, {
        headers: { 'User-Agent': UA, 'Accept': 'text/html' },
        redirect: 'follow',
      });
      const cookies = c1.headers.get('set-cookie') || '';
      // Extract A1/A3 cookie
      const cookieStr = cookies.split(',')
        .map(c => c.split(';')[0].trim())
        .filter(c => c.startsWith('A1=') || c.startsWith('A3=') || c.startsWith('A1S=') || c.startsWith('GUC='))
        .join('; ');

      // Step 2: get crumb
      const c2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: { 'User-Agent': UA, 'Cookie': cookieStr },
      });
      const crumb = await c2.text();
      if (!crumb || crumb.includes('<')) return null;
      return { crumb: crumb.trim(), cookieStr };
    } catch(e) { return null; }
  }

  try {
    // ── CHART REQUEST ──────────────────────────────────────────────
    if (chart) {
      const rangeMap    = { '1D':'1d','1W':'5d','1M':'1mo','3M':'3mo','6M':'6mo','1Y':'1y','3Y':'3y' };
      const intervalMap = { '1D':'5m','1W':'15m','1M':'1d','3M':'1d','6M':'1d','1Y':'1wk','3Y':'1wk' };
      const range    = rangeMap[chart] || '1mo';
      const interval = intervalMap[chart] || '1d';
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}&includePrePost=false`,
        { headers: { 'User-Agent': UA } });
      const j = await r.json();
      const result = j?.chart?.result?.[0];
      if (!result) return res.status(404).json({ error: 'No chart data' });
      const ts = result.timestamp || [];
      const cl = result.indicators?.quote?.[0]?.close || [];
      return res.status(200).json({ points: ts.map((t,i) => ({t:t*1000,c:cl[i]})).filter(p=>p.c!=null) });
    }

    // ── PRICE ──────────────────────────────────────────────────────
    const priceR = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`,
      { headers: { 'User-Agent': UA } });
    const priceJ = await priceR.json();
    const pr = priceJ?.chart?.result?.[0];
    if (!pr) return res.status(404).json({ error: priceJ?.chart?.error?.description || 'Not found' });
    const meta = pr.meta;
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
    const session = await getCrumb();
    const modules = 'summaryDetail,defaultKeyStatistics,financialData,assetProfile,majorHoldersBreakdown,calendarEvents';

    let r = null;
    let _src = null;

    if (session) {
      const { crumb, cookieStr } = session;
      const qsUrls = [
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${encodeURIComponent(modules)}&crumb=${encodeURIComponent(crumb)}`,
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${encodeURIComponent(modules)}&crumb=${encodeURIComponent(crumb)}`,
      ];
      for (const url of qsUrls) {
        try {
          const resp = await fetch(url, { headers: { 'User-Agent': UA, 'Cookie': cookieStr } });
          const j = await resp.json();
          if (j?.quoteSummary?.result?.length > 0) {
            r = j.quoteSummary.result[0];
            _src = url.includes('query2') ? 'crumb+q2' : 'crumb+q1';
            break;
          }
        } catch(_) {}
      }
    }

    // Fallback — no crumb, try anyway
    if (!r) {
      for (const url of [
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${encodeURIComponent(modules)}`,
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${encodeURIComponent(modules)}`,
        `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${ticker}?modules=${encodeURIComponent(modules)}&formatted=false`,
      ]) {
        try {
          const resp = await fetch(url, { headers: { 'User-Agent': UA } });
          const j = await resp.json();
          if (j?.quoteSummary?.result?.length > 0) { r = j.quoteSummary.result[0]; _src = 'no-crumb'; break; }
        } catch(_) {}
      }
    }

    if (!r) return res.status(200).json({ ...base, fundamentals: { _src: 'ALL_FAILED' }, corpActions: [] });

    // ── PARSE ──────────────────────────────────────────────────────
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
        text:'Quarterly results expected',sub:`Expected: ${hi&&hi!==lo?fmtDate(lo)+' – '+fmtDate(hi):fmtDate(lo)}`});
    }
    if (sd.exDividendDate?.raw) {
      const ex=sd.exDividendDate.raw;
      corpActions.push({type:'div',label:'DIVIDEND',date:fmtDate(ex),upcoming:new Date(ex*1000)>new Date(),
        text:sd.dividendRate?.raw?`₹${sd.dividendRate.raw.toFixed(2)} per share`:'Dividend declared',
        sub:`Ex-Date: ${fmtDate(ex)}`});
    }
    if (ks.lastSplitDate?.raw) {
      corpActions.push({type:'split',label:'SPLIT',upcoming:false,date:fmtDate(ks.lastSplitDate.raw),
        text:ks.lastSplitFactor?`Stock split ${ks.lastSplitFactor?.raw||ks.lastSplitFactor}`:'Stock split',
        sub:`Effective: ${fmtDate(ks.lastSplitDate.raw)}`});
    }

    return res.status(200).json({ ...base, fundamentals, corpActions });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
