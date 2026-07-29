(function () {
  const AppModules = window.AppModules || {};
  const appState = window.AppState;

  // Tracks unsaved dropdown edits per screen until "Push" is clicked.
  // { screenId: { playlist?: string, rotation?: number } }
  appState.pendingChanges = appState.pendingChanges || {};
  // Tracks which screen row is currently in rename mode.
  appState.renamingScreenId = appState.renamingScreenId || null;

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
        document.getElementById("screenCount").textContent = `${snapshot.size} screens`;

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
      });
    }

    function renderScreenRow(docId, s) {
      const lastSeenMs = s.lastSeen ? s.lastSeen.toMillis() : 0;
      const isOnline = Date.now() - lastSeenMs < 720000;
      const isRenaming = appState.renamingScreenId === docId;
      const hasPending = !!appState.pendingChanges[docId] &&
        Object.keys(appState.pendingChanges[docId]).length > 0;

      let tr = appState.screenRows[docId];
      if (!tr) {
        tr = document.createElement("tr");
        appState.screenRows[docId] = tr;
        document.getElementById("screensBody").appendChild(tr);
      }

      tr.innerHTML = `
        <td><span class="dot ${isOnline ? "online" : "offline"}"></span>${isOnline ? "Online" : "Offline"}</td>
        <td>${isRenaming ? renameField(docId, s.name) : nameDisplay(docId, s.name)}</td>
        <td>${playlistDropdown(docId, s.currentPlaylist)}</td>
        <td>${rotationDropdown(docId, s.rotation)}</td>
        <td>${lastSeenMs ? new Date(lastSeenMs).toLocaleTimeString() : "—"}</td>
        <td class="text-end">
          <div class="rowActions">
            <button class="secondary" onclick="startRename('${docId}')">Rename</button>
            <button class="secondary primaryPush" ${hasPending ? "" : "disabled"} onclick="pushChanges('${docId}')">Push</button>
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

    function rotationDropdown(screenId, currentRotation) {
      const committed = currentRotation || 0;
      const pending = appState.pendingChanges[screenId]?.rotation;
      const effectiveVal = pending !== undefined ? pending : committed;
      const options = [0, 90, 180, 270].map((deg) =>
        `<option value="${deg}" ${deg === effectiveVal ? "selected" : ""}>${deg}°</option>`
      ).join("");

      return `<select class="rotationSelect" onchange="onRotationChange('${screenId}', this.value)">${options}</select>`;
    }

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
      refreshPushButton(screenId);
    }

    function refreshPushButton(screenId) {
      const tr = appState.screenRows[screenId];
      if (!tr) return;
      const btn = tr.querySelector(".primaryPush");
      if (!btn) return;
      const hasPending = !!appState.pendingChanges[screenId];
      btn.disabled = !hasPending;
    }

    function onPlaylistChange(screenId, value) {
      const committed = appState.screenDataCache[screenId]?.currentPlaylist || "";
      setPendingField(screenId, "playlist", value, committed);
    }

    function onRotationChange(screenId, value) {
      const committed = appState.screenDataCache[screenId]?.rotation || 0;
      setPendingField(screenId, "rotation", parseInt(value, 10), committed);
    }

    function pushChanges(screenId) {
      const pending = appState.pendingChanges[screenId];
      if (!pending) return;

      const update = {};
      if (pending.playlist !== undefined) update.currentPlaylist = pending.playlist || null;
      if (pending.rotation !== undefined) update.rotation = pending.rotation;

      db.collection("screens").doc(screenId).update(update)
        .then(() => { delete appState.pendingChanges[screenId]; })
        .catch((err) => alert(`Failed to push changes: ${err.message}`));
    }

    function removeScreen(screenId) {
      if (!confirm("Remove this screen? The device will show the pairing screen again.")) return;
      delete appState.pendingChanges[screenId];
      db.collection("screens").doc(screenId).update({ status: "unpaired", currentPlaylist: null, name: null })
        .then(() => console.log("Screen unpaired successfully:", screenId))
        .catch((err) => alert(`Failed to remove screen: ${err.message}`));
    }

    return {
      addScreen,
      watchScreens,
      renderScreenRow,
      startRename,
      cancelRename,
      saveRename,
      onPlaylistChange,
      onRotationChange,
      pushChanges,
      removeScreen
    };
  };

  window.AppModules = AppModules;
})();