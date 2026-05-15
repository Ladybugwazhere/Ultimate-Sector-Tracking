const express = require('express');
const cors = require('cors');
const https = require('https');
const app = express();
 
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
 
const FINNHUB_KEY = process.env.FINNHUB_KEY || 'd8372opr01qjsh1kf0j0d8372opr01qjsh1kf0jg';
const REFRESH_MS  = 38000;
 
const SECTORS = [
  { ticker: 'XLK',  name: 'Technology'    },
  { ticker: 'XLF',  name: 'Financials'    },
  { ticker: 'XLV',  name: 'Health Care'   },
  { ticker: 'XLI',  name: 'Industrials'   },
  { ticker: 'XLE',  name: 'Energy'        },
  { ticker: 'XLY',  name: 'Cons. Disc.'   },
  { ticker: 'XLP',  name: 'Cons. Staples' },
  { ticker: 'XLU',  name: 'Utilities'     },
  { ticker: 'XLB',  name: 'Materials'     },
  { ticker: 'XLC',  name: 'Comm. Svcs'    },
  { ticker: 'XLRE', name: 'Real Estate'   },
];
 
let sectorData  = {};
let hourlyLog   = [];
let lastFetch   = null;
let fetchStatus = 'pending';
 
function fetchQuote(ticker) {
  return new Promise((resolve, reject) => {
    const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const q = JSON.parse(data);
          if (!q.c || q.c === 0) return reject(new Error(`No quote for ${ticker}`));
          const change1h = ((q.c - q.o) / q.o) * 100;
          const change1d = ((q.c - q.pc) / q.pc) * 100;
          resolve({
            ticker,
            price:     Math.round(q.c  * 100) / 100,
            change1h:  Math.round(change1h * 100) / 100,
            change1d:  Math.round(change1d * 100) / 100,
            change1m:  sectorData[ticker]?.change1m || 0,
            high:      Math.round(q.h  * 100) / 100,
            low:       Math.round(q.l  * 100) / 100,
            prevClose: Math.round(q.pc * 100) / 100,
            timestamp: new Date().toISOString(),
          });
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}
 
function fetch1mChange(ticker) {
  return new Promise((resolve) => {
    const to   = Math.floor(Date.now() / 1000);
    const from = to - 60 * 60 * 24 * 30;
    const url  = `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}&token=${FINNHUB_KEY}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.s !== 'ok' || !json.c || json.c.length < 2) return resolve(0);
          const first   = json.c[0];
          const current = json.c[json.c.length - 1];
          resolve(Math.round(((current - first) / first) * 10000) / 100);
        } catch { resolve(0); }
      });
    }).on('error', () => resolve(0));
  });
}
 
let fetch1mDone = false;
 
async function fetchAllSectors() {
  console.log(`[${new Date().toISOString()}] Fetching sectors from Finnhub...`);
  fetchStatus = 'fetching';
  const results = [];
 
  for (const s of SECTORS) {
    try {
      const quote = await fetchQuote(s.ticker);
      // Only fetch 1M change on first run to save API calls
      if (!fetch1mDone) {
        quote.change1m = await fetch1mChange(s.ticker);
        await new Promise(r => setTimeout(r, 250));
      }
      sectorData[s.ticker] = quote;
      results.push(quote);
      console.log(`  ✓ ${s.ticker}: $${quote.price} 1H:${quote.change1h}% 1D:${quote.change1d}%`);
      await new Promise(r => setTimeout(r, 150));
    } catch(e) {
      console.error(`  ✗ ${s.ticker}: ${e.message}`);
    }
  }
 
  if (!fetch1mDone && results.length > 0) fetch1mDone = true;
 
  if (results.length > 0) {
    const now = new Date();
    const lastSnap = hourlyLog[hourlyLog.length - 1];
    const minsSince = lastSnap ? (now - new Date(lastSnap.timestamp)) / 60000 : 999;
    if (minsSince >= 60) {
      hourlyLog.push({
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timestamp: now.toISOString(),
        sectors: results.map(r => ({ abbr: r.ticker, v: r.change1h }))
      });
      if (hourlyLog.length > 48) hourlyLog = hourlyLog.slice(-48);
    }
    lastFetch   = now.toISOString();
    fetchStatus = 'ok';
    console.log(`  Done. ${results.length}/11 sectors live.`);
  } else {
    fetchStatus = 'error';
  }
}
 
app.get('/data', (req, res) => {
  res.json({ sectors: Object.values(sectorData), hourlyLog, lastUpdated: lastFetch, fetchStatus });
});
 
app.get('/health', (req, res) => {
  res.json({ status: 'ok', sectors: Object.keys(sectorData).length, lastFetch, fetchStatus });
});
 
app.get('/refresh', async (req, res) => {
  res.json({ message: 'Refreshing — check /health in 20s' });
  fetch1mDone = false;
  fetchAllSectors();
});
 
app.post('/webhook', (req, res) => {
  const { ticker, price, change1h, change1d, change1m, volume, secret } = req.body;
  const expected = process.env.WEBHOOK_SECRET || 'changeme';
  if (secret !== expected) return res.status(401).json({ error: 'Unauthorized' });
  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  sectorData[ticker] = { ticker, price, change1h, change1d, change1m, volume, timestamp: new Date().toISOString() };
  res.json({ ok: true });
});
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Sector tracker running on port ${PORT} — Finnhub real-time`);
  await fetchAllSectors();
  setInterval(fetchAllSectors, REFRESH_MS);
});
 
