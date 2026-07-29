import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dna, FlaskConical, Atom, BookOpen, Lock, Unlock, Plus, Pencil, Trash2,
  ChevronLeft, ChevronRight, Check, X, RotateCcw, Search, Settings,
  ClipboardList, GraduationCap, ShieldCheck, ArrowLeft, Save, LogOut,
  Stethoscope, HeartPulse, BadgeCheck, Bell, User, Menu, Target,
  ClipboardCheck, FileText, TrendingUp, Calendar, Trophy, Bookmark,
  Home as HomeIcon, Library, Users, FlaskRound, Award, Mail, StickyNote,
  BellRing, ChevronDown, Phone, MessageCircle, Medal,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

// ============================================================================
// SUPABASE CLIENT + DATA HELPERS
// (merged into this single file so there's only one file to place in src/)
// ============================================================================
// 1. Go to https://supabase.com → New project (free, no card needed)
// 2. Project settings → API → copy "Project URL" and "anon public" key below
const SUPABASE_URL = "https://ehkrddewmmilogbojvkh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_q_gmTPI3dh6wqAqgHDXKpg_wrTkA5ia";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- Shared data (question bank + admin passcode) stored in one row ----
export async function loadSharedData() {
  try {
    const { data, error } = await supabase
      .from("app_data")
      .select("bank, passcode")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (e) {
    console.error("Supabase load failed:", e);
    return null;
  }
}

export async function saveSharedData(partial) {
  try {
    const current = (await loadSharedData()) || {};
    const merged = { id: 1, ...current, ...partial };
    const { error } = await supabase.from("app_data").upsert(merged);
    if (error) throw error;
  } catch (e) {
    console.error("Supabase save failed:", e);
  }
}

// ---- Personal stats: stored locally in the student's own browser ----
export function loadLocalStats() {
  try {
    const raw = localStorage.getItem("mdcat-my-stats");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocalStats(stats) {
  try {
    localStorage.setItem("mdcat-my-stats", JSON.stringify(stats));
  } catch {}
}

// ---- Authentication ----
// extra = { name, course } gets saved on the auth user as user_metadata,
// so user.user_metadata.name / user.user_metadata.course are available
// right after sign up / sign in, with no extra database table needed.
export async function signUp(email, password, extra = {}) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { name: extra.name || "", course: extra.course || "" } },
  });
}
export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}
export async function signOut() {
  return supabase.auth.signOut();
}
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return data.subscription;
}

// ---- Notes (shared, admin-authored) ----
// Requires a `notes` jsonb column on the `app_data` table (default value []).
export async function loadNotes() {
  try {
    const { data, error } = await supabase.from("app_data").select("notes").eq("id", 1).maybeSingle();
    if (error) throw error;
    return (data && data.notes) || [];
  } catch (e) {
    console.error("Load notes failed (add a 'notes' jsonb column to app_data):", e);
    return [];
  }
}
export async function saveNotes(notes) {
  try {
    const { error } = await supabase.from("app_data").update({ notes }).eq("id", 1);
    if (error) throw error;
  } catch (e) {
    console.error("Save notes failed (add a 'notes' jsonb column to app_data):", e);
  }
}

// ---- Notifications (shared, admin-authored) ----
// Requires a `notifications` jsonb column on the `app_data` table (default value []).
export async function loadNotifications() {
  try {
    const { data, error } = await supabase.from("app_data").select("notifications").eq("id", 1).maybeSingle();
    if (error) throw error;
    return (data && data.notifications) || [];
  } catch (e) {
    console.error("Load notifications failed (add a 'notifications' jsonb column to app_data):", e);
    return [];
  }
}
export async function saveNotifications(notifications) {
  try {
    const { error } = await supabase.from("app_data").update({ notifications }).eq("id", 1);
    if (error) throw error;
  } catch (e) {
    console.error("Save notifications failed (add a 'notifications' jsonb column to app_data):", e);
  }
}

// ---- Per-user stats (each student's own score, tied to their account) ----
export async function loadUserStats(userId) {
  try {
    const { data, error } = await supabase
      .from("user_stats")
      .select("total_attempted, total_correct, by_subject, bookmarks, wrong_ids, slow_ids, streak, last_challenge_date, name")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      totalAttempted: data.total_attempted || 0,
      totalCorrect: data.total_correct || 0,
      bySubject: data.by_subject || {},
      bookmarks: data.bookmarks || [],
      wrongIds: data.wrong_ids || [],
      slowIds: data.slow_ids || [],
      streak: data.streak || 0,
      lastChallengeDate: data.last_challenge_date || null,
      name: data.name || "",
    };
  } catch (e) {
    console.error("Load user stats failed:", e);
    return null;
  }
}

export async function saveUserStats(userId, stats) {
  try {
    const { error } = await supabase.from("user_stats").upsert({
      user_id: userId,
      total_attempted: stats.totalAttempted,
      total_correct: stats.totalCorrect,
      by_subject: stats.bySubject,
      bookmarks: stats.bookmarks || [],
      wrong_ids: stats.wrongIds || [],
      slow_ids: stats.slowIds || [],
      streak: stats.streak || 0,
      last_challenge_date: stats.lastChallengeDate || null,
      name: stats.name || "",
    });
    if (error) throw error;
  } catch (e) {
    console.error("Save user stats failed:", e);
  }
}

// ---- Leaderboard (reads every student's aggregate stats) ----
// Requires a `name` text column and a `slow_ids` jsonb column (default []) on `user_stats`,
// plus a Supabase RLS policy that allows SELECT on user_stats to any signed-in user
// (by default a student can usually only read their own row).
export async function loadLeaderboard(limit = 50) {
  try {
    const { data, error } = await supabase
      .from("user_stats")
      .select("name, total_attempted, total_correct")
      .order("total_correct", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).filter((r) => r.name && r.name.trim());
  } catch (e) {
    console.error("Load leaderboard failed (check RLS policy + columns on user_stats):", e);
    return [];
  }
}
// ============================================================================
// END SUPABASE SECTION
// ============================================================================

// WhatsApp support numbers shown on the Contact Us page (Pakistan country code 92 is prepended for the wa.me link)
const CONTACT_WHATSAPP_NUMBERS = [
  { label: "Support Line 1", display: "0309 9675260", wa: "923099675260" },
  { label: "Support Line 2", display: "0301 8869272", wa: "923018869272" },
  { label: "Support Line 3", display: "0325 1171750", wa: "923251171750" },
];

// ---------- Design tokens ----------
const T = {
  paper: "#0B1E3D",
  paperDark: "#0F2748",
  card: "#12294D",
  ink: "#EAF1FB",
  inkSoft: "#93A9CC",
  line: "#26406B",
  emerald: "#1F7A5C",
  emeraldSoft: "#DCEBE3",
  rose: "#B8493F",
  roseSoft: "#F3E1DD",
  amber: "#B5822A",
  amberSoft: "#F1E4CB",
  blue: "#2E63D6",
  blueSoft: "#DCE6FA",
};

// ---------- Programs ----------
const PROGRAMS = [
  {
    key: "MDCAT", label: "MDCAT", icon: Target, tagline: "Your Journey Starts Here",
    gradient: "linear-gradient(135deg, #0F2A5C, #1B3F7A)",
    links: [
      { label: "Practice MCQS", icon: ClipboardCheck, action: "open" },
      { label: "Notes", icon: BookOpen, action: "soon" },
      { label: "Mock Exam", icon: FileText, action: "open" },
    ],
  },
  {
    key: "KMUCAT", label: "KMU CAT", icon: Award, tagline: "Your Journey Starts Here",
    gradient: "linear-gradient(135deg, #4A2E7A, #6C3FA3)",
    links: [
      { label: "Practice MCQS", icon: ClipboardCheck, action: "open" },
      { label: "Notes", icon: BookOpen, action: "soon" },
      { label: "Mock Exam", icon: FileText, action: "open" },
    ],
  },
  {
    key: "BSN", label: "BSN", icon: HeartPulse, tagline: "Compassion in Every Step",
    gradient: "linear-gradient(135deg, #0E4A45, #16665F)",
    links: [
      { label: "Practice MCQS", icon: ClipboardCheck, action: "open" },
      { label: "Notes", icon: BookOpen, action: "soon" },
      { label: "Past Papers", icon: FileText, action: "open" },
    ],
  },
  {
    key: "MBBS", label: "MBBS", icon: Stethoscope, tagline: "Learn. Understand. Serve.",
    gradient: "linear-gradient(135deg, #0F2A5C, #1B3F7A)",
    links: [
      { label: "Semester", icon: Library, action: "open" },
      { label: "Practice MCQS", icon: ClipboardCheck, action: "open" },
      { label: "Clinical Cases", icon: FlaskRound, action: "soon" },
    ],
  },
];

// Course options offered at signup — keys match PROGRAMS keys above.
const COURSES = PROGRAMS.map((p) => ({ key: p.key, label: p.label }));

// Programs that use the same fixed Subject -> Topic folder structure as MDCAT
const TOPIC_PROGRAMS = ["MDCAT", "KMUCAT"];

const SUBJECT_ICONS = {
  Biology: Dna,
  Chemistry: FlaskConical,
  Physics: Atom,
  English: BookOpen,
};
function subjectIcon(name) {
  return SUBJECT_ICONS[name] || ClipboardList;
}

// ---------- Folder colors (subjects/topics/blocks/years) ----------
const SUBJECT_COLORS = {
  Biology: "#1F9D6B",
  Chemistry: "#7C5CD6",
  Physics: "#2E7FE0",
  English: "#E0812E",
};
const FOLDER_PALETTE = [
  "#1F9D6B", "#7C5CD6", "#2E7FE0", "#E0812E", "#D6455C",
  "#2EA8A0", "#C2437A", "#4CAF50", "#CBA92E", "#6C63D6",
];
function colorForName(name = "") {
  if (SUBJECT_COLORS[name]) return SUBJECT_COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return FOLDER_PALETTE[hash % FOLDER_PALETTE.length];
}

const DEFAULT_PASSCODE = "mdcat2026";

// ---------- Fixed folder structures ----------
const MDCAT_TOPICS = {
  Biology: [
    "Acellular Life", "Bioenergetics", "Biological Molecules", "Cell Structure & Function",
    "Coordination & Control (Nervous & Chemical Coordination)", "Enzymes", "Evolution", "Reproduction",
    "Support & Movement", "Inheritance", "Circulation", "Immunity", "Respiration", "Digestion",
    "Homeostasis", "Biotechnology",
  ],
  Chemistry: [
    "Introduction & Fundamental Concepts of Chemistry", "Atomic Structure", "Gases", "Liquids", "Solids",
    "Chemical Equilibrium", "Reaction Kinetics", "Thermochemistry & Energetics of Chemical Reactions",
    "Electrochemistry", "Chemical Bonding", "S- and P-Block Elements", "Transition Elements",
    "Fundamental Principles of Organic Chemistry", "Chemistry of Hydrocarbons", "Alkyl Halides",
    "Alcohols and Phenols", "Aldehydes and Ketones", "Carboxylic Acids", "Macromolecules", "Industrial Chemistry",
  ],
  Physics: [
    "Vectors and Equilibrium", "Force and Motion", "Work and Energy", "Rotational and Circular Motion",
    "Fluid Dynamics", "Waves", "Thermodynamics", "Electrostatics", "Current Electricity",
    "Electromagnetism", "Electromagnetic Induction", "Alternating Current", "Electronics",
    "Dawn of Modern Physics", "Atomic Spectra", "Nuclear Physics",
  ],
  English: [
    "Reading and Thinking Skills", "Formal and Lexical Aspects of Language", "Writing Skills",
  ],
};

const MBBS_STRUCTURE = {
  "2nd Year": {
    "Block D": ["Anatomy", "Biochemistry", "Physiology", "Histology", "Embryology"],
    "Block E": ["Anatomy", "Biochemistry", "Physiology", "Histology", "Embryology"],
    "Block F": ["Anatomy", "Biochemistry", "Physiology", "Histology", "Embryology"],
  },
};

const SEED_MCQS = [
  { id: "s1", program: "MDCAT", subject: "Biology", topic: "Cell Biology", source: "Practice",
    question: "Which organelle is primarily responsible for ATP synthesis in eukaryotic cells?",
    options: ["Golgi apparatus", "Mitochondrion", "Lysosome", "Ribosome"],
    correct: 1,
    explanation: "Mitochondria carry out oxidative phosphorylation, producing most of the cell's ATP." },
  { id: "s2", program: "MDCAT", subject: "Biology", topic: "Genetics", source: "Past Paper 2023",
    question: "A cross between two heterozygous pea plants (Tt x Tt) for tallness produces what phenotypic ratio?",
    options: ["1:2:1", "3:1", "9:3:3:1", "1:1"],
    correct: 1,
    explanation: "A monohybrid cross between two heterozygotes gives a classic 3:1 phenotypic ratio (tall:short)." },
  { id: "s3", program: "MDCAT", subject: "Chemistry", topic: "Atomic Structure", source: "Practice",
    question: "What is the maximum number of electrons that can occupy the 3d subshell?",
    options: ["2", "6", "10", "14"],
    correct: 2,
    explanation: "The d subshell has 5 orbitals, each holding 2 electrons, giving a maximum of 10." },
  { id: "s4", program: "MDCAT", subject: "Chemistry", topic: "Chemical Bonding", source: "Past Paper 2022",
    question: "Which type of hybridization is present in the carbon atoms of ethyne (C2H2)?",
    options: ["sp3", "sp2", "sp", "dsp2"],
    correct: 2,
    explanation: "Each carbon in ethyne forms a triple bond, requiring sp hybridization (linear geometry)." },
  { id: "s5", program: "MDCAT", subject: "Physics", topic: "Kinematics", source: "Practice",
    question: "A body starts from rest and accelerates uniformly at 2 m/s^2. What is its velocity after 5 seconds?",
    options: ["5 m/s", "10 m/s", "15 m/s", "20 m/s"],
    correct: 1,
    explanation: "v = u + at = 0 + (2)(5) = 10 m/s." },
  { id: "s6", program: "MDCAT", subject: "Physics", topic: "Electrostatics", source: "Past Paper 2023",
    question: "Coulomb's law states that the electrostatic force between two charges is:",
    options: [
      "Directly proportional to the square of the distance",
      "Inversely proportional to the square of the distance",
      "Independent of distance",
      "Inversely proportional to the charges",
    ],
    correct: 1,
    explanation: "F = kq1q2/r^2, so the force is inversely proportional to the square of the separation." },
  { id: "s7", program: "MDCAT", subject: "English", topic: "Grammar", source: "Practice",
    question: "Choose the correctly punctuated sentence.",
    options: [
      "Its raining, so bring your umbrella.",
      "It's raining, so bring your umbrella.",
      "Its raining so, bring your umbrella.",
      "It's raining so bring, your umbrella.",
    ],
    correct: 1,
    explanation: "\"It's\" is the contraction for \"it is\"; the comma correctly separates the two clauses." },
  { id: "s8", program: "MDCAT", subject: "English", topic: "Vocabulary", source: "Past Paper 2022",
    question: "Choose the word closest in meaning to 'meticulous'.",
    options: ["Careless", "Painstaking", "Hasty", "Indifferent"],
    correct: 1,
    explanation: "'Meticulous' means showing great attention to detail; 'painstaking' is the closest synonym." },
];

