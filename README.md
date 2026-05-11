# 🎬 SyncParty — YouTube Watch Party

Watch YouTube videos in real-time sync with friends. Built with React + Socket.IO.

---

## Setup (Local Development)

### 1. Backend

```bash
cd backend
npm install          # installs dotenv, express, socket.io, cors
npm run dev          # starts nodemon on port 3000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev          # starts Vite on http://localhost:5173
```

Open **http://localhost:5173** in two browser tabs to test sync.

---

## Environment Variables

### backend/.env
```
PORT=3000
FRONTEND_URL=http://localhost:5173
```

### frontend/.env
```
VITE_BACKEND_URL=http://localhost:3000
```

For **production**, update `FRONTEND_URL` in the backend to your deployed frontend URL,
and update `VITE_BACKEND_URL` in the frontend to your deployed backend URL before building.

---

## Deployment

### Backend → Render (recommended)
1. Push repo to GitHub
2. Create a new **Web Service** on [render.com](https://render.com)
3. Root directory: `backend`
4. Build command: `npm install`
5. Start command: `node server.js`
6. Add environment variable: `FRONTEND_URL=https://your-frontend.vercel.app`

### Frontend → Vercel
1. Create a new project on [vercel.com](https://vercel.com)
2. Root directory: `frontend`
3. Add environment variable: `VITE_BACKEND_URL=https://your-backend.onrender.com`
4. Deploy

---

## 🌐 Live Demo

- **Frontend:** https://youtube-watch-party-gcut.vercel.app
- **Backend API:** https://youtube-watch-party-backend-tfdz.onrender.com

---

## Architecture

```
Browser A                    Node.js Server               Browser B
─────────                    ──────────────               ─────────
YT IFrame API
  ↓ onStateChange
  ↓ (play detected)
socket.emit('play', {time}) ──→ RoomManager               
                                  validates role
                                  updates room state
                               ←─ socket.to(room).emit('play') 
                                                         socket.on('play')
                                                         player.seekTo(time)
                                                         player.playVideo()


### How WebSockets Enable Real-time Sync
1. User action (play/pause/seek/change_video) → Client emits Socket.IO event
2. Server validates role permissions (host/moderator only)
3. Server updates room state and broadcasts to all participants
4. Clients receive event and update YouTube player accordingly

### Role-Based Access Control
- **Host:** Full control (play/pause/seek/change video/assign roles/remove participants)
- **Moderator:** Playback control only
- **Participant:** Watch only (cannot control playback)

### Tech Stack
| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React + Vite + Tailwind CSS | UI, room creation/join, video player |
| Backend | Node.js + Express | API, room logic, WebSocket server |
| Real-time | Socket.IO | WebSocket-based bidirectional communication |
| Video | YouTube IFrame API | Embedded, controllable YouTube player |
| Deployment | Vercel + Render | Frontend (Vercel) + Backend (Render) |

### WebSocket Events Implemented
| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| join_room | Client → Server | { roomId, username } | User joins; server assigns role |
| play/pause | Client → Server | { roomId, time } | Requires Host/Moderator; server broadcasts |
| seek | Client → Server | { roomId, time } | Requires Host/Moderator; server broadcasts |
| change_video | Client → Server | { roomId, videoId } | Change video; requires Host/Moderator |
| assign_role | Client → Server | { userId, role } | Host assigns role to participant |
| remove_participant | Client → Server | { userId } | Host removes user from room |
| chat_message | Client → Server | { message, username } | Live chat (bonus feature) |
```

### Role-Based Access Control
- **Host:** Full control (play/pause/seek/change video/assign roles/remove participants)
- **Moderator:** Playback control only (if implemented)
- **Participant:** Watch only

### Features Implemented
- ✅ Create/join rooms with unique codes
- ✅ Real-time video synchronization
- ✅ Change YouTube videos via URL
- ✅ Role-based access control
- ✅ Activity feed
- ✅ Participants list
- ✅ Copy invite link
- ✅ Connection status indicator
- ✅ Chat system (bonus)
  
Socket.IO handles all real-time events. The YouTube IFrame API gives us
`playVideo()`, `pauseVideo()`, `seekTo()`, and `onStateChange` callbacks.
The server validates permissions before broadcasting any playback event.

##  Challenges Faced & Solutions

### 1. Render Free Tier Sleep Issue
- **Problem:** Backend sleeps after 15 minutes of inactivity, causing 30-50s delays
- **Solution:** Used UptimeRobot to ping backend every 5 minutes, keeping it awake

### 2. Chat Messages Not Receiving
- **Problem:** Frontend sending messages but not receiving back
- **Solution:** Fixed backend to broadcast `io.to(roomId).emit()` to ALL clients including sender

### 3. Socket Disconnection Issues
- **Problem:** React Strict Mode causing double socket connections
- **Solution:** Removed StrictMode and stabilized socket connection with proper cleanup

### 4. YouTube URL Parsing
- **Problem:** Supporting multiple URL formats (watch, shorts, youtu.be)
- **Solution:** Implemented regex patterns to extract video ID from any YouTube URL




---
