import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { FaUsers, FaCrown, FaShieldAlt, FaUser, FaCopy } from 'react-icons/fa';
import toast, { Toaster } from 'react-hot-toast';

// HARDCODED BACKEND URL
const SOCKET_URL = 'https://youtube-watch-party-backend-tfdz.onrender.com';

function extractVideoId(url) {
  if (!url) return null;
  if (url.length === 11 && !url.includes('/')) return url;
  const patterns = [
    /[?&]v=([^&]{11})/,
    /youtu\.be\/([^?]{11})/,
    /shorts\/([^?]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

function Room() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  const username = new URLSearchParams(location.search).get('username') || 
                   localStorage.getItem('watchPartyUsername') || 'Anonymous';
  
  const [participants, setParticipants] = useState([]);
  const [userRole, setUserRole] = useState('loading');
  const [activities, setActivities] = useState([]);
  const [syncStatus, setSyncStatus] = useState('connecting');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [currentVideoUrl, setCurrentVideoUrl] = useState('https://www.youtube.com/embed/dQw4w9WgXcQ');
  
  const socketRef = useRef(null);
  const isConnectedRef = useRef(false);

  // Socket connection - runs ONCE
  useEffect(() => {
    console.log('🔌 Creating socket connection...');
    
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('✅ Socket connected! ID:', socket.id);
      setSyncStatus('synced');
      socket.emit('join_room', { roomId, username });
    });
    
    socket.on('connect_error', (err) => {
      console.error('❌ Connection error:', err);
      setSyncStatus('disconnected');
    });
    
    socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected:', reason);
      setSyncStatus('disconnected');
    });
    
    socket.on('role_assigned', (data) => {
      console.log('🎭 Role assigned:', data);
      const role = data.role || data.newRole;
      if (role) setUserRole(role);
      if (data.participants) setParticipants(data.participants);
      toast.success(`You are the ${role}!`);
    });
    
    socket.on('sync_state', (state) => {
      console.log('🔄 Sync state:', state);
      if (state.videoId) {
        setCurrentVideoUrl(`https://www.youtube.com/embed/${state.videoId}?autoplay=0`);
      }
    });
    
    socket.on('activity_feed', (feed) => {
      setActivities(feed || []);
    });
    
    socket.on('user_joined', ({ participants: updated, activity }) => {
      setParticipants(updated);
      if (activity) setActivities(prev => [activity, ...prev].slice(0, 50));
      toast.success(activity?.message);
    });
    
    socket.on('user_left', ({ participants: updated, activity }) => {
      setParticipants(updated);
      if (activity) setActivities(prev => [activity, ...prev].slice(0, 50));
    });
    
    socket.on('change_video', ({ videoId, activity }) => {
      setCurrentVideoUrl(`https://www.youtube.com/embed/${videoId}?autoplay=1`);
      if (activity) setActivities(prev => [activity, ...prev].slice(0, 50));
      toast.success('Video changed!');
    });
    
    socket.on('error', ({ message }) => {
      toast.error(message);
    });
    
    // CLEANUP - DO NOT disconnect immediately!
    return () => {
      console.log('🧹 Component unmounting, disconnecting socket');
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [roomId, username]); // No other dependencies that would cause re-run

  const handleChangeVideo = () => {
    if (!newVideoUrl.trim()) {
      toast.error('Please paste a YouTube URL');
      return;
    }
    if (userRole !== 'host' && userRole !== 'moderator') {
      toast.error('Only hosts can change video');
      return;
    }
    const videoId = extractVideoId(newVideoUrl);
    if (videoId) {
      socketRef.current?.emit('change_video', { roomId, videoId });
      setNewVideoUrl('');
    } else {
      toast.error('Invalid YouTube URL');
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied!');
  };

  const getRoleIcon = (role) => {
    if (role === 'host') return <FaCrown className="text-yellow-500" />;
    if (role === 'moderator') return <FaShieldAlt className="text-blue-500" />;
    return <FaUser className="text-gray-400" />;
  };

  const canControl = userRole === 'host' || userRole === 'moderator';

  return (
    <div className="min-h-screen bg-black">
      <Toaster position="top-right" />
      
      <div className="bg-gray-900/50 border-b border-yellow-500/20 p-4">
        <div className="container mx-auto flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-yellow-500">🎬 SyncParty</h1>
            <p className="text-sm text-gray-400">Room: {roomId}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className={`px-3 py-1 rounded-full text-sm ${
              syncStatus === 'synced' ? 'bg-green-500/20 text-green-400' : 
              syncStatus === 'connecting' ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-red-500/20 text-red-400'
            }`}>
              {syncStatus === 'synced' ? '🟢 Synced' : 
               syncStatus === 'connecting' ? '🟡 Connecting...' : '🔴 Disconnected'}
            </span>
            <div className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1 ${
              userRole === 'host' ? 'bg-yellow-500/20 text-yellow-500' :
              userRole === 'moderator' ? 'bg-blue-500/20 text-blue-500' : 'bg-gray-500/20 text-gray-400'
            }`}>
              {getRoleIcon(userRole)} {userRole === 'loading' ? 'LOADING...' : userRole.toUpperCase()}
            </div>
            <button onClick={copyLink} className="text-gray-400 hover:text-yellow-500">
              <FaCopy size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-black rounded-xl overflow-hidden aspect-video">
              <iframe src={currentVideoUrl} className="w-full h-full" title="YouTube" allowFullScreen />
            </div>

            {canControl ? (
              <div className="bg-gray-900/50 rounded-xl p-4 border border-yellow-500/20">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    placeholder="Paste YouTube URL here..."
                    className="flex-1 px-4 py-3 rounded-lg bg-gray-800 text-white"
                    onKeyPress={(e) => e.key === 'Enter' && handleChangeVideo()}
                  />
                  <button onClick={handleChangeVideo} className="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 rounded-lg">
                    Change Video
                  </button>
                </div>
              </div>
            ) : userRole !== 'loading' && (
              <div className="bg-gray-900/50 rounded-xl p-4 text-center">
                <p className="text-gray-400">👀 You are a participant. Only the host can change videos.</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-gray-900/50 rounded-xl p-4 border border-yellow-500/20">
              <h3 className="text-white font-semibold mb-3">📝 Live Activity</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activities.map((a) => (
                  <div key={a.id} className="text-sm text-gray-300 p-2 bg-gray-800/50 rounded-lg">
                    {a.message}
                    <span className="text-xs text-gray-500 float-right">{a.timestamp}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-900/50 rounded-xl p-4 border border-yellow-500/20">
              <h3 className="text-white font-semibold mb-3">👥 Participants ({participants.length})</h3>
              <div className="space-y-2">
                {participants.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 p-2 bg-gray-800/50 rounded-lg">
                    {getRoleIcon(p.role)}
                    <span className="text-white">{p.name}</span>
                    {p.id === socketRef.current?.id && <span className="text-xs text-gray-400">(You)</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Room;