const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Enable CORS for all routes
app.use(cors());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true
  },
  transports: ['polling', 'websocket']
});

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:ZokvN2OwM5HD@ep-autumn-scene-a1izhr9p.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
});

// Create table if not exists
pool.query(`
  CREATE TABLE IF NOT EXISTS user_typing_data (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    wpm INTEGER,
    errors INTEGER,
    incorrect_words INTEGER,
    correct_words INTEGER,
    backspace_count INTEGER,
    accuracy FLOAT,
    typed_words INTEGER,
    test_duration INTEGER,
    test_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(err => console.error('Error creating table:', err));

// Middleware for logging requests
app.use((req, res, next) => {
  console.log(`Request received: ${req.method} ${req.url}`);
  next();
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/leaderboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'leaderboard.html'));
});

// Function to get leaderboard data
async function getLeaderboardData() {
  const result = await pool.query(`
    SELECT username, MAX(wpm) as max_wpm, AVG(accuracy) as avg_accuracy, 
           COUNT(*) as tests_taken
    FROM user_typing_data
    GROUP BY username
    ORDER BY max_wpm DESC
    LIMIT 100
  `);
  return result.rows;
}

// API endpoint for leaderboard data
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await getLeaderboardData();
    res.json(result);
  } catch (err) {
    console.error('Error fetching leaderboard data:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Track connected users
let connectedUsers = new Set();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected', socket.id);

  // Add user to connectedUsers when they join
  socket.on('userJoined', (username) => {
    socket.username = username; // Store username in socket object
    connectedUsers.add(username);
    io.emit('updateConnectedUsers', Array.from(connectedUsers));
  });

 socket.on('startTest', (data) => {
    console.log('Received startTest event with data:', data);
    if (data && data.paragraph && data.duration) {
        console.log('Emitting testStarted event with data:', data);
        io.emit('testStarted', {
            paragraph: data.paragraph,
            duration: parseInt(data.duration)
        });
    } else {
        console.error('Invalid data received from admin:', data);
        socket.emit('error', { message: 'Invalid test data' });
    }
 });

  socket.on('testCompleted', async (data) => {
    console.log('Test completed:', data);
    try {
      await pool.query(
        `INSERT INTO user_typing_data 
         (username, wpm, errors, incorrect_words, correct_words, backspace_count, accuracy, typed_words, test_duration) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [data.username, data.wpm, data.errors, data.incorrectWords, data.correctWords, 
         data.backspaceCount, data.accuracy, data.typedWords, data.testDuration]
      );
      console.log('User data saved to database');
      await updateLeaderboard(); // Update leaderboard after saving data
    } catch (err) {
      console.error('Error saving user data:', err);
    }
  });

  async function updateLeaderboard() {
    try {
      const leaderboardData = await getLeaderboardData();
      io.emit('leaderboardUpdate', leaderboardData);
    } catch (err) {
      console.error('Error fetching leaderboard data:', err);
    }
  }

  socket.on('requestLeaderboard', async () => {
    try {
      const leaderboardData = await getLeaderboardData();
      socket.emit('leaderboardUpdate', leaderboardData);
    } catch (err) {
      console.error('Error fetching leaderboard data:', err);
      socket.emit('error', { message: 'Error fetching leaderboard data' });
    }
  });

  socket.on('userLogout', async (data) => {
    console.log('User logout:', data);
    if (data && data.username) {
      try {
        await pool.query(
          'DELETE FROM user_typing_data WHERE username = $1',
          [data.username]
        );
        console.log('User data deleted from database');
        connectedUsers.delete(data.username);
        io.emit('updateConnectedUsers', Array.from(connectedUsers));
      } catch (err) {
        console.error('Error deleting user data:', err);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected', socket.id);
    if (socket.username) {
      connectedUsers.delete(socket.username);
      io.emit('updateConnectedUsers', Array.from(connectedUsers));
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Error handling for the server
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Export the server for Vercel
module.exports = server;

// If running directly (not through Vercel), start the server
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}