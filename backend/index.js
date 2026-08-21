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

// 3. Monitor Screens
// We consider a screen offline if it misses its 2-minute heartbeat by a healthy margin (5 mins total)
const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; 
const CHECK_INTERVAL_MS = 60 * 1000; // Check every 1 minute
const REMINDER_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

let screenStatus = {}; // { screenId: isOnline }
let screenLastAlerted = {}; // { screenId: timestamp }
let firstRun = true;

async function checkScreens() {
  try {
    const snapshot = await db.collection("screens").get();
    let onlineCount = 0;
    
    snapshot.forEach(doc => {
      const s = doc.data();
      if (s.status !== "paired") return; // Only monitor actively paired screens
      
      const lastSeen = s.lastSeen ? s.lastSeen.toMillis() : 0;
      const isOnline = (Date.now() - lastSeen) < OFFLINE_THRESHOLD_MS;
      if (isOnline) onlineCount++;
      
      const previousStatus = screenStatus[doc.id];
      const screenName = s.name || doc.id;
      
      // Don't send alerts on the very first run, just populate the initial state
      if (!firstRun) {
        if (previousStatus === true && !isOnline) {
          // Transition from Online -> Offline
          console.log(`🚨 Screen Offline: ${screenName}`);
          sendTelegramMessage(`🚨 *Offline Alert*\nScreen: *${screenName}*\nStatus: Stopped sending heartbeats.`);
          screenLastAlerted[doc.id] = Date.now();
        } 
        else if (previousStatus === false && !isOnline) {
          // Still offline. Check if 2 hours have passed since the last alert
          const lastAlertTime = screenLastAlerted[doc.id] || 0;
          
          // Only send reminder if we tracked it going offline while the bot was running
          if (lastAlertTime > 0 && (Date.now() - lastAlertTime) >= REMINDER_INTERVAL_MS) {
            console.log(`⏳ Offline Reminder: ${screenName}`);
            sendTelegramMessage(`⏳ *Offline Reminder*\nScreen: *${screenName}*\nStatus: Still offline (2 hours passed).`);
            screenLastAlerted[doc.id] = Date.now();
          }
        }
        else if (previousStatus === false && isOnline) {
          // Transition from Offline -> Online
          console.log(`✅ Screen Online: ${screenName}`);
          sendTelegramMessage(`✅ *Online Alert*\nScreen: *${screenName}*\nStatus: Reconnected & Heartbeat received.`);
          delete screenLastAlerted[doc.id]; // Clear the reminder tracker
        }
      }
      
      screenStatus[doc.id] = isOnline;
    });
    
    firstRun = false;
  } catch (error) {
    console.error("Error fetching screens:", error);
  }
}

// Start Monitoring
console.log("🚀 Firebase-Telegram Monitor Bot Started!");
checkScreens(); // Initial check
setInterval(checkScreens, CHECK_INTERVAL_MS);

// Create a dummy web server so Render.com can host this as a Free "Web Service"
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bhimavaram Digitals Monitor is running!\n');
}).listen(PORT, () => {
  console.log(`🌍 Web server listening on port ${PORT} (Required for Render free tier)`);
});
