// =============================================================
// LIVE BUILD 1 — The tailoring prompt + response schema.
// This file is the heart of the workshop. Everything else is plumbing.
// =============================================================
import { Schema } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-ai.js";

// --- System instruction: the rules Gemini must follow every time -------------
// The "NEVER INVENT" block is the guardrail. Demo it: remove it, run the
// "obvious gaps" sample JD, and watch Gemini add skills the candidate never had.
export const SYSTEM_INSTRUCTION = `
You are an expert technical recruiter and resume editor.
You tailor a candidate's CORE RESUME to a specific JOB DESCRIPTION.

NEVER INVENT. These rules override everything else:
1. Use ONLY facts present in the core resume: employers, titles, dates, degrees,
   tools, numbers and achievements. Do not add any skill, tool, certification,
   employer, metric or responsibility that is not in the core resume.
2. You MAY reword, reorder, merge or drop bullets, and use the job description's
   vocabulary for things the candidate genuinely did (e.g. "built REST APIs" ->
   "designed RESTful backend services" is fine if the resume shows API work).
3. Never change numbers, dates, job titles or company names.
4. If the job asks for something the resume does not show, put it in
   "gaps" with honest advice. Do NOT sneak it into the resume.

SCORING:
- matchScoreBefore: how well the CORE resume matches the job (0-100).
- matchScoreAfter: how well the TAILORED resume matches (0-100). It may only rise
  through better wording and ordering, never through invented content, so it
  stays close to the "before" score when there are real gaps.

STYLE: concise action-verb bullets, strongest and most job-relevant first,
keep each bullet under 30 words, plain text only (no markdown).
`.trim();

// --- Response schema: forces Gemini to return JSON our UI can render ----------
const bullet = Schema.string();

export const RESUME_SCHEMA = Schema.object({
  properties: {
    company: Schema.string({ description: "Hiring company from the job description, or 'Unknown'" }),
    role: Schema.string({ description: "Job title from the job description" }),
    matchScoreBefore: Schema.integer({ description: "0-100" }),
    matchScoreAfter: Schema.integer({ description: "0-100" }),
    matchedKeywords: Schema.array({ items: Schema.string(), description: "Job keywords the resume genuinely supports" }),
    gaps: Schema.array({
      items: Schema.object({
        properties: {
          requirement: Schema.string({ description: "What the job asks for" }),
          advice: Schema.string({ description: "Honest advice: how to address it in an interview, a project to build, or a course to take" }),
        },
      }),
    }),
    tailored: Schema.object({
      properties: {
        name: Schema.string(),
        contact: Schema.string({ description: "One line: email | phone | location | links, copied from the core resume" }),
        headline: Schema.string({ description: "A role-specific one-line headline" }),
        summary: Schema.string({ description: "2-3 sentence professional summary aimed at this job" }),
        skills: Schema.array({ items: Schema.string(), description: "Only skills present in the core resume, most relevant first" }),
        experience: Schema.array({
          items: Schema.object({
            properties: {
              title: Schema.string(),
              company: Schema.string(),
              dates: Schema.string(),
              bullets: Schema.array({ items: bullet }),
            },
          }),
        }),
        projects: Schema.array({
          items: Schema.object({
            properties: {
              name: Schema.string(),
              bullets: Schema.array({ items: bullet }),
            },
          }),
        }),
        education: Schema.array({ items: Schema.string(), description: "One line per degree/certification, copied from the core resume" }),
      },
      optionalProperties: ["projects"],
    }),
    changes: Schema.array({
      description: "The 3-6 most important edits you made",
      items: Schema.object({
        properties: {
          before: Schema.string({ description: "Original wording from the core resume" }),
          after: Schema.string({ description: "New wording in the tailored resume" }),
          why: Schema.string({ description: "Which job requirement this targets" }),
        },
      }),
    }),
  },
});

// --- The per-request prompt ---------------------------------------------------
export function buildTailorPrompt(jobDescription) {
  return `
Tailor the attached CORE RESUME to the JOB DESCRIPTION below.
Follow every rule in your instructions, especially NEVER INVENT.

JOB DESCRIPTION:
"""
${jobDescription}
"""
`.trim();
}

// Used only when the user pastes a job LINK instead of text (URL context tool).
export function buildExtractJobPrompt(url) {
  return `
Open this job posting and return ONLY the job description text: company, job title,
location, responsibilities, requirements and nice-to-haves. No commentary.
If the page cannot be read (login wall, blocked, not a job posting), reply exactly: UNREADABLE

${url}
`.trim();
}
