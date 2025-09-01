const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { getConnection } = require('../config/database');

class UserStorage {
    constructor() {
        this.db = getConnection();
    }

    // Generate unique ID
    generateId() {
        return crypto.randomBytes(16).toString('hex');
    }

    // Generate secure token
    generateToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    // Hash password
    async hashPassword(password) {
        const saltRounds = 12;
        return await bcrypt.hash(password, saltRounds);
    }

    // Verify password
    async verifyPassword(password, hashedPassword) {
        return await bcrypt.compare(password, hashedPassword);
    }

    // Create new user
    async createUser(userData) {
        const { fullName, email, password } = userData;
        
        try {
            const userId = this.generateId();
            const hashedPassword = await this.hashPassword(password);
            
            const [result] = await this.db.execute(
                'INSERT INTO users (id, full_name, email, password) VALUES (?, ?, ?, ?)',
                [userId, fullName, email, hashedPassword]
            );
            
            if (result.affectedRows === 1) {
                return {
                    id: userId,
                    fullName,
                    email,
                    isActive: true,
                    createdAt: new Date().toISOString()
                };
            }
            
            throw new Error('Failed to create user');
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('User with this email already exists');
            }
            throw error;
        }
    }

    // Get user by ID
    async getUserById(userId) {
        try {
            const [rows] = await this.db.execute(
                'SELECT id, full_name, email, is_active, created_at, updated_at, last_login FROM users WHERE id = ? AND is_active = true',
                [userId]
            );
            
            if (rows.length === 0) {
                return null;
            }
            
            const user = rows[0];
            return {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                isActive: user.is_active,
                createdAt: user.created_at,
                updatedAt: user.updated_at,
                lastLogin: user.last_login
            };
        } catch (error) {
            console.error('Error getting user by ID:', error);
            return null;
        }
    }

    // Get user by email
    async getUserByEmail(email) {
        try {
            const [rows] = await this.db.execute(
                'SELECT id, full_name, email, password, is_active, created_at, updated_at, last_login FROM users WHERE email = ? AND is_active = true',
                [email]
            );
            
            if (rows.length === 0) {
                return null;
            }
            
            const user = rows[0];
            return {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                password: user.password,
                isActive: user.is_active,
                createdAt: user.created_at,
                updatedAt: user.updated_at,
                lastLogin: user.last_login
            };
        } catch (error) {
            console.error('Error getting user by email:', error);
            return null;
        }
    }

    // Authenticate user
    async authenticateUser(email, password) {
        try {
            const user = await this.getUserByEmail(email);
            
            if (!user) {
                throw new Error('Invalid email or password');
            }

            const isPasswordValid = await this.verifyPassword(password, user.password);
            if (!isPasswordValid) {
                throw new Error('Invalid email or password');
            }

            // Update last login
            await this.db.execute(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                [user.id]
            );

            // Return user without password
            const { password: _, ...userWithoutPassword } = user;
            return userWithoutPassword;
        } catch (error) {
            throw error;
        }
    }

    // Create session
    async createSession(userId, expiresInMs = 24 * 60 * 60 * 1000) {
        try {
            const sessionId = this.generateId();
            const token = this.generateToken();
            const expiresAt = new Date(Date.now() + expiresInMs);
            
            const [result] = await this.db.execute(
                'INSERT INTO sessions (id, token, user_id, expires_at) VALUES (?, ?, ?, ?)',
                [sessionId, token, userId, expiresAt]
            );
            
            if (result.affectedRows === 1) {
                return {
                    id: sessionId,
                    token,
                    userId,
                    createdAt: new Date().toISOString(),
                    expiresAt: expiresAt.toISOString(),
                    isActive: true
                };
            }
            
            throw new Error('Failed to create session');
        } catch (error) {
            console.error('Error creating session:', error);
            throw error;
        }
    }

    // Validate session
    async validateSession(token) {
        try {
            const [rows] = await this.db.execute(
                'SELECT id, token, user_id, is_active, created_at, expires_at FROM sessions WHERE token = ? AND is_active = true',
                [token]
            );
            
            if (rows.length === 0) {
                return null;
            }
            
            const session = rows[0];
            
            // Check if session is expired
            if (new Date() > new Date(session.expires_at)) {
                // Mark session as inactive
                await this.db.execute(
                    'UPDATE sessions SET is_active = false WHERE id = ?',
                    [session.id]
                );
                return null;
            }
            
            return {
                id: session.id,
                token: session.token,
                userId: session.user_id,
                isActive: session.is_active,
                createdAt: session.created_at,
                expiresAt: session.expires_at
            };
        } catch (error) {
            console.error('Error validating session:', error);
            return null;
        }
    }

    // Invalidate session
    async invalidateSession(token) {
        try {
            const [result] = await this.db.execute(
                'UPDATE sessions SET is_active = false WHERE token = ?',
                [token]
            );
            
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error invalidating session:', error);
            return false;
        }
    }

    // Invalidate all user sessions
    async invalidateAllUserSessions(userId) {
        try {
            const [result] = await this.db.execute(
                'UPDATE sessions SET is_active = false WHERE user_id = ?',
                [userId]
            );
            
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error invalidating user sessions:', error);
            return false;
        }
    }

    // Cleanup expired sessions
    async cleanupExpiredSessions() {
        try {
            const [result] = await this.db.execute(
                'UPDATE sessions SET is_active = false WHERE expires_at < CURRENT_TIMESTAMP AND is_active = true'
            );
            
            console.log(`Cleaned up ${result.affectedRows} expired sessions`);
            return result.affectedRows;
        } catch (error) {
            console.error('Error cleaning up expired sessions:', error);
            return 0;
        }
    }

    // Get all active sessions for a user
    async getUserSessions(userId) {
        try {
            const [rows] = await this.db.execute(
                'SELECT id, token, created_at, expires_at FROM sessions WHERE user_id = ? AND is_active = true ORDER BY created_at DESC',
                [userId]
            );
            
            return rows.map(session => ({
                id: session.id,
                token: session.token,
                createdAt: session.created_at,
                expiresAt: session.expires_at
            }));
        } catch (error) {
            console.error('Error getting user sessions:', error);
            return [];
        }
    }

    // Update user profile
    async updateUser(userId, updateData) {
        try {
            const { fullName, email } = updateData;
            const [result] = await this.db.execute(
                'UPDATE users SET full_name = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [fullName, email, userId]
            );
            
            return result.affectedRows > 0;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Email already exists');
            }
            throw error;
        }
    }

    // Change user password
    async changePassword(userId, newPassword) {
        try {
            const hashedPassword = await this.hashPassword(newPassword);
            const [result] = await this.db.execute(
                'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [hashedPassword, userId]
            );
            
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error changing password:', error);
            throw error;
        }
    }

    // Delete user (soft delete)
    async deleteUser(userId) {
        try {
            // Invalidate all sessions first
            await this.invalidateAllUserSessions(userId);
            
            // Soft delete user
            const [result] = await this.db.execute(
                'UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [userId]
            );
            
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error deleting user:', error);
            throw error;
        }
    }
}

module.exports = UserStorage;