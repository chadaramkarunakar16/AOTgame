/* =========================================================================
   WebRTC Peer-to-Peer Voice Chat for Multiplayer
   Streams microphone audio directly between players in the lobby and match.
   ========================================================================= */

let localStream = null;
let isMicActive = false;
let isMuted = false;
const activeCalls = new Map();
const remoteAudios = new Map();

export const VoiceChat = {
  active: () => isMicActive,
  muted: () => isMuted,

  async toggle(net) {
    if (!isMicActive) {
      return await this.start(net);
    } else {
      this.toggleMute();
      return isMicActive && !isMuted;
    }
  },

  async start(net) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (window.toast) window.toast('Microphone access is not supported in this browser', 2.5);
      return false;
    }

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      isMicActive = true;
      isMuted = false;
      this.updateUI();

      if (window.toast) window.toast('🎤 Voice Chat: Microphone Connected!', 2.0);

      // Connect to peers
      if (net && net.peer) {
        this.setupPeerVoice(net);
      }
      return true;
    } catch (err) {
      console.warn('Microphone permission denied or unavailable:', err);
      if (window.toast) window.toast('Microphone access was denied or unavailable', 2.5);
      return false;
    }
  },

  toggleMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => {
      track.enabled = !isMuted;
    });
    this.updateUI();
    if (window.toast) {
      window.toast(isMuted ? '🎤 Voice Chat: Muted' : '🎤 Voice Chat: Live', 1.5);
    }
  },

  setupPeerVoice(net) {
    if (!net || !net.peer || !localStream) return;
    const peer = net.peer;

    // Answer incoming audio calls
    peer.on('call', (call) => {
      if (call.metadata && call.metadata.type === 'voice') {
        call.answer(localStream);
        this.handleCallStream(call);
      }
    });

    // Call existing peers
    if (net.peers) {
      for (const [peerId] of net.peers) {
        this.callPeer(peer, peerId);
      }
    }
    if (!net.isHost && net.hostId && net.hostId !== net.id) {
      this.callPeer(peer, net.hostId);
    }
  },

  callPeer(peer, targetPeerId) {
    if (!peer || !targetPeerId || targetPeerId === peer.id || !localStream) return;
    if (activeCalls.has(targetPeerId)) return;

    try {
      const call = peer.call(targetPeerId, localStream, { metadata: { type: 'voice' } });
      if (call) {
        this.handleCallStream(call);
      }
    } catch (e) {
      console.warn('Failed to call peer voice:', targetPeerId, e);
    }
  },

  handleCallStream(call) {
    const peerId = call.peer;
    activeCalls.set(peerId, call);

    call.on('stream', (remoteStream) => {
      let audio = remoteAudios.get(peerId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        remoteAudios.set(peerId, audio);
      }
      audio.srcObject = remoteStream;
      audio.play().catch(() => {});
    });

    call.on('close', () => {
      this.cleanupPeer(peerId);
    });

    call.on('error', () => {
      this.cleanupPeer(peerId);
    });
  },

  cleanupPeer(peerId) {
    activeCalls.delete(peerId);
    const audio = remoteAudios.get(peerId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      remoteAudios.delete(peerId);
    }
  },

  stop() {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    for (const [peerId] of activeCalls) {
      this.cleanupPeer(peerId);
    }
    isMicActive = false;
    isMuted = false;
    this.updateUI();
  },

  updateUI() {
    const lobbyBtn = document.getElementById('lb-voice');
    const gameBtn = document.getElementById('game-voice');

    const label = !isMicActive ? '🎤 VOICE CHAT: OFF' : isMuted ? '🔇 MIC: MUTED' : '🎤 MIC: LIVE';
    const bg = !isMicActive ? '#2d4a36' : isMuted ? '#6b3030' : '#2b6b3e';
    const col = !isMicActive ? '#a8f0b0' : isMuted ? '#ffb0b0' : '#b0ffb0';

    if (lobbyBtn) {
      lobbyBtn.textContent = label;
      lobbyBtn.style.background = bg;
      lobbyBtn.style.color = col;
    }
    if (gameBtn) {
      gameBtn.textContent = label;
      gameBtn.style.background = bg;
      gameBtn.style.color = col;
    }
  }
};
