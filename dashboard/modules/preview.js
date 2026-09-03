(function () {
  const AppModules = window.AppModules || {};

  AppModules.createPreviewModule = function createPreviewModule({ db }) {
    let unsubscribe = null;
    let modalEl = null;

    function getTimestampMs(ts) {
      if (!ts) return 0;
      if (typeof ts.toMillis === "function") return ts.toMillis();
      if (typeof ts.toDate === "function") return ts.toDate().getTime();
      if (typeof ts === "number") return ts;
      if (ts.seconds) return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1000000);
      if (ts instanceof Date) return ts.getTime();
      if (typeof ts === "string") {
        const parsed = Date.parse(ts);
        return isNaN(parsed) ? 0 : parsed;
      }
      return 0;
    }

    function ensureModal() {
      if (modalEl) return modalEl;

      modalEl = document.createElement("div");
      modalEl.id = "previewModal";
      modalEl.style.cssText =
        "position:fixed;inset:0;background:rgba(17,24,39,0.55);" +
        "display:none;align-items:center;justify-content:center;z-index:2000;";

      modalEl.innerHTML = `
        <div style="background:#fff;border-radius:12px;width:min(720px,92vw);max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.25);font-family:system-ui,-apple-system,sans-serif;">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #f3f4f6;">
            <div>
              <div id="previewScreenName" style="font-weight:600;font-size:15px;color:#111827;">Live View</div>
              <div id="previewStatus" style="font-size:12px;color:#6b7280;margin-top:2px;"></div>
            </div>
            <button id="previewCloseBtn" style="border:none;background:none;font-size:20px;color:#6b7280;cursor:pointer;line-height:1;">&times;</button>
          </div>
          <div id="cameraBody" style="padding:16px 20px; text-align:center;">
             <div id="liveCameraStatus" style="font-size:13px; color:#6b7280; margin-bottom:8px;">Connecting to screen...</div>
             <video id="liveCameraVideo" autoplay playsinline muted style="width:100%; border-radius:8px; background:#000; aspect-ratio:16/9; display:none;"></video>
             <div style="font-size:11px;color:#9ca3af;margin-top:14px;line-height:1.5;">
               This is the literal on-device camera feed via WebRTC, subject to normal connection latency. It is only available while the screen's LiveView service has a camera attached and the screen is online.
             </div>
          </div>
        </div>
      `;

      document.body.appendChild(modalEl);
      modalEl.querySelector("#previewCloseBtn").addEventListener("click", close);
      modalEl.addEventListener("click", (e) => { if (e.target === modalEl) close(); });

      return modalEl;
    }

    function open(screenId) {
      const modal = ensureModal();
      modal.dataset.screenId = screenId;
      modal.style.display = "flex";
      
      const statusText = modal.querySelector("#liveCameraStatus");
      const videoNode = modal.querySelector("#liveCameraVideo");
      
      statusText.textContent = "Connecting to screen...";
      statusText.style.display = "block";
      videoNode.style.display = "none";
      
      if (unsubscribe) unsubscribe();
      unsubscribe = db.collection("screens").doc(screenId).onSnapshot((doc) => {
        if (doc.exists) {
           const s = doc.data();
           modal.querySelector("#previewScreenName").textContent = s.name || "(unnamed - " + screenId + ")";
           const lastSeenMs = getTimestampMs(s.lastSeen);
           const diff = Date.now() - lastSeenMs;
           const isOnline = lastSeenMs > 0 && diff >= -30000 && diff < 240000;
           modal.querySelector("#previewStatus").innerHTML = `
             <span style="display:inline-flex;align-items:center;gap:4px;">
               <span style="width:7px;height:7px;border-radius:50%;background:${isOnline ? "#1fa971" : "#f59e0b"};display:inline-block;"></span>
               ${isOnline ? "Online" : "Offline"}
             </span>
           `;
        }
      });
      
      if (window.attachLiveViewVideo && window.openLiveView) {
        window.attachLiveViewVideo(videoNode);
        window.openLiveView(screenId, {
           onConnect: () => {
             statusText.style.display = "none";
             videoNode.style.display = "block";
           },
           onTimeout: () => {
             statusText.textContent = "Live view unavailable for this screen.";
           }
        });
      } else {
        statusText.textContent = "Live view module not loaded.";
      }
    }

    function close() {
      if (modalEl) modalEl.style.display = "none";
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      if (window.closeLiveView) window.closeLiveView();
    }

    return { open, close };
  };

  window.AppModules = AppModules;
})();