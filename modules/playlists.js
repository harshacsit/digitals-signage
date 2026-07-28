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
      });
    }

    function renderPlaylistsTable() {
      document.getElementById("playlistsBody").innerHTML = appState.playlistsCache.map((p) => `
        <tr>
          <td>${p.name}</td>
          <td><span class="badge">${(p.items || []).length} items</span></td>
          <td>
            <button class="secondary" onclick="editPlaylist('${p.id}')">Edit</button>
            <button class="secondary" onclick="deletePlaylist('${p.id}')">Delete</button>
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
    }

    function deletePlaylist(id) {
      if (!confirm("Delete this playlist? Screens still assigned to it will keep showing their last content until you reassign them.")) return;
      db.collection("playlists").doc(id).delete();
    }

    function addPlaylistItemRow(data = {}) {
      const container = document.getElementById("playlistItems");
      const row = document.createElement("div");
      row.className = "item-row";
      row.innerHTML = `
        <select class="itemType">
          <option value="image" ${data.type !== "video" && data.type !== "web" ? "selected" : ""}>Image</option>
          <option value="video" ${data.type === "video" ? "selected" : ""}>Video</option>
          <option value="web" ${data.type === "web" ? "selected" : ""}>Web Page / YouTube</option>
        </select>
        <input class="itemUrl" placeholder="Media URL (or YouTube link for Web Page)" value="${data.url || ""}" />
        <input class="itemDuration" type="number" placeholder="Seconds" value="${data.durationSeconds || 8}" style="width:120px" />
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

        <label style="display:flex;align-items:center;gap:4px;">
          <input type="checkbox" class="itemIsLive" ${data.isLive ? "checked" : ""} />
          Live
        </label>

        <button onclick="this.parentElement.remove()">✕</button>
      `;

      container.appendChild(row);
    }

    function savePlaylist() {
      const name = document.getElementById("playlistName").value.trim();
      if (!name) return alert("Give the playlist a name.");

      const rows = document.querySelectorAll("#playlistItems .item-row");
      if (rows.length === 0) return alert("Add at least one item.");

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
            alert("Playlist updated.");
          });
      } else {
        db.collection("playlists").add({
          name,
          items,
          createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
          resetForm();
          alert("Playlist saved. Assign it to a screen from the Screens table above.");
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
