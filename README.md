# WhatsApp Number Filter 📱

A powerful web application to check which mobile numbers have WhatsApp accounts. Built with Node.js, Express, and WhatsApp Web.js with complete user authentication system.

## Features ✨

- 🔐 **Complete Authentication System** - User registration, login, and session management
- 📱 **WhatsApp Integration** - Real-time WhatsApp Web connection
- 🔍 **Number Validation** - Check multiple phone numbers for WhatsApp accounts
- 📊 **Results Export** - Export results to CSV format
- 🎨 **Modern UI** - Beautiful, responsive design
- 🚀 **Real-time Updates** - Live connection status and progress tracking
- 🔒 **Secure** - Password hashing, session management, and rate limiting

## Quick Start 🚀

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Chrome/Chromium browser (for WhatsApp Web.js)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd whatsapp-filter
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   ```

4. **Open your browser**
   Navigate to `http://localhost:3000`

5. **Register/Login**
   Create a new account or login with existing credentials

6. **Connect WhatsApp**
   Scan the QR code with your WhatsApp mobile app

## GitHub Actions Deployment 🔄

This project includes a complete GitHub Actions workflow for automated testing and deployment.

### Setup Instructions

1. **Fork/Clone this repository to GitHub**

2. **Configure Secrets** (Go to Settings > Secrets and variables > Actions)
   
   For Docker deployment:
   ```
   DOCKER_USERNAME=your-dockerhub-username
   DOCKER_PASSWORD=your-dockerhub-password
   ```
   
   For VPS deployment:
   ```
   HOST=your-server-ip
   USERNAME=your-server-username
   SSH_KEY=your-private-ssh-key
   ```
   
   For Heroku deployment:
   ```
   HEROKU_API_KEY=your-heroku-api-key
   ```

3. **Customize Deployment**
   
   Edit `.github/workflows/deploy.yml` and uncomment the deployment method you want to use:
   
   - **Heroku**: Uncomment Heroku deployment section
   - **VPS**: Uncomment SSH deployment section
   - **Docker**: Already configured, just add Docker Hub credentials

4. **Push to main/master branch**
   ```bash
   git add .
   git commit -m "Initial deployment setup"
   git push origin main
   ```

### Workflow Features

- ✅ **Automated Testing** - Runs tests on Node.js 18.x and 20.x
- 🏗️ **Build Process** - Creates production-ready deployment package
- 🐳 **Docker Support** - Builds and pushes Docker images
- 🚀 **Multi-target Deployment** - Supports Heroku, VPS, and containerized deployments
- 🔄 **CI/CD Pipeline** - Automatic deployment on main branch updates

## Docker Deployment 🐳

### Build and Run Locally

```bash
# Build the image
docker build -t whatsapp-filter .

# Run the container
docker run -p 3000:3000 -v $(pwd)/data:/app/data whatsapp-filter
```

### Using Docker Compose

Create a `docker-compose.yml`:

```yaml
version: '3.8'
services:
  whatsapp-filter:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

Run with:
```bash
docker-compose up -d
```

## Environment Variables 🔧

| Variable | Description | Default |
|----------|-------------|----------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `SESSION_SECRET` | Session encryption key | Auto-generated |

## API Endpoints 📡

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user info

### WhatsApp
- `GET /api/whatsapp/status` - Get WhatsApp connection status
- `POST /api/whatsapp/restart` - Restart WhatsApp connection

### Number Checking
- `POST /api/check` - Check phone numbers
- `GET /api/cache/stats` - Get cache statistics
- `POST /api/cache/clear` - Clear cache

## Project Structure 📁

```
whatsapp-filter/
├── .github/workflows/     # GitHub Actions workflows
├── data/                  # User data and sessions
├── middleware/            # Authentication middleware
├── public/               # Frontend files
├── services/             # WhatsApp service
├── utils/                # Utility functions
├── server.js             # Main server file
├── Dockerfile            # Docker configuration
└── package.json          # Dependencies
```

## Security Features 🔒

- **Password Hashing** - bcrypt with salt rounds
- **Session Management** - Secure session tokens with expiration
- **Rate Limiting** - Prevents brute force attacks
- **CORS Protection** - Configurable cross-origin requests
- **Input Validation** - Sanitized user inputs
- **Secure Cookies** - HTTP-only session cookies

## Contributing 🤝

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License 📄

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support 💬

If you encounter any issues or have questions:

1. Check the [Issues](../../issues) page
2. Create a new issue with detailed information
3. Include logs and error messages

## Acknowledgments 🙏

- [WhatsApp Web.js](https://github.com/pedroslopez/whatsapp-web.js) - WhatsApp Web API
- [Express.js](https://expressjs.com/) - Web framework
- [Socket.io](https://socket.io/) - Real-time communication

---

**Made with ❤️ for the community**