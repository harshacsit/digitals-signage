window.firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

window.supabaseConfig = {
  url: "YOUR_SUPABASE_URL",
  anonKey: "YOUR_SUPABASE_ANON_KEY"
};

window.AppConfig = {
  // Cloudflare Worker that proxies uploads to R2.
  r2WorkerUrl: "https://signage-upload.bhimavaram-signage.workers.dev",

  // Cloudflare Worker that vends ephemeral TURN credentials for Live View (WebRTC).
  // Leave as "" to fall back to STUN-only (no relay).
  turnWorkerUrl: "https://turn-credentials-worker.bhimavaram-signage.workers.dev"
};
