import { useEffect, useState, useRef } from 'react';
import { ImageIcon, SendHorizonal, Video, Mic, MicOff, VideoOff, Maximize2, Minimize2, X, RefreshCw } from 'lucide-react';
import useAuth from '../hooks/useAuth';
import { useParams } from 'react-router-dom';
import API from '../api/api';
import { socket } from '../utils/socket';
import useWebRTC from '../hooks/useWebRTC';
import { motion, AnimatePresence } from 'framer-motion';
import React, { Component } from 'react';
import { getPendingCall } from '../context/CallContext';

// ErrorBoundary Component
class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-red-500 text-center p-5">
          Something went wrong with the video call. Please try again.
        </div>
      );
    }
    return this.props.children;
  }
}

// Message List Component
const MessageList = ({ messages, user }) => {
  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <AnimatePresence>
        {messages.map((message, index) => (
          <motion.div
            key={message._id || index}
            className={`flex flex-col ${message.sender === user._id ? 'items-end' : 'items-start'}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <div
              className={`p-3 text-sm max-w-sm rounded-lg shadow-md ${
                message.sender === user._id ? 'bg-blue-100 text-slate-700 rounded-br-none' : 'bg-indigo-100 text-slate-700 rounded-bl-none'
              }`}
            >
              {message.message_type === 'image' && (
                <img src={message.media_url} className="w-full max-w-sm rounded-lg mb-2" alt="Message media" />
              )}
              <p>{message.text}</p>
              <span className="text-xs text-gray-400 mt-1 block">
                {new Date(message.createdAt).toLocaleTimeString()}
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

// Chat Input Component
const ChatInput = ({ text, setText, image, setImage, sendMessage }) => (
  <div className="px-4 mb-5">
    <div className="flex items-center gap-3 p-2 bg-white w-full max-w-xl mx-auto border border-gray-200 shadow rounded-full">
      <input
        type="text"
        className="flex-1 outline-none text-slate-700"
        placeholder="Type a message..."
        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
        onChange={(e) => setText(e.target.value)}
        value={text}
        aria-label="Type a message"
      />
      <label htmlFor="image" className="cursor-pointer">
        {image ? (
          <img src={URL.createObjectURL(image)} alt="Preview" className="h-8 rounded" />
        ) : (
          <ImageIcon className="size-7 text-gray-400" />
        )}
        <input
          type="file"
          id="image"
          accept="image/*"
          hidden
          onChange={(e) => setImage(e.target.files[0])}
        />
      </label>
      <button
        onClick={sendMessage}
        className="bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-700 hover:to-purple-800 active:scale-95 text-white p-2 rounded-full"
        aria-label="Send message"
      >
        <SendHorizonal size={18} />
      </button>
    </div>
  </div>
);

const ChatBox = () => {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [image, setImage] = useState(null);
  const [receiver, setReceiver] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showIncomingCallModal, setShowIncomingCallModal] = useState(false);
  const { user } = useAuth();
  const { userId } = useParams();
  const messageEndRef = useRef(null);
  const hasAcceptedCallRef = useRef(false);

  // WebRTC hook
  const {
    localVideoRef,
    remoteVideoRefs,
    startVideoCall,
    endVideoCall,
    acceptCall,
    isVideoCallActive,
    callStatus,
    incomingCall,
    toggleMic,
    toggleCamera,
    isMicOn,
    isCameraOn,
    toggleFullScreen,
    isFullScreen,
    localStream,
    remoteStreams,
  } = useWebRTC(user?._id, userId);

  // Handle incoming call in ChatBox
  useEffect(() => {
    if (incomingCall && incomingCall.from === userId) {
      console.log('📞 Incoming call modal shown in ChatBox');
      setShowIncomingCallModal(true);
    } else {
      setShowIncomingCallModal(false);
    }
  }, [incomingCall, userId]);

  // Check for pending call from global modal - only once
  useEffect(() => {
    if (hasAcceptedCallRef.current) return;

    const pendingCall = getPendingCall();
    if (pendingCall) {
      console.log('🔔 Found pending call, accepting:', pendingCall);
      
      // Only accept if it's for this chat
      if (pendingCall.from === userId || !pendingCall.groupId) {
        hasAcceptedCallRef.current = true;
        // Small delay to ensure component is ready
        setTimeout(() => {
          acceptCall(pendingCall);
        }, 100);
      }
    }
  }, [userId, acceptCall]);

  // Assign local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log('📹 Assigning local stream');
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.play().catch(e => console.error('Local play error:', e));
      }
    }
  }, [localStream]);

  // Assign remote streams to video elements
  useEffect(() => {
    Object.entries(remoteStreams).forEach(([remoteUserId, stream]) => {
      const ref = remoteVideoRefs.current[remoteUserId];
      if (ref?.current && stream) {
        console.log(`📹 Assigning remote stream for ${remoteUserId}`);
        if (ref.current.srcObject !== stream) {
          ref.current.srcObject = stream;
          ref.current.play().catch(e => console.error(`Remote play error for ${remoteUserId}:`, e));
        }
      }
    });
  }, [remoteStreams, remoteVideoRefs]);

  // Fetch receiver data
  const fetchReceiver = async () => {
    try {
      setIsLoading(true);
      const { data } = await API.get(`/users/${userId}`, { withCredentials: true });
      setReceiver(data.user);
    } catch (error) {
      setError('Failed to load user data.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch messages
  const fetchMessages = async () => {
    try {
      setIsLoading(true);
      const { data } = await API.get(`/message/${userId}`, { withCredentials: true });
      setMessages(data.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
    } catch (error) {
      setError('Failed to load messages.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Send message with optimistic update
  const sendMessage = async () => {
    if (!text && !image) return;
    const tempMessage = {
      _id: Date.now(),
      sender: user._id,
      receiver: userId,
      text,
      message_type: image ? 'image' : 'text',
      media_url: image ? URL.createObjectURL(image) : null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMessage]);
    setText('');
    setImage(null);

    const formData = new FormData();
    formData.append('sender', user._id);
    formData.append('text', text);
    formData.append('message_type', image ? 'image' : 'text');
    if (image) {
      formData.append('image', image);
    }

    try {
      const { data } = await API.post(`/message/send/${userId}`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessages((prev) => prev.map((msg) => (msg._id === tempMessage._id ? data.data : msg)));
    } catch (error) {
      setError('Failed to send message.');
      setMessages((prev) => prev.filter((msg) => msg._id !== tempMessage._id));
      console.error(error);
    }
  };

  // Socket.IO message handling
  useEffect(() => {
    if (user) {
      socket.connect();
      socket.emit('register', user._id);
      socket.on('receive-message', (message) => {
        if (
          (message.sender === user._id && message.receiver === userId) ||
          (message.sender === userId && message.receiver === user._id)
        ) {
          setMessages((prev) => [...prev, message].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
        }
      });
      return () => {
        socket.off('receive-message');
        socket.disconnect();
      };
    }
  }, [user, userId]);

  // Scroll to latest message
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch initial data
  useEffect(() => {
    fetchReceiver();
    fetchMessages();
  }, [userId]);

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen text-gray-600">Loading...</div>;
  }

  if (error) {
    return <div className="text-red-500 text-center p-5">{error}</div>;
  }

  if (!receiver) {
    return <div className="text-gray-500 text-center p-5">User not found.</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 md:px-10 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-gray-200 shadow-sm">
        <img
          src={receiver.profilePics || 'https://via.placeholder.com/32'}
          alt={receiver.fullname}
          className="size-10 rounded-full"
        />
        <div className="flex-1">
          <p className="font-semibold text-lg">{receiver.fullname}</p>
          <p className="text-sm text-gray-500">@{receiver.fullname}</p>
        </div>
        <button
          onClick={isVideoCallActive ? endVideoCall : startVideoCall}
          className="p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition disabled:opacity-50"
          aria-label={isVideoCallActive ? 'End video call' : 'Start video call'}
          disabled={callStatus.includes('progress')}
        >
          <Video size={20} />
        </button>
      </div>

      {/* Call Status */}
      <AnimatePresence>
        {callStatus && (
          <motion.div
            className="p-2 text-center text-sm text-gray-600 bg-gray-100"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {callStatus}
            {callStatus.includes('Failed') && (
              <button
                onClick={startVideoCall}
                className="ml-2 p-1 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition"
                aria-label="Retry call"
              >
                <RefreshCw size={16} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Incoming Call Modal in ChatBox */}
      <AnimatePresence>
        {showIncomingCallModal && incomingCall && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[9999] p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl shadow-2xl p-8 max-w-sm w-full"
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 50 }}
            >
              <div className="text-center mb-6">
                <div className="flex justify-center mb-4">
                  <motion.div
                    className="bg-white rounded-full p-6"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    <Video className="w-12 h-12 text-blue-600" />
                  </motion.div>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Incoming Video Call
                </h2>
                <p className="text-white/90">
                  {receiver?.fullname || 'Someone'} is calling you...
                </p>
              </div>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => {
                    console.log('❌ Call rejected from ChatBox');
                    socket.emit('call-rejected', {
                      to: incomingCall.from,
                      callId: incomingCall.callId,
                      groupId: incomingCall.groupId,
                    });
                    setShowIncomingCallModal(false);
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition"
                >
                  <X size={20} />
                  Decline
                </button>
                <button
                  onClick={() => {
                    console.log('✅ Call accepted from ChatBox');
                    setShowIncomingCallModal(false);
                    acceptCall(incomingCall);
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition"
                >
                  <Video size={20} />
                  Accept
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video Call UI */}
      <AnimatePresence>
        {isVideoCallActive && (
          <ErrorBoundary>
            <motion.div
              id="video-call-container"
              className={`p-5 flex flex-col md:flex-row gap-4 justify-center bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg shadow-lg ${
                isFullScreen ? 'fixed inset-0 z-50' : 'relative z-10'
              }`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
            >
              {/* Local Video */}
              <div className="relative">
                <h3 className="text-sm font-medium mb-2 text-white">You</h3>
                <div className="relative w-full md:w-64 h-48 md:h-auto rounded-lg overflow-hidden bg-gray-800">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover rounded-lg shadow-xl"
                  />
                  {!isCameraOn && (
                    <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                      <VideoOff className="text-white" size={32} />
                    </div>
                  )}
                </div>
              </div>

              {/* Remote Videos */}
              {Object.entries(remoteStreams).map(([remoteUserId]) => (
                <div key={remoteUserId} className="relative">
                  <h3 className="text-sm font-medium mb-2 text-white">
                    {remoteUserId === userId ? receiver.fullname : remoteUserId.substring(0, 8) + '...'}
                  </h3>
                  <div className="relative w-full md:w-64 h-48 md:h-auto rounded-lg overflow-hidden bg-gray-800">
                    <video
                      ref={(el) => {
                        if (el && remoteVideoRefs.current[remoteUserId]) {
                          remoteVideoRefs.current[remoteUserId].current = el;
                        }
                      }}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover rounded-lg shadow-xl"
                    />
                  </div>
                </div>
              ))}

              {/* Control Buttons */}
              <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 flex gap-3">
                <button
                  onClick={toggleMic}
                  className={`p-3 rounded-full ${isMicOn ? 'bg-gray-700' : 'bg-red-500'} text-white hover:opacity-80 transition shadow-lg`}
                  aria-label={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
                >
                  {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
                </button>
                <button
                  onClick={toggleCamera}
                  className={`p-3 rounded-full ${isCameraOn ? 'bg-gray-700' : 'bg-red-500'} text-white hover:opacity-80 transition shadow-lg`}
                  aria-label={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
                >
                  {isCameraOn ? <Video size={20} /> : <VideoOff size={20} />}
                </button>
                <button
                  onClick={toggleFullScreen}
                  className="p-3 rounded-full bg-gray-700 text-white hover:bg-gray-600 transition shadow-lg"
                  aria-label={isFullScreen ? 'Exit full screen' : 'Enter full screen'}
                >
                  {isFullScreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                </button>
                <button
                  onClick={endVideoCall}
                  className="p-3 rounded-full bg-red-500 text-white hover:bg-red-600 transition shadow-lg"
                  aria-label="End call"
                >
                  <X size={20} />
                </button>
              </div>
            </motion.div>
          </ErrorBoundary>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 p-5 md:px-10 overflow-y-auto">
        <MessageList messages={messages} user={user} />
        <div ref={messageEndRef} />
      </div>

      {/* Chat Input */}
      <ChatInput text={text} setText={setText} image={image} setImage={setImage} sendMessage={sendMessage} />
    </div>
  );
};

export default ChatBox;