// ---------- Storage helpers (Supabase = shared, localStorage = personal fallback) ----------
async function loadBank() {
  const data = await loadSharedData();
  return data && data.bank ? data.bank : null;
}
async function saveBank(bank) {
  await saveSharedData({ bank });
}
async function loadPasscode() {
  const data = await loadSharedData();
  return data && data.passcode ? data.passcode : null;
}
async function savePasscode(pc) {
  await saveSharedData({ passcode: pc });
}

// ---------- Bulk PDF -> AI MCQ extraction helpers ----------
let _pdfjsLibPromise = null;
async function getPdfJs() {
  if (!_pdfjsLibPromise) {
    _pdfjsLibPromise = (async () => {
      const lib = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs");
      lib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs";
      return lib;
    })();
  }
  return _pdfjsLibPromise;
}

async function extractPdfText(file, onProgress) {
  const pdfjsLib = await getPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY = null;
    let line = "";
    for (const item of content.items) {
      const y = item.transform ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        text += line.trim() + "\n";
        line = "";
      }
      line += item.str + " ";
      lastY = y;
    }
    text += line.trim() + "\n\n";
    if (onProgress) onProgress(i, pdf.numPages);
  }
  return text;
}

// ---------- Regex-based parsing (no AI) for a known "Q1) ... A) B) C) D) Answer: Explanation:" format ----------

// Splits raw PDF text into one block per question, starting at each "Q<number>)" marker.
function splitIntoQuestionBlocks(text) {
  const regex = /Q\s*\d+\s*\)/g;
  const indices = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    indices.push(m.index);
  }
  if (indices.length === 0) return [];
  const blocks = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : text.length;
    const block = text.slice(start, end).trim();
    if (block) blocks.push(block);
  }
  return blocks;
}

// Parses a single question block. Returns { complete, question, options, correct, explanation, rawBlock }.
// complete=true only if question + all 4 options + answer letter + explanation were all found.
function parseQuestionBlock(block) {
  const withoutQNum = block.replace(/^Q\s*\d+\s*\)\s*/, "");

  const optRegex = /(?:^|\n)\s*([ABCD])\s*[).]\s*/g;
  const optPositions = [];
  let m;
  while ((m = optRegex.exec(withoutQNum)) !== null) {
    optPositions.push({ letter: m[1], markerStart: m.index, contentStart: m.index + m[0].length });
  }

  if (optPositions.length < 4) {
    return { complete: false, question: "", options: [], correct: null, explanation: "", rawBlock: block };
  }

  const questionText = withoutQNum.slice(0, optPositions[0].markerStart).replace(/\n/g, " ").trim();

  const answerMatch = withoutQNum.match(/Answer\s*[:\-]\s*([ABCD])/i);
  const explanationMatch = withoutQNum.match(/Explanation\s*[:\-]\s*([\s\S]*)$/i);

  const stopIndex = answerMatch ? withoutQNum.indexOf(answerMatch[0]) : withoutQNum.length;

  const options = [];
  for (let i = 0; i < 4; i++) {
    const startIdx = optPositions[i].contentStart;
    const endIdx = i + 1 < optPositions.length ? optPositions[i + 1].markerStart : stopIndex;
    const optText = withoutQNum.slice(startIdx, Math.max(startIdx, endIdx)).replace(/\n/g, " ").trim();
    options.push(optText);
  }

  const correct = answerMatch ? "ABCD".indexOf(answerMatch[1].toUpperCase()) : null;
  const explanation = explanationMatch ? explanationMatch[1].replace(/\n/g, " ").trim() : "";

  const hasQuestion = questionText.length > 0;
  const hasAllOptions = options.every((o) => o.length > 0);
  const complete = hasQuestion && hasAllOptions && correct !== null && correct >= 0 && explanation.length > 0;

  return { complete, question: questionText, options, correct, explanation, rawBlock: block };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ---------- Fonts ----------
function FontLoader() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);
  return null;
}

// ---------- OMR Bubble ----------
function Bubble({ letter, state, onClick, disabled }) {
  let cls = "border-2 flex items-center justify-center transition-all duration-150 select-none";
  let style = { width: 34, height: 34, borderRadius: "50%", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 };
  if (state === "idle") {
    style.borderColor = T.inkSoft;
    style.color = T.inkSoft;
    style.background = "transparent";
  } else if (state === "selected") {
    style.borderColor = T.blue;
    style.background = T.blue;
    style.color = "#fff";
  } else if (state === "correct" || state === "reveal-correct") {
    style.borderColor = T.emerald;
    style.background = T.emerald;
    style.color = "#fff";
  } else if (state === "incorrect") {
    style.borderColor = T.rose;
    style.background = T.rose;
    style.color = "#fff";
  }
  return (
    <button onClick={onClick} disabled={disabled} className={cls} style={style}>
      {letter}
    </button>
  );
}

