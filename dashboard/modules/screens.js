(function () {
  const AppModules = window.AppModules || {};
  const appState = window.AppState;

  // Tracks unsaved dropdown/input edits per screen until "Push" is clicked.
  // { screenId: { playlist?, rotation?, layoutMode?, bottomWebUrl?, splitRatio? } }
  appState.pendingChanges = appState.pendingChanges || {};
  // Tracks which screen row is currently in rename mode.
  appState.renamingScreenId = appState.renamingScreenId || null;
  // Tracks the last known online status of each screen
  appState.screenOnlineStatus = appState.screenOnlineStatus || {};

  const SPLIT_RATIO_OPTIONS = [10, 20, 30, 40];
  const DEFAULT_SPLIT_RATIO = 20;

  const ONLINE_THRESHOLD_MS = 240000; // 4 minutes threshold optimized for up to 20 screens on Firebase free tier

  function isScreenOnline(lastSeenMs) {
    if (!lastSeenMs || lastSeenMs <= 0) return false;
    const diff = Date.now() - lastSeenMs;
    // Window: timestamp must be between -30s (future clock skew) and +4 minutes (240s)
    return diff >= -30000 && diff < ONLINE_THRESHOLD_MS;
  }

  function getTimestampMs(ts, docId) {
    let ms = 0;
    if (ts) {
      if (typeof ts.toMillis === "function") ms = ts.toMillis();
      else if (typeof ts.toDate === "function") ms = ts.toDate().getTime();
      else if (typeof ts === "number") ms = ts;
      else if (ts.seconds !== undefined && ts.seconds !== null) ms = ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1000000);
      else if (ts instanceof Date) ms = ts.getTime();
      else if (typeof ts === "string") {
        const parsed = Date.parse(ts);
        ms = isNaN(parsed) ? 0 : parsed;
      }
    }

    if (ms > 0) {
      if (docId && appState.screenDataCache[docId]) {
        appState.screenDataCache[docId]._lastSeenMs = ms;
      }
      return ms;
    }

    // Fallback: If ts is null or pending server timestamp (ms === 0), use cached _lastSeenMs
    if (docId && appState.screenDataCache[docId] && appState.screenDataCache[docId]._lastSeenMs) {
      return appState.screenDataCache[docId]._lastSeenMs;
    }

    return 0;
  }

  function formatLastSeenTime(ms) {
    if (!ms) return "—";
    const d = new Date(ms);
    if (isNaN(d.getTime())) return "—";

    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    if (isToday) {
      return timeStr;
    } else {
      const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return `${dateStr}, ${timeStr}`;
    }
  }

  AppModules.createScreensModule = function createScreensModule({ db }) {
    let offlineCheckInterval = null;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.warn("Service worker registration failed", err);
      });
    }

    function triggerNotification(title, body) {
      if ("Notification" in window && Notification.permission === "granted") {
        if ("serviceWorker" in navigator && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, { body, requireInteraction: true });
          }).catch(() => {
            new Notification(title, { body });
          });
        } else {
          new Notification(title, { body });
        }
      }
    }

    function checkScreenStatuses() {
      let onlineCount = 0;
      let pairedCount = 0;

      Object.keys(appState.screenDataCache).forEach(docId => {
        const s = appState.screenDataCache[docId];
        if (s.status !== "paired") return;

        pairedCount++;
        const lastSeenMs = getTimestampMs(s.lastSeen, docId);
        const isOnline = isScreenOnline(lastSeenMs);

        const previousStatus = appState.screenOnlineStatus[docId];

        if (previousStatus === true && !isOnline) {
          triggerNotification("Screen Offline", `Screen "${s.name || docId}" has gone offline.`);
        } else if (previousStatus === false && isOnline) {
          triggerNotification("Screen Online", `Screen "${s.name || docId}" is back online.`);
        }

        appState.screenOnlineStatus[docId] = isOnline;

        if (isOnline) onlineCount++;

        // Re-render to update the UI status indicator dynamically
        renderScreenRow(docId, s);
      });

      const countEl = document.getElementById("screenCount");
      const pillEl = document.querySelector(".status-total-pill");
      if (countEl) countEl.textContent = `${onlineCount} of ${pairedCount} screens online`;
      if (pillEl) {
        if (onlineCount > 0) {
          pillEl.classList.add("is-online");
        } else {
          pillEl.classList.remove("is-online");
        }
      }
    }

    function addScreen() {
      const code = document.getElementById("pairCode").value.trim().toUpperCase();
      const name = document.getElementById("pairName").value.trim();
      if (!code || !name) return alert("Enter both the pairing code and a name.");

      const ref = db.collection("screens").doc(code);
      ref.get().then((doc) => {
        if (!doc.exists) {
          alert("No screen found with that code. Make sure the TV is showing this exact code.");
          return;
        }

        ref.update({ status: "paired", name })
          .then(() => {
            document.getElementById("pairCode").value = "";
            document.getElementById("pairName").value = "";
          });
      });
    }

    function watchScreens() {
      if (!offlineCheckInterval) {
        if ("Notification" in window && Notification.permission === "default") {
          Notification.requestPermission();
        }
        offlineCheckInterval = setInterval(checkScreenStatuses, 30000);
      }

      db.collection("screens").onSnapshot((snapshot) => {
        let pairedCount = 0;
        let onlineCount = 0;

        snapshot.forEach((doc) => {
          const s = doc.data();
          if (s.status === "paired") {
            pairedCount++;
            const lastSeenMs = getTimestampMs(s.lastSeen, doc.id);
            const isOnline = isScreenOnline(lastSeenMs);
            if (isOnline) onlineCount++;
            
            // Track initial status so we don't spam notifications on load
            if (appState.screenOnlineStatus[doc.id] === undefined) {
              appState.screenOnlineStatus[doc.id] = isOnline;
            }
          }
        });

        const countEl = document.getElementById("screenCount");
        const pillEl = document.querySelector(".status-total-pill");
        if (countEl) countEl.textContent = `${onlineCount} of ${pairedCount} screens online`;
        if (pillEl) {
          if (onlineCount > 0) {
            pillEl.classList.add("is-online");
          } else {
            pillEl.classList.remove("is-online");
          }
        }

        snapshot.docChanges().forEach((change) => {
          const doc = change.doc;

          if (change.type === "removed") {
            if (appState.screenRows[doc.id]) {
              appState.screenRows[doc.id].remove();
              delete appState.screenRows[doc.id];
            }
            delete appState.screenDataCache[doc.id];
            delete appState.pendingChanges[doc.id];
            delete appState.screenOnlineStatus[doc.id];
            return;
          }

          const s = doc.data();
          if (s.status !== "paired") {
            if (appState.screenRows[doc.id]) {
              appState.screenRows[doc.id].remove();
              delete appState.screenRows[doc.id];
            }
            delete appState.screenDataCache[doc.id];
            delete appState.pendingChanges[doc.id];
            delete appState.screenOnlineStatus[doc.id];
            return;
          }

          appState.screenDataCache[doc.id] = s;

          const lastSeenMs = getTimestampMs(s.lastSeen, doc.id);
          const isOnline = isScreenOnline(lastSeenMs);
          const previousStatus = appState.screenOnlineStatus[doc.id];
          
          if (previousStatus === false && isOnline) {
            triggerNotification("Screen Online", `Screen "${s.name || doc.id}" is back online.`);
          }
          
          appState.screenOnlineStatus[doc.id] = isOnline;

          renderScreenRow(doc.id, s);
        });

        if (typeof window.populateAnalyticsScreenOptions === "function") {
          window.populateAnalyticsScreenOptions();
        }
        if (typeof window.renderGroupsTable === "function") {
          window.renderGroupsTable();
        }
        if (typeof window.renderScreenCheckboxes === "function") {
          window.renderScreenCheckboxes();
        }
      });
    }

    appState.screenStatusFilter = appState.screenStatusFilter || "all";

    function filterScreensByStatus(filterMode, btnEl) {
      appState.screenStatusFilter = filterMode || "all";

      if (btnEl) {
        document.querySelectorAll(".status-filter-group .filter-pill").forEach(btn => {
          btn.classList.remove("active");
        });
        btnEl.classList.add("active");
      }

      Object.keys(appState.screenRows).forEach((docId) => {
        const s = appState.screenDataCache[docId];
        const tr = appState.screenRows[docId];
        if (!s || !tr) return;

        const lastSeenMs = getTimestampMs(s.lastSeen, docId);
        const isOnline = isScreenOnline(lastSeenMs);

        if (appState.screenStatusFilter === "online" && !isOnline) {
          tr.style.display = "none";
        } else if (appState.screenStatusFilter === "offline" && isOnline) {
          tr.style.display = "none";
        } else {
          tr.style.display = "";
        }
      });
    }

    function renderScreenRow(docId, s) {
      const lastSeenMs = getTimestampMs(s.lastSeen, docId);
      const isOnline = isScreenOnline(lastSeenMs);

      let tr = appState.screenRows[docId];
      const isFirstRender = !tr;
      if (!tr) {
        tr = document.createElement("tr");
        appState.screenRows[docId] = tr;
        document.getElementById("screensBody").appendChild(tr);
      }

      if (appState.screenStatusFilter === "online" && !isOnline) {
        tr.style.display = "none";
      } else if (appState.screenStatusFilter === "offline" && isOnline) {
        tr.style.display = "none";
      } else {
        tr.style.display = "";
      }

      const pending = appState.pendingChanges[docId] || {};
      const effectiveLayoutMode = pending.layoutMode !== undefined ? pending.layoutMode : (s.layoutMode || "single");
      const hasPending = Object.keys(pending).length > 0;

      if (hasPending) {
        tr.classList.add("row-has-pending");
      } else {
        tr.classList.remove("row-has-pending");
      }

      if (isOnline) {
        tr.classList.add("row-is-online");
      } else {
        tr.classList.remove("row-is-online");
      }

      if (isFirstRender) {
        // Full build on first render — use named cell classes for surgical updates later
        tr.innerHTML = `
          <td class="cell-status">
            <span class="badge-status ${isOnline ? "online" : "offline"}">
              <span class="dot ${isOnline ? "online" : "offline"}"></span>
              ${isOnline ? "Online" : "Offline"}
            </span>
          </td>
          <td class="cell-name">${s.name || "(unnamed - " + docId + ")"}</td>
          <td class="cell-layout">${layoutDropdown(docId, s.layoutMode)}</td>
          <td class="cell-playlist">${playlistDropdown(docId, s.currentPlaylist)}</td>
          <td class="cell-bottomurl">${effectiveLayoutMode === "split"
              ? bottomWebUrlInput(docId, s.bottomWebUrl)
              : '<span class="text-muted small">—</span>'}</td>
          <td class="cell-splitratio">${effectiveLayoutMode === "split"
              ? splitRatioDropdown(docId, s.splitRatio)
              : '<span class="text-muted small">—</span>'}</td>
          <td class="cell-rotation">${rotationDropdown(docId, s.rotation)}</td>
          <td class="cell-lastseen">${formatLastSeenTime(lastSeenMs)}</td>
          <td class="text-end cell-actions">
            <div class="d-inline-flex gap-1 align-items-center justify-content-end">
              <button class="secondary" onclick="openPreview('${docId}')">Preview</button>
              <button class="secondary primaryPush ${hasPending ? "has-pending" : ""}" ${hasPending ? "" : "disabled"} onclick="pushChanges('${docId}')">Push</button>
              <button class="secondary danger" onclick="removeScreen('${docId}')">Remove</button>
            </div>
          </td>
        `;
        return;
      }

      // --- Surgical updates for subsequent renders (heartbeat ticks) ---
      // Always update status badge
      const statusCell = tr.querySelector(".cell-status");
      if (statusCell) {
        statusCell.innerHTML = `
          <span class="badge-status ${isOnline ? "online" : "offline"}">
            <span class="dot ${isOnline ? "online" : "offline"}"></span>
            ${isOnline ? "Online" : "Offline"}
          </span>
        `;
      }

      // Always update name
      const nameCell = tr.querySelector(".cell-name");
      if (nameCell) nameCell.textContent = s.name || "(unnamed - " + docId + ")";

      // Always update last-seen time
      const lastSeenCell = tr.querySelector(".cell-lastseen");
      if (lastSeenCell) lastSeenCell.textContent = formatLastSeenTime(lastSeenMs);

      // Always update push button enabled state
      const pushBtn = tr.querySelector(".primaryPush");
      if (pushBtn) {
        pushBtn.disabled = !hasPending;
        hasPending ? pushBtn.classList.add("has-pending") : pushBtn.classList.remove("has-pending");
      }

      // Only rebuild dropdown cells when user is NOT currently interacting with this row
      const activeEl = document.activeElement;
      const isUserInteractingInRow = activeEl && tr.contains(activeEl);
      if (!isUserInteractingInRow) {
        const layoutCell = tr.querySelector(".cell-layout");
        if (layoutCell) layoutCell.innerHTML = layoutDropdown(docId, s.layoutMode);

        const playlistCell = tr.querySelector(".cell-playlist");
        if (playlistCell) playlistCell.innerHTML = playlistDropdown(docId, s.currentPlaylist);

        const bottomUrlCell = tr.querySelector(".cell-bottomurl");
        if (bottomUrlCell) {
          bottomUrlCell.innerHTML = effectiveLayoutMode === "split"
            ? bottomWebUrlInput(docId, s.bottomWebUrl)
            : '<span class="text-muted small">—</span>';
        }

        const splitRatioCell = tr.querySelector(".cell-splitratio");
        if (splitRatioCell) {
          splitRatioCell.innerHTML = effectiveLayoutMode === "split"
            ? splitRatioDropdown(docId, s.splitRatio)
            : '<span class="text-muted small">—</span>';
        }

        const rotationCell = tr.querySelector(".cell-rotation");
        if (rotationCell) rotationCell.innerHTML = rotationDropdown(docId, s.rotation);
      }
    }

    function startRename(screenId) {
      appState.renamingScreenId = screenId;
      renderScreenRow(screenId, appState.screenDataCache[screenId]);
      document.getElementById(`renameInput_${screenId}`)?.focus();
    }

    function cancelRename(screenId) {
      appState.renamingScreenId = null;
      renderScreenRow(screenId, appState.screenDataCache[screenId]);
    }

    function saveRename(screenId) {
      const input = document.getElementById(`renameInput_${screenId}`);
      const newName = input.value.trim();
      if (!newName) return alert("Screen name can't be empty.");

      db.collection("screens").doc(screenId).update({ name: newName })
        .then(() => { appState.renamingScreenId = null; })
        .catch((err) => alert(`Rename failed: ${err.message}`));
    }

    // ===== Field renderers =====

    function layoutDropdown(screenId, currentLayout) {
      const committed = currentLayout || "single";
      const pending = appState.pendingChanges[screenId]?.layoutMode;
      const effectiveVal = pending !== undefined ? pending : committed;

      return `<select class="layoutSelect" onchange="onLayoutModeChange('${screenId}', this.value)">
        <option value="single" ${effectiveVal === "single" ? "selected" : ""}>Single</option>
        <option value="split" ${effectiveVal === "split" ? "selected" : ""}>Split</option>
      </select>`;
    }

    function playlistDropdown(screenId, currentPlaylistId) {
      const pending = appState.pendingChanges[screenId]?.playlist;
      const effectiveVal = pending !== undefined ? pending : (currentPlaylistId || "");
      const options = appState.playlistsCache.map((p) =>
        `<option value="${p.id}" ${p.id === effectiveVal ? "selected" : ""}>${p.name}</option>`
      ).join("");

      return `<select class="playlistSelect" onchange="onPlaylistChange('${screenId}', this.value)">
        <option value="" ${effectiveVal === "" ? "selected" : ""}>— none —</option>${options}
      </select>`;
    }

    function bottomWebUrlInput(screenId, currentBottomWebUrl) {
      const pending = appState.pendingChanges[screenId]?.bottomWebUrl;
      const effectiveVal = pending !== undefined ? pending : (currentBottomWebUrl || "");
      const safeVal = effectiveVal.replace(/"/g, "&quot;");

      return `<input type="text" class="bottomWebUrlInput" placeholder="https://... (bottom strip URL)"
        value="${safeVal}"
        onchange="onBottomWebUrlChange('${screenId}', this.value)"
        onblur="onBottomWebUrlChange('${screenId}', this.value)" />`;
    }

    function splitRatioDropdown(screenId, currentRatio) {
      const committed = currentRatio || DEFAULT_SPLIT_RATIO;
      const pending = appState.pendingChanges[screenId]?.splitRatio;
      const effectiveVal = pending !== undefined ? pending : committed;
      const options = SPLIT_RATIO_OPTIONS.map((pct) =>
        `<option value="${pct}" ${pct === effectiveVal ? "selected" : ""}>${pct}% bottom</option>`
      ).join("");

      return `<select class="splitRatioSelect" onchange="onSplitRatioChange('${screenId}', this.value)">${options}</select>`;
    }

    function rotationDropdown(screenId, currentRotation) {
      const committed = currentRotation || 0;
      const pending = appState.pendingChanges[screenId]?.rotation;
      const effectiveVal = pending !== undefined ? pending : committed;
      const options = [0, 90, 180, 270].map((deg) =>
        `<option value="${deg}" ${deg === effectiveVal ? "selected" : ""}>${deg}°</option>`
      ).join("");

      return `<select class="rotationSelect" onchange="onRotationChange('${screenId}', this.value)">${options}</select>`;
    }

    // ===== Pending-change tracking =====

    function setPendingField(screenId, field, value, committedValue) {
      if (!appState.pendingChanges[screenId]) appState.pendingChanges[screenId] = {};
      // Always store the pending value — never auto-delete even if it matches committed.
      // The Push button should be enabled as long as the user made a selection.
      // Only clear after a successful push.
      appState.pendingChanges[screenId][field] = value;

      // Update just the Push button state without re-rendering the whole row
      const tr = appState.screenRows[screenId];
      if (tr) {
        const pending = appState.pendingChanges[screenId];
        const hasPending = pending && Object.keys(pending).length > 0;
        const pushBtn = tr.querySelector(".primaryPush");
        if (pushBtn) {
          if (hasPending) {
            pushBtn.disabled = false;
            pushBtn.classList.add("has-pending");
          } else {
            pushBtn.disabled = true;
            pushBtn.classList.remove("has-pending");
          }
        }
        if (hasPending) {
          tr.classList.add("row-has-pending");
        } else {
          tr.classList.remove("row-has-pending");
        }

        // If layout mode changed, we need to refresh the split-specific columns
        if (field === "layoutMode") {
          const s = appState.screenDataCache[screenId];
          if (s) renderScreenRow(screenId, s);
        }
      }
    }

    function onLayoutModeChange(screenId, value) {
      setPendingField(screenId, "layoutMode", value, appState.screenDataCache[screenId]?.layoutMode || "single");
    }

    function onPlaylistChange(screenId, value) {
      setPendingField(screenId, "playlist", value, appState.screenDataCache[screenId]?.currentPlaylist || "");
    }

    function onBottomWebUrlChange(screenId, value) {
      setPendingField(screenId, "bottomWebUrl", value.trim(), appState.screenDataCache[screenId]?.bottomWebUrl || "");
    }

    function onSplitRatioChange(screenId, value) {
      setPendingField(screenId, "splitRatio", parseInt(value, 10), appState.screenDataCache[screenId]?.splitRatio || DEFAULT_SPLIT_RATIO);
    }

    function onRotationChange(screenId, value) {
      setPendingField(screenId, "rotation", parseInt(value, 10), appState.screenDataCache[screenId]?.rotation || 0);
    }

    function pushChanges(screenId) {
      const pending = appState.pendingChanges[screenId];
      if (!pending || Object.keys(pending).length === 0) {
        if (AppModules.showToast) AppModules.showToast("No changes to push.", "info");
        return;
      }

      const update = {};
      if (pending.layoutMode !== undefined) update.layoutMode = pending.layoutMode;
      if (pending.playlist !== undefined) update.currentPlaylist = pending.playlist || null;
      if (pending.bottomWebUrl !== undefined) update.bottomWebUrl = pending.bottomWebUrl || null;
      if (pending.splitRatio !== undefined) update.splitRatio = pending.splitRatio;
      if (pending.rotation !== undefined) update.rotation = pending.rotation;

      const s = appState.screenDataCache[screenId];
      const screenName = s?.name || screenId;

      db.collection("screens").doc(screenId).update(update)
        .then(() => {
          delete appState.pendingChanges[screenId];
          if (AppModules.showToast) {
            AppModules.showToast(`Changes pushed to "${screenName}" successfully!`, "success");
          }
          renderScreenRow(screenId, appState.screenDataCache[screenId]);
        })
        .catch((err) => {
          if (AppModules.showToast) {
            AppModules.showToast(`Push failed: ${err.message}`, "error");
          } else {
            alert(`Failed to push changes: ${err.message}`);
          }
        });
    }

    function removeScreen(screenId) {
      const s = appState.screenDataCache[screenId];
      const name = s?.name || screenId;
      if (!confirm(`Remove "${name}" permanently from Firebase?`)) return;
      delete appState.pendingChanges[screenId];
      delete appState.screenOnlineStatus[screenId];
      if (appState.screenRows[screenId]) {
        appState.screenRows[screenId].remove();
        delete appState.screenRows[screenId];
      }
      delete appState.screenDataCache[screenId];

      db.collection("screens").doc(screenId).delete()
        .then(() => {
          if (AppModules.showToast) AppModules.showToast(`Screen "${name}" removed.`, "info");
          db.collection("groups").get().then((groupSnap) => {
            groupSnap.forEach((gDoc) => {
              const gData = gDoc.data();
              if (Array.isArray(gData.screenIds) && gData.screenIds.includes(screenId)) {
                const updatedScreenIds = gData.screenIds.filter(id => id !== screenId);
                gDoc.ref.update({ screenIds: updatedScreenIds }).catch(err => console.warn("Failed updating group screenIds", err));
              }
            });
          }).catch(err => console.warn("Failed fetching groups for screen cleanup", err));
        })
        .catch((err) => {
          if (AppModules.showToast) AppModules.showToast(`Remove failed: ${err.message}`, "error");
          else alert(`Failed to remove screen: ${err.message}`);
        });
    }

    return {
      addScreen,
      watchScreens,
      renderScreenRow,
      filterScreensByStatus,
      startRename,
      cancelRename,
      saveRename,
      onLayoutModeChange,
      onLayoutChange: onLayoutModeChange,
      onPlaylistChange,
      onBottomWebUrlChange,
      onSplitRatioChange,
      onRotationChange,
      pushChanges,
      removeScreen
    };
  };

  window.AppModules = AppModules;
})();