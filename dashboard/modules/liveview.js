(function () {
  const AppModules = window.AppModules || {};

  AppModules.createLiveViewModule = function createLiveViewModule() {
    let supabase = null;
    if (window.supabase && window.supabaseConfig && window.supabaseConfig.url !== "YOUR_SUPABASE_URL") {
      supabase = window.supabase.createClient(window.supabaseConfig.url, window.supabaseConfig.anonKey);
    }
    

    let channel = null;
    let peerConnection = null;
    let videoEl = null;
    let statsTimer = null;
    const TURN_WORKER_URL = (window.AppConfig && window.AppConfig.turnWorkerUrl) || "";

    async function getIceServers() {
      if (!TURN_WORKER_URL) {
        console.warn("TURN worker URL not configured — using STUN only.");
        return [{ urls: "stun:stun.l.google.com:19302" }];
      }
      try {
        const resp = await fetch(TURN_WORKER_URL);
        if (!resp.ok) throw new Error(`Worker returned ${resp.status}`);
        const data = await resp.json();
        // Cloudflare already returns this as a ready-to-use array —
        // no reshaping needed, just pass it straight to RTCPeerConnection.
        return data.iceServers;
      } catch (e) {
        console.error("Failed to fetch TURN credentials, falling back to STUN only:", e);
        return [{ urls: "stun:stun.l.google.com:19302" }];
      }
    }

    function attachVideoElement(el) {
      videoEl = el;
    }

    async function openLiveView(screenId, callbacks = {}) {
      if (!supabase) {
        console.warn("Supabase client not initialized or config is missing.");
        return;
      }

      closeLiveView(); // ensure clean state

      const iceServers = await getIceServers();
      channel = supabase.channel(`signal-${screenId}`);
      peerConnection = new RTCPeerConnection({ iceServers });

      statsTimer = setInterval(async () => {
        if (!peerConnection) return;

        try {
          const stats = await peerConnection.getStats();

          let foundInboundVideo = false;

          stats.forEach(report => {

            if (report.type === "inbound-rtp") {

              console.log(
                "INBOUND RTP:",
                "kind=", report.kind,
                "mediaType=", report.mediaType,
                "packetsReceived=", report.packetsReceived,
                "bytesReceived=", report.bytesReceived,
                "framesReceived=", report.framesReceived,
                "framesDecoded=", report.framesDecoded,
                "framesDropped=", report.framesDropped
              );

              if (
                report.kind === "video" ||
                report.mediaType === "video"
              ) {
                foundInboundVideo = true;

                console.log(
                  "========== VIDEO RTP ==========",
                  "packetsReceived=", report.packetsReceived,
                  "bytesReceived=", report.bytesReceived,
                  "framesReceived=", report.framesReceived,
                  "framesDecoded=", report.framesDecoded,
                  "framesDropped=", report.framesDropped
                );
              }
            }
          });

          if (!foundInboundVideo) {
            console.log("NO INBOUND VIDEO RTP REPORT FOUND");
          }

        } catch (e) {
          console.error("STATS ERROR:", e);
        }
      }, 2000);
      peerConnection.onconnectionstatechange = () => {
        console.log(
          "WEBRTC CONNECTION STATE:",
          peerConnection.connectionState
        );
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log(
          "WEBRTC ICE STATE:",
          peerConnection.iceConnectionState
        );
      };

      peerConnection.onsignalingstatechange = () => {
        console.log(
          "WEBRTC SIGNALING STATE:",
          peerConnection.signalingState
        );
      };

      peerConnection.onicegatheringstatechange = () => {
        console.log("WEBRTC ICE GATHERING:", peerConnection.iceGatheringState);
      };

      const viewerId = "viewer_" + Math.random().toString(36).substring(2, 10);

      let pendingCandidates = [];
      let isRemoteDescriptionSet = false;

      peerConnection.addTransceiver('video', { direction: 'recvonly' });
      // peerConnection.addTransceiver('audio', { direction: 'recvonly' }); // Uncomment if audio is needed

      peerConnection.ontrack = async (event) => {
        console.log("========== WEBRTC TRACK RECEIVED ==========");
        console.log("TRACK KIND:", event.track.kind);
        console.log("TRACK READY STATE:", event.track.readyState);
        console.log("TRACK ENABLED:", event.track.enabled);
        console.log("TRACK MUTED:", event.track.muted);
        console.log("TRACK STREAMS:", event.streams);

        if (!videoEl) {
          console.error("VIDEO ELEMENT DOES NOT EXIST");
          return;
        }

        // Do NOT depend on event.streams[0].
        // Some WebRTC implementations deliver an empty streams array.
        const stream = new MediaStream([event.track]);

        videoEl.srcObject = stream;
        videoEl.style.display = "block";

        console.log("VIDEO STREAM ATTACHED:", stream);
        console.log("VIDEO ELEMENT:", videoEl);

        videoEl.onloadedmetadata = () => {
          console.log(
            "VIDEO METADATA LOADED:",
            videoEl.videoWidth,
            "x",
            videoEl.videoHeight
          );
        };

        videoEl.onplaying = () => {
          console.log("VIDEO PLAYING");
        };

        videoEl.onwaiting = () => {
          console.log("VIDEO WAITING");
        };

        videoEl.onerror = (e) => {
          console.error("VIDEO ERROR:", e);
        };

        try {
          await videoEl.play();
          console.log("VIDEO PLAY() SUCCESS");
        } catch (e) {
          console.error("VIDEO PLAY() FAILED:", e);
        }

        if (callbacks.onConnect) {
          callbacks.onConnect();
        }
      };


      peerConnection.onicecandidate = (event) => {
        if (event.candidate && channel) {
          channel.send({
            type: "broadcast",
            event: "ice-candidate",
            payload: {
              viewerId,
              candidate: JSON.stringify(event.candidate)
            }
          });

          console.log("ICE CANDIDATE SENT:", event.candidate);
        }
      };

      channel.on("broadcast", { event: "offer" }, async (payload) => {
        try {
          if (payload.payload.viewerId && payload.payload.viewerId !== viewerId) return;
          console.log("Received offer:", payload);
          let offer = payload.payload.sdp || payload.payload.offer;
          if (typeof offer === 'string') {
            try {
              offer = JSON.parse(offer);
            } catch (e) {
              offer = { type: 'offer', sdp: offer };
            }
          }

          await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
          isRemoteDescriptionSet = true;

          // Add any queued ICE candidates
          for (const c of pendingCandidates) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(c));
          }
          pendingCandidates = [];

          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);

          channel.send({
            type: "broadcast",
            event: "answer",
            payload: { viewerId, sdp: JSON.stringify(peerConnection.localDescription) }
          });
          console.log("Sent answer");
        } catch (e) {
          console.error("Error handling offer:", e);
        }
      });

      channel.on("broadcast", { event: "ice-candidate" }, async (payload) => {
        try {
          if (payload.payload.viewerId && payload.payload.viewerId !== viewerId && payload.payload.target !== viewerId) return;

          let candidate = payload.payload.candidate;
          if (typeof candidate === 'string') {
            try { candidate = JSON.parse(candidate); } catch (e) { }
          }
          if (candidate) {
            if (isRemoteDescriptionSet) {
              await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
              pendingCandidates.push(candidate);
            }
          }
        } catch (e) {
          console.error("Error handling ICE candidate:", e);
        }
      });

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.send({
            type: "broadcast",
            event: "viewer-ready",
            payload: { viewerId }
          });

          setTimeout(() => {
            if (!isRemoteDescriptionSet && callbacks.onTimeout) {
              callbacks.onTimeout();
            }
          }, 10000);
        }
      });
    }

    function closeLiveView() {
      if (statsTimer) {
        clearInterval(statsTimer);
        statsTimer = null;
      }

      if (channel) {
        channel.unsubscribe();
        channel = null;
      }
      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }
      if (videoEl) {
        videoEl.srcObject = null;
      }
    }

    return { attachVideoElement, openLiveView, closeLiveView };
  };

  window.AppModules = AppModules;
})();
