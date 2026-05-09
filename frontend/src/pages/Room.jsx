import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  FaUsers, FaCrown, FaShieldAlt, FaUser,
  FaCopy, FaSignal, FaRegClock, FaCheckCircle,
  FaExclamationTriangle, FaTrash, FaUserShield,
} from 'react-icons/fa';
import toast, { Toaster } from 'react-hot-toast';

// ─── Read backend URL from environment variable ───────────────────────────────
// Local:      http://localhost:3000   (set in frontend/.env)
// Production: https://your-app.onrender.com
const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

// ─── YouTube URL parser ───────────────────────────────────────────────────────
function extractVideoId(url) {
  if (!url) return null;
  if (url.length === 11 && !url.includes('/')) return url; // bare ID

  const patterns = [
    /[?&]v=([^&]{11})/,            // youtube.com/watch?v=
    /youtu\.be\/([^?]{11})/,       // youtu.be/
    /shorts\/([^?]{11})/,          // youtube.com/shorts/
    /embed\/([^?]{11})/,           // youtube.com/embed/
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────
function Room() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const username =
    new URLSearchParams(location.search).get('username') ||
    localStorage.getItem('watchPartyUsername') ||
    'Anonymous';

  // ── State ──────────────────────────────────────────────────────────────────
  const [participants, setParticipants] = useState([]);
  const [userRole, setUserRole] = useState('loading');
  const [activities, setActivities] = useState([]);
  const [syncStatus, setSyncStatus] = useState('connecting');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [mySocketId, setMySocketId] = useState(null);

  // ── Refs (don't cause re-renders) ─────────────────────────────────────────
  const socketRef = useRef(null);
  const playerRef = useRef(null);         // YouTube IFrame player instance
  const isRemoteAction = useRef(false);   // true while applying remote events
  const lastTimeRef = useRef(0);          // last polled video time (seek detection)
  const seekPollRef = useRef(null);       // interval ID for seek polling
  const pendingSyncRef = useRef(null);    // sync_state received before player ready
  const videoIdRef = useRef('dQw4w9WgXcQ');

  // Handler ref — allows the YT player callback to always call the latest version
  const stateChangeHandlerRef = useRef(null);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const addActivity = useCallback((activity) => {
    if (!activity) return;
    setActivities((prev) => [activity, ...prev].slice(0, 50));
  }, []);

  // ── Socket setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;
    setMySocketId(socket.id);

    socket.on('connect', () => {
      setSyncStatus('synced');
      setMySocketId(socket.id);
      socket.emit('join_room', { roomId, username });
    });

    socket.on('connect_error', () => setSyncStatus('disconnected'));
    socket.on('disconnect', () => setSyncStatus('disconnected'));

    socket.on('reconnect', () => {
      setSyncStatus('synced');
      socket.emit('join_room', { roomId, username });
    });

    // ── Server → Client events ─────────────────────────────────────────────

    // Called on join: tells us our role
    socket.on('role_assigned', (data) => {
      const role = data.role || data.newRole;

      // Update current user's role if this event is for us
      if (!data.userId || data.userId === socket.id) {
        if (role) {
          setUserRole(role);
          toast.success(`You joined as ${role} 🎉`);
        }
      }

      if (data.participants) setParticipants(data.participants);
      if (data.activity) addActivity(data.activity);
    });

    // Full video state when joining mid-session
    socket.on('sync_state', (state) => {
      videoIdRef.current = state.videoId;
      const player = playerRef.current;
      if (player && player.loadVideoById) {
        isRemoteAction.current = true;
        if (state.isPlaying) {
          player.loadVideoById({ videoId: state.videoId, startSeconds: state.currentTime || 0 });
        } else {
          player.cueVideoById({ videoId: state.videoId, startSeconds: state.currentTime || 0 });
        }
      } else {
        // Player not ready yet — store and apply in onPlayerReady
        pendingSyncRef.current = state;
      }
    });

    socket.on('activity_feed', (feed) => setActivities(feed || []));

    socket.on('user_joined', ({ participants: p, activity }) => {
      setParticipants(p);
      addActivity(activity);
    });

    socket.on('user_left', ({ participants: p, activity }) => {
      setParticipants(p);
      addActivity(activity);
    });

    // ── Playback events ────────────────────────────────────────────────────

    socket.on('play', ({ time, activity }) => {
      addActivity(activity);
      const player = playerRef.current;
      if (!player) return;
      isRemoteAction.current = true;
      if (time !== undefined) {
        player.seekTo(time, true);
        lastTimeRef.current = time;
      }
      player.playVideo();
    });

    socket.on('pause', ({ time, activity }) => {
      addActivity(activity);
      const player = playerRef.current;
      if (!player) return;
      isRemoteAction.current = true;
      clearInterval(seekPollRef.current);
      if (time !== undefined) {
        player.seekTo(time, true);
        lastTimeRef.current = time;
      }
      player.pauseVideo();
    });

    socket.on('seek', ({ time, activity }) => {
      addActivity(activity);
      const player = playerRef.current;
      if (!player) return;
      isRemoteAction.current = true;
      player.seekTo(time, true);
      lastTimeRef.current = time;
    });

    socket.on('change_video', ({ videoId, activity }) => {
      addActivity(activity);
      videoIdRef.current = videoId;
      const player = playerRef.current;
      if (player && player.loadVideoById) {
        isRemoteAction.current = true;
        player.loadVideoById(videoId);
      }
      toast.success('Video changed!');
    });

    socket.on('participant_removed', ({ participants: p, activity }) => {
      setParticipants(p);
      addActivity(activity);
    });

    // We were kicked
    socket.on('kicked_from_room', () => {
      toast.error('You were removed from the room');
      setTimeout(() => navigate('/'), 2000);
    });

    socket.on('error', ({ message }) => toast.error(message));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, username, navigate, addActivity]);

  // ── YouTube IFrame API setup ───────────────────────────────────────────────
  // The IFrame API replaces the div#yt-player element with an <iframe>.
  // We cannot use a plain <iframe> because we need JS control (play/pause/seek).
  useEffect(() => {
    const createPlayer = () => {
      if (playerRef.current) return; // Already created

      playerRef.current = new window.YT.Player('yt-player', {
        videoId: videoIdRef.current,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: () => {
            // Apply any sync_state that arrived before the player was ready
            const pending = pendingSyncRef.current;
            if (pending) {
              isRemoteAction.current = true;
              if (pending.isPlaying) {
                playerRef.current.loadVideoById({
                  videoId: pending.videoId,
                  startSeconds: pending.currentTime || 0,
                });
              } else {
                playerRef.current.cueVideoById({
                  videoId: pending.videoId,
                  startSeconds: pending.currentTime || 0,
                });
              }
              pendingSyncRef.current = null;
            }
          },
          // Route all state changes through the ref so we always use
          // the latest version of the handler without recreating the player
          onStateChange: (e) => {
            if (stateChangeHandlerRef.current) {
              stateChangeHandlerRef.current(e);
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      // API already loaded (e.g. navigated back to this page)
      createPlayer();
    } else if (!document.getElementById('yt-api-script')) {
      // First time — inject the script tag
      const script = document.createElement('script');
      script.id = 'yt-api-script';
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
      window.onYouTubeIframeAPIReady = createPlayer;
    } else {
      // Script tag exists but API not ready yet (still loading)
      window.onYouTubeIframeAPIReady = createPlayer;
    }

    return () => {
      clearInterval(seekPollRef.current);
      if (playerRef.current?.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, []); // Run once on mount

  // ── Player state change handler ────────────────────────────────────────────
  // Updated every render so it always has fresh state/refs without recreating player
  stateChangeHandlerRef.current = useCallback(
    (e) => {
      // If this state change was triggered by a remote socket event, ignore it
      if (isRemoteAction.current) {
        isRemoteAction.current = false;
        return;
      }

      const YT = window.YT;
      if (!YT) return;

      const player = playerRef.current;
      if (!player) return;

      if (e.data === YT.PlayerState.PLAYING) {
        const time = player.getCurrentTime();
        lastTimeRef.current = time;
        socketRef.current?.emit('play', { roomId, time });

        // Start polling to detect seeks (time jumps) while playing
        clearInterval(seekPollRef.current);
        seekPollRef.current = setInterval(() => {
          if (!playerRef.current) return;
          const currentTime = playerRef.current.getCurrentTime();
          // If time jumped more than 2.5s from where it should be → seek happened
          const expectedTime = lastTimeRef.current + 1;
          if (Math.abs(currentTime - expectedTime) > 2.5 && !isRemoteAction.current) {
            socketRef.current?.emit('seek', { roomId, time: currentTime });
          }
          lastTimeRef.current = currentTime;
        }, 1000);
      }

      if (e.data === YT.PlayerState.PAUSED) {
        clearInterval(seekPollRef.current);
        const time = player.getCurrentTime();

        // If time jumped significantly from last known → it was a seek-then-pause
        if (Math.abs(time - lastTimeRef.current) > 2.5) {
          socketRef.current?.emit('seek', { roomId, time });
        }

        lastTimeRef.current = time;
        socketRef.current?.emit('pause', { roomId, time });
      }
    },
    [roomId]
  );

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleChangeVideo = () => {
    if (!newVideoUrl.trim()) {
      toast.error('Please paste a YouTube URL');
      return;
    }
    const videoId = extractVideoId(newVideoUrl);
    if (!videoId) {
      toast.error('Could not recognise that YouTube URL');
      return;
    }
    socketRef.current?.emit('change_video', { roomId, videoId });
    setNewVideoUrl('');
  };

  const handleAssignRole = (userId, newRole) => {
    socketRef.current?.emit('assign_role', { roomId, userId, newRole });
  };

  const handleRemoveParticipant = (userId, name) => {
    if (!window.confirm(`Remove ${name} from the room?`)) return;
    socketRef.current?.emit('remove_participant', { roomId, userId });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Room link copied!');
  };

  // ── UI helpers ──────────────────────────────────────────────────────────────

  const getRoleIcon = (role) => {
    if (role === 'host') return <FaCrown className="text-yellow-500" />;
    if (role === 'moderator') return <FaShieldAlt className="text-blue-400" />;
    return <FaUser className="text-gray-400" />;
  };

  const syncBadge = {
    synced: 'bg-green-500/20 text-green-400',
    connecting: 'bg-yellow-500/20 text-yellow-400',
    disconnected: 'bg-red-500/20 text-red-400',
  }[syncStatus] || 'bg-gray-500/20 text-gray-400';

  const roleBadge = {
    host: 'bg-yellow-500/20 text-yellow-500',
    moderator: 'bg-blue-500/20 text-blue-400',
  }[userRole] || 'bg-gray-500/20 text-gray-400';

  const canControl = userRole === 'host' || userRole === 'moderator';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black">
      <Toaster position="top-right" />

      {/* ── Header ── */}
      <div className="bg-gray-900/50 backdrop-blur-md border-b border-yellow-500/20 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-yellow-500">🎬 SyncParty</h1>
              <p className="text-sm text-gray-400">Room: {roomId}</p>
            </div>

            <div className="flex items-center gap-3">
              {/* Sync status */}
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${syncBadge}`}>
                {syncStatus === 'synced' && <FaCheckCircle />}
                {syncStatus === 'connecting' && <FaSignal className="animate-pulse" />}
                {syncStatus === 'disconnected' && <FaExclamationTriangle />}
                <span className="capitalize">{syncStatus}</span>
              </div>

              {/* My role */}
              <div className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1 ${roleBadge}`}>
                {getRoleIcon(userRole)}
                <span>{userRole === 'loading' ? 'joining...' : userRole.toUpperCase()}</span>
              </div>

              <button onClick={copyLink} title="Copy room link"
                className="text-gray-400 hover:text-yellow-500 transition-colors">
                <FaCopy size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-6">

          {/* ── LEFT: Video + controls ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* ── YouTube Player ── */}
            {/*
              IMPORTANT: This div is replaced by the YouTube IFrame API with an <iframe>.
              Do NOT add a React key here or wrap it in anything that changes — that would
              destroy and recreate the player, breaking synchronization.
            */}
            <div className="bg-black rounded-xl overflow-hidden shadow-2xl aspect-video">
              <div id="yt-player" style={{ width: '100%', height: '100%' }} />
            </div>

            {/* ── Participant note for viewers ── */}
            {!canControl && userRole !== 'loading' && (
              <div className="bg-gray-900/50 rounded-xl p-4 text-center border border-yellow-500/20">
                <p className="text-gray-400">
                  👀 You are a <span className="text-yellow-500 font-semibold">participant</span>.
                  Playback is controlled by the host or moderators.
                </p>
              </div>
            )}

            {/* ── Change video (host/moderator only) ── */}
            {canControl && (
              <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-4 border border-yellow-500/20 space-y-3">
                <label className="text-gray-300 text-sm font-medium block">🎬 Change Video</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleChangeVideo()}
                    placeholder="Paste any YouTube URL…"
                    className="flex-1 px-4 py-3 rounded-lg bg-gray-800 text-white border border-gray-700
                               focus:border-yellow-500 focus:outline-none"
                  />
                  <button
                    onClick={handleChangeVideo}
                    className="px-6 py-3 bg-yellow-600 hover:bg-yellow-500 text-black font-semibold
                               rounded-lg transition-all"
                  >
                    Change
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Supports: youtube.com/watch?v=… · youtu.be/… · youtube.com/shorts/…
                </p>

                {/* Sync hint */}
                <div className="bg-blue-900/20 border border-blue-500/20 rounded-lg p-3">
                  <p className="text-xs text-blue-300">
                    💡 <strong>How sync works:</strong> Use the YouTube player controls normally.
                    When you press play, pause, or scrub — all participants follow automatically.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: Sidebar ── */}
          <div className="space-y-4">

            {/* ── Participants ── */}
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-4 border border-yellow-500/20">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <FaUsers className="text-yellow-500" />
                Participants ({participants.length})
              </h3>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {participants.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Waiting for others…</p>
                ) : (
                  participants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg gap-2"
                    >
                      {/* Name + role */}
                      <div className="flex items-center gap-2 min-w-0">
                        {getRoleIcon(p.role)}
                        <span className="text-white text-sm truncate">{p.name}</span>
                        {p.id === mySocketId && (
                          <span className="text-xs text-gray-500">(you)</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                          p.role === 'host'
                            ? 'bg-yellow-500/20 text-yellow-500'
                            : p.role === 'moderator'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {p.role}
                        </span>
                      </div>

                      {/* Host actions — only shown to the host, not on themselves */}
                      {userRole === 'host' && p.id !== mySocketId && (
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Toggle moderator / participant */}
                          {p.role === 'participant' ? (
                            <button
                              onClick={() => handleAssignRole(p.id, 'moderator')}
                              title="Make moderator"
                              className="p-1 text-blue-400 hover:text-blue-300 transition-colors"
                            >
                              <FaUserShield size={14} />
                            </button>
                          ) : p.role === 'moderator' ? (
                            <button
                              onClick={() => handleAssignRole(p.id, 'participant')}
                              title="Demote to participant"
                              className="p-1 text-gray-400 hover:text-gray-300 transition-colors"
                            >
                              <FaUser size={14} />
                            </button>
                          ) : null}

                          {/* Remove */}
                          <button
                            onClick={() => handleRemoveParticipant(p.id, p.name)}
                            title="Remove from room"
                            className="p-1 text-red-400 hover:text-red-300 transition-colors"
                          >
                            <FaTrash size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ── Activity feed ── */}
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-4 border border-yellow-500/20">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <FaRegClock className="text-yellow-500" />
                Activity
              </h3>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activities.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No activity yet</p>
                ) : (
                  activities.map((a) => (
                    <div
                      key={a.id}
                      className="text-sm text-gray-300 p-2 bg-gray-800/50 rounded-lg flex justify-between gap-2"
                    >
                      <span>
                        <span className="text-yellow-500">✦</span> {a.message}
                      </span>
                      <span className="text-xs text-gray-500 shrink-0">{a.timestamp}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default Room;
