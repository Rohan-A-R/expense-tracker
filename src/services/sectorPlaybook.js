// Sector playbooks — what a stock's *context* is, per industry.
//
// Analysing TATASTEEL by itself is nearly useless. What matters is: how is steel doing,
// what are iron ore and HRC futures doing, how do JSW/SAIL/Jindal compare, and what has
// changed geopolitically (China dumping, safeguard duty, EU carbon border tax).
// Every sector needs a *different* set of those inputs — a bank needs RBI policy and bond
// yields, an IT firm needs USD-INR and US demand. This file encodes that mapping.
//
// Matching is keyword-based on Yahoo's `industry` + `sector` strings, because Yahoo's
// labels vary ("Banks—Regional", "Banks - Diversified", "Steel"). First rule that matches
// wins, so order runs specific → general.
//
// Every symbol here was verified live against Yahoo before being added.

// Macro context that matters to every Indian stock, regardless of sector.
export const BASE_DRIVERS = [
  { symbol: '^NSEI', label: 'NIFTY 50' },
  { symbol: 'INR=X', label: 'USD/INR' },
]

const PLAYBOOKS = [
  {
    key: 'steel',
    match: /steel|iron|ferrous/i,
    drivers: [
      { symbol: 'TIO=F', label: 'Iron ore' },
      { symbol: 'HRC=F', label: 'Steel HRC futures' },
      { symbol: 'HG=F', label: 'Copper (industrial demand)' },
      { symbol: '^CNXMETAL', label: 'NIFTY Metal' },
    ],
    research: [
      'India steel industry demand outlook',
      'China steel exports dumping safeguard duty India',
      'iron ore coking coal prices',
    ],
  },
  {
    key: 'metals',
    match: /aluminium|aluminum|copper|zinc|mining|industrial metals|precious metals/i,
    drivers: [
      { symbol: 'ALI=F', label: 'Aluminium' },
      { symbol: 'HG=F', label: 'Copper' },
      { symbol: 'GC=F', label: 'Gold' },
      { symbol: '^CNXMETAL', label: 'NIFTY Metal' },
    ],
    research: ['India metals mining sector outlook', 'LME aluminium copper price outlook', 'China commodity demand stimulus'],
  },
  {
    key: 'banks',
    match: /bank/i,
    drivers: [
      { symbol: '^NSEBANK', label: 'NIFTY Bank' },
      { symbol: '^CNXPSUBANK', label: 'NIFTY PSU Bank' },
    ],
    research: ['RBI repo rate decision monetary policy', 'India bank credit growth deposit NPA', 'India bond yields liquidity'],
  },
  {
    key: 'nbfc',
    match: /credit services|financial|asset management|capital markets/i,
    drivers: [{ symbol: '^CNXFIN', label: 'NIFTY Financial Services' }, { symbol: '^NSEBANK', label: 'NIFTY Bank' }],
    research: ['India NBFC growth RBI regulation', 'India interest rate cycle borrowing cost', 'India retail credit demand'],
  },
  {
    key: 'insurance',
    match: /insurance/i,
    drivers: [{ symbol: '^CNXFIN', label: 'NIFTY Financial Services' }],
    research: ['India life insurance premium growth IRDAI', 'India insurance tax rules budget'],
  },
  {
    key: 'it',
    match: /information technology|software|it services|consulting/i,
    drivers: [
      { symbol: '^CNXIT', label: 'NIFTY IT' },
      { symbol: '^IXIC', label: 'NASDAQ' },
    ],
    research: ['Indian IT services deal wins demand outlook', 'US tech spending budgets outsourcing', 'H-1B visa policy Indian IT'],
  },
  {
    key: 'pharma',
    match: /drug|pharma|biotech|healthcare|medical/i,
    drivers: [{ symbol: '^CNXPHARMA', label: 'NIFTY Pharma' }],
    research: ['Indian pharma USFDA inspection observations', 'US generic drug pricing competition', 'India pharma export outlook'],
  },
  {
    key: 'auto',
    match: /auto|vehicle|tyres|rubber/i,
    drivers: [
      { symbol: '^CNXAUTO', label: 'NIFTY Auto' },
      { symbol: 'CL=F', label: 'Crude oil' },
      { symbol: 'HRC=F', label: 'Steel (input cost)' },
    ],
    research: ['India auto monthly sales numbers', 'India EV policy subsidy FAME', 'semiconductor supply auto production'],
  },
  {
    key: 'energy',
    match: /oil|gas|petroleum|refin|energy/i,
    drivers: [
      { symbol: 'BZ=F', label: 'Brent crude' },
      { symbol: 'CL=F', label: 'WTI crude' },
      { symbol: 'NG=F', label: 'Natural gas' },
      { symbol: '^CNXENERGY', label: 'NIFTY Energy' },
    ],
    research: ['OPEC production cut crude oil outlook', 'India fuel pricing refining margins', 'geopolitics oil supply Middle East Russia'],
  },
  {
    key: 'power',
    match: /utilit|power|electric/i,
    drivers: [{ symbol: '^CNXENERGY', label: 'NIFTY Energy' }, { symbol: 'NG=F', label: 'Natural gas' }],
    research: ['India power demand peak generation', 'India coal supply thermal plants', 'India renewable energy capacity target'],
  },
  {
    key: 'fmcg',
    match: /packaged foods|beverage|household|personal products|tobacco|confection/i,
    drivers: [
      { symbol: '^CNXFMCG', label: 'NIFTY FMCG' },
      { symbol: 'CL=F', label: 'Crude (packaging cost)' },
    ],
    research: ['India FMCG rural demand volume growth', 'India monsoon rainfall agriculture', 'palm oil edible oil prices India'],
  },
  {
    key: 'cement',
    match: /cement|building material/i,
    drivers: [{ symbol: '^CNXINFRA', label: 'NIFTY Infra' }, { symbol: 'CL=F', label: 'Crude (freight/fuel)' }],
    research: ['India cement demand price hike', 'India infrastructure capex budget', 'coal petcoke cost cement'],
  },
  {
    key: 'infra',
    match: /engineering|construction|infrastructure|capital goods|industrial/i,
    drivers: [{ symbol: '^CNXINFRA', label: 'NIFTY Infra' }, { symbol: 'HRC=F', label: 'Steel (input)' }],
    research: ['India infrastructure order book capex', 'government budget capital expenditure India', 'India manufacturing PMI'],
  },
  {
    key: 'realty',
    match: /real estate|realty|property/i,
    drivers: [{ symbol: '^CNXREALTY', label: 'NIFTY Realty' }, { symbol: '^NSEBANK', label: 'NIFTY Bank (rates)' }],
    research: ['India housing sales inventory prices', 'India home loan interest rates', 'India office leasing absorption'],
  },
  {
    key: 'chemicals',
    match: /chemical|fertilizer|agricultural inputs|specialty/i,
    drivers: [{ symbol: 'BZ=F', label: 'Brent (feedstock)' }, { symbol: 'NG=F', label: 'Natural gas' }],
    research: ['India specialty chemicals demand China plus one', 'chemical feedstock prices margin', 'India agrochemical monsoon demand'],
  },
  {
    key: 'telecom',
    match: /telecom|communication|wireless/i,
    drivers: [{ symbol: '^CNXMEDIA', label: 'NIFTY Media' }],
    research: ['India telecom ARPU tariff hike', 'India 5G spectrum rollout', 'TRAI subscriber data India'],
  },
  {
    key: 'defence',
    match: /aerospace|defense|defence|shipbuild/i,
    drivers: [{ symbol: '^CNXINFRA', label: 'NIFTY Infra' }],
    research: ['India defence order book indigenisation', 'India defence budget allocation', 'India defence exports geopolitics'],
  },
  {
    key: 'jewellery',
    match: /luxury|jewel|gems|apparel|footwear|retail|specialty retail/i,
    drivers: [{ symbol: 'GC=F', label: 'Gold' }, { symbol: '^CNXFMCG', label: 'NIFTY FMCG' }],
    research: ['India gold demand jewellery festive season', 'India gold import duty', 'India retail consumption discretionary spending'],
  },
  {
    key: 'airlines',
    match: /airline|airport|travel|leisure|hotel|restaurant/i,
    drivers: [{ symbol: 'BZ=F', label: 'Brent (ATF cost)' }],
    research: ['India aviation passenger traffic capacity', 'jet fuel ATF price India', 'India travel tourism demand'],
  },
]

