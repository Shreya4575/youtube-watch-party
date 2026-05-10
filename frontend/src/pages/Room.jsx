import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  FaUsers, FaCrown, FaShieldAlt, FaUser, FaCopy,
  FaComments, FaKeyboard, FaTimes, FaPaperPlane,
  FaCircle, FaVideo, FaChevronDown, FaChevronUp
} from 'react-icons/fa';
import toast, { Toaster } from 'react-hot-toast';

const SOCKET_URL = 'https://youtube-watch-party-backend-tfdz.onrender.com';

function extractVideoId(url) {
  if (!url) return null;
  if (url.length === 11 && !url.includes('/')) return url;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|shorts\/)([^&?]+)/);
  return match ? match[1] : null;
}

function ShortcutsModal({ onClose }) {
  const shortcuts = [
    { key: 'Space / K', desc: 'Play / Pause reminder (host only)' },
    { key: 'J', desc: 'Rewind 10s reminder (host only)' },
    { key: 'L', desc: 'Forward 10s reminder (host only)' },
    { key: 'T', desc: 'Focus chat input' },
    { key: 'C', desc: 'Toggle chat tab (mobile)' },
    { key: 'U', desc: 'Toggle participants tab' },
    { key: '?', desc: 'Show / hide shortcuts' },
    { key: 'Escape', desc: 'Close modal / blur input' },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-gray-900 border border-yellow-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FaKeyboard className="text-yellow-500" />
            <h3 className="text-white font-bold text-lg">Keyboard Shortcuts</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <FaTimes size={18} />
          </button>
        </div>
        <div className="space-y-1">
          {shortcuts.map(({ key, desc }) => (
            <div key={key} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
              <span className="text-gray-300 text-sm">{desc}</span>
              <kbd className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-yellow-400 text-xs font-mono ml-2 flex-shrink-0">{key}</kbd>
            </div>
          ))}
        </div>
        <p className="text-gray-600 text-xs mt-4 text-center">Press ? anytime to toggle this panel</p>
      </div>
    </div>
  );
}

