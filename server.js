const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');

const app = express();

// Middleware
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'https://study-backend-mlvp.onrender.com', // Your Render backend URL
    'https://study-platform-by-ankit-for-beu.netlify.app', // Your Netlify frontend URL
    process.env.FRONTEND_URL
  ],
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Study Notes Backend API is running!', 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      files: '/api/files'
    }
  });
});

// API info route
app.get('/api', (req, res) => {
  res.json({
    message: 'Study Notes API',
    version: '1.0.0',
    endpoints: {
      'POST /api/auth/register': 'Register new user',
      'POST /api/auth/login': 'Login user',
      'GET /api/files': 'Get user files',
      'POST /api/files/upload': 'Upload file',
      'DELETE /api/files/:id': 'Delete file'
    }
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/study-notes-platform')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Create uploads directory if it doesn't exist
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 MongoDB URI: ${process.env.MONGODB_URI ? 'Set' : 'Not set'}`);
});
