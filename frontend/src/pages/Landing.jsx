import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlay, FaArrowRight, FaUsers, FaSync, FaCrown } from 'react-icons/fa';
import toast, { Toaster } from 'react-hot-toast';

function Landing() {
  const [roomCode, setRoomCode] = useState('');
  const [username, setUsername] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const navigate = useNavigate();

  // 📌 CREATE ROOM - Sirf name chahiye, code nahi chahiye
  const createRoom = () => {
    // Check if username is provided
    if (!username.trim()) {
      toast.error('❌ Please enter your name first!');
      return;
    }
    
    setIsCreating(true);
    
    // Generate random 6-digit room code
    const newRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Save username for later
    localStorage.setItem('watchPartyUsername', username);
    
    // Navigate to room
    setTimeout(() => {
      navigate(`/room/${newRoomCode}?username=${encodeURIComponent(username)}`);
      setIsCreating(false);
    }, 500);
  };

  // 📌 JOIN ROOM - Name AND Room Code both required
  const joinRoom = () => {
    // Check if username is provided
    if (!username.trim()) {
      toast.error('❌ Please enter your name first!');
      return;
    }
    
    // Check if room code is provided
    if (!roomCode.trim()) {
      toast.error('❌ Please enter a room code to join!');
      return;
    }
    
    setIsJoining(true);
    
    // Save username
    localStorage.setItem('watchPartyUsername', username);
    
    // Navigate to room
    setTimeout(() => {
      navigate(`/room/${roomCode.toUpperCase()}?username=${encodeURIComponent(username)}`);
      setIsJoining(false);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black">
      <Toaster position="top-right" />
      
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-8 md:py-16">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-12 max-w-6xl mx-auto">
          
          {/* LEFT SIDE - Hero Content */}
          <div className="flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/10 rounded-full border border-yellow-500/20 mb-6">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
              <span className="text-yellow-500 text-sm font-medium">Live & Synchronized</span>
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
              <span className="text-white">Watch Together,</span>
              <br />
              <span className="bg-gradient-to-r from-yellow-500 to-yellow-300 bg-clip-text text-transparent">
                Anywhere in the World
              </span>
            </h1>
            
            <p className="text-gray-400 text-lg mt-6 max-w-lg mx-auto lg:mx-0">
              Experience synchronized YouTube watching with friends. Perfect for movie nights, study groups, and virtual hangouts.
            </p>

            {/* Features - Responsive Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
              {[
                { icon: <FaSync />, title: 'Real-time Sync', color: 'yellow' },
                { icon: <FaUsers />, title: 'Group Watching', color: 'blue' },
                { icon: <FaCrown />, title: 'Role Controls', color: 'purple' },
                { icon: <FaPlay />, title: 'HD Quality', color: 'green' },
              ].map((feature, i) => (
                <div key={i} className="flex flex-col items-center lg:items-start gap-2 p-3 rounded-xl bg-white/5 backdrop-blur-sm">
                  <div className={`text-${feature.color}-500 text-xl`}>{feature.icon}</div>
                  <span className="text-white text-sm font-medium">{feature.title}</span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT SIDE - Create/Join Card */}
          <div className="flex-1 w-full max-w-md mx-auto lg:mx-0">
            <div className="bg-gray-900/50 backdrop-blur-lg rounded-2xl p-6 md:p-8 border border-yellow-500/20 shadow-2xl">
              
              {/* Username Input - Common for both */}
              <div className="mb-6">
                <label className="block text-gray-300 mb-2 text-sm font-medium">
                  <span className="text-yellow-500">*</span> Your Name
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-gray-800/50 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all"
                  placeholder="Enter your display name"
                  onKeyPress={(e) => e.key === 'Enter' && (roomCode ? joinRoom() : createRoom())}
                />
                <p className="text-xs text-gray-500 mt-1">
                  This is how others will see you in the room
                </p>
              </div>

              {/* CREATE ROOM Button */}
              <button
                onClick={createRoom}
                disabled={isCreating}
                className="w-full bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-bold py-3 rounded-xl transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed mb-4"
              >
                {isCreating ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    Creating Room...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <FaPlay /> 🚀 Create New Room
                  </div>
                )}
              </button>

              {/* OR Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-gray-900 text-gray-400">OR JOIN EXISTING</span>
                </div>
              </div>

              {/* Room Code Input - Only for joining */}
              <div className="mb-6">
                <label className="block text-gray-300 mb-2 text-sm font-medium">
                  <span className="text-yellow-500">*</span> Room Code
                </label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 rounded-xl bg-gray-800/50 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all uppercase text-center text-lg tracking-wider"
                  placeholder="e.g., ABC123"
                  maxLength={6}
                  onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter the 6-digit code shared by your friend
                </p>
              </div>

              {/* JOIN ROOM Button */}
              <button
                onClick={joinRoom}
                disabled={isJoining}
                className="w-full bg-gray-800 hover:bg-gray-700 text-white font-semibold py-3 rounded-xl transition-all border border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isJoining ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Joining Room...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <FaUsers /> 🎯 Join Existing Room
                  </div>
                )}
              </button>

              {/* Help Text */}
              <div className="mt-6 p-3 bg-yellow-500/5 rounded-lg border border-yellow-500/10">
                <p className="text-xs text-gray-400 text-center">
                  💡 <span className="text-yellow-500">Create Room:</span> Just enter your name and click create<br />
                  💡 <span className="text-yellow-500">Join Room:</span> Enter both your name AND the room code
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Responsive Footer */}
      <footer className="border-t border-gray-800 mt-16 py-6">
        <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
          <p>🎬 SyncParty - Watch YouTube together in real-time</p>
        </div>
      </footer>
    </div>
  );
}

export default Landing;