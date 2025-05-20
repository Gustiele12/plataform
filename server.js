// server.js
const express = require('express');
const http = require('http');
const socket = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socket(server);

app.use(express.static('public'));

io.on('connection', socket => {
  console.log('User connected:', socket.id);
  
  // Handle joining a room
  socket.on('join-room', roomId => {
    socket.join(roomId);
    socket.to(roomId).emit('user-connected', socket.id);
    
    // Handle disconnection
    socket.on('disconnect', () => {
      socket.to(roomId).emit('user-disconnected', socket.id);
    });
    
    // Handle WebRTC signaling
    socket.on('offer', (offer, targetId) => {
      socket.to(targetId).emit('offer', offer, socket.id);
    });
    
    socket.on('answer', (answer, targetId) => {
      socket.to(targetId).emit('answer', answer, socket.id);
    });
    
    socket.on('ice-candidate', (candidate, targetId) => {
      socket.to(targetId).emit('ice-candidate', candidate, socket.id);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});