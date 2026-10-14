# Spray and Pray Is Dead: Build an AI Resume Tailor with Gemini & Firebase

Upload a core resume (PDF or text), add a job link or description, and Gemini returns a
tailored resume, a before/after match score, the edits it made, and honest gaps.
Every version is saved in Firestore with an application status.

**Stack:** Gemini via Firebase AI Logic · Firebase App Check · Firebase Auth (anonymous) · Cloud Firestore · Firebase Hosting.
No build step, no npm: plain HTML/CSS/JS with the Firebase JS SDK v13 from Google's CDN.

```
public/
  index.html          UI
  style.css           styles (incl. print-to-PDF)
  firebase-config.js  ← paste your config here
  prompt.js           ★ the prompt, guardrails and JSON schema (LIVE BUILD 1)
  app.js              Gemini calls (LIVE BUILD 2), Firestore saves (LIVE BUILD 3), UI
firestore.rules       each user sees only their own versions
firebase.json         hosting + rules config
samples/              a sample resume and two job descriptions for the demo
```

---

## Part A: One-time setup (~30 min, do this before the event)

### 1. Create the Firebase project
1. Go to <https://console.firebase.google.com> → **Create a project**. Google Analytics is not needed.
2. **Project settings → General → Your apps → Add app → Web (`</>`)**. Name it "resume-tailor", tick **Also set up Firebase Hosting**.
3. Copy the `firebaseConfig` object into `public/firebase-config.js`.

### 2. Turn on Gemini (Firebase AI Logic)
1. Console → **AI Services → AI Logic → Get started**.
2. Choose the **Gemini Developer API** (free tier, no billing needed).
3. Finish the workflow. It **enforces App Check** automatically (App Check becomes mandatory for AI Logic on 2 Nov 2026 anyway).

### 3. Set up App Check
For the deployed site (reCAPTCHA Enterprise):
1. Console → **Security → App Check → Apps** → your web app → **reCAPTCHA Enterprise**.
2. Follow the link to create a reCAPTCHA Enterprise key for your domains (`<project>.web.app`, `<project>.firebaseapp.com`). **Do not add `localhost`.**
3. Paste the **site key** into `RECAPTCHA_ENTERPRISE_SITE_KEY` in `firebase-config.js`.

For your laptop (debug token):
1. Run the app locally (step 6) and open the browser **DevTools console**.
2. You'll see `AppCheck debug token: "xxxx-…"`. Copy it.
3. Console → **App Check → Apps** → your app → **⋮ → Manage debug tokens → Add**. Paste it.
4. Use the **same browser profile** on stage. The token is stored in that browser. Never commit it.

### 4. Turn on Auth
Console → **Build → Authentication → Get started → Sign-in method → Anonymous → Enable**.

### 5. Create Firestore
Console → **Build → Firestore Database → Create database** → production mode → a region near you (e.g. `asia-south1` Mumbai).

### 6. Run locally
```bash
cd resume-tailor
npx serve public          # or: python3 -m http.server 8080 --directory public
```
Open the URL it prints (`http://localhost:3000` or `:8080`).

### 7. Deploy (rules + live URL)
```bash
npm install -g firebase-tools
firebase login
firebase use --add            # pick your project
firebase deploy               # deploys hosting + firestore.rules
```
You get `https://<project>.web.app`, ready for the QR code on your last slide.

### 8. Smoke test
Paste `samples/sample-resume.txt` and `samples/jd-1-good-fit-frontend.txt` → **Tailor**.
You should see a tailored resume, scores, changes, gaps, and a new entry under **Versions**.

---

## Part B: How it works (what you explain on stage)

```
Browser ──► Firebase AI Logic (App Check verified) ──► Gemini 3.5 Flash
   │             returns JSON matching our schema
   └──► Firestore  users/{uid}/versions/{id}   (secured by firestore.rules)
```

1. **PDF goes straight to Gemini.** No PDF parsing library: the file is sent as `inlineData` and Gemini reads it.
2. **Structured output.** `responseSchema` in `prompt.js` forces valid JSON (scores, keywords, gaps, tailored sections, changes), so the UI can render it reliably.
3. **Guardrails in the system instruction.** "NEVER INVENT" + "put missing skills in gaps" + `temperature: 0.3`.
4. **Job links** use Gemini's **URL context** tool. Public career pages work; LinkedIn/Naukri usually block it, and the app then asks for pasted text. This is a good honest moment on stage.
5. **Versioning** is a Firestore subcollection per user, with a status dropdown (Draft → Applied → Interview → Offer → Rejected).

---

## Part C: The 60-minute run of show

| Time | Segment | What you do |
|---|---|---|
| 0–8 | Hook + demo | "Who has sent the same resume to 50 jobs?" Run the finished app once with JD 1. |
| 8–13 | Architecture | The diagram above. Show the file list: "only `prompt.js` is AI; the rest is plumbing." |
| 13–30 | **Live build 1: prompt.js** | In Google AI Studio, paste the resume + **JD 2 (cloud, obvious gaps)** with a naive prompt ("tailor this resume to this job"). Show it inventing Kubernetes/Terraform/Go. Then add the NEVER INVENT rules and the gaps field. Run again: gaps move to the Gaps tab. Then show the JSON schema. |
| 30–45 | **Live build 2: app.js** | Walk through `tailorModel` (schema + system instruction) and `tailorResume()`. Run it in the app with JD 1, then JD 2. |
| 45–52 | **Live build 3: save versions** | Show `saveVersion()` and `firestore.rules`. Open the Firestore console and watch documents appear live. Change a status. |
| 52–60 | Wrap | Stretch goals (below), repo link + QR to the live URL, Q&A. |

**Tips**
- Rehearse on the **venue Wi-Fi** if possible, and keep a phone hotspot ready.
- Keep screenshots/recording of a good run as a fallback.
- Keep two branches: `starter` (with the bodies of `tailorResume()` and `saveVersion()` deleted and the guardrail block removed from `prompt.js`) and `main` (this finished code). If live coding goes wrong, `git checkout main`.
- Watch-along is safer than code-along in 60 minutes. Attendees can clone the repo afterwards.

---

## Part D: Stretch goals (last slide / homework)
- **Google sign-in** instead of anonymous (`GoogleAuthProvider` + `linkWithPopup` keeps existing versions).
- **Cover letter** button: a second prompt using the same JD + tailored resume.
- **Diff view** highlighting changed words.
- **DOCX/PDF export** with proper templates.
- **Chrome extension** that grabs the job description from the page you're on.
- **Prompt in the cloud** with server prompt templates / Remote Config so you can tweak it without redeploying.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `403 … must enforce Firebase App Check` or App Check errors on localhost | Register the debug token from the console (Part A, step 3). Same browser profile on stage. |
| App Check errors on the deployed site | reCAPTCHA Enterprise key missing, or the domain isn't on the key's allowed list. |
| `Auth error … admin-restricted-operation` | Anonymous sign-in not enabled (step 4). |
| Firestore `PERMISSION_DENIED` | Run `firebase deploy --only firestore:rules`. |
| `429` / quota | Free-tier rate limit. Wait a minute; for the event consider enabling billing (Blaze) for headroom. |
| Model not found | Check the current model list: <https://firebase.google.com/docs/ai-logic/models> and update `GEMINI_MODEL`. |

**Privacy note for attendees:** resumes contain personal data. This app stores versions only under each user's own UID, protected by security rules. Use sample data on stage.
