require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { RoomManager } = require('./services/RoomManager');

const app = express();
const server = http.createServer(app);
const roomManager = new RoomManager();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'ok', rooms: roomManager.rooms.size }));

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

io.on('connection', (socket) => {
  console.log('✅ Connected: ' + socket.id);

  // ─── CHAT MESSAGE EVENT - FIXED ─────────────────────────────────
  socket.on('chat_message', ({ roomId, message, username }) => {
    console.log('💬 [BACKEND] Chat message received:', { roomId, message, username });
    
    const room = roomManager.getRoom(roomId);
    if (!room) {
      console.log('❌ [BACKEND] Room not found:', roomId);
      return;
    }
    
    const chatMessage = {
      id: Date.now() + Math.random(),
      username: username,
      message: message.substring(0, 200),
      timestamp: new Date().toLocaleTimeString(),
      isHost: room.participants.get(socket.id)?.role === 'host'
    };
    
    // Store messages in room
    if (!room.chatMessages) room.chatMessages = [];
    room.chatMessages.push(chatMessage);
    if (room.chatMessages.length > 100) room.chatMessages.shift();
    
    // Broadcast to EVERYONE including sender
    console.log('💬 [BACKEND] Broadcasting to room:', roomId);
    io.to(roomId).emit('chat_message', chatMessage);
    console.log('💬 [BACKEND] Broadcast complete');
  });

  socket.on('typing_start', ({ roomId, username }) => {
    socket.to(roomId).emit('user_typing', { username: username, socketId: socket.id });
  });

  socket.on('typing_stop', ({ roomId }) => {
    socket.to(roomId).emit('user_stopped_typing', { socketId: socket.id });
  });

  socket.on('ping_online', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const participant = room.participants.get(socket.id);
    if (participant) {
      participant.lastSeen = Date.now();
      participant.isOnline = true;
    }
  });

  socket.on('join_room', ({ roomId, username }) => {
    console.log('📥 ' + username + ' joining: ' + roomId);

    let room = roomManager.getRoom(roomId);

    if (!room) {
      room = roomManager.createRoom(roomId, socket.id, username);
      console.log('✨ Room created: ' + roomId);
    } else {
      roomManager.joinRoom(roomId, socket.id, username);
    }

    const participant = room.participants.get(socket.id);
    const role = participant.role;

    participant.isOnline = true;
    participant.lastSeen = Date.now();

    socket.join(roomId);

    socket.emit('chat_history', room.chatMessages || []);

    socket.emit('sync_state', {
      videoId: room.videoState.videoId,
      isPlaying: room.videoState.isPlaying,
      currentTime: room.videoState.currentTime,
    });

    socket.emit('role_assigned', {
      role: role,
      participants: room.getParticipantsList(),
    });

    socket.emit('activity_feed', room.activityFeed.slice(0, 50));

    const activity = room.addActivity(username + ' joined the room', 'join');
    socket.to(roomId).emit('user_joined', {
      userId: socket.id,
      username: username,
      role: role,
      participants: room.getParticipantsList(),
      activity: activity,
    });

    io.to(roomId).emit('participants_updated', room.getParticipantsList());

    console.log('👥 Room ' + roomId + ': ' + room.participants.size + ' participants');
  });

  socket.on('play', ({ roomId, time }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    if (!room.canControl(socket.id)) {
      socket.emit('error', { message: 'Only host/moderator can control playback' });
      return;
    }
    room.videoState.isPlaying = true;
    if (time !== undefined) room.videoState.currentTime = time;
    const user = room.participants.get(socket.id);
    const activity = room.addActivity(user.name + ' played the video', 'play');
    socket.to(roomId).emit('play', { time: room.videoState.currentTime, activity: activity });
  });

  socket.on('pause', ({ roomId, time }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    if (!room.canControl(socket.id)) {
      socket.emit('error', { message: 'Only host/moderator can control playback' });
      return;
    }
    room.videoState.isPlaying = false;
    if (time !== undefined) room.videoState.currentTime = time;
    const user = room.participants.get(socket.id);
    const activity = room.addActivity(user.name + ' paused the video', 'pause');
    socket.to(roomId).emit('pause', { time: room.videoState.currentTime, activity: activity });
  });

  socket.on('seek', ({ roomId, time }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    if (!room.canControl(socket.id)) {
      socket.emit('error', { message: 'Only host/moderator can seek' });
      return;
    }
    room.videoState.currentTime = time;
    const user = room.participants.get(socket.id);
    const activity = room.addActivity(user.name + ' seeked to ' + Math.floor(time) + 's', 'seek');
    socket.to(roomId).emit('seek', { time: time, activity: activity });
  });

  socket.on('change_video', ({ roomId, videoId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    if (!room.canControl(socket.id)) {
      socket.emit('error', { message: 'Only host/moderator can change video' });
      return;
    }
    room.videoState.videoId = videoId;
    room.videoState.currentTime = 0;
    room.videoState.isPlaying = false;
    const user = room.participants.get(socket.id);
    const activity = room.addActivity(user.name + ' changed the video', 'video');
    io.to(roomId).emit('change_video', { videoId: videoId, activity: activity });
  });

  socket.on('assign_role', ({ roomId, userId, newRole }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    if (!room.isHost(socket.id)) {
      socket.emit('error', { message: 'Only host can assign roles' });
      return;
    }
    const targetUser = room.participants.get(userId);
    if (!targetUser) return;
    room.assignRole(userId, newRole);
    const currentUser = room.participants.get(socket.id);
    const activity = room.addActivity(
      currentUser.name + ' made ' + targetUser.name + ' a ' + newRole,
      'role'
    );
    io.to(roomId).emit('role_assigned', {
      userId: userId,
      role: newRole,
      participants: room.getParticipantsList(),
      activity: activity,
    });
  });

  socket.on('remove_participant', ({ roomId, userId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    if (!room.isHost(socket.id)) {
      socket.emit('error', { message: 'Only host can remove participants' });
      return;
    }
    const targetUser = room.participants.get(userId);
    if (!targetUser) return;
    room.participants.delete(userId);
    const currentUser = room.participants.get(socket.id);
    const activity = room.addActivity(
      currentUser.name + ' removed ' + targetUser.name,
      'leave'
    );
    io.to(roomId).emit('participant_removed', {
      userId: userId,
      participants: room.getParticipantsList(),
      activity: activity,
    });
    io.to(userId).emit('kicked_from_room');
  });

  socket.on('disconnect', () => {
    console.log('❌ Disconnected: ' + socket.id);

    const result = roomManager.leaveRoom(socket.id);
    if (!result) return;

    const room = result.room;
    const user = result.user;
    const newHost = result.newHost;

    if (!user) return;

    if (!room) {
      console.log('🗑️ Room deleted (empty)');
      return;
    }

    const roomId = room.id;
    const leaveActivity = room.addActivity(user.name + ' left the room', 'leave');

    io.to(roomId).emit('user_left', {
      userId: socket.id,
      username: user.name,
      participants: room.getParticipantsList(),
      activity: leaveActivity,
    });

    io.to(roomId).emit('participants_updated', room.getParticipantsList());

    if (newHost) {
      const hostActivity = room.addActivity(newHost.name + ' is now the host', 'role');
      io.to(roomId).emit('role_assigned', {
        userId: newHost.id,
        role: 'host',
        participants: room.getParticipantsList(),
        activity: hostActivity,
      });
    }
  });
});

server.listen(PORT, function () {
  console.log('🚀 Server running on http://localhost:' + PORT);
  console.log('📡 Accepting connections from: ' + FRONTEND_URL);
});