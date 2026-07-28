import { initializeFirebase } from "./modules/firebase.js";

const { auth, db } = initializeFirebase();

const pairingScreen = document.getElementById("pairingScreen");
const pairingCodeText = document.getElementById("pairingCodeText");
const playerScreen = document.getElementById("playerScreen");
const videoEl = document.getElementById("videoEl");
const imageEl = document.getElementById("imageEl");
const webFrame = document.getElementById("webFrame");

let screenId = null;
let screenListenerUnsub = null;
let playlistListenerUnsub = null;
let lastPlaylistId = null;
let playlistItems = [];
let currentIndex = 0;
let advanceTimer = null;
let currentItemStartTime = 0;
let currentItemForLogging = null;

function getOrCreateScreenId() {
  let id = localStorage.getItem("screen_id");
  if (id) return id;

  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  id = "";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  localStorage.setItem("screen_id", id);
  return id;
}

function registerScreenIfNeeded() {
  const ref = db.collection("screens").doc(screenId);
  ref.get().then((doc) => {
    if (!doc.exists) {
      ref.set({
        status: "unpaired",
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        lastSeen: window.firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  });
}

function watchScreenDoc() {
  if (screenListenerUnsub) screenListenerUnsub();
  screenListenerUnsub = db.collection("screens").doc(screenId).onSnapshot((snap) => {
    if (!snap.exists) return;
    const s = snap.data();

    if (s.status === "paired") {
      pairingScreen.style.display = "none";
      playerScreen.style.display = "block";
      applyScreenRotation(s.rotation || 0);

      if (s.currentPlaylist && s.currentPlaylist !== lastPlaylistId) {
        lastPlaylistId = s.currentPlaylist;
        watchPlaylistDoc(s.currentPlaylist);
      }
    } else {
      pairingScreen.style.display = "flex";
      playerScreen.style.display = "none";
      lastPlaylistId = null;
      if (playlistListenerUnsub) {
        playlistListenerUnsub();
        playlistListenerUnsub = null;
      }
      clearTimeout(advanceTimer);
    }
  });
}

function watchPlaylistDoc(playlistId) {
  if (playlistListenerUnsub) playlistListenerUnsub();
  playlistListenerUnsub = db.collection("playlists").doc(playlistId).onSnapshot((snap) => {
    if (!snap.exists) return;
    const items = snap.data().items;
    if (Array.isArray(items)) {
      playlistItems = items;
      currentIndex = 0;
      playCurrentItem();
    }
  });
}

function applyScreenRotation(deg) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (deg === 90 || deg === 270) {
    playerScreen.style.width = `${h}px`;
    playerScreen.style.height = `${w}px`;
  } else {
    playerScreen.style.width = `${w}px`;
    playerScreen.style.height = `${h}px`;
  }
  playerScreen.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
}

function applyItemRotation(el, deg) {
  el.style.transform = deg ? `rotate(${deg}deg)` : "";
}

function hideAllMedia() {
  videoEl.style.display = "none";
  videoEl.pause();
  imageEl.style.display = "none";
  webFrame.style.display = "none";
  webFrame.src = "about:blank";
}

function playCurrentItem() {
  logPreviousItemPlayback();
  clearTimeout(advanceTimer);
  videoEl.onended = null;

  if (playlistItems.length === 0) return;
  if (currentIndex >= playlistItems.length) currentIndex = 0;

  const item = playlistItems[currentIndex];
  currentItemStartTime = Date.now();
  currentItemForLogging = item;

  const url = item.url;
  const type = item.type || "video";
  const durationMs = (item.durationSeconds || 8) * 1000;
  const resizeMode = item.resizeMode || "fit";
  const itemRotation = item.rotation || 0;
  if (!url) return;

  hideAllMedia();

  if (type === "video") {
    videoEl.style.display = "block";
    videoEl.style.objectFit = resizeMode === "fill" ? "cover" : resizeMode === "stretch" ? "fill" : "contain";
    applyItemRotation(videoEl, itemRotation);
    videoEl.src = url;
    videoEl.play().catch((error) => console.error("Video play failed", error));

    if (item.durationSeconds) {
      advanceTimer = setTimeout(advance, durationMs);
    } else {
      videoEl.onended = advance;
    }
  } else if (type === "web") {
    webFrame.style.display = "block";
    applyItemRotation(webFrame, itemRotation);
    const videoId = extractYoutubeVideoId(url);
    if (videoId) {
      const isLive = url.includes("youtube.com/live/");
      webFrame.src = buildYoutubeEmbedUrl(videoId, isLive);
    } else {
      webFrame.src = url;
    }
    advanceTimer = setTimeout(advance, durationMs);
  } else {
    imageEl.style.display = "block";
    imageEl.style.objectFit = resizeMode === "fill" ? "cover" : resizeMode === "stretch" ? "fill" : "contain";
    applyItemRotation(imageEl, itemRotation);
    imageEl.src = url;
    advanceTimer = setTimeout(advance, durationMs);
  }
}

function advance() {
  if (playlistItems.length === 0) return;
  currentIndex = (currentIndex + 1) % playlistItems.length;
  playCurrentItem();
}

function extractYoutubeVideoId(url) {
  const pattern = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/live\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(pattern);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  return null;
}

function buildYoutubeEmbedUrl(videoId, isLive) {
  const loopParams = isLive ? "" : `&loop=1&playlist=${videoId}`;
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0${loopParams}&rel=0&playsinline=1`;
}

function startHeartbeat() {
  setInterval(() => {
    db.collection("screens").doc(screenId).update({
      lastSeen: window.firebase.firestore.FieldValue.serverTimestamp()
    }).catch((error) => console.error("Heartbeat failed", error));
  }, 30000);
}

function logPreviousItemPlayback() {
  if (!currentItemForLogging || !currentItemStartTime) return;
  const playedMs = Date.now() - currentItemStartTime;
  currentItemStartTime = 0;
  if (playedMs < 500) return;
  logPlaybackEvent(currentItemForLogging, playedMs);
}

function logPlaybackEvent(item, playedMs) {
  const url = item.url;
  const type = item.type || "video";
  const playedSeconds = playedMs / 1000.0;

  const now = new Date();
  const dateKey = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0");
  const dayDocId = `${screenId}_${dateKey}`;
  const itemDocId = encodeURIComponent(url).slice(0, 300);

  db.collection("analytics").doc(dayDocId).collection("items").doc(itemDocId).set({
    screenId,
    date: dateKey,
    url,
    type,
    playCount: window.firebase.firestore.FieldValue.increment(1),
    totalSeconds: window.firebase.firestore.FieldValue.increment(playedSeconds),
    lastPlayed: window.firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).catch((error) => console.error("Analytics log failed", error));
}

screenId = getOrCreateScreenId();
pairingCodeText.textContent = screenId;

auth.signInAnonymously().catch((error) => console.error("Anonymous sign-in failed", error));
auth.onAuthStateChanged((user) => {
  if (user) {
    registerScreenIfNeeded();
    watchScreenDoc();
    startHeartbeat();
  }
});

window.addEventListener("beforeunload", logPreviousItemPlayback);
