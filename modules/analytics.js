(function () {
  const AppModules = window.AppModules || {};
  const appState = window.AppState;

  AppModules.createAnalyticsModule = function createAnalyticsModule({ db }) {
    function getLocalDateString(d = new Date()) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function initAnalyticsFilters() {
      const dateInput = document.getElementById("analyticsDateFilter");
      if (dateInput && !dateInput.value) {
        dateInput.value = getLocalDateString();
      }
    }

    function populateAnalyticsScreenOptions() {
      const sel = document.getElementById("analyticsScreenFilter");
      if (!sel) return;

      const current = sel.value;
      const options = Object.keys(appState.screenDataCache).map((id) => {
        const s = appState.screenDataCache[id];
        return `<option value="${id}">${s.name || id}</option>`;
      }).join("");

      sel.innerHTML = `<option value="">All screens</option>${options}`;
      sel.value = current;
    }

    function formatPlaytime(totalSeconds) {
      const mins = Math.floor(totalSeconds / 60);
      const secs = Math.round(totalSeconds % 60);
      return mins === 0 ? `${secs}s` : `${mins}m ${secs}s`;
    }

    function loadAnalytics() {
      const dateInput = document.getElementById("analyticsDateFilter");
      const screenSelect = document.getElementById("analyticsScreenFilter");
      const totalEl = document.getElementById("analyticsTotal");
      const byScreenCard = document.getElementById("analyticsByScreenCard");

      if (!dateInput || !screenSelect || !totalEl) return;
      if (!dateInput.value) return;

      const dateKey = dateInput.value.replace(/-/g, "");
      const screenId = screenSelect.value;

      totalEl.textContent = "Loading…";

      const showError = (message) => {
        totalEl.textContent = message;
        const byAdBody = document.getElementById("analyticsByAdBody");
        if (byAdBody) byAdBody.innerHTML = `<tr><td colspan="4">${message}</td></tr>`;
        const byScreenBody = document.getElementById("analyticsByScreenBody");
        if (byScreenBody) byScreenBody.innerHTML = `<tr><td colspan="3">${message}</td></tr>`;
      };

      if (screenId) {
        byScreenCard.style.display = "none";
        db.collection("analytics").doc(`${screenId}_${dateKey}`).collection("items").get()
          .then((snapshot) => renderAnalytics(snapshot.docs.map((doc) => doc.data()), false))
          .catch((err) => {
            const message = err.code === "permission-denied"
              ? "Couldn't load analytics — your Firebase rules may be blocking this view."
              : "Couldn't load analytics for this screen/date.";
            showError(message);
          });
      } else {
        byScreenCard.style.display = "block";
        db.collectionGroup("items").where("date", "==", dateKey).get()
          .then((snapshot) => renderAnalytics(snapshot.docs.map((doc) => doc.data()), true))
          .catch((err) => {
            const message = err.code === "permission-denied"
              ? "Couldn't load analytics — your Firebase rules may be blocking this view."
              : "Couldn't load analytics for this date.";
            showError(message);
          });
      }
    }

    function renderAnalytics(rows, groupByScreen) {
      let totalSeconds = 0;
      const byAd = {};
      const byScreen = {};

      rows.forEach((row) => {
        const seconds = row.totalSeconds || 0;
        totalSeconds += seconds;

        if (!byAd[row.url]) byAd[row.url] = { type: row.type, url: row.url, playCount: 0, totalSeconds: 0 };
        byAd[row.url].playCount += row.playCount || 0;
        byAd[row.url].totalSeconds += seconds;

        if (groupByScreen) {
          if (!byScreen[row.screenId]) byScreen[row.screenId] = { screenId: row.screenId, playCount: 0, totalSeconds: 0 };
          byScreen[row.screenId].playCount += row.playCount || 0;
          byScreen[row.screenId].totalSeconds += seconds;
        }
      });

      const totalEl = document.getElementById("analyticsTotal");
      if (totalEl) {
        totalEl.textContent = rows.length
          ? `${formatPlaytime(totalSeconds)} across ${rows.length} ad${rows.length === 1 ? "" : "s"}`
          : "No playback recorded for this filter.";
      }

      const byAdBody = document.getElementById("analyticsByAdBody");
      if (byAdBody) {
        byAdBody.innerHTML = Object.values(byAd)
          .sort((a, b) => b.totalSeconds - a.totalSeconds)
          .map((entry) => `<tr><td>${entry.type}</td><td>${entry.url}</td><td>${entry.playCount}</td><td>${formatPlaytime(entry.totalSeconds)}</td></tr>`)
          .join("") || "<tr><td colspan=\"4\">No data</td></tr>";
      }

      const byScreenBody = document.getElementById("analyticsByScreenBody");
      if (groupByScreen && byScreenBody) {
        byScreenBody.innerHTML = Object.values(byScreen)
          .sort((a, b) => b.totalSeconds - a.totalSeconds)
          .map((entry) => {
            const name = (appState.screenDataCache[entry.screenId] && appState.screenDataCache[entry.screenId].name) || entry.screenId;
            return `<tr><td>${name}</td><td>${entry.playCount}</td><td>${formatPlaytime(entry.totalSeconds)}</td></tr>`;
          })
          .join("") || "<tr><td colspan=\"3\">No data</td></tr>";
      }
    }

    return {
      initAnalyticsFilters,
      populateAnalyticsScreenOptions,
      formatPlaytime,
      loadAnalytics,
      renderAnalytics
    };
  };

  window.AppModules = AppModules;
})();
