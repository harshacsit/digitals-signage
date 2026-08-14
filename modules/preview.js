(function () {
  const AppModules = window.AppModules || {};

  AppModules.createPreviewModule = function createPreviewModule({ db }) {
    let unsubscribe = null;
    let modalEl = null;

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
              <div id="previewScreenName" style="font-weight:600;font-size:15px;color:#111827;">Preview</div>
              <div id="previewStatus" style="font-size:12px;color:#6b7280;margin-top:2px;"></div>
            </div>
            <button id="previewCloseBtn" style="border:none;background:none;font-size:20px;color:#6b7280;cursor:pointer;line-height:1;">&times;</button>
          </div>
          <div id="previewBody" style="padding:16px 20px;"></div>
        </div>
      `;

      document.body.appendChild(modalEl);
      modalEl.querySelector("#previewCloseBtn").addEventListener("click", close);
      modalEl.addEventListener("click", (e) => { if (e.target === modalEl) close(); });
      return modalEl;
    }

    function extractYoutubeId(url) {
      const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/live\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
      return m ? m[1] : null;
    }

    function renderContent(container, type, url) {
      if (!url) {
        container.innerHTML = `<div style="color:#9ca3af;font-size:13px;padding:24px;text-align:center;">Nothing confirmed yet</div>`;
        return;
      }
      const youtubeId = extractYoutubeId(url);
      const safeUrl = url.replace(/"/g, "&quot;");

      if (youtubeId) {
        container.innerHTML = `<iframe src="https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&controls=0" style="width:100%;aspect-ratio:16/9;border:0;border-radius:8px;" allow="autoplay"></iframe>`;
      } else if (type === "video") {
        container.innerHTML = `<video src="${safeUrl}" autoplay muted loop playsinline style="width:100%;border-radius:8px;background:#000;"></video>`;
      } else if (type === "web") {
        container.innerHTML = `<iframe src="${safeUrl}" style="width:100%;aspect-ratio:16/9;border:0;border-radius:8px;"></iframe>`;
      } else {
        container.innerHTML = `<img src="${safeUrl}" style="width:100%;border-radius:8px;background:#000;" />`;
      }
    }

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

    function formatAgo(ms) {
      if (!ms) return "never";
      const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
      if (seconds < 60) return `${seconds}s ago`;
      const mins = Math.floor(seconds / 60);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ago`;
    }

    function render(screenId, s) {
      const modal = ensureModal();
      modal.querySelector("#previewScreenName").textContent = s.name || `(unnamed - ${screenId})`;

      const lastSeenMs = getTimestampMs(s.lastSeen);
      const isOnline = Date.now() - lastSeenMs < 900000;
      const nowPlaying = s.nowPlaying || {};
      const confirmedMs = getTimestampMs(nowPlaying.updatedAt);

      modal.querySelector("#previewStatus").innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <span style="width:7px;height:7px;border-radius:50%;background:${isOnline ? "#1fa971" : "#f59e0b"};display:inline-block;"></span>
          ${isOnline ? "Online" : "Offline"}
        </span>
        &nbsp;&middot;&nbsp; Confirmed playing: ${formatAgo(confirmedMs)}
      `;

      const bodyEl = modal.querySelector("#previewBody");
      bodyEl.innerHTML = "";

      const topLabel = document.createElement("div");
      topLabel.style.cssText = "font-size:12px;color:#6b7280;margin-bottom:6px;";
      topLabel.textContent = s.layoutMode === "split"
        ? `Top zone (${100 - (s.splitRatio || 20)}%)`
        : "Now playing";
      bodyEl.appendChild(topLabel);

      const topWrap = document.createElement("div");
      renderContent(topWrap, nowPlaying.type, nowPlaying.url);
      bodyEl.appendChild(topWrap);

      if (s.layoutMode === "split" && (s.bottomPlaylist || s.bottomWebUrl)) {
        const bottomLabel = document.createElement("div");
        bottomLabel.style.cssText = "font-size:12px;color:#6b7280;margin:14px 0 6px;";
        bottomLabel.textContent = `Bottom zone (${s.splitRatio || 20}%)`;
        bodyEl.appendChild(bottomLabel);

        const bottomWrap = document.createElement("div");
        if (s.bottomPlaylist) {
          const appState = window.AppState || {};
          const bp = (appState.playlistsCache || []).find(p => p.id === s.bottomPlaylist);
          const bpName = bp ? bp.name : s.bottomPlaylist;
          bottomWrap.innerHTML = `<div style="padding:12px;background:#f9fafb;border-radius:8px;font-size:13px;color:#374151;">Bottom Playlist: <strong>${bpName}</strong></div>`;
        } else {
          renderContent(bottomWrap, "web", s.bottomWebUrl);
        }
        bodyEl.appendChild(bottomWrap);
      }

      const note = document.createElement("div");
      note.style.cssText = "font-size:11px;color:#9ca3af;margin-top:14px;line-height:1.5;";
      note.textContent =
        "This loads the same source URL your TV is playing, directly in your browser - it's not a screen " +
        "capture, so exact playback position may differ. It updates every 5 minutes, in step with the " +
        "screen's heartbeat, to stay within Firestore's free-tier write limits.";
      bodyEl.appendChild(note);
    }

    function open(screenId) {
      const modal = ensureModal();
      modal.style.display = "flex";

      if (unsubscribe) unsubscribe();
      unsubscribe = db.collection("screens").doc(screenId).onSnapshot((doc) => {
        if (doc.exists) render(screenId, doc.data());
      });
    }

    function close() {
      if (modalEl) modalEl.style.display = "none";
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    }

    return { open, close };
  };

  window.AppModules = AppModules;
})();