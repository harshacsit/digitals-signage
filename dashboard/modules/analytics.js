(function () {
  const AppModules = window.AppModules || {};
  const appState = window.AppState;

  AppModules.createAnalyticsModule = function createAnalyticsModule({ db }) {
    // Memory Cache to ensure 100% Zero Repeated Firestore Reads for same date/screen query
    const analyticsCache = {};
    let currentRows = [];
    let activeAnalyticsTab = "overview"; // "overview" | "playlists" | "ads" | "tv-breakdown"

    function getLocalDateString(d = new Date()) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function formatDateForDisplay(dateStr) {
      if (!dateStr) return "";
      const parts = dateStr.split("-");
      if (parts.length !== 3) return dateStr;
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }

    function formatPlaytime(totalSeconds) {
      const sec = Math.round(totalSeconds || 0);
      if (sec <= 0) return "0s";
      const hrs = Math.floor(sec / 3600);
      const mins = Math.floor((sec % 3600) / 60);
      const secs = sec % 60;

      if (hrs > 0) {
        return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
      }
      if (mins > 0) {
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
      }
      return `${secs}s`;
    }

    function initAnalyticsFilters() {
      const dateInput = document.getElementById("analyticsDateFilter");
      if (dateInput && !dateInput.value) {
        dateInput.value = getLocalDateString();
      }
      populateAnalyticsScreenOptions();
    }

    function populateAnalyticsScreenOptions() {
      const sel = document.getElementById("analyticsScreenFilter");
      if (!sel) return;

      const current = sel.value;
      const screens = appState.screenDataCache || {};
      const options = Object.keys(screens).map((id) => {
        const s = screens[id];
        const name = s.name || id;
        return `<option value="${id}">${name}</option>`;
      }).join("");

      sel.innerHTML = `<option value="">All TV Screens (${Object.keys(screens).length})</option>${options}`;
      sel.value = current;
    }

    function setAnalyticsDatePreset(preset) {
      const dateInput = document.getElementById("analyticsDateFilter");
      if (!dateInput) return;

      const d = new Date();
      if (preset === "yesterday") {
        d.setDate(d.getDate() - 1);
      } else if (preset === "last7") {
        // Sets to today, but we handle range query in loadAnalytics if needed
      }

      dateInput.value = getLocalDateString(d);

      // Update preset active state
      document.querySelectorAll(".analytics-preset-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.preset === preset);
      });

      loadAnalytics();
    }

    function setAnalyticsTab(tabName) {
      activeAnalyticsTab = tabName;
      document.querySelectorAll(".analytics-tab-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.tab === tabName);
      });

      const overviewSection = document.getElementById("analyticsOverviewSection");
      const playlistsSection = document.getElementById("analyticsPlaylistsSection");
      const adsSection = document.getElementById("analyticsAdsSection");
      const tvSection = document.getElementById("analyticsTvSection");

      if (overviewSection) overviewSection.style.display = tabName === "overview" ? "block" : "none";
      if (playlistsSection) playlistsSection.style.display = tabName === "playlists" ? "block" : "none";
      if (adsSection) adsSection.style.display = tabName === "ads" ? "block" : "none";
      if (tvSection) tvSection.style.display = tabName === "tv-breakdown" ? "block" : "none";
    }

    function loadAnalytics() {
      const dateInput = document.getElementById("analyticsDateFilter");
      const screenSelect = document.getElementById("analyticsScreenFilter");
      const totalEl = document.getElementById("analyticsTotalHeader");
      const subEl = document.getElementById("analyticsSubHeader");

      if (!dateInput || !dateInput.value) return;

      const dateStr = dateInput.value;
      const dateKey = dateStr.replace(/-/g, "");
      const screenId = screenSelect ? screenSelect.value : "";
      const cacheKey = `${screenId || "ALL"}_${dateKey}`;

      if (totalEl) totalEl.textContent = "Loading playback analytics…";
      if (subEl) subEl.textContent = `Fetching records for ${formatDateForDisplay(dateStr)}`;

      // Check In-Memory Cache first to honor Firebase limits
      if (analyticsCache[cacheKey]) {
        console.log(`⚡ [Analytics Cache Hit] Loaded 0-Firestore-Read data for ${cacheKey}`);
        currentRows = analyticsCache[cacheKey];
        renderAnalytics(currentRows, !screenId, dateStr, screenId);
        return;
      }

      const showError = (message) => {
        if (totalEl) totalEl.textContent = "Analytics Unavailable";
        if (subEl) subEl.textContent = message;

        const containerIds = ["analyticsPlaylistsBody", "analyticsAdsBody", "analyticsTvBody", "analyticsOverviewPlaylistsBody", "analyticsOverviewAdsBody"];
        containerIds.forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">${message}</td></tr>`;
        });
      };

      if (screenId) {
        // Query specific screen for date using standard collection read
        db.collection("analytics").doc(`${screenId}_${dateKey}`).collection("items").get()
          .then((snapshot) => {
            const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), screenId }));
            analyticsCache[cacheKey] = rows;
            currentRows = rows;
            renderAnalytics(rows, false, dateStr, screenId);
          })
          .catch((err) => {
            console.error("Firestore Analytics Error:", err);
            showError("Unable to load analytics for this TV screen.");
          });
      } else {
        // Query all registered screens in parallel using standard Firestore collection reads (Requires 0 rule changes)
        const screens = appState.screenDataCache || {};
        const registeredScreenIds = Object.keys(screens);

        if (registeredScreenIds.length > 0) {
          const fetchPromises = registeredScreenIds.map((sId) =>
            db.collection("analytics").doc(`${sId}_${dateKey}`).collection("items").get()
              .then((snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), screenId: sId })))
              .catch((err) => {
                console.warn(`Could not read analytics for screen ${sId}:`, err);
                return [];
              })
          );

          Promise.all(fetchPromises)
            .then((results) => {
              const rows = results.flat();
              analyticsCache[cacheKey] = rows;
              currentRows = rows;
              renderAnalytics(rows, true, dateStr, "");
            })
            .catch((err) => {
              console.error("Firestore Aggregate Analytics Error:", err);
              showError("Unable to load network analytics.");
            });
        } else {
          // Fallback if screen cache isn't populated yet
          db.collectionGroup("items").where("date", "==", dateKey).get()
            .then((snapshot) => {
              const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
              analyticsCache[cacheKey] = rows;
              currentRows = rows;
              renderAnalytics(rows, true, dateStr, "");
            })
            .catch(() => {
              renderAnalytics([], true, dateStr, "");
            });
        }
      }
    }

    function generateSampleAnalyticsData() {
      const dateInput = document.getElementById("analyticsDateFilter");
      const screenSelect = document.getElementById("analyticsScreenFilter");
      const dateStr = (dateInput && dateInput.value) || getLocalDateString();
      const dateKey = dateStr.replace(/-/g, "");
      const screenId = screenSelect ? screenSelect.value : "";

      const screens = appState.screenDataCache || {};
      const screenIds = Object.keys(screens).length > 0 ? Object.keys(screens) : ["TV_StoreEntrance", "TV_BillingCounter", "TV_FoodCourt"];
      const playlists = appState.playlistCache || [];

      const sampleAds = [
        { name: "Summer Sale 2026 Promo Video.mp4", type: "video", defaultDuration: 30 },
        { name: "Special Discount Banner.jpg", type: "image", defaultDuration: 15 },
        { name: "New Arrival Collection Commercial.mp4", type: "video", defaultDuration: 45 },
        { name: "Store Operating Hours Banner.png", type: "image", defaultDuration: 10 },
        { name: "Live News Web Ticker Widget", type: "web", defaultDuration: 60 }
      ];

      const rows = [];
      const targetScreens = screenId ? [screenId] : screenIds;

      targetScreens.forEach((sid) => {
        sampleAds.forEach((ad, idx) => {
          const p = playlists[idx % Math.max(1, playlists.length)] || { id: `p_${idx}`, name: idx % 2 === 0 ? "Main Daily Ads" : "Special Offers" };
          const playCount = Math.floor(Math.random() * 40) + 12;
          const totalSec = playCount * ad.defaultDuration;

          rows.push({
            screenId: sid,
            date: dateKey,
            url: ad.name,
            type: ad.type,
            playlistId: p.id,
            playlistName: p.name || "Default Playlist",
            playCount: playCount,
            totalSeconds: totalSec
          });
        });
      });

      const cacheKey = `${screenId || "ALL"}_${dateKey}`;
      analyticsCache[cacheKey] = rows;
      currentRows = rows;
      renderAnalytics(rows, !screenId, dateStr, screenId, true);
    }

    function renderAnalytics(rows, isAllScreens, dateStr, selectedScreenId, isDemo = false) {
      let totalNetworkSeconds = 0;
      let totalAdImpressions = 0;
      const byPlaylist = {};
      const byAd = {};
      const byScreen = {};

      const screenMap = appState.screenDataCache || {};
      const playlistMap = {};
      (appState.playlistCache || []).forEach((p) => { playlistMap[p.id] = p.name; });

      rows.forEach((row) => {
        const sec = row.totalSeconds || 0;
        const count = row.playCount || 0;
        const sId = row.screenId || "Unknown TV";
        const adUrl = row.url || "Unnamed Ad";
        const adType = row.type || "video";

        // Resolve Playlist Name
        let pName = row.playlistName;
        if (!pName && row.playlistId) {
          pName = playlistMap[row.playlistId] || row.playlistId;
        }
        if (!pName) pName = "General Playlist";

        totalNetworkSeconds += sec;
        totalAdImpressions += count;

        // 1. Aggregate by Playlist
        if (!byPlaylist[pName]) {
          byPlaylist[pName] = { name: pName, playCount: 0, totalSeconds: 0, screens: new Set(), adsCount: new Set() };
        }
        byPlaylist[pName].playCount += count;
        byPlaylist[pName].totalSeconds += sec;
        byPlaylist[pName].screens.add(sId);
        byPlaylist[pName].adsCount.add(adUrl);

        // 2. Aggregate by Ad
        if (!byAd[adUrl]) {
          byAd[adUrl] = { url: adUrl, type: adType, playlistName: pName, playCount: 0, totalSeconds: 0, screens: new Set() };
        }
        byAd[adUrl].playCount += count;
        byAd[adUrl].totalSeconds += sec;
        byAd[adUrl].screens.add(sId);

        // 3. Aggregate by TV Screen
        if (!byScreen[sId]) {
          const sName = (screenMap[sId] && screenMap[sId].name) || sId;
          byScreen[sId] = { screenId: sId, name: sName, playCount: 0, totalSeconds: 0, playlists: {}, ads: {} };
        }
        byScreen[sId].playCount += count;
        byScreen[sId].totalSeconds += sec;
        byScreen[sId].playlists[pName] = (byScreen[sId].playlists[pName] || 0) + sec;
        byScreen[sId].ads[adUrl] = (byScreen[sId].ads[adUrl] || 0) + sec;
      });

      // Stat Cards Update
      const totalHeader = document.getElementById("analyticsTotalHeader");
      const subHeader = document.getElementById("analyticsSubHeader");
      const statTotalTime = document.getElementById("analyticsStatTotalTime");
      const statTotalPlays = document.getElementById("analyticsStatTotalPlays");
      const statActiveTvs = document.getElementById("analyticsStatActiveTvs");
      const statTopPlaylist = document.getElementById("analyticsStatTopPlaylist");
      const demoBadge = document.getElementById("analyticsDemoBadge");

      if (demoBadge) demoBadge.style.display = isDemo ? "inline-flex" : "none";

      const formattedDate = formatDateForDisplay(dateStr);
      const selectedTvName = selectedScreenId && screenMap[selectedScreenId] ? screenMap[selectedScreenId].name : selectedScreenId;

      if (totalHeader) {
        totalHeader.textContent = selectedScreenId
          ? `Analytics for ${selectedTvName}`
          : "Network Playback Analytics";
      }

      if (subHeader) {
        subHeader.textContent = rows.length
          ? `${formattedDate} • ${rows.length} playback record log entry${rows.length === 1 ? "" : "s"}`
          : `No playback recorded for ${formattedDate}`;
      }

      if (statTotalTime) statTotalTime.textContent = formatPlaytime(totalNetworkSeconds);
      if (statTotalPlays) statTotalPlays.textContent = totalAdImpressions.toLocaleString();
      if (statActiveTvs) {
        const tvCount = Object.keys(byScreen).length;
        const totalRegistered = Object.keys(screenMap).length || 1;
        statActiveTvs.textContent = selectedScreenId ? "1 TV" : `${tvCount} / ${totalRegistered} TVs`;
      }

      // Top Playlist calculation
      const sortedPlaylists = Object.values(byPlaylist).sort((a, b) => b.totalSeconds - a.totalSeconds);
      const topP = sortedPlaylists[0];
      if (statTopPlaylist) {
        statTopPlaylist.textContent = topP ? `${topP.name} (${formatPlaytime(topP.totalSeconds)})` : "None";
      }

      // Check if empty
      if (rows.length === 0) {
        renderEmptyAnalyticsState(formattedDate);
        return;
      }

      // Render Playlist Table
      renderPlaylistTable(sortedPlaylists, totalNetworkSeconds);

      // Render Ad Table
      const sortedAds = Object.values(byAd).sort((a, b) => b.totalSeconds - a.totalSeconds);
      renderAdTable(sortedAds, totalNetworkSeconds);

      // Render TV Breakdown Table
      const sortedScreens = Object.values(byScreen).sort((a, b) => b.totalSeconds - a.totalSeconds);
      renderTvTable(sortedScreens, totalNetworkSeconds);

      // Render Overview Mini Tables
      renderOverviewTables(sortedPlaylists, sortedAds, totalNetworkSeconds);
    }

    function renderEmptyAnalyticsState(dateDisplay) {
      const emptyHtml = `
        <tr>
          <td colspan="6" class="text-center py-5">
            <div class="py-3">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" class="mb-2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              <h6 class="fw-bold text-dark mb-1">No playback logged for ${dateDisplay}</h6>
              <p class="text-secondary small mb-3">TV screens auto-report ad airtime data to Firestore at the end of daily playback loops.</p>
              <button class="btn btn-outline-primary btn-sm rounded-pill px-3" onclick="AppModules.generateSampleAnalyticsData()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="me-1"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.83 6.72 2.24L21 8"/><path d="M21 3v5h-5"/></svg>
                Load Sample Analytics Data
              </button>
            </div>
          </td>
        </tr>
      `;

      ["analyticsPlaylistsBody", "analyticsAdsBody", "analyticsTvBody", "analyticsOverviewPlaylistsBody", "analyticsOverviewAdsBody"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = emptyHtml;
      });
    }

    function renderPlaylistTable(playlists, totalNetworkSeconds) {
      const tbody = document.getElementById("analyticsPlaylistsBody");
      if (!tbody) return;

      tbody.innerHTML = playlists.map((p, idx) => {
        const pct = totalNetworkSeconds > 0 ? Math.round((p.totalSeconds / totalNetworkSeconds) * 100) : 0;
        return `
          <tr>
            <td class="fw-bold text-dark">
              <div class="d-flex align-items-center gap-2">
                <span class="badge bg-light text-dark border">#${idx + 1}</span>
                <span>${p.name}</span>
              </div>
            </td>
            <td><span class="badge bg-info-subtle text-info border border-info-subtle">${p.adsCount.size} ad${p.adsCount.size === 1 ? "" : "s"}</span></td>
            <td><span class="badge bg-primary-subtle text-primary border border-primary-subtle">${p.screens.size} TV${p.screens.size === 1 ? "" : "s"}</span></td>
            <td class="fw-semibold">${p.playCount.toLocaleString()} plays</td>
            <td class="fw-bold text-primary-brand">${formatPlaytime(p.totalSeconds)}</td>
            <td style="width: 180px;">
              <div class="d-flex align-items-center gap-2">
                <div class="progress flex-grow-1" style="height: 6px;">
                  <div class="progress-bar bg-primary-brand" style="width: ${pct}%"></div>
                </div>
                <span class="small fw-semibold text-secondary" style="width: 35px; text-align: right;">${pct}%</span>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }

    function renderAdTable(ads, totalNetworkSeconds) {
      const tbody = document.getElementById("analyticsAdsBody");
      if (!tbody) return;

      tbody.innerHTML = ads.map((ad, idx) => {
        const pct = totalNetworkSeconds > 0 ? Math.round((ad.totalSeconds / totalNetworkSeconds) * 100) : 0;
        const avgSec = ad.playCount > 0 ? Math.round(ad.totalSeconds / ad.playCount) : 0;
        const typeBadge = ad.type === "video" ? "bg-danger-subtle text-danger border-danger-subtle" : "bg-success-subtle text-success border-success-subtle";

        return `
          <tr>
            <td class="fw-bold text-dark">
              <div class="d-flex align-items-center gap-2">
                <span class="badge bg-light text-dark border">#${idx + 1}</span>
                <span class="text-truncate" style="max-width: 260px;" title="${ad.url}">${ad.url}</span>
              </div>
            </td>
            <td><span class="badge ${typeBadge} border text-uppercase" style="font-size:10px;">${ad.type}</span></td>
            <td class="small text-secondary">${ad.playlistName}</td>
            <td class="fw-semibold">${ad.playCount.toLocaleString()}</td>
            <td class="small text-muted">${avgSec}s / play</td>
            <td class="fw-bold text-primary-brand">${formatPlaytime(ad.totalSeconds)}</td>
            <td style="width: 140px;">
              <div class="d-flex align-items-center gap-2">
                <div class="progress flex-grow-1" style="height: 6px;">
                  <div class="progress-bar bg-info" style="width: ${pct}%"></div>
                </div>
                <span class="small fw-semibold text-secondary" style="width: 35px; text-align: right;">${pct}%</span>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }

    function renderTvTable(screens, totalNetworkSeconds) {
      const tbody = document.getElementById("analyticsTvBody");
      if (!tbody) return;

      tbody.innerHTML = screens.map((s, idx) => {
        const pct = totalNetworkSeconds > 0 ? Math.round((s.totalSeconds / totalNetworkSeconds) * 100) : 0;

        // Find top playlist for this screen
        let topPlaylistName = "None";
        let maxPLSec = 0;
        Object.entries(s.playlists).forEach(([pName, pSec]) => {
          if (pSec > maxPLSec) {
            maxPLSec = pSec;
            topPlaylistName = pName;
          }
        });

        return `
          <tr>
            <td class="fw-bold text-dark">
              <div class="d-flex align-items-center gap-2">
                <span class="badge bg-light text-dark border">#${idx + 1}</span>
                <span>${s.name}</span>
              </div>
            </td>
            <td class="small text-secondary">${s.screenId}</td>
            <td><span class="badge bg-light text-dark border">${topPlaylistName}</span></td>
            <td class="fw-semibold">${s.playCount.toLocaleString()} plays</td>
            <td class="fw-bold text-primary-brand">${formatPlaytime(s.totalSeconds)}</td>
            <td style="width: 160px;">
              <div class="d-flex align-items-center gap-2">
                <div class="progress flex-grow-1" style="height: 6px;">
                  <div class="progress-bar bg-success" style="width: ${pct}%"></div>
                </div>
                <span class="small fw-semibold text-secondary" style="width: 35px; text-align: right;">${pct}%</span>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }

    function renderOverviewTables(playlists, ads, totalNetworkSeconds) {
      const pBody = document.getElementById("analyticsOverviewPlaylistsBody");
      if (pBody) {
        pBody.innerHTML = playlists.slice(0, 4).map((p) => `
          <tr>
            <td class="fw-semibold text-dark text-truncate" style="max-width: 180px;">${p.name}</td>
            <td class="text-secondary">${p.playCount} plays</td>
            <td class="fw-bold text-end text-primary-brand">${formatPlaytime(p.totalSeconds)}</td>
          </tr>
        `).join("") || "<tr><td colspan='3' class='text-muted'>No data</td></tr>";
      }

      const aBody = document.getElementById("analyticsOverviewAdsBody");
      if (aBody) {
        aBody.innerHTML = ads.slice(0, 4).map((ad) => `
          <tr>
            <td class="fw-semibold text-dark text-truncate" style="max-width: 180px;">${ad.url}</td>
            <td class="text-secondary">${ad.playCount} plays</td>
            <td class="fw-bold text-end text-primary-brand">${formatPlaytime(ad.totalSeconds)}</td>
          </tr>
        `).join("") || "<tr><td colspan='3' class='text-muted'>No data</td></tr>";
      }
    }

    function exportAnalyticsCSV() {
      if (!currentRows || currentRows.length === 0) {
        alert("No analytics data available to export. Please select a valid date with playback records.");
        return;
      }

      const dateInput = document.getElementById("analyticsDateFilter");
      const dateStr = (dateInput && dateInput.value) || getLocalDateString();
      const screenMap = appState.screenDataCache || {};

      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += `Bhimavaram Digitals Playback Analytics Report (${dateStr})\n\n`;
      csvContent += "TV Screen ID,TV Screen Name,Date,Playlist Name,Ad Title / URL,Ad Type,Play Count (Impressions),Total Seconds Played,Formatted Playtime\n";

      currentRows.forEach((row) => {
        const sName = (screenMap[row.screenId] && screenMap[row.screenId].name) || row.screenId || "Unknown TV";
        const pName = row.playlistName || "General Playlist";
        const formattedTime = formatPlaytime(row.totalSeconds || 0);
        const cleanUrl = (row.url || "").replace(/"/g, '""');
        const cleanPName = pName.replace(/"/g, '""');
        const cleanSName = sName.replace(/"/g, '""');

        csvContent += `"${row.screenId}","${cleanSName}","${row.date}","${cleanPName}","${cleanUrl}","${row.type || "video"}",${row.playCount || 0},${row.totalSeconds || 0},"${formattedTime}"\n`;
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `bhimavaram_digitals_analytics_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    return {
      initAnalyticsFilters,
      populateAnalyticsScreenOptions,
      formatPlaytime,
      setAnalyticsDatePreset,
      setAnalyticsTab,
      loadAnalytics,
      generateSampleAnalyticsData,
      exportAnalyticsCSV
    };
  };

  window.AppModules = AppModules;
})();
