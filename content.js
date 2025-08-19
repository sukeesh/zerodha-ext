// Zerodha Holdings Expense Ratio Chrome Extension
// Adds expense ratio column to holdings table with caching

class ExpenseRatioManager {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
    this.apiBaseUrl = 'https://b2b.tijorifinance.com/b2b/v1/in/kite-widget/web/equity';
    this.cacheLoaded = false;
    this.cacheLoadPromise = this.loadCacheFromStorage();
  }

  // Load cached data from Chrome storage
  async loadCacheFromStorage() {
    try {
      const result = await chrome.storage.local.get(['expenseRatioCache']);
      if (result.expenseRatioCache) {
        const cacheData = JSON.parse(result.expenseRatioCache);
        const now = Date.now();
        const cacheAge = now - cacheData.timestamp;
        
        // Check if cache is still valid
        if (cacheAge < this.cacheExpiry) {
          this.cache = new Map(cacheData.data);
        } else {
          // Clear expired cache
          await chrome.storage.local.remove(['expenseRatioCache']);
        }
      }
      this.cacheLoaded = true;
    } catch (error) {
      this.cacheLoaded = true;
    }
  }

  // Save cache to Chrome storage
  async saveCacheToStorage() {
    try {
      const cacheData = {
        data: Array.from(this.cache.entries()),
        timestamp: Date.now()
      };
      await chrome.storage.local.set({
        expenseRatioCache: JSON.stringify(cacheData)
      });
    } catch (error) {
      // Silent fail
    }
  }

  // Get cache status for debugging
  getCacheStatus() {
    return {
      loaded: this.cacheLoaded,
      itemCount: this.cache.size,
      expiryHours: this.cacheExpiry / (60 * 60 * 1000)
    };
  }

  // Clear cache manually (for debugging)
  async clearCache() {
    this.cache.clear();
    await chrome.storage.local.remove(['expenseRatioCache']);
  }

  // Get expense ratio from cache or API
  async getExpenseRatio(symbol) {
    // Wait for cache to load first
    if (!this.cacheLoaded) {
      await this.cacheLoadPromise;
    }

    // Check cache first
    if (this.cache.has(symbol)) {
      return this.cache.get(symbol);
    }

    try {
      // Use background service worker to bypass CORS
      const response = await this.sendMessageToBackground({
        action: 'fetchExpenseRatio',
        symbol: symbol
      });

      if (response.success) {
        const expenseRatio = response.data;
        // Cache the result
        this.cache.set(symbol, expenseRatio);
        await this.saveCacheToStorage();
        return expenseRatio;
      } else {
        return 'N/A';
      }
    } catch (error) {
      return 'N/A';
    }
  }

  // Send message to background script
  async sendMessageToBackground(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }


}

class HoldingsTableModifier {
  constructor() {
    this.expenseRatioManager = new ExpenseRatioManager();
    this.isProcessing = false;
    this.rateLimitDelay = 1000; // 1 second delay between API calls
    this.processingQueue = [];
  }

  // Find the holdings table
  findHoldingsTable() {
    return document.querySelector('.table-wrapper table, table');
  }

