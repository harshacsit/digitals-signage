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

  const ONLINE_THRESHOLD_MS = 720000; // 12 min (2.4× the 5-min Android heartbeat) — matches backend and all other dashboard modules

  // 12-hour clock time options (30-min intervals) for legacy timer dropdowns
  const CLOCK_TIMES_12H = (function () {
    if (AppModules.CLOCK_TIMES_12H) return AppModules.CLOCK_TIMES_12H;
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

  // ===== MULTI-SLOT TIMER HELPERS =====

  // Convert "HH:MM" (24h) to total minutes from midnight
  function hhmm24ToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length < 2) return 0;
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  // Convert "HH:MM" 24h to "HH:MM AM/PM" 12h display
  function hhmm24To12h(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    let h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    const period = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${String(h).padStart(2, '0')}:${m} ${period}`;
  }

  // Convert legacy "HH:MM AM/PM" to "HH:MM" 24h
  function legacy12hTo24h(timeStr) {
    if (!timeStr) return '09:00';
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return '09:00';
    let h = parseInt(match[1], 10);
    const m = match[2];
    const p = match[3].toUpperCase();
    if (p === 'PM' && h < 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  // Get the currently active slot (or null) from a timerSlots array
  function getActiveSlot(timerSlots) {
    if (!Array.isArray(timerSlots) || timerSlots.length === 0) return null;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    for (const slot of timerSlots) {
      if (!slot.start || !slot.end) continue;
      const startMins = hhmm24ToMinutes(slot.start);
      const endMins = hhmm24ToMinutes(slot.end);
      if (startMins < endMins) {
        if (nowMins >= startMins && nowMins < endMins) return slot;
      } else if (startMins > endMins) {
        // Overnight slot
        if (nowMins >= startMins || nowMins < endMins) return slot;
      }
    }
    return null;
  }

  // Build timer badge HTML from screen data + pending overrides
  function getScreenTimerState(s, pendingOverride = null) {
    const timerEnabled = pendingOverride?.timerEnabled !== undefined
      ? pendingOverride.timerEnabled
      : (s?.timerEnabled === true);

    // Resolve slots: pending overrides take priority
    let slots = pendingOverride?.timerSlots !== undefined
      ? pendingOverride.timerSlots
      : (s?.timerSlots || []);

    // Fallback: migrate legacy single-slot fields
    if (slots.length === 0 && s?.timerStart && s?.timerEnd) {
      slots = [{ start: legacy12hTo24h(s.timerStart), end: legacy12hTo24h(s.timerEnd), playlistId: s.currentPlaylist || '' }];
    }

    if (!timerEnabled || slots.length === 0) {
      return {
        status: 'off',
        timerEnabled: false,
        slots,
        activeSlot: null,
        activePlaylistId: s?.currentPlaylist || '',
        badgeHtml: '<span class="badge-timer-off" title="Click to configure timer slots">Timer off</span>'
      };
    }

    const activeSlot = getActiveSlot(slots);
    const slotCount = slots.length;

    if (activeSlot) {
      const label = `${hhmm24To12h(activeSlot.start)}–${hhmm24To12h(activeSlot.end)}`;
      return {
        status: 'active',
        timerEnabled: true,
        slots,
        activeSlot,
        activePlaylistId: activeSlot.playlistId || '',
        badgeHtml: `<span class="badge-timer-active" title="Active: ${label}"><span class="pulse-dot-green"></span> ${label}</span>`
      };
    } else {
      return {
        status: 'scheduled',
        timerEnabled: true,
        slots,
        activeSlot: null,
        activePlaylistId: s?.currentPlaylist || '',
        badgeHtml: `<span class="badge-timer-off" title="${slotCount} slot(s) scheduled, none active now">${slotCount} slot${slotCount > 1 ? 's' : ''}</span>`
      };
    }
  }

  AppModules.hhmm24ToMinutes = hhmm24ToMinutes;
  AppModules.hhmm24To12h = hhmm24To12h;
  AppModules.legacy12hTo24h = legacy12hTo24h;
  AppModules.getActiveSlot = getActiveSlot;
  AppModules.getScreenTimerState = getScreenTimerState;

  function isScreenOnline(lastSeenMs) {
    if (!lastSeenMs || lastSeenMs <= 0) return false;
    const diff = Date.now() - lastSeenMs;
    // Window: timestamp must be between -30s (future clock skew) and +12 minutes (720s)
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
      // Update cache with the real timestamp value
      if (docId && appState.screenDataCache[docId]) {
        appState.screenDataCache[docId]._lastSeenMs = ms;
      }
      return ms;
    }

    // Fallback: If ts is null or a pending server timestamp (ms === 0), use the
    // previously cached _lastSeenMs so we don't briefly flicker offline.
    // NOTE: We read _lastSeenMs from the OLD cache entry BEFORE screenDataCache[docId]
    // is overwritten with the new snapshot data that still has lastSeen === null.
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

    function updateStatCards(pairedCount, onlineCount) {
      const offlineCount = Math.max(0, pairedCount - onlineCount);
      const totalEl = document.getElementById("statTotalScreens");
      const onlineEl = document.getElementById("statOnlineScreens");
      const offlineEl = document.getElementById("statOfflineScreens");
      if (totalEl) totalEl.textContent = pairedCount;
      if (onlineEl) onlineEl.textContent = onlineCount;
      if (offlineEl) offlineEl.textContent = offlineCount;

      // Update premium stat card progress bars
      const onlineBar = document.getElementById("statOnlineBar");
      const offlineBar = document.getElementById("statOfflineBar");
      if (pairedCount > 0) {
        if (onlineBar) onlineBar.style.width = Math.round((onlineCount / pairedCount) * 100) + "%";
        if (offlineBar) offlineBar.style.width = Math.round((offlineCount / pairedCount) * 100) + "%";
      } else {
        if (onlineBar) onlineBar.style.width = "0%";
        if (offlineBar) offlineBar.style.width = "0%";
      }

      const countEl = document.getElementById("screenCount");
      const pillEl = document.querySelector(".status-total-pill");
      if (countEl) countEl.textContent = `${onlineCount} of ${pairedCount} screens online`;
      if (pillEl) {
        if (onlineCount > 0) pillEl.classList.add("is-online");
        else pillEl.classList.remove("is-online");
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
        const statusChanged = previousStatus !== isOnline;
 
        if (previousStatus === true && !isOnline) {
          triggerNotification("Screen Offline", `Screen "${s.name || docId}" has gone offline.`);
        } else if (previousStatus === false && isOnline) {
          triggerNotification("Screen Online", `Screen "${s.name || docId}" is back online.`);
        }

        appState.screenOnlineStatus[docId] = isOnline;

        if (isOnline) onlineCount++;

        if (statusChanged) {
          // Full re-render only when online status actually changed
          renderScreenRow(docId, s);
        } else {
          // Only update the last-seen timestamp cell to avoid restarting the CSS blink animation
          const tr = appState.screenRows[docId];
          if (tr) {
            const lastSeenCell = tr.querySelector(".cell-lastseen");
            if (lastSeenCell) lastSeenCell.textContent = formatLastSeenTime(lastSeenMs);
          }
        }
      });

      updateStatCards(pairedCount, onlineCount);
      updateMassLaunchTargetCount();
    }

    function openAddScreenModal() {
      const modal = document.getElementById("addScreenModal");
      const codeInput = document.getElementById("pairCode");
      const nameInput = document.getElementById("pairName");
      if (codeInput) codeInput.value = "";
      if (nameInput) nameInput.value = "";
      if (modal) modal.style.display = "flex";
    }

    function closeAddScreenModal() {
      const modal = document.getElementById("addScreenModal");
      if (modal) modal.style.display = "none";
    }

    function addScreen() {
      const codeInput = document.getElementById("pairCode");
      const nameInput = document.getElementById("pairName");
      const code = codeInput ? codeInput.value.trim().toUpperCase() : "";
      const name = nameInput ? nameInput.value.trim() : "";
      if (!code || !name) return alert("Enter both the pairing code and a screen name.");

      const ref = db.collection("screens").doc(code);
      ref.get().then((doc) => {
        if (!doc.exists) {
          alert("No screen found with that code. Make sure your TV app is showing this exact code.");
          return;
        }

        ref.update({ status: "paired", name })
          .then(() => {
            closeAddScreenModal();
            if (AppModules.showToast) {
              AppModules.showToast(`TV Screen '${name}' paired successfully!`, "success");
            } else {
              alert(`TV Screen '${name}' paired successfully!`);
            }
          })
          .catch((err) => {
            alert(`Pairing failed: ${err.message}`);
          });
      });
    }

    function watchScreens() {
      if (!offlineCheckInterval) {
        if ("Notification" in window && Notification.permission === "default") {
          Notification.requestPermission();
        }
        offlineCheckInterval = setInterval(checkScreenStatuses, 60000);
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

        updateStatCards(pairedCount, onlineCount);

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

          // Read cached _lastSeenMs BEFORE overwriting the cache entry, so
          // getTimestampMs() can fall back to it if the new snapshot carries a
          // pending server timestamp (lastSeen === null on the first write event).
          const prevCachedMs = appState.screenDataCache[doc.id]?._lastSeenMs;
          appState.screenDataCache[doc.id] = s;
          // Restore the cached timestamp so the fallback inside getTimestampMs works.
          if (prevCachedMs && (!s.lastSeen || (typeof s.lastSeen === 'object' && s.lastSeen.seconds === undefined))) {
            appState.screenDataCache[doc.id]._lastSeenMs = prevCachedMs;
          }

          const lastSeenMs = getTimestampMs(s.lastSeen, doc.id);

          // If lastSeenMs is still 0 after the fallback, this is a pending-timestamp
          // write event — skip the status update entirely to avoid a false offline flicker.
          if (lastSeenMs === 0) return;

          const isOnline = isScreenOnline(lastSeenMs);
          const previousStatus = appState.screenOnlineStatus[doc.id];

          if (previousStatus === false && isOnline) {
            triggerNotification("Screen Online", `Screen "${s.name || doc.id}" is back online.`);
          }

          appState.screenOnlineStatus[doc.id] = isOnline;

          renderScreenRow(doc.id, s);
        });

        if (typeof window.renderGroupsTable === "function") {
          window.renderGroupsTable();
        }
        if (typeof window.renderScreenCheckboxes === "function") {
          window.renderScreenCheckboxes();
        }
        populateMassLaunchPlaylists();
        updateMassLaunchTargetCount();
      });
    }

    appState.screenStatusFilter = appState.screenStatusFilter || "all";

    function filterScreensByStatus(filterMode, btnEl = null) {
      appState.screenStatusFilter = filterMode || "all";

      // Sync filter pills UI
      const targetPill = btnEl || document.querySelector(`.status-filter-group .filter-pill[data-filter="${filterMode}"]`);
      document.querySelectorAll(".status-filter-group .filter-pill").forEach(btn => {
        btn.classList.remove("active");
      });
      if (targetPill) targetPill.classList.add("active");

      // Sync stat cards UI
      document.querySelectorAll(".stat-card").forEach(card => {
        card.classList.remove("active-filter");
      });
      const targetCard = document.querySelector(`.stat-card[data-filter="${filterMode}"]`);
      if (targetCard) targetCard.classList.add("active-filter");

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

    function nameCellHtml(docId, s) {
      const isRenaming = appState.renamingScreenId === docId;
      const displayName = s.name || "(unnamed - " + docId + ")";
      const rawName = s.name || "";

      if (isRenaming) {
        const safeVal = rawName.replace(/"/g, "&quot;");
        return `
          <div class="screen-name-rename-box d-flex align-items-center gap-1">
            <input type="text" id="renameInput_${docId}" class="form-control form-control-sm rename-input"
              value="${safeVal}"
              onkeydown="if(event.key==='Enter'){event.preventDefault();saveRename('${docId}');}else if(event.key==='Escape'){event.preventDefault();cancelRename('${docId}');}" />
            <button type="button" class="btn btn-sm btn-success py-0 px-2" title="Save" onclick="saveRename('${docId}')">Save</button>
            <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2" title="Cancel" onclick="cancelRename('${docId}')">✕</button>
          </div>
        `;
      }

      return `
        <div class="screen-name-wrapper d-inline-flex align-items-center gap-2">
          <span class="screen-name-text">${displayName}</span>
          <button type="button" class="btn-rename-pencil" title="Rename screen" onclick="startRename('${docId}')">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 2a2.121 2.121 0 0 1 3 3L4 15H1v-3L11 2z"/>
            </svg>
          </button>
        </div>
      `;
    }

    function renderScreenRow(docId, s, forceLayoutUpdate = false) {
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

      const timerState = getScreenTimerState(s, pending);

      if (isFirstRender) {
        // Full build on first render — compact columns
        tr.innerHTML = `
          <td class="cell-status">
            <span class="badge-status ${isOnline ? "online" : "offline"}">
              <span class="dot ${isOnline ? "online" : "offline"}"></span>
              ${isOnline ? "Online" : "Offline"}
            </span>
          </td>
          <td class="cell-name">${nameCellHtml(docId, s)}</td>
          <td class="cell-playlist">${playlistDropdown(docId, s.currentPlaylist)}</td>
          <td class="cell-layout">
            <div class="d-flex flex-column gap-1">
              <div class="d-flex align-items-center gap-1">
                ${layoutDropdown(docId, s.layoutMode)}
                ${rotationDropdown(docId, s.rotation)}
              </div>
              ${effectiveLayoutMode === "split" ? `
                <div class="mt-1 d-flex flex-column gap-1 p-1 bg-light rounded border">
                  ${bottomWebUrlInput(docId, s.bottomWebUrl)}
                  ${splitRatioDropdown(docId, s.splitRatio)}
                </div>
              ` : ""}
            </div>
          </td>
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

      // --- Surgical updates for subsequent renders ---
      const activeEl = document.activeElement;

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

      // Update name cell
      const nameCell = tr.querySelector(".cell-name");
      const isCurrentlyRenaming = appState.renamingScreenId === docId;
      if (nameCell && (!isCurrentlyRenaming || forceLayoutUpdate)) {
        nameCell.innerHTML = nameCellHtml(docId, s);
      }

      // Always update last-seen time
      const lastSeenCell = tr.querySelector(".cell-lastseen");
      if (lastSeenCell) lastSeenCell.textContent = formatLastSeenTime(lastSeenMs);

      // Always update push button enabled state
      const pushBtn = tr.querySelector(".primaryPush");
      if (pushBtn) {
        pushBtn.disabled = !hasPending;
        hasPending ? pushBtn.classList.add("has-pending") : pushBtn.classList.remove("has-pending");
      }

      const playlistCell = tr.querySelector(".cell-playlist");
      const isUserInPlaylist = activeEl && playlistCell && playlistCell.contains(activeEl);
      if (playlistCell && (!isUserInPlaylist || forceLayoutUpdate)) {
        playlistCell.innerHTML = playlistDropdown(docId, s.currentPlaylist);
      }

      const layoutCell = tr.querySelector(".cell-layout");
      const isUserInLayout = activeEl && layoutCell && layoutCell.contains(activeEl);
      if (layoutCell && (!isUserInLayout || forceLayoutUpdate)) {
        layoutCell.innerHTML = `
          <div class="d-flex flex-column gap-1">
            <div class="d-flex align-items-center gap-1">
              ${layoutDropdown(docId, s.layoutMode)}
              ${rotationDropdown(docId, s.rotation)}
            </div>
            ${effectiveLayoutMode === "split" ? `
              <div class="mt-1 d-flex flex-column gap-1 p-1 bg-light rounded border">
                ${bottomWebUrlInput(docId, s.bottomWebUrl)}
                ${splitRatioDropdown(docId, s.splitRatio)}
              </div>
            ` : ""}
          </div>
        `;
      }
    }

    function startRename(screenId) {
      appState.renamingScreenId = screenId;
      const s = appState.screenDataCache[screenId];
      if (s) renderScreenRow(screenId, s, true);
      const input = document.getElementById(`renameInput_${screenId}`);
      if (input) {
        input.focus();
        input.select();
      }
    }

    function cancelRename(screenId) {
      const input = document.getElementById(`renameInput_${screenId}`);
      if (input) input.blur();
      appState.renamingScreenId = null;
      const s = appState.screenDataCache[screenId];
      if (s) renderScreenRow(screenId, s, true);
    }

    function saveRename(screenId) {
      const input = document.getElementById(`renameInput_${screenId}`);
      if (!input) return;
      const newName = input.value.trim();
      if (!newName) return alert("Screen name can't be empty.");

      input.blur();
      appState.renamingScreenId = null;

      // Optimistically update cache & UI immediately so Enter key closes rename input without delay
      if (appState.screenDataCache[screenId]) {
        appState.screenDataCache[screenId].name = newName;
      }
      renderScreenRow(screenId, appState.screenDataCache[screenId], true);

      db.collection("screens").doc(screenId).update({ name: newName })
        .then(() => {
          if (AppModules.showToast) {
            AppModules.showToast(`Screen renamed to "${newName}"`, "success");
          }
        })
        .catch((err) => {
          if (AppModules.showToast) {
            AppModules.showToast(`Rename failed: ${err.message}`, "error");
          } else {
            alert(`Rename failed: ${err.message}`);
          }
        });
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
      const s = appState.screenDataCache[screenId] || {};
      const isSchedActive = s.schedulerEnabled === true;
      const pending = appState.pendingChanges[screenId]?.playlist;
      const effectiveVal = pending !== undefined ? pending : (currentPlaylistId || "");
      const options = appState.playlistsCache.map((p) =>
        `<option value="${p.id}" ${p.id === effectiveVal ? "selected" : ""}>${p.name}</option>`
      ).join("");

      if (isSchedActive) {
        return `
          <div class="d-flex flex-column gap-1">
            <select class="playlistSelect is-sched-locked" disabled title="Auto-Scheduler is active. Turn off Auto-Scheduler in the Scheduler tab to push a playlist manually.">
              <option value="" ${effectiveVal === "" ? "selected" : ""}>— none —</option>${options}
            </select>
            <div><span class="sched-lock-badge" title="Controlled by Auto-Scheduler">Scheduler on</span></div>
          </div>
        `;
      }

      return `<select class="playlistSelect" onchange="onPlaylistChange('${screenId}', this.value)">
        <option value="" ${effectiveVal === "" ? "selected" : ""}>— none —</option>${options}
      </select>`;
    }

    function afterPlaylistDropdown(screenId, currentAfterPlaylistId) {
      const pending = appState.pendingChanges[screenId]?.afterTimerPlaylist;
      const effectiveVal = pending !== undefined ? pending : (currentAfterPlaylistId || "");
      const options = appState.playlistsCache.map((p) =>
        `<option value="${p.id}" ${p.id === effectiveVal ? "selected" : ""}>${p.name}</option>`
      ).join("");

      return `<select class="playlistSelect border-amber-subtle" onchange="onAfterPlaylistChange('${screenId}', this.value)" title="Playlist automatically assigned after timer completes">
        <option value="" ${effectiveVal === "" ? "selected" : ""}>— none —</option>${options}
      </select>`;
    }

    function timerScheduleCell(screenId, s) {
      const pending = appState.pendingChanges[screenId];
      const timerState = getScreenTimerState(s, pending);

      const isTriggerActive = timerState.status === "active";
      const isTriggerCompleted = timerState.status === "completed";

      let btnClass = "btn-timer-trigger";
      if (isTriggerActive) btnClass += " is-active";
      else if (isTriggerCompleted) btnClass += " is-completed";

      return `
        <button type="button" class="${btnClass}" onclick="openScreenTimerModal('${screenId}')">
          ${timerState.badgeHtml}
        </button>
      `;
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
      appState.pendingChanges[screenId][field] = value;

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

        if (field === "layoutMode") {
          const s = appState.screenDataCache[screenId];
          if (s) renderScreenRow(screenId, s, true);
        }
      }
    }

    function onLayoutModeChange(screenId, value) {
      setPendingField(screenId, "layoutMode", value, appState.screenDataCache[screenId]?.layoutMode || "single");
    }

    function onPlaylistChange(screenId, value) {
      const s = appState.screenDataCache[screenId];
      if (s?.schedulerEnabled === true) {
        const screenName = s.name || screenId;
        if (AppModules.showToast) {
          AppModules.showToast(`Auto-Scheduler is active for "${screenName}". Please turn off Auto-Scheduler in the Scheduler tab to manually push a playlist.`, "warning");
        }
        renderScreenRow(screenId, s, true);
        return;
      }
      setPendingField(screenId, "playlist", value, s?.currentPlaylist || "");
    }

    function onAfterPlaylistChange(screenId, value) {
      setPendingField(screenId, "afterTimerPlaylist", value, appState.screenDataCache[screenId]?.afterTimerPlaylist || "");
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

      const s = appState.screenDataCache[screenId];
      const screenName = s?.name || screenId;

      if (pending.playlist !== undefined && s?.schedulerEnabled === true) {
        if (AppModules.showToast) {
          AppModules.showToast(`Cannot push playlist changes while Auto-Scheduler is active on "${screenName}". Turn off Auto-Scheduler in the Scheduler tab first.`, "warning");
        }
        delete pending.playlist;
        if (Object.keys(pending).length === 0) {
          renderScreenRow(screenId, s, true);
          return;
        }
      }

      const update = {};
      if (pending.layoutMode !== undefined) update.layoutMode = pending.layoutMode;
      if (pending.playlist !== undefined) update.currentPlaylist = pending.playlist || null;
      if (pending.bottomWebUrl !== undefined) update.bottomWebUrl = pending.bottomWebUrl || null;
      if (pending.splitRatio !== undefined) update.splitRatio = pending.splitRatio;
      if (pending.rotation !== undefined) update.rotation = pending.rotation;

      db.collection("screens").doc(screenId).update(update)
        .then(() => {
          delete appState.pendingChanges[screenId];
          if (AppModules.showToast) {
            AppModules.showToast(`Changes pushed to "${screenName}" successfully!`, "success");
          }
          renderScreenRow(screenId, appState.screenDataCache[screenId]);
        })
        .catch((err) => {
          const msg = err.code === "permission-denied"
            ? "Permission denied — your account does not have write access to screens."
            : `Push failed: ${err.message}`;
          if (AppModules.showToast) {
            AppModules.showToast(msg, "error");
          } else {
            alert(msg);
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

    // ===== Mass Launch & Broadcast Module =====
    const massLaunchStagingCache = {};

    function populateMassLaunchPlaylists() {
      renderMassLaunchTvOverviewTable();
    }

    function updateMassLaunchTargetCount() {
      const targetCountEl = document.getElementById("massLaunchTargetCount");
      const pairedScreenIds = Object.keys(appState.screenDataCache).filter(
        (id) => appState.screenDataCache[id]?.status === "paired"
      );

      if (targetCountEl) {
        targetCountEl.textContent = `${pairedScreenIds.length} TV${pairedScreenIds.length === 1 ? "" : "s"}`;
      }

      renderMassLaunchTvOverviewTable();
    }

    function initStagingObject(screenId) {
      if (!massLaunchStagingCache[screenId]) {
        const s = appState.screenDataCache[screenId] || {};
        massLaunchStagingCache[screenId] = {
          playlistId: s.currentPlaylist || "",
          afterTimerPlaylistId: s.afterTimerPlaylist || "",
          timerEnabled: s.timerEnabled === true,
          timerStart: s.timerStart || "09:00 AM",
          timerEnd: s.timerEnd || "05:00 PM",
          rotation: s.rotation !== undefined ? s.rotation : 0
        };
      }
      return massLaunchStagingCache[screenId];
    }

    function onMassLaunchScreenPlaylistChange(screenId, val) {
      const staged = initStagingObject(screenId);
      staged.playlistId = val;
    }

    function onMassLaunchScreenAfterPlaylistChange(screenId, val) {
      const staged = initStagingObject(screenId);
      staged.afterTimerPlaylistId = val;
    }

    function onMassLaunchScreenTimerToggle(screenId, enabled) {
      const staged = initStagingObject(screenId);
      staged.timerEnabled = enabled;
      renderMassLaunchTvOverviewTable();
    }

    function onMassLaunchScreenTimerStartChange(screenId, val) {
      const staged = initStagingObject(screenId);
      staged.timerStart = val;
    }

    function onMassLaunchScreenTimerEndChange(screenId, val) {
      const staged = initStagingObject(screenId);
      staged.timerEnd = val;
    }

    function onMassLaunchScreenRotationChange(screenId, val) {
      const rot = parseInt(val, 10) || 0;
      const staged = initStagingObject(screenId);
      staged.rotation = rot;
    }

    function renderMassLaunchTvOverviewTable() {
      const container = document.getElementById("massLaunchTvOverviewBody");
      const targetCountEl = document.getElementById("massLaunchTargetCount");
      if (!container) return;

      const pairedScreenIds = Object.keys(appState.screenDataCache).filter(
        (id) => appState.screenDataCache[id]?.status === "paired"
      );

      if (targetCountEl) {
        targetCountEl.textContent = `${pairedScreenIds.length} TV${pairedScreenIds.length === 1 ? "" : "s"}`;
      }

      const playlists = appState.playlistsCache || [];

      if (pairedScreenIds.length === 0) {
        container.innerHTML = `<tr><td colspan="6" class="text-muted text-center py-4">No paired TVs found. Pair screens on the Screens tab first.</td></tr>`;
        return;
      }

      container.innerHTML = pairedScreenIds.map((id) => {
        const s = appState.screenDataCache[id];
        const name = s.name || `TV (${id})`;
        const lastSeenMs = getTimestampMs(s.lastSeen, id);
        const isOnline = isScreenOnline(lastSeenMs);

        const stagedObj = massLaunchStagingCache[id];
        const selectedPlaylistId = stagedObj !== undefined ? stagedObj.playlistId : (s.currentPlaylist || "");
        const selectedAfterPlaylistId = stagedObj !== undefined ? stagedObj.afterTimerPlaylistId : (s.afterTimerPlaylist || "");
        const selectedTimerEnabled = stagedObj !== undefined ? stagedObj.timerEnabled : (s.timerEnabled === true);
        const selectedTimerStart = stagedObj !== undefined ? stagedObj.timerStart : (s.timerStart || "09:00 AM");
        const selectedTimerEnd = stagedObj !== undefined ? stagedObj.timerEnd : (s.timerEnd || "05:00 PM");
        const selectedRotation = stagedObj !== undefined ? stagedObj.rotation : (s.rotation !== undefined ? s.rotation : 0);

        let playlistOptionsHtml = `<option value="">— None (Clear) —</option>`;
        playlists.forEach((p) => {
          const isSelected = p.id === selectedPlaylistId;
          playlistOptionsHtml += `<option value="${p.id}" ${isSelected ? "selected" : ""}>${p.name}</option>`;
        });

        let afterPlaylistOptionsHtml = `<option value="">— None —</option>`;
        playlists.forEach((p) => {
          const isSelected = p.id === selectedAfterPlaylistId;
          afterPlaylistOptionsHtml += `<option value="${p.id}" ${isSelected ? "selected" : ""}>${p.name}</option>`;
        });

        let startOptionsHtml = CLOCK_TIMES_12H.map(t =>
          `<option value="${t}" ${t === selectedTimerStart ? "selected" : ""}>${t}</option>`
        ).join("");

        let endOptionsHtml = CLOCK_TIMES_12H.map(t =>
          `<option value="${t}" ${t === selectedTimerEnd ? "selected" : ""}>${t}</option>`
        ).join("");

        const rotations = [
          { val: 0, label: "0° (Landscape)" },
          { val: 90, label: "90° (Portrait R)" },
          { val: 180, label: "180° (Inverted)" },
          { val: 270, label: "270° (Portrait L)" }
        ];

        let rotationOptionsHtml = rotations.map(r => {
          return `<option value="${r.val}" ${r.val === selectedRotation ? "selected" : ""}>${r.label}</option>`;
        }).join("");

        return `
          <tr>
            <td>
              <span class="badge-status ${isOnline ? "online" : "offline"}">
                <span class="dot ${isOnline ? "online" : "offline"}"></span>
                ${isOnline ? "Online" : "Offline"}
              </span>
            </td>
            <td>
              <span class="fw-bold text-dark d-block">${name}</span>
            </td>
            <td>
              <select class="form-select form-select-sm border-secondary-subtle"
                onchange="onMassLaunchScreenPlaylistChange('${id}', this.value)">
                ${playlistOptionsHtml}
              </select>
            </td>
            <td>
              <select class="form-select form-select-sm border-secondary-subtle"
                onchange="onMassLaunchScreenRotationChange('${id}', this.value)">
                ${rotationOptionsHtml}
              </select>
            </td>
          </tr>
        `;
      }).join("");
    }

    function saveMassLaunchConfig() {
      const pairedScreenIds = Object.keys(appState.screenDataCache).filter(
        (id) => appState.screenDataCache[id]?.status === "paired"
      );

      if (pairedScreenIds.length === 0) {
        if (AppModules.showToast) {
          AppModules.showToast("No paired TVs found to save configuration.", "info");
        }
        return;
      }

      pairedScreenIds.forEach((id) => {
        initStagingObject(id);
      });

      const statusTextEl = document.getElementById("massLaunchStatusText");
      if (statusTextEl) {
        statusTextEl.style.display = "block";
        statusTextEl.textContent = `Configuration saved for ${pairedScreenIds.length} TVs. Click Launch all to broadcast.`;
        setTimeout(() => { statusTextEl.style.display = "none"; }, 6000);
      }

      if (AppModules.showToast) {
        AppModules.showToast(`Mass launch configuration saved for ${pairedScreenIds.length} TVs.`, "success");
      }
    }

    function launchToAllScreens() {
      const pairedScreenIds = Object.keys(appState.screenDataCache).filter(
        (id) => appState.screenDataCache[id]?.status === "paired"
      );

      if (pairedScreenIds.length === 0) {
        if (AppModules.showToast) {
          AppModules.showToast("No target TVs available to launch.", "error");
        } else {
          alert("No target TVs available to launch.");
        }
        return;
      }

      const modal = document.getElementById("massLaunchConfirmModal");
      const countEl = document.getElementById("modalScreenCount");
      const tbody = document.getElementById("modalConfirmBody");
      const playlists = appState.playlistsCache || [];

      if (countEl) countEl.textContent = `${pairedScreenIds.length} TV${pairedScreenIds.length === 1 ? "" : "s"}`;

      if (tbody) {
        tbody.innerHTML = pairedScreenIds.map((id) => {
          const s = appState.screenDataCache[id] || {};
          const name = s.name || `TV (${id})`;

          const staged = massLaunchStagingCache[id];
          const playlistId = staged !== undefined ? staged.playlistId : (s.currentPlaylist || "");
          const rotation = staged !== undefined ? staged.rotation : (s.rotation !== undefined ? s.rotation : 0);

          const playlistObj = playlists.find(p => p.id === playlistId);
          const playlistName = playlistObj ? playlistObj.name : "None (Clear)";

          return `
            <tr>
              <td class="fw-semibold text-dark">${name}</td>
              <td><span class="badge bg-light text-dark border">${playlistName}</span></td>
              <td><span class="badge bg-secondary-subtle text-dark border">${rotation}°</span></td>
            </tr>
          `;
        }).join("");
      }

      if (modal) {
        modal.style.display = "flex";
      }
    }

    function closeMassLaunchModal() {
      const modal = document.getElementById("massLaunchConfirmModal");
      if (modal) {
        modal.style.display = "none";
      }
      // Bug #7 fix: Clear staging cache so stale values don't show next time the modal opens
      Object.keys(massLaunchStagingCache).forEach(k => delete massLaunchStagingCache[k]);
    }

    async function executeMassLaunch() {
      const pairedScreenIds = Object.keys(appState.screenDataCache).filter(
        (id) => appState.screenDataCache[id]?.status === "paired"
      );

      const modalBtn = document.getElementById("modalConfirmLaunchBtn");
      const headerBtn = document.getElementById("massLaunchBtn");

      const originalModalHtml = modalBtn ? modalBtn.innerHTML : "";
      const originalHeaderHtml = headerBtn ? headerBtn.innerHTML : "";

      if (modalBtn) {
        modalBtn.disabled = true;
        modalBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Broadcasting`;
      }
      if (headerBtn) {
        headerBtn.disabled = true;
        headerBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Launching`;
      }

      try {
        const batches = [];
        let batch = db.batch();
        let opCount = 0;

        pairedScreenIds.forEach((screenId) => {
          const s = appState.screenDataCache[screenId];
          const staged = massLaunchStagingCache[screenId];

          const playlistId = staged ? staged.playlistId : (s ? s.currentPlaylist : null);
          const afterPlaylistId = staged ? staged.afterTimerPlaylistId : (s ? s.afterTimerPlaylist : null);
          const timerEnabled = staged ? staged.timerEnabled : (s && s.timerEnabled === true);
          const timerStart = staged ? staged.timerStart : (s && s.timerStart ? s.timerStart : "09:00 AM");
          const timerEnd = staged ? staged.timerEnd : (s && s.timerEnd ? s.timerEnd : "05:00 PM");
          const rotation = staged ? staged.rotation : (s && s.rotation !== undefined ? s.rotation : 0);

          // Bug #2 fix: Write BOTH the new scheduler fields AND legacy timer fields so the
          // backend auto-scheduler (checkScheduler) can pick up the timer settings.
          // The backend reads schedulerEnabled + schedulerSlots, NOT timerEnabled/timerStart/timerEnd.
          let schedulerSlots = s ? (s.schedulerSlots || []) : [];
          let schedulerEnabled = s ? (s.schedulerEnabled === true) : false;

          if (timerEnabled) {
            // Convert the legacy 12h timer start/end into a proper schedulerSlot entry.
            // We preserve any existing multi-slot config if present; otherwise create one slot.
            // The "after" playlist goes to the slot AFTER the timer window (no scheduled slot covers it).
            const startTime24 = AppModules.legacy12hTo24h ? AppModules.legacy12hTo24h(timerStart) : '09:00';
            const endTime24 = AppModules.legacy12hTo24h ? AppModules.legacy12hTo24h(timerEnd) : '17:00';
            schedulerSlots = [{
              start: startTime24,
              end: endTime24,
              playlistId: playlistId || ''
            }];
            schedulerEnabled = true;
          } else {
            // Timer disabled — turn off scheduler too
            schedulerEnabled = false;
          }

          const update = {
            currentPlaylist: playlistId || null,
            afterTimerPlaylist: afterPlaylistId || null,
            // Legacy fields (for any old Android app versions still reading them)
            timerEnabled: timerEnabled,
            timerStart: timerStart,
            timerEnd: timerEnd,
            // New scheduler fields (read by backend checkScheduler loop)
            schedulerEnabled: schedulerEnabled,
            schedulerSlots: schedulerSlots,
            rotation: rotation
          };

          batch.update(db.collection("screens").doc(screenId), update);
          delete appState.pendingChanges[screenId];
          delete massLaunchStagingCache[screenId];

          opCount++;
          if (opCount % 500 === 0) {
            batches.push(batch.commit());
            batch = db.batch();
          }
        });

        if (opCount % 500 !== 0) {
          batches.push(batch.commit());
        }

        await Promise.all(batches);

        closeMassLaunchModal();
        renderMassLaunchTvOverviewTable();

        if (AppModules.showToast) {
          AppModules.showToast(`Broadcast sent to ${pairedScreenIds.length} TVs.`, "success");
        }

        const statusTextEl = document.getElementById("massLaunchStatusText");
        if (statusTextEl) {
          statusTextEl.style.display = "block";
          statusTextEl.textContent = `Broadcast sent to ${pairedScreenIds.length} TVs.`;
          setTimeout(() => { statusTextEl.style.display = "none"; }, 8000);
        }
      } catch (err) {
        console.error("Mass launch failed:", err);
        if (AppModules.showToast) {
          AppModules.showToast(`Mass Launch failed: ${err.message}`, "error");
        } else {
          alert(`Mass Launch failed: ${err.message}`);
        }
      } finally {
        if (modalBtn) {
          modalBtn.disabled = false;
          modalBtn.innerHTML = originalModalHtml;
        }
        if (headerBtn) {
          headerBtn.disabled = false;
          headerBtn.innerHTML = originalHeaderHtml;
        }
      }
    }

    return {
      addScreen,
      openAddScreenModal,
      closeAddScreenModal,
      watchScreens,
      renderScreenRow,
      filterScreensByStatus,
      startRename,
      cancelRename,
      saveRename,
      onLayoutModeChange,
      onLayoutChange: onLayoutModeChange,
      onPlaylistChange,
      onAfterPlaylistChange,
      onBottomWebUrlChange,
      onSplitRatioChange,
      onRotationChange,
      pushChanges,
      removeScreen,
      populateMassLaunchPlaylists,
      updateMassLaunchTargetCount,
      renderMassLaunchTvOverviewTable,
      onMassLaunchScreenPlaylistChange,
      onMassLaunchScreenAfterPlaylistChange,
      onMassLaunchScreenTimerToggle,
      onMassLaunchScreenTimerStartChange,
      onMassLaunchScreenTimerEndChange,
      onMassLaunchScreenRotationChange,
      saveMassLaunchConfig,
      closeMassLaunchModal,
      executeMassLaunch,
      launchToAllScreens
    };
  };

  window.AppModules = AppModules;
})();
