// Resume Tailor — Gemini (Firebase AI Logic) + Firebase Auth + Firestore
// No build step: Firebase JS SDK v13 loaded straight from Google's CDN.

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app-check.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, updateDoc, onSnapshot, query, orderBy, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-ai.js";

import { firebaseConfig, RECAPTCHA_ENTERPRISE_SITE_KEY, GEMINI_MODEL } from "./firebase-config.js";
import { SYSTEM_INSTRUCTION, RESUME_SCHEMA, buildTailorPrompt, buildExtractJobPrompt } from "./prompt.js";

// ---------------------------------------------------------------------------
// 1. Firebase setup
// ---------------------------------------------------------------------------
const app = initializeApp(firebaseConfig);

// App Check protects the Gemini API from abuse (required for AI Logic from Nov 2, 2026).
// On localhost we use the debug provider: the browser console prints a debug token
// the first time → register it in Firebase console → App Check → Apps → Manage debug tokens.
if (["localhost", "127.0.0.1"].includes(location.hostname)) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}
initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});

const auth = getAuth(app);
const db = getFirestore(app);
const ai = getAI(app, { backend: new GoogleAIBackend() });

// ---------------------------------------------------------------------------
// LIVE BUILD 2 — Wire Gemini in. Two models:
//   tailorModel: structured JSON output using our schema + guardrail instructions
//   readerModel: URL context tool, to read a job posting from a link
// ---------------------------------------------------------------------------
const tailorModel = getGenerativeModel(ai, {
  model: GEMINI_MODEL,
  systemInstruction: SYSTEM_INSTRUCTION,
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: RESUME_SCHEMA,
    temperature: 0.3, // low = faithful rewording, less creative invention
  },
});

const readerModel = getGenerativeModel(ai, {
  model: GEMINI_MODEL,
  tools: [{ urlContext: {} }],
});

async function readJobFromUrl(url) {
  const result = await readerModel.generateContent(buildExtractJobPrompt(url));
  const text = result.response.text().trim();
  if (!text || text.startsWith("UNREADABLE")) {
    throw new Error("Couldn't read that link (many job sites block bots). Paste the description text instead.");
  }
  return text;
}

async function tailorResume(resume, jobDescription) {
  // resume is either { text } or { base64, mimeType } (a PDF goes straight to Gemini)
  const parts = resume.base64
    ? [{ inlineData: { mimeType: resume.mimeType, data: resume.base64 } }, buildTailorPrompt(jobDescription)]
    : [`CORE RESUME:\n"""\n${resume.text}\n"""`, buildTailorPrompt(jobDescription)];

  const result = await tailorModel.generateContent(parts);
  return JSON.parse(result.response.text());
}

// ---------------------------------------------------------------------------
// LIVE BUILD 3 — Save every version to Firestore: users/{uid}/versions/{id}
// ---------------------------------------------------------------------------
let uid = null;
const versionsRef = () => collection(db, "users", uid, "versions");

async function saveVersion(data, jobDescription, jobUrl) {
  const ref = await addDoc(versionsRef(), {
    company: data.company || "Unknown",
    role: data.role || "Untitled role",
    scoreBefore: data.matchScoreBefore ?? null,
    scoreAfter: data.matchScoreAfter ?? null,
    status: "Draft",
    jobUrl: jobUrl || "",
    jobDescription,
    result: data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

function watchVersions() {
  const q = query(versionsRef(), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => renderVersions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    uid = user.uid;
    $("authStatus").textContent = "Signed in (anonymous)";
    watchVersions();
  }
});
signInAnonymously(auth).catch((e) => {
  $("authStatus").textContent = "Sign-in failed";
  setStatus(`Auth error: ${e.message}. Is Anonymous sign-in enabled?`, true);
});

// ---------------------------------------------------------------------------
// UI plumbing (pre-built: no need to live-code this part)
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
let resumeFile = null; // { base64, mimeType } or { text }
let currentVersionId = null;

document.querySelectorAll(".tabs").forEach((tabs) => {
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    tabs.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
    const scope = tabs.parentElement;
    scope.querySelectorAll(":scope > .tabpane").forEach((p) => p.classList.toggle("active", p.id === btn.dataset.tab));
  });
});

$("resumeFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) return setStatus("That file is over 10 MB, please use a smaller PDF.", true);
  if (file.type === "application/pdf") {
    resumeFile = { base64: await toBase64(file), mimeType: "application/pdf" };
  } else {
    resumeFile = { text: await file.text() };
  }
  $("resumeFileLabel").textContent = `✓ ${file.name}`;
  $("resumeFileLabel").parentElement.classList.add("has-file");
});

$("tailorBtn").addEventListener("click", async () => {
  const pasted = $("resumeText").value.trim();
  const resume = pasted ? { text: pasted } : resumeFile;
  let jobText = $("jobText").value.trim();
  const jobUrl = $("jobUrl").value.trim();

  if (!resume) return setStatus("Add your resume first (upload or paste).", true);
  if (!jobText && !jobUrl) return setStatus("Add a job link or paste the job description.", true);
  if (!uid) return setStatus("Still signing in, try again in a second.", true);

  $("tailorBtn").disabled = true;
  try {
    if (!jobText) {
      setStatus("Reading the job posting…");
      jobText = await readJobFromUrl(jobUrl);
      $("jobText").value = jobText;
    }
    setStatus("Gemini is tailoring your resume…");
    const data = await tailorResume(resume, jobText);
    renderResult(data);
    setStatus("Saving version…");
    currentVersionId = await saveVersion(data, jobText, jobUrl);
    setStatus("Done. Saved to your versions.");
  } catch (err) {
    console.error(err);
    setStatus(friendlyError(err), true);
  } finally {
    $("tailorBtn").disabled = false;
  }
});

