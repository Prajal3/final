import { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '../utils/socket';

const useWebRTC = (userId, targetId, isGroupCall = false, groupMembers = []) => {
  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef({});
  const peerConnectionsRef = useRef({});
  const localStreamRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState('');
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const activeCallIdRef = useRef(null);
  const pendingCandidatesRef = useRef({});
  const isInitiatorRef = useRef(false);
  const cleanupInProgressRef = useRef(false);

  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 10,
  };

  // Initialize remote video refs
  useEffect(() => {
    const targets = isGroupCall
      ? groupMembers.filter(m => m._id !== userId).map(m => m._id)
      : [targetId].filter(Boolean);

    const newRefs = {};
    targets.forEach(id => {
      if (!remoteVideoRefs.current[id]) {
        newRefs[id] = { current: null };
      } else {
        newRefs[id] = remoteVideoRefs.current[id];
      }
    });
    remoteVideoRefs.current = newRefs;
  }, [userId, targetId, isGroupCall, groupMembers]);

  // Create peer connection
  const createPeerConnection = useCallback((remoteUserId) => {
    if (peerConnectionsRef.current[remoteUserId]) {
      console.log(`Peer connection already exists for ${remoteUserId}`);
      return peerConnectionsRef.current[remoteUserId];
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    
    pc.onicecandidate = (event) => {
      if (event.candidate && activeCallIdRef.current) {
        console.log(`Sending ICE candidate to ${remoteUserId}`);
        socket.emit('peer-negotiation-needed', {
          to: remoteUserId,
          candidate: event.candidate.toJSON(),
          callId: activeCallIdRef.current,
          groupId: isGroupCall ? targetId : null,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log(`Received track from ${remoteUserId}:`, event.streams[0]);
      const [stream] = event.streams;
      if (stream && stream.active) {
        setRemoteStreams(prev => {
          if (prev[remoteUserId]?.id === stream.id) {
            console.log(`Duplicate stream ignored for ${remoteUserId}`);
            return prev;
          }
          return { ...prev, [remoteUserId]: stream };
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE state for ${remoteUserId}: ${pc.iceConnectionState}`);
      
      if (pc.iceConnectionState === 'connected') {
        setCallStatus('Connected');
      } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        setCallStatus(`Connection issue with ${remoteUserId}`);
        
        // Attempt ICE restart
        if (pc.iceConnectionState === 'failed') {
          console.log(`ICE restart for ${remoteUserId}`);
          pc.restartIce();
        }
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state for ${remoteUserId}: ${pc.connectionState}`);
      
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupPeerConnection(remoteUserId);
      }
    };

    peerConnectionsRef.current[remoteUserId] = pc;
    pendingCandidatesRef.current[remoteUserId] = [];
    
    return pc;
  }, [isGroupCall, targetId]);

  // Process pending ICE candidates
  const processPendingCandidates = useCallback(async (remoteUserId) => {
    const pc = peerConnectionsRef.current[remoteUserId];
    const candidates = pendingCandidatesRef.current[remoteUserId] || [];

    if (!pc || pc.signalingState === 'closed') {
      console.log(`Cannot process candidates for ${remoteUserId}: invalid state`);
      return;
    }

    while (candidates.length > 0) {
      const candidate = candidates.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log(`Added queued candidate for ${remoteUserId}`);
      } catch (error) {
        console.error(`Error adding candidate for ${remoteUserId}:`, error);
      }
    }
  }, []);

  // Get user media
  const getUserMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error('getUserMedia error:', error);
      throw error;
    }
  };

  // Start video call
  const startVideoCall = async () => {
    if (isVideoCallActive || cleanupInProgressRef.current) {
      console.log('Call already active or cleanup in progress');
      return;
    }

    try {
      setCallStatus('Starting call...');
      isInitiatorRef.current = true;
      
      const stream = await getUserMedia();
      setIsVideoCallActive(true);
      activeCallIdRef.current = Date.now().toString();

      const targets = isGroupCall
        ? groupMembers.filter(m => m._id !== userId).map(m => m._id)
        : [targetId];

      for (const remoteUserId of targets) {
        const pc = createPeerConnection(remoteUserId);
        
        // Add tracks
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });

        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit('user-call', {
          to: remoteUserId,
          offer: offer,
          groupId: isGroupCall ? targetId : null,
        });
      }

      setCallStatus('Calling...');
    } catch (error) {
      console.error('Start call error:', error);
      setCallStatus('Failed to start call: ' + error.message);
      endVideoCall();
    }
  };

  // Accept call
  const acceptCall = async ({ from, offer, callId, groupId }) => {
    if (isVideoCallActive || cleanupInProgressRef.current) {
      console.log('Already in call');
      return;
    }

    try {
      setCallStatus('Accepting call...');
      isInitiatorRef.current = false;
      activeCallIdRef.current = callId;

      const stream = await getUserMedia();
      setIsVideoCallActive(true);

      const pc = createPeerConnection(from);
      
      // Add tracks
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Set remote description and create answer
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await processPendingCandidates(from);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('call-accepted', {
        to: from,
        answer: answer,
        callId: callId,
        groupId: groupId,
      });

      setCallStatus('Connected');
      setIncomingCall(null);
    } catch (error) {
      console.error('Accept call error:', error);
      setCallStatus('Failed to accept call: ' + error.message);
      endVideoCall();
    }
  };

  // Reject call
  const rejectCall = useCallback((callId) => {
    if (incomingCall) {
      socket.emit('call-rejected', {
        to: incomingCall.from,
        callId: callId || incomingCall.callId,
        groupId: incomingCall.groupId,
      });
      setIncomingCall(null);
      setCallStatus('');
    }
  }, [incomingCall]);

  // Cleanup peer connection
  const cleanupPeerConnection = useCallback((remoteUserId) => {
    const pc = peerConnectionsRef.current[remoteUserId];
    if (pc) {
      pc.close();
      delete peerConnectionsRef.current[remoteUserId];
    }
    
    setRemoteStreams(prev => {
      const newStreams = { ...prev };
      delete newStreams[remoteUserId];
      return newStreams;
    });
    
    delete pendingCandidatesRef.current[remoteUserId];
  }, []);

  // End video call
  const endVideoCall = useCallback(() => {
    if (cleanupInProgressRef.current) {
      console.log('Cleanup already in progress, skipping...');
      return;
    }
    
    cleanupInProgressRef.current = true;
    console.log('Ending call...');

    // Emit end-call FIRST if we're in an active call
    if (activeCallIdRef.current && isVideoCallActive) {
      const targets = isGroupCall
        ? groupMembers.filter(m => m._id !== userId).map(m => m._id)
        : [targetId].filter(Boolean);

      targets.forEach(to => {
        socket.emit('end-call', {
          to,
          callId: activeCallIdRef.current,
          groupId: isGroupCall ? targetId : null,
        });
      });
    }

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped track:', track.kind);
      });
      localStreamRef.current = null;
    }

    // Close all peer connections
    Object.keys(peerConnectionsRef.current).forEach(remoteUserId => {
      cleanupPeerConnection(remoteUserId);
    });

    // Reset state
    setLocalStream(null);
    setRemoteStreams({});
    setIsVideoCallActive(false);
    setIncomingCall(null);
    setCallStatus('');
    activeCallIdRef.current = null;
    isInitiatorRef.current = false;
    pendingCandidatesRef.current = {};
    
    setTimeout(() => {
      cleanupInProgressRef.current = false;
    }, 100);
  }, [isGroupCall, targetId, userId, groupMembers, isVideoCallActive, cleanupPeerConnection]);

  // Toggle mic
  const toggleMic = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMicOn(prev => !prev);
    }
  }, []);

  // Toggle camera
  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsCameraOn(prev => !prev);
    }
  }, []);

  // Toggle fullscreen
  const toggleFullScreen = useCallback(() => {
    const element = document.getElementById('video-call-container');
    if (!element) return;

    if (!isFullScreen) {
      element.requestFullscreen?.() || element.webkitRequestFullscreen?.();
    } else {
      document.exitFullscreen?.() || document.webkitExitFullscreen?.();
    }
    setIsFullScreen(prev => !prev);
  }, [isFullScreen]);

  // Socket event handlers
  useEffect(() => {
    if (!userId) return;

    const handleIncomingCall = ({ from, offer, callId, groupId }) => {
      console.log('Incoming call from:', from);
      if (!isVideoCallActive && !cleanupInProgressRef.current) {
        setIncomingCall({ from, offer, callId, groupId });
        setCallStatus('Incoming call...');
      } else {
        socket.emit('call-rejected', { to: from, callId, groupId });
      }
    };

    const handleCallAccepted = async ({ answer, callId, from, groupId }) => {
      console.log('Call accepted by:', from);
      const pc = peerConnectionsRef.current[from];
      
      if (!pc || pc.signalingState === 'closed') {
        console.error('Invalid peer connection state');
        return;
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await processPendingCandidates(from);
        setCallStatus('Connected');
      } catch (error) {
        console.error('Error handling call accepted:', error);
        endVideoCall();
      }
    };

    const handleCallRejected = ({ callId }) => {
      console.log('Call rejected');
      setCallStatus('Call rejected');
      endVideoCall();
    };

    const handlePeerNegotiation = ({ candidate, from }) => {
      if (!candidate) return;
      
      const pc = peerConnectionsRef.current[from];
      
      if (pc && pc.remoteDescription) {
        pc.addIceCandidate(new RTCIceCandidate(candidate))
          .then(() => console.log(`Added ICE candidate from ${from}`))
          .catch(err => console.error('Error adding ICE candidate:', err));
      } else {
        if (!pendingCandidatesRef.current[from]) {
          pendingCandidatesRef.current[from] = [];
        }
        pendingCandidatesRef.current[from].push(candidate);
        console.log(`Queued ICE candidate from ${from}`);
      }
    };

    const handleEndCall = ({ callId }) => {
      console.log('Call ended by remote');
      setCallStatus('Call ended');
      endVideoCall();
    };

    const handleUserOffline = ({ userId: offlineUserId }) => {
      console.log('User offline:', offlineUserId);
      cleanupPeerConnection(offlineUserId);
    };

    socket.on('incoming-call', handleIncomingCall);
    socket.on('call-accepted', handleCallAccepted);
    socket.on('call-rejected', handleCallRejected);
    socket.on('peer-negotiation-needed', handlePeerNegotiation);
    socket.on('end-call', handleEndCall);
    socket.on('user-offline', handleUserOffline);

    return () => {
      socket.off('incoming-call', handleIncomingCall);
      socket.off('call-accepted', handleCallAccepted);
      socket.off('call-rejected', handleCallRejected);
      socket.off('peer-negotiation-needed', handlePeerNegotiation);
      socket.off('end-call', handleEndCall);
      socket.off('user-offline', handleUserOffline);
    };
  }, [userId, isVideoCallActive, processPendingCandidates, endVideoCall, cleanupPeerConnection]);

  // Assign local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.play().catch(e => console.error('Local video play error:', e));
      }
    }
  }, [localStream]);

  // Assign remote streams to video elements
  useEffect(() => {
    Object.entries(remoteStreams).forEach(([remoteUserId, stream]) => {
      const ref = remoteVideoRefs.current[remoteUserId];
      if (ref?.current && stream) {
        if (ref.current.srcObject !== stream) {
          ref.current.srcObject = stream;
          ref.current.play().catch(e => console.error(`Remote video play error for ${remoteUserId}:`, e));
        }
      }
    });
  }, [remoteStreams]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endVideoCall();
    };
  }, [endVideoCall]);

  return {
    localVideoRef,
    remoteVideoRefs,
    startVideoCall,
    endVideoCall,
    acceptCall,
    rejectCall,
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
  };
};

export default useWebRTC;