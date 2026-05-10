import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { FaUsers, FaCrown, FaShieldAlt, FaUser, FaCopy } from 'react-icons/fa';
import toast, { Toaster } from 'react-hot-toast';

// DIRECT HARDCODE - NO ENVIRONMENT VARIABLES
const SOCKET_URL = 'https://youtube-watch-party-backend-tfdz.onrender.com';

function extractVideoId(url) {
  if (!url) return null;
  if (url.length === 11 && !url.includes('/')) return url;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|shorts\/)([^&?]+)/);
  return match ? match[1] : null;
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
  const isMounted = useRef(true);

  // Socket connection - SINGLE EFFECT, NO DEPENDENCIES
  useEffect(() => {
    console.log('🔌 Room mounted for:', roomId);
    
    if (!roomId) {
      navigate('/');
      return;
    }
    
    // Create socket connection
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
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
    
    socket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
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
        setCurrentVideoUrl(`https://www.youtube.com/embed/${state.videoId}?autoplay=0&modestbranding=1&rel=0`);
      }
    });
    
    socket.on('activity_feed', (feed) => {
      setActivities(feed || []);
    });
    
    socket.on('user_joined', ({ participants: updated, activity }) => {
      setParticipants(updated);
      if (activity) {
        setActivities(prev => [activity, ...prev].slice(0, 50));
      }
      toast.success(activity?.message || 'Someone joined');
    });
    
    socket.on('user_left', ({ participants: updated, activity }) => {
      setParticipants(updated);
      if (activity) {
        setActivities(prev => [activity, ...prev].slice(0, 50));
      }
    });
    
    socket.on('change_video', ({ videoId, activity }) => {
      console.log('🎬 Video changing to:', videoId);
      setCurrentVideoUrl(`https://www.youtube.com/embed/${videoId}?autoplay=1&modestbranding=1&rel=0`);
      if (activity) {
        setActivities(prev => [activity, ...prev].slice(0, 50));
      }
      toast.success('Video changed!');
    });
    
    socket.on('error', ({ message }) => {
      toast.error(message);
    });
    
    // CLEANUP - Only on unmount
    return () => {
      console.log('🧹 Room unmounting, disconnecting socket');
      isMounted.current = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [roomId, username, navigate]); // Fixed dependencies - NO addActivity

  const handleChangeVideo = () => {
    if (!newVideoUrl.trim()) {
      toast.error('Please paste a YouTube URL');
      return;
    }
    
    const videoId = extractVideoId(newVideoUrl);
    if (videoId && socketRef.current) {
      socketRef.current.emit('change_video', { roomId, videoId });
      setNewVideoUrl('');
      toast.success('Changing video...');
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
      
      {/* Header */}
      <div className="bg-gray-900/50 backdrop-blur-md border-b border-yellow-500/20 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-yellow-500">🎬 SyncParty</h1>
              <p className="text-sm text-gray-400">Room: {roomId}</p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className={`px-3 py-1 rounded-full text-sm ${
                syncStatus === 'synced' ? 'bg-green-500/20 text-green-400' :
                syncStatus === 'connecting' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {syncStatus === 'synced' ? '🟢 Synced' : 
                 syncStatus === 'connecting' ? '🟡 Connecting...' : '🔴 Disconnected'}
              </div>
              
              <div className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1 ${
                userRole === 'host' ? 'bg-yellow-500/20 text-yellow-500' :
                userRole === 'moderator' ? 'bg-blue-500/20 text-blue-500' :
                'bg-gray-500/20 text-gray-400'
              }`}>
                {getRoleIcon(userRole)} {userRole === 'loading' ? 'LOADING...' : userRole.toUpperCase()}
              </div>
              
              <button onClick={copyLink} className="text-gray-400 hover:text-yellow-500 transition-colors">
                <FaCopy size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN - Video Player */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-black rounded-xl overflow-hidden shadow-2xl aspect-video">
              <iframe
                key={currentVideoUrl}
                src={currentVideoUrl}
                className="w-full h-full"
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            {/* URL Input - Only for Host/Moderator */}
            {canControl && (
              <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-4 border border-yellow-500/20">
                <label className="text-gray-300 text-sm mb-2 block">🎬 Change YouTube Video</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    placeholder="Paste YouTube URL here..."
                    className="flex-1 px-4 py-3 rounded-lg bg-gray-800 text-white border border-gray-700 focus:border-yellow-500 focus:outline-none"
                    onKeyPress={(e) => e.key === 'Enter' && handleChangeVideo()}
                  />
                  <button 
                    onClick={handleChangeVideo} 
                    className="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-black font-semibold rounded-lg transition-all"
                  >
                    Change Video
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  💡 Supports: youtube.com/watch, youtu.be/, youtube.com/shorts/
                </p>
              </div>
            )}

            {/* Message for participants */}
            {!canControl && userRole !== 'loading' && (
              <div className="bg-gray-900/50 rounded-xl p-4 text-center border border-yellow-500/20">
                <p className="text-gray-400">
                  👀 You are a <span className="text-yellow-500">participant</span>. Only the host and moderators can change videos.
                </p>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN - Sidebar */}
          <div className="space-y-4">
            {/* Activity Feed */}
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-4 border border-yellow-500/20">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                📝 Live Activity
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activities.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No activity yet</p>
                ) : (
                  activities.map((activity) => (
                    <div key={activity.id} className="text-sm text-gray-300 p-2 bg-gray-800/50 rounded-lg">
                      ✨ {activity.message}
                      <span className="text-xs text-gray-500 float-right">{activity.timestamp}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Participants List */}
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-4 border border-yellow-500/20">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <FaUsers className="text-yellow-500" /> Participants ({participants.length})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {participants.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Waiting for others...</p>
                ) : (
                  participants.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        {getRoleIcon(p.role)}
                        <span className="text-white">{p.name}</span>
                        {p.id === socketRef.current?.id && <span className="text-xs text-gray-400">(You)</span>}
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          p.role === 'host' ? 'bg-yellow-500/20 text-yellow-500' :
                          p.role === 'moderator' ? 'bg-blue-500/20 text-blue-500' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {p.role}
                        </span>
                      </div>
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