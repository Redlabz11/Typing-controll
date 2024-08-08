const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected', socket.id);

  socket.on('startTest', (data) => {
    console.log('Received startTest event with data:', data);
    if (data && data.paragraph && data.duration) {
      console.log('Emitting testStarted event with data:', data);
      io.emit('testStarted', {
        paragraph: data.paragraph,
        duration: data.duration
      });
    } else {
      console.error('Invalid data received from admin:', data);
      socket.emit('error', { message: 'Invalid test data' });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected', socket.id);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Error handling for the server
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
