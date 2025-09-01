const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'whatsapp_filter',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    acquireTimeout: 60000,
    timeout: 60000
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ MySQL database connected successfully');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ MySQL connection failed:', error.message);
        return false;
    }
}

// Initialize database tables
async function initializeDatabase() {
    try {
        // Test connection first
        await testConnection();
        console.log('Database connection successful');
        
        // Get connection from pool
        const connection = await pool.getConnection();
        
        try {
            // Create users table
            await connection.execute(`
                CREATE TABLE IF NOT EXISTS users (
                    id VARCHAR(32) PRIMARY KEY,
                    full_name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    last_login TIMESTAMP NULL
                )
            `);
            
            // Create sessions table
            await connection.execute(`
                CREATE TABLE IF NOT EXISTS sessions (
                    id VARCHAR(32) PRIMARY KEY,
                    token VARCHAR(64) UNIQUE NOT NULL,
                    user_id VARCHAR(32) NOT NULL,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    INDEX idx_token (token),
                    INDEX idx_user_id (user_id),
                    INDEX idx_expires_at (expires_at)
                )
            `);
            
            console.log('✅ Database tables initialized successfully');
        } finally {
            connection.release();
        }
        return true;
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        if (error.code === 'ER_BAD_DB_ERROR') {
            console.log('Please create the database manually: CREATE DATABASE whatsapp_filter;');
            console.log('You can use phpMyAdmin at http://localhost/phpmyadmin or run: mysql -u root -p -e "CREATE DATABASE whatsapp_filter;"');
        }
        // Don't throw error, let the app continue without database
        console.log('⚠️ Application will continue without database functionality');
        return false;
    }
}

// Get database connection
function getConnection() {
    return pool;
}

// Close database connection
async function closeConnection() {
    try {
        await pool.end();
        console.log('✅ Database connection closed');
    } catch (error) {
        console.error('❌ Error closing database connection:', error.message);
    }
}

module.exports = {
    pool,
    getConnection,
    testConnection,
    initializeDatabase,
    closeConnection
};