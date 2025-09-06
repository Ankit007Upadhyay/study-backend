const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const chatRoutes = require('./routes/chat');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: true, // Allow all origins
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Study Notes Platform API is running!', status: 'healthy' });
});

// Socket.IO setup
const io = socketIo(server, {
  cors: {
    origin: true, // Allow all origins
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return next(new Error('User not found'));
    }

    socket.userId = user._id.toString();
    socket.userName = user.name;
    socket.userRole = user.role;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

// Store online users
const onlineUsers = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User ${socket.userName} connected`);
  
  // Add user to online users
  onlineUsers.set(socket.userId, {
    id: socket.userId,
    name: socket.userName,
    role: socket.userRole,
    socketId: socket.id
  });

  // Broadcast updated online users count
  io.emit('onlineUsersUpdate', {
    count: onlineUsers.size,
    users: Array.from(onlineUsers.values()).map(user => ({
      id: user.id,
      name: user.name,
      role: user.role
    }))
  });

  // Handle new message
  socket.on('sendMessage', (messageData) => {
    // Broadcast the message to all connected clients except sender
    socket.broadcast.emit('newMessage', messageData);
  });

  // Handle message edit
  socket.on('editMessage', (messageData) => {
    io.emit('messageEdited', messageData);
  });

  // Handle message delete
  socket.on('deleteMessage', (messageId) => {
    io.emit('messageDeleted', messageId);
  });

  // Handle reaction
  socket.on('addReaction', (messageData) => {
    io.emit('reactionAdded', messageData);
  });

  // Handle typing indicator
  socket.on('typing', (data) => {
    socket.broadcast.emit('userTyping', {
      userId: socket.userId,
      userName: socket.userName,
      isTyping: data.isTyping
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User ${socket.userName} disconnected`);
    onlineUsers.delete(socket.userId);
    
    // Broadcast updated online users count
    io.emit('onlineUsersUpdate', {
      count: onlineUsers.size,
      users: Array.from(onlineUsers.values()).map(user => ({
        id: user.id,
        name: user.name,
        role: user.role
      }))
    });
  });
});

// Make io accessible to routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/chat', chatRoutes);

// MongoDB Connection
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/study-notes-platform';

// Validate the connection string format
if (!mongoURI.startsWith('mongodb://') && !mongoURI.startsWith('mongodb+srv://')) {
  console.error('❌ Invalid MongoDB URI format');
  process.exit(1);
}

mongoose.connect(mongoURI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });

// Create uploads directory if it doesn't exist
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
