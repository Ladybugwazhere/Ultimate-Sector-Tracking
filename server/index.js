const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let sectorData = {};
let hourlyLog = [];

app.post('/webhook', (req, res) => {
  const { ticker, price, change1h, change1d, change1m, volume, secret } = req.body;
  const expectedSecret = process.env.WEBHOOK_SECRET || 'changeme';
  if (secret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  const ts = new Date().toISOString();
  sectorData[ticker] = { ticker, price, change1h, change1d, change1m, volume, timestamp: ts };
  hourlyLog.push({ ...sectorData[ticker] });
  if (hourlyLog.length > 480) hourlyLog = hourlyLog.slice(-480);
  console.log(`[${ts}] Received: ${ticker} @ ${price}`);
  res.json({ ok: true, received: ticker });
});

app.get('/data', (req, res) => {
  res.json({
    sectors: Object.values(sectorData),
    hourlyLog,
    lastUpdated: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', sectors: Object.keys(sectorData).length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
