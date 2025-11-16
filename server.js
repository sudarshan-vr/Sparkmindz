require('dotenv').config();
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Log environment for debugging
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', PORT);

// Middleware
app.use(express.json());

// CORS configuration
app.use((req, res, next) => {
    const origin = req.headers.origin;
    // In production, replace '*' with your actual frontend domain
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Session configuration
const sessionConfig = {
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    name: 'sparkmindz.sid', // Custom session cookie name
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 60 * 60 * 1000, // 1 hour
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/',
        domain: process.env.NODE_ENV === 'production' ? 'yourdomain.com' : undefined
    },
    rolling: true // Reset maxAge on every request
};

// Trust first proxy if behind a reverse proxy (like nginx, heroku, etc.)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
    sessionConfig.cookie.secure = true;
}

app.use(session(sessionConfig));

// Set up static file serving
const publicPath = path.join(__dirname, 'public');
console.log('Public directory path:', publicPath);

// Check if public directory exists
fs.access(publicPath, fs.constants.F_OK, (err) => {
  if (err) {
    console.error('Public directory does not exist!');
  } else {
    console.log('Public directory found, serving static files from:', publicPath);
  }
});

// Serve static files
app.use(express.static(publicPath, {
  extensions: ['html', 'htm'],
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  }
}));

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

// Serve admin.html
app.get('/admin', (req, res) => {
  res.sendFile(path.join(staticPath, 'admin.html'));
});

// Serve admin-panel.html with authentication check
app.get('/admin-panel', (req, res) => {
  // Check if user is authenticated
  if (!req.session || !req.session.authenticated) {
    return res.redirect('/admin');
  }
  
  // Serve the admin panel if authenticated
  res.sendFile(path.join(staticPath, 'admin-panel.html'));
});

// API route for login
app.post('/api/login', express.json(), (req, res) => {
  const { password } = req.body;
  
  if (password === process.env.ADMIN_PASSWORD) {
    req.session.authenticated = true;
    return res.json({ success: true });
  }
  
  res.status(401).json({ error: 'Invalid credentials' });
});

// API route to check auth status
app.get('/api/check-auth', (req, res) => {
  res.json({ 
    authenticated: !!req.session.authenticated
  });
});

// Logout route
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Failed to log out' });
    }
    res.json({ success: true });
  });
});

// Handle 404 - Must be after all other routes
app.use((req, res) => {
  console.log('404 - Route not found:', req.path);
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).send('Something broke!');
});

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session.authenticated) {
        return next();
    }
    // If it's an API request, return JSON error
    if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Authentication required' });
    }
    // Otherwise, redirect to login page
    res.redirect('/admin.html');
};

// Login endpoint
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    
    // In a real app, you would verify against a hashed password
    if (password === process.env.ADMIN_PASSWORD) {
        req.session.authenticated = true;
        req.session.cookie.expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        return res.json({ success: true });
    }
    
    res.status(401).json({ error: 'Invalid credentials' });
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
    // Clear the session
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).json({ error: 'Failed to log out' });
        }
        
        // Clear the session cookie
        res.clearCookie('connect.sid', {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });
        
        res.json({ success: true });
    });
});

// Check auth status
app.get('/api/check-auth', (req, res) => {
    res.json({ 
        authenticated: !!req.session.authenticated,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
