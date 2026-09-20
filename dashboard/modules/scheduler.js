(function () {
  const AppModules = window.AppModules || {};
  const appState = window.AppState;

  // Track pending scheduler changes before user clicks "Save Schedule"
  // { screenId: { schedulerEnabled: boolean, schedulerSlots: Array<{start, end, playlistId}> } }
  appState.pendingSchedulerChanges = appState.pendingSchedulerChanges || {};

  function hhmm24ToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length < 2) return 0;
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  function hhmm24To12h(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    let h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    const period = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;       // 00:xx → 12:xx AM (midnight)
    else if (h > 12) h -= 12; // 13–23 → 1–11 PM
    // h=12 stays 12 PM (noon)
    return `${h}:${m} ${period}`;
  }

  function normalizeHhmmTime(str) {
    if (!str) return '';
    str = str.trim();

    // Support plain digits e.g. "0911", "911", "1430"
    if (/^\d{3,4}$/.test(str)) {
      if (str.length === 3) str = '0' + str;
      const h = parseInt(str.slice(0, 2), 10);
      const m = parseInt(str.slice(2, 4), 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }

    // Support colon format e.g. "9:11" or "09:11"
    const match = str.match(/^(\d{1,2}):(\d{1,2})$/);
    if (match) {
      let h = parseInt(match[1], 10);
      let m = parseInt(match[2], 10);
      if (!isNaN(h) && h >= 0 && h <= 23 && !isNaN(m) && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }

    return str;
  }

  function buildSchedTimeOptions(currentValue) {
    const am = [];
    const pm = [];
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, '0');
      ['00', '15', '30', '45'].forEach(mm => {
        const t = `${hh}:${mm}`;
        const isSel = (t === currentValue) ? 'selected' : '';
        const lbl = `${hhmm24To12h(t)} (${t})`;
        if (h < 12) am.push(`<option value="${t}" ${isSel}>${lbl}</option>`);
        else pm.push(`<option value="${t}" ${isSel}>${lbl}</option>`);
      });
    }
    return `
      <option value="">Quick pick ▼</option>
      <optgroup label="Morning (AM)">
        ${am.join('')}
      </optgroup>
      <optgroup label="Afternoon &amp; Evening (PM)">
        ${pm.join('')}
      </optgroup>
    `;
  }

  // Generate all 15-min interval times in HH:MM 24h format
  const SCHED_TIMES = (function () {
    const times = [];
    for (let h = 0; h < 24; h++) {
      times.push(`${String(h).padStart(2, '0')}:00`);
      times.push(`${String(h).padStart(2, '0')}:15`);
      times.push(`${String(h).padStart(2, '0')}:30`);
      times.push(`${String(h).padStart(2, '0')}:45`);
    }
    return times;
  })();

  // Shared <datalist> HTML injected once into the page for time suggestions
  const SCHED_DATALIST_ID = 'schedTimeSuggestions';
  function ensureSchedDatalist() {
    if (document.getElementById(SCHED_DATALIST_ID)) return;
    const dl = document.createElement('datalist');
    dl.id = SCHED_DATALIST_ID;
    dl.innerHTML = SCHED_TIMES.map(t => `<option value="${t}">${hhmm24To12h(t)}</option>`).join('');
    document.body.appendChild(dl);
  }

  function getActiveSchedulerSlot(slots) {
    if (!Array.isArray(slots) || slots.length === 0) return null;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();

    for (const slot of slots) {
      if (!slot.start || !slot.end) continue;
      const startMins = hhmm24ToMinutes(slot.start);
      const endMins = hhmm24ToMinutes(slot.end);

      if (startMins < endMins) {
        if (nowMins >= startMins && nowMins < endMins) return slot;
      } else if (startMins > endMins) {
        // Overnight slot (e.g., 22:00 to 06:00)
        if (nowMins >= startMins || nowMins < endMins) return slot;
      }
    }
    return null;
  }


  AppModules.createSchedulerModule = function createSchedulerModule({ db }) {
    let refreshTimer = null;

    function initSchedulerView() {
      ensureSchedDatalist(); // Inject shared time suggestions datalist once
      if (!refreshTimer) {
        refreshTimer = setInterval(updateSchedulerStatusChips, 30000);
      }
      renderSchedulerView();
    }

    function destroySchedulerView() {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    }

    function renderSchedulerView() {
      const container = document.getElementById('schedulerGrid');
      if (!container) return;

      const pairedScreenIds = Object.keys(appState.screenDataCache || {}).filter(
        id => appState.screenDataCache[id]?.status === 'paired'
      );

      if (pairedScreenIds.length === 0) {
        container.innerHTML = `
          <div class="col-12">
            <div class="card p-5 text-center text-muted shadow-sm border">
              <div class="empty-illustration">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              </div>
              <h3 class="h5 fw-bold text-dark mb-1">No paired screens</h3>
              <p class="mb-0 text-secondary">Pair screens on the Screens tab to configure auto-scheduling.</p>
            </div>
          </div>
        `;
        return;
      }

      container.innerHTML = pairedScreenIds.map(screenId => renderScreenSchedulerCard(screenId)).join('');
    }

    function renderScreenSchedulerCard(screenId) {
      const s = appState.screenDataCache[screenId] || {};
      const screenName = s.name || `Screen (${screenId})`;
      const playlists = appState.playlistsCache || [];

      // Get pending or stored state
      const pending = appState.pendingSchedulerChanges[screenId];
      const enabled = pending?.schedulerEnabled !== undefined ? pending.schedulerEnabled : (s.schedulerEnabled === true);
      const slots = pending?.schedulerSlots !== undefined ? pending.schedulerSlots : (s.schedulerSlots || []);
      const hasPending = pending !== undefined;

      const activeSlot = enabled ? getActiveSchedulerSlot(slots) : null;
      const activePlaylist = activeSlot ? playlists.find(p => p.id === activeSlot.playlistId) : null;

      const slotsHtml = slots.map((sl, idx) => {
        const slStart = sl.start || '09:00';
        const slEnd = sl.end || '17:00';
        const playlistOptions = playlists.map(p =>
          `<option value="${p.id}" ${p.id === sl.playlistId ? 'selected' : ''}>${p.name}</option>`
        ).join('');

        const isSlotActive = activeSlot === sl;

        return `
          <div class="sched-slot-row ${isSlotActive ? 'is-active-slot' : ''}" data-screen-id="${screenId}" data-idx="${idx}">
            <div class="sched-slot-number">${idx + 1}</div>
            <div class="sched-time-wrap">
              <div class="sched-time-field">
                <label class="sched-time-label">Start</label>
                <div class="sched-time-input-group">
                  <select class="sched-time-select" onchange="window.onSchedSelectPick(this, '${screenId}')" title="Quick pick standard time">
                    ${buildSchedTimeOptions(slStart)}
                  </select>
                  <input type="text" class="sched-time-input sched-start"
                    value="${slStart}"
                    placeholder="09:11"
                    maxlength="5"
                    title="Type exact time e.g. 09:11"
                    onblur="window.onSchedInputBlur(this, '${screenId}')"
                    oninput="window.onSchedulerTimeChange('${screenId}')" />
                </div>
              </div>
              <span class="sched-time-arrow">→</span>
              <div class="sched-time-field">
                <label class="sched-time-label">End</label>
                <div class="sched-time-input-group">
                  <select class="sched-time-select" onchange="window.onSchedSelectPick(this, '${screenId}')" title="Quick pick standard time">
                    ${buildSchedTimeOptions(slEnd)}
                  </select>
                  <input type="text" class="sched-time-input sched-end"
                    value="${slEnd}"
                    placeholder="12:00"
                    maxlength="5"
                    title="Type exact time e.g. 17:30"
                    onblur="window.onSchedInputBlur(this, '${screenId}')"
                    oninput="window.onSchedulerTimeChange('${screenId}')" />
                </div>
              </div>
            </div>
            <div class="sched-playlist-wrap">
              <select class="sched-playlist-select" onchange="window.onSchedulerTimeChange('${screenId}')">
                <option value="">— Select Playlist —</option>
                ${playlistOptions}
              </select>
            </div>
            <button type="button" class="sched-remove-btn" title="Remove slot" onclick="window.removeSchedulerSlot('${screenId}', ${idx})">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 4h12M5 4V2h6v2M6 7v6M10 7v6M3 4l1 10h8l1-10"/></svg>
            </button>
          </div>
        `;
      }).join('');


      let statusChipHtml = '';
      if (!enabled) {
        statusChipHtml = `<div class="sched-status-chip is-off">Scheduler off — this screen keeps its assigned playlist.</div>`;
      } else if (activeSlot) {
        const plName = activePlaylist ? activePlaylist.name : 'Unknown Playlist';
        statusChipHtml = `
          <div class="sched-status-chip is-active">
            <span class="sched-live-pulse"></span>
            <strong>Now playing:</strong> ${plName} (${hhmm24To12h(activeSlot.start)} – ${hhmm24To12h(activeSlot.end)})
          </div>
        `;
      } else if (slots.length > 0) {
        statusChipHtml = `<div class="sched-status-chip is-waiting">${slots.length} time slot(s) scheduled — waiting for the next window.</div>`;
      } else {
        statusChipHtml = `<div class="sched-status-chip is-empty">Scheduler is on but has no time slots. Add a time slot to continue.</div>`;
      }

      return `
        <div class="col-lg-6 col-xl-6 mb-4" id="schedCard_${screenId}">
          <div class="card sched-card shadow-sm ${enabled ? 'sched-card-active' : ''}">
            <!-- Card Header -->
            <div class="sched-card-header d-flex align-items-center justify-content-between p-3 border-bottom">
              <div class="d-flex align-items-center gap-2">
                <span class="sched-screen-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                </span>
                <div>
                  <h3 class="h6 fw-bold mb-0 text-dark">${screenName}</h3>
                  <div class="small text-muted">Screen ID: <code>${screenId}</code></div>
                </div>
              </div>
              <div class="d-flex align-items-center gap-2">
                <label class="sched-toggle-label d-flex align-items-center gap-2 cursor-pointer mb-0">
                  <span class="small fw-semibold text-secondary">${enabled ? 'ON' : 'OFF'}</span>
                  <div class="form-check form-switch mb-0">
                    <input class="form-check-input cursor-pointer" type="checkbox" id="schedToggle_${screenId}"
                      ${enabled ? 'checked' : ''} onchange="window.toggleSchedulerForScreen('${screenId}', this.checked)" style="width: 2.4em; height: 1.25em;" />
                  </div>
                </label>
              </div>
            </div>

            <!-- Card Body -->
            <div class="sched-card-body p-3">
              <div class="d-flex align-items-center justify-content-between mb-2">
                <span class="small fw-bold text-uppercase text-secondary tracking-wide">Time Slots &amp; Playlists</span>
                <button type="button" class="btn btn-sm btn-outline-primary py-1 px-2.5 d-inline-flex align-items-center gap-1"
                  onclick="window.addSchedulerSlot('${screenId}')" ${enabled ? '' : 'disabled'}>
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M7 4v6M4 7h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                  Add Time Slot
                </button>
              </div>

              <!-- Slots Container -->
              <div class="sched-slots-container mb-3 ${enabled ? '' : 'opacity-50 pointer-events-none'}" id="schedSlots_${screenId}">
                ${slots.length > 0 ? slotsHtml : `<div class="sched-slots-empty">No time slots yet. Use Add time slot above.</div>`}
              </div>

              <!-- Status Chip -->
              <div id="schedStatus_${screenId}">
                ${statusChipHtml}
              </div>
            </div>

            <!-- Card Footer -->
            <div class="sched-card-footer p-3 border-top bg-light d-flex align-items-center justify-content-between">
              <div class="small text-muted">
                ${hasPending ? '<span class="badge bg-warning text-dark">Unsaved changes</span>' : '<span class="text-success small">Up to date</span>'}
              </div>
              <button type="button" class="btn btn-primary-brand px-3 py-1.5 small fw-semibold shadow-sm"
                onclick="window.saveScheduleForScreen('${screenId}')">
                Save schedule
              </button>
            </div>
          </div>
        </div>
      `;
    }

    function readSlotsFromCard(screenId) {
      const card = document.getElementById(`schedCard_${screenId}`);
      if (!card) return [];
      const rows = card.querySelectorAll('.sched-slot-row');
      const slots = [];
      rows.forEach(row => {
        // Works for both <select> and legacy <input type="time">
        const start = row.querySelector('.sched-start')?.value || '';
        const end = row.querySelector('.sched-end')?.value || '';
        const playlistId = row.querySelector('.sched-playlist-select')?.value || '';
        if (start && end) {
          slots.push({ start, end, playlistId });
        }
      });
      return slots;
    }

    function onSchedulerTimeChange(screenId) {
      const card = document.getElementById(`schedCard_${screenId}`);
      if (!card) return;
      const toggle = card.querySelector(`#schedToggle_${screenId}`);
      const enabled = toggle ? toggle.checked : false;
      const slots = readSlotsFromCard(screenId);

      appState.pendingSchedulerChanges[screenId] = {
        schedulerEnabled: enabled,
        schedulerSlots: slots
      };

      // Update footer pending badge directly — DO NOT re-render card to avoid unmounting focused input
      const footerBadge = card.querySelector('.sched-card-footer .small.text-muted');
      if (footerBadge) {
        footerBadge.innerHTML = '<span class="badge bg-warning text-dark">Unsaved changes</span>';
      }
    }

    function toggleSchedulerForScreen(screenId, enabled) {
      const slots = readSlotsFromCard(screenId);
      appState.pendingSchedulerChanges[screenId] = {
        schedulerEnabled: enabled,
        schedulerSlots: slots
      };
      renderScreenSchedulerCardUI(screenId);
    }

    function addSchedulerSlot(screenId) {
      const slots = readSlotsFromCard(screenId);
      let startHr = 9, endHr = 12;
      if (slots.length > 0) {
        const last = slots[slots.length - 1];
        if (last.end) {
          const parts = last.end.split(':');
          startHr = parseInt(parts[0], 10);
          endHr = Math.min(startHr + 2, 23);
        }
      }

      slots.push({
        start: `${String(startHr).padStart(2, '0')}:00`,
        end: `${String(endHr).padStart(2, '0')}:00`,
        playlistId: ''
      });

      const card = document.getElementById(`schedCard_${screenId}`);
      const toggle = card ? card.querySelector(`#schedToggle_${screenId}`) : null;
      const enabled = toggle ? toggle.checked : true;

      appState.pendingSchedulerChanges[screenId] = {
        schedulerEnabled: enabled,
        schedulerSlots: slots
      };

      renderScreenSchedulerCardUI(screenId);
    }

    function removeSchedulerSlot(screenId, idx) {
      const slots = readSlotsFromCard(screenId);
      slots.splice(idx, 1);

      const card = document.getElementById(`schedCard_${screenId}`);
      const toggle = card ? card.querySelector(`#schedToggle_${screenId}`) : null;
      const enabled = toggle ? toggle.checked : true;

      appState.pendingSchedulerChanges[screenId] = {
        schedulerEnabled: enabled,
        schedulerSlots: slots
      };

      renderScreenSchedulerCardUI(screenId);
    }

    function renderScreenSchedulerCardUI(screenId) {
      const cardContainer = document.getElementById(`schedCard_${screenId}`);
      if (!cardContainer) {
        renderSchedulerView();
        return;
      }
      const parent = cardContainer.parentElement;
      if (parent) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = renderScreenSchedulerCard(screenId);
        const newCard = tempDiv.firstElementChild;
        if (newCard) {
          parent.replaceChild(newCard, cardContainer);
        }
      }
    }

    function updateSchedulerStatusChips() {
      const pairedScreenIds = Object.keys(appState.screenDataCache || {}).filter(
        id => appState.screenDataCache[id]?.status === 'paired'
      );
      pairedScreenIds.forEach(id => {
        const card = document.getElementById(`schedCard_${id}`);
        if (!card) return;

        // Surgical update: only refresh the status chip and active-slot highlight.
        // Do NOT re-render the whole card — that would wipe any in-progress user input.
        const s = appState.screenDataCache[id] || {};
        const pending = appState.pendingSchedulerChanges[id];
        const enabled = pending?.schedulerEnabled !== undefined ? pending.schedulerEnabled : (s.schedulerEnabled === true);
        const slots = pending?.schedulerSlots !== undefined ? pending.schedulerSlots : (s.schedulerSlots || []);
        const playlists = appState.playlistsCache || [];

        const activeSlot = enabled ? getActiveSchedulerSlot(slots) : null;
        const activePlaylist = activeSlot ? playlists.find(p => p.id === activeSlot.playlistId) : null;

        // Update status chip
        const statusDiv = card.querySelector(`#schedStatus_${id}`);
        if (statusDiv) {
          let html = '';
          if (!enabled) {
            html = `<div class="sched-status-chip is-off">Scheduler off — this screen keeps its assigned playlist.</div>`;
          } else if (activeSlot) {
            const plName = activePlaylist ? activePlaylist.name : 'Unknown Playlist';
            html = `
              <div class="sched-status-chip is-active">
                <span class="sched-live-pulse"></span>
                <strong>Now playing:</strong> ${plName} (${hhmm24To12h(activeSlot.start)} – ${hhmm24To12h(activeSlot.end)})
              </div>
            `;
          } else if (slots.length > 0) {
            html = `<div class="sched-status-chip is-waiting">${slots.length} time slot(s) scheduled — waiting for the next window.</div>`;
          } else {
            html = `<div class="sched-status-chip is-empty">Scheduler is on but has no time slots. Add a time slot to continue.</div>`;
          }
          statusDiv.innerHTML = html;
        }

        // Auto-push live slot transition to Firestore if scheduler is active, no pending unsaved edits exist, and playlist differs
        if (!pending && enabled && activeSlot && activeSlot.playlistId && activeSlot.playlistId !== s.currentPlaylist) {
          db.collection('screens').doc(id).update({
            currentPlaylist: String(activeSlot.playlistId),
            schedulerLastPushed: window.firebase && window.firebase.firestore ? window.firebase.firestore.FieldValue.serverTimestamp() : new Date()
          }).catch(err => console.error(`[Scheduler Auto-Push Error] Screen ${id}:`, err));
        }

        // Update active-slot row highlight without touching inputs
        card.querySelectorAll('.sched-slot-row').forEach((row, idx) => {
          const isActive = activeSlot && slots[idx] === activeSlot;
          if (isActive) row.classList.add('is-active-slot');
          else row.classList.remove('is-active-slot');
        });
      });
    }

    function saveScheduleForScreen(screenId) {
      // Check if logged in (required by Firestore rules: request.auth != null && request.auth.token.email != null)
      const currentUser = window.firebase && window.firebase.auth ? window.firebase.auth().currentUser : null;
      if (!currentUser) {
        const msg = "You must be signed in as admin to save schedule settings.";
        if (AppModules.showToast) AppModules.showToast(msg, "error");
        else alert(msg);
        return;
      }

      const s = appState.screenDataCache[screenId] || {};
      const card = document.getElementById(`schedCard_${screenId}`);
      const toggle = card ? card.querySelector(`#schedToggle_${screenId}`) : null;
      const enabled = toggle ? toggle.checked : false;
      const slots = readSlotsFromCard(screenId);

      // Validate slot times format HH:MM
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        slot.start = normalizeHhmmTime(slot.start);
        slot.end = normalizeHhmmTime(slot.end);

        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(slot.start)) {
          if (AppModules.showToast) {
            AppModules.showToast(`Slot #${i + 1} has invalid start time "${slot.start}". Please use HH:MM format like 09:11 or pick from dropdown.`, 'error');
          } else alert(`Slot #${i + 1} invalid start time "${slot.start}"`);
          return;
        }

        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(slot.end)) {
          if (AppModules.showToast) {
            AppModules.showToast(`Slot #${i + 1} has invalid end time "${slot.end}". Please use HH:MM format like 17:30 or pick from dropdown.`, 'error');
          } else alert(`Slot #${i + 1} invalid end time "${slot.end}"`);
          return;
        }
      }

      // Sanitize slots payload to prevent undefined fields
      const cleanSlots = slots.map(sl => ({
        start: String(sl.start || '09:00'),
        end: String(sl.end || '17:00'),
        playlistId: String(sl.playlistId || '')
      }));

      // Evaluate active slot right now to auto-push if active
      const activeSlot = enabled ? getActiveSchedulerSlot(cleanSlots) : null;
      const updateData = {
        schedulerEnabled: Boolean(enabled),
        schedulerSlots: cleanSlots
      };

      if (activeSlot && activeSlot.playlistId) {
        updateData.currentPlaylist = String(activeSlot.playlistId);
      }

      db.collection('screens').doc(screenId).update(updateData)
        .then(() => {
          delete appState.pendingSchedulerChanges[screenId];
          const screenName = s.name || screenId;
          if (AppModules.showToast) {
            AppModules.showToast(`Scheduler saved for "${screenName}". Cloud auto-push is active.`, 'success');
          }
          renderScreenSchedulerCardUI(screenId);
        })
        .catch(err => {
          console.error('Failed saving schedule:', err);
          const rawMsg = err.message || err.code || String(err);
          if (AppModules.showToast) {
            AppModules.showToast(`Save failed: ${rawMsg}`, 'error');
          } else {
            alert(`Save failed: ${rawMsg}`);
          }
        });
    }

    function watchScheduler() {
      initSchedulerView();
    }

    // Expose global handlers for inline HTML events
    window.toggleSchedulerForScreen = toggleSchedulerForScreen;
    window.addSchedulerSlot = addSchedulerSlot;
    window.removeSchedulerSlot = removeSchedulerSlot;
    window.saveScheduleForScreen = saveScheduleForScreen;
    window.onSchedulerTimeChange = onSchedulerTimeChange;

    window.onSchedSelectPick = function (selectElem, screenId) {
      if (!selectElem) return;
      const val = selectElem.value;
      if (!val) return;
      const group = selectElem.closest('.sched-time-input-group');
      if (!group) return;
      const input = group.querySelector('.sched-time-input');
      if (input) {
        input.value = val;
        onSchedulerTimeChange(screenId);
      }
    };

    window.onSchedInputBlur = function (inputElem, screenId) {
      if (!inputElem) return;
      const normalized = normalizeHhmmTime(inputElem.value);
      if (normalized !== inputElem.value) {
        inputElem.value = normalized;
        onSchedulerTimeChange(screenId);
      }
      const group = inputElem.closest('.sched-time-input-group');
      if (group) {
        const select = group.querySelector('.sched-time-select');
        if (select) {
          select.value = normalized || '';
        }
      }
    };

    return {
      initSchedulerView,
      destroySchedulerView,
      renderSchedulerView,
      watchScheduler
    };
  };

  window.AppModules = AppModules;
})();
