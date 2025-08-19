// Background service worker for handling CORS-restricted API calls

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchExpenseRatio') {
    fetchExpenseRatio(request.symbol)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    // Return true to indicate we'll send a response asynchronously
    return true;
  }
});

// Fetch expense ratio data with proper headers
async function fetchExpenseRatio(symbol) {
  const url = `https://b2b.tijorifinance.com/b2b/v1/in/kite-widget/web/equity/${symbol}/?exchange=NSE&broker=kite&theme=dark`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Referer': 'https://kite.zerodha.com/',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const expenseRatio = parseExpenseRatio(html);
    return expenseRatio;
    
  } catch (error) {
    console.error(`Failed to fetch expense ratio for ${symbol}:`, error);
    throw error;
  }
}

// Parse expense ratio from HTML response (using regex - no DOM parsing in service workers)
function parseExpenseRatio(html) {
  try {
    // Check for "Coming Soon" page first
    if (html.includes('Coming Soon') || html.includes('not_found_section')) {
      return 'N/A';
    }
    
    // Only look for expense ratios in the specific avg_yr_data table section
    // This is where ETF/mutual fund expense ratios are displayed
    const avgYearDataMatch = html.match(/<div[^>]*class="avg_yr_data"[^>]*>([\s\S]*?)<\/div>/i);
    if (!avgYearDataMatch) {
      return 'N/A'; // No avg_yr_data section means no expense ratio
    }
    
    const tableContent = avgYearDataMatch[1];
    
    // Ensure this is a proper table with expense ratio data
    if (!tableContent.includes('<table') && !tableContent.includes('<th') && !tableContent.includes('<td')) {
      return 'N/A'; // Not a proper table structure
    }
    
    // Method 1: Look for exact "Exp. Ratio" header pattern in the table
    const expRatioHeaderPattern = /<th[^>]*>[\s\S]*?<span[^>]*>Exp\.\s*Ratio<\/span>[\s\S]*?<\/th>/i;
    if (!expRatioHeaderPattern.test(tableContent)) {
      return 'N/A'; // No "Exp. Ratio" header found
    }
    
    // Method 2: Extract the expense ratio value from the table structure
    // Look for the pattern: <th>...Exp. Ratio...</th> followed by data in the same column
    const tableRowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    const rows = [];
    let match;
    while ((match = tableRowPattern.exec(tableContent)) !== null) {
      rows.push(match[1]);
    }
    
    if (rows.length >= 2) {
      // Find which column has "Exp. Ratio" in header row
      const headers = rows[0].match(/<th[^>]*>([\s\S]*?)<\/th>/g);
      let expenseRatioColumnIndex = -1;
      
      if (headers) {
        for (let i = 0; i < headers.length; i++) {
          if (headers[i].includes('Exp. Ratio') || headers[i].includes('Expense Ratio')) {
            expenseRatioColumnIndex = i;
            break;
          }
        }
      }
      
      // If we found the column, get the corresponding data from the data row
      if (expenseRatioColumnIndex >= 0) {
        const dataCells = rows[1].match(/<td[^>]*>([\s\S]*?)<\/td>/g);
        if (dataCells && dataCells[expenseRatioColumnIndex]) {
          const cellContent = dataCells[expenseRatioColumnIndex].replace(/<[^>]*>/g, '').trim();
          
          // Validate that it looks like an expense ratio (percentage with reasonable value)
          const percentageMatch = cellContent.match(/^([0-9]+\.?[0-9]*%)$/);
          if (percentageMatch) {
            const value = parseFloat(percentageMatch[1]);
            // Expense ratios are typically between 0.01% and 3%
            if (value >= 0.01 && value <= 3.0) {
              return percentageMatch[1];
            }
          }
        }
      }
    }

    return 'N/A';
  } catch (error) {
    return 'N/A';
  }
}
