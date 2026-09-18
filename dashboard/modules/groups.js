(function () {
  const AppModules = window.AppModules || {};
  const appState = window.AppState;

  // 12-hour clock time options for group timer selects
  const CLOCK_TIMES_12H = (function () {
    const times = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        const period = h >= 12 ? 'PM' : 'AM';
        let h12 = h % 12;
        if (h12 === 0) h12 = 12;
        const hStr = String(h12).padStart(2, '0');
        const mStr = String(m).padStart(2, '0');
        times.push(`${hStr}:${mStr} ${period}`);
      }
    }
    return times;
  })();
  AppModules.CLOCK_TIMES_12H = CLOCK_TIMES_12H;

  // Populate a <select> with clock time options and pre-select the given value
  function populateClockOptions(selectEl, selectedValue) {
    selectEl.innerHTML = CLOCK_TIMES_12H.map(t =>
      `<option value="${t}" ${t === selectedValue ? 'selected' : ''}>${t}</option>`
    ).join('');
  }

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
        const lastSeenMs = lastSeen ? (lastSeen.toMillis ? lastSeen.toMillis() : (lastSeen.seconds ? lastSeen.seconds * 1000 : 0)) : (screen._lastSeenMs || 0);
        const diff = Date.now() - lastSeenMs;
        const isOnline = lastSeenMs > 0 && screen.appActive !== false && (diff >= -30000 && diff < 720000);
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

      const playlists = appState.playlistsCache || [];
      const clockTimes = AppModules.CLOCK_TIMES_12H || [];

      if (appState.groupsCache.length === 0) {
        container.innerHTML = `<tr><td colspan="10" class="text-muted text-center py-4">No screen groups created yet. Create one above to manage multiple screens at once!</td></tr>`;
        return;
      }

      container.innerHTML = appState.groupsCache.map((g) => {
        const memberIds = (g.screenIds || []).filter((id) => appState.screenDataCache[id]?.status === "paired");
        const memberScreens = memberIds.map((id) => {
          const s = appState.screenDataCache[id];
          const name = s ? (s.name || id) : id;
          const lastSeen = s?.lastSeen;
          const lastSeenMs = lastSeen ? (lastSeen.toMillis ? lastSeen.toMillis() : (lastSeen.seconds ? lastSeen.seconds * 1000 : 0)) : (s?._lastSeenMs || 0);
          const diff = Date.now() - lastSeenMs;
          const isOnline = lastSeenMs > 0 && s?.appActive !== false && (diff >= -30000 && diff < 720000);

          const tState = AppModules.getScreenTimerState ? AppModules.getScreenTimerState(s) : { status: "off" };

          const timerPlaylistObj = playlists.find(p => p.id === (s?.currentPlaylist || ""));
          const timerPlaylistName = timerPlaylistObj ? timerPlaylistObj.name : "None";

          const afterPlaylistObj = playlists.find(p => p.id === (s?.afterTimerPlaylist || ""));
          const afterPlaylistName = afterPlaylistObj ? afterPlaylistObj.name : "None";

          let statusDetail = "";
          if (tState.status === "active") {
            statusDetail = `<div class="text-success small fw-semibold">🟢 Playing: ${timerPlaylistName} (${tState.timerStart} - ${tState.timerEnd})</div>`;
          } else if (tState.status === "completed") {
            statusDetail = `<div class="text-warning small fw-semibold">⏰ Completed -> Auto Playing: ${afterPlaylistName}</div>`;
          } else {
            statusDetail = `<div class="text-muted small">Playing: ${timerPlaylistName}</div>`;
          }

          return `
            <div class="p-2 border rounded mb-1 bg-white shadow-sm">
              <div class="d-flex align-items-center justify-content-between gap-2">
                <div class="d-flex align-items-center gap-1 text-truncate">
                  <span class="dot ${isOnline ? 'online' : 'offline'}"></span>
                  <strong class="small text-dark text-truncate">${name}</strong>
                </div>
                ${tState.badgeHtml || ''}
              </div>
              ${statusDetail}
            </div>
          `;
        }).join("");

        const cached = groupSettingsCache[g.id] || {};
        const effectiveLayoutMode = cached.layoutMode !== undefined ? cached.layoutMode : (g.layoutMode || "single");
        const effectivePlaylist = cached.playlist !== undefined ? cached.playlist : (g.currentPlaylist || "");
        const effectiveAfterPlaylist = cached.afterTimerPlaylist !== undefined ? cached.afterTimerPlaylist : (g.afterTimerPlaylist || "");
        const effectiveTimerEnabled = cached.timerEnabled !== undefined ? cached.timerEnabled : (g.timerEnabled === true);
        const effectiveTimerStart = cached.timerStart !== undefined ? cached.timerStart : (g.timerStart || "09:00 AM");
        const effectiveTimerEnd = cached.timerEnd !== undefined ? cached.timerEnd : (g.timerEnd || "05:00 PM");
        const effectiveBottomWebUrl = cached.bottomWebUrl !== undefined ? cached.bottomWebUrl : (g.bottomWebUrl || "");
        const effectiveSplitRatio = cached.splitRatio !== undefined ? cached.splitRatio : (g.splitRatio || 20);
        const effectiveRotation = cached.rotation !== undefined ? cached.rotation : (g.rotation || 0);

        const playlistOptions = playlists.map((p) =>
          `<option value="${p.id}" ${p.id === effectivePlaylist ? "selected" : ""}>${p.name}</option>`
        ).join("");

        const afterPlaylistOptions = playlists.map((p) =>
          `<option value="${p.id}" ${p.id === effectiveAfterPlaylist ? "selected" : ""}>${p.name}</option>`
        ).join("");

        const startOptions = clockTimes.map((t) =>
          `<option value="${t}" ${t === effectiveTimerStart ? "selected" : ""}>${t}</option>`
        ).join("");

        const endOptions = clockTimes.map((t) =>
          `<option value="${t}" ${t === effectiveTimerEnd ? "selected" : ""}>${t}</option>`
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
              <div class="fw-bold text-dark" style="font-size:13.5px;">${g.name}</div>
              <div class="small text-muted mt-1">${memberIds.length} screen${memberIds.length === 1 ? '' : 's'}</div>
            </td>
            <td>
              <div class="d-flex flex-column gap-1" style="max-width: 420px;">
                ${memberScreens || '<span class="text-muted small">— no screens —</span>'}
              </div>
            </td>
            <td class="text-end" style="white-space:nowrap;">
              <div class="group-actions">
                <button class="btn btn-sm btn-light border" onclick="openGroupSettingsModal('${g.id}')" title="Settings & Timer">⚙️ Settings</button>
                <button class="btn btn-sm btn-primary-brand" onclick="applyGroupSettings('${g.id}')" ${memberIds.length === 0 ? 'disabled' : ''} title="Push to all screens">🚀 Push</button>
                <button class="btn btn-sm btn-outline-secondary" onclick="editGroup('${g.id}')" title="Edit group">✏️</button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteGroup('${g.id}')" title="Delete group">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }

    function openGroupSettingsModal(groupId) {
      const g = appState.groupsCache.find(entry => entry.id === groupId);
      if (!g) return;

      const modal = document.getElementById("groupSettingsModal");
      const titleEl = document.getElementById("groupSettingsTitle");
      const groupIdInput = document.getElementById("modalGroupId");
      if (!modal) return;

      groupIdInput.value = groupId;
      if (titleEl) titleEl.textContent = `Configure Group Settings & Timer — ${g.name}`;

      const cached = groupSettingsCache[groupId] || {};
      const effectiveLayoutMode = cached.layoutMode !== undefined ? cached.layoutMode : (g.layoutMode || "single");
      const effectivePlaylist = cached.playlist !== undefined ? cached.playlist : (g.currentPlaylist || "");
      const effectiveAfterPlaylist = cached.afterTimerPlaylist !== undefined ? cached.afterTimerPlaylist : (g.afterTimerPlaylist || "");
      const effectiveTimerEnabled = cached.timerEnabled !== undefined ? cached.timerEnabled : (g.timerEnabled === true);
      const effectiveTimerStart = cached.timerStart !== undefined ? cached.timerStart : (g.timerStart || "09:00 AM");
      const effectiveTimerEnd = cached.timerEnd !== undefined ? cached.timerEnd : (g.timerEnd || "05:00 PM");
      const effectiveBottomWebUrl = cached.bottomWebUrl !== undefined ? cached.bottomWebUrl : (g.bottomWebUrl || "");
      const effectiveSplitRatio = cached.splitRatio !== undefined ? cached.splitRatio : (g.splitRatio || 20);
      const effectiveRotation = cached.rotation !== undefined ? cached.rotation : (g.rotation || 0);

      const playlists = appState.playlistsCache || [];
      let playlistOpts = `<option value="">— none —</option>`;
      playlists.forEach(p => {
        playlistOpts += `<option value="${p.id}" ${p.id === effectivePlaylist ? "selected" : ""}>${p.name}</option>`;
      });
      const timerPlaylistSelect = document.getElementById("modalGroupPlaylist");
      if (timerPlaylistSelect) timerPlaylistSelect.innerHTML = playlistOpts;

      let afterOpts = `<option value="">— none —</option>`;
      playlists.forEach(p => {
        afterOpts += `<option value="${p.id}" ${p.id === effectiveAfterPlaylist ? "selected" : ""}>${p.name}</option>`;
      });
      const afterPlaylistSelect = document.getElementById("modalGroupAfterPlaylist");
      if (afterPlaylistSelect) afterPlaylistSelect.innerHTML = afterOpts;

      const timerEnabledCb = document.getElementById("modalGroupTimerEnabled");
      if (timerEnabledCb) timerEnabledCb.checked = effectiveTimerEnabled;

      const startSelect = document.getElementById("modalGroupTimerStart");
      const endSelect = document.getElementById("modalGroupTimerEnd");
      if (startSelect) populateClockOptions(startSelect, effectiveTimerStart);
      if (endSelect) populateClockOptions(endSelect, effectiveTimerEnd);

      const layoutSelect = document.getElementById("modalGroupLayoutMode");
      if (layoutSelect) layoutSelect.value = effectiveLayoutMode;

      const rotationSelect = document.getElementById("modalGroupRotation");
      if (rotationSelect) rotationSelect.value = effectiveRotation;

      const bottomUrlInput = document.getElementById("modalGroupBottomWebUrl");
      if (bottomUrlInput) bottomUrlInput.value = effectiveBottomWebUrl;

      const ratioSelect = document.getElementById("modalGroupSplitRatio");
      if (ratioSelect) ratioSelect.value = effectiveSplitRatio;

      toggleModalGroupTimerInputs(effectiveTimerEnabled);
      toggleModalGroupSplitInputs(effectiveLayoutMode);

      modal.style.display = "flex";
    }

    function toggleModalGroupTimerInputs(enabled) {
      const optionsGroup = document.getElementById("modalGroupTimerOptionsGroup");
      if (optionsGroup) {
        optionsGroup.style.opacity = enabled ? "1" : "0.5";
        optionsGroup.style.pointerEvents = enabled ? "auto" : "none";
      }
    }

    function toggleModalGroupSplitInputs(layoutMode) {
      const splitOptionsGroup = document.getElementById("modalGroupSplitOptions");
      if (splitOptionsGroup) {
        splitOptionsGroup.style.display = layoutMode === "split" ? "block" : "none";
      }
    }

    function closeGroupSettingsModal() {
      const modal = document.getElementById("groupSettingsModal");
      if (modal) modal.style.display = "none";
    }

    function saveGroupSettingsModal() {
      const groupId = document.getElementById("modalGroupId")?.value;
      if (!groupId) return;

      if (!groupSettingsCache[groupId]) groupSettingsCache[groupId] = {};

      const playlist = document.getElementById("modalGroupPlaylist")?.value || "";
      const afterPlaylist = document.getElementById("modalGroupAfterPlaylist")?.value || "";
      const timerEnabled = document.getElementById("modalGroupTimerEnabled")?.checked || false;
      const timerStart = document.getElementById("modalGroupTimerStart")?.value || "09:00 AM";
      const timerEnd = document.getElementById("modalGroupTimerEnd")?.value || "05:00 PM";
      const layoutMode = document.getElementById("modalGroupLayoutMode")?.value || "single";
      const rotation = parseInt(document.getElementById("modalGroupRotation")?.value || "0", 10);
      const bottomWebUrl = (document.getElementById("modalGroupBottomWebUrl")?.value || "").trim();
      const splitRatio = parseInt(document.getElementById("modalGroupSplitRatio")?.value || "20", 10);

      groupSettingsCache[groupId] = {
        playlist,
        afterTimerPlaylist: afterPlaylist,
        timerEnabled,
        timerStart,
        timerEnd,
        layoutMode,
        rotation,
        bottomWebUrl,
        splitRatio
      };

      closeGroupSettingsModal();
      renderGroupsTable();
      applyGroupSettings(groupId);
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

    function onGroupAfterPlaylistChange(groupId, val) {
      if (!groupSettingsCache[groupId]) groupSettingsCache[groupId] = {};
      groupSettingsCache[groupId].afterTimerPlaylist = val;
    }

    function onGroupTimerToggle(groupId, enabled) {
      if (!groupSettingsCache[groupId]) groupSettingsCache[groupId] = {};
      groupSettingsCache[groupId].timerEnabled = enabled;
      renderGroupsTable();
    }

    function onGroupTimerStartChange(groupId, val) {
      if (!groupSettingsCache[groupId]) groupSettingsCache[groupId] = {};
      groupSettingsCache[groupId].timerStart = val;
    }

    function onGroupTimerEndChange(groupId, val) {
      if (!groupSettingsCache[groupId]) groupSettingsCache[groupId] = {};
      groupSettingsCache[groupId].timerEnd = val;
    }

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
      const afterPlaylistSelect = document.getElementById(`groupAfterPlaylist_${groupId}`);
      const timerEnabledCb = document.getElementById(`groupTimerEnabled_${groupId}`);
      const timerStartSelect = document.getElementById(`groupTimerStart_${groupId}`);
      const timerEndSelect = document.getElementById(`groupTimerEnd_${groupId}`);
      const bottomWebUrlInput = document.getElementById(`groupBottomWebUrl_${groupId}`);
      const splitRatioSelect = document.getElementById(`groupSplitRatio_${groupId}`);
      const rotationSelect = document.getElementById(`groupRotation_${groupId}`);

      const layoutMode = layoutSelect ? layoutSelect.value : (group.layoutMode || "single");
      const currentPlaylist = playlistSelect ? playlistSelect.value : (group.currentPlaylist || "");
      const afterTimerPlaylist = afterPlaylistSelect ? afterPlaylistSelect.value : (group.afterTimerPlaylist || "");
      const timerEnabled = timerEnabledCb ? timerEnabledCb.checked : (group.timerEnabled === true);
      const timerStart = timerStartSelect ? timerStartSelect.value : (group.timerStart || "09:00 AM");
      const timerEnd = timerEndSelect ? timerEndSelect.value : (group.timerEnd || "05:00 PM");
      const bottomWebUrl = bottomWebUrlInput ? bottomWebUrlInput.value.trim() : (group.bottomWebUrl || "");
      const splitRatio = splitRatioSelect ? parseInt(splitRatioSelect.value, 10) : (group.splitRatio || 20);
      const rotation = rotationSelect ? parseInt(rotationSelect.value, 10) : (group.rotation || 0);

      const updateData = {
        layoutMode,
        currentPlaylist: currentPlaylist || null,
        afterTimerPlaylist: afterTimerPlaylist || null,
        timerEnabled,
        timerStart,
        timerEnd,
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
            AppModules.showToast(`Pushed playlist, clock timer, and settings to ${screenIds.length} screen${screenIds.length === 1 ? '' : 's'} in '${group.name}'!`, "success");
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
      openGroupSettingsModal,
      closeGroupSettingsModal,
      saveGroupSettingsModal,
      toggleModalGroupTimerInputs,
      toggleModalGroupSplitInputs,
      onGroupLayoutChange,
      onGroupPlaylistChange,
      onGroupAfterPlaylistChange,
      onGroupTimerToggle,
      onGroupTimerStartChange,
      onGroupTimerEndChange,
      onGroupBottomWebUrlChange,
      onGroupSplitRatioChange,
      onGroupRotationChange
    };
  };

  window.AppModules = AppModules;
})();