// Fallback when the industry doesn't match any playbook — still gives the model the
// index + FX backdrop and generic sector news rather than nothing.
function genericPlaybook(sector, industry) {
  const what = industry || sector || 'Indian equities'
  return {
    key: 'generic',
    name: what,
    drivers: [],
    research: [`${what} India sector outlook`, `${what} India demand growth`],
    generic: true,
  }
}

// Pick the playbook for a stock. Matches on industry first (more specific), then sector.
// Note this returns *drivers and research topics only* — peers are not listed here.
// They're discovered live from Yahoo's screener (fetchIndustryPeers), filtered to the
// stock's own market-cap neighbourhood, because an industry label alone is far too coarse:
// Ujjivan Small Finance Bank and HDFC Bank are both "Banks—Regional" despite an ~89x
// size gap, and comparing them tells you nothing.
export function playbookFor({ sector, industry }) {
  const hay = `${industry || ''} ${sector || ''}`.trim()
  const hit = hay ? PLAYBOOKS.find(p => p.match.test(hay)) : null
  const pb = hit
    ? { key: hit.key, name: industry || hit.key, drivers: hit.drivers, research: hit.research }
    : genericPlaybook(sector, industry)
  return { ...pb, drivers: [...(pb.drivers || []), ...BASE_DRIVERS] }
}

export const ALL_PLAYBOOK_KEYS = PLAYBOOKS.map(p => p.key)
