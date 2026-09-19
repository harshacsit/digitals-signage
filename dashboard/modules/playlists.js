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
        if (typeof window.populateMassLaunchPlaylists === "function") {
          window.populateMassLaunchPlaylists();
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

      container.innerHTML = appState.playlistsCache.map((p) => {
        const items = p.items || [];
        const visibleItems = items.slice(0, 4);
        let itemBadges = visibleItems.map(i => {
          let rawName = i.name || i.label;
          if (!rawName && i.url) {
            try { rawName = decodeURIComponent(i.url.split('/').pop().split('?')[0]); } catch (e) { rawName = i.url.split('/').pop().split('?')[0]; }
          }
          if (!rawName) rawName = 'Unnamed Media';
          // Clean leading Unix timestamp prefixes (e.g. 1789365581324_)
          let cleanName = rawName.replace(/^\d{10,14}_/, '');
          if (cleanName.length > 22) {
            cleanName = cleanName.substring(0, 19) + '...';
          }
          const typeLabel = i.type === 'video' ? 'Video' : (i.type === 'web' ? 'Web' : 'Image');
          const typeClass = i.type === 'video' ? 'is-video' : (i.type === 'web' ? 'is-web' : 'is-image');
          return `<span class="type-chip ${typeClass}" title="${i.name || i.url || ''}">${typeLabel} · ${cleanName}</span>`;
        }).join('');

        if (items.length > 4) {
          itemBadges += ` <span class="badge bg-secondary-subtle text-secondary border mb-1">+${items.length - 4} more</span>`;
        }

        return `
          <tr>
            <td>
              <div class="fw-bold text-dark fs-6 mb-1">${p.name}</div>
              <div class="d-flex flex-wrap gap-1 align-items-center">${itemBadges || '<span class="text-muted small">No items</span>'}</div>
            </td>
            <td><span class="badge bg-secondary-subtle text-dark border px-2 py-1">${items.length} item${items.length === 1 ? '' : 's'}</span></td>
            <td class="text-end">
              <div class="toolbar-btns">
                <button class="secondary" onclick="editPlaylist('${p.id}')">Edit</button>
                <button class="secondary danger" onclick="deletePlaylist('${p.id}')">Delete</button>
              </div>
            </td>
          </tr>`;
      }).join("");
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

      // Unique ID so the hidden file input and its button can be linked per-row
      const uid = "r2_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      const safeName = (data.name || data.label || "").replace(/"/g, "&quot;");

      row.innerHTML = `
        <!-- Move Up / Move Down Buttons -->
        <div class="item-field-wrap field-order">
          <label class="item-field-label text-center">Order</label>
          <div class="item-order-btns">
            <button type="button" class="btn-order btn-order-up" title="Move Item Up">▲</button>
            <button type="button" class="btn-order btn-order-down" title="Move Item Down">▼</button>
          </div>
        </div>

        <!-- Media / Ad Name Field -->
        <div class="item-field-wrap field-name">
          <label class="item-field-label">Media Name</label>
          <input class="itemName" placeholder="e.g. Special Offer Banner" value="${safeName}" />
        </div>

        <!-- Media Type Select -->
        <div class="item-field-wrap field-type">
          <label class="item-field-label">Type</label>
          <select class="itemType">
            <option value="image" ${data.type !== "video" && data.type !== "web" ? "selected" : ""}>Image</option>
            <option value="video" ${data.type === "video" ? "selected" : ""}>Video</option>
            <option value="web" ${data.type === "web" ? "selected" : ""}>Web / YouTube</option>
          </select>
        </div>

        <!-- URL input + Upload button -->
        <div class="item-field-wrap field-url">
          <label class="item-field-label">Media URL / Cloud File</label>
          <div class="r2-url-input-group">
            <input class="itemUrl" placeholder="Paste a URL —OR— pick a file →" value="${data.url || ""}" />
            <button class="btn-upload-file" type="button" title="Pick a file from your computer and upload it to cloud storage">
              Upload file
            </button>
            <input type="file" id="${uid}" class="r2-file-input" accept="video/*,image/*" style="display:none" />
          </div>
        </div>

        <!-- Upload progress bar -->
        <div class="r2-progress-wrap" style="display:none; width:100%; margin-top:4px;">
          <div class="r2-progress-bar">
            <div class="r2-progress-fill" style="width:0%"></div>
          </div>
          <span class="r2-progress-label">0%</span>
        </div>

        <!-- Duration Seconds -->
        <div class="item-field-wrap field-duration">
          <label class="item-field-label">Duration</label>
          <div class="d-flex align-items-center gap-1">
            <input class="itemDuration" type="number" placeholder="Sec" value="${data.durationSeconds || 8}" />
            <span class="small text-muted fw-semibold">s</span>
          </div>
        </div>

        <!-- Resize Mode -->
        <div class="item-field-wrap field-resize">
          <label class="item-field-label">Resize</label>
          <select class="itemResizeMode">
            <option value="fit" ${(data.resizeMode || "fit") === "fit" ? "selected" : ""}>Fit (bars)</option>
            <option value="fill" ${data.resizeMode === "fill" ? "selected" : ""}>Fill (crop)</option>
            <option value="stretch" ${data.resizeMode === "stretch" ? "selected" : ""}>Stretch</option>
          </select>
        </div>

        <!-- Rotation -->
        <div class="item-field-wrap field-rotation">
          <label class="item-field-label">Rotation</label>
          <select class="itemRotation">
            <option value="0" ${(data.rotation || 0) === 0 ? "selected" : ""}>0°</option>
            <option value="90" ${data.rotation === 90 ? "selected" : ""}>90°</option>
            <option value="180" ${data.rotation === 180 ? "selected" : ""}>180°</option>
            <option value="270" ${data.rotation === 270 ? "selected" : ""}>270°</option>
          </select>
        </div>

        <!-- Live Checkbox -->
        <div class="item-field-wrap field-live">
          <label class="item-field-label">&nbsp;</label>
          <label class="small text-dark fw-semibold d-flex align-items-center gap-1 cursor-pointer mb-0">
            <input type="checkbox" class="itemIsLive" ${data.isLive ? "checked" : ""} />
            Live
          </label>
        </div>

        <!-- Copy & Remove Buttons -->
        <div class="item-field-wrap field-action ms-auto">
          <label class="item-field-label">&nbsp;</label>
          <div class="d-flex gap-1">
            <button type="button" class="btn-copy-row" title="Copy this media item to a new row below">Copy</button>
            <button type="button" class="btn-remove" onclick="this.closest('.item-row').remove()" title="Remove item">✕</button>
          </div>
        </div>
      `;

      container.appendChild(row);

      // ── Wire up Move Up & Move Down reordering buttons ─────────────────────
      const btnUp = row.querySelector(".btn-order-up");
      const btnDown = row.querySelector(".btn-order-down");

      if (btnUp) {
        btnUp.addEventListener("click", function () {
          const prev = row.previousElementSibling;
          if (prev && prev.classList.contains("item-row")) {
            row.parentNode.insertBefore(row, prev);
          }
        });
      }

      if (btnDown) {
        btnDown.addEventListener("click", function () {
          const next = row.nextElementSibling;
          if (next && next.classList.contains("item-row")) {
            row.parentNode.insertBefore(next, row);
          }
        });
      }

      // ── Wire up the Copy button ────────────────────────────────────────────
      const btnCopy = row.querySelector(".btn-copy-row");
      if (btnCopy) {
        btnCopy.addEventListener("click", function () {
          // Snapshot all current field values from this row
          const copyData = {
            name: row.querySelector(".itemName")?.value.trim() || "",
            type: row.querySelector(".itemType")?.value || "image",
            url: row.querySelector(".itemUrl")?.value.trim() || "",
            durationSeconds: parseInt(row.querySelector(".itemDuration")?.value, 10) || 8,
            resizeMode: row.querySelector(".itemResizeMode")?.value || "fit",
            rotation: parseInt(row.querySelector(".itemRotation")?.value, 10) || 0,
            isLive: row.querySelector(".itemIsLive")?.checked || false
          };

          // Build the new row using the same addPlaylistItemRow function
          // We need to insert it right AFTER the current row, not at the end.
          // Strategy: append to container first, then move it after the current row.
          addPlaylistItemRow(copyData);

          // Move the newly appended row to be right after the current row
          const allRows = container.querySelectorAll(".item-row");
          const newRow = allRows[allRows.length - 1];
          if (newRow && newRow !== row) {
            row.after(newRow);
          }

          if (AppModules.showToast) {
            AppModules.showToast("Media item copied below.", "info");
          }
        });
      }

      // ── Wire up the upload button for this row ──────────────────────────────
      const fileInput   = row.querySelector("#" + uid);
      const uploadBtn   = row.querySelector(".btn-upload-file");
      const urlInput    = row.querySelector(".itemUrl");
      const nameInput   = row.querySelector(".itemName");
      const typeSelect  = row.querySelector(".itemType");
      const progressWrap = row.querySelector(".r2-progress-wrap");
      const progressFill = row.querySelector(".r2-progress-fill");
      const progressLbl  = row.querySelector(".r2-progress-label");

      // Clicking the styled button triggers the hidden file input
      uploadBtn.addEventListener("click", function () {
        fileInput.click();
      });

      // When a file is chosen, start the upload
      fileInput.addEventListener("change", function () {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;

        // Auto-fill Media Name if empty
        if (nameInput && !nameInput.value.trim()) {
          nameInput.value = file.name;
        }

        // Auto-select type based on MIME
        if (file.type.startsWith("video/")) {
          typeSelect.value = "video";
        } else if (file.type.startsWith("image/")) {
          typeSelect.value = "image";
        }

        // Show progress bar, disable controls during upload
        progressWrap.style.display = "flex";
        progressFill.style.width = "0%";
        progressLbl.textContent = "0%";
        uploadBtn.disabled = true;
        uploadBtn.textContent = "Uploading…";
        urlInput.disabled = true;

        if (!window.R2Upload) {
          if (AppModules.showToast) AppModules.showToast("Upload helper not loaded. Refresh the page.", "error");
          resetControls();
          return;
        }

        window.R2Upload.upload(file, function (pct) {
          progressFill.style.width = pct + "%";
          progressLbl.textContent = pct + "%";
        })
        .then(function (result) {
          urlInput.value = result.url;
          progressFill.style.width = "100%";
          progressLbl.textContent = "Done!";
          progressFill.style.background = "var(--green)";
          if (AppModules.showToast) AppModules.showToast("File uploaded! URL filled in.", "success");
          setTimeout(function () { progressWrap.style.display = "none"; }, 2000);
          resetControls();
        })
        .catch(function (err) {
          if (AppModules.showToast) AppModules.showToast("Upload failed: " + err.message, "error");
          else alert("Upload failed: " + err.message);
          progressWrap.style.display = "none";
          resetControls();
        })
        .finally(function () {
          // Reset so the same file can be re-selected if needed
          fileInput.value = "";
        });

        function resetControls() {
          uploadBtn.disabled = false;
          uploadBtn.textContent = "Upload file";
          urlInput.disabled = false;
        }
      });
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
        name: row.querySelector(".itemName") ? row.querySelector(".itemName").value.trim() : "",
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

