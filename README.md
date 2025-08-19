# Zerodha Holdings Expense Ratio Extension

A Chrome extension that automatically adds an "Expense Ratio" column to your Zerodha Kite holdings table, fetching data from Tijori Finance API with intelligent caching.

<img width="1024" height="1024" alt="kite expense ratio" src="https://github.com/user-attachments/assets/3e546b68-c6e0-4a18-ba16-9ade4940591c" />


## What It Does

- ✅ **Automatic Column Addition**: Adds "Exp. Ratio" column to your holdings table
- ✅ **Smart Caching**: Caches expense ratios for 2 hours to avoid repeated API calls
- ✅ **Rate Limited**: Fetches data slowly (1 second between calls) to avoid overwhelming servers
- ✅ **Only for ETFs/Mutual Funds**: Shows "N/A" for regular stocks that don't have expense ratios

### What You'll See

```
| Instrument | Qty. | Avg. cost | LTP | Exp. Ratio | Invested | Cur. val | P&L |
|------------|------|-----------|-----|------------|----------|----------|-----|
| JUNIORBEES | 264  | 716.32    |729.08| 0.17%     | 1,89,109 | 1,92,477 | ... |
| NIFTYBEES  | 396  | 278.50    |281.96| 0.05%     | 1,10,287 | 1,11,656 | ... |
| ASIANPAINT | 10   | 2500.00   |2650.00| N/A       | 25,000   | 26,500   | ... |
```

## Installation

1. **Download/Clone** this repository
2. **Open Chrome Extensions**: Go to `chrome://extensions/`
3. **Enable Developer Mode**: Toggle the switch in top-right corner
4. **Load Extension**: Click "Load unpacked" and select this folder
5. **Visit Holdings**: Go to `https://kite.zerodha.com/holdings/equity`

The extension will automatically add the expense ratio column!

---

**Note**: This extension is for educational purposes. Always verify financial data from official sources.
