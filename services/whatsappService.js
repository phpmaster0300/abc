// WhatsApp Service - Handles WhatsApp integration with Baileys multi-user support
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs-extra');
const NumberValidator = require('../utils/numberValidator');
const P = require('pino');

// Create a logger for Baileys
const logger = P({ timestamp: () => `,"time":"${new Date().toJSON()}"` }, P.destination('./baileys.log'));
logger.level = 'silent'; // Set to 'silent' to reduce logs, or 'info' for more details

class WhatsAppService {
    constructor(io) {
        this.io = io;
        this.clients = new Map(); // Store multiple clients by userId
        this.userSessions = new Map(); // Track user session states
        this.numberValidator = new NumberValidator();
        this.baseSessionPath = path.join(__dirname, '..', '.wwebjs_auth');
        
        // Cache for previously checked numbers (expires after 1 hour)
        this.numberCache = new Map();
        this.cacheExpiry = 60 * 60 * 1000; // 1 hour in milliseconds
        
        // Rate limiter: 20 requests per minute per IP (increased for better performance)
        this.rateLimiter = new RateLimiterMemory({
            keyGenerator: (req) => req.ip,
            points: 20,
            duration: 60,
        });
        
        // Concurrent processing settings
        this.maxConcurrent = 5; // Process 5 numbers simultaneously
        this.processingQueue = [];
        this.activeProcessing = 0;
        
        // Rate limiting
        this.lastCheckTime = 0;
        this.checkInterval = 2000; // 2 seconds between checks
        this.maxConcurrentChecks = 3;
        this.currentChecks = 0;
    }

    /**
     * Initialize WhatsApp client for a specific user using Baileys
     */
    async initializeUserSession(userId, socketId) {
        if (this.userSessions.has(userId) && this.userSessions.get(userId).isInitializing) {
            console.log(`WhatsApp client for user ${userId} is already initializing...`);
            
            // Check if initialization has been stuck for too long (more than 60 seconds)
            const userSession = this.userSessions.get(userId);
            const initStartTime = userSession.initStartTime || Date.now();
            const timeDiff = Date.now() - initStartTime;
            
            if (timeDiff > 60000) { // 60 seconds timeout
                console.log(`Initialization timeout for user ${userId}, restarting...`);
                userSession.isInitializing = false;
                
                // Clean up existing client if any
                if (this.clients.has(userId)) {
                    try {
                        const existingClient = this.clients.get(userId);
                        existingClient.end();
                        this.clients.delete(userId);
                    } catch (error) {
                        console.log(`Error cleaning up stuck client for ${userId}:`, error.message);
                    }
                }
                
                // Send timeout message to user
                this.io.to(socketId).emit('whatsapp_status', { 
                    status: 'timeout', 
                    message: 'Initialization timeout, restarting...' 
                });
                
                // Continue with fresh initialization
            } else {
                return;
            }
        }

        // Check if user already has a ready session
        if (this.userSessions.has(userId) && this.userSessions.get(userId).isReady) {
            console.log(`WhatsApp client for user ${userId} is already ready`);
            this.io.to(socketId).emit('whatsapp_ready');
            this.io.to(socketId).emit('whatsapp_status', { status: 'ready', message: 'WhatsApp is ready!' });
            return;
        }

        // Initialize user session tracking
        this.userSessions.set(userId, {
            isReady: false,
            isInitializing: true,
            socketId: socketId,
            manuallyDisconnected: false,
            initStartTime: Date.now()
        });

        try {
            console.log(`Initializing Baileys WhatsApp client for user ${userId}...`);
            this.io.to(socketId).emit('whatsapp_status', { 
                status: 'initializing', 
                message: 'Starting your WhatsApp session with Baileys...' 
            });

            // Create user-specific session directory
            const userSessionPath = path.join(this.baseSessionPath, `user-${userId}`);
            await fs.ensureDir(userSessionPath);

            // Use Baileys multi-file auth state
            const { state, saveCreds } = await useMultiFileAuthState(userSessionPath);

            // Create Baileys socket
            const socket = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: logger,
                browser: ['Chrome (Linux)', '', ''],
                generateHighQualityLinkPreview: true
            });

            // Store socket
            this.clients.set(userId, socket);
            
