// WhatsApp Number Filter - Frontend JavaScript

class WhatsAppFilter {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.currentResults = [];
        this.init();
    }

    init() {
        this.initializeSocket();
        this.bindEvents();
        this.initializeTabs();
    }

    initializeSocket() {
        // Get auth token from cookies
        const authToken = document.cookie
            .split('; ')
            .find(row => row.startsWith('auth_token='))
            ?.split('=')[1];
        
        // Initialize socket with auth token
        this.socket = io({
            auth: {
                token: authToken
            }
        });
        
        // Connection events
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.showConnectionStatus('Disconnected from server', 'error');
        });

        // WhatsApp events
        this.socket.on('whatsapp_status', (data) => {
            this.handleWhatsAppStatus(data);
        });

        this.socket.on('qr_code', (data) => {
            this.showQRCode(data.qr);
        });

        this.socket.on('whatsapp_ready', () => {
            this.showConnectedStatus();
        });

        this.socket.on('whatsapp_disconnected', (data) => {
            console.log('WhatsApp disconnected:', data);
            this.isConnected = false;
            this.hideInputSection();
            this.hideResults();
            document.getElementById('qrSection').style.display = 'none';
            document.getElementById('connectedSection').style.display = 'none';
            document.getElementById('connectionStatus').style.display = 'block';
            
            const reason = data.reason || 'unknown';
            const isManualDisconnect = data.manualDisconnect || false;
            let message = 'WhatsApp disconnected';
            
            if (isManualDisconnect) {
                message = 'WhatsApp device disconnected successfully. Refresh page to reconnect.';
                this.showConnectionStatus(message, 'success');
            } else if (reason === 401) {
                message = 'WhatsApp session expired. Please scan QR code again.';
                this.showConnectionStatus(message, 'warning');
            } else if (reason === 403) {
                message = 'WhatsApp access denied. Please try again.';
                this.showConnectionStatus(message, 'error');
            } else if (reason === 408) {
                message = 'WhatsApp connection timeout. Reconnecting...';
                this.showConnectionStatus(message, 'warning');
            } else if (reason === 428) {
                message = 'WhatsApp connection lost. Reconnecting...';
                this.showConnectionStatus(message, 'warning');
            } else if (reason === 440) {
                message = 'WhatsApp session replaced by another device.';
                this.showConnectionStatus(message, 'error');
            } else {
                message = `WhatsApp disconnected (${reason}). Reconnecting...`;
                this.showConnectionStatus(message, 'warning');
            }
        });

        // Number checking events
        this.socket.on('check_progress', (data) => {
            this.updateProgress(data.current, data.total, data.number);
        });

        this.socket.on('check_complete', (data) => {
            this.hideLoadingOverlay();
            this.showResults(data.results);
        });

        this.socket.on('check_error', (data) => {
            this.hideLoadingOverlay();
            this.showError('Error checking numbers: ' + data.error);
        });
    }

    bindEvents() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // File input
        const fileInput = document.getElementById('fileInput');
        fileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files[0]);
        });

        // Drag and drop
        const fileLabel = document.querySelector('.file-label');
        fileLabel.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileLabel.style.background = '#e8f5e8';
        });

        fileLabel.addEventListener('dragleave', () => {
            fileLabel.style.background = '#f8f9fa';
        });

        fileLabel.addEventListener('drop', (e) => {
            e.preventDefault();
            fileLabel.style.background = '#f8f9fa';
            const file = e.dataTransfer.files[0];
            if (file) {
                this.handleFileUpload(file);
            }
        });

        // Input validation
        const numbersInput = document.getElementById('numbersInput');
        numbersInput.addEventListener('input', () => {
            this.validateInput();
        });

        // Buttons
        document.getElementById('checkBtn').addEventListener('click', () => {
            this.checkNumbers();
        });

        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearInput();
        });

        document.getElementById('restartBtn').addEventListener('click', () => {
            this.restartWhatsApp();
        });

        document.getElementById('forceRestartBtn').addEventListener('click', () => {
            this.forceRestartWhatsApp();
        });

        document.getElementById('disconnectBtn').addEventListener('click', () => {
            this.disconnectWhatsApp();
        });

        document.getElementById('exportValidBtn').addEventListener('click', () => {
            this.exportResults('valid');
        });

        document.getElementById('exportAllBtn').addEventListener('click', () => {
            this.exportResults('all');
        });
    }

    initializeTabs() {
        this.switchTab('manual');
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

        this.validateInput();
    }

    handleWhatsAppStatus(data) {
        const statusElement = document.getElementById('connectionStatus');
        const disconnectedActions = document.getElementById('disconnectedActions');
        
        switch(data.status) {
            case 'initializing':
                statusElement.innerHTML = `
                    <div class="loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span>Initializing WhatsApp client...</span>
                    </div>
                `;
                // Show regenerate QR button immediately for initializing
                if (disconnectedActions) {
                    disconnectedActions.style.display = 'block';
                }
                break;
            case 'qr':
                statusElement.innerHTML = `
                    <div class="loading">
                        <i class="fas fa-qrcode"></i>
                        <span>Waiting for QR code scan...</span>
                    </div>
                `;
                // Show regenerate QR button for QR status
                if (disconnectedActions) {
                    disconnectedActions.style.display = 'block';
                }
                break;
            case 'loading_session':
                statusElement.innerHTML = `
                    <div class="loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span>Loading session...</span>
                    </div>
                `;
                // Show regenerate QR button for loading session
                if (disconnectedActions) {
                    disconnectedActions.style.display = 'block';
                }
                break;
            case 'authenticated':
                statusElement.innerHTML = `
                    <div class="loading">
                        <i class="fas fa-check"></i>
                        <span>Authenticated! Connecting...</span>
                    </div>
                `;
                // Show regenerate QR button until fully connected
                if (disconnectedActions) {
                    disconnectedActions.style.display = 'block';
                }
                break;
            case 'timeout':
                statusElement.innerHTML = `
                    <div class="loading">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span style="color: #ff6b6b;">${data.message || 'Initialization timeout, restarting...'}</span>
                    </div>
                `;
                if (disconnectedActions) {
                    disconnectedActions.style.display = 'block';
                }
                break;
            case 'force_restarting':
                statusElement.innerHTML = `
                    <div class="loading">
                        <i class="fas fa-redo-alt fa-spin"></i>
                        <span style="color: #ffa500;">${data.message || 'Regenerating QR Code...'}</span>
                    </div>
                `;
                if (disconnectedActions) {
                    disconnectedActions.style.display = 'none';
                }
                break;
            default:
                statusElement.innerHTML = `
                    <div class="loading">
                        <i class="fas fa-info-circle"></i>
                        <span>${data.message || 'Unknown status'}</span>
                    </div>
                `;
                // Show regenerate QR button for unknown status
                if (disconnectedActions) {
                    disconnectedActions.style.display = 'block';
                }
        }
    }

    showQRCode(qrData) {
        document.getElementById('qrSection').style.display = 'block';
        document.getElementById('qrCode').src = qrData;
        document.getElementById('connectedSection').style.display = 'none';
        document.getElementById('restartBtn').style.display = 'inline-block';
        
        // Show force restart button when QR code is displayed
        const disconnectedActions = document.getElementById('disconnectedActions');
        if (disconnectedActions) {
            disconnectedActions.style.display = 'block';
        }
    }

    showConnectedStatus() {
        this.isConnected = true;
        document.getElementById('qrSection').style.display = 'none';
        document.getElementById('connectedSection').style.display = 'block';
        document.getElementById('connectionStatus').style.display = 'none';
        document.getElementById('restartBtn').style.display = 'inline-block';
        
        // Hide force restart button when connected
        const disconnectedActions = document.getElementById('disconnectedActions');
        if (disconnectedActions) {
            disconnectedActions.style.display = 'none';
        }
        
        // Show input section
        this.showInputSection();
    }

    showConnectionStatus(message, type = 'info') {
        const statusElement = document.getElementById('connectionStatus');
        let iconClass, textColor;
        
        switch(type) {
            case 'error':
                iconClass = 'fas fa-exclamation-triangle';
                textColor = 'color: #dc3545;';
                break;
            case 'warning':
                iconClass = 'fas fa-exclamation-triangle';
                textColor = 'color: #ffc107;';
                break;
            case 'success':
                iconClass = 'fas fa-check-circle';
                textColor = 'color: #28a745;';
                break;
            default:
                iconClass = 'fas fa-info-circle';
                textColor = 'color: #666;';
        }
        
        statusElement.innerHTML = `
            <div class="loading" style="${textColor}">
                <i class="${iconClass}"></i>
                <span>${message}</span>
            </div>
        `;
        statusElement.style.display = 'block';
        
        // Show disconnectedActions when connection status is displayed
        const disconnectedActions = document.getElementById('disconnectedActions');
        if (disconnectedActions && (type === 'error' || type === 'warning')) {
            disconnectedActions.style.display = 'block';
        }
    }

    showInputSection() {
        document.getElementById('inputSection').style.display = 'block';
        document.getElementById('inputSection').classList.add('fade-in');
    }

    hideInputSection() {
        document.getElementById('inputSection').style.display = 'none';
    }

    handleFileUpload(file) {
        if (!file) return;

        const allowedTypes = ['text/plain', 'text/csv', 'application/csv'];
        if (!allowedTypes.includes(file.type) && !file.name.endsWith('.txt') && !file.name.endsWith('.csv')) {
            this.showError('Please upload a .txt or .csv file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            document.getElementById('numbersInput').value = content;
            this.switchTab('manual');
            this.validateInput();
        };
        reader.readAsText(file);
    }

    validateInput() {
        const numbersInput = document.getElementById('numbersInput');
        const checkBtn = document.getElementById('checkBtn');
        
        const numbers = this.parseNumbers(numbersInput.value);
        const isValid = numbers.length > 0 && numbers.length <= 5000 && this.isConnected;
        
        checkBtn.disabled = !isValid;
        
        // Update input info
        const inputInfo = document.querySelector('.input-info span');
        if (numbers.length > 5000) {
            inputInfo.textContent = `Too many numbers (${numbers.length}/5000). Please reduce the count.`;
            inputInfo.style.color = '#dc3545';
        } else if (numbers.length > 0) {
            inputInfo.textContent = `${numbers.length} numbers ready to check.`;
            inputInfo.style.color = '#28a745';
        } else {
            inputInfo.textContent = 'Enter up to 5000 numbers. One number per line.';
            inputInfo.style.color = '#666';
        }
    }

    parseNumbers(input) {
        if (!input.trim()) return [];
        
        return input.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .filter(line => /\d/.test(line)); // Must contain at least one digit
    }

    checkNumbers() {
        const numbersInput = document.getElementById('numbersInput');
        const numbers = this.parseNumbers(numbersInput.value);
        
        if (numbers.length === 0) {
            this.showError('Please enter some numbers to check');
            return;
        }

        if (numbers.length > 5000) {
            this.showError('Maximum 5000 numbers allowed at once');
            return;
        }

        if (!this.isConnected) {
            this.showError('WhatsApp is not connected. Please scan the QR code first.');
            return;
        }

        this.showLoadingOverlay();
        this.socket.emit('check_numbers', { numbers });
    }

    clearInput() {
        document.getElementById('numbersInput').value = '';
        document.getElementById('fileInput').value = '';
        this.validateInput();
        this.hideResults();
    }

    restartWhatsApp() {
        this.isConnected = false;
        this.hideInputSection();
        this.hideResults();
        document.getElementById('qrSection').style.display = 'none';
        document.getElementById('connectedSection').style.display = 'none';
        document.getElementById('connectionStatus').style.display = 'block';
        
        this.showConnectionStatus('Restarting WhatsApp client...', 'info');
        this.socket.emit('restart_whatsapp');
    }

    forceRestartWhatsApp() {
        if (confirm('Force restart will clear all session data and you will need to scan QR code again. Continue?')) {
            this.isConnected = false;
            this.hideInputSection();
            this.hideResults();
            document.getElementById('qrSection').style.display = 'none';
            document.getElementById('connectedSection').style.display = 'none';
            document.getElementById('connectionStatus').style.display = 'block';
            
            this.showConnectionStatus('Force restarting WhatsApp client...', 'warning');
            this.socket.emit('force_restart_whatsapp');
        }
    }

    disconnectWhatsApp() {
        if (confirm('Are you sure you want to disconnect WhatsApp? You will need to scan QR code again to reconnect.')) {
            this.isConnected = false;
            this.hideInputSection();
            this.hideResults();
            document.getElementById('qrSection').style.display = 'none';
            document.getElementById('connectedSection').style.display = 'none';
            document.getElementById('connectionStatus').style.display = 'block';
            
            // Show force restart button after disconnect
            const disconnectedActions = document.getElementById('disconnectedActions');
            if (disconnectedActions) {
                disconnectedActions.style.display = 'block';
            }
            
            this.showConnectionStatus('Disconnecting WhatsApp...', 'info');
            this.socket.emit('disconnect_whatsapp');
            
            // Auto refresh page after disconnect
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        }
    }

    showLoadingOverlay() {
        this.startTime = Date.now();
        this.cacheHitCount = 0;
        document.getElementById('loadingOverlay').style.display = 'flex';
        document.getElementById('progressFill').style.width = '0%';
        document.getElementById('progressText').textContent = '0%';
        document.getElementById('loadingText').textContent = 'Please wait while we check your numbers';
    }

    hideLoadingOverlay() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }

    updateProgress(current, total, number) {
        const percentage = Math.round((current / total) * 100);
        document.getElementById('progressFill').style.width = percentage + '%';
        document.getElementById('progressText').textContent = percentage + '%';
        document.getElementById('loadingText').textContent = `Checking: ${number} (${current}/${total})`;
        
        // Enhanced performance tracking
        const elapsedTime = (Date.now() - this.startTime) / 1000;
        const speed = current > 0 ? Math.round((current / elapsedTime) * 60) : 0;
        
        // Update performance metrics if elements exist
        const speedElement = document.getElementById('processingSpeed');
        const timeElement = document.getElementById('processingTime');
        const cacheElement = document.getElementById('cacheHits');
        
        if (speedElement) speedElement.textContent = speed + '/min';
        if (timeElement) timeElement.textContent = Math.round(elapsedTime) + 's';
        if (cacheElement && this.cacheHitCount) cacheElement.textContent = this.cacheHitCount;
    }

    showResults(results) {
        this.currentResults = results;
        
        // Show results section
        document.getElementById('resultsSection').style.display = 'block';
        document.getElementById('resultsSection').classList.add('slide-up');
        
        // Process results with cache tracking
        let validCount = 0;
        let whatsappCount = 0;
        let cacheHitCount = 0;
        
        results.forEach(result => {
            if (result.status === 'valid') {
                validCount++;
                if (result.hasWhatsApp) {
                    whatsappCount++;
                }
            }
            // Track cache hits
            if (result.fromCache) {
                cacheHitCount++;
            }
        });
        
        // Final stats update
        const totalNumbersEl = document.getElementById('totalNumbers');
        const validNumbersEl = document.getElementById('validNumbers');
        const whatsappNumbersEl = document.getElementById('whatsappNumbers');
        const cacheHitsEl = document.getElementById('cacheHits');
        
        if (totalNumbersEl) totalNumbersEl.textContent = results.length;
        if (validNumbersEl) validNumbersEl.textContent = validCount;
        if (whatsappNumbersEl) whatsappNumbersEl.textContent = whatsappCount;
        if (cacheHitsEl) cacheHitsEl.textContent = cacheHitCount;
        
        if (this.startTime) {
            const finalTime = Math.round((Date.now() - this.startTime) / 1000);
            const finalSpeed = results.length > 0 ? Math.round((results.length / finalTime) * 60) : 0;
            const processingTimeEl = document.getElementById('processingTime');
            const processingSpeedEl = document.getElementById('processingSpeed');
            
            if (processingTimeEl) processingTimeEl.textContent = finalTime + 's';
            if (processingSpeedEl) processingSpeedEl.textContent = finalSpeed + '/min';
        }
        
        // Generate summary
        this.generateSimpleSummary(results);
        
        // Scroll to results
        document.getElementById('resultsSection').scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });
    }

    hideResults() {
        document.getElementById('resultsSection').style.display = 'none';
    }

    generateSimpleSummary(results) {
        const total = results.length;
        const whatsappActive = results.filter(r => r.hasWhatsApp === true).length;
        const whatsappInactive = total - whatsappActive;
        const processingTime = ((Date.now() - this.startTime) / 1000).toFixed(1);
        
        // Update individual stat elements
        const totalEl = document.getElementById('totalNumbers');
        const whatsappEl = document.getElementById('whatsappNumbers');
        const inactiveEl = document.getElementById('whatsappInactive');
        const timeEl = document.getElementById('processingTime');
        
        if (totalEl) totalEl.textContent = total;
        if (whatsappEl) whatsappEl.textContent = whatsappActive;
        if (inactiveEl) inactiveEl.textContent = whatsappInactive;
        if (timeEl) timeEl.textContent = processingTime + 's';
        
        console.log('Summary updated:', { total, whatsappActive, whatsappInactive, processingTime });
    }

    generateResultsList(results) {
        const resultsContainer = document.getElementById('resultsContainer');
        resultsContainer.innerHTML = '';
        
        results.forEach((result, index) => {
            const item = document.createElement('div');
            item.className = 'result-item';
            
            // Status badge
            let statusBadge = '';
            if (result.status === 'valid') {
                statusBadge = '<span class="status-badge status-valid">Valid</span>';
            } else if (result.status === 'invalid') {
                statusBadge = '<span class="status-badge status-invalid">Invalid</span>';
            } else {
                statusBadge = '<span class="status-badge status-error">Error</span>';
            }
            
            // WhatsApp badge
            let whatsappBadge = '';
            if (result.hasWhatsApp === true) {
                whatsappBadge = '<span class="whatsapp-badge whatsapp-yes"><i class="fab fa-whatsapp"></i> Yes</span>';
            } else if (result.hasWhatsApp === false) {
                whatsappBadge = '<span class="whatsapp-badge whatsapp-no"><i class="fas fa-times"></i> No</span>';
            } else {
                whatsappBadge = '<span class="whatsapp-badge whatsapp-unknown"><i class="fas fa-question"></i> Unknown</span>';
            }
            
            item.innerHTML = `
                <div class="result-number">
                    <code>${result.originalNumber}</code>
                    ${result.formattedNumber && result.formattedNumber !== result.originalNumber ? 
                        `<small>(${result.formattedNumber})</small>` : ''}
                </div>
                <div class="result-badges">
                    ${statusBadge}
                    ${whatsappBadge}
                </div>
            `;
            
            resultsContainer.appendChild(item);
        });
    }

    exportResults(type) {
        let dataToExport = this.currentResults;
        let filename = 'whatsapp-numbers-all';
        
        if (type === 'valid') {
            dataToExport = this.currentResults.filter(r => r.hasWhatsApp === true);
            filename = 'whatsapp-numbers-valid';
        }
        
        if (dataToExport.length === 0) {
            this.showError('No data to export');
            return;
        }
        
        // Create text content with only numbers (one per line)
        const numbersOnly = [];
        
        dataToExport.forEach(result => {
            // Use formatted number if available, otherwise use original
            const numberToExport = result.formattedNumber || result.originalNumber;
            if (numberToExport) {
                numbersOnly.push(numberToExport);
            }
        });

        if (numbersOnly.length === 0) {
            this.showError('No valid numbers to export');
            return;
        }

        // Download text file with numbers only
        const textContent = numbersOnly.join('\n');
        const blob = new Blob([textContent], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    showError(message) {
        // Create a simple toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #dc3545;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 400px;
            font-weight: 500;
        `;
        toast.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="margin-right: 10px;"></i>
            ${message}
        `;
        
        document.body.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 5000);
        
        // Click to remove
        toast.addEventListener('click', () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        });
    }

    // Authentication methods
    async initAuth() {
        try {
            const response = await fetch('/api/auth/me', {
                credentials: 'include'
            });
            const data = await response.json();
            
            if (data.success && data.user) {
                this.updateUserInfo(data.user);
            } else {
                // Redirect to login if not authenticated
                window.location.href = '/login.html';
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            window.location.href = '/login.html';
        }
    }

    updateUserInfo(user) {
        const userNameElement = document.getElementById('userName');
        if (userNameElement) {
            userNameElement.textContent = user.username || user.email || 'User';
        }
    }

    async logout() {
        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });
            
            if (response.ok) {
                window.location.href = '/login.html';
            } else {
                this.showError('Logout failed. Please try again.');
            }
        } catch (error) {
            console.error('Logout error:', error);
            this.showError('Logout failed. Please try again.');
        }
    }
}

