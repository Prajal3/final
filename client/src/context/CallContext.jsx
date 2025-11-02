import React, { createContext, useContext, useEffect, useState } from 'react';
import { socket } from '../utils/socket';
import { Video, X } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const CallContext = createContext();

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within CallProvider');
  }
  return context;
};

// Store pending call in memory instead of sessionStorage
let pendingCallData = null;

export const getPendingCall = () => {
  const data = pendingCallData;
  pendingCallData = null; // Clear after reading
  return data;
};

export const CallProvider = ({ children }) => {
  const [incomingCall, setIncomingCall] = useState(null);
  const [isRinging, setIsRinging] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const processingCallRef = React.useRef(false);

  useEffect(() => {
    // Global listener for incoming calls
    const handleIncomingCall = ({ from, offer, callId, groupId }) => {
      console.log('🔔 Global incoming call from:', from, 'groupId:', groupId);
      
      // Prevent duplicate call processing
      if (processingCallRef.current) {
        console.log('⚠️ Already processing a call, ignoring duplicate');
        return;
      }
      
      // Check if user is on the chat page for this call
      const currentPath = location.pathname;
      const isOnCallPage = groupId 
        ? currentPath === `/messages/group/${groupId}`
        : currentPath === `/messages/${from}`;

      console.log('📍 Current path:', currentPath, 'isOnCallPage:', isOnCallPage);

      // Only show global modal if NOT on the call page
      // The ChatBox will handle showing its own modal
      if (!isOnCallPage) {
        processingCallRef.current = true;
        setIncomingCall({ from, offer, callId, groupId });
        setIsRinging(true);
        
        // Clear processing flag after a delay
        setTimeout(() => {
          processingCallRef.current = false;
        }, 1000);
      } else {
        console.log('✅ User is on call page, ChatBox will handle the call');
      }
    };

    const handleCallRejected = ({ callId }) => {
      console.log('📞 Call rejected:', callId);
      if (incomingCall?.callId === callId) {
        setIncomingCall(null);
        setIsRinging(false);
        processingCallRef.current = false;
      }
    };

    const handleEndCall = ({ callId }) => {
      console.log('📴 Call ended:', callId);
      if (incomingCall?.callId === callId) {
        setIncomingCall(null);
        setIsRinging(false);
        processingCallRef.current = false;
      }
    };

    socket.on('incoming-call', handleIncomingCall);
    socket.on('call-rejected', handleCallRejected);
    socket.on('end-call', handleEndCall);

    return () => {
      socket.off('incoming-call', handleIncomingCall);
      socket.off('call-rejected', handleCallRejected);
      socket.off('end-call', handleEndCall);
    };
  }, [location.pathname, incomingCall]);

  const acceptCall = () => {
    if (incomingCall) {
      const { from, groupId } = incomingCall;
      setIsRinging(false);
      processingCallRef.current = false;
      
      // Navigate to appropriate chat page with call data
      const targetPath = groupId 
        ? `/messages/group/${groupId}`
        : `/messages/${from}`;
      
      // Store call data in memory for the target page
      pendingCallData = incomingCall;
      
      navigate(targetPath);
      setIncomingCall(null);
    }
  };

  const rejectCall = () => {
    if (incomingCall) {
      socket.emit('call-rejected', {
        to: incomingCall.from,
        callId: incomingCall.callId,
        groupId: incomingCall.groupId,
      });
      setIncomingCall(null);
      setIsRinging(false);
      processingCallRef.current = false;
    }
  };

  return (
    <CallContext.Provider value={{ incomingCall, acceptCall, rejectCall }}>
      {children}
      
      {/* Global Incoming Call Modal */}
      <AnimatePresence>
        {incomingCall && isRinging && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[9999] p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 relative overflow-hidden"
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 50 }}
              transition={{ duration: 0.3, type: 'spring' }}
            >
              {/* Animated background */}
              <div className="absolute inset-0 opacity-20">
                <motion.div
                  className="absolute inset-0 bg-white"
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.5, 0.3],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  style={{
                    borderRadius: '50%',
                    filter: 'blur(40px)',
                  }}
                />
              </div>

              {/* Content */}
              <div className="relative z-10">
                {/* Call Animation */}
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <motion.div
                      className="absolute inset-0 bg-white rounded-full"
                      animate={{
                        scale: [1, 1.3, 1],
                        opacity: [0.6, 0, 0.6],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                    <motion.div
                      className="relative bg-white rounded-full p-6 shadow-xl"
                      animate={{
                        rotate: [0, 10, -10, 0],
                      }}
                      transition={{
                        duration: 0.5,
                        repeat: Infinity,
                        repeatDelay: 1,
                      }}
                    >
                      <Video className="w-12 h-12 text-blue-600" />
                    </motion.div>
                  </div>
                </div>

                {/* Caller Info */}
                <div className="text-center mb-8">
                  <motion.h2
                    className="text-2xl font-bold text-white mb-2"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    {incomingCall.groupId ? 'Group Video Call' : 'Incoming Video Call'}
                  </motion.h2>
                  <motion.p
                    className="text-white/90 text-sm"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    {incomingCall.groupId 
                      ? 'Someone is calling the group' 
                      : 'Incoming call...'}
                  </motion.p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 justify-center">
                  <motion.button
                    onClick={rejectCall}
                    className="flex items-center justify-center gap-2 px-8 py-4 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95 font-medium"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <X className="w-5 h-5" />
                    Decline
                  </motion.button>
                  <motion.button
                    onClick={acceptCall}
                    className="flex items-center justify-center gap-2 px-8 py-4 bg-green-500 text-white rounded-full hover:bg-green-600 transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95 font-medium"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    animate={{
                      boxShadow: [
                        '0 0 0 0 rgba(34, 197, 94, 0.7)',
                        '0 0 0 10px rgba(34, 197, 94, 0)',
                      ],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                    }}
                  >
                    <Video className="w-5 h-5" />
                    Accept
                  </motion.button>
                </div>

                {/* Ringtone indicator */}
                <motion.p
                  className="text-center text-sm text-white/80 mt-6 flex items-center justify-center gap-2"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <span className="inline-block">🔔</span>
                  Ringing...
                </motion.p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </CallContext.Provider>
  );
};