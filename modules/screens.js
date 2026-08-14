(function () {
  const AppModules = window.AppModules || {};
  const appState = window.AppState;

  // Tracks unsaved dropdown edits per screen until "Push" is clicked.
  // { screenId: { playlist?, rotation?, layoutMode?, bottomPlaylist?, splitRatio? } }
  appState.pendingChanges = appState.pendingChanges || {};
  // Tracks which screen row is currently in rename mode.
  appState.renamingScreenId = appState.renamingScreenId || null;

  const SPLIT_RATIO_OPTIONS = [10, 20, 30, 40];
  const DEFAULT_SPLIT_RATIO = 20;

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
      db.collection("screens").onSnapshot((snapshot) => {
        let pairedCount = 0;
        let onlineCount = 0;

        snapshot.forEach((doc) => {
          const s = doc.data();
          if (s.status === "paired") {
            pairedCount++;
            const lastSeenMs = getTimestampMs(s.lastSeen);
            if (Date.now() - lastSeenMs < 900000) onlineCount++;
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
            return;
          }

          const s = doc.data();
          appState.screenDataCache[doc.id] = s;

          if (s.status !== "paired") {
            if (appState.screenRows[doc.id]) {
              appState.screenRows[doc.id].remove();
              delete appState.screenRows[doc.id];
            }
            return;
          }

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

        const lastSeenMs = getTimestampMs(s.lastSeen);
        const isOnline = Date.now() - lastSeenMs < 900000;

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
      const lastSeenMs = getTimestampMs(s.lastSeen);
      const isOnline = Date.now() - lastSeenMs < 900000;

      let tr = appState.screenRows[docId];
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

      tr.innerHTML = `
        <td>
          <span class="badge-status ${isOnline ? "online" : "offline"}">
            <span class="dot ${isOnline ? "online" : "offline"}"></span>
            ${isOnline ? "Online" : "Offline"}
          </span>
        </td>
        <td>${s.name || "(unnamed - " + docId + ")"}</td>
        <td>${layoutDropdown(docId, s.layoutMode)}</td>
        <td>${playlistDropdown(docId, s.currentPlaylist)}</td>
        <td>${effectiveLayoutMode === "split"
            ? bottomPlaylistDropdown(docId, s.bottomPlaylist)
            : '<span class="text-muted small">—</span>'}</td>
        <td>${effectiveLayoutMode === "split"
            ? splitRatioDropdown(docId, s.splitRatio)
            : '<span class="text-muted small">—</span>'}</td>
        <td>${rotationDropdown(docId, s.rotation)}</td>
        <td>${formatLastSeenTime(lastSeenMs)}</td>
        <td class="text-end">
          <div class="d-inline-flex gap-1 align-items-center justify-content-end">
            <button class="secondary" onclick="openPreview('${docId}')">Preview</button>
            <button class="secondary primaryPush ${hasPending ? "has-pending" : ""}" ${hasPending ? "" : "disabled"} onclick="pushChanges('${docId}')">Push</button>
            <button class="secondary danger" onclick="removeScreen('${docId}')">Remove</button>
          </div>
        </td>
      `;
    }

    function nameDisplay(docId, name) {
      return `${name || "(unnamed - " + docId + ")"}`;
    }

    function renameField(docId, currentName) {
      const safeName = (currentName || "").replace(/"/g, "&quot;");
      return `<div class="renameField">
        <input type="text" id="renameInput_${docId}" class="renameInput" value="${safeName}"
          onkeydown="if(event.key==='Enter'){saveRename('${docId}')} if(event.key==='Escape'){cancelRename('${docId}')}" />
        <button class="secondary" onclick="saveRename('${docId}')">Save</button>
        <button class="secondary danger" onclick="cancelRename('${docId}')">Cancel</button>
      </div>`;
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

    function bottomPlaylistDropdown(screenId, currentBottomPlaylistId) {
      const pending = appState.pendingChanges[screenId]?.bottomPlaylist;
      const effectiveVal = pending !== undefined ? pending : (currentBottomPlaylistId || "");
      const options = appState.playlistsCache.map((p) =>
        `<option value="${p.id}" ${p.id === effectiveVal ? "selected" : ""}>${p.name}</option>`
      ).join("");

      return `<select class="bottomPlaylistSelect" onchange="onBottomPlaylistChange('${screenId}', this.value)">
        <option value="" ${effectiveVal === "" ? "selected" : ""}>— none —</option>${options}
      </select>`;
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
      if (value === committedValue) {
        delete appState.pendingChanges[screenId][field];
      } else {
        appState.pendingChanges[screenId][field] = value;
      }
      if (Object.keys(appState.pendingChanges[screenId]).length === 0) {
        delete appState.pendingChanges[screenId];
      }
      renderScreenRow(screenId, appState.screenDataCache[screenId]);
    }

    function onLayoutModeChange(screenId, value) {
      const committed = appState.screenDataCache[screenId]?.layoutMode || "single";
      setPendingField(screenId, "layoutMode", value, committed);
    }

    function onPlaylistChange(screenId, value) {
      const committed = appState.screenDataCache[screenId]?.currentPlaylist || "";
      setPendingField(screenId, "playlist", value, committed);
    }

    function onBottomPlaylistChange(screenId, value) {
      const committed = appState.screenDataCache[screenId]?.bottomPlaylist || "";
      setPendingField(screenId, "bottomPlaylist", value, committed);
    }

    function onSplitRatioChange(screenId, value) {
      const committed = appState.screenDataCache[screenId]?.splitRatio || DEFAULT_SPLIT_RATIO;
      setPendingField(screenId, "splitRatio", parseInt(value, 10), committed);
    }

    function onRotationChange(screenId, value) {
      const committed = appState.screenDataCache[screenId]?.rotation || 0;
      setPendingField(screenId, "rotation", parseInt(value, 10), committed);
    }

    function pushChanges(screenId) {
      const pending = appState.pendingChanges[screenId];
      if (!pending) return;

      const update = {};
      if (pending.layoutMode !== undefined) update.layoutMode = pending.layoutMode;
      if (pending.playlist !== undefined) update.currentPlaylist = pending.playlist || null;
      if (pending.bottomPlaylist !== undefined) update.bottomPlaylist = pending.bottomPlaylist || null;
      if (pending.splitRatio !== undefined) update.splitRatio = pending.splitRatio;
      if (pending.rotation !== undefined) update.rotation = pending.rotation;

      db.collection("screens").doc(screenId).update(update)
        .then(() => {
          delete appState.pendingChanges[screenId];
          renderScreenRow(screenId, appState.screenDataCache[screenId]);
        })
        .catch((err) => alert(`Failed to push changes: ${err.message}`));
    }

    function removeScreen(screenId) {
      if (!confirm("Remove this screen permanently from Firebase?")) return;
      delete appState.pendingChanges[screenId];
      db.collection("screens").doc(screenId).delete()
        .then(() => console.log("Screen deleted from firebase successfully:", screenId))
        .catch((err) => alert(`Failed to remove screen: ${err.message}`));
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
      onBottomPlaylistChange,
      onSplitRatioChange,
      onRotationChange,
      pushChanges,
      removeScreen
    };
  };

  window.AppModules = AppModules;
})();