            this.setupBaileysEventListeners(userId, socket, socketId, saveCreds);
            console.log(`Baileys WhatsApp client initialized for user ${userId}`);
 
         } catch (error) {
            console.error(`Failed to initialize Baileys WhatsApp client for user ${userId}:`, error);
            const userSession = this.userSessions.get(userId);
            if (userSession) {
                userSession.isInitializing = false;
            }
            this.io.to(socketId).emit('whatsapp_status', { 
                status: 'error', 
                message: 'Failed to initialize: ' + error.message 
            });
        }
    }

    /**
     * Setup event listeners for Baileys WhatsApp socket
     */
    setupBaileysEventListeners(userId, socket, socketId, saveCreds) {
        console.log(`Setting up Baileys event listeners for user ${userId}`);
        
        // Connection update event
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log(`🔥 QR Code received for user ${userId}`);
                try {
                    const qrDataURL = await qrcode.toDataURL(qr, {
                        width: 256,
                        margin: 2
                    });
                    
                    console.log(`📱 Sending QR code to user ${userId}`);
                    this.io.to(socketId).emit('whatsapp_status', { 
                        status: 'qr', 
                        message: 'Scan QR code with your WhatsApp' 
                    });
                    this.io.to(socketId).emit('qr_code', { qr: qrDataURL });
                    console.log(`✅ QR code sent successfully to user ${userId}`);
                } catch (error) {
                    console.error(`❌ Error generating QR code for user ${userId}:`, error);
                }
            }
            
            if (connection === 'close') {
                const userSession = this.userSessions.get(userId);
                const wasManuallyDisconnected = userSession?.manuallyDisconnected || false;
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut && !wasManuallyDisconnected;
                
                console.log(`Connection closed for user ${userId}, manually disconnected: ${wasManuallyDisconnected}, reconnecting: ${shouldReconnect}`);
                
                if (userSession) {
                    userSession.isReady = false;
                    userSession.isInitializing = false;
                }
                
                this.io.to(socketId).emit('whatsapp_disconnected', { 
                    reason: lastDisconnect?.error?.output?.statusCode || 'unknown',
                    manualDisconnect: wasManuallyDisconnected
                });
                
                if (shouldReconnect) {
                    // Reconnect after a delay
                    setTimeout(() => {
                        this.initializeUserSession(userId, socketId);
                    }, 3000);
                } else if (wasManuallyDisconnected) {
                    console.log(`User ${userId} manually disconnected, not reconnecting`);
                }
            } else if (connection === 'open') {
                console.log(`WhatsApp connected successfully for user ${userId}!`);
                const userSession = this.userSessions.get(userId);
                if (userSession) {
                    userSession.isReady = true;
                    userSession.isInitializing = false;
                }
                this.io.to(socketId).emit('whatsapp_ready');
                this.io.to(socketId).emit('whatsapp_status', { 
                    status: 'ready', 
                    message: 'WhatsApp is ready!' 
                });
            } else if (connection === 'connecting') {
                console.log(`Connecting WhatsApp for user ${userId}...`);
                this.io.to(socketId).emit('whatsapp_status', { 
                    status: 'connecting', 
                    message: 'Connecting to WhatsApp...' 
                });
            }
        });
        
        // Credentials update event
        socket.ev.on('creds.update', saveCreds);
        
        // Messages event (for future use)
        socket.ev.on('messages.upsert', (m) => {
            // Handle incoming messages if needed
        });
    }

    /**
     * Check if a number has WhatsApp with caching
     * @param {string} number - Phone number to check
     * @param {string} userId - User ID for the session
     * @returns {Promise<Object>} - Check result
     */
    async checkNumber(number, userId) {
        const socket = this.clients.get(userId);
        const userSession = this.userSessions.get(userId);
        
        if (!socket || !userSession || !userSession.isReady) {
            throw new Error('WhatsApp socket is not ready for this user');
        }

        // Validate and format the number
        const validation = this.numberValidator.validateNumber(number);
        
        if (!validation.isValid) {
            return {
                originalNumber: number,
                formattedNumber: null,
                status: 'invalid',
                hasWhatsApp: null,
                error: validation.error,
                network: null
            };
        }

        // Check cache first
        const cacheKey = validation.formattedNumber;
        const cachedResult = this.getCachedResult(cacheKey);
        if (cachedResult) {
            console.log(`Cache hit for number: ${number}`);
            return {
                ...cachedResult,
                originalNumber: number,
                fromCache: true
            };
        }

        try {
            // Rate limiting
            await this.waitForRateLimit();
            
            // Format number for WhatsApp (without +)
            const whatsappNumber = this.numberValidator.formatForWhatsApp(validation.formattedNumber);
            
            // Check if number is registered on WhatsApp using Baileys
            const whatsappId = whatsappNumber + '@s.whatsapp.net';
            const [result] = await socket.onWhatsApp(whatsappId);
            const isRegistered = result && result.exists;
            
            const checkResult = {
                originalNumber: number,
                formattedNumber: validation.formattedNumber,
                status: 'valid',
                hasWhatsApp: isRegistered,
                error: null,
                network: validation.network,
                fromCache: false
            };
            
            // Cache the result
            this.setCachedResult(cacheKey, checkResult);
            
            return checkResult;
            
        } catch (error) {
            console.error(`Error checking number ${number}:`, error);
            
            return {
                originalNumber: number,
                formattedNumber: validation.formattedNumber,
                status: 'error',
                hasWhatsApp: null,
                error: 'Check failed: ' + error.message,
                network: validation.network,
                fromCache: false
            };
        }
    }

    /**
     * Check multiple numbers with concurrent processing and progress updates
     * @param {Array<string>} numbers - Array of numbers to check
     * @param {string} userId - User ID for the session
     * @param {Function} progressCallback - Progress callback function
     * @returns {Promise<Array>} - Array of check results
     */
    async checkNumbers(numbers, userId, progressCallback) {
        const socket = this.clients.get(userId);
        const userSession = this.userSessions.get(userId);
        
        if (!socket || !userSession || !userSession.isReady) {
            throw new Error('WhatsApp socket is not ready for this user');
        }

        if (!Array.isArray(numbers) || numbers.length === 0) {
            throw new Error('Invalid numbers array');
        }

        if (numbers.length > 5000) {
            throw new Error('Maximum 5000 numbers allowed at once');
        }

        const results = new Array(numbers.length);
        const total = numbers.length;
        let completed = 0;

        console.log(`Starting to check ${total} numbers with concurrent processing...`);

        // Process numbers in batches with concurrency control
        const processBatch = async (batch, startIndex) => {
            const promises = batch.map(async (number, index) => {
                const actualIndex = startIndex + index;
                try {
                    const result = await this.checkNumber(number, userId);
                    results[actualIndex] = result;
                    
                    completed++;
                    console.log(`Checked ${completed}/${total}: ${number} - ${result.hasWhatsApp ? 'Has WhatsApp' : 'No WhatsApp'} ${result.fromCache ? '(cached)' : ''}`);
                    
                    // Progress update
                    if (progressCallback) {
                        progressCallback(completed, total, number);
                    }
                    
                    return result;
                } catch (error) {
                    console.error(`Error checking number ${number}:`, error);
                    const errorResult = {
                        originalNumber: number,
                        formattedNumber: null,
                        status: 'error',
                        hasWhatsApp: null,
                        error: error.message,
                        network: null,
                        fromCache: false
                    };
                    results[actualIndex] = errorResult;
                    completed++;
                    
                    if (progressCallback) {
                        progressCallback(completed, total, number);
                    }
                    
                    return errorResult;
                }
            });
            
            return Promise.all(promises);
        };

        // Process in batches of maxConcurrent
        for (let i = 0; i < numbers.length; i += this.maxConcurrent) {
            const batch = numbers.slice(i, i + this.maxConcurrent);
            await processBatch(batch, i);
            
            // Small delay between batches to avoid overwhelming
            if (i + this.maxConcurrent < numbers.length) {
                await this.sleep(1000);
            }
        }

        console.log(`Completed checking ${total} numbers`);
        return results;
    }

    /**
     * Wait for rate limiting
     */
    async waitForRateLimit() {
        const now = Date.now();
        const timeSinceLastCheck = now - this.lastCheckTime;
        
        if (timeSinceLastCheck < this.checkInterval) {
            const waitTime = this.checkInterval - timeSinceLastCheck;
            await this.sleep(waitTime);
        }
        
        this.lastCheckTime = Date.now();
    }

    /**
     * Sleep utility function
     * @param {number} ms - Milliseconds to sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get client status for a specific user
     * @param {string} userId - User ID for the session
     * @returns {Object} - Status information
     */
    getStatus(userId) {
        const socket = this.clients.get(userId);
        const userSession = this.userSessions.get(userId);
        
        return {
            isReady: userSession ? userSession.isReady : false,
            isInitializing: userSession ? userSession.isInitializing : false,
            hasSocket: !!socket
        };
    }

    /**
     * Check if there's an existing authenticated session for any user
     * @returns {Object|null} - Returns existing session info or null
     */
    async findExistingSession(specificUserId = null) {
        try {
            const sessionDirs = await fs.readdir(this.baseSessionPath);
            
            for (const dir of sessionDirs) {
                if (dir.startsWith('user-')) {
                    const sessionPath = path.join(this.baseSessionPath, dir);
                    const credsPath = path.join(sessionPath, 'creds.json');
                    
                    // Check if credentials file exists
                    if (await fs.pathExists(credsPath)) {
                        try {
                            const creds = await fs.readJson(credsPath);
                            // If credentials exist and have required fields, session is valid
                            if (creds && creds.noiseKey && creds.pairingEphemeralKeyPair) {
                                const userId = dir.replace('user-', ''); // Remove 'user-' prefix from directory name
                                const fullUserId = `user_${userId}`; // Reconstruct full userId format
                                
                                // If looking for specific user, check if this matches
                                if (specificUserId && fullUserId !== specificUserId) {
                                    continue; // Skip this session, not the one we're looking for
                                }
                                
                                console.log(`Found existing authenticated session: ${fullUserId}`);
                                
                                // Check if this session is currently active and ready
                                const status = this.getStatus(fullUserId);
                                return { 
                                    userId: fullUserId, 
                                    sessionPath, 
                                    isActive: status.isReady,
                                    isInitializing: status.isInitializing
                                };
                            }
                        } catch (error) {
                            console.log(`Invalid credentials in ${dir}:`, error.message);
                        }
                    }
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error checking existing sessions:', error);
            return null;
        }
    }

    /**
     * Restart the WhatsApp client for a specific user
     * @param {string} userId - User ID for the session
     * @param {string} socketId - Socket ID for the user
     */
    async restart(userId, socketId) {
        console.log(`Restarting WhatsApp socket for user ${userId}...`);
        
        try {
            // Close existing socket
            const socket = this.clients.get(userId);
            if (socket) {
                socket.end();
                this.clients.delete(userId);
            }
            
            // Reset user session and clear manual disconnect flag
            const userSession = this.userSessions.get(userId);
            if (userSession) {
                userSession.isReady = false;
                userSession.isInitializing = false;
                userSession.manuallyDisconnected = false; // Reset manual disconnect flag
            }
            
            // Clear session data for fresh start
            const sessionPath = path.join(this.baseSessionPath, `session-${userId}`);
            try {
                await fs.remove(sessionPath);
                console.log(`Cleared session data for user ${userId}`);
            } catch (error) {
                console.warn(`Could not clear session data for user ${userId}:`, error.message);
            }
            
            // Wait a moment before reinitializing
            await this.sleep(2000);
            
            // Reinitialize
            await this.initializeUserSession(userId, socketId);
            
        } catch (error) {
            console.error(`Error restarting WhatsApp client for user ${userId}:`, error);
            this.io.to(socketId).emit('whatsapp_status', { 
                status: 'error', 
                message: 'Restart failed: ' + error.message 
            });
        }
    }

    /**
     * Force restart the WhatsApp client for a specific user
     * @param {string} userId - User ID for the session
     * @param {string} socketId - Socket ID for the user
     */
    async forceRestart(userId, socketId) {
        console.log(`Force restarting WhatsApp client for user ${userId}`);
        
        try {
            // Force cleanup of any existing client
            if (this.clients.has(userId)) {
                const client = this.clients.get(userId);
                try {
                    client.end();
                } catch (error) {
                    console.log(`Error ending client during force restart: ${error.message}`);
                }
                this.clients.delete(userId);
            }

            // Clear user session data
            if (this.userSessions.has(userId)) {
                this.userSessions.delete(userId);
            }

            // Clear session directory if exists
            const sessionPath = path.join(this.baseSessionPath, `user-${userId.replace('user_', '')}`);
            if (await fs.pathExists(sessionPath)) {
                try {
                    await fs.remove(sessionPath);
                    console.log(`Cleared session directory for ${userId}`);
                } catch (error) {
                    console.log(`Error clearing session directory: ${error.message}`);
                }
            }

            // Send force restart status
            this.io.to(socketId).emit('whatsapp_status', { 
                status: 'force_restarting', 
                message: 'Force restarting session...' 
            });

            // Initialize fresh session
            await this.initializeUserSession(userId, socketId);
            
        } catch (error) {
            console.error(`Error in force restart for ${userId}:`, error);
            this.io.to(socketId).emit('whatsapp_status', { 
                status: 'error', 
                message: 'Force restart failed: ' + error.message 
            });
        }
    }

    /**
     * Gracefully shutdown specific user client or all clients
     */
    async shutdown(userId = null) {
        if (userId) {
            // Shutdown specific user
            console.log(`Shutting down WhatsApp client for user ${userId}...`);
            
            try {
                // Mark as manually disconnected to prevent auto-reconnection
                const userSession = this.userSessions.get(userId);
                if (userSession) {
                    userSession.manuallyDisconnected = true;
                    userSession.isReady = false;
                    userSession.isInitializing = false;
                }
                
                const socket = this.clients.get(userId);
                if (socket) {
                    socket.end();
                    this.clients.delete(userId);
                    console.log(`Shutdown socket for user ${userId}`);
                }
                
                // Clear session data
                const sessionPath = path.join(this.baseSessionPath, `session-${userId}`);
                try {
                    await fs.remove(sessionPath);
                    console.log(`Cleared session data for user ${userId}`);
                } catch (error) {
                    console.warn(`Could not clear session data for user ${userId}:`, error.message);
                }
                
                // Clear user session after a delay to allow disconnect event to process
                setTimeout(() => {
                    this.userSessions.delete(userId);
                    console.log(`User session cleared for ${userId}`);
                }, 1000);
                
                console.log(`WhatsApp client shutdown complete for user ${userId}`);
            } catch (error) {
                console.error(`Error shutting down client for user ${userId}:`, error);
            }
        } else {
            // Shutdown all clients
            console.log('Shutting down all WhatsApp clients...');
            
            try {
                // Shutdown all user sockets
                for (const [userId, socket] of this.clients) {
                    try {
                        socket.end();
                        console.log(`Shutdown socket for user ${userId}`);
                    } catch (error) {
                        console.error(`Error shutting down socket for user ${userId}:`, error);
                    }
                }
                
                // Clear all sessions
                this.clients.clear();
                this.userSessions.clear();
                
                console.log('All WhatsApp sockets shutdown complete');
            } catch (error) {
                console.error('Error during shutdown:', error);
            }
        }
    }

    /**
     * Get cached result for a number
     * @param {string} cacheKey - Cache key (formatted number)
     * @returns {Object|null} - Cached result or null
     */
    getCachedResult(cacheKey) {
        const cached = this.numberCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
            return cached.result;
        }
        
        // Remove expired cache entry
        if (cached) {
            this.numberCache.delete(cacheKey);
        }
        
        return null;
    }

    /**
     * Set cached result for a number
     * @param {string} cacheKey - Cache key (formatted number)
     * @param {Object} result - Result to cache
     */
    setCachedResult(cacheKey, result) {
        // Don't cache error results
        if (result.status === 'error') {
            return;
        }
        
        this.numberCache.set(cacheKey, {
            result: { ...result },
            timestamp: Date.now()
        });
        
        // Clean up old cache entries periodically
        if (this.numberCache.size > 1000) {
            this.cleanupCache();
        }
    }

    /**
     * Clean up expired cache entries
     */
    cleanupCache() {
        const now = Date.now();
        for (const [key, value] of this.numberCache.entries()) {
            if ((now - value.timestamp) >= this.cacheExpiry) {
                this.numberCache.delete(key);
            }
        }
        console.log(`Cache cleanup completed. Current cache size: ${this.numberCache.size}`);
    }

    /**
     * Clear all cached results
     */
    clearCache() {
        this.numberCache.clear();
        console.log('Number cache cleared');
    }

    /**
     * Get cache statistics
     * @returns {Object} - Cache stats
     */
    getCacheStats() {
        return {
            size: this.numberCache.size,
            maxSize: 1000,
            expiryTime: this.cacheExpiry / 1000 / 60 // in minutes
        };
    }

    /**
     * Get socket information for a user
     * @param {string} userId - User ID for the session
     * @returns {Promise<Object>} - Socket info
     */
    async getSocketInfo(userId) {
        const socket = this.clients.get(userId);
        const userSession = this.userSessions.get(userId);
        
        if (!socket || !userSession || !userSession.isReady) {
            return null;
        }

        try {
            const info = socket.user;
            return {
                id: info?.id,
                name: info?.name,
                status: userSession.isReady ? 'ready' : 'not_ready'
            };
        } catch (error) {
            console.error('Error getting socket info:', error);
            return null;
        }
    }
}

module.exports = WhatsAppService;