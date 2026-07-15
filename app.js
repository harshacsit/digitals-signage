// ===================== CONFIG =====================
const firebaseConfig = {
  apiKey: "AIzaSyBq6nQFLJBQvEdOUjg7KtzpaWZ4H1reb6c",
  authDomain: "my-signage-app-d0b8a.firebaseapp.com",
  projectId: "my-signage-app-d0b8a",
  storageBucket: "my-signage-app-d0b8a.firebasestorage.app",
  messagingSenderId: "1004716989793",
  appId: "1:1004716989793:web:bba0b9234929e3373e3920",
  measurementId: "G-Y8X4WK2YS5"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ===================== NAVIGATION (new — UI only, no logic change) =====================
function switchView(viewId, btn) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(viewId).classList.add("active");
  document.querySelectorAll(".navBtn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

// ===================== AUTH =====================
function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  auth.signInWithEmailAndPassword(email, password)
    .catch(err => document.getElementById("loginError").textContent = err.message);
}
function logout() { auth.signOut(); }

auth.onAuthStateChanged(user => {
  document.getElementById("loginBox").style.display = user ? "none" : "block";
  document.getElementById("app").style.display = user ? "block" : "none";
  if (user) {
    watchScreens();
    watchPlaylists();
    initAnalyticsFilters();
    loadAnalytics();
  
  }
});

// ===================== SCREENS =====================
let playlistsCache = [];
let screenRows = {};
let screenDataCache = {};
let editingPlaylistId = null;

function addScreen() {
  const code = document.getElementById("pairCode").value.trim().toUpperCase();
  const name = document.getElementById("pairName").value.trim();
  if (!code || !name) return alert("Enter both the pairing code and a name.");

  const ref = db.collection("screens").doc(code);
  ref.get().then(doc => {
    if (!doc.exists) {
      alert("No screen found with that code. Make sure the TV is showing this exact code.");
      return;
    }
    ref.update({ status: "paired", name: name })
      .then(() => {
        document.getElementById("pairCode").value = "";
        document.getElementById("pairName").value = "";
      });
  });
}

function watchScreens() {
  db.collection("screens").onSnapshot(snapshot => {
    document.getElementById("screenCount").textContent = snapshot.size + " screens";

    snapshot.docChanges().forEach(change => {
      const doc = change.doc;

      if (change.type === "removed") {
        if (screenRows[doc.id]) {
          screenRows[doc.id].remove();
          delete screenRows[doc.id];
        }
        delete screenDataCache[doc.id];
        return;
      }

      const s = doc.data();
      screenDataCache[doc.id] = s;
      
       if (s.status !== "paired") {
        if (screenRows[doc.id]) {
          screenRows[doc.id].remove();
          delete screenRows[doc.id];
        }
        return;
      }

      renderScreenRow(doc.id, s);
    });
    populateAnalyticsScreenOptions();
  });
}

function renderScreenRow(docId, s) {
  const lastSeenMs = s.lastSeen ? s.lastSeen.toMillis() : 0;
  const isOnline = Date.now() - lastSeenMs < 120000;

  let tr = screenRows[docId];
  if (!tr) {
    tr = document.createElement("tr");
    screenRows[docId] = tr;
    document.getElementById("screensBody").appendChild(tr);
  }

  const activeSelect = tr.querySelector("select.playlistSelect");
  const isEditingThisRow = activeSelect && document.activeElement === activeSelect;
  const activeRotationSelect = tr.querySelector("select.rotationSelect");
   const isEditingRotation = activeRotationSelect && document.activeElement === activeRotationSelect;

  tr.innerHTML = `
    <td><span class="dot ${isOnline ? 'online' : 'offline'}"></span>${isOnline ? 'Online' : 'Offline'}</td>
    <td>${s.name || '(unnamed - ' + docId + ')'}</td>
    <td>${isEditingThisRow ? activeSelect.outerHTML : playlistDropdown(docId, s.currentPlaylist)}</td>
    <td>${isEditingRotation ? activeRotationSelect.outerHTML : rotationDropdown(docId, s.rotation)}</td>
    <td>${lastSeenMs ? new Date(lastSeenMs).toLocaleTimeString() : '—'}</td>
    <td><button class="secondary" onclick="removeScreen('${docId}')">Remove</button></td>
  `;
}

function playlistDropdown(screenId, currentPlaylistId) {
  const options = playlistsCache.map(p =>
    `<option value="${p.id}" ${p.id === currentPlaylistId ? 'selected' : ''}>${p.name}</option>`
  ).join("");
  return `<select class="playlistSelect" onchange="assignPlaylist('${screenId}', this.value)">
            <option value="">— none —</option>${options}
          </select>`;
}
function rotationDropdown(screenId, currentRotation) {
   const rotation = currentRotation || 0;
   const options = [0, 90, 180, 270].map(deg =>
     `<option value="${deg}" ${deg === rotation ? 'selected' : ''}>${deg}°</option>`
   ).join("");
   return `<select class="rotationSelect" onchange="assignRotation('${screenId}', this.value)">${options}</select>`;
 }

function assignRotation(screenId, rotation) {
    db.collection("screens").doc(screenId).update({ rotation: parseInt(rotation) });
  }
function assignPlaylist(screenId, playlistId) {
  db.collection("screens").doc(screenId).update({ currentPlaylist: playlistId || null });
}

function removeScreen(screenId) {
  if (!confirm("Remove this screen? The device will show the pairing screen again.")) return;
  db.collection("screens").doc(screenId).update({ status: "unpaired", currentPlaylist: null, name: null });
}

// ===================== PLAYLISTS =====================


function watchPlaylists() {
  db.collection("playlists").onSnapshot(snapshot => {
    playlistsCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    Object.keys(screenDataCache).forEach(docId => {
      renderScreenRow(docId, screenDataCache[docId]);
    });
    renderPlaylistsTable();
  });
}

function renderPlaylistsTable() {
  document.getElementById("playlistsBody").innerHTML = playlistsCache.map(p => `
    <tr>
      <td>${p.name}</td>
      <td>${(p.items || []).length} items</td>
      <td>
        <button class="secondary" onclick="editPlaylist('${p.id}')">Edit</button>
        <button class="secondary" onclick="deletePlaylist('${p.id}')">Delete</button>
      </td>
    </tr>`).join("");
}

function editPlaylist(id) {
  const p = playlistsCache.find(pl => pl.id === id);
  if (!p) return;
  editingPlaylistId = id;
  document.getElementById("playlistName").value = p.name;
  document.getElementById("playlistItems").innerHTML = "";
  (p.items || []).forEach(item => addPlaylistItemRow(item));
  document.getElementById("playlistName").scrollIntoView({ behavior: "smooth" });
}

function deletePlaylist(id) {
  if (!confirm("Delete this playlist? Screens still assigned to it will keep showing their last content until you reassign them.")) return;
  db.collection("playlists").doc(id).delete();
}

function addPlaylistItemRow(data) {
  data = data || {};
  const container = document.getElementById("playlistItems");
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
   <select class="itemType">
      <option value="image" ${data.type !== "video" && data.type !== "web" ? "selected" : ""}>Image</option>
      <option value="video" ${data.type === "video" ? "selected" : ""}>Video</option>
      <option value="web" ${data.type === "web" ? "selected" : ""}>Web Page / YouTube</option>
    </select>
    <input class="itemUrl" placeholder="Media URL (or YouTube link for Web Page)" value="${data.url || ""}" />
    <input class="itemDuration" type="number" placeholder="Seconds " value="${data.durationSeconds || 8}" style="width:120px" />
      <select class="itemResizeMode">
        <option value="fit">Fit (bars)</option>
        <option value="fill">Fill (crop)</option>
       <option value="stretch">Stretch</option>
     </select>
<select class="itemRotation">
    <option value="0" ${(data.rotation || 0) === 0 ? "selected" : ""}>0°</option>
    <option value="90" ${data.rotation === 90 ? "selected" : ""}>90°</option>
    <option value="180" ${data.rotation === 180 ? "selected" : ""}>180°</option>
    <option value="270" ${data.rotation === 270 ? "selected" : ""}>270°</option>
  </select>


    <button onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(row);
}

function savePlaylist() {
  const name = document.getElementById("playlistName").value.trim();
  if (!name) return alert("Give the playlist a name.");

  const rows = document.querySelectorAll("#playlistItems .item-row");
  if (rows.length === 0) return alert("Add at least one item.");

  const items = Array.from(rows).map(row => ({
    type: row.querySelector(".itemType").value,
    url: row.querySelector(".itemUrl").value.trim(),
  durationSeconds: parseInt(row.querySelector(".itemDuration").value) || 8,
     resizeMode: row.querySelector(".itemResizeMode").value,
    rotation: parseInt(row.querySelector(".itemRotation").value) || 0
  }));

  const resetForm = () => {
    editingPlaylistId = null;
    document.getElementById("playlistName").value = "";
    document.getElementById("playlistItems").innerHTML = "";
  };

  if (editingPlaylistId) {
    db.collection("playlists").doc(editingPlaylistId).update({ name, items })
      .then(() => { resetForm(); alert("Playlist updated."); });
  } else {
    db.collection("playlists").add({ name, items, createdAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(() => { resetForm(); alert("Playlist saved. Assign it to a screen from the Screens table above."); });
  }
}
// ===================== ANALYTICS =====================
function initAnalyticsFilters() {
  const dateInput = document.getElementById("analyticsDateFilter");
  if (!dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10); // yyyy-mm-dd, defaults to today
  }
}

function populateAnalyticsScreenOptions() {
  const sel = document.getElementById("analyticsScreenFilter");
  const current = sel.value;
  const options = Object.keys(screenDataCache).map(id => {
    const s = screenDataCache[id];
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
  const dateInput = document.getElementById("analyticsDateFilter").value;
  if (!dateInput) return;
  const dateKey = dateInput.replace(/-/g, ""); // yyyymmdd, matches the Android app's format
  const screenId = document.getElementById("analyticsScreenFilter").value;
  const byScreenCard = document.getElementById("analyticsByScreenCard");

  if (screenId) {
    byScreenCard.style.display = "none";
    db.collection("analytics").doc(`${screenId}_${dateKey}`).collection("items").get()
      .then(snapshot => renderAnalytics(snapshot.docs.map(d => d.data()), false))
      .catch(err => {
        console.error(err);
        document.getElementById("analyticsTotal").textContent = "Couldn't load analytics for this screen/date.";
      });
  } else {
    byScreenCard.style.display = "block";
    db.collectionGroup("items").where("date", "==", dateKey).get()
      .then(snapshot => renderAnalytics(snapshot.docs.map(d => d.data()), true))
      .catch(err => {
        console.error(err);
        document.getElementById("analyticsTotal").textContent =
          "Couldn't load — check the browser console, Firestore may need a one-time index (it gives you a link to create it).";
      });
  }
}

function renderAnalytics(rows, groupByScreen) {
  let totalSeconds = 0;
  const byAd = {};
  const byScreen = {};

  rows.forEach(r => {
    const seconds = r.totalSeconds || 0;
    totalSeconds += seconds;

    if (!byAd[r.url]) byAd[r.url] = { type: r.type, url: r.url, playCount: 0, totalSeconds: 0 };
    byAd[r.url].playCount += r.playCount || 0;
    byAd[r.url].totalSeconds += seconds;

    if (groupByScreen) {
      if (!byScreen[r.screenId]) byScreen[r.screenId] = { screenId: r.screenId, playCount: 0, totalSeconds: 0 };
      byScreen[r.screenId].playCount += r.playCount || 0;
      byScreen[r.screenId].totalSeconds += seconds;
    }
  });

  document.getElementById("analyticsTotal").textContent = rows.length
    ? `${formatPlaytime(totalSeconds)} across ${rows.length} ad${rows.length === 1 ? '' : 's'}`
    : "No playback recorded for this filter.";

  document.getElementById("analyticsByAdBody").innerHTML = Object.values(byAd)
    .sort((a, b) => b.totalSeconds - a.totalSeconds)
    .map(a => `<tr><td>${a.type}</td><td>${a.url}</td><td>${a.playCount}</td><td>${formatPlaytime(a.totalSeconds)}</td></tr>`)
    .join("") || `<tr><td colspan="4">No data</td></tr>`;

  if (groupByScreen) {
    document.getElementById("analyticsByScreenBody").innerHTML = Object.values(byScreen)
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .map(s => {
        const name = (screenDataCache[s.screenId] && screenDataCache[s.screenId].name) || s.screenId;
        return `<tr><td>${name}</td><td>${s.playCount}</td><td>${formatPlaytime(s.totalSeconds)}</td></tr>`;
      })
      .join("") || `<tr><td colspan="3">No data</td></tr>`;
  }
}
addPlaylistItemRow();
