// Serves the Nifty 500 stock list fetched from NSE India
// Cached for 24 hours since the list changes rarely

let cachedList = null;
let cacheTime = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400'); // 24hr CDN cache

  // Return cache if fresh
  if (cachedList && Date.now() - cacheTime < CACHE_TTL) {
    return res.status(200).json({ stocks: cachedList, source: 'cache' });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.nseindia.com/',
  };

  try {
    // Step 1: hit NSE homepage to get cookies
    const homeRes = await fetch('https://www.nseindia.com', { headers });
    const cookies = homeRes.headers.get('set-cookie') || '';
    const cookieStr = cookies.split(',').map(c => c.split(';')[0].trim()).join('; ');

    // Step 2: fetch Nifty 500 constituents
    const nse500Res = await fetch(
      'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20500',
      { headers: { ...headers, 'Cookie': cookieStr } }
    );
    const nse500Json = await nse500Res.json();

    if (!nse500Json?.data) throw new Error('No data from NSE');

    // Map to compact format: sym, name, sector
    const stocks = nse500Json.data
      .filter(s => s.symbol && s.meta?.companyName)
      .map(s => ({
        sym: s.symbol,
        name: s.meta.companyName,
        sector: s.meta.industry || s.meta.sector || '',
      }));

    cachedList = stocks;
    cacheTime = Date.now();

    return res.status(200).json({ stocks, source: 'live', count: stocks.length });

  } catch (e) {
    // Fallback: return a hardcoded Nifty 50 if NSE fails
    return res.status(200).json({
      stocks: FALLBACK_STOCKS,
      source: 'fallback',
      error: e.message
    });
  }
}

// Fallback Nifty 50 if NSE API fails
const FALLBACK_STOCKS = [
  {sym:'RELIANCE',name:'Reliance Industries Ltd',sector:'Oil & Gas'},
  {sym:'TCS',name:'Tata Consultancy Services Ltd',sector:'IT'},
  {sym:'HDFCBANK',name:'HDFC Bank Ltd',sector:'Banking'},
  {sym:'INFY',name:'Infosys Ltd',sector:'IT'},
  {sym:'ICICIBANK',name:'ICICI Bank Ltd',sector:'Banking'},
  {sym:'HINDUNILVR',name:'Hindustan Unilever Ltd',sector:'FMCG'},
  {sym:'ITC',name:'ITC Ltd',sector:'FMCG'},
  {sym:'SBIN',name:'State Bank of India',sector:'Banking'},
  {sym:'BHARTIARTL',name:'Bharti Airtel Ltd',sector:'Telecom'},
  {sym:'KOTAKBANK',name:'Kotak Mahindra Bank Ltd',sector:'Banking'},
  {sym:'LT',name:'Larsen & Toubro Ltd',sector:'Capital Goods'},
  {sym:'AXISBANK',name:'Axis Bank Ltd',sector:'Banking'},
  {sym:'WIPRO',name:'Wipro Ltd',sector:'IT'},
  {sym:'MARUTI',name:'Maruti Suzuki India Ltd',sector:'Auto'},
  {sym:'HCLTECH',name:'HCL Technologies Ltd',sector:'IT'},
  {sym:'BAJFINANCE',name:'Bajaj Finance Ltd',sector:'NBFC'},
  {sym:'ASIANPAINT',name:'Asian Paints Ltd',sector:'Chemicals'},
  {sym:'TITAN',name:'Titan Company Ltd',sector:'Consumer'},
  {sym:'ADANIENT',name:'Adani Enterprises Ltd',sector:'Conglomerate'},
  {sym:'ULTRACEMCO',name:'UltraTech Cement Ltd',sector:'Cement'},
  {sym:'NESTLEIND',name:'Nestle India Ltd',sector:'FMCG'},
  {sym:'BAJAJFINSV',name:'Bajaj Finserv Ltd',sector:'Financial Services'},
  {sym:'TATAMOTORS',name:'Tata Motors Ltd',sector:'Auto'},
  {sym:'TATASTEEL',name:'Tata Steel Ltd',sector:'Metals'},
  {sym:'NTPC',name:'NTPC Ltd',sector:'Power'},
  {sym:'POWERGRID',name:'Power Grid Corp of India',sector:'Power'},
  {sym:'SUNPHARMA',name:'Sun Pharmaceutical Industries',sector:'Pharma'},
  {sym:'TECHM',name:'Tech Mahindra Ltd',sector:'IT'},
  {sym:'JSWSTEEL',name:'JSW Steel Ltd',sector:'Metals'},
  {sym:'ONGC',name:'Oil & Natural Gas Corp Ltd',sector:'Energy'},
  {sym:'COALINDIA',name:'Coal India Ltd',sector:'Mining'},
  {sym:'BPCL',name:'Bharat Petroleum Corp Ltd',sector:'Energy'},
  {sym:'INDUSINDBK',name:'IndusInd Bank Ltd',sector:'Banking'},
  {sym:'GRASIM',name:'Grasim Industries Ltd',sector:'Diversified'},
  {sym:'CIPLA',name:'Cipla Ltd',sector:'Pharma'},
  {sym:'DRREDDY',name:'Dr Reddys Laboratories Ltd',sector:'Pharma'},
  {sym:'HEROMOTOCO',name:'Hero MotoCorp Ltd',sector:'Auto'},
  {sym:'EICHERMOT',name:'Eicher Motors Ltd',sector:'Auto'},
  {sym:'BRITANNIA',name:'Britannia Industries Ltd',sector:'FMCG'},
  {sym:'TATACONSUM',name:'Tata Consumer Products Ltd',sector:'FMCG'},
  {sym:'HDFCLIFE',name:'HDFC Life Insurance Co Ltd',sector:'Insurance'},
  {sym:'SBILIFE',name:'SBI Life Insurance Co Ltd',sector:'Insurance'},
  {sym:'APOLLOHOSP',name:'Apollo Hospitals Enterprise Ltd',sector:'Healthcare'},
  {sym:'DIVISLAB',name:'Divis Laboratories Ltd',sector:'Pharma'},
  {sym:'ZOMATO',name:'Eternal Ltd (formerly Zomato)',sector:'Consumer Tech'},
  {sym:'APOLLOTYRE',name:'Apollo Tyres Ltd',sector:'Auto Ancillary'},
  {sym:'LEELAVENTURES',name:'Hotel Leelaventure Ltd (Leela Palaces)',sector:'Hospitality'},
  {sym:'INDHOTEL',name:'Indian Hotels Company Ltd (Taj Hotels)',sector:'Hospitality'},
  {sym:'EIHOTEL',name:'EIH Ltd (Oberoi Hotels)',sector:'Hospitality'},
  {sym:'DLF',name:'DLF Ltd',sector:'Real Estate'},
  {sym:'NAUKRI',name:'Info Edge India Ltd (Naukri)',sector:'Internet'},
];
