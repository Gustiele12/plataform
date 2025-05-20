// script.js
const socket = io('/');
const videoContainer = document.getElementById('video-container');
const localVideo = document.getElementById('local-video');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const videoToggle = document.getElementById('video-toggle');
const leaveBtn = document.getElementById('leave-btn');

// Generate a random room ID if none provided
roomInput.value = roomInput.value || Math.random().toString(36).substring(2, 7);

// Store connections and streams
let localStream;
let peers = {};
let currentRoom;

// Initialize user media
async function initializeMedia() {
  try {
    // Only request video, no audio since we don't need microphone
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });
    
    localVideo.srcObject = localStream;
  } catch (error) {
    console.error('Error accessing media devices:', error);
    alert('Could not access camera. Please check permissions.');
  }
}

// Function to create a new peer connection
function createPeerConnection(userId) {
  // Using Google's public STUN servers
  const peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });
  
  // Add local stream tracks to the connection
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });
  
  // Handle ICE candidates
  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      socket.emit('ice-candidate', event.candidate, userId);
    }
  };
  
  // Handle incoming streams
  peerConnection.ontrack = event => {
    const [remoteStream] = event.streams;
    createVideoElement(userId, remoteStream);
  };
  
  return peerConnection;
}

// Function to create a video element for a remote user
function createVideoElement(userId, stream) {
  // Check if video element already exists
  const existingVideo = document.getElementById(`video-${userId}`);
  if (existingVideo) {
    existingVideo.srcObject = stream;
    return;
  }
  
  // Create video container
  const videoItem = document.createElement('div');
  videoItem.className = 'video-item';
  videoItem.id = `user-${userId}`;
  
  // Create video element
  const videoElement = document.createElement('video');
  videoElement.id = `video-${userId}`;
  videoElement.autoplay = true;
  videoElement.srcObject = stream;
  
  // Create user label
  const userLabel = document.createElement('div');
  userLabel.className = 'user-label';
  userLabel.textContent = `User ${userId.substring(0, 5)}`;
  
  // Append elements
  videoItem.appendChild(videoElement);
  videoItem.appendChild(userLabel);
  videoContainer.appendChild(videoItem);
}

// Remove a user's video when they disconnect
function removeVideoElement(userId) {
  const videoItem = document.getElementById(`user-${userId}`);
  if (videoItem) {
    videoItem.remove();
  }
}

// Join a room
async function joinRoom(roomId) {
  await initializeMedia();
  currentRoom = roomId;
  socket.emit('join-room', roomId);
}

// Socket event listeners
socket.on('user-connected', async userId => {
  console.log('User connected:', userId);
  
  // Create a peer connection for the new user
  const peerConnection = createPeerConnection(userId);
  peers[userId] = peerConnection;
  
  // Create and send an offer
  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer, userId);
  } catch (error) {
    console.error('Error creating offer:', error);
  }
});

socket.on('user-disconnected', userId => {
  console.log('User disconnected:', userId);
  
  // Close the peer connection
  if (peers[userId]) {
    peers[userId].close();
    delete peers[userId];
  }
  
  // Remove the video element
  removeVideoElement(userId);
});

socket.on('offer', async (offer, userId) => {
  console.log('Received offer from:', userId);
  
  // Create a peer connection for the user
  const peerConnection = createPeerConnection(userId);
  peers[userId] = peerConnection;
  
  // Set the remote description
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Create and send an answer
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer, userId);
  } catch (error) {
    console.error('Error handling offer:', error);
  }
});

socket.on('answer', async (answer, userId) => {
  console.log('Received answer from:', userId);
  
  // Get the peer connection for the user
  const peerConnection = peers[userId];
  
  if (peerConnection) {
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }
});

socket.on('ice-candidate', async (candidate, userId) => {
  console.log('Received ICE candidate from:', userId);
  
  // Get the peer connection for the user
  const peerConnection = peers[userId];
  
  if (peerConnection) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }
});

// Button event listeners
joinBtn.addEventListener('click', () => {
  const roomId = roomInput.value.trim();
  if (roomId) {
    joinRoom(roomId);
  }
});

videoToggle.addEventListener('click', () => {
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    videoToggle.textContent = videoTrack.enabled ? 'Turn Off Video' : 'Turn On Video';
  }
});

leaveBtn.addEventListener('click', () => {
  // Close all peer connections
  Object.values(peers).forEach(connection => {
    connection.close();
  });
  peers = {};
  
  // Stop all local tracks
  localStream.getTracks().forEach(track => {
    track.stop();
  });
  
  // Clear the video container
  videoContainer.innerHTML = '';
  videoContainer.appendChild(document.querySelector('.video-item'));
  
  // Reset local video
  localVideo.srcObject = null;
  
  // Disconnect from the room
  if (currentRoom) {
    socket.emit('leave-room', currentRoom);
    currentRoom = null;
  }
});