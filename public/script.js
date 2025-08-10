class FinancialDashboard {
    constructor() {
        this.priceChart = null;
        this.webSocket = null;
        this.realtimeUpdateCount = 0;
        this.init();
        this.setupEventListeners();
        this.startAutoRefresh();
        this.initializeWebSocket();
    }

    async init() {
        await this.loadMarketData();
        await this.loadNews();
        this.updateLastUpdatedTime();
    }

    setupEventListeners() {
        const searchBtn = document.getElementById('searchBtn');
        const symbolInput = document.getElementById('symbolInput');
        const periodSelect = document.getElementById('chartPeriod');
        const fundamentalsBtn = document.getElementById('fundamentalsBtn');
        const technicalBtn = document.getElementById('technicalBtn');
        const sectorBtn = document.getElementById('sectorBtn');

        if (searchBtn) searchBtn.addEventListener('click', () => this.searchStock());
        if (symbolInput) {
            symbolInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchStock();
                }
            });
            symbolInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase();
            });
        }

        if (periodSelect) {
            periodSelect.addEventListener('change', () => {
                const symbol = document.getElementById('symbolInput')?.value?.trim();
                if (symbol && this.priceChart) {
                    this.loadChart(symbol, periodSelect.value);
                }
            });
        }

        if (fundamentalsBtn) fundamentalsBtn.addEventListener('click', () => this.loadFundamentals());
        if (technicalBtn) technicalBtn.addEventListener('click', () => this.loadTechnicalAnalysis());
        if (sectorBtn) sectorBtn.addEventListener('click', () => this.loadSectorData());

        // Listen for real-time updates
        document.addEventListener('realtimeUpdate', (e) => {
            this.handleRealtimeUpdate(e.detail);
        });
    }

    async loadMarketData() {
        try {
            const response = await fetch('/api/stocks');
            const data = await response.json();
            
            this.renderWatchlist(data.stocks);
            this.renderETFList(data.etfs || data.stocks);
            this.renderMarketSummary(data.stocks);
        } catch (error) {
            console.error('Error loading market data:', error);
            this.showError('stockList', 'FAILED TO LOAD MARKET DATA');
        }
    }

    async loadNews() {
        try {
            // Mock news data for demo
            const mockNews = [
                {
                    title: "Markets Open Higher Amid Tech Rally",
                    source: "PFAFF NEWS",
                    publishedAt: new Date().toISOString(),
                    url: "#"
                },
                {
                    title: "Federal Reserve Signals Rate Stability",
                    source: "REUTERS",
                    publishedAt: new Date(Date.now() - 3600000).toISOString(),
                    url: "#"
                },
                {
                    title: "Apple Reports Strong Quarterly Earnings",
                    source: "CNBC",
                    publishedAt: new Date(Date.now() - 7200000).toISOString(),
                    url: "#"
                },
                {
                    title: "Tesla Announces New Manufacturing Facility",
                    source: "BLOOMBERG",
                    publishedAt: new Date(Date.now() - 10800000).toISOString(),
                    url: "#"
                },
                {
                    title: "Cryptocurrency Market Shows Strong Recovery",
                    source: "COINDESK",
                    publishedAt: new Date(Date.now() - 14400000).toISOString(),
                    url: "#"
                }
            ];
            
            this.renderNews(mockNews);
        } catch (error) {
            console.error('Error loading news:', error);
            this.showError('newsList', 'FAILED TO LOAD NEWS');
        }
    }

    async searchStock() {
        const symbolInput = document.getElementById('symbolInput');
        const symbol = symbolInput?.value?.trim()?.toUpperCase();
        
        if (!symbol) return;

        const resultDiv = document.getElementById('searchResult');
        if (resultDiv) {
            resultDiv.innerHTML = '<div class="loading">SEARCHING PFAFF DATABASE</div>';
        }

        try {
            // Mock search result for demo
            const mockResult = {
                symbol: symbol,
                price: 150.50 + Math.random() * 50,
                change: (Math.random() - 0.5) * 10,
                changePercent: ((Math.random() - 0.5) * 5).toFixed(2),
                volume: Math.floor(Math.random() * 10000000),
                high: 155.00,
                low: 148.00,
                bidPrice: 150.25,
                askPrice: 150.75
            };

            this.renderSearchResult(mockResult);
            this.loadChart(symbol, '1M');
        } catch (error) {
            if (resultDiv) {
                resultDiv.innerHTML = `<div class="error">SYMBOL "${symbol}" NOT FOUND IN PFAFF DATABASE</div>`;
            }
        }
    }

    async loadChart(symbol, period) {
        try {
            // Mock chart data for demo
            const days = period === '1W' ? 7 : period === '1M' ? 30 : period === '3M' ? 90 : 365;
            const mockData = [];
            let basePrice = 150;
            
            for (let i = 0; i < days; i++) {
                const date = new Date();
                date.setDate(date.getDate() - (days - i));
                basePrice += (Math.random() - 0.5) * 5;
                mockData.push({
                    date: date.toISOString().split('T')[0],
                    close: Math.max(50, basePrice)
                });
            }
            
            this.renderChart(mockData, symbol);
        } catch (error) {
            console.error('Error loading chart data:', error);
        }
    }

    renderWatchlist(stocks) {
        const stockList = document.getElementById('stockList');
        
        if (!stockList) return;
        
        if (!stocks || Object.keys(stocks).length === 0) {
            stockList.innerHTML = '<div class="loading">LOADING PFAFF MARKET DATA</div>';
            return;
        }

        const stocksHtml = Object.values(stocks).map(stock => {
            const changeClass = parseFloat(stock.change) >= 0 ? 'positive' : 'negative';
            const changeSymbol = parseFloat(stock.change) >= 0 ? '+' : '';
            
            return `
                <div class="watchlist-item data-update" data-symbol="${stock.symbol}">
                    <span class="symbol">${stock.symbol}</span>
                    <span class="price">${parseFloat(stock.price).toFixed(2)}</span>
                    <span class="change ${changeClass}">${changeSymbol}${parseFloat(stock.change).toFixed(2)}</span>
                    <span class="volume">${this.formatVolume(stock.volume)}</span>
                </div>
            `;
        }).join('');

        stockList.innerHTML = stocksHtml;
    }

    renderETFList(etfs) {
        const etfList = document.getElementById('etfList');
        if (!etfList) return;
        
        if (!etfs || Object.keys(etfs).length === 0) {
            etfList.innerHTML = '<div class="loading">LOADING ETF DATA</div>';
            return;
        }

        // Show subset of data as ETFs
        const etfData = Object.values(etfs).slice(0, 3);
        const etfsHtml = etfData.map(etf => {
            const changeClass = parseFloat(etf.change) >= 0 ? 'positive' : 'negative';
            const changeSymbol = parseFloat(etf.change) >= 0 ? '+' : '';
            
            return `
                <div class="watchlist-item data-update" data-symbol="${etf.symbol}">
                    <span class="symbol">${etf.symbol}</span>
                    <span class="price">${parseFloat(etf.price).toFixed(2)}</span>
                    <span class="change ${changeClass}">${changeSymbol}${parseFloat(etf.change).toFixed(2)}</span>
                    <span class="volume">${this.formatVolume(etf.volume)}</span>
                </div>
            `;
        }).join('');

        etfList.innerHTML = etfsHtml;
    }

    renderCryptoList(crypto) {
        const cryptoList = document.getElementById('cryptoList');
        
        if (!cryptoList) return;
        
        if (!crypto || Object.keys(crypto).length === 0) {
            cryptoList.innerHTML = '<div class="loading">LOADING CRYPTO DATA</div>';
            return;
        }

        const cryptoHtml = Object.values(crypto).map(coin => {
            const changeClass = parseFloat(coin.change) >= 0 ? 'positive' : 'negative';
            const changeSymbol = parseFloat(coin.change) >= 0 ? '+' : '';
            
            return `
                <div class="watchlist-item data-update" data-symbol="${coin.symbol}">
                    <span class="symbol">${coin.symbol.replace('USD', '')}</span>
                    <span class="price">${parseFloat(coin.price).toFixed(2)}</span>
                    <span class="change ${changeClass}">${changeSymbol}${parseFloat(coin.change).toFixed(2)}</span>
                    <span class="volume">${this.formatVolume(coin.volume)}</span>
                </div>
            `;
        }).join('');

        cryptoList.innerHTML = cryptoHtml;
    }

    renderMarketSummary(stocks) {
        const marketSummary = document.getElementById('marketSummary');
        
        if (!marketSummary) return;
        
        if (!stocks || Object.keys(stocks).length === 0) {
            marketSummary.innerHTML = '<div class="loading">LOADING MARKET SUMMARY</div>';
            return;
        }

        const stocksArray = Object.values(stocks);
        const gainers = stocksArray.filter(s => parseFloat(s.change) > 0).length;
        const losers = stocksArray.filter(s => parseFloat(s.change) < 0).length;
        const totalVolume = stocksArray.reduce((sum, s) => sum + (s.volume || 0), 0);
        const avgChange = stocksArray.reduce((sum, s) => sum + parseFloat(s.change), 0) / stocksArray.length;

        marketSummary.innerHTML = `
            <div class="market-metric">
                <div class="metric-value">${stocksArray.length}</div>
                <div class="metric-label">TRACKED</div>
            </div>
            <div class="market-metric">
                <div class="metric-value" style="color: #00ff41;">${gainers}</div>
                <div class="metric-label">GAINERS</div>
            </div>
            <div class="market-metric">
                <div class="metric-value" style="color: #ff4757;">${losers}</div>
                <div class="metric-label">LOSERS</div>
            </div>
            <div class="market-metric">
                <div class="metric-value">${(totalVolume / 1000000).toFixed(0)}M</div>
                <div class="metric-label">VOLUME</div>
            </div>
            <div class="market-metric">
                <div class="metric-value ${avgChange >= 0 ? 'positive' : 'negative'}">${avgChange.toFixed(2)}%</div>
                <div class="metric-label">AVG CHANGE</div>
            </div>
            <div class="market-metric">
                <div class="metric-value" style="color: #ffb700;">${new Date().toLocaleTimeString()}</div>
                <div class="metric-label">MARKET TIME</div>
            </div>
        `;
    }

    renderNews(articles) {
        const newsList = document.getElementById('newsList');
        const newsTicker = document.getElementById('newsTicker');
        
        if (!articles || articles.length === 0) {
            if (newsList) newsList.innerHTML = '<div class="loading">LOADING PFAFF NEWS FEED</div>';
            return;
        }

        // Update ticker
        if (newsTicker) {
            const tickerText = articles.slice(0, 3).map(article => 
                `${article.source.toUpperCase()}: ${article.title}`
            ).join(' • ');
            newsTicker.textContent = tickerText;
        }

        // Update news list
        if (newsList) {
            const newsHtml = articles.slice(0, 10).map(article => `
                <a href="${article.url}" target="_blank" class="news-item">
                    <div class="news-time">${this.formatNewsTime(article.publishedAt)}</div>
                    <div class="news-title">${article.title}</div>
                    <div class="news-source">${article.source.toUpperCase()}</div>
                </a>
            `).join('');

            newsList.innerHTML = newsHtml;
        }
    }

    renderSearchResult(stock) {
        const resultDiv = document.getElementById('searchResult');
        if (!resultDiv) return;
        
        const changeClass = parseFloat(stock.change) >= 0 ? 'positive' : 'negative';
        const changeSymbol = parseFloat(stock.change) >= 0 ? '+' : '';

        resultDiv.innerHTML = `
            <div class="search-result">
                <div class="result-header">
                    <span class="result-symbol">${stock.symbol}</span>
                    <span class="result-price">${parseFloat(stock.price).toFixed(2)}</span>
                </div>
                <div class="result-details">
                    <span class="result-label">CHANGE:</span>
                    <span class="result-value ${changeClass}">${changeSymbol}${parseFloat(stock.change).toFixed(2)} (${stock.changePercent}%)</span>
                    
                    <span class="result-label">VOLUME:</span>
                    <span class="result-value">${this.formatVolume(stock.volume)}</span>
                    
                    <span class="result-label">HIGH:</span>
                    <span class="result-value">${parseFloat(stock.high).toFixed(2)}</span>
                    
                    <span class="result-label">LOW:</span>
                    <span class="result-value">${parseFloat(stock.low).toFixed(2)}</span>
                    
                    <span class="result-label">BID:</span>
                    <span class="result-value">${parseFloat(stock.bidPrice).toFixed(2)}</span>
                    
                    <span class="result-label">ASK:</span>
                    <span class="result-value">${parseFloat(stock.askPrice).toFixed(2)}</span>
                </div>
            </div>
        `;
    }

    renderChart(historicalData, symbol) {
        const canvas = document.getElementById('priceChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (this.priceChart) {
            this.priceChart.destroy();
        }
        
        const labels = historicalData.map(item => new Date(item.date).toLocaleDateString());
        const prices = historicalData.map(item => item.close);
        
        // Pfaff Terminal-style chart configuration
        this.priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `${symbol} PRICE`,
                    data: prices,
                    borderColor: '#ffb700',
                    backgroundColor: 'rgba(255, 183, 0, 0.1)',
                    borderWidth: 1,
                    fill: true,
                    tension: 0,
                    pointRadius: 0,
                    pointHoverRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: `${symbol} - PFAFF TERMINAL CHART`,
                        color: '#ffb700',
                        font: {
                            family: 'Courier New',
                            size: 12,
                            weight: 'bold'
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: '#333',
                            lineWidth: 1
                        },
                        ticks: {
                            color: '#888',
                            font: {
                                family: 'Courier New',
                                size: 10
                            }
                        }
                    },
                    y: {
                        grid: {
                            color: '#333',
                            lineWidth: 1
                        },
                        ticks: {
                            color: '#888',
                            font: {
                                family: 'Courier New',
                                size: 10
                            },
                            callback: function(value) {
                                return '$' + value.toFixed(2);
                            }
                        }
                    }
                },
                elements: {
                    point: {
                        hoverBackgroundColor: '#00ff41'
                    }
                }
            }
        });
    }

    async loadFundamentals() {
        const resultDiv = document.getElementById('fundamentalsResult');
        if (!resultDiv) return;
        
        resultDiv.innerHTML = '<div class="loading">LOADING FUNDAMENTALS FROM PFAFF DATABASE</div>';
        
        setTimeout(() => {
            resultDiv.innerHTML = `
                <div class="search-result">
                    <div class="result-header">
                        <span class="result-symbol">FUNDAMENTALS - PFAFF ANALYSIS</span>
                    </div>
                    <div class="fundamentals-grid">
                        <div class="fundamental-item">
                            <span class="fundamental-label">P/E RATIO:</span>
                            <span class="fundamental-value">24.50</span>
                        </div>
                        <div class="fundamental-item">
                            <span class="fundamental-label">P/B RATIO:</span>
                            <span class="fundamental-value">3.20</span>
                        </div>
                        <div class="fundamental-item">
                            <span class="fundamental-label">EPS:</span>
                            <span class="fundamental-value">6.15</span>
                        </div>
                        <div class="fundamental-item">
                            <span class="fundamental-label">DIV YIELD:</span>
                            <span class="fundamental-value">0.50%</span>
                        </div>
                        <div class="fundamental-item">
                            <span class="fundamental-label">MARKET CAP:</span>
                            <span class="fundamental-value">2.9T</span>
                        </div>
                        <div class="fundamental-item">
                            <span class="fundamental-label">REVENUE:</span>
                            <span class="fundamental-value">394.3B</span>
                        </div>
                    </div>
                </div>
            `;
        }, 1000);
    }

    async loadTechnicalAnalysis() {
        const resultDiv = document.getElementById('technicalResult');
        if (!resultDiv) return;
        
        resultDiv.innerHTML = '<div class="loading">CALCULATING TECHNICAL INDICATORS</div>';
        
        setTimeout(() => {
            resultDiv.innerHTML = `
                <div class="search-result">
                    <div class="result-header">
                        <span class="result-symbol">TECHNICAL ANALYSIS - PFAFF SIGNALS</span>
                    </div>
                    <div class="technical-indicators">
                        <div class="indicator">
                            <div class="indicator-name">SMA 20</div>
                            <div class="indicator-value">148.50</div>
                        </div>
                        <div class="indicator">
                            <div class="indicator-name">SMA 50</div>
                            <div class="indicator-value">145.20</div>
                        </div>
                        <div class="indicator">
                            <div class="indicator-name">RSI</div>
                            <div class="indicator-value" style="color: #ffb700">65.2</div>
                        </div>
                        <div class="indicator">
                            <div class="indicator-name">MACD</div>
                            <div class="indicator-value" style="color: #00ff41">2.15</div>
                        </div>
                        <div class="indicator">
                            <div class="indicator-name">BOLLINGER</div>
                            <div class="indicator-value">MID</div>
                        </div>
                        <div class="indicator">
                            <div class="indicator-name">SIGNAL</div>
                            <div class="indicator-value" style="color: #00ff41">BUY</div>
                        </div>
                    </div>
                </div>
            `;
        }, 1000);
    }

    async loadSectorData() {
        const resultDiv = document.getElementById('sectorResult');
        if (!resultDiv) return;
        
        resultDiv.innerHTML = '<div class="loading">LOADING SECTOR DATA</div>';
        
        setTimeout(() => {
            resultDiv.innerHTML = `
                <div class="search-result">
                    <div class="result-header">
                        <span class="result-symbol">SECTOR ANALYSIS - PFAFF RESEARCH</span>
                    </div>
                    <div class="result-details">
                        <span class="result-label">SECTOR:</span>
                        <span class="result-value">TECHNOLOGY</span>
                        
                        <span class="result-label">INDUSTRY:</span>
                        <span class="result-value">CONSUMER ELECTRONICS</span>
                        
                        <span class="result-label">MARKET CAP:</span>
                        <span class="result-value">$2.9T</span>
                        
                        <span class="result-label">PFAFF RATING:</span>
                        <span class="result-value" style="color: #00ff41;">BUY</span>
                        
                        <span class="result-label">BETA:</span>
                        <span class="result-value">1.24</span>
                        
                        <span class="result-label">52W HIGH:</span>
                        <span class="result-value">$198.23</span>
                        
                        <span class="result-label">52W LOW:</span>
                        <span class="result-value">$124.17</span>
                        
                        <span class="result-label">ANALYST RATING:</span>
                        <span class="result-value" style="color: #00ff41;">STRONG BUY</span>
                    </div>
                </div>
            `;
        }, 1000);
    }

    updateTime() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { 
            hour12: false, 
            timeZone: 'America/New_York' 
        });
        const timeElement = document.getElementById('currentTime');
        if (timeElement) {
            timeElement.textContent = `NYC ${timeStr}`;
        }
    }

    updateLastUpdatedTime() {
        const lastUpdatedDiv = document.getElementById('lastUpdated');
        if (lastUpdatedDiv) {
            lastUpdatedDiv.textContent = `LAST UPDATE: ${new Date().toLocaleTimeString()}`;
        }
    }

    formatVolume(volume) {
        if (!volume) return 'N/A';
        if (volume >= 1000000000) return (volume / 1000000000).toFixed(1) + 'B';
        if (volume >= 1000000) return (volume / 1000000).toFixed(1) + 'M';
        if (volume >= 1000) return (volume / 1000).toFixed(1) + 'K';
        return volume.toString();
    }

    formatNewsTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMinutes = Math.round((now - date) / (1000 * 60));
        
        if (diffMinutes < 1) return 'NOW';
        if (diffMinutes < 60) return `${diffMinutes}M`;
        if (diffMinutes < 1440) return `${Math.round(diffMinutes / 60)}H`;
        return date.toLocaleDateString();
    }

    formatMarketCap(value) {
        if (value >= 1e12) return (value / 1e12).toFixed(1) + 'T';
        if (value >= 1e9) return (value / 1e9).toFixed(1) + 'B';
        if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
        return value.toLocaleString();
    }

    handleRealtimeUpdate(data) {
        this.realtimeUpdateCount++;
        
        // Flash update animation
        const symbolElement = document.querySelector(`[data-symbol="${data.symbol}"]`);
        if (symbolElement) {
            symbolElement.classList.add('data-update');
            setTimeout(() => {
                symbolElement.classList.remove('data-update');
            }, 500);
        }
    }

    initializeWebSocket() {
        // Initialize clock
        this.updateTime();
        setInterval(() => this.updateTime(), 1000);
        
        // Set initial WebSocket status
        const wsStatus = document.getElementById('wsStatus');
        if (wsStatus) {
            wsStatus.textContent = 'CONNECTING...';
        }
        
        // Simulate WebSocket connection for demo
        setTimeout(() => {
            const wsStatus = document.getElementById('wsStatus');
            const statusDot = document.querySelector('.status-dot');
            
            if (wsStatus) wsStatus.textContent = 'ONLINE';
            if (statusDot) statusDot.className = 'status-dot status-connected';
        }, 2000);
    }

    startAutoRefresh() {
        // Refresh data every 2 minutes for Pfaff Terminal updates
        setInterval(() => {
            this.loadMarketData();
            this.updateLastUpdatedTime();
        }, 2 * 60 * 1000);

        // Refresh news every 10 minutes
        setInterval(() => {
            this.loadNews();
        }, 10 * 60 * 1000);
    }

    showError(elementId, message) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `<div class="error" style="color: #ff4757; text-align: center; padding: 20px;">${message}</div>`;
        }
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    new FinancialDashboard();
});