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
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${String(h).padStart(2, '0')}:${m} ${period}`;
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
      if (!refreshTimer) {
        refreshTimer = setInterval(updateSchedulerStatusChips, 30000);
      }
      renderSchedulerView();
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
            <div class="card p-5 text-center text-muted shadow-sm border-0">
              <div class="fs-1 mb-2">📺</div>
              <h3 class="h5 fw-bold text-dark mb-1">No Paired Screens Found</h3>
              <p class="mb-0 text-secondary">Pair your digital signage screens on the <strong>Screens</strong> tab first to configure 24/7 auto-scheduling.</p>
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
        const playlistOptions = playlists.map(p =>
          `<option value="${p.id}" ${p.id === sl.playlistId ? 'selected' : ''}>${p.name}</option>`
        ).join('');

        const isSlotActive = activeSlot === sl;

        return `
          <div class="sched-slot-row ${isSlotActive ? 'is-active-slot' : ''}" data-screen-id="${screenId}" data-idx="${idx}">
            <div class="sched-slot-number">${idx + 1}</div>
            <div class="sched-time-wrap">
              <input type="time" class="sched-time-input sched-start" value="${sl.start || '09:00'}"
                onchange="window.onSchedulerTimeChange('${screenId}')" />
              <span class="sched-time-arrow">→</span>
              <input type="time" class="sched-time-input sched-end" value="${sl.end || '17:00'}"
                onchange="window.onSchedulerTimeChange('${screenId}')" />
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
        statusChipHtml = `<div class="sched-status-chip is-off">⛔ Auto-Scheduler Disabled — Screen plays assigned playlist continuously</div>`;
      } else if (activeSlot) {
        const plName = activePlaylist ? activePlaylist.name : 'Unknown Playlist';
        statusChipHtml = `
          <div class="sched-status-chip is-active">
            <span class="sched-live-pulse"></span>
            <strong>▶ NOW PLAYING:</strong> ${plName} (${hhmm24To12h(activeSlot.start)} – ${hhmm24To12h(activeSlot.end)})
          </div>
        `;
      } else if (slots.length > 0) {
        statusChipHtml = `<div class="sched-status-chip is-waiting">⏰ ${slots.length} time slot(s) scheduled — Waiting for next active slot</div>`;
      } else {
        statusChipHtml = `<div class="sched-status-chip is-empty">⚠️ Scheduler enabled but no time slots added yet. Click "+ Add Time Slot".</div>`;
      }

      return `
        <div class="col-lg-6 col-xl-6 mb-4" id="schedCard_${screenId}">
          <div class="card sched-card shadow-sm ${enabled ? 'sched-card-active' : ''}">
            <!-- Card Header -->
            <div class="sched-card-header d-flex align-items-center justify-content-between p-3 border-bottom">
              <div class="d-flex align-items-center gap-2">
                <span class="fs-4">📺</span>
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
                ${slots.length > 0 ? slotsHtml : `<div class="sched-slots-empty">No time slots added. Click "+ Add Time Slot" above.</div>`}
              </div>

              <!-- Status Chip -->
              <div id="schedStatus_${screenId}">
                ${statusChipHtml}
              </div>
            </div>

            <!-- Card Footer -->
            <div class="sched-card-footer p-3 border-top bg-light d-flex align-items-center justify-content-between">
              <div class="small text-muted">
                ${hasPending ? '<span class="badge bg-warning text-dark">Unsaved Changes</span>' : '<span class="text-success small">✓ Up to date</span>'}
              </div>
              <button type="button" class="btn btn-primary-brand px-3 py-1.5 small fw-semibold shadow-sm"
                onclick="window.saveScheduleForScreen('${screenId}')">
                💾 Save Schedule
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

      // Refresh footer pending status badge
      renderScreenSchedulerCardUI(screenId);
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
        if (card) renderScreenSchedulerCardUI(id);
      });
    }

    function saveScheduleForScreen(screenId) {
      const s = appState.screenDataCache[screenId] || {};
      const card = document.getElementById(`schedCard_${screenId}`);
      const toggle = card ? card.querySelector(`#schedToggle_${screenId}`) : null;
      const enabled = toggle ? toggle.checked : false;
      const slots = readSlotsFromCard(screenId);

      // Evaluate active slot right now to auto-push if active
      const activeSlot = enabled ? getActiveSchedulerSlot(slots) : null;
      const updateData = {
        schedulerEnabled: enabled,
        schedulerSlots: slots
      };

      if (activeSlot && activeSlot.playlistId) {
        updateData.currentPlaylist = activeSlot.playlistId;
      }

      db.collection('screens').doc(screenId).update(updateData)
        .then(() => {
          delete appState.pendingSchedulerChanges[screenId];
          const screenName = s.name || screenId;
          if (AppModules.showToast) {
            AppModules.showToast(`📅 Auto-Scheduler saved for "${screenName}"! 24/7 backend pushing enabled.`, 'success');
          }
          renderScreenSchedulerCardUI(screenId);
        })
        .catch(err => {
          console.error('Failed saving schedule:', err);
          if (AppModules.showToast) {
            AppModules.showToast(`Failed saving schedule: ${err.message}`, 'error');
          } else {
            alert(`Failed saving schedule: ${err.message}`);
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

    return {
      initSchedulerView,
      renderSchedulerView,
      watchScheduler
    };
  };

  window.AppModules = AppModules;
})();
