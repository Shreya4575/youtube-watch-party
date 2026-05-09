// ─── Room ─────────────────────────────────────────────────────────────────────
// Manages a single watch party room: participants, video state, activity feed.
// NOTE: Methods only manage state — server.js is responsible for adding
// activity messages so it controls the exact wording.

class Room {
  constructor(roomId) {
    this.id = roomId;
    this.createdAt = new Date();
    this.participants = new Map(); // socketId → participant object
    this.videoState = {
      videoId: 'dQw4w9WgXcQ', // Default: Never Gonna Give You Up
      isPlaying: false,
      currentTime: 0,
      lastUpdated: Date.now(),
    };
    this.activityFeed = [];
    this.settings = {
      maxParticipants: 50,
      allowModeratorControls: true,
    };
  }

  // ── Participant management ──────────────────────────────────────────────

  addParticipant(userId, userName, role = 'participant') {
    this.participants.set(userId, {
      id: userId,
      name: userName,
      role,
      joinedAt: new Date(),
      lastSeen: Date.now(),
    });
  }

  // Returns { user, newHost } — newHost is set if the host left and was replaced
  removeParticipant(userId) {
    const user = this.participants.get(userId);
    if (!user) return { user: null, newHost: null };

    this.participants.delete(userId);

    let newHost = null;
    if (user.role === 'host' && this.participants.size > 0) {
      // Promote the first remaining person to host
      newHost = Array.from(this.participants.values())[0];
      newHost.role = 'host';
    }

    return { user, newHost };
  }

  // ── Role management ─────────────────────────────────────────────────────

  assignRole(userId, newRole) {
    const participant = this.participants.get(userId);
    if (!participant) return false;
    participant.role = newRole;
    return true;
  }

  // ── Permission checks ───────────────────────────────────────────────────

  canControl(userId) {
    const p = this.participants.get(userId);
    if (!p) return false;
    return (
      p.role === 'host' ||
      (p.role === 'moderator' && this.settings.allowModeratorControls)
    );
  }

  isHost(userId) {
    const p = this.participants.get(userId);
    return p?.role === 'host';
  }

  // ── Activity feed ───────────────────────────────────────────────────────

  addActivity(message, type = 'info') {
    const activity = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      message,
      type,
      timestamp: new Date().toLocaleTimeString(),
    };
    this.activityFeed.unshift(activity); // newest first
    if (this.activityFeed.length > 100) this.activityFeed.pop();
    return activity;
  }

  // ── Serialization ───────────────────────────────────────────────────────

  getParticipantsList() {
    return Array.from(this.participants.values()).map((p) => ({ ...p }));
  }

  getHost() {
    return Array.from(this.participants.values()).find((p) => p.role === 'host');
  }
}

// ─── RoomManager ──────────────────────────────────────────────────────────────
// Central registry: creates/deletes rooms and tracks which room each user is in.

class RoomManager {
  constructor() {
    this.rooms = new Map();       // roomId → Room
    this.userRoomMap = new Map(); // socketId → roomId
  }

  // Creates a new room with the given host. Returns the Room.
  createRoom(roomId, hostId, hostName) {
    if (this.rooms.has(roomId)) return this.rooms.get(roomId); // idempotent
    const room = new Room(roomId);
    room.addParticipant(hostId, hostName, 'host');
    this.rooms.set(roomId, room);
    this.userRoomMap.set(hostId, roomId);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  // Adds a new participant to an existing room. Returns the Room or null.
  joinRoom(roomId, userId, userName) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    // If already in the room (reconnect), skip re-adding
    if (!room.participants.has(userId)) {
      room.addParticipant(userId, userName, 'participant');
    }
    this.userRoomMap.set(userId, roomId);
    return room;
  }

  // Removes a user from their room.
  // Returns { roomId, room, user, newHost } — room is null if it was deleted.
  leaveRoom(userId) {
    const roomId = this.userRoomMap.get(userId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    const { user, newHost } = room.removeParticipant(userId);
    this.userRoomMap.delete(userId);

    // Delete empty rooms
    if (room.participants.size === 0) {
      this.rooms.delete(roomId);
      return { roomId, room: null, user, newHost: null };
    }

    return { roomId, room, user, newHost };
  }

  getUserRoom(userId) {
    const roomId = this.userRoomMap.get(userId);
    return roomId ? this.rooms.get(roomId) : null;
  }

  getStats() {
    return {
      totalRooms: this.rooms.size,
      totalUsers: this.userRoomMap.size,
    };
  }
}

module.exports = { RoomManager, Room };
