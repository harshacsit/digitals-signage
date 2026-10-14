/**
 * programs.js — Programs Module
 *
 * Programs = media-library pushes stored in the `playlists` collection
 * with { source: 'medialibrary' }. They show here, not in the Playlists tab.
 *
 * Features:
 *  - Table of all programs with screen assignments
 *  - Inline edit panel: reorder items ▲/▼, name, type, URL, duration, rotation, resize
 *  - Save → updates Firestore (the TV reads from the same playlists/{id} doc)
 *  - Delete
 */
(function () {
  const AppModules = window.AppModules || {};
  const appState  = window.AppState;

  AppModules.createProgramsModule = function createProgramsModule({ db }) {

    appState.editingProgramId = null;

    // Programs share appState.playlistsCache — no extra Firestore listener needed.
    function getPrograms() {
      return (appState.playlistsCache || []).filter(function(p) {
        return p.source === 'medialibrary';
      });
    }

    // ── Table ──────────────────────────────────────────────────────────────
    function renderProgramsTable() {
      var container = document.getElementById('programsBody');
      if (!container) return;

      var programs = getPrograms();

      if (programs.length === 0) {
        container.innerHTML = '<tr><td colspan="4" class="text-muted text-center py-4">'
          + 'No programs yet. Go to <strong>Media Library</strong>, select files, and click <em>Send to Screen</em>.'
          + '</td></tr>';
        return;
      }

      container.innerHTML = programs.map(function(p) {
        var items = p.items || [];

        // ── Item chips ────────────────────────────────────────────────────
        var visibleItems = items.slice(0, 4);
        var itemBadges = visibleItems.map(function(i) {
          var rawName = i.name || '';
          if (!rawName && i.url) {
            try { rawName = decodeURIComponent(i.url.split('/').pop().split('?')[0]); }
            catch(e) { rawName = i.url.split('/').pop(); }
          }
          var cleanName = rawName.replace(/^\d{10,14}_/, '').replace(/\.[^.]+$/, '');
          if (cleanName.length > 22) cleanName = cleanName.substring(0, 19) + '…';
          var typeClass = i.type === 'video' ? 'is-video' : 'is-image';
          var typeLabel = i.type === 'video' ? 'Video' : 'Image';
          return '<span class="type-chip ' + typeClass + '" title="' + _esc(i.name || i.url || '') + '">'
                + typeLabel + ' &middot; ' + _esc(cleanName || rawName) + '</span>';
        }).join('');
        if (items.length > 4) {
          itemBadges += ' <span class="badge bg-secondary-subtle text-secondary border mb-1">+'
                      + (items.length - 4) + ' more</span>';
        }

        // ── Screen badges ─────────────────────────────────────────────────
        var assignedScreenNames = Object.keys(appState.screenDataCache || {})
          .filter(function(sid) {
            var s = appState.screenDataCache[sid];
            return s && s.currentProgramId === p.id;
          })
          .map(function(sid) {
            return (appState.screenDataCache[sid] || {}).name || sid;
          });

        var screenBadges = assignedScreenNames.length
          ? assignedScreenNames.map(function(n) {
              return '<span class="badge bg-success-subtle text-success border me-1">' + _esc(n) + '</span>';
            }).join('')
          : '<span class="text-muted small">Unassigned</span>';

        return '<tr>'
          + '<td>'
          +   '<div class="fw-bold mb-1">' + _esc(p.name) + '</div>'
          +   '<div class="d-flex flex-wrap gap-1 align-items-center">'
          +     (itemBadges || '<span class="text-muted small">No items</span>')
          +   '</div>'
          + '</td>'
          + '<td><span class="badge bg-secondary-subtle text-dark border px-2 py-1">'
          +   items.length + ' item' + (items.length === 1 ? '' : 's')
          + '</span></td>'
          + '<td>' + screenBadges + '</td>'
          + '<td class="text-end">'
          +   '<div class="toolbar-btns">'
          +     '<button class="secondary" onclick="editProgram(\'' + p.id + '\')">Edit</button>'
          +     '<button class="secondary danger" onclick="deleteProgram(\'' + p.id + '\')">Delete</button>'
          +   '</div>'
          + '</td>'
          + '</tr>';
      }).join('');
    }

    // ── Edit ───────────────────────────────────────────────────────────────
    function editProgram(id) {
      var program = (appState.playlistsCache || []).find(function(p) { return p.id === id; });
      if (!program) return;

      appState.editingProgramId = id;

      var nameEl = document.getElementById('programName');
      if (nameEl) nameEl.value = program.name;

      var itemsEl = document.getElementById('programItems');
      if (itemsEl) {
        itemsEl.innerHTML = '';
        (program.items || []).forEach(function(item) { addProgramItemRow(item); });
      }

      var panel = document.getElementById('programEditPanel');
      if (panel) {
        panel.style.display = 'block';
        setTimeout(function() { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
      }
      if (AppModules.showToast) AppModules.showToast('Editing "' + program.name + '"', 'info');
    }

    function cancelEditProgram() {
      appState.editingProgramId = null;
      var panel = document.getElementById('programEditPanel');
      if (panel) panel.style.display = 'none';
      var nameEl = document.getElementById('programName');
      if (nameEl) nameEl.value = '';
      var itemsEl = document.getElementById('programItems');
      if (itemsEl) itemsEl.innerHTML = '';
    }

    function deleteProgram(id) {
      var program = (appState.playlistsCache || []).find(function(p) { return p.id === id; });
      var name = program ? program.name : id;
      if (!confirm('Delete program "' + name + '"?\n\nScreens playing this program will stop receiving it.')) return;
      db.collection('playlists').doc(id).delete()
        .then(function() {
          if (appState.editingProgramId === id) cancelEditProgram();
          if (AppModules.showToast) AppModules.showToast('"' + name + '" deleted.', 'info');
        })
        .catch(function(err) {
          if (AppModules.showToast) AppModules.showToast('Delete failed: ' + err.message, 'error');
        });
    }

    // ── Item rows ──────────────────────────────────────────────────────────
    function addProgramItemRow(data) {
      data = data || {};
      var container = document.getElementById('programItems');
      if (!container) return;
      var row = document.createElement('div');
      row.className = 'item-row';

      var safeName = (data.name || '').replace(/"/g, '&quot;');
      var safeUrl  = (data.url  || '').replace(/"/g, '&quot;');
      var dur      = data.durationSeconds != null ? data.durationSeconds : 8;
      var rot      = data.rotation         != null ? data.rotation         : 0;
      var resize   = data.resizeMode       || 'fit';

      row.innerHTML = ''
        // ── Order ──
        + '<div class="item-field-wrap field-order">'
        +   '<label class="item-field-label text-center">Order</label>'
        +   '<div class="item-order-btns">'
        +     '<button type="button" class="btn-order btn-order-up"  title="Move Up">▲</button>'
        +     '<button type="button" class="btn-order btn-order-down" title="Move Down">▼</button>'
        +   '</div>'
        + '</div>'
        // ── Name ──
        + '<div class="item-field-wrap field-name">'
        +   '<label class="item-field-label">Media Name</label>'
        +   '<input class="itemName" placeholder="Name" value="' + safeName + '" />'
        + '</div>'
        // ── Type ──
        + '<div class="item-field-wrap field-type">'
        +   '<label class="item-field-label">Type</label>'
        +   '<select class="itemType">'
        +     '<option value="image"' + (data.type !== 'video' ? ' selected' : '') + '>Image</option>'
        +     '<option value="video"' + (data.type === 'video' ? ' selected' : '') + '>Video</option>'
        +   '</select>'
        + '</div>'
        // ── URL ──
        + '<div class="item-field-wrap field-url">'
        +   '<label class="item-field-label">Media URL</label>'
        +   '<input class="itemUrl" placeholder="https://…" value="' + safeUrl + '" />'
        + '</div>'
        // ── Duration ──
        + '<div class="item-field-wrap field-duration">'
        +   '<label class="item-field-label">Sec</label>'
        +   '<div class="d-flex align-items-center gap-1">'
        +     '<input class="itemDuration" type="number" min="1" max="3600" value="' + dur + '" />'
        +     '<span class="small text-muted">s</span>'
        +   '</div>'
        + '</div>'
        // ── Resize ──
        + '<div class="item-field-wrap field-resize">'
        +   '<label class="item-field-label">Resize</label>'
        +   '<select class="itemResizeMode">'
        +     '<option value="fit"'     + (resize === 'fit'     ? ' selected' : '') + '>Fit</option>'
        +     '<option value="fill"'    + (resize === 'fill'    ? ' selected' : '') + '>Fill</option>'
        +     '<option value="stretch"' + (resize === 'stretch' ? ' selected' : '') + '>Stretch</option>'
        +   '</select>'
        + '</div>'
        // ── Rotation ──
        + '<div class="item-field-wrap field-rotation">'
        +   '<label class="item-field-label">Rotation</label>'
        +   '<select class="itemRotation">'
        +     '<option value="0"'   + (rot === 0   ? ' selected' : '') + '>0°</option>'
        +     '<option value="90"'  + (rot === 90  ? ' selected' : '') + '>90°</option>'
        +     '<option value="180"' + (rot === 180 ? ' selected' : '') + '>180°</option>'
        +     '<option value="270"' + (rot === 270 ? ' selected' : '') + '>270°</option>'
        +   '</select>'
        + '</div>'
        // ── Remove ──
        + '<div class="item-field-wrap field-action ms-auto">'
        +   '<label class="item-field-label">&nbsp;</label>'
        +   '<button type="button" class="btn-remove" onclick="this.closest(\'.item-row\').remove()" title="Remove">✕</button>'
        + '</div>';

      container.appendChild(row);

      // Wire reorder buttons
      row.querySelector('.btn-order-up').addEventListener('click', function() {
        var prev = row.previousElementSibling;
        if (prev && prev.classList.contains('item-row')) row.parentNode.insertBefore(row, prev);
      });
      row.querySelector('.btn-order-down').addEventListener('click', function() {
        var next = row.nextElementSibling;
        if (next && next.classList.contains('item-row')) row.parentNode.insertBefore(next, row);
      });
    }

    // ── Save ───────────────────────────────────────────────────────────────
    function saveProgram() {
      var name = (document.getElementById('programName') || {}).value;
      name = name ? name.trim() : '';
      if (!name) {
        if (AppModules.showToast) AppModules.showToast('Please enter a program name.', 'error');
        return;
      }
      var rows = document.querySelectorAll('#programItems .item-row');
      if (rows.length === 0) {
        if (AppModules.showToast) AppModules.showToast('Add at least one item.', 'error');
        return;
      }
      var items = Array.from(rows).map(function(r) {
        return {
          name:            (r.querySelector('.itemName')       || {}).value || '',
          type:             r.querySelector('.itemType').value,
          url:             (r.querySelector('.itemUrl')        || {}).value || '',
          durationSeconds:  parseInt(r.querySelector('.itemDuration').value, 10) || 8,
          resizeMode:       r.querySelector('.itemResizeMode').value,
          rotation:         parseInt(r.querySelector('.itemRotation').value, 10) || 0,
          isLive:           false
        };
      });

      var id = appState.editingProgramId;
      if (!id) { if (AppModules.showToast) AppModules.showToast('No program selected.', 'error'); return; }

      db.collection('playlists').doc(id).update({ name: name, items: items })
        .then(function() {
          cancelEditProgram();
          if (AppModules.showToast) AppModules.showToast('Program "' + name + '" saved!', 'success');
        })
        .catch(function(err) {
          if (AppModules.showToast) AppModules.showToast('Save failed: ' + err.message, 'error');
        });
    }

    // ── Utility ────────────────────────────────────────────────────────────
    function _esc(str) {
      return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Expose to window for inline HTML event handlers
    window.editProgram         = editProgram;
    window.cancelEditProgram   = cancelEditProgram;
    window.deleteProgram       = deleteProgram;
    window.addProgramItemRow   = addProgramItemRow;
    window.saveProgram         = saveProgram;
    window.renderProgramsTable = renderProgramsTable;

    return { renderProgramsTable: renderProgramsTable };
  };

  window.AppModules = AppModules;
})();