// Cache management functions
function showCacheStats() {
    fetch('/api/cache/stats')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const statsDiv = document.getElementById('cacheStats');
                statsDiv.innerHTML = `
                    <div class="cache-info">
                        <p><strong>Cache Size:</strong> ${data.cache.size} / ${data.cache.maxSize} entries</p>
                        <p><strong>Cache Expiry:</strong> ${data.cache.expiryTime} minutes</p>
                        <p><strong>Memory Usage:</strong> ${Math.round((data.cache.size / data.cache.maxSize) * 100)}%</p>
                    </div>
                `;
                statsDiv.style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Error fetching cache stats:', error);
            showNotification('Failed to fetch cache statistics', 'error');
        });
}

function clearCache() {
    if (confirm('Are you sure you want to clear the cache? This will remove all previously checked number results.')) {
        fetch('/api/cache/clear', { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification('Cache cleared successfully', 'success');
                    // Hide cache stats if visible
                    document.getElementById('cacheStats').style.display = 'none';
                } else {
                    showNotification('Failed to clear cache', 'error');
                }
            })
            .catch(error => {
                console.error('Error clearing cache:', error);
                showNotification('Failed to clear cache', 'error');
            });
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new WhatsAppFilter();
    
    // Initialize authentication
    app.initAuth();
    
    // Add logout button event listener
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => app.logout());
    }
    
    // Add cache management event listeners
    const cacheStatsBtn = document.getElementById('cacheStatsBtn');
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    
    if (cacheStatsBtn) {
        cacheStatsBtn.addEventListener('click', showCacheStats);
    }
    
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', clearCache);
    }
    
    // Add export button event listeners
    const exportValidBtn = document.getElementById('exportValidBtn');
    const exportAllBtn = document.getElementById('exportAllBtn');
    
    if (exportValidBtn) {
        exportValidBtn.addEventListener('click', () => app.exportResults('valid'));
    }
    
    if (exportAllBtn) {
        exportAllBtn.addEventListener('click', () => app.exportResults('all'));
    }
});