# Sector Rotation Tracker

Live sector rotation dashboard powered by your TradingView data.  
Auto-refreshes every 38 seconds. Works with any TradingView paid plan.

---

## How it works

```
TradingView alert fires
       ↓
  Webhook → your Railway server (this repo)
       ↓
  /data endpoint serves JSON
       ↓
  index.html tracker polls every 38s
```

---

## Step 1 — Deploy to Railway (free tier works)

1. Go to **[railway.app](https://railway.app)** and sign up with GitHub
2. Click **"New Project" → "Deploy from GitHub repo"**
3. Select this repo
4. Railway auto-detects Node and deploys it
5. Click your deployment → **Settings → Networking → Generate Domain**
6. Copy your URL — it looks like `https://sector-tracker-xyz.railway.app`

> **Set your secret:** In Railway → Variables, add:
> ```
> WEBHOOK_SECRET = make_up_any_password_here
> ```

---

## Step 2 — Set up the Pine Script in TradingView

1. Open **TradingView** → open a chart for `XLK` (Technology ETF)
2. Click **Pine Editor** (bottom of screen)
3. Paste the contents of `pine/sector_webhook.pine`
4. Click **"Add to chart"**
5. In the script settings, set **Webhook Secret** to match what you set in Railway

---

## Step 3 — Create TradingView alerts (repeat for each sector)

Do this **11 times** — once per sector ETF listed below.

1. Click the **clock/alert icon** in TradingView toolbar
2. **Condition:** "Sector Rotation Sender" → "alert() function calls"
3. **Webhook URL:** `https://YOUR-APP.railway.app/webhook`
4. **Message:** leave it blank (Pine Script builds the JSON)
5. **Frequency:** "Once per bar close"
6. **Expiry:** Set to max (1 year)
7. Click **Create**
8. Switch chart to next symbol, repeat

### The 11 sectors to set alerts on:

| Symbol | Sector         |
|--------|----------------|
| XLK    | Technology     |
| XLF    | Financials     |
| XLV    | Health Care    |
| XLI    | Industrials    |
| XLE    | Energy         |
| XLY    | Cons. Discretionary |
| XLP    | Cons. Staples  |
| XLU    | Utilities      |
| XLB    | Materials      |
| XLC    | Comm. Services |
| XLRE   | Real Estate    |

---

## Step 4 — Point the tracker to your server

Open `public/index.html` and find this line near the top of the `<script>`:

```js
const SERVER_URL = window.SECTOR_SERVER_URL || 'http://localhost:3000';
```

Change it to your Railway URL:

```js
const SERVER_URL = 'https://YOUR-APP.railway.app';
```

Or host `index.html` on **GitHub Pages** and set the URL there (see Step 5).

---

## Step 5 — Host the tracker page on GitHub Pages (free)

1. Push this repo to GitHub
2. Go to repo **Settings → Pages**
3. Source: **"Deploy from a branch"** → branch: `main` → folder: `/public`
4. Click Save
5. Your tracker is live at: `https://YOUR-USERNAME.github.io/sector-rotation-tracker`

> The `index.html` in `/public` **already works as a standalone page**.  
> It shows demo data until your webhook server has live data flowing.

---

## Step 6 — Test it

Visit: `https://YOUR-APP.railway.app/health`

You should see:
```json
{ "status": "ok", "sectors": 0 }
```

After the first TradingView alert fires, it becomes:
```json
{ "status": "ok", "sectors": 1 }
```

To test manually without waiting for an alert:
```bash
curl -X POST https://YOUR-APP.railway.app/webhook \
  -H "Content-Type: application/json" \
  -d '{"ticker":"XLK","price":182.5,"change1h":0.42,"change1d":1.1,"change1m":3.2,"volume":1234567,"secret":"your_secret_here"}'
```

---

## File structure

```
sector-rotation-tracker/
├── server/
│   └── index.js          ← Node webhook server
├── public/
│   └── index.html        ← The full tracker (both trackers combined)
├── pine/
│   └── sector_webhook.pine  ← Paste into TradingView Pine Editor
├── package.json
├── railway.json          ← Railway deploy config
└── README.md
```

---

## Timeframe tips

| TradingView chart timeframe | What you get |
|-----------------------------|-------------|
| 1H chart + "once per bar close" | Hourly updates (recommended) |
| 1D chart + "once per bar close" | Daily updates |
| 15m chart + "once per bar close" | 15-minute updates |

The Pine Script calculates `change1h`, `change1d`, and `change1m` relative to bars back,  
so the 1H chart is the best match for the tracker's hourly flow view.

---

## Troubleshooting

**Alerts not firing?**  
Check TradingView → Alerts panel → make sure alerts are "Active" (green dot).

**Webhook returns 401?**  
Your `secret` in Pine Script doesn't match `WEBHOOK_SECRET` in Railway variables.

**Railway URL not working?**  
Make sure you clicked "Generate Domain" under Networking in your Railway service settings.

**Tracker shows demo data?**  
The server is reachable but has no data yet — wait for the first alert to fire,  
or test with the curl command above.
