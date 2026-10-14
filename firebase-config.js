// =============================================================
// STEP 1 — Paste YOUR Firebase web app config here.
// Firebase console → Project settings → General → Your apps → Web app → Config
// (This config is safe to ship in a web page; App Check + security rules protect it.)
// =============================================================
export const firebaseConfig = {
  apiKey: "PASTE_ME",
  authDomain: "PASTE_ME.firebaseapp.com",
  projectId: "PASTE_ME",
  storageBucket: "PASTE_ME.firebasestorage.app",
  messagingSenderId: "PASTE_ME",
  appId: "PASTE_ME",
};

// reCAPTCHA Enterprise SITE key (Firebase console → Security → App Check → Apps → your web app).
// Needed for the deployed site. On localhost the debug token is used instead.
export const RECAPTCHA_ENTERPRISE_SITE_KEY = "PASTE_ME";

// Gemini model. gemini-3.5-flash is a stable model with long-term availability
// and works on the free (Spark) plan with the Gemini Developer API.
export const GEMINI_MODEL = "gemini-3.5-flash";
