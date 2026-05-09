class Room {
  constructor(roomId, hostId, hostName) {
    this.id = roomId;
    this.participants = new Map(); // userId -> { id, name, role }
    this.videoState = {
      videoId: 'dQw4w9WgXcQ', // Never gonna give you up (default video)
      isPlaying: false,
      currentTime: 0
    };
    this.hostId = hostId;
    
    // Add host as first participant
    this.addParticipant(hostId, hostName, 'host');
  }
  
  addParticipant(userId, userName, role = 'participant') {
    this.participants.set(userId, {
      id: userId,
      name: userName,
      role: role,
      joinedAt: new Date()
    });
  }
  
  removeParticipant(userId) {
    this.participants.delete(userId);
    
    // If host leaves and room isn't empty, assign new host
    if (userId === this.hostId && this.participants.size > 0) {
      const newHost = Array.from(this.participants.values())[0];
      this.assignRole(newHost.id, 'host');
      this.hostId = newHost.id;
      return newHost;
    }
    
    return null;
  }
  
  assignRole(userId, newRole) {
    const participant = this.participants.get(userId);
    if (participant) {
      participant.role = newRole;
      if (newRole === 'host') this.hostId = userId;
      return true;
    }
    return false;
  }
  
  canControl(userId) {
    const participant = this.participants.get(userId);
    return participant && (participant.role === 'host' || participant.role === 'moderator');
  }
  
  getParticipantsList() {
    return Array.from(this.participants.entries()).map(([id, data]) => ({
      userId: id,
      ...data,
      isCurrentUser: false // Will be set on frontend
    }));
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> Room instance
  }
  
  createRoom(roomId, hostId, hostName) {
    if (this.rooms.has(roomId)) return null;
    const room = new Room(roomId, hostId, hostName);
    this.rooms.set(roomId, room);
    return room;
  }
  
  getRoom(roomId) {
    return this.rooms.get(roomId);
  }
  
  joinRoom(roomId, userId, userName) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    
    const role = room.participants.size === 0 ? 'host' : 'participant';
    room.addParticipant(userId, userName, role);
    return { room, role };
  }
  
  leaveRoom(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    
    const newHost = room.removeParticipant(userId);
    
    // Delete room if empty
    if (room.participants.size === 0) {
      this.rooms.delete(roomId);
    }
    
    return { room, newHost };
  }
}

module.exports = { RoomManager, Room };