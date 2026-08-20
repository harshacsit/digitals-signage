(function () {
  const AppModules = window.AppModules || {};
  const appState = window.AppState;

  AppModules.createGroupsModule = function createGroupsModule({ db }) {
    // Local storage of group-level unsaved UI settings per groupId before pushing
    // { groupId: { layoutMode?, playlist?, bottomWebUrl?, splitRatio?, rotation? } }
    const groupSettingsCache = {};

    function watchGroups() {
      db.collection("groups").onSnapshot((snapshot) => {
        appState.groupsCache = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderGroupsTable();
        renderScreenCheckboxes();
      }, (err) => {
        console.error("Error watching groups:", err);
      });
    }

    function renderScreenCheckboxes() {
      const container = document.getElementById("groupScreenCheckboxes");
      if (!container) return;

      const pairedScreenIds = Object.keys(appState.screenDataCache).filter(
        (id) => appState.screenDataCache[id]?.status === "paired"
      );

      if (pairedScreenIds.length === 0) {
        container.innerHTML = `<div class="text-muted small py-2">No paired screens available. Pair a screen on the Screens tab first.</div>`;
        return;
      }

      let selectedIds = [];
      if (appState.editingGroupId) {
        const editingGroup = appState.groupsCache.find((g) => g.id === appState.editingGroupId);
        if (editingGroup) {
          selectedIds = editingGroup.screenIds || [];
        }
      }

      container.innerHTML = pairedScreenIds.map((id) => {
        const screen = appState.screenDataCache[id];
        const screenName = screen.name || `Screen (${id})`;
        const lastSeen = screen.lastSeen;
        const lastSeenMs = lastSeen ? (lastSeen.toMillis ? lastSeen.toMillis() : (lastSeen.seconds ? lastSeen.seconds * 1000 : 0)) : 0;
        const isOnline = Date.now() - lastSeenMs < 900000;
        const isChecked = selectedIds.includes(id);

        return `
          <div class="group-screen-item">
            <label class="form-check-label d-flex align-items-center gap-2 cursor-pointer w-100 mb-0">
              <input type="checkbox" class="form-check-input groupScreenCb" value="${id}" ${isChecked ? "checked" : ""} />
              <span class="dot ${isOnline ? "online" : "offline"}"></span>
              <span class="fw-medium text-truncate">${screenName}</span>
              <span class="text-muted small ms-auto">(${id})</span>
            </label>
          </div>
        `;
      }).join("");
    }

    function toggleSelectAllGroupScreens(selectAll) {
      const checkboxes = document.querySelectorAll(".groupScreenCb");
      checkboxes.forEach((cb) => { cb.checked = selectAll; });
    }

    function saveGroup() {
      const nameInput = document.getElementById("groupName");
      if (!nameInput) return;
      const name = nameInput.value.trim();

      if (!name) {
        if (AppModules.showToast) AppModules.showToast("Please enter a group name.", "error");
        else alert("Please enter a group name.");
        return;
      }

      const checkedCbs = document.querySelectorAll(".groupScreenCb:checked");
      const screenIds = Array.from(checkedCbs).map((cb) => cb.value);

      if (screenIds.length === 0) {
        if (AppModules.showToast) AppModules.showToast("Select at least one screen for the group.", "error");
        else alert("Select at least one screen for the group.");
        return;
      }

      const resetForm = () => {
        appState.editingGroupId = null;
        nameInput.value = "";
        const cancelBtn = document.getElementById("cancelGroupEditBtn");
        if (cancelBtn) cancelBtn.style.display = "none";
        renderScreenCheckboxes();
      };

      if (appState.editingGroupId) {
        db.collection("groups").doc(appState.editingGroupId).update({
          name,
          screenIds,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
          resetForm();
          if (AppModules.showToast) AppModules.showToast(`Group '${name}' updated!`, "success");
        }).catch((err) => {
          if (AppModules.showToast) AppModules.showToast(`Update failed: ${err.message}`, "error");
        });
      } else {
        db.collection("groups").add({
          name,
          screenIds,
          createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
          resetForm();
          if (AppModules.showToast) AppModules.showToast(`Group '${name}' created successfully!`, "success");
        }).catch((err) => {
          if (AppModules.showToast) AppModules.showToast(`Create failed: ${err.message}`, "error");
        });
      }
    }

    function editGroup(groupId) {
      const group = appState.groupsCache.find((g) => g.id === groupId);
      if (!group) return;

      appState.editingGroupId = groupId;
      const nameInput = document.getElementById("groupName");
      if (nameInput) nameInput.value = group.name;

      const cancelBtn = document.getElementById("cancelGroupEditBtn");
      if (cancelBtn) cancelBtn.style.display = "inline-block";

      renderScreenCheckboxes();
      nameInput?.scrollIntoView({ behavior: "smooth" });
      if (AppModules.showToast) AppModules.showToast(`Editing group '${group.name}'`, "info");
    }

    function cancelEditGroup() {
      appState.editingGroupId = null;
      const nameInput = document.getElementById("groupName");
      if (nameInput) nameInput.value = "";
      const cancelBtn = document.getElementById("cancelGroupEditBtn");
      if (cancelBtn) cancelBtn.style.display = "none";
      renderScreenCheckboxes();
    }

    function deleteGroup(groupId) {
      const group = appState.groupsCache.find((g) => g.id === groupId);
      const groupName = group ? group.name : "this group";
      if (!confirm(`Delete '${groupName}'? Assigned screens will keep their current settings.`)) return;

      db.collection("groups").doc(groupId).delete()
        .then(() => {
          if (appState.editingGroupId === groupId) cancelEditGroup();
          if (AppModules.showToast) AppModules.showToast(`Group '${groupName}' deleted.`, "info");
        })
        .catch((err) => {
          if (AppModules.showToast) AppModules.showToast(`Delete failed: ${err.message}`, "error");
        });
    }

    function renderGroupsTable() {
      const container = document.getElementById("groupsBody");
      if (!container) return;

      if (appState.groupsCache.length === 0) {
        container.innerHTML = `<tr><td colspan="8" class="text-muted text-center py-4">No screen groups created yet. Create one above to manage multiple screens at once!</td></tr>`;
        return;
      }

      container.innerHTML = appState.groupsCache.map((g) => {
        const memberIds = g.screenIds || [];
        const memberScreens = memberIds.map((id) => {
          const s = appState.screenDataCache[id];
          const name = s ? (s.name || id) : id;
          const lastSeen = s?.lastSeen;
          const lastSeenMs = lastSeen ? (lastSeen.toMillis ? lastSeen.toMillis() : (lastSeen.seconds ? lastSeen.seconds * 1000 : 0)) : 0;
          const isOnline = Date.now() - lastSeenMs < 900000;
          return `<span class="badge ${isOnline ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-light text-muted border'} px-2 py-1 me-1 mb-1" title="${id}">${name}</span>`;
        }).join("");

        const cached = groupSettingsCache[g.id] || {};
        const effectiveLayoutMode = cached.layoutMode !== undefined ? cached.layoutMode : (g.layoutMode || "single");
        const effectivePlaylist = cached.playlist !== undefined ? cached.playlist : (g.currentPlaylist || "");
        // ===== CHANGED: was effectiveBottomPlaylist / bottomPlaylistOptions select.
        // Bottom zone is a URL now, not a playlist — matches Android's gate on bottomWebUrl.
        const effectiveBottomWebUrl = cached.bottomWebUrl !== undefined ? cached.bottomWebUrl : (g.bottomWebUrl || "");
        const effectiveSplitRatio = cached.splitRatio !== undefined ? cached.splitRatio : (g.splitRatio || 20);
        const effectiveRotation = cached.rotation !== undefined ? cached.rotation : (g.rotation || 0);

        const playlistOptions = appState.playlistsCache.map((p) =>
          `<option value="${p.id}" ${p.id === effectivePlaylist ? "selected" : ""}>${p.name}</option>`
        ).join("");

        const ratioOptions = [10, 20, 30, 40].map((pct) =>
          `<option value="${pct}" ${pct === effectiveSplitRatio ? "selected" : ""}>${pct}% bottom</option>`
        ).join("");

        const rotationOptions = [0, 90, 180, 270].map((deg) =>
          `<option value="${deg}" ${deg === effectiveRotation ? "selected" : ""}>${deg}°</option>`
        ).join("");

        const safeBottomWebUrl = (effectiveBottomWebUrl || "").replace(/"/g, "&quot;");

        return `
          <tr>
            <td>
              <div class="fw-bold text-dark">${g.name}</div>
              <div class="small text-muted">${memberIds.length} screen${memberIds.length === 1 ? '' : 's'}</div>
            </td>
            <td style="max-width: 250px;">${memberScreens || '<span class="text-muted small">— no screens —</span>'}</td>
            <td>
              <select class="form-select form-select-sm" id="groupLayout_${g.id}" onchange="onGroupLayoutChange('${g.id}', this.value)">
                <option value="single" ${effectiveLayoutMode === "single" ? "selected" : ""}>Single</option>
                <option value="split" ${effectiveLayoutMode === "split" ? "selected" : ""}>Split</option>
              </select>
            </td>
            <td>
              <select class="form-select form-select-sm" id="groupPlaylist_${g.id}" onchange="onGroupPlaylistChange('${g.id}', this.value)">
                <option value="" ${effectivePlaylist === "" ? "selected" : ""}>— none —</option>
                ${playlistOptions}
              </select>
            </td>
            <td>
              ${effectiveLayoutMode === "split" ? `
                <input type="text" class="form-control form-control-sm" id="groupBottomWebUrl_${g.id}"
                  placeholder="https://... (bottom strip URL)" value="${safeBottomWebUrl}"
                  onchange="onGroupBottomWebUrlChange('${g.id}', this.value)" />
              ` : '<span class="text-muted small">—</span>'}
            </td>
            <td>
              ${effectiveLayoutMode === "split" ? `
                <select class="form-select form-select-sm" id="groupSplitRatio_${g.id}" onchange="onGroupSplitRatioChange('${g.id}', this.value)">
                  ${ratioOptions}
                </select>
              ` : '<span class="text-muted small">—</span>'}
            </td>
            <td>
              <select class="form-select form-select-sm" id="groupRotation_${g.id}" onchange="onGroupRotationChange('${g.id}', this.value)">
                ${rotationOptions}
              </select>
            </td>
            <td class="text-end">
              <div class="d-inline-flex gap-1 align-items-center justify-content-end">
                <button class="btn btn-sm btn-primary-brand" onclick="applyGroupSettings('${g.id}')" ${memberIds.length === 0 ? "disabled" : ""}>Push to Group</button>
                <button class="secondary" onclick="editGroup('${g.id}')">Edit</button>
                <button class="secondary danger" onclick="deleteGroup('${g.id}')">Delete</button>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }

    function onGroupLayoutChange(groupId, val) {
      if (!groupSettingsCache[groupId]) groupSettingsCache[groupId] = {};
      groupSettingsCache[groupId].layoutMode = val;
      renderGroupsTable();
    }

    function onGroupPlaylistChange(groupId, val) {
      if (!groupSettingsCache[groupId]) groupSettingsCache[groupId] = {};
      groupSettingsCache[groupId].playlist = val;
    }

    // ===== CHANGED: replaces onGroupBottomPlaylistChange =====
    function onGroupBottomWebUrlChange(groupId, val) {
      if (!groupSettingsCache[groupId]) groupSettingsCache[groupId] = {};
      groupSettingsCache[groupId].bottomWebUrl = val.trim();
    }

    function onGroupSplitRatioChange(groupId, val) {
      if (!groupSettingsCache[groupId]) groupSettingsCache[groupId] = {};
      groupSettingsCache[groupId].splitRatio = parseInt(val, 10);
    }

    function onGroupRotationChange(groupId, val) {
      if (!groupSettingsCache[groupId]) groupSettingsCache[groupId] = {};
      groupSettingsCache[groupId].rotation = parseInt(val, 10);
    }

    function applyGroupSettings(groupId) {
      const group = appState.groupsCache.find((g) => g.id === groupId);
      if (!group) return;

      const screenIds = group.screenIds || [];
      if (screenIds.length === 0) {
        if (AppModules.showToast) AppModules.showToast("This group has no screens assigned.", "error");
        else alert("No screens in this group.");
        return;
      }

      const layoutSelect = document.getElementById(`groupLayout_${groupId}`);
      const playlistSelect = document.getElementById(`groupPlaylist_${groupId}`);
      const bottomWebUrlInput = document.getElementById(`groupBottomWebUrl_${groupId}`);
      const splitRatioSelect = document.getElementById(`groupSplitRatio_${groupId}`);
      const rotationSelect = document.getElementById(`groupRotation_${groupId}`);

      const layoutMode = layoutSelect ? layoutSelect.value : (group.layoutMode || "single");
      const currentPlaylist = playlistSelect ? playlistSelect.value : (group.currentPlaylist || "");
      const bottomWebUrl = bottomWebUrlInput ? bottomWebUrlInput.value.trim() : (group.bottomWebUrl || "");
      const splitRatio = splitRatioSelect ? parseInt(splitRatioSelect.value, 10) : (group.splitRatio || 20);
      const rotation = rotationSelect ? parseInt(rotationSelect.value, 10) : (group.rotation || 0);

      const updateData = {
        layoutMode,
        currentPlaylist: currentPlaylist || null,
        bottomWebUrl: (layoutMode === "split" && bottomWebUrl) ? bottomWebUrl : null,
        splitRatio: layoutMode === "split" ? splitRatio : 20,
        rotation
      };

      const batch = db.batch();

      screenIds.forEach((screenId) => {
        const screenRef = db.collection("screens").doc(screenId);
        batch.update(screenRef, updateData);
      });

      const groupRef = db.collection("groups").doc(groupId);
      batch.update(groupRef, {
        ...updateData,
        lastPushedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      });

      batch.commit()
        .then(() => {
          delete groupSettingsCache[groupId];
          if (AppModules.showToast) {
            AppModules.showToast(`Pushed settings to ${screenIds.length} screen${screenIds.length === 1 ? '' : 's'} in '${group.name}'!`, "success");
          } else {
            alert(`Updated ${screenIds.length} screens in group '${group.name}'.`);
          }
        })
        .catch((err) => {
          if (AppModules.showToast) AppModules.showToast(`Group push failed: ${err.message}`, "error");
          else alert(`Group push failed: ${err.message}`);
        });
    }

    return {
      watchGroups,
      renderGroupsTable,
      renderScreenCheckboxes,
      toggleSelectAllGroupScreens,
      saveGroup,
      editGroup,
      cancelEditGroup,
      deleteGroup,
      applyGroupSettings,
      onGroupLayoutChange,
      onGroupPlaylistChange,
      onGroupBottomWebUrlChange,
      onGroupSplitRatioChange,
      onGroupRotationChange
    };
  };

  window.AppModules = AppModules;
})();