function OnlineDot({ isOnline }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? 'bg-green-400' : 'bg-gray-600'}`} />
  );
}

function Room() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const username = new URLSearchParams(location.search).get('username') ||
    localStorage.getItem('watchPartyUsername') || 'Anonymous';

  const [participants, setParticipants] = useState([]);
  const [userRole, setUserRole] = useState('loading');
  const [syncStatus, setSyncStatus] = useState('connecting');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [currentVideoUrl, setCurrentVideoUrl] = useState('https://www.youtube.com/embed/dQw4w9WgXcQ');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState('video');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showParticipants, setShowParticipants] = useState(true);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const typingTimerRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const activeTabRef = useRef(activeTab);

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!roomId) { navigate('/'); return; }

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], reconnection: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSyncStatus('synced');
      socket.emit('join_room', { roomId, username });
      pingIntervalRef.current = setInterval(() => {
        socket.emit('ping_online', { roomId });
      }, 15000);
    });

    socket.on('connect_error', () => setSyncStatus('disconnected'));
    socket.on('disconnect', () => { setSyncStatus('disconnected'); clearInterval(pingIntervalRef.current); });

    socket.on('role_assigned', (data) => {
      const role = data.role || data.newRole;
      if (role) setUserRole(role);
      if (data.participants) setParticipants(data.participants);
    });

    socket.on('sync_state', (state) => {
      if (state.videoId) setCurrentVideoUrl(`https://www.youtube.com/embed/${state.videoId}?autoplay=0`);
    });

    socket.on('user_joined', ({ participants: p }) => setParticipants(p));
    socket.on('user_left', ({ participants: p }) => setParticipants(p));
    socket.on('participants_updated', (p) => setParticipants(p));

    socket.on('chat_history', (history) => {
      if (Array.isArray(history)) setMessages(history);
    });

    socket.on('chat_message', (msg) => {
      setMessages(prev => [...prev, msg]);
      if (activeTabRef.current !== 'chat' && msg.username !== username) {
        setUnreadCount(c => c + 1);
      }
    });

    socket.on('change_video', ({ videoId }) => {
      setCurrentVideoUrl(`https://www.youtube.com/embed/${videoId}?autoplay=1`);
    });

    socket.on('user_typing', ({ username: u, socketId }) => {
      setTypingUsers(prev => prev.find(t => t.socketId === socketId) ? prev : [...prev, { username: u, socketId }]);
    });
    socket.on('user_stopped_typing', ({ socketId }) => {
      setTypingUsers(prev => prev.filter(t => t.socketId !== socketId));
    });

    socket.on('kicked_from_room', () => { toast.error('You were removed from the room'); navigate('/'); });

    return () => { clearInterval(pingIntervalRef.current); socket.disconnect(); };
  }, [roomId, username, navigate]); // eslint-disable-line

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea';

      if (e.key === 'Escape') { setShowShortcuts(false); document.activeElement?.blur(); return; }
      if (e.key === '?' && !isInput) { e.preventDefault(); setShowShortcuts(s => !s); return; }
      if (isInput) return;

      const canCtrl = userRole === 'host' || userRole === 'moderator';
      switch (e.key.toLowerCase()) {
        case ' ': case 'k':
          e.preventDefault();
          if (!canCtrl) toast.error('Only host/moderator can control playback');
          else toast('Use the YouTube player controls directly', { icon: '⌨️', duration: 1500 });
          break;
        case 'j':
          if (!canCtrl) toast.error('Only host/moderator can seek');
          else toast('⏪ Use player rewind button', { icon: '⌨️', duration: 1500 });
          break;
        case 'l':
          if (!canCtrl) toast.error('Only host/moderator can seek');
          else toast('⏩ Use player forward button', { icon: '⌨️', duration: 1500 });
          break;
        case 't':
          e.preventDefault();
          setActiveTab('chat');
          setUnreadCount(0);
          setTimeout(() => chatInputRef.current?.focus(), 100);
          break;
        case 'c':
          e.preventDefault();
          setActiveTab(t => { const next = t === 'chat' ? 'video' : 'chat'; if (next === 'chat') setUnreadCount(0); return next; });
          break;
        case 'u':
          e.preventDefault();
          setActiveTab(t => t === 'people' ? 'video' : 'people');
          break;
        default: break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [userRole]);

  const handleChangeVideo = () => {
    if (!newVideoUrl.trim()) { toast.error('Paste a YouTube URL'); return; }
    const videoId = extractVideoId(newVideoUrl);
    if (videoId) { socketRef.current?.emit('change_video', { roomId, videoId }); setNewVideoUrl(''); }
    else toast.error('Invalid YouTube URL');
  };

  const copyLink = () => { navigator.clipboard.writeText(window.location.href); toast.success('Room link copied!'); };

  const sendMessage = () => {
    const msg = newMessage.trim();
    if (!msg) return;
    if (!socketRef.current) { toast.error('Not connected'); return; }
    socketRef.current.emit('chat_message', { roomId, message: msg, username });
    socketRef.current.emit('typing_stop', { roomId });
    setNewMessage('');
    clearTimeout(typingTimerRef.current);
  };

  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    if (!socketRef.current) return;
    socketRef.current.emit('typing_start', { roomId, username });
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => socketRef.current?.emit('typing_stop', { roomId }), 2000);
  };

  const getRoleIcon = (role) => {
    if (role === 'host') return <FaCrown className="text-yellow-500 flex-shrink-0" size={12} />;
    if (role === 'moderator') return <FaShieldAlt className="text-blue-400 flex-shrink-0" size={12} />;
    return <FaUser className="text-gray-500 flex-shrink-0" size={12} />;
  };

  const canControl = userRole === 'host' || userRole === 'moderator';
  const onlineCount = participants.filter(p => p.isOnline !== false).length;

  const ChatPanel = () => (
    <div className="flex flex-col h-full bg-gray-900/60 rounded-xl border border-yellow-500/20 overflow-hidden">
      <div className="px-4 py-3 border-b border-yellow-500/20 bg-gray-800/40 flex items-center gap-2 flex-shrink-0">
        <FaComments className="text-yellow-500" size={13} />
        <span className="text-white font-semibold text-sm">Live Chat</span>
        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{messages.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <FaComments className="text-gray-700 mb-2" size={28} />
            <p className="text-gray-500 text-sm">No messages yet</p>
            <p className="text-gray-600 text-xs mt-1">Press T to start chatting</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMe = msg.username === username;
            return (
              <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${isMe ? 'bg-yellow-600 text-black rounded-br-sm' : 'bg-gray-700 text-white rounded-bl-sm'}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {!isMe && msg.isHost && <FaCrown className="text-yellow-400" size={9} />}
                    <span className={`text-xs font-bold ${isMe ? 'text-black/70' : 'text-gray-300'}`}>{isMe ? 'You' : msg.username}</span>
                    <span className={`text-[10px] ${isMe ? 'text-black/50' : 'text-gray-500'}`}>{msg.timestamp}</span>
                  </div>
                  <p className="text-sm break-words leading-snug">{msg.message}</p>
                </div>
              </div>
            );
          })
        )}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 px-1">
            <div className="flex gap-1">
              {[0, 150, 300].map(delay => (
                <span key={delay} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
              ))}
            </div>
            <span className="text-xs text-gray-500 italic">
              {typingUsers.map(t => t.username).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-yellow-500/20 flex-shrink-0">
        <div className="flex gap-2">
          <input
            ref={chatInputRef}
            type="text"
            value={newMessage}
            onChange={handleTyping}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Message... (press T)"
            className="flex-1 px-3 py-2 rounded-xl bg-gray-800 text-white text-sm border border-gray-700 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500/30 transition-all placeholder-gray-600"
            maxLength={500}
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim()}
            className="px-3 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 text-black rounded-xl transition-all"
          >
            <FaPaperPlane size={13} />
          </button>
        </div>
        <p className="text-[10px] text-gray-700 mt-1 text-right">{newMessage.length}/500</p>
      </div>
    </div>
  );

  const ParticipantsPanel = () => (
    <div className="bg-gray-900/60 rounded-xl border border-yellow-500/20 overflow-hidden">
      <button
        className="w-full px-4 py-3 border-b border-yellow-500/20 bg-gray-800/40 flex items-center justify-between"
        onClick={() => setShowParticipants(s => !s)}
      >
        <div className="flex items-center gap-2">
          <FaUsers className="text-yellow-500" size={13} />
          <span className="text-white font-semibold text-sm">Participants</span>
          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1">
            <FaCircle size={6} className="animate-pulse" /> {onlineCount}
          </span>
        </div>
        {showParticipants ? <FaChevronUp className="text-gray-500" size={11} /> : <FaChevronDown className="text-gray-500" size={11} />}
      </button>
      {showParticipants && (
        <div className="p-2 space-y-1 max-h-56 overflow-y-auto">
          {participants.map(p => {
            const isMe = p.id === socketRef.current?.id;
            const isOnline = p.isOnline !== false;
            return (
              <div key={p.id} className={`flex items-center gap-2.5 p-2 rounded-lg ${isMe ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-gray-800/40'}`}>
                <OnlineDot isOnline={isOnline} />
                {getRoleIcon(p.role)}
                <span className={`text-sm flex-1 truncate ${isMe ? 'text-yellow-300' : 'text-white'}`}>
                  {p.name} {isMe && <span className="text-xs text-gray-500">(you)</span>}
                </span>
                {!isOnline && <span className="text-xs text-gray-600">away</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Toaster position="top-right" toastOptions={{ style: { background: '#1f2937', color: '#fff', border: '1px solid #374151' } }} />
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {/* Header */}
      <header className="bg-gray-900/80 border-b border-yellow-500/20 px-4 py-3 flex-shrink-0 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <FaVideo className="text-yellow-500 flex-shrink-0" size={18} />
            <div className="min-w-0">
              <h1 className="text-yellow-500 font-bold text-base leading-tight">SyncParty</h1>
              <p className="text-gray-500 text-xs">Room: <span className="font-mono text-gray-300">{roomId}</span></p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${syncStatus === 'synced' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'synced' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              {syncStatus === 'synced' ? 'Synced' : 'Offline'}
            </span>

            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${userRole === 'host' ? 'bg-yellow-500/20 text-yellow-400' : userRole === 'moderator' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-400'}`}>
              {getRoleIcon(userRole)}
              <span className="hidden sm:inline">{userRole === 'loading' ? '...' : userRole}</span>
            </div>

            <button onClick={() => setShowShortcuts(true)} className="p-2 rounded-lg text-gray-500 hover:text-yellow-500 hover:bg-gray-800 transition-colors" title="Keyboard shortcuts (?)">
              <FaKeyboard size={15} />
            </button>
            <button onClick={copyLink} className="p-2 rounded-lg text-gray-500 hover:text-yellow-500 hover:bg-gray-800 transition-colors" title="Copy room link">
              <FaCopy size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Tabs */}
      <div className="lg:hidden flex bg-gray-900 border-b border-gray-800 flex-shrink-0 sticky top-[57px] z-20">
        {[
          { id: 'video', label: 'Video', icon: <FaVideo size={12} /> },
          { id: 'chat', label: 'Chat', icon: <FaComments size={12} />, badge: unreadCount },
          { id: 'people', label: `People (${onlineCount})`, icon: <FaUsers size={12} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); if (tab.id === 'chat') setUnreadCount(0); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors relative ${activeTab === tab.id ? 'text-yellow-500 border-b-2 border-yellow-500' : 'text-gray-500'}`}
          >
            {tab.icon}
            <span className="hidden xs:inline">{tab.label}</span>
            {tab.badge > 0 && (
              <span className="absolute top-1.5 right-3 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold">
                {tab.badge > 9 ? '9+' : tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {/* Desktop */}
        <div className="hidden lg:flex h-full max-w-7xl mx-auto px-4 py-4 gap-4" style={{ height: 'calc(100vh - 65px)' }}>
          <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-y-auto">
            <div className="bg-black rounded-xl overflow-hidden shadow-2xl flex-shrink-0" style={{ aspectRatio: '16/9' }}>
              <iframe src={currentVideoUrl} className="w-full h-full" title="YouTube" allowFullScreen allow="autoplay; encrypted-media" />
            </div>
            {canControl && (
              <div className="bg-gray-900/60 rounded-xl p-4 border border-gray-800 flex-shrink-0">
                <p className="text-gray-500 text-xs mb-2 font-medium uppercase tracking-wide">Change Video</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    placeholder="Paste YouTube URL or video ID..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-gray-800 text-white text-sm border border-gray-700 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500/30 transition-all placeholder-gray-600"
                    onKeyDown={(e) => e.key === 'Enter' && handleChangeVideo()}
                  />
                  <button onClick={handleChangeVideo} className="px-5 py-2.5 bg-yellow-600 hover:bg-yellow-500 text-black font-semibold rounded-xl transition-colors text-sm">Load</button>
                </div>
              </div>
            )}
            <div className="flex items-center gap-4 text-xs text-gray-700 bg-gray-900/40 rounded-lg px-4 py-2 border border-gray-800/50 flex-shrink-0">
              <FaKeyboard size={11} />
              <span><kbd className="bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded text-gray-500 font-mono">T</kbd> Chat</span>
              <span><kbd className="bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded text-gray-500 font-mono">?</kbd> Shortcuts</span>
              {canControl && <span><kbd className="bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded text-gray-500 font-mono">Space</kbd> Play/Pause</span>}
            </div>
          </div>

          <div className="w-80 flex flex-col gap-4 overflow-hidden">
            <div className="flex-1 min-h-0">
              <ChatPanel />
            </div>
            <ParticipantsPanel />
          </div>
        </div>

        {/* Mobile */}
        <div className="lg:hidden h-full flex flex-col">
          {activeTab === 'video' && (
            <div className="flex-1 overflow-y-auto">
              <div className="bg-black w-full" style={{ aspectRatio: '16/9' }}>
                <iframe src={currentVideoUrl} className="w-full h-full" title="YouTube" allowFullScreen allow="autoplay; encrypted-media" />
              </div>
              {canControl && (
                <div className="p-3 bg-gray-900 border-b border-gray-800">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newVideoUrl}
                      onChange={(e) => setNewVideoUrl(e.target.value)}
                      placeholder="Paste YouTube URL..."
                      className="flex-1 px-3 py-2.5 rounded-xl bg-gray-800 text-white text-sm border border-gray-700 focus:border-yellow-500 focus:outline-none transition-all placeholder-gray-600"
                      onKeyDown={(e) => e.key === 'Enter' && handleChangeVideo()}
                    />
                    <button onClick={handleChangeVideo} className="px-4 py-2.5 bg-yellow-600 text-black font-semibold rounded-xl text-sm">Load</button>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-4 p-4 text-sm text-gray-500 border-b border-gray-800">
                <span className="flex items-center gap-1.5">
                  <FaCircle className="text-green-400 animate-pulse" size={8} />
                  <span className="text-green-400">{onlineCount}</span> online
                </span>
                <span className="flex items-center gap-1.5">
                  <FaComments size={12} />
                  {messages.length} msgs
                </span>
                <span className={`ml-auto flex items-center gap-1.5 text-xs ${syncStatus === 'synced' ? 'text-green-400' : 'text-red-400'}`}>
                  <span className={`w-2 h-2 rounded-full ${syncStatus === 'synced' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                  {syncStatus}
                </span>
              </div>
              <div className="p-4 text-center">
                <p className="text-gray-600 text-xs">Tap Chat or People tabs above</p>
              </div>
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="flex-1 p-3" style={{ minHeight: 0 }}>
              <div style={{ height: '100%' }}>
                <ChatPanel />
              </div>
            </div>
          )}

          {activeTab === 'people' && (
            <div className="flex-1 overflow-y-auto p-3">
              <div className="bg-gray-900/60 rounded-xl border border-yellow-500/20 overflow-hidden">
                <div className="px-4 py-3 border-b border-yellow-500/20 bg-gray-800/40 flex items-center gap-2">
                  <FaUsers className="text-yellow-500" size={13} />
                  <span className="text-white font-semibold text-sm">Participants</span>
                  <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1 ml-auto">
                    <FaCircle size={6} className="animate-pulse" /> {onlineCount} online
                  </span>
                </div>
                <div className="p-3 space-y-2">
                  {participants.map(p => {
                    const isMe = p.id === socketRef.current?.id;
                    const isOnline = p.isOnline !== false;
                    return (
                      <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl ${isMe ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-gray-800/50'}`}>
                        <OnlineDot isOnline={isOnline} />
                        {getRoleIcon(p.role)}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isMe ? 'text-yellow-300' : 'text-white'}`}>
                            {p.name} {isMe && <span className="text-gray-500 font-normal text-xs">(you)</span>}
                          </p>
                          <p className={`text-xs capitalize ${p.role === 'host' ? 'text-yellow-500' : p.role === 'moderator' ? 'text-blue-400' : 'text-gray-600'}`}>{p.role}</p>
                        </div>
                        <span className={`text-xs ${isOnline ? 'text-green-400' : 'text-gray-600'}`}>{isOnline ? 'online' : 'away'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Room;
