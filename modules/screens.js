(function () {
  const AppModules = window.AppModules || {};
  const appState = window.AppState;

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

      let tr = appState.screenRows[docId];
      if (!tr) {
        tr = document.createElement("tr");
        appState.screenRows[docId] = tr;
        document.getElementById("screensBody").appendChild(tr);
      }

      const activeSelect = tr.querySelector("select.playlistSelect");
      const isEditingThisRow = activeSelect && document.activeElement === activeSelect;
      const activeRotationSelect = tr.querySelector("select.rotationSelect");
      const isEditingRotation = activeRotationSelect && document.activeElement === activeRotationSelect;

      tr.innerHTML = `
        <td><span class="dot ${isOnline ? "online" : "offline"}"></span>${isOnline ? "Online" : "Offline"}</td>
        <td>${s.name || "(unnamed - " + docId + ")"}</td>
        <td>${isEditingThisRow ? activeSelect.outerHTML : playlistDropdown(docId, s.currentPlaylist)}</td>
        <td>${isEditingRotation ? activeRotationSelect.outerHTML : rotationDropdown(docId, s.rotation)}</td>
        <td>${lastSeenMs ? new Date(lastSeenMs).toLocaleTimeString() : "—"}</td>
        <td><button class="secondary danger" onclick="removeScreen('${docId}')">Remove</button></td>
      `;
    }

    function playlistDropdown(screenId, currentPlaylistId) {
      const options = appState.playlistsCache.map((p) =>
        `<option value="${p.id}" ${p.id === currentPlaylistId ? "selected" : ""}>${p.name}</option>`
      ).join("");

      return `<select class="playlistSelect" onchange="assignPlaylist('${screenId}', this.value)">
        <option value="">— none —</option>${options}
      </select>`;
    }

    function rotationDropdown(screenId, currentRotation) {
      const rotation = currentRotation || 0;
      const options = [0, 90, 180, 270].map((deg) =>
        `<option value="${deg}" ${deg === rotation ? "selected" : ""}>${deg}°</option>`
      ).join("");

      return `<select class="rotationSelect" onchange="assignRotation('${screenId}', this.value)">${options}</select>`;
    }

    function assignRotation(screenId, rotation) {
      db.collection("screens").doc(screenId).update({ rotation: parseInt(rotation, 10) });
    }

    function assignPlaylist(screenId, playlistId) {
      db.collection("screens").doc(screenId).update({ currentPlaylist: playlistId || null });
    }

    function removeScreen(screenId) {
      if (!confirm("Remove this screen? The device will show the pairing screen again.")) return;
      db.collection("screens").doc(screenId).update({ status: "unpaired", currentPlaylist: null, name: null })
        .then(() => console.log("Screen unpaired successfully:", screenId))
        .catch((err) => alert(`Failed to remove screen: ${err.message}`));
    }

    return {
      addScreen,
      watchScreens,
      renderScreenRow,
      assignRotation,
      assignPlaylist,
      removeScreen
    };
  };

  window.AppModules = AppModules;
})();
