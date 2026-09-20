const admin = require('firebase-admin');

// 1. Initialize Firebase Admin
let serviceAccount;
try {
  // Try loading from environment variable (Best for free hosts like Render)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const buff = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64');
    serviceAccount = JSON.parse(buff.toString('utf-8'));
  } else {
    // Fallback for local testing
    serviceAccount = require('./my-signage-app-d0b8a-firebase-adminsdk-fbsvc-af88869b6f.json');
  }
} catch (error) {
  console.error("❌ Failed to load Firebase Service Account. Check environment variables.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 2. Telegram Config
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.warn("⚠️ Telegram configuration missing. Please set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.");
}

async function sendTelegramMessage(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Would send Telegram message:", message);
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });
    if (!response.ok) {
      console.error("Failed to send Telegram message:", await response.text());
    }
  } catch (error) {
    console.error("Error sending Telegram message:", error);
  }
}

// 3. In-Memory Real-Time Screen Cache (Drastically reduces Firestore Reads to stay 100% Free)
const OFFLINE_THRESHOLD_MS = 720000; // 12 min threshold (matches dashboard)
const CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds in memory (0 Firestore reads for checks)

let screenCache = []; // Holds live in-memory copy of screens collection
let screenStatus = {}; // { screenId: isOnline }
let firstRun = true;

// Real-time listener: Firestore charges 0 reads for timer checks because data is kept in memory
db.collection("screens").onSnapshot(snapshot => {
  screenCache = snapshot.docs.map(doc => ({
    id: doc.id,
    ref: doc.ref,
    data: doc.data()
  }));
}, error => {
  console.error("❌ Firestore snapshot listener error:", error);
});

// Helper functions for IST schedule calculation
function hhmmToMins(str) {
  if (!str) return -1;
  const parts = str.split(':');
  if (parts.length < 2) return -1;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function getISTMinutesFromMidnight() {
  const now = new Date();
  // IST = UTC + 5:30 (330 minutes)
  const totalUtcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (totalUtcMinutes + 330) % (24 * 60);
}

// Unified in-memory worker: checks offline status + auto-scheduler (0 Firestore reads)
async function processScreensInMemory() {
  if (screenCache.length === 0) return;

  const currentIstMins = getISTMinutesFromMidnight();
  const updatePromises = [];

  for (const item of screenCache) {
    const s = item.data;
    const docId = item.id;
    const screenName = s.name || docId;

    // --- A. Offline Monitoring ---
    if (s.status === "paired") {
      const lastSeen = s.lastSeen ? s.lastSeen.toMillis() : 0;
      const isOnline = (Date.now() - lastSeen) < OFFLINE_THRESHOLD_MS;
      const previousStatus = screenStatus[docId];

      if (!firstRun) {
        if (previousStatus === true && !isOnline) {
          // Transition from Online -> Offline: ONE alert only
          console.log(`🚨 Screen Offline: ${screenName}`);
          sendTelegramMessage(`🚨 *Offline Alert*\nScreen: *${screenName}*\nStatus: Stopped sending heartbeats.`);
        } else if (previousStatus === false && isOnline) {
          // Transition from Offline -> Online
          console.log(`✅ Screen Online: ${screenName}`);
          sendTelegramMessage(`✅ *Online Alert*\nScreen: *${screenName}*\nStatus: Reconnected & Heartbeat received.`);
        }
      }
      screenStatus[docId] = isOnline;
    }

    // --- B. 24/7 Auto-Scheduler ---
    if (s.schedulerEnabled && Array.isArray(s.schedulerSlots) && s.schedulerSlots.length > 0) {
      let activeSlot = null;

      for (const slot of s.schedulerSlots) {
        if (!slot.start || !slot.end) continue;
        const startMins = hhmmToMins(slot.start);
        const endMins = hhmmToMins(slot.end);

        if (startMins < endMins) {
          if (currentIstMins >= startMins && currentIstMins < endMins) {
            activeSlot = slot;
            break;
          }
        } else if (startMins > endMins) {
          // Overnight slot e.g. 22:00 to 06:00
          if (currentIstMins >= startMins || currentIstMins < endMins) {
            activeSlot = slot;
            break;
          }
        }
      }

      if (activeSlot && activeSlot.playlistId && activeSlot.playlistId !== s.currentPlaylist) {
        updatePromises.push((async () => {
          try {
            await item.ref.update({
              currentPlaylist: activeSlot.playlistId,
              schedulerLastPushed: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`📅 Auto-pushed playlist '${activeSlot.playlistId}' to screen '${screenName}' (${activeSlot.start} - ${activeSlot.end})`);
          } catch (err) {
            console.error(`Error updating currentPlaylist for screen ${screenName}:`, err);
          }
        })());
      }
    }
  }

  // Execute any required playlist updates in parallel for 100% simultaneous screen transitions
  if (updatePromises.length > 0) {
    await Promise.all(updatePromises);
  }

  firstRun = false;
}

// Start Unified Loop (Checks every 2 minutes in memory)
console.log("🚀 Bhimavaram Digitals Backend Worker Started (In-Memory Monitoring & Auto-Scheduler)!");
processScreensInMemory();
setInterval(processScreensInMemory, CHECK_INTERVAL_MS);

// Create a dummy web server so Render.com can host this as a Free "Web Service"
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bhimavaram Digitals Monitor & Auto-Scheduler is running!\n');
}).listen(PORT, () => {
  console.log(`🌍 Web server listening on port ${PORT} (Required for Render free tier)`);
});
