const UserStorage = require('../utils/userStorage');

class AuthMiddleware {
    constructor() {
        this.userStorage = new UserStorage();
    }

    // Middleware to check if user is authenticated
    requireAuth = async (req, res, next) => {
        try {
            const token = this.extractToken(req);
            
            if (!token) {
                return res.status(401).json({
                    success: false,
                    message: 'Access token is required'
                });
            }

            // Validate session
            const session = await this.userStorage.validateSession(token);
            if (!session) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid or expired token'
                });
            }

            // Get user details
            const user = await this.userStorage.getUserById(session.userId);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Attach user and session to request
            req.user = user;
            req.session = session;
            
            next();
        } catch (error) {
            console.error('Auth middleware error:', error);
            return res.status(500).json({
                success: false,
                message: 'Authentication error'
            });
        }
    };

    // Optional auth middleware - doesn't block if no token
    optionalAuth = async (req, res, next) => {
        try {
            const token = this.extractToken(req);
            
            if (token) {
                const session = await this.userStorage.validateSession(token);
                if (session) {
                    const user = await this.userStorage.getUserById(session.userId);
                    if (user) {
                        req.user = user;
                        req.session = session;
                    }
                }
            }
            
            next();
        } catch (error) {
            console.error('Optional auth middleware error:', error);
            // Don't block the request, just continue without auth
            next();
        }
    };

    // Extract token from request headers or cookies
    extractToken(req) {
        // Check Authorization header
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        // Check cookies
        if (req.cookies && req.cookies.auth_token) {
            return req.cookies.auth_token;
        }

        // Check query parameter (for WebSocket or special cases)
        if (req.query && req.query.token) {
            return req.query.token;
        }

        return null;
    }

    // Middleware to check if user is already authenticated (for login/register pages)
    redirectIfAuthenticated = (redirectTo = '/dashboard') => {
        return async (req, res, next) => {
            try {
                const token = this.extractToken(req);
                
                if (token) {
                    const session = await this.userStorage.validateSession(token);
                    if (session) {
                        const user = await this.userStorage.getUserById(session.userId);
                        if (user) {
                            // User is already authenticated, redirect to dashboard
                            return res.redirect(redirectTo);
                        }
                    }
                }
                
                next();
            } catch (error) {
                console.error('Redirect auth middleware error:', error);
                // Continue to login/register page on error
                next();
            }
        };
    };

    // Rate limiting for auth endpoints
    createRateLimiter(windowMs = 15 * 60 * 1000, max = 5) {
        const attempts = new Map();
        
        return (req, res, next) => {
            const key = req.ip || req.connection.remoteAddress;
            const now = Date.now();
            
            // Clean old attempts
            const userAttempts = attempts.get(key) || [];
            const validAttempts = userAttempts.filter(time => now - time < windowMs);
            
            if (validAttempts.length >= max) {
                return res.status(429).json({
                    success: false,
                    message: 'Too many attempts. Please try again later.',
                    retryAfter: Math.ceil((validAttempts[0] + windowMs - now) / 1000)
                });
            }
            
            // Add current attempt
            validAttempts.push(now);
            attempts.set(key, validAttempts);
            
            next();
        };
    }

    // CORS middleware for auth endpoints
    corsMiddleware = (req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
        res.header('Access-Control-Allow-Credentials', 'true');
        
        if (req.method === 'OPTIONS') {
            res.sendStatus(200);
        } else {
            next();
        }
    };

    // Cleanup expired sessions periodically
    startSessionCleanup(intervalMs = 24 * 60 * 60 * 1000) { // Default: 24 hours
        setInterval(async () => {
            try {
                await this.userStorage.cleanupExpiredSessions();
                console.log('Expired sessions cleaned up');
            } catch (error) {
                console.error('Session cleanup error:', error);
            }
        }, intervalMs);
    }
}

module.exports = AuthMiddleware;