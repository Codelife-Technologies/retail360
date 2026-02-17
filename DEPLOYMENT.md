# Deployment Configuration Guide

## Places to Change localhost References

### Frontend (Client) Configuration

#### 1. Environment Variables (`.env` file)
Create a `.env` file in the `client` directory:

```env
REACT_APP_API_URL=https://your-server-domain.com/api
```

**Files that use this:**
- `client/src/services/api.js` - Main API service
- `client/src/services/geminiImageService.js` - Gemini image service
- `client/src/components/Products.js` - Product image URLs
- `client/src/components/GeminiImageGenerator.js` - Generated image URLs

**Note:** All these files already use `process.env.REACT_APP_API_URL` with localhost as fallback, so you only need to set the environment variable.

#### 2. Package.json Proxy (Development Only)
**File:** `client/package.json`

```json
"proxy": "http://localhost:5000"
```

**Note:** This is only used in development. For production builds, it's ignored. You can leave it as is or remove it.

### Backend (Server) Configuration

#### 1. Environment Variables (`.env` file)
Create a `.env` file in the `server` directory:

```env
# MongoDB Connection (change if using remote MongoDB)
MONGODB_URI=mongodb://your-mongodb-host:27017/inventory
# Or for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/inventory

# Server Port
PORT=5000

# Gemini API Key
GEMINI_API_KEY=your_gemini_api_key_here
```

**Files that use this:**
- `server/server.js` - Uses `process.env.MONGODB_URI` and `process.env.PORT`

#### 2. CORS Configuration (if needed)
**File:** `server/server.js`

If your frontend and backend are on different domains, you may need to update CORS:

```javascript
app.use(cors({
  origin: 'https://your-frontend-domain.com', // or ['http://localhost:3000', 'https://your-domain.com']
  credentials: true
}));
```

## Deployment Checklist

### Frontend Deployment:

1. **Create `.env` file in `client` directory:**
   ```
   REACT_APP_API_URL=https://your-api-domain.com/api
   ```

2. **Build the React app:**
   ```bash
   cd client
   npm run build
   ```

3. **Deploy the `build` folder** to your hosting service (Netlify, Vercel, etc.)

### Backend Deployment:

1. **Create `.env` file in `server` directory:**
   ```
   MONGODB_URI=your_mongodb_connection_string
   PORT=5000
   GEMINI_API_KEY=your_gemini_api_key
   ```

2. **Install dependencies:**
   ```bash
   cd server
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```
   Or use PM2 for production:
   ```bash
   npm install -g pm2
   pm2 start server.js --name erp-server
   ```

## Important Notes:

1. **Environment Variables:**
   - Frontend: Must start with `REACT_APP_` to be accessible in React
   - Backend: Can be any name, loaded via `dotenv`

2. **API URLs:**
   - All frontend files already use `process.env.REACT_APP_API_URL`
   - Just set the environment variable - no code changes needed!

3. **Static Files:**
   - Make sure `/uploads` directory is accessible
   - Configure your server to serve static files from `server/uploads`

4. **MongoDB:**
   - Use MongoDB Atlas for cloud hosting
   - Or configure your own MongoDB server
   - Update `MONGODB_URI` accordingly

5. **HTTPS:**
   - Use HTTPS in production
   - Update `REACT_APP_API_URL` to use `https://` instead of `http://`

## Files Summary:

### Files Using localhost (Already Configured for Environment Variables):
- ✅ `client/src/services/api.js` - Uses `REACT_APP_API_URL`
- ✅ `client/src/services/geminiImageService.js` - Uses `REACT_APP_API_URL`
- ✅ `client/src/components/Products.js` - Uses `REACT_APP_API_URL`
- ✅ `client/src/components/GeminiImageGenerator.js` - Uses `REACT_APP_API_URL`
- ✅ `server/server.js` - Uses `MONGODB_URI` and `PORT` env vars

### Files with Hardcoded localhost (Only for Development/Logging):
- `server/server.js` line 136 - Console log (can be removed or updated)
- `client/package.json` line 34 - Proxy setting (development only, ignored in production)

## Quick Setup for Production:

### Frontend:
```bash
cd client
echo "REACT_APP_API_URL=https://your-api-domain.com/api" > .env
npm run build
# Deploy build/ folder
```

### Backend:
```bash
cd server
echo "MONGODB_URI=your_mongodb_uri" > .env
echo "PORT=5000" >> .env
echo "GEMINI_API_KEY=your_key" >> .env
npm install
npm start
```

