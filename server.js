// WhatsApp Number Filter Server
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const path = require('path');
const cookieParser = require('cookie-parser');
const { initializeDatabase } = require('./config/database');

// Import our services
const WhatsAppService = require('./services/whatsappService');
const NumberValidator = require('./utils/numberValidator');
const AuthMiddleware = require('./middleware/auth');
const UserStorage = require('./utils/userStorage');

// Initialize services
const authMiddleware = new AuthMiddleware();
const userStorage = new UserStorage();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false // Disable for development
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const rateLimiter = new RateLimiterMemory({
    keyGenerator: (req) => req.ip,
    points: 100, // Number of requests
    duration: 60, // Per 60 seconds
});

// Initialize services
const whatsappService = new WhatsAppService(io);
const numberValidator = new NumberValidator();

// API Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', async (req, res) => {
    res.json({
        status: 'ok',
        whatsapp: {
            message: 'WhatsApp sessions are now user-specific. Connect via Socket.IO to create a session.'
        },
        timestamp: new Date().toISOString(),
        supportedNetworks: numberValidator.getSupportedNetworks().length
    });
});

// Check single number endpoint (disabled - use Socket.IO for user-specific sessions)
app.post('/api/check-number', async (req, res) => {
    res.status(501).json({ 
        error: 'API endpoint disabled. Please use Socket.IO connection for WhatsApp number checking with user-specific sessions.' 
    });
});

/* Original implementation - disabled for user-specific sessions
app.post('/api/check-number', async (req, res) => {
    try {
        await rateLimiter.consume(req.ip);
        
        const status = whatsappService.getStatus();
        if (!status.isReady) {
            return res.status(503).json({ error: 'WhatsApp service not ready' });
        }

        const { number } = req.body;
        if (!number) {
            return res.status(400).json({ error: 'Number is required' });
        }

        const result = await whatsappService.checkNumber(number);
        res.json(result);
        
    } catch (rateLimiterRes) {
        if (rateLimiterRes.remainingHits !== undefined) {
            res.status(429).json({ error: 'Too many requests. Please try again later.' });
        } else {
            console.error('Error checking number:', rateLimiterRes);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});
*/

// Check multiple numbers endpoint (disabled - use Socket.IO for user-specific sessions)
app.post('/api/check-numbers', async (req, res) => {
    res.status(501).json({ 
        error: 'API endpoint disabled. Please use Socket.IO connection for WhatsApp number checking with user-specific sessions.' 
    });
});

/* Original implementation - disabled for user-specific sessions
app.post('/api/check-numbers', async (req, res) => {
    try {
        await rateLimiter.consume(req.ip);
        
        const status = whatsappService.getStatus();
        if (!status.isReady) {
            return res.status(503).json({ error: 'WhatsApp service not ready' });
        }

        const { numbers } = req.body;
        
        if (!numbers || !Array.isArray(numbers)) {
            return res.status(400).json({
                error: 'Numbers array is required'
            });
        }
        
        if (numbers.length === 0) {
            return res.json({ results: [] });
        }
        
        if (numbers.length > 5000) {
            return res.status(400).json({
                error: 'Maximum 5000 numbers allowed per request'
            });
        }
        
        const results = await whatsappService.checkNumbers(numbers);
        res.json({ results });
        
    } catch (rateLimiterRes) {
        if (rateLimiterRes.remainingHits !== undefined) {
            res.status(429).json({ error: 'Too many requests. Please try again later.' });
        } else {
            console.error('Error checking numbers:', rateLimiterRes);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});
*/

