/**
 * medialibrary.js — Centralised Media Library Module
 *
 * - Photo-grid view of all media files stored in Firestore "mediaFiles" collection
 * - Background upload to Cloudflare R2 (reuses window.R2Upload)
 * - Multi-select with "Send to Screen" button
 * - "Send to Screen" modal: enter playlist name, pick screens → creates playlist + pushes
 */
(function () {
  const AppModules = window.AppModules || {};
  const appState  = window.AppState;

  AppModules.createMediaLibraryModule = function createMediaLibraryModule({ db }) {

    // ── Local state ────────────────────────────────────────────────────────────
    let mediaCache    = [];   // [{ id, name, url, type, uploadedAt, size }]
    let selectedIds   = new Set();
    let activeFilter  = 'all'; // 'all' | 'image' | 'video'
    let searchQuery   = '';
    let unsubscribe   = null;
    var thumbnailCache = {};  // { mediaId: dataURL } — persists across re-renders

    // ── Firestore watcher ──────────────────────────────────────────────────────
    function watchMedia() {
      if (unsubscribe) unsubscribe();
      unsubscribe = db.collection('mediaFiles')
        .orderBy('uploadedAt', 'desc')
        .onSnapshot(function(snap) {
          mediaCache = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
          renderGrid();
        }, function(err) {
          console.error('Media library snapshot error:', err);
        });
    }

    // ── Grid rendering ─────────────────────────────────────────────────────────
    function renderGrid() {
      var grid = document.getElementById('mlGrid');
      if (!grid) return;

      var q = searchQuery.toLowerCase();
      var visible = mediaCache.filter(function(m) {
        var typeOk = activeFilter === 'all' || m.type === activeFilter;
        var nameOk = !q || (m.name || '').toLowerCase().indexOf(q) !== -1;
        return typeOk && nameOk;
      });

      // Count badges
      var allCount = mediaCache.length;
      var imgCount = mediaCache.filter(function(m){ return m.type === 'image'; }).length;
      var vidCount = mediaCache.filter(function(m){ return m.type === 'video'; }).length;
      _setBadge('mlBadgeAll',   allCount);
      _setBadge('mlBadgeImage', imgCount);
      _setBadge('mlBadgeVideo', vidCount);

      // Empty state
      if (visible.length === 0) {
        grid.innerHTML = '<div class="ml-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><p>No media files yet.<br>Upload your first file above.</p></div>';
        _updateSendBtn();
        return;
      }

      grid.innerHTML = visible.map(function(m) {
        var sel     = selectedIds.has(m.id);
        var isVideo = m.type === 'video';
        var sizeStr   = m.size ? _fmtSize(m.size) : '';
        var cleanName = (m.name || '').replace(/^\d{10,14}_/, '');
        var cachedThumb = thumbnailCache[m.id];
        var thumb;
        if (isVideo) {
          if (cachedThumb) {
            thumb = '<div class="ml-thumb-video-wrap"><img src="' + cachedThumb + '" alt="" /><div class="ml-thumb-play-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M8 5v14l11-7z"/></svg></div></div>';
          } else {
            thumb = '<div class="ml-thumb-video ml-thumb-loading" data-vid-id="' + m.id + '"><svg viewBox="0 0 24 24" fill="currentColor" width="36" height="36"><path d="M8 5v14l11-7z"/></svg></div>';
          }
        } else {
          thumb = '<img src="' + _esc(m.url) + '" alt="' + _esc(m.name) + '" loading="lazy" />';
        }


        return '<div class="ml-card' + (sel ? ' is-selected' : '') + '" data-id="' + m.id + '" onclick="mlToggleSelect(\'' + m.id + '\')">'
          + '<div class="ml-thumb">' + thumb + '</div>'
          + '<div class="ml-card-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>'
          + '<div class="ml-card-type ' + (isVideo ? 'is-video' : 'is-image') + '">' + (isVideo ? 'Video' : 'Image') + '</div>'
          + '<div class="ml-card-footer">'
          +   '<span class="ml-card-name" title="' + _esc(m.name || '') + '">' + _esc(cleanName || m.name || 'Untitled') + '</span>'
          +   (sizeStr ? '<span class="ml-card-size">' + sizeStr + '</span>' : '')
          + '</div>'
          + '<button class="ml-card-delete" title="Delete" onclick="event.stopPropagation();mlDeleteMedia(\'' + m.id + '\',\'' + _esc(m.name || '') + '\')">'
          +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>'
          + '</button>'
          + '</div>';
      }).join('');

      _updateSendBtn();

      // Asynchronously grab 1-second frame thumbnails for any video without a cached one
      _grabVideoThumbnails(visible);
    }

    function _setBadge(id, count) {
      var el = document.getElementById(id);
      if (el) el.textContent = count;
    }

    // ── Video thumbnail generation ──────────────────────────────────────────────
    // Grabs a frame at 1 second from each visible video that has no cached thumbnail yet.
    // Runs asynchronously so the grid renders immediately with the play-icon placeholder,
    // then each card's thumb is replaced in-place once the frame is captured.
    function _grabVideoThumbnails(items) {
      items.forEach(function(m) {
        if (m.type !== 'video') return;
        if (thumbnailCache[m.id]) return;  // already cached
        if (!m.url) return;

        _grabFrame(m.url, 1).then(function(dataUrl) {
          thumbnailCache[m.id] = dataUrl;
          // Find the placeholder div in the current DOM and swap it out
          var placeholderEl = document.querySelector('.ml-thumb-loading[data-vid-id="' + m.id + '"]');
          if (placeholderEl) {
            var wrap = placeholderEl.parentNode;
            if (wrap) {
              // Replace placeholder with thumbnail + play-icon overlay
              var newThumb = document.createElement('div');
              newThumb.className = 'ml-thumb-video-wrap';
              newThumb.innerHTML = '<img src="' + dataUrl + '" alt="" /><div class="ml-thumb-play-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M8 5v14l11-7z"/></svg></div>';
              wrap.replaceChild(newThumb, placeholderEl);
            }
          }
        }).catch(function() {
          // Silently skip — placeholder play-icon stays
        });
      });
    }

    // Captures a single video frame at `seekTime` seconds via hidden video + canvas.
    // Returns a Promise that resolves with a data: URL (PNG), or rejects on error/timeout.
    function _grabFrame(url, seekTime) {
      return new Promise(function(resolve, reject) {
        var video = document.createElement('video');
        video.crossOrigin  = 'anonymous';
        video.preload      = 'metadata';
        video.muted        = true;
        video.playsInline  = true;
        video.style.cssText = 'position:absolute;left:-9999px;visibility:hidden;pointer-events:none;width:1px;height:1px;';

        var timeout = setTimeout(function() {
          cleanup();
          reject(new Error('Thumbnail timeout'));
        }, 12000); // 12s max per video

        function cleanup() {
          clearTimeout(timeout);
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
          if (video.parentNode) video.parentNode.removeChild(video);
        }

        function onSeeked() {
          try {
            var canvas = document.createElement('canvas');
            canvas.width  = video.videoWidth  || 320;
            canvas.height = video.videoHeight || 180;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            var dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            cleanup();
            resolve(dataUrl);
          } catch(e) {
            cleanup();
            reject(e);
          }
        }

        function onError() {
          cleanup();
          reject(new Error('Video load error'));
        }

        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', onError);

        // When metadata is ready, seek to the desired time
        video.addEventListener('loadedmetadata', function() {
          video.currentTime = Math.min(seekTime, video.duration || seekTime);
        });

        document.body.appendChild(video);
        video.src = url;
        video.load();
      });
    }

    function _updateSendBtn() {
      var btn = document.getElementById('mlSendBtn');
      if (!btn) return;
      var n = selectedIds.size;
      btn.disabled    = n === 0;
      btn.textContent = n > 0 ? 'Send ' + n + ' file' + (n > 1 ? 's' : '') + ' to Screen' : 'Send to Screen';
    }

    // ── Selection ──────────────────────────────────────────────────────────────
    function toggleSelect(id) {
      if (selectedIds.has(id)) selectedIds.delete(id);
      else selectedIds.add(id);

      var card = document.querySelector('.ml-card[data-id="' + id + '"]');
      if (card) card.classList.toggle('is-selected', selectedIds.has(id));
      _updateSendBtn();
    }

    function clearSelection() {
      selectedIds.clear();
      document.querySelectorAll('.ml-card.is-selected').forEach(function(c){ c.classList.remove('is-selected'); });
      _updateSendBtn();
    }

    function selectAll() {
      var q = searchQuery.toLowerCase();
      mediaCache.filter(function(m){
        var typeOk = activeFilter === 'all' || m.type === activeFilter;
        var nameOk = !q || (m.name || '').toLowerCase().indexOf(q) !== -1;
        return typeOk && nameOk;
      }).forEach(function(m){ selectedIds.add(m.id); });
      document.querySelectorAll('.ml-card').forEach(function(c){ c.classList.add('is-selected'); });
      _updateSendBtn();
    }

    // ── Filter & Search ────────────────────────────────────────────────────────
    function setFilter(f) {
      activeFilter = f;
      document.querySelectorAll('.ml-filter-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.filter === f); });
      clearSelection();
      renderGrid();
    }

    function onSearch(val) {
      searchQuery = val;
      clearSelection();
      renderGrid();
    }

    // ── Upload ─────────────────────────────────────────────────────────────────
    function triggerUpload() {
      var inp = document.getElementById('mlFileInput');
      if (inp) inp.click();
    }

    function onFilesPicked(files) {
      if (!files || files.length === 0) return;
      Array.from(files).forEach(function(file){ uploadOne(file); });
      var inp = document.getElementById('mlFileInput');
      if (inp) inp.value = '';
    }

    function uploadOne(file) {
      if (!window.R2Upload) {
        if (AppModules.showToast) AppModules.showToast('R2 upload helper not loaded. Refresh the page.', 'error');
        return;
      }

      var toastId = 'ml-upload-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      _showUploadToast(file.name, 0, toastId);

      window.R2Upload.upload(file, function(pct){ _updateUploadToast(toastId, pct); })
        .then(function(result) {
          _removeUploadToast(toastId);
          var type = file.type.startsWith('video/') ? 'video' : 'image';
          return db.collection('mediaFiles').add({
            name:       file.name,
            url:        result.url,
            type:       type,
            size:       file.size,
            uploadedAt: window.firebase.firestore.FieldValue.serverTimestamp()
          });
        })
        .then(function() {
          if (AppModules.showToast) AppModules.showToast('"' + file.name.replace(/^\d{10,14}_/, '') + '" uploaded!', 'success');
        })
        .catch(function(err) {
          _removeUploadToast(toastId);
          if (AppModules.showToast) AppModules.showToast('Upload failed: ' + err.message, 'error');
        });
    }

    // ── Delete ─────────────────────────────────────────────────────────────────
    function deleteMedia(id, name) {
      if (!confirm('Delete "' + name + '" from the media library?\n\nThis does NOT remove it from existing playlists.')) return;
      db.collection('mediaFiles').doc(id).delete()
        .then(function() {
          selectedIds.delete(id);
          _updateSendBtn();
          if (AppModules.showToast) AppModules.showToast('"' + name + '" deleted.', 'info');
        })
        .catch(function(err) {
          if (AppModules.showToast) AppModules.showToast('Delete failed: ' + err.message, 'error');
        });
    }

    // ── "Send to Screen" modal ─────────────────────────────────────────────────
    function openSendModal() {
      if (selectedIds.size === 0) return;

      var nameIn = document.getElementById('mlSendPlaylistName');
      if (nameIn) nameIn.value = '';

      var container = document.getElementById('mlSendScreenList');
      if (container) {
        var paired = Object.keys(appState.screenDataCache || {}).filter(function(id){
          return (appState.screenDataCache[id] || {}).status === 'paired';
        });
        if (paired.length === 0) {
          container.innerHTML = '<span class="text-muted small">No paired screens found.</span>';
        } else {
          container.innerHTML = paired.map(function(id) {
            var s = appState.screenDataCache[id] || {};
            return '<label class="ml-screen-check-label">'
              + '<input type="checkbox" class="mlScreenCb" value="' + id + '" />'
              + '<span>' + _esc(s.name || id) + '</span>'
              + '</label>';
          }).join('');
        }
      }

      var chips = document.getElementById('mlSendChips');
      if (chips) {
        chips.innerHTML = Array.from(selectedIds).map(function(id) {
          var m = mediaCache.find(function(x){ return x.id === id; });
          if (!m) return '';
          var cleanName = (m.name || '').replace(/^\d{10,14}_/, '');
          return '<span class="ml-chip ' + (m.type === 'video' ? 'is-video' : '') + '">' + _esc(cleanName || m.name || id) + '</span>';
        }).join('');
      }

      document.getElementById('mlSendModal').style.display = 'flex';
    }

    function closeSendModal() {
      var modal = document.getElementById('mlSendModal');
      if (modal) modal.style.display = 'none';
    }

    function confirmSend() {
      var nameIn = document.getElementById('mlSendPlaylistName');
      var name   = nameIn ? nameIn.value.trim() : '';
      if (!name) {
        if (AppModules.showToast) AppModules.showToast('Please enter a program name.', 'error');
        return;
      }

      var screenIds = Array.from(document.querySelectorAll('.mlScreenCb:checked')).map(function(cb){ return cb.value; });
      if (screenIds.length === 0) {
        if (AppModules.showToast) AppModules.showToast('Select at least one screen.', 'error');
        return;
      }

      var selectedItems = Array.from(selectedIds).map(function(id) {
        var m = mediaCache.find(function(x){ return x.id === id; });
        if (!m) return null;
        return {
          name:            m.name || '',
          type:            m.type || 'image',
          url:             m.url  || '',
          durationSeconds: m.type === 'video' ? 15 : 8,
          resizeMode:      'fit',
          rotation:        0,
          isLive:          false
        };
      }).filter(Boolean);

      if (selectedItems.length === 0) {
        if (AppModules.showToast) AppModules.showToast('No valid media selected.', 'error');
        return;
      }

      var saveBtn = document.getElementById('mlSendConfirmBtn');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

      // Process each screen independently.
      // If the screen already has a currentProgramId → UPDATE that program doc (no duplicate).
      // Otherwise → CREATE a new program doc and set currentProgramId on the screen.
      var promises = screenIds.map(function(screenId) {
        var s = appState.screenDataCache[screenId] || {};
        var existingProgramId = s.currentProgramId || null;

        if (existingProgramId) {
          // ── UPDATE existing program ────────────────────────────────────
          return db.collection('playlists').doc(existingProgramId).update({
            name:      name,
            items:     selectedItems,
            source:    'medialibrary',
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
          }).then(function() {
            // Make sure screen points at this program as currentPlaylist too
            var existing = Array.isArray(s.assignedPlaylists) && s.assignedPlaylists.length
                           ? s.assignedPlaylists
                           : (s.currentPlaylist ? [s.currentPlaylist] : []);
            var merged = existing.indexOf(existingProgramId) === -1
                         ? existing.concat([existingProgramId]) : existing;
            return db.collection('screens').doc(screenId).update({
              currentProgramId:  existingProgramId,
              assignedPlaylists: merged,
              currentPlaylist:   existingProgramId
            });
          });

        } else {
          // ── CREATE new program ─────────────────────────────────────────
          return db.collection('playlists').add({
            name:      name,
            items:     selectedItems,
            source:    'medialibrary',
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
          }).then(function(ref) {
            var programId = ref.id;
            var existing  = Array.isArray(s.assignedPlaylists) && s.assignedPlaylists.length
                            ? s.assignedPlaylists
                            : (s.currentPlaylist ? [s.currentPlaylist] : []);
            var merged = existing.indexOf(programId) === -1
                         ? existing.concat([programId]) : existing;
            return db.collection('screens').doc(screenId).update({
              currentProgramId:  programId,
              assignedPlaylists: merged,
              currentPlaylist:   programId
            });
          });
        }
      });

      Promise.all(promises)
        .then(function() {
          closeSendModal();
          clearSelection();
          if (AppModules.showToast) AppModules.showToast(
            'Program "' + name + '" pushed to ' + screenIds.length + ' screen' + (screenIds.length > 1 ? 's' : '') + '!',
            'success'
          );
        })
        .catch(function(err) {
          if (AppModules.showToast) AppModules.showToast('Send failed: ' + err.message, 'error');
        })
        .finally(function() {
          if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Push to Screen'; }
        });
    }

    // ── Upload toast helpers ───────────────────────────────────────────────────

    function _showUploadToast(name, pct, id) {
      var tray = document.getElementById('mlUploadTray');
      if (!tray) {
        tray = document.createElement('div');
        tray.id        = 'mlUploadTray';
        tray.className = 'ml-upload-tray';
        document.body.appendChild(tray);
      }
      var toast = document.createElement('div');
      toast.id        = id;
      toast.className = 'ml-upload-item';
      var cleanName = name.replace(/^\d{10,14}_/, '');
      toast.innerHTML = '<div class="ml-upitem-name">' + _esc(cleanName) + '</div>'
        + '<div class="ml-upitem-bar-wrap"><div class="ml-upitem-bar" style="width:' + pct + '%"></div></div>'
        + '<div class="ml-upitem-pct">' + pct + '%</div>';
      tray.appendChild(toast);
    }

    function _updateUploadToast(id, pct) {
      var toast = document.getElementById(id);
      if (!toast) return;
      var bar   = toast.querySelector('.ml-upitem-bar');
      var pctEl = toast.querySelector('.ml-upitem-pct');
      if (bar)   bar.style.width  = pct + '%';
      if (pctEl) pctEl.textContent = pct + '%';
    }

    function _removeUploadToast(id) {
      var toast = document.getElementById(id);
      if (!toast) return;
      toast.style.opacity = '0';
      setTimeout(function(){
        if (toast.parentNode) toast.parentNode.removeChild(toast);
        _cleanTray();
      }, 600);
    }

    function _cleanTray() {
      var tray = document.getElementById('mlUploadTray');
      if (tray && tray.children.length === 0) tray.remove();
    }

    // ── Utility ────────────────────────────────────────────────────────────────
    function _esc(str) {
      return String(str)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;');
    }

    function _fmtSize(bytes) {
      if (!bytes)              return '';
      if (bytes < 1024)        return bytes + ' B';
      if (bytes < 1048576)     return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1048576).toFixed(1) + ' MB';
    }

    // ── Global helpers exposed for inline HTML ─────────────────────────────────
    window.mlToggleSelect   = toggleSelect;
    window.mlClearSelection = clearSelection;
    window.mlSelectAll      = selectAll;
    window.mlSetFilter      = setFilter;
    window.mlOnSearch       = onSearch;
    window.mlTriggerUpload  = triggerUpload;
    window.mlOnFilesPicked  = onFilesPicked;
    window.mlDeleteMedia    = deleteMedia;
    window.mlOpenSendModal  = openSendModal;
    window.mlCloseSendModal = closeSendModal;
    window.mlConfirmSend    = confirmSend;

    return { watchMedia: watchMedia, renderGrid: renderGrid };
  };

  window.AppModules = AppModules;
})();
