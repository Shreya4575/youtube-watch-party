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
```

Socket.IO handles all real-time events. The YouTube IFrame API gives us
`playVideo()`, `pauseVideo()`, `seekTo()`, and `onStateChange` callbacks.
The server validates permissions before broadcasting any playback event.

---

## Live URL

- **Frontend:** https://youtube-watch-party-gcut.vercel.app
- **Backend:** https://youtube-watch-party-backend-tfdz.onrender.com

## How to Test

1. Open the frontend URL
2. Enter your name
3. Click "Create New Room"
4. Share the room URL with friends
5. Paste any YouTube URL and click "Change Video"
6. Everyone in the room watches together in sync!
