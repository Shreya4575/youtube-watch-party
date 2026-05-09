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

// Health check endpoint (useful for Render/Railway deployment)
app.get('/', (req, res) => res.json({ status: 'ok', rooms: roomManager.rooms.size }));

const io = new Server(server, {
  cors: { 
    origin: process.env.FRONTEND_URL || "*", 
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
});

io.on('connection', (socket) => {
  console.log(`✅ Connected: ${socket.id}`);

  // ─── JOIN ROOM ────────────────────────────────────────────────────────────
  socket.on('join_room', ({ roomId, username }) => {
    console.log(`📥 ${username} joining: ${roomId}`);

    let room = roomManager.getRoom(roomId);

    if (!room) {
      // First person creates the room and becomes host
      room = roomManager.createRoom(roomId, socket.id, username);
      console.log(`✨ Room created: ${roomId}`);
    } else {
      // Subsequent people join as participant
      roomManager.joinRoom(roomId, socket.id, username);
    }

    const participant = room.participants.get(socket.id);
    const role = participant.role;

    socket.join(roomId);

    // Send current video state so new joiner is in sync
    socket.emit('sync_state', {
      videoId: room.videoState.videoId,
      isPlaying: room.videoState.isPlaying,
      currentTime: room.videoState.currentTime,
    });

    // Tell this socket what role they have
    socket.emit('role_assigned', {
      role,
      participants: room.getParticipantsList(),
    });

    // Send existing activity feed
    socket.emit('activity_feed', room.activityFeed.slice(0, 50));

    // Tell everyone else someone joined
    const activity = room.addActivity(`${username} joined the room`, 'join');
    socket.to(roomId).emit('user_joined', {
      userId: socket.id,
      username,
      role,
      participants: room.getParticipantsList(),
      activity,
    });

    console.log(`👥 Room ${roomId}: ${room.participants.size} participants`);
  });

  // ─── PLAY ─────────────────────────────────────────────────────────────────
  // Payload: { roomId, time }  — 'time' is current video position in seconds
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
    const activity = room.addActivity(`${user.name} played the video`, 'play');

    // Broadcast to everyone ELSE — they will seek to time then play
    socket.to(roomId).emit('play', { time: room.videoState.currentTime, activity });
  });

  // ─── PAUSE ────────────────────────────────────────────────────────────────
  // Payload: { roomId, time }
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
    const activity = room.addActivity(`${user.name} paused the video`, 'pause');

    socket.to(roomId).emit('pause', { time: room.videoState.currentTime, activity });
  });

  // ─── SEEK ─────────────────────────────────────────────────────────────────
  // Payload: { roomId, time }
  socket.on('seek', ({ roomId, time }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    if (!room.canControl(socket.id)) {
      socket.emit('error', { message: 'Only host/moderator can seek' });
      return;
    }

    room.videoState.currentTime = time;

    const user = room.participants.get(socket.id);
    const activity = room.addActivity(
      `${user.name} seeked to ${Math.floor(time)}s`,
      'seek'
    );

    socket.to(roomId).emit('seek', { time, activity });
  });

  // ─── CHANGE VIDEO ─────────────────────────────────────────────────────────
  // Payload: { roomId, videoId }
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
    const activity = room.addActivity(`${user.name} changed the video`, 'video');

    // Send to ALL in room (including sender) so everyone loads the new video
    io.to(roomId).emit('change_video', { videoId, activity });
  });

  // ─── ASSIGN ROLE ─────────────────────────────────────────────────────────
  // Payload: { roomId, userId, newRole }
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
      `${currentUser.name} made ${targetUser.name} a ${newRole}`,
      'role'
    );

    io.to(roomId).emit('role_assigned', {
      userId,
      role: newRole,
      participants: room.getParticipantsList(),
      activity,
    });
  });

  // ─── REMOVE PARTICIPANT ───────────────────────────────────────────────────
  // Payload: { roomId, userId }
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
    roomManager.userRoomMap.delete(userId);

    const currentUser = room.participants.get(socket.id);
    const activity = room.addActivity(
      `${currentUser.name} removed ${targetUser.name}`,
      'leave'
    );

    io.to(roomId).emit('participant_removed', {
      userId,
      participants: room.getParticipantsList(),
      activity,
    });

    // Tell the kicked user to leave
    io.to(userId).emit('kicked_from_room');
  });

  // ─── DISCONNECT ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`❌ Disconnected: ${socket.id}`);

    const result = roomManager.leaveRoom(socket.id);
    if (!result) return;

    const { roomId, room, user, newHost } = result;
    if (!user) return;

    if (!room) {
      // Room was deleted (was last person)
      console.log(`🗑️ Room ${roomId} deleted (empty)`);
      return;
    }

    const leaveActivity = room.addActivity(`${user.name} left the room`, 'leave');
    io.to(roomId).emit('user_left', {
      userId: socket.id,
      username: user.name,
      participants: room.getParticipantsList(),
      activity: leaveActivity,
    });

    // If the host left, announce the new host
    if (newHost) {
      const hostActivity = room.addActivity(
        `${newHost.name} is now the host`,
        'role'
      );
      io.to(roomId).emit('role_assigned', {
        userId: newHost.id,
        role: 'host',
        participants: room.getParticipantsList(),
        activity: hostActivity,
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Accepting connections from: ${FRONTEND_URL}\n`);
});
