const express = require('express');
const cors = require('cors');
const https = require('https');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── Sector ETFs to track ─────────────────────────────────────────
const SECTORS = [
  { ticker: 'XLK', name: 'Technology' },
  { ticker: 'XLF', name: 'Financials' },
  { ticker: 'XLV', name: 'Health Care' },
  { ticker: 'XLI', name: 'Industrials' },
  { ticker: 'XLE', name: 'Energy' },
  { ticker: 'XLY', name: 'Cons. Disc.' },
  { ticker: 'XLP', name: 'Cons. Staples' },
  { ticker: 'XLU', name: 'Utilities' },
  { ticker: 'XLB', name: 'Materials' },
  { ticker: 'XLC', name: 'Comm. Svcs' },
  { ticker: 'XLRE', name: 'Real Estate' },
];

// ── In-memory store ───────────────────────────────────────────────
let sectorData = {};
let hourlyLog = [];
let lastFetch = null;
let fetchStatus = 'pending';

// ── Fetch a single ticker from Yahoo Finance ──────────────────────
function fetchYahoo(ticker) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1h&range=1mo&includePrePost=false`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json?.chart?.result?.[0];
          if (!result) return reject(new Error(`No data for ${ticker}`));

          const quotes = result.indicators?.quote?.[0];
          const closes = quotes?.close || [];
          const timestamps = result.timestamp || [];

          // Filter out null values
          const valid = closes.map((c, i) => ({ c, t: timestamps[i] })).filter(x => x.c != null);
          if (valid.length < 2) return reject(new Error(`Not enough data for ${ticker}`));

          const current = valid[valid.length - 1].c;
          const prev1h  = valid[valid.length - 2]?.c || current;
          const prev1d  = valid[Math.max(0, valid.length - 7)]?.c || current;  // ~6.5 trading hours
          const prev1m  = valid[0]?.c || current;

          const change1h = ((current - prev1h) / prev1h) * 100;
          const change1d = ((current - prev1d) / prev1d) * 100;
          const change1m = ((current - prev1m) / prev1m) * 100;

          resolve({
            ticker,
            price: Math.round(current * 100) / 100,
            change1h: Math.round(change1h * 100) / 100,
            change1d: Math.round(change1d * 100) / 100,
            change1m: Math.round(change1m * 100) / 100,
            timestamp: new Date().toISOString(),
          });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// ── Fetch all 11 sectors ──────────────────────────────────────────
async function fetchAllSectors() {
  console.log(`[${new Date().toISOString()}] Fetching all sectors from Yahoo Finance...`);
  fetchStatus = 'fetching';
  const results = [];

  for (const s of SECTORS) {
    try {
      const data = await fetchYahoo(s.ticker);
      sectorData[s.ticker] = data;
      results.push(data);
      console.log(`  ✓ ${s.ticker}: ${data.price} (1h: ${data.change1h}%)`);
      // Small delay between requests to be polite
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.error(`  ✗ ${s.ticker}: ${e.message}`);
    }
  }

  if (results.length > 0) {
    // Save hourly snapshot
    const snapshot = {
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      timestamp: new Date().toISOString(),
      sectors: results.map(r => ({ abbr: r.ticker, v: r.change1h }))
    };
    hourlyLog.push(snapshot);
    if (hourlyLog.length > 48) hourlyLog = hourlyLog.slice(-48);

    lastFetch = new Date().toISOString();
    fetchStatus = 'ok';
    console.log(`  Done. ${results.length}/11 sectors fetched.`);
  } else {
    fetchStatus = 'error';
    console.error('  No sectors fetched — Yahoo may be rate limiting.');
  }
}

// ── Routes ────────────────────────────────────────────────────────
app.get('/data', (req, res) => {
  res.json({
    sectors: Object.values(sectorData),
    hourlyLog,
    lastUpdated: lastFetch || new Date().toISOString(),
    fetchStatus,
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    sectors: Object.keys(sectorData).length,
    lastFetch,
    fetchStatus,
    nextFetch: lastFetch
      ? new Date(new Date(lastFetch).getTime() + 60 * 60 * 1000).toISOString()
      : 'soon'
  });
});

// Manual refresh endpoint (visit /refresh in browser to force a fetch)
app.get('/refresh', async (req, res) => {
  res.json({ message: 'Fetching data now... check /health in 30 seconds' });
  fetchAllSectors();
});

// Still accept TradingView webhooks if you fix alerts later
app.post('/webhook', (req, res) => {
  const { ticker, price, change1h, change1d, change1m, volume, secret } = req.body;
  const expectedSecret = process.env.WEBHOOK_SECRET || 'changeme';
  if (secret !== expectedSecret) return res.status(401).json({ error: 'Unauthorized' });
  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  const ts = new Date().toISOString();
  sectorData[ticker] = { ticker, price, change1h, change1d, change1m, volume, timestamp: ts };
  hourlyLog.push({ ...sectorData[ticker] });
  if (hourlyLog.length > 480) hourlyLog = hourlyLog.slice(-480);
  console.log(`[${ts}] Webhook received: ${ticker} @ ${price}`);
  res.json({ ok: true, received: ticker });
});

// ── Start server ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Sector tracker server running on port ${PORT}`);
  // Fetch immediately on startup
  await fetchAllSectors();
  // Then fetch every hour
  setInterval(fetchAllSectors, 60 * 60 * 1000);
});