// ---------- Bottom Nav ----------
function BottomNav({ tab, setTab, onSaved }) {
  const items = [
    { key: "home", label: "Home", icon: HomeIcon },
    { key: "pastpapers", label: "Past Papers", icon: FileText },
    { key: "mockexam", label: "Mock Exam", icon: ClipboardCheck },
    { key: "notes", label: "Notes", icon: BookOpen },
    { key: "saved", label: "Saved", icon: Bookmark },
  ];
  return (
    <div
      className="fixed bottom-0 left-0 right-0 flex items-center justify-around py-2 z-20"
      style={{ background: T.card, borderTop: `1px solid ${T.line}` }}
    >
      {items.map((it) => {
        const Icon = it.icon;
        const active = tab === it.key;
        return (
          <button
            key={it.key}
            onClick={() => (it.key === "saved" ? onSaved && onSaved() : setTab(it.key))}
            className="flex flex-col items-center gap-1 px-3 py-1"
            style={{ color: active ? "#6FA3F5" : T.inkSoft }}
          >
            <Icon size={20} />
            <span className="text-[11px]" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ComingSoon({ title }) {
  return (
    <div className="min-h-screen pb-20" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <div
          className="mx-auto mb-4 flex items-center justify-center"
          style={{ width: 56, height: 56, borderRadius: "50%", border: `1px solid ${T.ink}` }}
        >
          <Calendar size={24} />
        </div>
        <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl mb-2">{title}</h2>
        <p className="text-sm" style={{ color: T.inkSoft }}>This feature is coming soon.</p>
      </div>
    </div>
  );
}

// ---------- Notes: browse by program -> subject -> note ----------
function NotesFlow({ notesBank, programs, onExit }) {
  // step: "program" (only shown if the student has more than one visible program) -> "subject" -> "note"
  const [prog, setProg] = useState(programs.length === 1 ? programs[0].key : null);
  const [subject, setSubject] = useState(null);
  const [noteId, setNoteId] = useState(null);

  const notesForProg = (notesBank || []).filter((n) => n.program === prog);
  const subjects = useMemo(() => {
    const map = {};
    notesForProg.forEach((n) => { map[n.subject] = (map[n.subject] || 0) + 1; });
    return Object.keys(map).sort().map((name) => ({ name, count: map[name] }));
  }, [notesForProg]);

  if (!prog) {
    return (
      <div className="min-h-screen pb-20" style={{ background: T.paper, color: T.ink }}>
        <FontLoader />
        <div className="max-w-5xl mx-auto px-6 py-10">
          <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl mb-6">Notes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {programs.map((p) => {
              const Icon = p.icon;
              const n = (notesBank || []).filter((nt) => nt.program === p.key).length;
              return (
                <button
                  key={p.key}
                  disabled={n === 0}
                  onClick={() => setProg(p.key)}
                  className="text-left p-5 flex items-center gap-3 disabled:opacity-40"
                  style={{ background: T.card, border: `1px solid ${T.line}` }}
                >
                  <Icon size={22} />
                  <div>
                    <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{p.label}</div>
                    <div className="text-xs" style={{ color: T.inkSoft }}>{n} note{n === 1 ? "" : "s"}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (noteId) {
    const note = notesForProg.find((n) => n.id === noteId);
    if (!note) { setNoteId(null); return null; }
    return (
      <div className="min-h-screen pb-20" style={{ background: T.paper, color: T.ink }}>
        <FontLoader />
        <div className="max-w-2xl mx-auto px-6 py-10">
          <button onClick={() => setNoteId(null)} className="flex items-center gap-1 text-sm mb-6" style={{ color: T.inkSoft }}>
            <ArrowLeft size={16} /> Back to notes
          </button>
          <div className="text-xs tracking-widest uppercase mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.amber }}>
            {note.program} · {note.subject}
          </div>
          <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl mb-6">{note.title}</h1>
          <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
            {note.content}
          </div>
        </div>
      </div>
    );
  }

  if (subject) {
    const list = notesForProg.filter((n) => n.subject === subject);
    return (
      <div className="min-h-screen pb-20" style={{ background: T.paper, color: T.ink }}>
        <FontLoader />
        <div className="max-w-2xl mx-auto px-6 py-10">
          <button onClick={() => setSubject(null)} className="flex items-center gap-1 text-sm mb-6" style={{ color: T.inkSoft }}>
            <ArrowLeft size={16} /> Back to subjects
          </button>
          <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl mb-6">{subject}</h1>
          {list.length === 0 ? (
            <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>No notes here yet.</div>
          ) : (
            <div className="space-y-3">
              {list.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setNoteId(n.id)}
                  className="w-full text-left p-4 flex items-center gap-3"
                  style={{ background: T.card, border: `1px solid ${T.line}` }}
                >
                  <StickyNote size={18} style={{ color: T.amber }} />
                  <span style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{n.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-5xl mx-auto px-6 py-10">
        {programs.length > 1 && (
          <button onClick={() => setProg(null)} className="flex items-center gap-1 text-sm mb-6" style={{ color: T.inkSoft }}>
            <ArrowLeft size={16} /> Back to programs
          </button>
        )}
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl mb-6">Notes — {prog}</h1>
        {subjects.length === 0 ? (
          <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            No notes have been added for this program yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {subjects.map((s) => {
              const Icon = subjectIcon(s.name);
              return (
                <button
                  key={s.name}
                  onClick={() => setSubject(s.name)}
                  className="text-left p-6 flex items-start gap-4 transition-transform hover:-translate-y-0.5"
                  style={{ background: T.card, border: `1px solid ${T.line}` }}
                >
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 48, height: 48, background: colorForName(s.name), borderRadius: "50%" }}
                  >
                    <Icon size={22} style={{ color: "#fff" }} />
                  </div>
                  <div>
                    <span style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }} className="text-xl">{s.name}</span>
                    <div className="text-sm mt-1" style={{ color: T.inkSoft }}>{s.count} note{s.count === 1 ? "" : "s"}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Search overlay: live search across the question bank + notes ----------
function SearchOverlay({ bank, notesBank, onClose }) {
  const [q, setQ] = useState("");
  const [openQuestion, setOpenQuestion] = useState(null);
  const [openNote, setOpenNote] = useState(null);
  const query = q.trim().toLowerCase();

  const matchedQuestions = useMemo(() => {
    if (query.length < 2) return [];
    return bank
      .filter(
        (item) =>
          item.question.toLowerCase().includes(query) ||
          (item.subject || "").toLowerCase().includes(query) ||
          (item.topic || "").toLowerCase().includes(query)
      )
      .slice(0, 25);
  }, [bank, query]);

  const matchedNotes = useMemo(() => {
    if (query.length < 2) return [];
    return (notesBank || [])
      .filter(
        (n) =>
          n.title.toLowerCase().includes(query) ||
          (n.subject || "").toLowerCase().includes(query) ||
          (n.content || "").toLowerCase().includes(query)
      )
      .slice(0, 25);
  }, [notesBank, query]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center gap-2 flex-1 px-3 py-3" style={{ border: `1px solid ${T.line}`, background: T.card }}>
            <Search size={16} style={{ color: T.inkSoft }} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search questions, subjects, notes…"
              className="w-full outline-none text-sm"
              style={{ background: "transparent", color: T.ink }}
            />
          </div>
          <button onClick={onClose} className="p-3" style={{ border: `1px solid ${T.ink}` }}>
            <X size={16} />
          </button>
        </div>

        {query.length < 2 && (
          <p className="text-sm" style={{ color: T.inkSoft }}>Type at least 2 characters to search.</p>
        )}

        {openQuestion && (
          <div className="mb-6 p-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs tracking-widest uppercase" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.amber }}>
                {openQuestion.program} · {openQuestion.subject} {openQuestion.topic ? `· ${openQuestion.topic}` : ""}
              </div>
              <button onClick={() => setOpenQuestion(null)}><X size={14} /></button>
            </div>
            <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }} className="mb-3">{openQuestion.question}</div>
            <div className="space-y-2">
              {openQuestion.options.map((opt, i) => (
                <div
                  key={i}
                  className="text-sm px-3 py-2"
                  style={{
                    border: `1px solid ${i === openQuestion.correct ? T.emerald : T.line}`,
                    color: i === openQuestion.correct ? T.emerald : T.ink,
                  }}
                >
                  {["A", "B", "C", "D"][i]}. {opt}
                </div>
              ))}
            </div>
            {openQuestion.explanation && (
              <div className="mt-3 text-sm p-3" style={{ background: T.amberSoft, color: "#3A2C0E", borderRadius: 6 }}>
                {openQuestion.explanation}
              </div>
            )}
          </div>
        )}

        {openNote && (
          <div className="mb-6 p-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs tracking-widest uppercase" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.amber }}>
                {openNote.program} · {openNote.subject}
              </div>
              <button onClick={() => setOpenNote(null)}><X size={14} /></button>
            </div>
            <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="mb-3 text-lg">{openNote.title}</div>
            <div className="text-sm whitespace-pre-wrap">{openNote.content}</div>
          </div>
        )}

        {matchedNotes.length > 0 && (
          <div className="mb-6">
            <div className="text-xs tracking-widest uppercase mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
              Notes ({matchedNotes.length})
            </div>
            <div className="space-y-2">
              {matchedNotes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { setOpenNote(n); setOpenQuestion(null); }}
                  className="w-full text-left p-3 flex items-center gap-3"
                  style={{ background: T.card, border: `1px solid ${T.line}` }}
                >
                  <StickyNote size={16} style={{ color: T.amber }} />
                  <div>
                    <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }} className="text-sm">{n.title}</div>
                    <div className="text-xs" style={{ color: T.inkSoft }}>{n.program} · {n.subject}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {matchedQuestions.length > 0 && (
          <div>
            <div className="text-xs tracking-widest uppercase mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
              Questions ({matchedQuestions.length})
            </div>
            <div className="space-y-2">
              {matchedQuestions.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { setOpenQuestion(item); setOpenNote(null); }}
                  className="w-full text-left p-3"
                  style={{ background: T.card, border: `1px solid ${T.line}` }}
                >
                  <div className="text-xs mb-1" style={{ color: T.inkSoft }}>{item.program} · {item.subject} {item.topic ? `· ${item.topic}` : ""}</div>
                  <div className="text-sm">{item.question}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {query.length >= 2 && matchedQuestions.length === 0 && matchedNotes.length === 0 && (
          <p className="text-sm" style={{ color: T.inkSoft }}>No results for "{q}".</p>
        )}
      </div>
    </div>
  );
}

// ---------- Notifications overlay ----------
function NotificationsOverlay({ notifications, onClose }) {
  const sorted = [...(notifications || [])].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-xl flex items-center gap-2">
            <BellRing size={20} /> Notifications
          </h2>
          <button onClick={onClose} className="p-3" style={{ border: `1px solid ${T.ink}` }}>
            <X size={16} />
          </button>
        </div>
        {sorted.length === 0 ? (
          <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            No notifications yet.
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((n) => (
              <div key={n.id} className="p-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                <div className="flex items-center justify-between mb-1">
                  <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{n.title}</div>
                  {n.createdAt && (
                    <div className="text-xs shrink-0" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {new Date(n.createdAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <div className="text-sm" style={{ color: T.inkSoft }}>{n.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Leaderboard ----------
function LeaderboardView({ onBack, currentUserName }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await loadLeaderboard(50);
      setRows(data);
      setError(data.length === 0);
      setLoading(false);
    })();
  }, []);

  const medalColor = (i) => (i === 0 ? "#D4AF37" : i === 1 ? "#B7C0C7" : i === 2 ? "#C9793C" : T.inkSoft);

  return (
    <div className="min-h-screen pb-20" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <button onClick={onBack} className="flex items-center gap-1 text-sm mb-6" style={{ color: T.inkSoft }}>
          <ArrowLeft size={16} /> Back
        </button>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl mb-1 flex items-center gap-2">
          <Trophy size={22} style={{ color: T.amber }} /> Leaderboard
        </h1>
        <p className="text-sm mb-6" style={{ color: T.inkSoft }}>Ranked by total correct answers across all students.</p>

        {loading && <div className="text-sm" style={{ color: T.inkSoft }}>Loading…</div>}

        {!loading && error && (
          <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            No leaderboard data yet — start practicing to appear here! (If this stays empty, ask
            whoever manages Supabase to confirm the <code style={{ fontFamily: "'IBM Plex Mono', monospace" }}>user_stats</code> table
            has a <code style={{ fontFamily: "'IBM Plex Mono', monospace" }}>name</code> column and a read policy.)
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((r, i) => {
              const acc = r.total_attempted > 0 ? Math.round((r.total_correct / r.total_attempted) * 100) : 0;
              const isMe = currentUserName && r.name === currentUserName;
              return (
                <div
                  key={i}
                  className="flex items-center gap-4 p-3"
                  style={{
                    background: isMe ? T.blueSoft : T.card,
                    border: `1px solid ${isMe ? T.blue : T.line}`,
                  }}
                >
                  <div className="flex items-center justify-center shrink-0" style={{ width: 28 }}>
                    {i < 3 ? (
                      <Medal size={20} style={{ color: medalColor(i) }} />
                    ) : (
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }} className="text-sm">
                        {i + 1}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="truncate"
                      style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600, color: isMe ? T.paper : T.ink }}
                    >
                      {r.name}{isMe ? " (You)" : ""}
                    </div>
                    <div className="text-xs" style={{ color: isMe ? "#1F3A66" : T.inkSoft }}>
                      {r.total_correct} correct · {r.total_attempted} attempted · {acc}% accuracy
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Contact Us ----------
function ContactUsPage({ onBack }) {
  return (
    <div className="min-h-screen pb-20" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-md mx-auto px-6 py-10">
        <button onClick={onBack} className="flex items-center gap-1 text-sm mb-6" style={{ color: T.inkSoft }}>
          <ArrowLeft size={16} /> Back
        </button>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl mb-1">Contact Us</h1>
        <p className="text-sm mb-6" style={{ color: T.inkSoft }}>Reach out to us on WhatsApp — tap a number to start chatting.</p>
        <div className="space-y-3">
          {CONTACT_WHATSAPP_NUMBERS.map((c) => (
            <a
              key={c.wa}
              href={`https://wa.me/${c.wa}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-4 p-4"
              style={{ background: T.card, border: `1px solid ${T.line}`, textDecoration: "none", color: T.ink }}
            >
              <div
                className="flex items-center justify-center shrink-0"
                style={{ width: 44, height: 44, borderRadius: "50%", background: T.emerald }}
              >
                <MessageCircle size={20} style={{ color: "#fff" }} />
              </div>
              <div>
                <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{c.label}</div>
                <div className="text-sm" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>{c.display}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Home: dashboard ----------
function Home({
  bank, programs, onOpenProgram, onOpenAdmin, stats, showAdminEntry, userEmail, userName, userCourse,
  onSignOut, onDailyChallenge, onReviewMistakes, onOpenSaved, onOpenLeaderboard,
  notesBank, notifications,
}) {
  const [navTab, setNavTab] = useState("home");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const total = bank.filter((q) => programs.some((p) => p.key === q.program)).length;
  const counts = useMemo(() => {
    const c = {};
    programs.forEach((p) => (c[p.key] = bank.filter((q) => q.program === p.key).length));
    return c;
  }, [bank, programs]);

  const [seenNotifCount, setSeenNotifCount] = useState(() => {
    try { return Number(localStorage.getItem("mdcat-notif-seen") || 0); } catch { return 0; }
  });
  const unseenNotifs = Math.max(0, (notifications?.length || 0) - seenNotifCount);
  const openNotifPanel = () => {
    setNotifOpen(true);
    setSeenNotifCount(notifications?.length || 0);
    try { localStorage.setItem("mdcat-notif-seen", String(notifications?.length || 0)); } catch {}
  };

  const topicsCompleted = stats ? Object.keys(stats.bySubject || {}).length : 0;
  const attempted = stats?.totalAttempted || 0;
  const accuracy = attempted > 0 ? Math.round((stats.totalCorrect / attempted) * 100) : 0;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return "Good Night";
    if (h < 12) return "Good Morning";
    if (h < 17) return "Good Afternoon";
    if (h < 21) return "Good Evening";
    return "Good Night";
  }, []);

  const soon = (label) => alert(`${label} is coming soon.`);

  const pastPaperCounts = useMemo(() => {
    const c = {};
    programs.forEach((p) => (c[p.key] = bank.filter((q) => q.program === p.key && /past/i.test(q.source || "")).length));
    return c;
  }, [bank, programs]);

  if (navTab === "notes") {
    return (
      <>
        <NotesFlow notesBank={notesBank} programs={programs} onExit={() => setNavTab("home")} />
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} />
      </>
    );
  }
  if (navTab === "pastpapers") {
    return (
      <div className="min-h-screen pb-20" style={{ background: T.paper, color: T.ink }}>
        <FontLoader />
        <div className="max-w-5xl mx-auto px-6 py-10">
          <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl mb-6">Past Papers</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {programs.map((p) => {
              const Icon = p.icon;
              const n = pastPaperCounts[p.key] || 0;
              return (
                <button
                  key={p.key}
                  disabled={n === 0}
                  onClick={() => onOpenProgram(p.key)}
                  className="text-left p-5 flex items-center gap-3 disabled:opacity-40"
                  style={{ background: T.card, border: `1px solid ${T.line}` }}
                >
                  <Icon size={22} />
                  <div>
                    <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{p.label}</div>
                    <div className="text-xs" style={{ color: T.inkSoft }}>{n} past paper question{n === 1 ? "" : "s"}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} />
      </div>
    );
  }
  if (navTab === "mockexam") {
    return (
      <div className="min-h-screen pb-20" style={{ background: T.paper, color: T.ink }}>
        <FontLoader />
        <div className="max-w-5xl mx-auto px-6 py-10">
          <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl mb-2">Mock Exam</h2>
          <p className="text-sm mb-6" style={{ color: T.inkSoft }}>Pick a program, then choose "Timed Mock Exam" before you start.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {programs.map((p) => {
              const Icon = p.icon;
              const n = counts[p.key] || 0;
              return (
                <button
                  key={p.key}
                  disabled={n === 0}
                  onClick={() => onOpenProgram(p.key)}
                  className="text-left p-5 flex items-center gap-3 disabled:opacity-40"
                  style={{ background: T.card, border: `1px solid ${T.line}` }}
                >
                  <Icon size={22} />
                  <div>
                    <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{p.label}</div>
                    <div className="text-xs" style={{ color: T.inkSoft }}>{n} question{n === 1 ? "" : "s"}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} />
      </div>
    );
  }
  if (navTab === "progress") {
    return (
      <div className="min-h-screen pb-20" style={{ background: T.paper, color: T.ink }}>
        <FontLoader />
        <div className="max-w-md mx-auto px-6 py-10">
          <button onClick={() => setNavTab("profile")} className="flex items-center gap-1 text-sm mb-6" style={{ color: T.inkSoft }}>
            <ArrowLeft size={16} /> Back
          </button>
          <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl mb-6">Your Progress</h2>
          <div className="p-5 mb-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            <div className="text-sm" style={{ color: T.inkSoft }}>Topics completed</div>
            <div className="text-2xl" style={{ fontFamily: "'Source Serif 4', serif" }}>{topicsCompleted}</div>
          </div>
          <div className="p-5 mb-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            <div className="text-sm" style={{ color: T.inkSoft }}>MCQs attempted</div>
            <div className="text-2xl" style={{ fontFamily: "'Source Serif 4', serif" }}>{attempted}</div>
          </div>
          <div className="p-5 mb-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            <div className="text-sm" style={{ color: T.inkSoft }}>Overall accuracy</div>
            <div className="text-2xl" style={{ fontFamily: "'Source Serif 4', serif" }}>{accuracy}%</div>
          </div>
        </div>
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} />
      </div>
    );
  }
  if (navTab === "contact") {
    return (
      <>
        <ContactUsPage onBack={() => setNavTab("profile")} />
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} />
      </>
    );
  }
  if (navTab === "settings") {
    return (
      <div className="min-h-screen pb-20" style={{ background: T.paper, color: T.ink }}>
        <FontLoader />
        <div className="max-w-md mx-auto px-6 py-10">
          <button onClick={() => setNavTab("profile")} className="flex items-center gap-1 text-sm mb-6" style={{ color: T.inkSoft }}>
            <ArrowLeft size={16} /> Back
          </button>
          <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl mb-6">Settings</h2>
          <div className="p-5 mb-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            <div className="text-sm mb-1" style={{ color: T.inkSoft }}>Signed in as</div>
            <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{userName || "Student"}</div>
            <div className="text-sm" style={{ color: T.inkSoft }}>{userEmail}</div>
            {userCourse && (
              <p className="text-xs mt-2 inline-flex px-2 py-1" style={{ color: T.blue, background: T.blueSoft, borderRadius: 6 }}>
                {userCourse} student
              </p>
            )}
          </div>
          {showAdminEntry && (
            <button
              onClick={onOpenAdmin}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm mb-3"
              style={{ border: `1px solid ${T.ink}` }}
            >
              <Lock size={14} /> Admin sign-in
            </button>
          )}
          <button
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm"
            style={{ border: `1px solid ${T.rose}`, color: T.rose }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} />
      </div>
    );
  }
  if (navTab === "profile") {
    const menuItems = [
      { label: "My Progress", sub: "Topics, MCQs & accuracy", icon: TrendingUp, action: () => setNavTab("progress") },
      { label: "Contact Us", sub: "Chat with us on WhatsApp", icon: Phone, action: () => setNavTab("contact") },
      { label: "Settings", sub: "Account & admin access", icon: Settings, action: () => setNavTab("settings") },
    ];
    return (
      <div className="min-h-screen pb-20" style={{ background: T.paper, color: T.ink }}>
        <FontLoader />
        <div className="max-w-md mx-auto px-6 py-10">
          <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl mb-1">
            {userName || "Profile"}
          </h2>
          <p className="text-sm mb-1" style={{ color: T.inkSoft }}>{userEmail}</p>
          {userCourse && (
            <p className="text-xs mb-6 inline-flex px-2 py-1" style={{ color: T.blue, background: T.blueSoft, borderRadius: 6 }}>
              {userCourse} student
            </p>
          )}
          {!userCourse && <div className="mb-6" />}

          <div className="space-y-2 mb-6">
            {menuItems.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.label}
                  onClick={m.action}
                  className="w-full flex items-center gap-4 p-4 text-left"
                  style={{ background: T.card, border: `1px solid ${T.line}` }}
                >
                  <div className="flex items-center justify-center shrink-0" style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1">
                    <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{m.label}</div>
                    <div className="text-xs" style={{ color: T.inkSoft }}>{m.sub}</div>
                  </div>
                  <ChevronRight size={16} style={{ color: T.inkSoft }} />
                </button>
              );
            })}
          </div>

          <button
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm"
            style={{ border: `1px solid ${T.rose}`, color: T.rose }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />

      {/* Hero */}
      <div className="px-6 pt-6 pb-10" style={{ background: "linear-gradient(135deg, #0A1B3D, #123A6B 60%, #0A1B3D)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setNavTab("profile")}>
              <Menu size={22} color="#fff" />
            </button>
            <div className="flex items-center gap-4">
              <button onClick={() => setSearchOpen(true)}>
                <Search size={20} color="#fff" />
              </button>
              <button onClick={openNotifPanel} className="relative">
                <Bell size={20} color="#fff" />
                {unseenNotifs > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 flex items-center justify-center text-[10px]"
                    style={{ width: 16, height: 16, borderRadius: "50%", background: T.rose, color: "#fff", fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    {unseenNotifs > 9 ? "9+" : unseenNotifs}
                  </span>
                )}
              </button>
              <button
                onClick={() => setNavTab("profile")}
                className="flex items-center justify-center"
                style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.15)" }}
              >
                <User size={18} color="#fff" />
              </button>
            </div>
          </div>
          <div className="text-sm mb-1" style={{ color: "#B9C4DE" }}>{greeting}{userName ? `, ${userName}` : ", Future Doctor"} 👋</div>
          <h1 className="text-3xl sm:text-4xl mb-2" style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700, color: "#fff" }}>
            Focus Today, <span style={{ color: "#6FA3F5" }}>Heal Tomorrow.</span>
          </h1>
          <p className="text-sm" style={{ color: "#B9C4DE" }}>
            {userCourse ? `Your dedicated prep space for ${userCourse}.` : "Your all-in-one platform for MDCAT, KMU CAT, BSN & MBBS success."}
          </p>
        </div>
      </div>

      {searchOpen && (
        <SearchOverlay
          bank={bank.filter((q) => programs.some((p) => p.key === q.program))}
          notesBank={(notesBank || []).filter((n) => programs.some((p) => p.key === n.program))}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {notifOpen && (
        <NotificationsOverlay notifications={notifications || []} onClose={() => setNotifOpen(false)} />
      )}

      <main className="max-w-5xl mx-auto px-6 -mt-4">
        {/* Choose Your Program */}
        <div
          className="flex items-center justify-between mb-4 px-4 py-3 relative z-10"
          style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10 }}
        >
          <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-lg">
            {programs.length === 1 ? "Your Program" : "Choose Your Program"}
          </h2>
          <span className="text-sm" style={{ color: T.inkSoft }}>
            {total} question{total === 1 ? "" : "s"} in bank
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {programs.map((p) => {
            const Icon = p.icon;
            const n = counts[p.key] || 0;
            return (
              <div key={p.key} className="p-5 text-white flex flex-col" style={{ background: p.gradient, borderRadius: 14 }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-xl">{p.label}</div>
                    <div className="text-xs mt-1" style={{ color: "#C7D3EA" }}>{p.tagline}</div>
                  </div>
                  <div className="flex items-center justify-center shrink-0" style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.12)" }}>
                    <Icon size={18} />
                  </div>
                </div>
                <div className="flex flex-col gap-1 mb-4">
                  {p.links.map((l) => {
                    const LIcon = l.icon;
                    return (
                      <button
                        key={l.label}
                        onClick={() => (l.action === "open" ? onOpenProgram(p.key) : soon(l.label))}
                        className="flex items-center justify-between px-3 py-2 text-sm text-left"
                        style={{ background: "rgba(255,255,255,0.08)", borderRadius: 8 }}
                      >
                        <span className="flex items-center gap-2"><LIcon size={14} /> {l.label}</span>
                        <ChevronRight size={14} />
                      </button>
                    );
                  })}
                </div>
                <button
                  disabled={n === 0}
                  onClick={() => onOpenProgram(p.key)}
                  className="mt-auto flex items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-40"
                  style={{ background: "#2E63D6", borderRadius: 8 }}
                >
                  {n === 0 ? "No questions yet" : `Explore ${p.label}`} <ChevronRight size={14} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Quick Access */}
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-lg">Quick Access</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {[
            { label: "Daily Challenge", sub: stats?.streak ? `🔥 ${stats.streak} day streak` : "Test your knowledge daily", icon: ClipboardCheck, action: onDailyChallenge },
            { label: "Your Progress", sub: "Track your learning", icon: TrendingUp, action: () => setNavTab("progress") },
            { label: "Weak Topics", sub: `${stats?.wrongIds?.length || 0} to review`, icon: RotateCcw, action: onReviewMistakes },
            { label: "Leaderboard", sub: "Compete & be the best", icon: Trophy, action: onOpenLeaderboard },
          ].map((q) => {
            const Icon = q.icon;
            return (
              <button key={q.label} onClick={q.action} className="p-4 text-left flex flex-col gap-2" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10 }}>
                <div className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }}>
                  <Icon size={16} />
                </div>
                <div className="text-sm font-medium">{q.label}</div>
                <div className="text-xs" style={{ color: T.inkSoft }}>{q.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Progress Overview */}
        <div className="p-6 mb-6 text-white" style={{ background: "linear-gradient(135deg, #0A1B3D, #123A6B)", borderRadius: 14 }}>
          <div className="flex items-center justify-between mb-5">
            <h3 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-lg">Your Progress Overview</h3>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div>
              <div className="text-xs mb-1" style={{ color: "#B9C4DE" }}>Topics Completed</div>
              <div className="text-2xl" style={{ fontFamily: "'Source Serif 4', serif" }}>{topicsCompleted}</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "#B9C4DE" }}>MCQs Attempted</div>
              <div className="text-2xl" style={{ fontFamily: "'Source Serif 4', serif" }}>{attempted}</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "#B9C4DE" }}>Overall Accuracy</div>
              <div className="text-2xl" style={{ fontFamily: "'Source Serif 4', serif" }}>{accuracy}%</div>
            </div>
          </div>
          <div className="h-1.5 w-full mb-2" style={{ background: "rgba(255,255,255,0.15)", borderRadius: 4 }}>
            <div className="h-1.5" style={{ width: `${accuracy}%`, background: "#6FA3F5", borderRadius: 4 }} />
          </div>
          <div className="text-xs" style={{ color: "#B9C4DE" }}>
            {attempted === 0 ? "Start practicing to see your progress here." : "Keep it up! You're doing great. ⭐"}
          </div>
        </div>

        {total === 0 && (
          <div className="mb-10 p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            The question bank is empty. Sign in as admin to add MCQs and past papers.
          </div>
        )}
      </main>

      <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} />
    </div>
  );
}

// ---------- Program page: choose Subject (or Year for MBBS) ----------
function ProgramPage({ program, bank, onBack, onOpenSubject, onOpenYear }) {
  const progQuestions = bank.filter((q) => q.program === program);
  const isMBBS = program === "MBBS";
  const isMDCAT = TOPIC_PROGRAMS.includes(program);

  const groups = useMemo(() => {
    if (isMBBS) {
      return Object.keys(MBBS_STRUCTURE).map((name) => ({
        name,
        count: progQuestions.filter((q) => (q.year || "") === name).length,
      }));
    }
    if (isMDCAT) {
      return Object.keys(MDCAT_TOPICS).map((name) => ({
        name,
        count: progQuestions.filter((q) => q.subject === name).length,
      }));
    }
    const map = {};
    progQuestions.forEach((q) => {
      map[q.subject] = (map[q.subject] || 0) + 1;
    });
    return Object.keys(map).sort().map((name) => ({ name, count: map[name] }));
  }, [progQuestions, isMBBS, isMDCAT]);

  const progInfo = PROGRAMS.find((p) => p.key === program);

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <button onClick={onBack} className="flex items-center gap-1 text-sm mb-6" style={{ color: T.inkSoft }}>
          <ArrowLeft size={16} /> Back to programs
        </button>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-3xl mb-1">
          {progInfo ? progInfo.label : program}
        </h1>
        <p className="text-sm mb-8" style={{ color: T.inkSoft }}>
          {progQuestions.length} question{progQuestions.length === 1 ? "" : "s"} across {groups.length} {isMBBS ? "year" : "subject"}{groups.length === 1 ? "" : "s"}
        </p>

        {groups.length === 0 ? (
          <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            No questions yet for this program.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {groups.map((s) => {
              const Icon = isMBBS ? GraduationCap : subjectIcon(s.name);
              return (
                <button
                  key={s.name}
                  onClick={() => (isMBBS ? onOpenYear(s.name) : onOpenSubject(s.name))}
                  className="text-left p-6 flex items-start gap-4 transition-transform hover:-translate-y-0.5"
                  style={{ background: T.card, border: `1px solid ${T.line}` }}
                >
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 48, height: 48, background: colorForName(s.name), borderRadius: "50%" }}
                  >
                    <Icon size={22} style={{ color: "#fff" }} />
                  </div>
                  <div>
                    <span style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }} className="text-xl">
                      {s.name}
                    </span>
                    <div className="text-sm mt-1" style={{ color: T.inkSoft }}>
                      {s.count} question{s.count === 1 ? "" : "s"} available
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- MBBS Year page (lists Blocks within a chosen year) ----------
function YearPage({ program, year, bank, onBack, onOpenBlock }) {
  const yearQuestions = bank.filter((q) => q.program === program && (q.year || "") === year);
  const blockNames = Object.keys(MBBS_STRUCTURE[year] || {});
  const blocks = blockNames.map((name) => ({
    name,
    count: yearQuestions.filter((q) => (q.block || "") === name).length,
  }));

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <button onClick={onBack} className="flex items-center gap-1 text-sm mb-6" style={{ color: T.inkSoft }}>
          <ArrowLeft size={16} /> Back to years
        </button>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-3xl mb-1">
          {year}
        </h1>
        <p className="text-sm mb-8" style={{ color: T.inkSoft }}>
          {yearQuestions.length} question{yearQuestions.length === 1 ? "" : "s"} across {blocks.length} block{blocks.length === 1 ? "" : "s"}
        </p>

        {blocks.length === 0 ? (
          <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            No blocks defined for this year.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {blocks.map((b) => (
              <button
                key={b.name}
                onClick={() => onOpenBlock(b.name)}
                className="text-left p-6 flex items-start gap-4 transition-transform hover:-translate-y-0.5"
                style={{ background: T.card, border: `1px solid ${T.line}` }}
              >
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 48, height: 48, background: colorForName(b.name), borderRadius: "50%" }}
                >
                  <Library size={22} style={{ color: "#fff" }} />
                </div>
                <div>
                  <span style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }} className="text-xl">
                    {b.name}
                  </span>
                  <div className="text-sm mt-1" style={{ color: T.inkSoft }}>
                    {b.count} question{b.count === 1 ? "" : "s"} available
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- MBBS Block page (lists fixed subjects within a chosen block) ----------
function BlockPage({ program, year, block, bank, onBack, onOpenSubject }) {
  const blockQuestions = bank.filter(
    (q) => q.program === program && (q.year || "") === year && (q.block || "") === block
  );
  const subjectNames = (MBBS_STRUCTURE[year] && MBBS_STRUCTURE[year][block]) || [];
  const subjects = subjectNames.map((name) => ({
    name,
    count: blockQuestions.filter((q) => q.subject === name).length,
  }));

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <button onClick={onBack} className="flex items-center gap-1 text-sm mb-6" style={{ color: T.inkSoft }}>
          <ArrowLeft size={16} /> Back to blocks
        </button>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-3xl mb-1">
          {year} · {block}
        </h1>
        <p className="text-sm mb-8" style={{ color: T.inkSoft }}>
          {blockQuestions.length} question{blockQuestions.length === 1 ? "" : "s"} across {subjects.length} subject{subjects.length === 1 ? "" : "s"}
        </p>

        {subjects.length === 0 ? (
          <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            No subjects defined for this block.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {subjects.map((s) => {
              const Icon = subjectIcon(s.name);
              return (
                <button
                  key={s.name}
                  onClick={() => onOpenSubject(s.name)}
                  className="text-left p-6 flex items-start gap-4 transition-transform hover:-translate-y-0.5"
                  style={{ background: T.card, border: `1px solid ${T.line}` }}
                >
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 48, height: 48, background: colorForName(s.name), borderRadius: "50%" }}
                  >
                    <Icon size={22} style={{ color: "#fff" }} />
                  </div>
                  <div>
                    <span style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }} className="text-xl">
                      {s.name}
                    </span>
                    <div className="text-sm mt-1" style={{ color: T.inkSoft }}>
                      {s.count} question{s.count === 1 ? "" : "s"} available
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- MDCAT Topic page (lists fixed topics within a chosen subject) ----------
function TopicPage({ program, subject, bank, onBack, onOpenTopic }) {
  const subjQuestions = bank.filter((q) => q.program === program && q.subject === subject);
  const topicNames = MDCAT_TOPICS[subject] || [];
  const topics = topicNames.map((name) => ({
    name,
    count: subjQuestions.filter((q) => q.topic === name).length,
  }));

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <button onClick={onBack} className="flex items-center gap-1 text-sm mb-6" style={{ color: T.inkSoft }}>
          <ArrowLeft size={16} /> Back to subjects
        </button>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-3xl mb-1">
          {subject}
        </h1>
        <p className="text-sm mb-8" style={{ color: T.inkSoft }}>
          {subjQuestions.length} question{subjQuestions.length === 1 ? "" : "s"} across {topics.length} topic{topics.length === 1 ? "" : "s"}
        </p>

        {topics.length === 0 ? (
          <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            No topics defined for this subject.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {topics.map((t) => (
              <button
                key={t.name}
                onClick={() => onOpenTopic(t.name)}
                className="text-left p-4 flex items-center justify-between gap-4 transition-transform hover:-translate-y-0.5"
                style={{ background: T.card, border: `1px solid ${T.line}` }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 36, height: 36, background: colorForName(t.name), borderRadius: "50%" }}
                  >
                    <ClipboardList size={16} style={{ color: "#fff" }} />
                  </div>
                  <span style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{t.name}</span>
                </div>
                <span className="text-xs shrink-0" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
                  {t.count} q
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Subject setup (choose source + count) ----------
function SubjectSetup({ program, year, block, topic, subject, bank, onBack, onStart }) {
  const subjQuestions = bank.filter(
    (q) =>
      q.program === program &&
      q.subject === subject &&
      (year ? (q.year || "") === year : true) &&
      (block ? (q.block || "") === block : true) &&
      (topic ? q.topic === topic : true)
  );
  const sources = useMemo(() => {
    const set = new Set(subjQuestions.map((q) => q.source));
    return ["All", ...Array.from(set).sort()];
  }, [subjQuestions]);
  const [source, setSource] = useState("All");
  const [count, setCount] = useState(10);
  const [timed, setTimed] = useState(false);

  const filtered = source === "All" ? subjQuestions : subjQuestions.filter((q) => q.source === source);
  const maxCount = filtered.length;
  const chosenCount = Math.min(count, Math.max(1, maxCount));
  const SECONDS_PER_Q = 60;

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <button onClick={onBack} className="flex items-center gap-1 text-sm mb-6" style={{ color: T.inkSoft }}>
          <ArrowLeft size={16} /> Back to subjects
        </button>
        <div className="text-xs tracking-widest uppercase mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.amber }}>
          {program}
        </div>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-3xl mb-1">
          {subject}
        </h1>
        <p className="text-sm mb-8" style={{ color: T.inkSoft }}>
          {subjQuestions.length} question{subjQuestions.length === 1 ? "" : "s"} available
        </p>

        <div className="mb-6">
          <label className="text-xs tracking-widest uppercase block mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
            Source
          </label>
          <div className="flex flex-wrap gap-2">
            {sources.map((s) => (
              <button
                key={s}
                onClick={() => { setSource(s); setCount(10); }}
                className="px-3 py-1.5 text-sm"
                style={{
                  border: `1px solid ${T.ink}`,
                  background: source === s ? T.ink : "transparent",
                  color: source === s ? T.paper : T.ink,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8">
          <label className="text-xs tracking-widest uppercase block mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
            Number of questions (max {maxCount})
          </label>
          <input
            type="range"
            min={1}
            max={Math.max(1, maxCount)}
            value={Math.min(count, Math.max(1, maxCount))}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full"
          />
          <div style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-lg mt-1">
            {Math.min(count, Math.max(1, maxCount))} questions
          </div>
        </div>

        <div className="mb-8">
          <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
            <span>
              Timed Mock Exam ({SECONDS_PER_Q}s per question — {Math.round((chosenCount * SECONDS_PER_Q) / 60)} min total)
            </span>
          </label>
        </div>

        <button
          disabled={maxCount === 0}
          onClick={() => onStart(filtered.slice(0, chosenCount), { timeLimit: timed ? chosenCount * SECONDS_PER_Q : null })}
          className="px-6 py-3 text-sm tracking-wide disabled:opacity-40"
          style={{ background: T.ink, color: T.paper, fontFamily: "'IBM Plex Mono', monospace" }}
        >
          {timed ? "Begin timed exam →" : "Begin practice →"}
        </button>
      </div>
    </div>
  );
}

// ---------- Quiz ----------
function Quiz({ questions, subject, onFinish, onExit, timeLimit, bookmarks, onToggleBookmark }) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [answerTimes, setAnswerTimes] = useState({});
  const [showExplain, setShowExplain] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(timeLimit || 0);
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now());
  const q = questions[idx];
  const letters = ["A", "B", "C", "D"];
  const revealed = answers[idx] !== undefined;
  const isCorrect = revealed && answers[idx] === q.correct;
  const isBookmarked = bookmarks && q ? bookmarks.includes(q.id) : false;

  useEffect(() => {
    setQuestionStartedAt(Date.now());
  }, [idx]);

  const select = (i) => {
    if (revealed) return;
    const elapsedSeconds = Math.round((Date.now() - questionStartedAt) / 1000);
    setAnswers((a) => ({ ...a, [idx]: i }));
    setAnswerTimes((t) => ({ ...t, [idx]: elapsedSeconds }));
  };

  const toggleExplain = () => setShowExplain((s) => ({ ...s, [idx]: !s[idx] }));

  const finish = useCallback(() => {
    let correct = 0;
    questions.forEach((qq, i) => {
      if (answers[i] === qq.correct) correct++;
    });
    onFinish({ questions, answers, answerTimes, correct });
  }, [questions, answers, answerTimes, onFinish]);

  useEffect(() => {
    if (!timeLimit) return;
    if (secondsLeft <= 0) {
      finish();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLimit, secondsLeft, finish]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const timeCritical = timeLimit && secondsLeft <= 30;

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onExit} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
            <ArrowLeft size={16} /> Exit
          </button>
          <div className="flex items-center gap-3">
            {timeLimit ? (
              <div
                style={{ fontFamily: "'IBM Plex Mono', monospace", color: timeCritical ? T.rose : T.ink }}
                className="text-sm font-semibold"
              >
                ⏱ {mm}:{ss}
              </div>
            ) : null}
            <div style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm">
              {subject} · Q{idx + 1} / {questions.length}
            </div>
          </div>
        </div>

        <div className="h-1 w-full mb-8" style={{ background: T.line }}>
          <div className="h-1" style={{ width: `${((idx + 1) / questions.length) * 100}%`, background: T.emerald }} />
        </div>

        <div className="flex items-start justify-between gap-3 mb-3">
          <div
            className="text-xs tracking-widest uppercase"
            style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.amber }}
          >
            {q.topic} · {q.source}
          </div>
          {onToggleBookmark && (
            <button onClick={() => onToggleBookmark(q.id)} className="shrink-0" title={isBookmarked ? "Remove from saved" : "Save this question"}>
              <Bookmark size={18} style={{ color: isBookmarked ? T.amber : T.inkSoft }} fill={isBookmarked ? T.amber : "none"} />
            </button>
          )}
        </div>
        <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }} className="text-2xl mb-6 leading-snug">
          {q.question}
        </h2>

        {revealed && (
          <div
            className="flex items-center gap-2 p-3 mb-4 text-sm"
            style={{
              background: isCorrect ? T.emeraldSoft : T.roseSoft,
              color: isCorrect ? T.emerald : T.rose,
            }}
          >
            {isCorrect ? <Check size={16} /> : <X size={16} />}
            <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600 }}>
              {isCorrect ? "Correct!" : "Incorrect — correct answer is highlighted below."}
            </span>
          </div>
        )}

        <div className="space-y-3 mb-4">
          {q.options.map((opt, i) => {
            let state = "idle";
            if (revealed) {
              if (i === q.correct) state = "correct";
              else if (i === answers[idx]) state = "incorrect";
            } else if (answers[idx] === i) {
              state = "selected";
            }
            return (
              <button
                key={i}
                onClick={() => select(i)}
                disabled={revealed}
                className="w-full flex items-center gap-4 p-3 text-left disabled:cursor-default"
                style={{ border: `1px solid ${T.line}`, background: T.card }}
              >
                <Bubble letter={letters[i]} state={state} disabled={revealed} onClick={() => select(i)} />
                <span>{opt}</span>
              </button>
            );
          })}
        </div>

        {revealed && q.explanation && (
          <div className="mb-8">
            {!showExplain[idx] ? (
              <button
                onClick={toggleExplain}
                className="flex items-center gap-2 text-sm px-4 py-2"
                style={{ border: `1px solid ${T.ink}` }}
              >
                <BookOpen size={14} /> Show Explanation
              </button>
            ) : (
              <div className="text-sm p-3" style={{ background: T.amberSoft, color: "#3A2C0E", borderRadius: 6 }}>
                <div className="flex items-center justify-between mb-1">
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-xs uppercase tracking-widest">
                    Explanation
                  </span>
                  <button onClick={toggleExplain} style={{ color: "#3A2C0E" }}>
                    <X size={14} />
                  </button>
                </div>
                {q.explanation}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            disabled={idx === 0}
            onClick={() => setIdx((n) => n - 1)}
            className="flex items-center gap-1 px-4 py-2 text-sm disabled:opacity-30"
            style={{ border: `1px solid ${T.ink}` }}
          >
            <ChevronLeft size={16} /> Previous
          </button>
          {idx < questions.length - 1 ? (
            <button
              onClick={() => setIdx((n) => n + 1)}
              className="flex items-center gap-1 px-4 py-2 text-sm"
              style={{ background: T.ink, color: T.paper }}
            >
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={finish}
              className="flex items-center gap-1 px-5 py-2 text-sm"
              style={{ background: T.emerald, color: "#fff" }}
            >
              Submit <Check size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Results ----------
function Results({ result, subject, onRetry, onHome, bookmarks, onToggleBookmark }) {
  const { questions, answers, correct } = result;
  const pct = Math.round((correct / questions.length) * 100);
  const letters = ["A", "B", "C", "D"];

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="text-center mb-10">
          <div className="text-xs tracking-widest uppercase mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
            {subject} — Result
          </div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-6xl">
            {pct}%
          </div>
          <div className="text-sm mt-2" style={{ color: T.inkSoft }}>
            {correct} out of {questions.length} correct
          </div>
        </div>

        <div className="space-y-6 mb-10">
          {questions.map((q, i) => {
            const your = answers[i];
            const isCorrect = your === q.correct;
            return (
              <div key={i} className="p-4" style={{ border: `1px solid ${T.line}`, background: T.card }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div style={{ fontFamily: "'Source Serif 4', serif" }} className="font-semibold">
                    {i + 1}. {q.question}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {onToggleBookmark && (
                      <button onClick={() => onToggleBookmark(q.id)} title="Save this question">
                        <Bookmark
                          size={16}
                          style={{ color: bookmarks?.includes(q.id) ? T.amber : T.inkSoft }}
                          fill={bookmarks?.includes(q.id) ? T.amber : "none"}
                        />
                      </button>
                    )}
                    {isCorrect ? (
                      <span className="px-2 py-0.5 text-xs" style={{ background: T.emeraldSoft, color: T.emerald }}>Correct</span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs" style={{ background: T.roseSoft, color: T.rose }}>Incorrect</span>
                    )}
                  </div>
                </div>
                <div className="space-y-2 mt-3">
                  {q.options.map((opt, oi) => {
                    let state = "idle";
                    if (oi === q.correct) state = "reveal-correct";
                    else if (oi === your) state = "incorrect";
                    return (
                      <div key={oi} className="flex items-center gap-3 text-sm">
                        <Bubble letter={letters[oi]} state={state} disabled />
                        <span>{opt}</span>
                      </div>
                    );
                  })}
                </div>
                {q.explanation && (
                  <div className="mt-3 text-sm p-3" style={{ background: T.amberSoft, color: "#3A2C0E", borderRadius: 6 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-xs uppercase tracking-widest block mb-1" >Explanation</span>
                    {q.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 justify-center">
          <button onClick={onRetry} className="flex items-center gap-2 px-5 py-2 text-sm" style={{ border: `1px solid ${T.ink}` }}>
            <RotateCcw size={16} /> Practice again
          </button>
          <button onClick={onHome} className="px-5 py-2 text-sm" style={{ background: T.ink, color: T.paper }}>
            Back to programs
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Student Auth (Sign up / Log in) ----------
function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [course, setCourse] = useState("");
  const [courseOpen, setCourseOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const isLogin = mode === "login";
  const accent = isLogin ? "#6FA3F5" : "#4CD9A0";
  const btnBg = isLogin ? T.blue : T.emerald;

  const submit = async () => {
    setError("");
    setNotice("");
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (mode === "signup" && !course) {
      setError("Please select your course.");
      return;
    }
    setBusy(true);
    if (mode === "signup") {
      const { data, error: err } = await signUp(email.trim(), password, { name: name.trim(), course });
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      if (data.session) {
        onAuthed(data.session);
      } else {
        setNotice("Account created. Check your email to confirm, then log in.");
        setMode("login");
      }
    } else {
      const { data, error: err } = await signIn(email.trim(), password);
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      onAuthed(data.session);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, #0A1B3D, #123A6B 55%, #0A1B3D)", color: "#fff" }}
    >
      <FontLoader />
      {/* decorative glow */}
      <div
        className="absolute"
        style={{ width: 300, height: 300, borderRadius: "50%", background: accent, opacity: 0.15, filter: "blur(60px)", top: -80, right: -80 }}
      />
      <div
        className="absolute"
        style={{ width: 260, height: 260, borderRadius: "50%", background: isLogin ? T.rose : T.amber, opacity: 0.12, filter: "blur(60px)", bottom: -60, left: -60 }}
      />

      <div className="w-full max-w-sm px-6 relative z-10">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 text-xs tracking-widest mb-6"
          style={{ fontFamily: "'IBM Plex Mono', monospace", border: `1px solid rgba(255,255,255,0.3)`, letterSpacing: "0.15em" }}
        >
          <GraduationCap size={14} color={accent} /> SMART PREP
        </div>

        <div
          className="flex items-center justify-center mb-5"
          style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: `1px solid rgba(255,255,255,0.2)` }}
        >
          {isLogin ? <ShieldCheck size={24} color={accent} /> : <FlaskConical size={24} color={accent} />}
        </div>

        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700, color: accent }} className="text-3xl mb-1">
          {isLogin ? "Log in" : "Create your account"}
        </h1>
        <p className="text-sm mb-6" style={{ color: "#B9C4DE" }}>
          {isLogin ? "Log in to track your own MCQ scores." : "Sign up to save your practice scores."}
        </p>

        {!isLogin && (
          <div className="mb-3">
            <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#B9C4DE" }}>
              Name
            </label>
            <div
              className="flex items-center gap-2 px-3"
              style={{ border: `1px solid rgba(255,255,255,0.3)`, background: "rgba(255,255,255,0.06)" }}
            >
              <User size={14} color={accent} />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="w-full py-3 outline-none"
                style={{ background: "transparent", color: "#fff", fontFamily: "'IBM Plex Mono', monospace" }}
              />
            </div>
          </div>
        )}

        <div className="mb-3">
          <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#B9C4DE" }}>
            Email
          </label>
          <div
            className="flex items-center gap-2 px-3"
            style={{ border: `1px solid rgba(255,255,255,0.3)`, background: "rgba(255,255,255,0.06)" }}
          >
            <Mail size={14} color={accent} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full py-3 outline-none"
              style={{ background: "transparent", color: "#fff", fontFamily: "'IBM Plex Mono', monospace" }}
            />
          </div>
        </div>

        <div className="mb-2">
          <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#B9C4DE" }}>
            Password
          </label>
          <div
            className="flex items-center gap-2 px-3"
            style={{ border: `1px solid rgba(255,255,255,0.3)`, background: "rgba(255,255,255,0.06)" }}
          >
            <Lock size={14} color={accent} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="At least 6 characters"
              className="w-full py-3 outline-none"
              style={{ background: "transparent", color: "#fff", fontFamily: "'IBM Plex Mono', monospace" }}
            />
          </div>
        </div>

        {!isLogin && (
          <div className="mb-2 relative">
            <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#B9C4DE" }}>
              Course
            </label>
            <button
              type="button"
              onClick={() => setCourseOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-2 px-3 py-3"
              style={{ border: `1px solid rgba(255,255,255,0.3)`, background: "rgba(255,255,255,0.06)" }}
            >
              <span className="flex items-center gap-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: course ? "#fff" : "#8FA0C4" }}>
                <GraduationCap size={14} color={accent} />
                {course ? COURSES.find((c) => c.key === course)?.label : "Select your course…"}
              </span>
              <ChevronDown size={16} color="#8FA0C4" />
            </button>
            {courseOpen && (
              <div
                className="absolute left-0 right-0 mt-1 z-10"
                style={{ background: "#0F2748", border: `1px solid rgba(255,255,255,0.2)` }}
              >
                {COURSES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => { setCourse(c.key); setCourseOpen(false); }}
                    className="w-full text-left px-3 py-3 text-sm"
                    style={{ color: course === c.key ? accent : "#fff", fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs mt-1" style={{ color: "#8FA0C4" }}>
              You'll only see content for the course you pick — MDCAT, KMU CAT, BSN, or MBBS.
            </p>
          </div>
        )}

        {error && <div className="text-sm mt-2" style={{ color: "#F5A3A3" }}>{error}</div>}
        {notice && <div className="text-sm mt-2" style={{ color: "#7FE0B8" }}>{notice}</div>}

        <button
          onClick={submit}
          disabled={busy}
          className="w-full py-3 text-sm mt-5 disabled:opacity-50 font-medium"
          style={{ background: btnBg, color: "#fff" }}
        >
          {busy ? "Please wait…" : isLogin ? "Log in" : "Sign up"}
        </button>

        <button
          onClick={() => { setMode(isLogin ? "signup" : "login"); setError(""); setNotice(""); }}
          className="w-full text-sm mt-4"
          style={{ color: accent }}
        >
          {isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

// ---------- Admin ----------
const EMPTY_FORM = { program: "MDCAT", year: "", block: "", subject: "", topic: "", source: "Practice", question: "", options: ["", "", "", ""], correct: 0, explanation: "" };

function AdminGate({ onUnlock, onBack }) {
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    let stored = await loadPasscode();
    if (!stored) {
      stored = DEFAULT_PASSCODE;
      await savePasscode(stored);
    }
    if (pass === stored) onUnlock();
    else setError("Incorrect passcode.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="w-full max-w-sm px-6">
        <button onClick={onBack} className="flex items-center gap-1 text-sm mb-8" style={{ color: T.inkSoft }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={20} />
          <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl">Admin sign-in</h1>
        </div>
        <p className="text-sm mb-6" style={{ color: T.inkSoft }}>
          Default passcode is <code style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{DEFAULT_PASSCODE}</code> — change it after signing in.
        </p>
        <input
          type="password"
          value={pass}
          onChange={(e) => { setPass(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Passcode"
          className="w-full px-4 py-3 mb-2 outline-none"
          style={{ border: `1px solid ${T.ink}`, background: T.card, fontFamily: "'IBM Plex Mono', monospace" }}
        />
        {error && <div className="text-sm mb-3" style={{ color: T.rose }}>{error}</div>}
        <button onClick={submit} className="w-full py-3 text-sm mt-2" style={{ background: T.ink, color: T.paper }}>
          Unlock admin panel
        </button>
      </div>
    </div>
  );
}

const EMPTY_NOTE_FORM = { program: "MDCAT", subject: "", title: "", content: "" };
const EMPTY_NOTIF_FORM = { title: "", message: "" };

function AdminPanel({ bank, setBank, notesBank, setNotesBank, notifications, setNotifications, onExit }) {
  const [tab, setTab] = useState("list");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [filterProgram, setFilterProgram] = useState("All");
  const [search, setSearch] = useState("");
  const [newPass, setNewPass] = useState("");
  const [passMsg, setPassMsg] = useState("");

  const [noteForm, setNoteForm] = useState(EMPTY_NOTE_FORM);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [notifForm, setNotifForm] = useState(EMPTY_NOTIF_FORM);

  const saveNoteForm = async () => {
    if (!noteForm.subject.trim() || !noteForm.title.trim() || !noteForm.content.trim()) {
      alert("Please fill in subject, title, and content.");
      return;
    }
    let next;
    if (editingNoteId) {
      next = notesBank.map((n) => (n.id === editingNoteId ? { ...noteForm, id: editingNoteId } : n));
    } else {
      next = [...notesBank, { ...noteForm, id: uid() }];
    }
    setNotesBank(next);
    await saveNotes(next);
    setNoteForm(EMPTY_NOTE_FORM);
    setEditingNoteId(null);
  };
  const startEditNote = (n) => { setNoteForm({ ...n }); setEditingNoteId(n.id); };
  const removeNote = async (id) => {
    const next = notesBank.filter((n) => n.id !== id);
    setNotesBank(next);
    await saveNotes(next);
  };

  const addNotification = async () => {
    if (!notifForm.title.trim() || !notifForm.message.trim()) {
      alert("Please fill in a title and message.");
      return;
    }
    const next = [...notifications, { ...notifForm, id: uid(), createdAt: new Date().toISOString() }];
    setNotifications(next);
    await saveNotifications(next);
    setNotifForm(EMPTY_NOTIF_FORM);
  };
  const removeNotification = async (id) => {
    const next = notifications.filter((n) => n.id !== id);
    setNotifications(next);
    await saveNotifications(next);
  };

  const [bulkForm, setBulkForm] = useState({ program: "MDCAT", year: "", block: "", subject: "", topic: "", source: "Past Paper" });
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkStatus, setBulkStatus] = useState("idle");
  const [bulkProgressText, setBulkProgressText] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkSummary, setBulkSummary] = useState("");

  const bulkClassificationReady =
    bulkForm.program === "MBBS"
      ? !!(bulkForm.year && bulkForm.block && bulkForm.subject)
      : !!(bulkForm.subject && (TOPIC_PROGRAMS.includes(bulkForm.program) ? bulkForm.topic : true));

  const runBulkExtract = async () => {
    if (!bulkFile) {
      setBulkError("Please choose a PDF file first.");
      return;
    }
    if (!bulkClassificationReady) {
      setBulkError("Please choose the Subject/Topic (or Year/Block/Subject for MBBS) before uploading.");
      return;
    }
    setBulkError("");
    setBulkResults([]);
    setBulkSummary("");
    try {
      setBulkStatus("extracting");
      setBulkProgressText("Reading PDF…");
      const fullText = await extractPdfText(bulkFile, (page, total) => {
        setBulkProgressText(`Reading PDF — page ${page} of ${total}…`);
      });
      if (!fullText.trim()) {
        setBulkError("Could not find any text in this PDF (it may be a scanned image). Try a text-based PDF.");
        setBulkStatus("error");
        return;
      }

      setBulkStatus("analyzing");
      setBulkProgressText("Parsing questions from the PDF text…");

      // Pure text parsing — no AI calls at all. Expects "Q1) ... A) B) C) D) Answer: Explanation:" format.
      const blocks = splitIntoQuestionBlocks(fullText);

      if (blocks.length === 0) {
        setBulkError(
          'This PDF doesn\'t match the expected format ("Q1) question / A) B) C) D) / Answer: / Explanation:"). No questions could be extracted.'
        );
        setBulkStatus("error");
        return;
      }

      const complete = [];
      const incomplete = [];

      blocks.forEach((block) => {
        const parsed = parseQuestionBlock(block);
        const entry = {
          question: parsed.question,
          options: parsed.options.length === 4 ? parsed.options : ["", "", "", ""],
          correct: parsed.correct !== null ? parsed.correct : 0,
          explanation: parsed.explanation,
          answer_source: parsed.complete ? "text" : "missing",
          include: true,
        };
        if (parsed.complete) {
          complete.push(entry);
        } else {
          incomplete.push(entry);
        }
      });

      const combined = [...complete, ...incomplete];

      if (combined.length === 0) {
        setBulkError("No MCQs could be extracted from this PDF. Please check the file and try again.");
        setBulkStatus("error");
        return;
      }

      setBulkSummary(
        incomplete.length > 0
          ? `${complete.length} question(s) parsed completely · ${incomplete.length} question(s) are missing Answer and/or Explanation — please fill those in manually below before saving`
          : `${complete.length} question(s) parsed completely — all good.`
      );
      setBulkResults(combined);
      setBulkStatus("done");
      setBulkProgressText("");
    } catch (e) {
      setBulkError(String(e?.message || e));
      setBulkStatus("error");
    }
  };

  const toggleBulkInclude = (idx) => {
    setBulkResults((prev) => prev.map((m, i) => (i === idx ? { ...m, include: !m.include } : m)));
  };

  const updateBulkResult = (idx, patch) => {
    setBulkResults((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  const saveBulkResults = async () => {
    const toAdd = bulkResults
      .filter((m) => m.include)
      .map((m) => ({
        id: uid(),
        program: bulkForm.program,
        year: bulkForm.program === "MBBS" ? bulkForm.year : "",
        block: bulkForm.program === "MBBS" ? bulkForm.block : "",
        subject: bulkForm.subject,
        topic: TOPIC_PROGRAMS.includes(bulkForm.program) ? bulkForm.topic : "",
        source: bulkForm.source,
        question: m.question,
        options: m.options,
        correct: m.correct,
        explanation: m.explanation,
      }));
    if (toAdd.length === 0) {
      setBulkError("No questions selected to add.");
      return;
    }
    const next = [...bank, ...toAdd];
    setBank(next);
    await saveBank(next);
    setBulkResults([]);
    setBulkSummary("");
    setBulkStatus("idle");
    setBulkFile(null);
    alert(`${toAdd.length} question(s) added to the bank.`);
    setTab("list");
  };

  const filtered = bank.filter((q) => {
    if (filterProgram !== "All" && q.program !== filterProgram) return false;
    if (search && !q.question.toLowerCase().includes(search.toLowerCase()) && !q.topic.toLowerCase().includes(search.toLowerCase()) && !q.subject.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const startAdd = () => { setForm(EMPTY_FORM); setEditingId(null); setTab("form"); };
  const startEdit = (q) => { setForm({ ...q, options: [...q.options] }); setEditingId(q.id); setTab("form"); };

  const remove = async (id) => {
    const next = bank.filter((q) => q.id !== id);
    setBank(next);
    await saveBank(next);
  };

  const submit = async () => {
    if (!form.question.trim() || form.options.some((o) => !o.trim())) {
      alert("Please fill in the question and all four options.");
      return;
    }
    if (form.program === "MBBS") {
      if (!form.year.trim() || !form.block.trim() || !form.subject.trim()) {
        alert("Please select Year, Block, and Subject for MBBS.");
        return;
      }
    } else {
      if (!form.subject.trim() || !form.topic.trim()) {
        alert("Please fill in the subject and topic.");
        return;
      }
    }
    let next;
    if (editingId) {
      next = bank.map((q) => (q.id === editingId ? { ...form, id: editingId } : q));
    } else {
      next = [...bank, { ...form, id: uid() }];
    }
    setBank(next);
    await saveBank(next);
    setTab("list");
  };

  const changePass = async () => {
    if (!newPass.trim()) return;
    await savePasscode(newPass.trim());
    setPassMsg("Passcode updated.");
    setNewPass("");
    setTimeout(() => setPassMsg(""), 2500);
  };

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <header className="border-b" style={{ borderColor: T.line }}>
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList size={20} />
            <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl">Admin — Question Bank</h1>
          </div>
          <button onClick={onExit} className="flex items-center gap-1 text-sm px-3 py-1.5" style={{ border: `1px solid ${T.ink}` }}>
            <LogOut size={14} /> Exit admin
          </button>
        </div>
        <div className="max-w-5xl mx-auto px-6 flex gap-1 pb-3">
          {[
            { k: "list", label: "All questions" },
            { k: "form", label: editingId ? "Edit question" : "Add question" },
            { k: "bulk", label: "Bulk Upload (PDF)" },
            { k: "notes", label: "Notes" },
            { k: "notifications", label: "Notifications" },
            { k: "settings", label: "Settings" },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => (t.k === "form" ? startAdd() : setTab(t.k))}
              className="px-3 py-1.5 text-sm"
              style={{
                background: tab === t.k ? T.ink : "transparent",
                color: tab === t.k ? T.paper : T.inkSoft,
                border: `1px solid ${T.ink}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {tab === "list" && (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <div className="flex items-center gap-2 px-3 py-2" style={{ border: `1px solid ${T.line}`, background: T.card }}>
                <Search size={14} style={{ color: T.inkSoft }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search question, subject, or topic"
                  className="outline-none text-sm"
                  style={{ background: "transparent" }}
                />
              </div>
              <select
                value={filterProgram}
                onChange={(e) => setFilterProgram(e.target.value)}
                className="px-3 py-2 text-sm"
                style={{ border: `1px solid ${T.line}`, background: T.card }}
              >
                <option>All</option>
                {PROGRAMS.map((p) => <option key={p.key}>{p.key}</option>)}
              </select>
              <button onClick={startAdd} className="ml-auto flex items-center gap-1 px-4 py-2 text-sm" style={{ background: T.ink, color: T.paper }}>
                <Plus size={16} /> Add MCQ
              </button>
            </div>

            <div className="text-sm mb-3" style={{ color: T.inkSoft }}>{filtered.length} question(s)</div>

            <div className="space-y-2">
              {filtered.map((q) => (
                <div key={q.id} className="p-4 flex items-start justify-between gap-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                  <div>
                    <div className="text-xs tracking-widest uppercase mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.amber }}>
                      {q.program} · {q.year ? `${q.year} · ` : ""}{q.block ? `${q.block} · ` : ""}{q.subject} · {q.topic ? `${q.topic} · ` : ""}{q.source}
                    </div>
                    <div style={{ fontFamily: "'Source Serif 4', serif" }}>{q.question}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => startEdit(q)} className="p-2" style={{ border: `1px solid ${T.ink}` }}><Pencil size={14} /></button>
                    <button onClick={() => remove(q.id)} className="p-2" style={{ border: `1px solid ${T.rose}`, color: T.rose }}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="p-6 text-sm text-center" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
                  No questions match. Try clearing filters or add a new one.
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "form" && (
          <div className="max-w-2xl">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Program</label>
                <select
                  value={form.program}
                  onChange={(e) => setForm({ ...form, program: e.target.value, year: "", block: "", subject: "", topic: "" })}
                  className="w-full px-3 py-2"
                  style={{ border: `1px solid ${T.line}`, background: T.card }}
                >
                  {PROGRAMS.map((p) => <option key={p.key}>{p.key}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Source</label>
                <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Practice or Past Paper 2024" className="w-full px-3 py-2" style={{ border: `1px solid ${T.line}`, background: T.card }} />
              </div>
            </div>

            {TOPIC_PROGRAMS.includes(form.program) && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Subject</label>
                  <select
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value, topic: "" })}
                    className="w-full px-3 py-2"
                    style={{ border: `1px solid ${T.line}`, background: T.card }}
                  >
                    <option value="">Select subject…</option>
                    {Object.keys(MDCAT_TOPICS).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Topic</label>
                  <select
                    value={form.topic}
                    onChange={(e) => setForm({ ...form, topic: e.target.value })}
                    disabled={!form.subject}
                    className="w-full px-3 py-2"
                    style={{ border: `1px solid ${T.line}`, background: T.card }}
                  >
                    <option value="">{form.subject ? "Select topic…" : "Choose subject first"}</option>
                    {(MDCAT_TOPICS[form.subject] || []).map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            )}

            {form.program === "MBBS" && (
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Year</label>
                  <select
                    value={form.year}
                    onChange={(e) => setForm({ ...form, year: e.target.value, block: "", subject: "" })}
                    className="w-full px-3 py-2"
                    style={{ border: `1px solid ${T.line}`, background: T.card }}
                  >
                    <option value="">Select year…</option>
                    {Object.keys(MBBS_STRUCTURE).map((y) => <option key={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Block</label>
                  <select
                    value={form.block}
                    onChange={(e) => setForm({ ...form, block: e.target.value, subject: "" })}
                    disabled={!form.year}
                    className="w-full px-3 py-2"
                    style={{ border: `1px solid ${T.line}`, background: T.card }}
                  >
                    <option value="">{form.year ? "Select block…" : "Choose year first"}</option>
                    {Object.keys(MBBS_STRUCTURE[form.year] || {}).map((b) => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Subject</label>
                  <select
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    disabled={!form.block}
                    className="w-full px-3 py-2"
                    style={{ border: `1px solid ${T.line}`, background: T.card }}
                  >
                    <option value="">{form.block ? "Select subject…" : "Choose block first"}</option>
                    {((MBBS_STRUCTURE[form.year] || {})[form.block] || []).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}

            {!TOPIC_PROGRAMS.includes(form.program) && form.program !== "MBBS" && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Subject</label>
                  <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Fundamentals" className="w-full px-3 py-2" style={{ border: `1px solid ${T.line}`, background: T.card }} />
                </div>
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Topic</label>
                  <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Vital Signs" className="w-full px-3 py-2" style={{ border: `1px solid ${T.line}`, background: T.card }} />
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Question</label>
              <textarea value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} rows={3} className="w-full px-3 py-2" style={{ border: `1px solid ${T.line}`, background: T.card }} />
            </div>
            <div className="mb-4 space-y-2">
              <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Options — select the correct one</label>
              {form.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Bubble
                    letter={["A", "B", "C", "D"][i]}
                    state={form.correct === i ? "correct" : "idle"}
                    onClick={() => setForm({ ...form, correct: i })}
                  />
                  <input
                    value={opt}
                    onChange={(e) => {
                      const o = [...form.options];
                      o[i] = e.target.value;
                      setForm({ ...form, options: o });
                    }}
                    className="flex-1 px-3 py-2"
                    style={{ border: `1px solid ${T.line}`, background: T.card }}
                  />
                </div>
              ))}
            </div>
            <div className="mb-6">
              <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Explanation (optional)</label>
              <textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} rows={2} className="w-full px-3 py-2" style={{ border: `1px solid ${T.line}`, background: T.card }} />
            </div>
            <div className="flex gap-3">
              <button onClick={submit} className="flex items-center gap-2 px-5 py-2 text-sm" style={{ background: T.ink, color: T.paper }}>
                <Save size={16} /> {editingId ? "Save changes" : "Add to bank"}
              </button>
              <button onClick={() => setTab("list")} className="px-5 py-2 text-sm" style={{ border: `1px solid ${T.ink}` }}>Cancel</button>
            </div>
          </div>
        )}

        {tab === "bulk" && (
          <div className="max-w-3xl">
            <p className="text-sm mb-5" style={{ color: T.inkSoft }}>
              Upload a PDF of MCQs (e.g. a past paper) formatted as <code style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Q1) question / A) B) C) D) / Answer: / Explanation:</code>.
              Everything is extracted directly from the text — no AI is used. Questions missing an Answer or
              Explanation will be flagged so you can fill them in yourself before saving.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Program</label>
                <select
                  value={bulkForm.program}
                  onChange={(e) => setBulkForm({ program: e.target.value, year: "", block: "", subject: "", topic: "", source: bulkForm.source })}
                  className="w-full px-3 py-2"
                  style={{ border: `1px solid ${T.line}`, background: T.card }}
                >
                  {PROGRAMS.map((p) => <option key={p.key}>{p.key}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Source label</label>
                <input value={bulkForm.source} onChange={(e) => setBulkForm({ ...bulkForm, source: e.target.value })} placeholder="e.g. Past Paper 2024" className="w-full px-3 py-2" style={{ border: `1px solid ${T.line}`, background: T.card }} />
              </div>
            </div>

            {TOPIC_PROGRAMS.includes(bulkForm.program) && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Subject</label>
                  <select
                    value={bulkForm.subject}
                    onChange={(e) => setBulkForm({ ...bulkForm, subject: e.target.value, topic: "" })}
                    className="w-full px-3 py-2"
                    style={{ border: `1px solid ${T.line}`, background: T.card }}
                  >
                    <option value="">Select subject…</option>
                    {Object.keys(MDCAT_TOPICS).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Topic</label>
                  <select
                    value={bulkForm.topic}
                    onChange={(e) => setBulkForm({ ...bulkForm, topic: e.target.value })}
                    disabled={!bulkForm.subject}
                    className="w-full px-3 py-2"
                    style={{ border: `1px solid ${T.line}`, background: T.card }}
                  >
                    <option value="">{bulkForm.subject ? "Select topic…" : "Choose subject first"}</option>
                    {(MDCAT_TOPICS[bulkForm.subject] || []).map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            )}

            {bulkForm.program === "MBBS" && (
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Year</label>
                  <select
                    value={bulkForm.year}
                    onChange={(e) => setBulkForm({ ...bulkForm, year: e.target.value, block: "", subject: "" })}
                    className="w-full px-3 py-2"
                    style={{ border: `1px solid ${T.line}`, background: T.card }}
                  >
                    <option value="">Select year…</option>
                    {Object.keys(MBBS_STRUCTURE).map((y) => <option key={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Block</label>
                  <select
                    value={bulkForm.block}
                    onChange={(e) => setBulkForm({ ...bulkForm, block: e.target.value, subject: "" })}
                    disabled={!bulkForm.year}
                    className="w-full px-3 py-2"
                    style={{ border: `1px solid ${T.line}`, background: T.card }}
                  >
                    <option value="">{bulkForm.year ? "Select block…" : "Choose year first"}</option>
                    {Object.keys(MBBS_STRUCTURE[bulkForm.year] || {}).map((b) => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Subject</label>
                  <select
                    value={bulkForm.subject}
                    onChange={(e) => setBulkForm({ ...bulkForm, subject: e.target.value })}
                    disabled={!bulkForm.block}
                    className="w-full px-3 py-2"
                    style={{ border: `1px solid ${T.line}`, background: T.card }}
                  >
                    <option value="">{bulkForm.block ? "Select subject…" : "Choose block first"}</option>
                    {((MBBS_STRUCTURE[bulkForm.year] || {})[bulkForm.block] || []).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}

            {!TOPIC_PROGRAMS.includes(bulkForm.program) && bulkForm.program !== "MBBS" && (
              <div className="mb-4">
                <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Subject</label>
                <input value={bulkForm.subject} onChange={(e) => setBulkForm({ ...bulkForm, subject: e.target.value })} placeholder="e.g. Fundamentals" className="w-full px-3 py-2" style={{ border: `1px solid ${T.line}`, background: T.card }} />
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>PDF file</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
            </div>

            <button
              onClick={runBulkExtract}
              disabled={bulkStatus === "extracting" || bulkStatus === "analyzing"}
              className="flex items-center gap-2 px-5 py-2 text-sm mb-4"
              style={{ background: T.ink, color: T.paper, opacity: bulkStatus === "extracting" || bulkStatus === "analyzing" ? 0.6 : 1 }}
            >
              <Plus size={16} />
              {bulkStatus === "extracting" || bulkStatus === "analyzing" ? "Working…" : "Extract Questions from PDF"}
            </button>

            {(bulkStatus === "extracting" || bulkStatus === "analyzing") && (
              <div className="text-sm mb-4" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
                {bulkProgressText}
              </div>
            )}

            {bulkError && (
              <div className="p-3 text-sm mb-4" style={{ border: `1px solid ${T.rose}`, color: T.rose, background: T.roseSoft }}>
                {bulkError}
              </div>
            )}

            {bulkResults.length > 0 && (
              <div>
                {bulkSummary && (
                  <div
                    className="p-3 text-sm mb-3"
                    style={{ background: T.emeraldSoft, color: T.emerald, fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    {bulkSummary}
                  </div>
                )}
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm" style={{ color: T.inkSoft }}>
                    {bulkResults.length} question(s) found — {bulkResults.filter((m) => m.include).length} selected. Review, then save.
                  </div>
                  <button onClick={saveBulkResults} className="flex items-center gap-2 px-4 py-2 text-sm" style={{ background: T.emerald, color: "#fff" }}>
                    <Save size={16} /> Add selected to bank
                  </button>
                </div>
                <div className="space-y-3">
                  {bulkResults.map((m, idx) => (
                    <div key={idx} className="p-4" style={{ background: T.card, border: `1px solid ${T.line}`, opacity: m.include ? 1 : 0.5 }}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={m.include} onChange={() => toggleBulkInclude(idx)} />
                          Include
                        </label>
                        {m.answer_source === "missing" && (
                          <span
                            className="text-xs px-2 py-0.5 shrink-0"
                            style={{ background: T.roseSoft, color: T.rose, fontFamily: "'IBM Plex Mono', monospace" }}
                          >
                            Answer/Explanation missing — fill in manually
                          </span>
                        )}
                      </div>
                      <textarea
                        value={m.question}
                        onChange={(e) => updateBulkResult(idx, { question: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 mb-2"
                        style={{ border: `1px solid ${T.line}`, background: T.card, fontFamily: "'Source Serif 4', serif" }}
                      />
                      <div className="space-y-1 mb-2">
                        {m.options.map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-3">
                            <Bubble
                              letter={["A", "B", "C", "D"][oi]}
                              state={m.correct === oi ? "correct" : "idle"}
                              onClick={() => updateBulkResult(idx, { correct: oi })}
                            />
                            <input
                              value={opt}
                              onChange={(e) => {
                                const opts = [...m.options];
                                opts[oi] = e.target.value;
                                updateBulkResult(idx, { options: opts });
                              }}
                              className="flex-1 px-3 py-1.5 text-sm"
                              style={{ border: `1px solid ${T.line}`, background: T.card }}
                            />
                          </div>
                        ))}
                      </div>
                      <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Explanation</label>
                      <textarea
                        value={m.explanation}
                        onChange={(e) => updateBulkResult(idx, { explanation: e.target.value })}
                        rows={2}
                        placeholder="Add an explanation…"
                        className="w-full px-3 py-2 text-sm"
                        style={{ border: `1px solid ${T.line}`, background: T.card }}
                      />
                    </div>
                  ))}
                </div>
                <button onClick={saveBulkResults} className="flex items-center gap-2 px-4 py-2 text-sm mt-4" style={{ background: T.emerald, color: "#fff" }}>
                  <Save size={16} /> Add selected to bank
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "notes" && (
          <div className="max-w-3xl">
            <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-xl mb-4">
              {editingNoteId ? "Edit note" : "Add a note"}
            </h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Program</label>
                <select
                  value={noteForm.program}
                  onChange={(e) => setNoteForm({ ...noteForm, program: e.target.value, subject: "" })}
                  className="w-full px-3 py-2"
                  style={{ border: `1px solid ${T.line}`, background: T.card }}
                >
                  {PROGRAMS.map((p) => <option key={p.key}>{p.key}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Subject</label>
                {TOPIC_PROGRAMS.includes(noteForm.program) ? (
                  <select
                    value={noteForm.subject}
                    onChange={(e) => setNoteForm({ ...noteForm, subject: e.target.value })}
                    className="w-full px-3 py-2"
                    style={{ border: `1px solid ${T.line}`, background: T.card }}
                  >
                    <option value="">Select subject…</option>
                    {Object.keys(MDCAT_TOPICS).map((s) => <option key={s}>{s}</option>)}
                  </select>
                ) : (
                  <input
                    value={noteForm.subject}
                    onChange={(e) => setNoteForm({ ...noteForm, subject: e.target.value })}
                    placeholder="e.g. Anatomy"
                    className="w-full px-3 py-2"
                    style={{ border: `1px solid ${T.line}`, background: T.card }}
                  />
                )}
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Title</label>
              <input
                value={noteForm.title}
                onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                placeholder="e.g. Cell Structure — quick revision"
                className="w-full px-3 py-2"
                style={{ border: `1px solid ${T.line}`, background: T.card }}
              />
            </div>
            <div className="mb-4">
              <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Content</label>
              <textarea
                value={noteForm.content}
                onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })}
                rows={8}
                placeholder="Write or paste the note content here…"
                className="w-full px-3 py-2"
                style={{ border: `1px solid ${T.line}`, background: T.card }}
              />
            </div>
            <div className="flex gap-3 mb-8">
              <button onClick={saveNoteForm} className="flex items-center gap-2 px-5 py-2 text-sm" style={{ background: T.ink, color: T.paper }}>
                <Save size={16} /> {editingNoteId ? "Save changes" : "Add note"}
              </button>
              {editingNoteId && (
                <button
                  onClick={() => { setNoteForm(EMPTY_NOTE_FORM); setEditingNoteId(null); }}
                  className="px-5 py-2 text-sm"
                  style={{ border: `1px solid ${T.ink}` }}
                >
                  Cancel edit
                </button>
              )}
            </div>

            <h3 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-lg mb-3">
              All notes ({notesBank.length})
            </h3>
            <div className="space-y-2">
              {notesBank.map((n) => (
                <div key={n.id} className="p-4 flex items-start justify-between gap-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                  <div>
                    <div className="text-xs tracking-widest uppercase mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.amber }}>
                      {n.program} · {n.subject}
                    </div>
                    <div style={{ fontFamily: "'Source Serif 4', serif" }}>{n.title}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => startEditNote(n)} className="p-2" style={{ border: `1px solid ${T.ink}` }}><Pencil size={14} /></button>
                    <button onClick={() => removeNote(n.id)} className="p-2" style={{ border: `1px solid ${T.rose}`, color: T.rose }}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {notesBank.length === 0 && (
                <div className="p-6 text-sm text-center" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
                  No notes added yet.
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "notifications" && (
          <div className="max-w-2xl">
            <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-xl mb-4">Send a notification</h2>
            <p className="text-sm mb-4" style={{ color: T.inkSoft }}>
              Notifications go out to every student, regardless of which course they picked at signup.
            </p>
            <div className="mb-3">
              <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Title</label>
              <input
                value={notifForm.title}
                onChange={(e) => setNotifForm({ ...notifForm, title: e.target.value })}
                placeholder="e.g. New Past Papers added"
                className="w-full px-3 py-2"
                style={{ border: `1px solid ${T.line}`, background: T.card }}
              />
            </div>
            <div className="mb-4">
              <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Message</label>
              <textarea
                value={notifForm.message}
                onChange={(e) => setNotifForm({ ...notifForm, message: e.target.value })}
                rows={3}
                className="w-full px-3 py-2"
                style={{ border: `1px solid ${T.line}`, background: T.card }}
              />
            </div>
            <button onClick={addNotification} className="flex items-center gap-2 px-5 py-2 text-sm mb-8" style={{ background: T.ink, color: T.paper }}>
              <Plus size={16} /> Send notification
            </button>

            <h3 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-lg mb-3">
              Sent notifications ({notifications.length})
            </h3>
            <div className="space-y-2">
              {[...notifications].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).map((n) => (
                <div key={n.id} className="p-4 flex items-start justify-between gap-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                  <div>
                    <div className="text-xs mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
                      {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                    </div>
                    <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{n.title}</div>
                    <div className="text-sm" style={{ color: T.inkSoft }}>{n.message}</div>
                  </div>
                  <button onClick={() => removeNotification(n.id)} className="p-2 shrink-0" style={{ border: `1px solid ${T.rose}`, color: T.rose }}><Trash2 size={14} /></button>
                </div>
              ))}
              {notifications.length === 0 && (
                <div className="p-6 text-sm text-center" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
                  No notifications sent yet.
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="max-w-sm">
            <div className="flex items-center gap-2 mb-4">
              <Settings size={18} />
              <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }} className="text-xl">Change admin passcode</h2>
            </div>
            <input
              type="text"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="New passcode"
              className="w-full px-3 py-2 mb-3"
              style={{ border: `1px solid ${T.line}`, background: T.card, fontFamily: "'IBM Plex Mono', monospace" }}
            />
            <button onClick={changePass} className="px-5 py-2 text-sm" style={{ background: T.ink, color: T.paper }}>Update passcode</button>
            {passMsg && <div className="text-sm mt-2" style={{ color: T.emerald }}>{passMsg}</div>}
          </div>
        )}
      </main>
    </div>
  );
}

// ---------- Root ----------
export default function App() {
  const [loading, setLoading] = useState(true);
  const [bank, setBank] = useState([]);
  const [notesBank, setNotesBank] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [stats, setStats] = useState(null);
  const [view, setView] = useState("home");
  const [program, setProgram] = useState(null);
  const [year, setYear] = useState(null);
  const [block, setBlock] = useState(null);
  const [topic, setTopic] = useState(null);
  const [subject, setSubject] = useState(null);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [result, setResult] = useState(null);
  const [quizMeta, setQuizMeta] = useState({ label: "", timeLimit: null, mode: "normal" });
  const isAdminURL = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("admin");

  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      const session = await getSession();
      setUser(session?.user || null);
      setAuthChecked(true);
    })();
    const sub = onAuthChange((session) => {
      setUser(session?.user || null);
    });
    return () => sub?.unsubscribe && sub.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdminURL && !user) return;
    (async () => {
      let b = await loadBank();
      if (!b) {
        b = SEED_MCQS;
        await saveBank(b);
      }
      setBank(b);
      const [n, notifs] = await Promise.all([loadNotes(), loadNotifications()]);
      setNotesBank(n);
      setNotifications(notifs);
      const emptyStats = { totalAttempted: 0, totalCorrect: 0, bySubject: {}, bookmarks: [], wrongIds: [], slowIds: [], streak: 0, lastChallengeDate: null, name: "" };
      if (user) {
        const st = await loadUserStats(user.id);
        const displayName = user?.user_metadata?.name || "";
        setStats(st ? { ...emptyStats, ...st, name: displayName } : { ...emptyStats, name: displayName });
      } else {
        setStats(emptyStats);
      }
      setLoading(false);
    })();
  }, [user, isAdminURL]);

  // Each student only sees the course they picked at signup. Accounts created before
  // this feature (or the ?admin= entry point) have no course set, so they still see all programs.
  const userCourse = !isAdminURL ? user?.user_metadata?.course || null : null;
  const visiblePrograms = userCourse ? PROGRAMS.filter((p) => p.key === userCourse) : PROGRAMS;

  const openProgram = (p) => {
    if (userCourse && p !== userCourse) return; // defensive: students can't jump into another course
    setProgram(p); setYear(null); setBlock(null); setTopic(null); setView("program");
  };
  const openYear = (y) => { setYear(y); setBlock(null); setView("year"); };
  const openBlock = (b) => { setBlock(b); setView("block"); };
  const openSubject = (s) => {
    setSubject(s);
    if (TOPIC_PROGRAMS.includes(program)) {
      setTopic(null);
      setView("topic");
    } else {
      setView("subject");
    }
  };
  const openTopic = (t) => { setTopic(t); setView("subject"); };
  const startQuiz = (qs, opts = {}) => {
    setQuizQuestions(qs);
    setQuizMeta({ label: subject, timeLimit: opts.timeLimit || null, mode: "normal" });
    setView("quiz");
  };

  const todayStr = () => new Date().toISOString().slice(0, 10);
  // Deterministic shuffle so everyone gets the same "random" order for a given day.
  const seededShuffle = (arr, seed) => {
    let s = 0;
    for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) >>> 0;
      const j = s % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const startSpecialQuiz = (qs, label, mode, emptyMsg) => {
    if (!qs.length) {
      alert(emptyMsg);
      return;
    }
    setQuizQuestions(qs);
    setQuizMeta({ label, timeLimit: null, mode });
    setView("quiz");
  };

  const openDailyChallenge = () => {
    const picked = seededShuffle(bank, todayStr()).slice(0, Math.min(10, bank.length));
    startSpecialQuiz(picked, "Daily Challenge", "daily", "No questions available yet — check back once the bank has some MCQs.");
  };

  const openReviewMistakes = () => {
    const ids = new Set(stats?.wrongIds || []);
    const qs = bank.filter((q) => ids.has(q.id));
    startSpecialQuiz(qs, "Weak Topics", "weak", "No mistakes to review yet — keep practicing and missed questions will show up here!");
  };

  const openSaved = () => {
    // Saved = manually bookmarked + auto-saved (answered wrong, or took over 1 minute)
    const ids = new Set([
      ...(stats?.bookmarks || []),
      ...(stats?.wrongIds || []),
      ...(stats?.slowIds || []),
    ]);
    const qs = bank.filter((q) => ids.has(q.id));
    startSpecialQuiz(qs, "Saved Questions", "saved", "Nothing saved yet. Questions you bookmark, get wrong, or spend over a minute on will show up here automatically.");
  };

  const toggleBookmark = async (qid) => {
    const current = stats?.bookmarks || [];
    const next = current.includes(qid) ? current.filter((id) => id !== qid) : [...current, qid];
    const nextStats = { ...stats, bookmarks: next, name: user?.user_metadata?.name || stats?.name || "" };
    setStats(nextStats);
    if (user) await saveUserStats(user.id, nextStats);
  };

  const finishQuiz = async (res) => {
    setResult(res);

    const SLOW_THRESHOLD_SECONDS = 60;
    const wrongSet = new Set(stats?.wrongIds || []);
    const slowSet = new Set(stats?.slowIds || []);
    res.questions.forEach((qq, i) => {
      if (res.answers[i] === qq.correct) wrongSet.delete(qq.id);
      else wrongSet.add(qq.id);

      const elapsed = res.answerTimes ? res.answerTimes[i] : null;
      if (elapsed !== null && elapsed !== undefined && elapsed > SLOW_THRESHOLD_SECONDS) {
        slowSet.add(qq.id);
      } else if (elapsed !== null && elapsed !== undefined) {
        // Answered quickly this time — no longer flag it as "slow"
        slowSet.delete(qq.id);
      }
    });

    let streak = stats?.streak || 0;
    let lastChallengeDate = stats?.lastChallengeDate || null;
    if (quizMeta.mode === "daily") {
      const today = todayStr();
      if (lastChallengeDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        streak = lastChallengeDate === yesterday ? streak + 1 : 1;
        lastChallengeDate = today;
      }
    }

    const next = {
      totalAttempted: (stats?.totalAttempted || 0) + res.questions.length,
      totalCorrect: (stats?.totalCorrect || 0) + res.correct,
      bySubject: { ...(stats?.bySubject || {}) },
      bookmarks: stats?.bookmarks || [],
      wrongIds: Array.from(wrongSet),
      slowIds: Array.from(slowSet),
      streak,
      lastChallengeDate,
      name: user?.user_metadata?.name || stats?.name || "",
    };
    const statsKey =
      quizMeta.mode !== "normal"
        ? quizMeta.label
        : block ? `${year} | ${block} | ${subject}` : year ? `${year} - ${subject}` : topic ? `${subject} - ${topic}` : subject;
    next.bySubject[statsKey] = {
      attempted: (next.bySubject[statsKey]?.attempted || 0) + res.questions.length,
      correct: (next.bySubject[statsKey]?.correct || 0) + res.correct,
    };
    setStats(next);
    if (user) await saveUserStats(user.id, next);
    setView("results");
  };

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    setStats(null);
    setView("home");
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: T.paper, color: T.ink }}>
        <FontLoader />
        <div style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Loading…</div>
      </div>
    );
  }

  if (!isAdminURL && !user) {
    return <AuthScreen onAuthed={(session) => setUser(session.user)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: T.paper, color: T.ink }}>
        <FontLoader />
        <div style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Loading question bank…</div>
      </div>
    );
  }

  if (view === "home") {
    return (
      <Home
        bank={bank}
        programs={visiblePrograms}
        onOpenProgram={openProgram}
        onOpenAdmin={() => setView("admin-gate")}
        stats={stats}
        showAdminEntry={isAdminURL}
        userEmail={user?.email || ""}
        userName={user?.user_metadata?.name || ""}
        userCourse={userCourse}
        onSignOut={handleSignOut}
        onDailyChallenge={openDailyChallenge}
        onReviewMistakes={openReviewMistakes}
        onOpenSaved={openSaved}
        onOpenLeaderboard={() => setView("leaderboard")}
        notesBank={notesBank}
        notifications={notifications}
      />
    );
  }
  if (view === "leaderboard") {
    return <LeaderboardView onBack={() => setView("home")} currentUserName={user?.user_metadata?.name || ""} />;
  }
  if (view === "admin-gate") {
    return <AdminGate onUnlock={() => setView("admin")} onBack={() => setView("home")} />;
  }
  if (view === "admin") {
    return (
      <AdminPanel
        bank={bank}
        setBank={setBank}
        notesBank={notesBank}
        setNotesBank={setNotesBank}
        notifications={notifications}
        setNotifications={setNotifications}
        onExit={() => setView("home")}
      />
    );
  }
  if (view === "program") {
    return (
      <ProgramPage
        program={program}
        bank={bank}
        onBack={() => setView("home")}
        onOpenSubject={openSubject}
        onOpenYear={openYear}
      />
    );
  }
  if (view === "year") {
    return (
      <YearPage
        program={program}
        year={year}
        bank={bank}
        onBack={() => setView("program")}
        onOpenBlock={openBlock}
      />
    );
  }
  if (view === "block") {
    return (
      <BlockPage
        program={program}
        year={year}
        block={block}
        bank={bank}
        onBack={() => setView("year")}
        onOpenSubject={openSubject}
      />
    );
  }
  if (view === "topic") {
    return (
      <TopicPage
        program={program}
        subject={subject}
        bank={bank}
        onBack={() => setView("program")}
        onOpenTopic={openTopic}
      />
    );
  }
  if (view === "subject") {
    return (
      <SubjectSetup
        program={program}
        year={program === "MBBS" ? year : null}
        block={program === "MBBS" ? block : null}
        topic={TOPIC_PROGRAMS.includes(program) ? topic : null}
        subject={subject}
        bank={bank}
        onBack={() => setView(program === "MBBS" ? "block" : TOPIC_PROGRAMS.includes(program) ? "topic" : "program")}
        onStart={startQuiz}
      />
    );
  }
  if (view === "quiz") {
    return (
      <Quiz
        questions={quizQuestions}
        subject={quizMeta.mode === "normal" ? subject : quizMeta.label}
        timeLimit={quizMeta.timeLimit}
        bookmarks={stats?.bookmarks || []}
        onToggleBookmark={toggleBookmark}
        onFinish={finishQuiz}
        onExit={() => setView(quizMeta.mode === "normal" ? "subject" : "home")}
      />
    );
  }
  if (view === "results") {
    return (
      <Results
        result={result}
        subject={quizMeta.mode === "normal" ? subject : quizMeta.label}
        bookmarks={stats?.bookmarks || []}
        onToggleBookmark={toggleBookmark}
        onRetry={() => setView(quizMeta.mode === "normal" ? "subject" : "home")}
        onHome={() => setView("home")}
      />
    );
  }
  return null;
}
