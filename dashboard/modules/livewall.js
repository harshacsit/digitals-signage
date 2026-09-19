(function () {
  const AppModules = window.AppModules || {};

  AppModules.createLiveWallModule = function createLiveWallModule({ db }) {
    const appState = window.AppState;

    // Map of screenId -> { liveviewInstance, firestoreUnsub, tile }
    let activeTiles = {};
    let isMounted = false;

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function getTimestampMs(ts) {
      if (!ts) return 0;
      if (typeof ts.toMillis === "function") return ts.toMillis();
      if (typeof ts.toDate === "function") return ts.toDate().getTime();
      if (typeof ts === "number") return ts;
      if (ts.seconds) return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1000000);
      if (ts instanceof Date) return ts.getTime();
      if (typeof ts === "string") { const p = Date.parse(ts); return isNaN(p) ? 0 : p; }
      return 0;
    }

    function isScreenOnline(s) {
      const ms = getTimestampMs(s.lastSeen || s._lastSeenMs);
      const diff = Date.now() - ms;
      return ms > 0 && s.appActive !== false && diff >= -30000 && diff < 720000;
    }

    function getPairedScreens() {
      return Object.entries(appState.screenDataCache)
        .filter(([, s]) => s.status === "paired")
        .map(([id, s]) => ({ id, ...s }));
    }

    // ─── Tile DOM builders ────────────────────────────────────────────────────

    function buildTile(screen) {
      const online = isScreenOnline(screen);
      const name = screen.name || ("Screen (" + screen.id + ")");

      const tile = document.createElement("div");
      tile.className = "lw-tile";
      tile.dataset.screenId = screen.id;

      const offlineSvg = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;
      const warningSvg = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>`;

      tile.innerHTML =
        '<div class="lw-video-wrap">' +
          '<video class="lw-video" autoplay playsinline muted></video>' +
          '<div class="lw-overlay' + (online ? '' : ' lw-offline-overlay') + '">' +
            (online
              ? '<div class="lw-spinner"></div><span>Connecting\u2026</span>'
              : offlineSvg + '<span>Screen offline</span>') +
          '</div>' +
        '</div>' +
        '<div class="lw-tile-footer">' +
          '<span class="lw-dot ' + (online ? 'lw-dot-online' : 'lw-dot-offline') + '"></span>' +
          '<span class="lw-tile-name" title="' + name + '">' + name + '</span>' +
          '<span class="lw-tile-status ' + (online ? 'online' : 'offline') + '">' + (online ? 'Online' : 'Offline') + '</span>' +
        '</div>';

      return tile;
    }

    function updateTileStatus(tile, online) {
      const overlay     = tile.querySelector(".lw-overlay");
      const dot         = tile.querySelector(".lw-dot");
      const statusBadge = tile.querySelector(".lw-tile-status");

      if (!overlay || !dot || !statusBadge) return;

      dot.className = "lw-dot " + (online ? "lw-dot-online" : "lw-dot-offline");
      statusBadge.className = "lw-tile-status " + (online ? "online" : "offline");
      statusBadge.textContent = online ? "Online" : "Offline";

      if (!online) {
        overlay.classList.remove("lw-overlay-hidden");
        overlay.classList.add("lw-offline-overlay");
        overlay.innerHTML =
          '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
          '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><line x1="2" y1="2" x2="22" y2="22"/></svg>' +
          '<span>Screen offline</span>';
      }
    }

    // ─── Connection management ────────────────────────────────────────────────

    function connectTile(screenId, tile) {
      if (!AppModules.createLiveViewModule) return null;

      const instance = AppModules.createLiveViewModule();
      const videoEl  = tile.querySelector(".lw-video");
      const overlay  = tile.querySelector(".lw-overlay");

      instance.attachVideoElement(videoEl);
      instance.openLiveView(screenId, {
        onConnect: function () {
          if (overlay) overlay.classList.add("lw-overlay-hidden");
        },
        onTimeout: function () {
          if (overlay) {
            overlay.classList.remove("lw-offline-overlay");
            overlay.innerHTML =
              '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
              '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>' +
              '<span>Live view unavailable</span>';
          }
        }
      });

      return instance;
    }

    function disconnectTile(screenId) {
      const entry = activeTiles[screenId];
      if (!entry) return;
      if (entry.liveviewInstance) {
        try { entry.liveviewInstance.closeLiveView(); } catch (e) { /* ignore */ }
        entry.liveviewInstance = null;
      }
      if (entry.firestoreUnsub) {
        try { entry.firestoreUnsub(); } catch (e) { /* ignore */ }
        entry.firestoreUnsub = null;
      }
    }

    // ─── Firestore live-status watcher per tile ───────────────────────────────

    function watchTileStatus(screenId, tile) {
      let prevOnline = isScreenOnline(appState.screenDataCache[screenId] || {});

      const unsub = db.collection("screens").doc(screenId).onSnapshot(function (doc) {
        if (!doc.exists || !isMounted) return;
        const s = doc.data();
        const nowOnline = isScreenOnline(s);

        // Update display name if changed
        const nameEl = tile.querySelector(".lw-tile-name");
        if (nameEl) nameEl.textContent = s.name || ("Screen (" + screenId + ")");

        updateTileStatus(tile, nowOnline);
        updateOnlineCount();

        // Screen just came online → start WebRTC
        if (nowOnline && !prevOnline) {
          const entry = activeTiles[screenId];
          if (entry && !entry.liveviewInstance) {
            const overlay = tile.querySelector(".lw-overlay");
            if (overlay) {
              overlay.classList.remove("lw-offline-overlay");
              overlay.classList.remove("lw-overlay-hidden");
              overlay.innerHTML = '<div class="lw-spinner"></div><span>Connecting\u2026</span>';
            }
            entry.liveviewInstance = connectTile(screenId, tile);
          }
        }

        // Screen just went offline → close WebRTC
        if (!nowOnline && prevOnline) {
          const entry = activeTiles[screenId];
          if (entry && entry.liveviewInstance) {
            try { entry.liveviewInstance.closeLiveView(); } catch (e) { /* ignore */ }
            entry.liveviewInstance = null;
          }
        }

        prevOnline = nowOnline;
      });

      return unsub;
    }

    // ─── Online count badge ───────────────────────────────────────────────────

    function updateOnlineCount() {
      const screens = getPairedScreens();
      const onlineCount = screens.filter(function(s) { return isScreenOnline(s); }).length;
      const countEl = document.getElementById("liveWallOnlineCount");
      if (!countEl) return;

      countEl.innerHTML =
        '<span class="dot ' + (onlineCount > 0 ? 'online' : 'offline') + '"></span>' +
        '<span>' + onlineCount + ' online</span>';
      countEl.className = "status-total-pill" + (onlineCount > 0 ? " is-online" : "");
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    function mount() {
      isMounted = true;
      const grid = document.getElementById("liveWallGrid");
      if (!grid) return;

      // Teardown stale state (without clearing isMounted)
      _teardown();

      const screens = getPairedScreens();
      updateOnlineCount();

      if (screens.length === 0) {
        grid.innerHTML =
          '<div class="lw-empty-state">' +
            '<div class="lw-empty-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg></div>' +
            '<div class="lw-empty-title">No screens paired yet</div>' +
            '<div class="lw-empty-sub">Pair a screen on the Screens tab to see it here.</div>' +
          '</div>';
        return;
      }

      // Warning banner for many screens
      const onlineCount = screens.filter(function(s) { return isScreenOnline(s); }).length;
      const warningBanner = document.getElementById("liveWallWarning");
      if (warningBanner) {
        warningBanner.style.display = onlineCount > 12 ? "flex" : "none";
        if (onlineCount > 12) {
          warningBanner.textContent = onlineCount + " screens are online. Showing all, but many simultaneous streams may slow the browser.";
        }
      }

      grid.innerHTML = "";

      screens.forEach(function (screen) {
        const online = isScreenOnline(screen);
        const tile   = buildTile(screen);
        grid.appendChild(tile);

        var instance = null;
        if (online) {
          instance = connectTile(screen.id, tile);
        }

        const fsUnsub = watchTileStatus(screen.id, tile);

        activeTiles[screen.id] = {
          tile: tile,
          liveviewInstance: instance,
          firestoreUnsub: fsUnsub
        };
      });
    }

    function _teardown() {
      Object.keys(activeTiles).forEach(function (screenId) {
        disconnectTile(screenId);
      });
      activeTiles = {};
    }

    function unmount() {
      isMounted = false;
      _teardown();
      const grid = document.getElementById("liveWallGrid");
      if (grid) grid.innerHTML = "";
    }

    return { mount: mount, unmount: unmount };
  };

  window.AppModules = AppModules;
})();
