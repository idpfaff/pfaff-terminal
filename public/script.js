class FinancialDashboard {
    constructor() {
        this.priceChart = null;
        this.webSocket = null;
        this.realtimeUpdateCount = 0;
        this.currentSymbol = 'AAPL';
        this.currentPeriod = '1M';
        this.watchlistData = {};
        
        // Debug logging
        console.log('🔍 PFAFF TERMINAL DEBUG MODE ACTIVE');
        console.log('📊 Initializing Financial Dashboard...');
        
        this.init();
        this.setupEventListeners();
        this.startAutoRefresh();
    }

    async init() {
        console.log('🚀 Starting dashboard initialization...');
        
        try {
            console.log('📈 Loading market data...');
            await this.loadMarketData();
            
            console.log('💰 Loading crypto data...');
            await this.loadCryptoData();

            console.log('💱 Loading forex data...');
            await this.loadForexData();

            console.log('📰 Loading news...');
            await this.loadNews();
            
            console.log('📊 Loading default chart...');
            await this.loadDefaultChart();

            this.updateLastUpdatedTime();
            console.log('✅ Dashboard initialization complete!');

            await this.initializeWebSocket();
        } catch (error) {
            console.error('❌ Dashboard initialization failed:', error);
        }
    }

    setupEventListeners() {
        console.log('🎛️ Setting up event listeners...');
        
        const searchBtn = document.getElementById('searchBtn');
        const symbolInput = document.getElementById('symbolInput');
        const periodSelect = document.getElementById('chartPeriod');
        const chartSymbolSelect = document.getElementById('chartSymbol');
        const fundamentalsBtn = document.getElementById('fundamentalsBtn');
        const technicalBtn = document.getElementById('technicalBtn');
        const sectorBtn = document.getElementById('sectorBtn');

        // Debug: Check if elements exist
        console.log('🔍 Element check:');
        console.log('  - searchBtn:', !!searchBtn);
        console.log('  - symbolInput:', !!symbolInput);
        console.log('  - periodSelect:', !!periodSelect);
        console.log('  - chartSymbolSelect:', !!chartSymbolSelect);

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
                this.currentPeriod = periodSelect.value;
                console.log(`📊 Period changed to: ${this.currentPeriod}`);
                this.loadChart(this.currentSymbol, this.currentPeriod);
            });
        }

        if (chartSymbolSelect) {
            chartSymbolSelect.addEventListener('change', () => {
                this.currentSymbol = chartSymbolSelect.value;
                console.log(`🎯 Symbol changed to: ${this.currentSymbol}`);
                this.loadChart(this.currentSymbol, this.currentPeriod);
            });
        }

        if (fundamentalsBtn) fundamentalsBtn.addEventListener('click', () => this.loadFundamentals());
        if (technicalBtn) technicalBtn.addEventListener('click', () => this.loadTechnicalAnalysis());
        if (sectorBtn) sectorBtn.addEventListener('click', () => this.loadSectorData());

        console.log('✅ Event listeners setup complete');
    }

    async loadMarketData() {
        console.log('📈 Starting market data fetch...');
        
        try {
            console.log('🌐 Making request to /api/stocks...');
            const response = await fetch('/api/stocks');
            
            console.log('📊 Response status:', response.status);
            console.log('📊 Response ok:', response.ok);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            console.log('📊 Raw API response:', data);
            console.log('📊 Data source:', data.dataSource);
            console.log('📊 Stocks count:', Object.keys(data.stocks || {}).length);
            console.log('📊 ETFs count:', Object.keys(data.etfs || {}).length);
            
            // Debug: Log first few stocks
            if (data.stocks) {
                console.log('📊 Sample stocks data:');
                Object.entries(data.stocks).slice(0, 3).forEach(([symbol, stockData]) => {
                    console.log(`  ${symbol}:`, stockData);
                });
            }
            
            this.renderWatchlist(data.stocks);
            this.renderETFList(data.etfs || {});
            this.renderMarketSummary(data.stocks);
            
            // Show data source indicator
            this.showDataSourceIndicator('stocks', data.dataSource);
            
            console.log('✅ Market data loaded successfully');
            
        } catch (error) {
            console.error('❌ Error loading market data:', error);
            console.error('❌ Error stack:', error.stack);
            this.showError('stockList', 'FAILED TO LOAD MARKET DATA - CHECK CONSOLE');
        }
    }

    async loadCryptoData() {
        console.log('💰 Starting crypto data fetch...');
        
        try {
            console.log('🌐 Making request to /api/crypto...');
            const response = await fetch('/api/crypto');
            
            console.log('💰 Response status:', response.status);
            console.log('💰 Response ok:', response.ok);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            console.log('💰 Raw crypto API response:', data);
            console.log('💰 Data source:', data.dataSource);
            console.log('💰 Crypto count:', Object.keys(data.crypto || {}).length);
            
            // Debug: Log crypto data
            if (data.crypto) {
                console.log('💰 Sample crypto data:');
                Object.entries(data.crypto).slice(0, 3).forEach(([symbol, cryptoData]) => {
                    console.log(`  ${symbol}:`, cryptoData);
                });
            }
            
            this.renderCryptoList(data.crypto);
            this.showDataSourceIndicator('crypto', data.dataSource);
            
            console.log('✅ Crypto data loaded successfully');
            
        } catch (error) {
            console.error('❌ Error loading crypto data:', error);
            console.error('❌ Error stack:', error.stack);
            this.showError('cryptoList', 'FAILED TO LOAD CRYPTO DATA - CHECK CONSOLE');
        }
    }

    async loadForexData() {
        console.log('💱 Starting forex data fetch...');

        try {
            console.log('🌐 Making request to /api/fx...');
            const response = await fetch('/api/fx');

            console.log('💱 Response status:', response.status);
            console.log('💱 Response ok:', response.ok);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            console.log('💱 Raw forex API response:', data);
            console.log('💱 Data source:', data.dataSource);
            console.log('💱 Forex count:', Object.keys(data.fx || {}).length);

            this.renderForexList(data.fx);
            this.showDataSourceIndicator('forex', data.dataSource);

            console.log('✅ Forex data loaded successfully');

        } catch (error) {
            console.error('❌ Error loading forex data:', error);
            console.error('❌ Error stack:', error.stack);
            this.showError('forexList', 'FAILED TO LOAD FOREX DATA - CHECK CONSOLE');
        }
    }

    async loadNews() {
        console.log('📰 Starting news data fetch...');
        
        try {
            console.log('🌐 Making request to /api/news...');
            const response = await fetch('/api/news');
            
            console.log('📰 Response status:', response.status);
            console.log('📰 Response ok:', response.ok);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            console.log('📰 Raw news API response:', data);
            console.log('📰 Data source:', data.dataSource);
            console.log('📰 News count:', data.articles ? data.articles.length : 0);
            
            // Debug: Log news data
            if (data.articles && data.articles.length > 0) {
                console.log('📰 Sample news data:');
                data.articles.slice(0, 2).forEach((article, index) => {
                    console.log(`  ${index + 1}:`, {
                        title: article.title,
                        source: article.source,
                        publishedAt: article.publishedAt
                    });
                });
            }
            
            this.renderNews(data.articles);
            this.showDataSourceIndicator('news', data.dataSource);
            
            console.log('✅ News data loaded successfully');
            
        } catch (error) {
            console.error('❌ Error loading news:', error);
            console.error('❌ Error stack:', error.stack);
            this.showError('newsList', 'FAILED TO LOAD NEWS - CHECK CONSOLE');
        }
    }

    async loadDefaultChart() {
        console.log('📊 Loading default chart...');
        await this.loadChart(this.currentSymbol, this.currentPeriod);
    }

    async searchStock() {
        const symbolInput = document.getElementById('symbolInput');
        const symbol = symbolInput?.value?.trim()?.toUpperCase();
        
        console.log('🔍 Stock search initiated for:', symbol);
        
        if (!symbol) {
            console.log('❌ No symbol provided for search');
            return;
        }

        const resultDiv = document.getElementById('searchResult');
        if (resultDiv) {
            resultDiv.innerHTML = '<div class="loading">SEARCHING PFAFF DATABASE</div>';
        }

        try {
            console.log(`🌐 Making request to /api/stocks/${symbol}...`);
            const response = await fetch(`/api/stocks/${symbol}`);
            
            console.log('🔍 Search response status:', response.status);
            console.log('🔍 Search response ok:', response.ok);
            
            if (!response.ok) {
                throw new Error(`Symbol not found: ${response.status}`);
            }
            
            const stockData = await response.json();
            console.log('🔍 Search result:', stockData);
            
            this.renderSearchResult(stockData);
            this.currentSymbol = symbol;
            this.loadChart(symbol, this.currentPeriod);
            
            console.log('✅ Stock search completed successfully');
            
        } catch (error) {
            console.error('❌ Stock search error:', error);
            if (resultDiv) {
                resultDiv.innerHTML = `<div class="error">SYMBOL "${symbol}" NOT FOUND</div>`;
            }
        }
    }

    async loadChart(symbol, period) {
        console.log(`📊 Loading chart for ${symbol}, period: ${period}`);
        
        try {
            console.log(`🌐 Making request to /api/stocks/${symbol}/history?period=${period}...`);
            const response = await fetch(`/api/stocks/${symbol}/history?period=${period}`);
            
            console.log('📊 Chart response status:', response.status);
            console.log('📊 Chart response ok:', response.ok);
            
            if (!response.ok) {
                throw new Error(`Chart data not available: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('📊 Chart data received:', data);
            console.log('📊 Chart data points:', data.data ? data.data.length : 0);
            
            this.renderChart(data.data, symbol);
            
            console.log('✅ Chart loaded successfully');
            
        } catch (error) {
            console.error('❌ Error loading chart:', error);
            this.generateFallbackChart(symbol, period);
        }
    }

    renderWatchlist(stocks) {
        console.log('🎨 Rendering watchlist...');
        const stockList = document.getElementById('stockList');
        
        if (!stockList) {
            console.error('❌ stockList element not found!');
            return;
        }
        
        console.log('🎨 stockList element found:', stockList);
        console.log('🎨 Stocks data to render:', stocks);

        this.watchlistData = { ...(stocks || {}) };

        if (!stocks || Object.keys(stocks).length === 0) {
            console.log('⚠️ No stocks data, showing loading message');
            stockList.innerHTML = '<div class="loading">LOADING PFAFF MARKET DATA</div>';
            return;
        }

        console.log('🎨 Processing stocks for rendering...');
        const stocksHtml = Object.values(stocks).map((stock, index) => {
            console.log(`🎨 Processing stock ${index + 1}:`, stock);
            
            const changeClass = parseFloat(stock.change) >= 0 ? 'positive' : 'negative';
            const changeSymbol = parseFloat(stock.change) >= 0 ? '+' : '';
            
            return `
                <div class="watchlist-item data-update" data-symbol="${stock.symbol}" onclick="window.dashboard.selectStock('${stock.symbol}')">
                    <span class="symbol">${stock.symbol}</span>
                    <span class="price">${parseFloat(stock.price).toFixed(2)}</span>
                    <span class="change ${changeClass}">${changeSymbol}${parseFloat(stock.change).toFixed(2)}</span>
                    <span class="volume">${this.formatVolume(stock.volume)}</span>
                </div>
            `;
        }).join('');

        console.log('🎨 Generated HTML length:', stocksHtml.length);
        console.log('🎨 Setting innerHTML...');
        stockList.innerHTML = stocksHtml;
        
        console.log('✅ Watchlist rendered successfully');
    }

    renderETFList(etfs) {
        console.log('🎨 Rendering ETF list...');
        const etfList = document.getElementById('etfList');
        
        if (!etfList) {
            console.error('❌ etfList element not found!');
            return;
        }
        
        console.log('🎨 ETF data to render:', etfs);
        
        if (!etfs || Object.keys(etfs).length === 0) {
            console.log('⚠️ No ETF data, showing loading message');
            etfList.innerHTML = '<div class="loading">LOADING ETF DATA</div>';
            return;
        }

        const etfsHtml = Object.values(etfs).map(etf => {
            const changeClass = parseFloat(etf.change) >= 0 ? 'positive' : 'negative';
            const changeSymbol = parseFloat(etf.change) >= 0 ? '+' : '';
            
            return `
                <div class="watchlist-item data-update" data-symbol="${etf.symbol}" onclick="window.dashboard.selectStock('${etf.symbol}')">
                    <span class="symbol">${etf.symbol}</span>
                    <span class="price">${parseFloat(etf.price).toFixed(2)}</span>
                    <span class="change ${changeClass}">${changeSymbol}${parseFloat(etf.change).toFixed(2)}</span>
                    <span class="volume">${this.formatVolume(etf.volume)}</span>
                </div>
            `;
        }).join('');

        etfList.innerHTML = etfsHtml;
        console.log('✅ ETF list rendered successfully');
    }

    renderCryptoList(crypto) {
        console.log('🎨 Rendering crypto list...');
        const cryptoList = document.getElementById('cryptoList');
        
        if (!cryptoList) {
            console.error('❌ cryptoList element not found!');
            return;
        }
        
        console.log('🎨 Crypto data to render:', crypto);
        
        if (!crypto || Object.keys(crypto).length === 0) {
            console.log('⚠️ No crypto data, showing loading message');
            cryptoList.innerHTML = '<div class="loading">LOADING CRYPTO DATA</div>';
            return;
        }

        const cryptoHtml = Object.values(crypto).map(coin => {
            const changeClass = parseFloat(coin.change) >= 0 ? 'positive' : 'negative';
            const changeSymbol = parseFloat(coin.change) >= 0 ? '+' : '';
            
            return `
                <div class="watchlist-item data-update" data-symbol="${coin.symbol}">
                    <span class="symbol">${coin.symbol.replace('USD', '').toUpperCase()}</span>
                    <span class="price">${parseFloat(coin.price).toFixed(2)}</span>
                    <span class="change ${changeClass}">${changeSymbol}${parseFloat(coin.change).toFixed(2)}</span>
                    <span class="volume">${this.formatVolume(coin.volume)}</span>
                </div>
            `;
        }).join('');

        cryptoList.innerHTML = cryptoHtml;
        console.log('✅ Crypto list rendered successfully');
    }

    renderForexList(fx) {
        console.log('🎨 Rendering forex list...');
        const forexList = document.getElementById('forexList');

        if (!forexList) {
            console.error('❌ forexList element not found!');
            return;
        }

        if (!fx || Object.keys(fx).length === 0) {
            console.log('⚠️ No forex data, showing loading message');
            forexList.innerHTML = '<div class="loading">LOADING FOREX DATA</div>';
            return;
        }

        const fxHtml = Object.values(fx).map(pair => {
            const spread = (pair.ask ?? 0) - (pair.bid ?? 0);
            return `
                <div class="watchlist-item data-update" data-symbol="${pair.symbol}">
                    <span class="symbol">${pair.symbol}</span>
                    <span class="price">${parseFloat(pair.price).toFixed(4)}</span>
                    <span class="change">${spread ? spread.toFixed(4) : 'N/A'}</span>
                    <span class="volume">${pair.bid && pair.ask ? pair.bid.toFixed(4) + '/' + pair.ask.toFixed(4) : 'N/A'}</span>
                </div>
            `;
        }).join('');

        forexList.innerHTML = fxHtml;
        console.log('✅ Forex list rendered successfully');
    }

    renderMarketSummary(stocks) {
        console.log('🎨 Rendering market summary...');
        const marketSummary = document.getElementById('marketSummary');
        
        if (!marketSummary) {
            console.error('❌ marketSummary element not found!');
            return;
        }
        
        if (!stocks || Object.keys(stocks).length === 0) {
            console.log('⚠️ No stocks data for market summary');
            marketSummary.innerHTML = '<div class="loading">LOADING MARKET SUMMARY</div>';
            return;
        }

        const stocksArray = Object.values(stocks);
        const gainers = stocksArray.filter(s => parseFloat(s.change) > 0).length;
        const losers = stocksArray.filter(s => parseFloat(s.change) < 0).length;
        const totalVolume = stocksArray.reduce((sum, s) => sum + (s.volume || 0), 0);
        const avgChange = stocksArray.reduce((sum, s) => sum + parseFloat(s.change), 0) / stocksArray.length;

        console.log('🎨 Market summary stats:', { gainers, losers, totalVolume, avgChange });

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
        
        console.log('✅ Market summary rendered successfully');
    }

    renderNews(articles) {
        console.log('🎨 Rendering news...');
        const newsList = document.getElementById('newsList');
        const newsTicker = document.getElementById('newsTicker');
        
        if (!newsList) {
            console.error('❌ newsList element not found!');
        }
        
        if (!newsTicker) {
            console.error('❌ newsTicker element not found!');
        }
        
        if (!articles || articles.length === 0) {
            console.log('⚠️ No news articles to render');
            if (newsList) newsList.innerHTML = '<div class="loading">LOADING PFAFF NEWS FEED</div>';
            return;
        }

        console.log('🎨 News articles to render:', articles.length);

        // Update ticker
        if (newsTicker) {
            const tickerText = articles.slice(0, 3).map(article => 
                `${article.source.toUpperCase()}: ${article.title}`
            ).join(' • ');
            newsTicker.textContent = tickerText;
            console.log('🎨 News ticker updated');
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
            console.log('🎨 News list updated');
        }
        
        console.log('✅ News rendered successfully');
    }

    renderSearchResult(stock) {
        console.log('🎨 Rendering search result:', stock);
        const resultDiv = document.getElementById('searchResult');
        
        if (!resultDiv) {
            console.error('❌ searchResult element not found!');
            return;
        }
        
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
                    <span class="result-value">${parseFloat(stock.high || stock.price).toFixed(2)}</span>
                    
                    <span class="result-label">LOW:</span>
                    <span class="result-value">${parseFloat(stock.low || stock.price).toFixed(2)}</span>
                    
                    <span class="result-label">BID:</span>
                    <span class="result-value">${parseFloat(stock.bidPrice || stock.price * 0.999).toFixed(2)}</span>
                    
                    <span class="result-label">ASK:</span>
                    <span class="result-value">${parseFloat(stock.askPrice || stock.price * 1.001).toFixed(2)}</span>
                </div>
            </div>
        `;
        
        console.log('✅ Search result rendered successfully');
    }

    renderChart(historicalData, symbol) {
        console.log(`📊 Rendering chart for ${symbol} with ${historicalData ? historicalData.length : 0} data points`);
        
        const canvas = document.getElementById('priceChart');
        if (!canvas) {
            console.error('❌ priceChart canvas not found!');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        
        if (this.priceChart) {
            this.priceChart.destroy();
        }
        
        if (!historicalData || historicalData.length === 0) {
            console.error('❌ No historical data for chart');
            return;
        }
        
        const labels = historicalData.map(item => new Date(item.date).toLocaleDateString());
        const prices = historicalData.map(item => item.close);
        
        console.log('📊 Chart labels:', labels.slice(0, 5), '...');
        console.log('📊 Chart prices:', prices.slice(0, 5), '...');
        
        this.priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `${symbol} PRICE`,
                    data: prices,
                    borderColor: '#ffb700',
                    backgroundColor: 'rgba(255, 183, 0, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHoverBackgroundColor: '#00ff41'
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
                            size: 14,
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
                }
            }
        });
        
        console.log('✅ Chart rendered successfully');
    }

    generateFallbackChart(symbol, period) {
        console.log(`📊 Generating fallback chart for ${symbol}, period: ${period}`);
        
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
        
        console.log(`📊 Generated ${mockData.length} fallback data points`);
        this.renderChart(mockData, symbol);
    }

    // Additional helper methods
    selectStock(symbol) {
        console.log(`🎯 Stock selected: ${symbol}`);
        this.currentSymbol = symbol;
        
        const chartSymbolSelect = document.getElementById('chartSymbol');
        if (chartSymbolSelect) {
            chartSymbolSelect.value = symbol;
        }
        
        const symbolInput = document.getElementById('symbolInput');
        if (symbolInput) {
            symbolInput.value = symbol;
        }
        
        this.loadChart(symbol, this.currentPeriod);
        this.clearAnalysisResults();
    }

    clearAnalysisResults() {
        const results = ['searchResult', 'fundamentalsResult', 'technicalResult', 'sectorResult'];
        results.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.innerHTML = '';
            }
        });
    }

    async loadFundamentals() {
        console.log('📊 Loading fundamentals...');

        try {
            console.log('🌐 Making request to /api/fundamentals/definitions...');
            const response = await fetch('/api/fundamentals/definitions');

            console.log('📊 Response status:', response.status);
            console.log('📊 Response ok:', response.ok);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('📊 Fundamentals data:', data);

            const container = document.getElementById('fundamentalsResult');
            if (container) {
                container.innerHTML = `<pre>${JSON.stringify(data.slice(0, 10), null, 2)}</pre>`;
            }
        } catch (error) {
            console.error('❌ Error loading fundamentals:', error);
            this.showError('fundamentalsResult', 'FAILED TO LOAD FUNDAMENTALS - CHECK CONSOLE');
        }
    }

    async loadTechnicalAnalysis() {
        console.log('📈 Loading technical analysis...');
        // Implementation similar to other load methods with debug logging
    }

    async loadSectorData() {
        console.log('🏢 Loading sector data...');
        // Implementation similar to other load methods with debug logging
    }

    showDataSourceIndicator(type, source) {
        console.log(`📊 Data source indicator: ${type} = ${source}`);
        
        const indicator = document.createElement('div');
        indicator.className = `data-source-indicator ${source}`;
        indicator.textContent = source === 'live' ? 'LIVE' : 'DEMO';
        indicator.style.cssText = `
            position: fixed;
            top: 80px;
            right: 10px;
            background: ${source === 'live' ? '#00ff41' : '#ffb700'};
            color: #000;
            padding: 2px 6px;
            font-size: 0.7rem;
            font-weight: bold;
            z-index: 1000;
            border-radius: 2px;
        `;
        
        document.body.appendChild(indicator);
        
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
            }
        }, 3000);
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
        if (!value) return 'N/A';
        if (value >= 1e12) return (value / 1e12).toFixed(1) + 'T';
        if (value >= 1e9) return (value / 1e9).toFixed(1) + 'B';
        if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
        return value.toLocaleString();
    }

    handleRealtimeUpdate(update) {
        this.realtimeUpdateCount++;
        const { symbol, price } = update;
        if (!symbol || price == null) return;

        const data = this.watchlistData[symbol];
        if (data) {
            const prevClose = data.close ?? (data.price - data.change);
            data.price = price;
            if (prevClose != null) {
                data.change = price - prevClose;
            }

            const row = document.querySelector(`[data-symbol="${symbol}"]`);
            if (row) {
                const priceEl = row.querySelector('.price');
                const changeEl = row.querySelector('.change');
                if (priceEl) priceEl.textContent = price.toFixed(2);
                if (changeEl && !isNaN(data.change)) {
                    const changeClass = data.change >= 0 ? 'positive' : 'negative';
                    changeEl.className = `change ${changeClass}`;
                    changeEl.textContent = `${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)}`;
                }
                row.classList.add('data-update');
                setTimeout(() => row.classList.remove('data-update'), 500);
            }
        }
    }

    async initializeWebSocket() {
        console.log('🔌 Initializing WebSocket connection...');

        this.updateTime();
        setInterval(() => this.updateTime(), 1000);

        const wsStatus = document.getElementById('wsStatus');
        if (wsStatus) wsStatus.textContent = 'CONNECTING...';

        await this.checkAPIHealth();

        try {
            const tokenRes = await fetch('/api/tiingo/token');
            const { token } = await tokenRes.json();
            const tickers = Object.keys(this.watchlistData || {}).join(',');
            const url = `wss://api.tiingo.com/iex?tickers=${tickers}&token=${token}&thresholdLevel=5`;
            const ws = new WebSocket(url);
            this.webSocket = ws;

            ws.onopen = () => {
                if (wsStatus) wsStatus.textContent = 'ONLINE';
                const statusDot = document.querySelector('.status-dot');
                if (statusDot) statusDot.className = 'status-dot status-connected';
                console.log('✅ WebSocket connected');
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (Array.isArray(msg.data)) {
                        msg.data.forEach((arr) => {
                            const symbol = arr[1];
                            const price = arr[2];
                            if (symbol && price != null) {
                                this.handleRealtimeUpdate({ symbol, price });
                            }
                        });
                    }
                } catch (err) {
                    console.error('❌ Error parsing websocket message:', err);
                }
            };

            ws.onerror = (err) => {
                console.error('❌ WebSocket error:', err);
            };

            ws.onclose = () => {
                if (wsStatus) wsStatus.textContent = 'OFFLINE';
                const statusDot = document.querySelector('.status-dot');
                if (statusDot) statusDot.className = 'status-dot status-disconnected';
                console.log('⚠️ WebSocket disconnected');
            };
        } catch (error) {
            console.error('❌ WebSocket initialization failed:', error);
        }
    }

    async checkAPIHealth() {
        console.log('🏥 Checking API health...');
        
        try {
            const response = await fetch('/api/health');
            const health = await response.json();
            
            console.log('🏥 API Health Check Results:', health);
            console.log('🏥 Tiingo Configured:', health.tiingoConfigured);
            console.log('🏥 Features Status:', health.features);
            
        } catch (error) {
            console.error('❌ Health check failed:', error);
        }
    }

    startAutoRefresh() {
        console.log('🔄 Starting auto-refresh timers...');
        
        // Refresh market data every 2 minutes
        setInterval(() => {
            console.log('🔄 Auto-refreshing market data...');
            this.loadMarketData();
            this.loadCryptoData();
            this.loadForexData();
            this.updateLastUpdatedTime();
        }, 2 * 60 * 1000);

        // Refresh news every 10 minutes
        setInterval(() => {
            console.log('🔄 Auto-refreshing news...');
            this.loadNews();
        }, 10 * 60 * 1000);
        
        console.log('✅ Auto-refresh timers started');
    }

    showError(elementId, message) {
        console.error(`❌ Showing error in ${elementId}: ${message}`);
        
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `<div class="error" style="color: #ff4757; text-align: center; padding: 20px; font-size: 0.8rem;">${message}</div>`;
        } else {
            console.error(`❌ Element ${elementId} not found for error display`);
        }
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🌐 DOM Content Loaded - Starting Pfaff Terminal...');
    console.log('🔍 DEBUG MODE: All operations will be logged to console');
    
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
        console.error('❌ Chart.js not loaded! Charts will not work.');
    } else {
        console.log('✅ Chart.js loaded successfully');
    }
    
    // Check for critical DOM elements
    const criticalElements = [
        'stockList', 'etfList', 'cryptoList', 'forexList', 'newsList', 'marketSummary',
        'priceChart', 'searchResult', 'fundamentalsResult', 'currentTime', 'wsStatus'
    ];
    
    console.log('🔍 Checking for critical DOM elements:');
    criticalElements.forEach(id => {
        const element = document.getElementById(id);
        console.log(`  ${id}: ${element ? '✅ Found' : '❌ Missing'}`);
    });
    
    // Initialize dashboard
    window.dashboard = new FinancialDashboard();
    
    console.log('🚀 Pfaff Terminal initialization complete!');
    console.log('📊 Check the console above for any errors or issues');
    console.log('💡 If data is not showing, look for red ❌ messages above');
});