// Validate number endpoint
app.post('/api/validate-number', async (req, res) => {
    try {
        await rateLimiter.consume(req.ip);
        
        const { number } = req.body;
        if (!number) {
            return res.status(400).json({ error: 'Number is required' });
        }

        const validation = numberValidator.validateNumber(number);
        res.json(validation);
        
    } catch (rateLimiterRes) {
        if (rateLimiterRes.remainingHits !== undefined) {
            res.status(429).json({ error: 'Too many requests. Please try again later.' });
        } else {
            console.error('Error validating number:', rateLimiterRes);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

// Get supported networks
app.get('/api/networks', (req, res) => {
    try {
        const networks = numberValidator.getSupportedNetworks();
        res.json({
            success: true,
            networks: networks,
            count: networks.length
        });
    } catch (error) {
        console.error('Error getting networks:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get supported networks'
        });
    }
});

// API endpoint to get cache statistics
app.get('/api/cache/stats', (req, res) => {
    try {
        const stats = whatsappService.getCacheStats();
        res.json({
            success: true,
            cache: stats
        });
    } catch (error) {
        console.error('Error getting cache stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get cache statistics'
        });
    }
});

// API endpoint to clear cache
app.post('/api/cache/clear', (req, res) => {
    try {
        whatsappService.clearCache();
        res.json({
            success: true,
            message: 'Cache cleared successfully'
        });
    } catch (error) {
        console.error('Error clearing cache:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear cache'
        });
    }
});

// Authentication Routes
// Register endpoint
app.post('/api/auth/register', authMiddleware.createRateLimiter(15 * 60 * 1000, 50), async (req, res) => {
    try {
        const { fullName, email, password, confirmPassword } = req.body;
        
        // Validate input
        if (!fullName || !email || !password || !confirmPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }
        
        if (password !== confirmPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Passwords do not match' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password must be at least 6 characters long' 
            });
        }
        
        // Check if user already exists
        const existingUser = await userStorage.getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'User with this email already exists' 
            });
        }
        
        // Create user
        const user = await userStorage.createUser({
            fullName,
            email,
            password
        });
        
        // Create session
        const expiresIn = 7 * 24 * 60 * 60 * 1000; // 7 days
        const session = await userStorage.createSession(user.id, expiresIn);
        
        // Set cookie
        res.cookie('auth_token', session.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: expiresIn
        });
        
        res.json({
            success: true,
            message: 'Registration successful',
            user: {
                id: user.id,
                fullName: user.fullName,
                email: user.email
            }
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// Login endpoint
app.post('/api/auth/login', authMiddleware.createRateLimiter(15 * 60 * 1000, 50), async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;
        
        // Validate input
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password are required' 
            });
        }
        
        // Authenticate user
        const user = await userStorage.authenticateUser(email, password);
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }
        
        // Create session
        const expiresIn = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000; // 30 days or 7 days
        const session = await userStorage.createSession(user.id, expiresIn);
        
        // Set cookie
        res.cookie('auth_token', session.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: expiresIn
        });
        
        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                fullName: user.fullName,
                email: user.email
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// Logout endpoint
app.post('/api/auth/logout', async (req, res) => {
    try {
        const token = authMiddleware.extractToken(req);
        
        if (token) {
            await userStorage.invalidateSession(token);
        }
        
        res.clearCookie('auth_token');
        res.json({
            success: true,
            message: 'Logout successful'
        });
        
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Get current user endpoint
app.get('/api/auth/me', authMiddleware.optionalAuth, (req, res) => {
    if (req.user) {
        res.json({
            success: true,
            user: {
                id: req.user.id,
                fullName: req.user.fullName,
                email: req.user.email
            }
        });
    } else {
        res.status(401).json({
            success: false,
            error: 'Not authenticated'
        });
    }
});

// Protected route example - require authentication for main app
app.get('/', authMiddleware.redirectIfAuthenticated('/dashboard'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Dashboard route (protected)
app.get('/dashboard', authMiddleware.requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login page
app.get('/login', authMiddleware.redirectIfAuthenticated('/dashboard'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Register page
app.get('/register', authMiddleware.redirectIfAuthenticated('/dashboard'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Socket.io connection handling
io.on('connection', async (socket) => {
    console.log('Client connected:', socket.id);
    
    try {
        // Extract auth token from socket handshake
        const token = socket.handshake.auth.token || socket.handshake.headers.cookie?.match(/auth_token=([^;]+)/)?.[1];
        
        let authenticatedUserId = null;
        if (token) {
            try {
                const session = await userStorage.validateSession(token);
                if (session) {
                    const user = await userStorage.getUserById(session.userId);
                    if (user) {
                        authenticatedUserId = user.id;
                        console.log(`Authenticated user ${authenticatedUserId} connected with socket ${socket.id}`);
                    }
                }
            } catch (error) {
                console.log('Failed to authenticate socket connection:', error.message);
            }
        }
        
        let userId;
        if (authenticatedUserId) {
            // Use authenticated user ID for WhatsApp session
            userId = `user_${authenticatedUserId}`;
            socket.userId = userId;
            socket.authenticatedUserId = authenticatedUserId;
            
            // Check for existing session for this specific user
            const existingSession = await whatsappService.findExistingSession(userId);
            
            if (existingSession) {
                console.log(`Found existing session for authenticated user ${authenticatedUserId}`);
                
                // Check if session is already active and ready
                if (existingSession.isActive) {
                    console.log(`Session ${userId} is already ready`);
                    socket.emit('whatsapp_ready');
                    socket.emit('whatsapp_status', { status: 'ready', message: 'WhatsApp is ready!' });
                    return;
                } else if (existingSession.isInitializing) {
                    console.log(`Session ${userId} is still initializing`);
                    socket.emit('whatsapp_status', { status: 'initializing', message: 'Connecting to WhatsApp...' });
                    return;
                } else {
                    // Session exists but not active, reinitialize
                    console.log(`Reinitializing existing session ${userId}`);
                    await whatsappService.initializeUserSession(userId, socket.id);
                }
            } else {
                // Initialize new WhatsApp session for authenticated user
                console.log(`Creating new WhatsApp session for authenticated user ${authenticatedUserId}`);
                await whatsappService.initializeUserSession(userId, socket.id);
            }
        } else {
            // Generate a new unique user ID for anonymous connection
            userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            socket.userId = userId;
            console.log(`Created new anonymous session ${userId} for socket ${socket.id}`);
            
            // Initialize WhatsApp session for anonymous user
            await whatsappService.initializeUserSession(userId, socket.id);
        }
        
        // Send current WhatsApp status for this user
        const status = whatsappService.getStatus(userId);
        if (status.isReady) {
            socket.emit('whatsapp_ready');
        } else if (status.isInitializing) {
            socket.emit('whatsapp_status', { status: 'initializing' });
        } else {
            socket.emit('whatsapp_status', { status: 'disconnected' });
        }
    } catch (error) {
        console.error('Error handling socket connection:', error);
        socket.emit('whatsapp_status', { status: 'error', message: 'Failed to initialize session' });
    }

    // Handle number checking request
    socket.on('check_numbers', async (data) => {
        try {
            const status = whatsappService.getStatus(socket.userId);
            if (!status.isReady) {
                socket.emit('check_error', { error: 'WhatsApp is not ready. Please scan QR code first.' });
                return;
            }

            const { numbers } = data;
            if (!numbers || !Array.isArray(numbers)) {
                socket.emit('check_error', { error: 'Invalid numbers array' });
                return;
            }

            if (numbers.length > 5000) {
                socket.emit('check_error', { error: 'Maximum 5000 numbers allowed at once' });
                return;
            }

            console.log(`Starting to check ${numbers.length} numbers for user ${socket.userId}`);

            // Check numbers with progress updates
            const results = await whatsappService.checkNumbers(numbers, socket.userId, (current, total, number) => {
                socket.emit('check_progress', {
                    current,
                    total,
                    number
                });
            });

            socket.emit('check_complete', { results });
            console.log(`Completed checking ${numbers.length} numbers for user ${socket.userId}`);
            
        } catch (error) {
            console.error('Error in check_numbers:', error);
            socket.emit('check_error', { error: error.message });
        }
    });

    // Handle WhatsApp restart
    socket.on('restart_whatsapp', async () => {
        try {
            console.log('Restarting WhatsApp client for user:', socket.userId);
            await whatsappService.restart(socket.userId, socket.id);
        } catch (error) {
            console.error('Error restarting WhatsApp:', error);
            socket.emit('whatsapp_status', { status: 'error', message: error.message });
        }
    });

    // Handle force restart for stuck sessions
    socket.on('force_restart_whatsapp', async () => {
        try {
            console.log('Force restarting WhatsApp client for user:', socket.userId);
            await whatsappService.forceRestart(socket.userId, socket.id);
        } catch (error) {
            console.error('Error force restarting WhatsApp:', error);
            socket.emit('whatsapp_status', { status: 'error', message: error.message });
        }
    });

    // Handle WhatsApp disconnect
    socket.on('disconnect_whatsapp', async () => {
        try {
            console.log('Disconnecting WhatsApp client for user:', socket.userId);
            await whatsappService.shutdown(socket.userId);
            socket.emit('whatsapp_status', { status: 'disconnected', message: 'WhatsApp disconnected successfully' });
        } catch (error) {
            console.error('Error disconnecting WhatsApp:', error);
            socket.emit('whatsapp_status', { status: 'error', message: error.message });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`WhatsApp Number Filter server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
    console.log('Supported Pakistani networks:', numberValidator.getSupportedNetworks().length);
    
    // Initialize database
    try {
        await initializeDatabase();
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    }
    
    // Initialize authentication session cleanup
    authMiddleware.startSessionCleanup();
    
    // WhatsApp sessions will be initialized per user when they connect
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    
    try {
        await whatsappService.shutdown();
        console.log('WhatsApp service shutdown complete');
    } catch (error) {
        console.error('Error during WhatsApp shutdown:', error);
    }
    
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    
    try {
        await whatsappService.shutdown();
    } catch (error) {
        console.error('Error during WhatsApp shutdown:', error);
    }
    
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

module.exports = app;