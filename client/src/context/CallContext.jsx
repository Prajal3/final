import React, { createContext, useContext, useEffect, useState } from 'react';
import { socket } from '../utils/socket';
import { Phone, Video, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const CallContext = createContext();

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within CallProvider');
  }
  return context;
};

export const CallProvider = ({ children }) => {
  const [incomingCall, setIncomingCall] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for incoming calls globally
    socket.on('incoming-call', ({ from, offer, callId, groupId }) => {
      console.log('Incoming call received from:', from);
      setIncomingCall({ from, offer, callId, groupId });
    });

    socket.on('call-rejected', ({ callId }) => {
      console.log('Call rejected:', callId);
      setIncomingCall(null);
    });

    socket.on('end-call', ({ callId }) => {
      console.log('Call ended:', callId);
      setIncomingCall(null);
    });

    return () => {
      socket.off('incoming-call');
      socket.off('call-rejected');
      socket.off('end-call');
    };
  }, []);

  const acceptCall = () => {
    if (incomingCall) {
      const { from, groupId } = incomingCall;
      // Navigate to the chat page with call info
      if (groupId) {
        navigate(`/messages/group/${groupId}`, { 
          state: { acceptCall: true, incomingCall } 
        });
      } else {
        navigate(`/messages/${from}`, { 
          state: { acceptCall: true, incomingCall } 
        });
      }
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
    }
  };

  return (
    <CallContext.Provider value={{ incomingCall, acceptCall, rejectCall }}>
      {children}
      
      {/* Global Incoming Call Modal */}
      <AnimatePresence>
        {incomingCall && (
          <motion.div
            className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[9999]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4"
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 50 }}
              transition={{ duration: 0.3 }}
            >
              {/* Call Animation */}
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-75"></div>
                  <div className="relative bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full p-6">
                    <Video className="w-12 h-12 text-white" />
                  </div>
                </div>
              </div>

              {/* Caller Info */}
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {incomingCall.groupId ? 'Group Video Call' : 'Incoming Video Call'}
                </h2>
                <p className="text-gray-600">
                  {incomingCall.groupId 
                    ? 'Someone is calling the group' 
                    : `User ${incomingCall.from.slice(0, 8)}... is calling`}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 justify-center">
                <button
                  onClick={rejectCall}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95"
                >
                  <X className="w-5 h-5" />
                  Decline
                </button>
                <button
                  onClick={acceptCall}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95"
                >
                  <Video className="w-5 h-5" />
                  Accept
                </button>
              </div>

              {/* Ringtone hint */}
              <p className="text-center text-sm text-gray-500 mt-4">
                🔔 Ringing...
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </CallContext.Provider>
  );
};