  // Extract instrument symbols from table rows
  getInstrumentSymbols() {
    const table = this.findHoldingsTable();
    if (!table) return [];

    const symbols = [];
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
      const instrumentCell = row.querySelector('td.instrument, td[data-label="Instrument"]');
      if (instrumentCell) {
        const symbolElement = instrumentCell.querySelector('span');
        if (symbolElement) {
          symbols.push(symbolElement.textContent.trim());
        }
      }
    });

    return symbols;
  }

  // Add expense ratio header
  addExpenseRatioHeader() {
    const table = this.findHoldingsTable();
    if (!table) return false;

    const headerRow = table.querySelector('thead tr');
    if (!headerRow) return false;

    // Check if header already exists
    if (headerRow.querySelector('.expense-ratio-header')) {
      return true;
    }

    // Create new header cell
    const headerCell = document.createElement('th');
    headerCell.className = 'right sortable expense-ratio-header';
    headerCell.innerHTML = `
      <span data-tooltip-placement="top">
        Exp. Ratio
      </span>
    `;

    // Insert after "LTP" column (4th column) or at the end
    const ltpHeader = headerRow.querySelector('th:nth-child(4)');
    if (ltpHeader) {
      ltpHeader.insertAdjacentElement('afterend', headerCell);
    } else {
      headerRow.appendChild(headerCell);
    }

    return true;
  }

  // Add expense ratio cells to data rows
  async addExpenseRatioCells() {
    const table = this.findHoldingsTable();
    if (!table) return;

    const symbols = this.getInstrumentSymbols();
    const rows = table.querySelectorAll('tbody tr');

    // Clear existing processing queue
    this.processingQueue = [];

    for (let i = 0; i < rows.length && i < symbols.length; i++) {
      const row = rows[i];
      const symbol = symbols[i];

      // Check if cell already exists
      if (row.querySelector('.expense-ratio-cell')) {
        continue;
      }

      // Create expense ratio cell
      const cell = document.createElement('td');
      cell.className = 'right expense-ratio-cell';
      cell.setAttribute('data-label', 'Exp. Ratio');
      cell.setAttribute('data-loading', 'true');
      cell.innerHTML = '<span class="expense-ratio-loading"></span>Loading...';

      // Insert after LTP column or at appropriate position
      const ltpCell = row.querySelector('td:nth-child(4)');
      if (ltpCell) {
        ltpCell.insertAdjacentElement('afterend', cell);
      } else {
        row.appendChild(cell);
      }

      // Add to processing queue instead of processing immediately
      this.processingQueue.push({ symbol, cell });
      
      // If data is cached, update immediately without loading animation
      this.checkAndUpdateCachedData(symbol, cell);
    }

    // Process queue sequentially with rate limiting
    this.processExpenseRatioQueue();
  }

  // Check if data is cached and update immediately
  async checkAndUpdateCachedData(symbol, cell) {
    // Wait for cache to load
    if (!this.expenseRatioManager.cacheLoaded) {
      await this.expenseRatioManager.cacheLoadPromise;
    }
    
    // If cached, update immediately
    if (this.expenseRatioManager.cache.has(symbol)) {
      const cachedValue = this.expenseRatioManager.cache.get(symbol);
      
      // Update cell immediately
      cell.removeAttribute('data-loading');
      cell.textContent = cachedValue;
      
      // Add styling based on the value
      if (cachedValue === 'N/A') {
        cell.setAttribute('data-value', 'N/A');
      } else if (cachedValue === 'Error') {
        cell.setAttribute('data-error', 'true');
      }
      
      // Remove from processing queue since it's already done
      this.processingQueue = this.processingQueue.filter(item => item.symbol !== symbol);
    }
  }

  // Process expense ratio requests sequentially
  async processExpenseRatioQueue() {
    if (this.processingQueue.length === 0) {
      return;
    }

    const { symbol, cell } = this.processingQueue.shift();
    
    try {
      await this.fetchAndUpdateExpenseRatio(symbol, cell);
    } catch (error) {
      // Silent error handling
    }

    // Wait before processing next item (rate limiting)
    setTimeout(() => {
      this.processExpenseRatioQueue();
    }, this.rateLimitDelay);
  }

  // Fetch and update expense ratio for a specific cell
  async fetchAndUpdateExpenseRatio(symbol, cell) {
    try {
      const expenseRatio = await this.expenseRatioManager.getExpenseRatio(symbol);
      
      // Remove loading state
      cell.removeAttribute('data-loading');
      cell.textContent = expenseRatio;
      
      // Add styling based on the value
      if (expenseRatio === 'N/A') {
        cell.setAttribute('data-value', 'N/A');
      } else if (expenseRatio === 'Error') {
        cell.setAttribute('data-error', 'true');
      }
    } catch (error) {
      console.error(`Error updating expense ratio for ${symbol}:`, error);
      cell.removeAttribute('data-loading');
      cell.setAttribute('data-error', 'true');
      cell.textContent = 'Error';
    }
  }

  // Main method to modify the table
  async modifyTable() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Wait a bit for the page to fully load
      await new Promise(resolve => setTimeout(resolve, 1000));

      const headerAdded = this.addExpenseRatioHeader();
      if (headerAdded) {
        await this.addExpenseRatioCells();
      }
    } catch (error) {
      // Silent error handling
    } finally {
      this.isProcessing = false;
    }
  }

  // Set up observers for dynamic content
  setupObservers() {
    // Observer for table changes
    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // Check if new table rows were added
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'TR' || node.querySelector('tr')) {
                shouldUpdate = true;
              }
            }
          });
        }
      });

      if (shouldUpdate && !this.isProcessing) {
        setTimeout(() => this.modifyTable(), 500);
      }
    });

    // Start observing
    const tableContainer = document.querySelector('.table-wrapper') || document.body;
    observer.observe(tableContainer, {
      childList: true,
      subtree: true
    });
  }
}

// Initialize the extension
function initializeExtension() {
  // Check if already initialized to prevent multiple instances
  if (window.expenseRatioExtensionInitialized) {
    return;
  }
  
  // Check if we're on the correct page
  if (!window.location.href.includes('kite.zerodha.com/holdings/equity')) {
    return;
  }

  // Mark as initialized
  window.expenseRatioExtensionInitialized = true;

  const modifier = new HoldingsTableModifier();
  
  // Store global reference for debugging
  expenseRatioManager = modifier.expenseRatioManager;
  
  // Initial modification
  modifier.modifyTable();
  
  // Set up observers for dynamic content
  modifier.setupObservers();
}

// Global reference for debugging
let expenseRatioManager = null;

// Wait for DOM to be ready and start the extension
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

// Also handle case where content script loads after page is already loaded
setTimeout(initializeExtension, 2000);

// Debug functions available in console (kept for troubleshooting)
window.debugExpenseRatioCache = {
  status: () => expenseRatioManager ? expenseRatioManager.getCacheStatus() : 'Extension not loaded',
  clear: () => expenseRatioManager ? expenseRatioManager.clearCache() : 'Extension not loaded',
  cache: () => expenseRatioManager ? Array.from(expenseRatioManager.cache.entries()) : 'Extension not loaded'
};