function renderResult(d) {
  $("emptyState").hidden = true;
  $("resultView").hidden = false;
  $("rCompany").textContent = d.company || "";
  $("rRole").textContent = d.role || "Tailored resume";
  $("rBefore").textContent = d.matchScoreBefore ?? "–";
  $("rAfter").textContent = d.matchScoreAfter ?? "–";
  $("rKeywords").innerHTML = (d.matchedKeywords || []).map((k) => `<span class="chip">${esc(k)}</span>`).join("");

  const r = d.tailored || {};
  const list = (items) => `<ul>${(items || []).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`;
  $("rResume").innerHTML = `
    <h3>${esc(r.name)}</h3>
    <p class="contact">${esc(r.contact)}</p>
    <p class="headline">${esc(r.headline)}</p>
    <p>${esc(r.summary)}</p>
    ${r.skills?.length ? `<h4>Skills</h4><p>${r.skills.map(esc).join(" · ")}</p>` : ""}
    ${r.experience?.length ? `<h4>Experience</h4>` + r.experience.map((j) => `
      <div class="job">
        <div class="job-head"><strong>${esc(j.title)}, ${esc(j.company)}</strong><span>${esc(j.dates)}</span></div>
        ${list(j.bullets)}
      </div>`).join("") : ""}
    ${r.projects?.length ? `<h4>Projects</h4>` + r.projects.map((p) => `<div class="job"><strong>${esc(p.name)}</strong>${list(p.bullets)}</div>`).join("") : ""}
    ${r.education?.length ? `<h4>Education</h4>${list(r.education)}` : ""}
  `;

  $("rChanges").innerHTML = (d.changes || []).map((c) => `
    <li><div class="before">${esc(c.before)}</div><div class="after">${esc(c.after)}</div><div class="why">${esc(c.why)}</div></li>
  `).join("") || "<li class='muted'>No changes listed.</li>";

  const gaps = d.gaps || [];
  $("gapCount").textContent = gaps.length || "";
  $("rGaps").innerHTML = gaps.map((g) => `<li><strong>${esc(g.requirement)}</strong>${esc(g.advice)}</li>`).join("")
    || "<li>No major gaps found. 🎉</li>";
}

const STATUSES = ["Draft", "Applied", "Interview", "Offer", "Rejected"];
let versionCache = [];

function renderVersions(versions) {
  versionCache = versions;
  const ul = $("versionList");
  if (!versions.length) { ul.innerHTML = `<li class="muted">No versions yet.</li>`; return; }
  ul.innerHTML = versions.map((v) => `
    <li class="item ${v.id === currentVersionId ? "active" : ""}" data-id="${v.id}">
      <div class="v-role">${esc(v.role)}</div>
      <div class="muted">${esc(v.company)}</div>
      <div class="v-meta">
        <span>${v.scoreBefore ?? "–"} → ${v.scoreAfter ?? "–"} · ${v.createdAt?.toDate ? v.createdAt.toDate().toLocaleDateString() : "now"}</span>
        <select data-id="${v.id}" aria-label="Application status">
          ${STATUSES.map((s) => `<option ${s === v.status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>
    </li>`).join("");
}

$("versionList").addEventListener("click", (e) => {
  if (e.target.tagName === "SELECT") return;
  const li = e.target.closest("li.item");
  if (!li) return;
  const v = versionCache.find((x) => x.id === li.dataset.id);
  if (!v) return;
  currentVersionId = v.id;
  renderResult(v.result);
  renderVersions(versionCache);
});

$("versionList").addEventListener("change", (e) => {
  if (e.target.tagName !== "SELECT") return;
  updateDoc(doc(db, "users", uid, "versions", e.target.dataset.id), { status: e.target.value });
});

$("printBtn").addEventListener("click", () => window.print());
$("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("rResume").innerText);
  $("copyBtn").textContent = "Copied ✓";
  setTimeout(() => ($("copyBtn").textContent = "Copy text"), 1500);
});

// --- helpers -----------------------------------------------------------------
function setStatus(msg, isError = false) {
  $("statusMsg").textContent = msg;
  $("statusMsg").classList.toggle("error", isError);
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function friendlyError(err) {
  const m = String(err?.message || err);
  if (m.includes("App Check") || m.includes("appCheck")) return "App Check blocked the request. On localhost, register the debug token from the browser console in Firebase → App Check.";
  if (m.includes("429") || m.toLowerCase().includes("quota")) return "Gemini rate limit hit. Wait a minute and try again.";
  if (m.includes("PERMISSION_DENIED") && m.includes("firestore")) return "Firestore blocked the save. Did you deploy firestore.rules?";
  return m.length > 220 ? m.slice(0, 220) + "…" : m;
}
