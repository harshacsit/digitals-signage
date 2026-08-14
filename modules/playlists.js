(function () {
  const AppModules = window.AppModules || {};
  const appState = window.AppState;

  AppModules.createPlaylistsModule = function createPlaylistsModule({ db }) {
    function watchPlaylists() {
      db.collection("playlists").onSnapshot((snapshot) => {
        appState.playlistsCache = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        Object.keys(appState.screenDataCache).forEach((docId) => {
          const s = appState.screenDataCache[docId];
          if (s.status === "paired") {
            window.renderScreenRow(docId, s);
          }
        });

        renderPlaylistsTable();
        if (typeof window.renderGroupsTable === "function") {
          window.renderGroupsTable();
        }
      });
    }

    function renderPlaylistsTable() {
      const container = document.getElementById("playlistsBody");
      if (!container) return;
      if (appState.playlistsCache.length === 0) {
        container.innerHTML = `<tr><td colspan="3" class="text-muted text-center py-3">No playlists created yet. Create one below!</td></tr>`;
        return;
      }

      container.innerHTML = appState.playlistsCache.map((p) => `
        <tr>
          <td><span class="fw-medium">${p.name}</span></td>
          <td><span class="badge bg-secondary-subtle text-dark border px-2 py-1">${(p.items || []).length} items</span></td>
          <td class="text-end">
            <button class="secondary me-1" onclick="editPlaylist('${p.id}')">Edit</button>
            <button class="secondary danger" onclick="deletePlaylist('${p.id}')">Delete</button>
          </td>
        </tr>`).join("");
    }

    function editPlaylist(id) {
      const playlist = appState.playlistsCache.find((entry) => entry.id === id);
      if (!playlist) return;

      appState.editingPlaylistId = id;
      document.getElementById("playlistName").value = playlist.name;
      document.getElementById("playlistItems").innerHTML = "";
      (playlist.items || []).forEach((item) => addPlaylistItemRow(item));
      document.getElementById("playlistName").scrollIntoView({ behavior: "smooth" });
      if (AppModules.showToast) AppModules.showToast(`Editing playlist '${playlist.name}'`, "info");
    }

    function deletePlaylist(id) {
      if (!confirm("Delete this playlist? Assigned screens will keep showing their active content until re-assigned.")) return;
      db.collection("playlists").doc(id).delete()
        .then(() => {
          if (AppModules.showToast) AppModules.showToast("Playlist deleted.", "info");
        })
        .catch((err) => {
          if (AppModules.showToast) AppModules.showToast(`Delete failed: ${err.message}`, "error");
        });
    }

    function addPlaylistItemRow(data = {}) {
      const container = document.getElementById("playlistItems");
      const row = document.createElement("div");
      row.className = "item-row";
      row.innerHTML = `
        <select class="itemType">
          <option value="image" ${data.type !== "video" && data.type !== "web" ? "selected" : ""}>📷 Image</option>
          <option value="video" ${data.type === "video" ? "selected" : ""}>🎬 Video</option>
          <option value="web" ${data.type === "web" ? "selected" : ""}>🌐 Web Page / YouTube</option>
        </select>
        <input class="itemUrl" placeholder="Media URL (e.g. https://... or YouTube link)" value="${data.url || ""}" />
        <div class="d-flex align-items-center gap-1">
          <input class="itemDuration" type="number" placeholder="Sec" value="${data.durationSeconds || 8}" style="width:75px" />
          <span class="small text-muted">sec</span>
        </div>
        <select class="itemResizeMode">
          <option value="fit">Fit (bars)</option>
          <option value="fill">Fill (crop)</option>
          <option value="stretch">Stretch</option>
        </select>
        <select class="itemRotation">
          <option value="0" ${(data.rotation || 0) === 0 ? "selected" : ""}>0°</option>
          <option value="90" ${data.rotation === 90 ? "selected" : ""}>90°</option>
          <option value="180" ${data.rotation === 180 ? "selected" : ""}>180°</option>
          <option value="270" ${data.rotation === 270 ? "selected" : ""}>270°</option>
        </select>

        <label class="small text-muted d-flex align-items-center gap-1">
          <input type="checkbox" class="itemIsLive" ${data.isLive ? "checked" : ""} />
          Live
        </label>

        <button class="btn-remove ms-auto" onclick="this.parentElement.remove()" title="Remove item">✕</button>
      `;

      container.appendChild(row);
    }

    function savePlaylist() {
      const name = document.getElementById("playlistName").value.trim();
      if (!name) {
        if (AppModules.showToast) AppModules.showToast("Please enter a playlist name.", "error");
        else alert("Give the playlist a name.");
        return;
      }

      const rows = document.querySelectorAll("#playlistItems .item-row");
      if (rows.length === 0) {
        if (AppModules.showToast) AppModules.showToast("Add at least one item to the playlist.", "error");
        else alert("Add at least one item.");
        return;
      }

      const items = Array.from(rows).map((row) => ({
        type: row.querySelector(".itemType").value,
        url: row.querySelector(".itemUrl").value.trim(),
        durationSeconds: parseInt(row.querySelector(".itemDuration").value, 10) || 8,
        resizeMode: row.querySelector(".itemResizeMode").value,
        rotation: parseInt(row.querySelector(".itemRotation").value, 10) || 0,
        isLive: row.querySelector(".itemIsLive").checked
      }));

      const resetForm = () => {
        appState.editingPlaylistId = null;
        document.getElementById("playlistName").value = "";
        document.getElementById("playlistItems").innerHTML = "";
      };

      if (appState.editingPlaylistId) {
        db.collection("playlists").doc(appState.editingPlaylistId).update({ name, items })
          .then(() => {
            resetForm();
            if (AppModules.showToast) AppModules.showToast("Playlist updated successfully!", "success");
          })
          .catch((err) => {
            if (AppModules.showToast) AppModules.showToast(`Save failed: ${err.message}`, "error");
          });
      } else {
        db.collection("playlists").add({
          name,
          items,
          createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
          resetForm();
          if (AppModules.showToast) AppModules.showToast("Playlist saved! You can now assign it to a screen.", "success");
        }).catch((err) => {
          if (AppModules.showToast) AppModules.showToast(`Save failed: ${err.message}`, "error");
        });
      }
    }

    return {
      watchPlaylists,
      renderPlaylistsTable,
      editPlaylist,
      deletePlaylist,
      addPlaylistItemRow,
      savePlaylist
    };
  };

  window.AppModules = AppModules;
})();

