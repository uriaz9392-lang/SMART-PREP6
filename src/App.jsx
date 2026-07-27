import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dna, FlaskConical, Atom, BookOpen, Lock, Unlock, Plus, Pencil, Trash2,
  ChevronLeft, ChevronRight, Check, X, RotateCcw, Search, Settings,
  ClipboardList, GraduationCap, ShieldCheck, ArrowLeft, Save, LogOut
} from "lucide-react";
import { loadSharedData, saveSharedData, loadLocalStats, saveLocalStats } from "./supabase.js";

// ---------- Design tokens ----------
// ink: deep navy-charcoal (text/lines), paper: pale sage-paper bg,
// emerald: correct/positive, rose: incorrect, amber: review/pending
const T = {
  paper: "#EFEEE4",
  paperDark: "#E4E1D2",
  ink: "#1C2B3A",
  inkSoft: "#4A5A68",
  line: "#CEC9B6",
  emerald: "#1F7A5C",
  emeraldSoft: "#DCEBE3",
  rose: "#B8493F",
  roseSoft: "#F3E1DD",
  amber: "#B5822A",
  amberSoft: "#F1E4CB",
};

const SUBJECTS = [
  { key: "Biology", icon: Dna, code: "BIO" },
  { key: "Chemistry", icon: FlaskConical, code: "CHM" },
  { key: "Physics", icon: Atom, code: "PHY" },
  { key: "English", icon: BookOpen, code: "ENG" },
];

const DEFAULT_PASSCODE = "mdcat2026";

const SEED_MCQS = [
  { id: "s1", subject: "Biology", topic: "Cell Biology", source: "Practice",
    question: "Which organelle is primarily responsible for ATP synthesis in eukaryotic cells?",
    options: ["Golgi apparatus", "Mitochondrion", "Lysosome", "Ribosome"],
    correct: 1,
    explanation: "Mitochondria carry out oxidative phosphorylation, producing most of the cell's ATP." },
  { id: "s2", subject: "Biology", topic: "Genetics", source: "Past Paper 2023",
    question: "A cross between two heterozygous pea plants (Tt x Tt) for tallness produces what phenotypic ratio?",
    options: ["1:2:1", "3:1", "9:3:3:1", "1:1"],
    correct: 1,
    explanation: "A monohybrid cross between two heterozygotes gives a classic 3:1 phenotypic ratio (tall:short)." },
  { id: "s3", subject: "Chemistry", topic: "Atomic Structure", source: "Practice",
    question: "What is the maximum number of electrons that can occupy the 3d subshell?",
    options: ["2", "6", "10", "14"],
    correct: 2,
    explanation: "The d subshell has 5 orbitals, each holding 2 electrons, giving a maximum of 10." },
  { id: "s4", subject: "Chemistry", topic: "Chemical Bonding", source: "Past Paper 2022",
    question: "Which type of hybridization is present in the carbon atoms of ethyne (C2H2)?",
    options: ["sp3", "sp2", "sp", "dsp2"],
    correct: 2,
    explanation: "Each carbon in ethyne forms a triple bond, requiring sp hybridization (linear geometry)." },
  { id: "s5", subject: "Physics", topic: "Kinematics", source: "Practice",
    question: "A body starts from rest and accelerates uniformly at 2 m/s^2. What is its velocity after 5 seconds?",
    options: ["5 m/s", "10 m/s", "15 m/s", "20 m/s"],
    correct: 1,
    explanation: "v = u + at = 0 + (2)(5) = 10 m/s." },
  { id: "s6", subject: "Physics", topic: "Electrostatics", source: "Past Paper 2023",
    question: "Coulomb's law states that the electrostatic force between two charges is:",
    options: [
      "Directly proportional to the square of the distance",
      "Inversely proportional to the square of the distance",
      "Independent of distance",
      "Inversely proportional to the charges",
    ],
    correct: 1,
    explanation: "F = kq1q2/r^2, so the force is inversely proportional to the square of the separation." },
  { id: "s7", subject: "English", topic: "Grammar", source: "Practice",
    question: "Choose the correctly punctuated sentence.",
    options: [
      "Its raining, so bring your umbrella.",
      "It's raining, so bring your umbrella.",
      "Its raining so, bring your umbrella.",
      "It's raining so bring, your umbrella.",
    ],
    correct: 1,
    explanation: "\"It's\" is the contraction for \"it is\"; the comma correctly separates the two clauses." },
  { id: "s8", subject: "English", topic: "Vocabulary", source: "Past Paper 2022",
    question: "Choose the word closest in meaning to 'meticulous'.",
    options: ["Careless", "Painstaking", "Hasty", "Indifferent"],
    correct: 1,
    explanation: "'Meticulous' means showing great attention to detail; 'painstaking' is the closest synonym." },
];

// ---------- Storage helpers (Firestore = shared, localStorage = personal) ----------
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
async function loadStats() {
  return loadLocalStats();
}
async function saveStats(stats) {
  saveLocalStats(stats);
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
  // state: 'idle' | 'selected' | 'correct' | 'incorrect' | 'reveal-correct'
  let cls = "border-2 flex items-center justify-center transition-all duration-150 select-none";
  let style = { width: 34, height: 34, borderRadius: "50%", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 };
  if (state === "idle") {
    style.borderColor = T.inkSoft;
    style.color = T.inkSoft;
    style.background = "transparent";
  } else if (state === "selected") {
    style.borderColor = T.ink;
    style.background = T.ink;
    style.color = T.paper;
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

// ---------- Home ----------
function Home({ bank, onOpenSubject, onOpenAdmin, stats }) {
  const counts = useMemo(() => {
    const c = {};
    SUBJECTS.forEach((s) => (c[s.key] = bank.filter((q) => q.subject === s.key).length));
    return c;
  }, [bank]);

  const total = bank.length;

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <header className="border-b" style={{ borderColor: T.line }}>
        <div className="max-w-5xl mx-auto px-6 py-8 flex items-start justify-between">
          <div>
            <div
              className="inline-block px-2 py-0.5 text-xs tracking-widest mb-3"
              style={{ fontFamily: "'IBM Plex Mono', monospace", border: `1px solid ${T.ink}`, letterSpacing: "0.15em" }}
            >
              ROLL NO. — MDCAT PREP
            </div>
            <h1
              style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }}
              className="text-4xl sm:text-5xl leading-tight"
            >
              Medical &amp; Dental
              <br />
              College Admission Test
            </h1>
            <p className="mt-3 max-w-md" style={{ color: T.inkSoft }}>
              Practice MCQs and past papers across Biology, Chemistry, Physics, and English — marked like the real answer sheet.
            </p>
          </div>
          <button
            onClick={onOpenAdmin}
            className="flex items-center gap-2 px-4 py-2 text-sm shrink-0"
            style={{ border: `1px solid ${T.ink}`, fontFamily: "'IBM Plex Mono', monospace" }}
          >
            <Lock size={14} /> Admin
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm tracking-widest uppercase" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
            Subjects — {total} question{total === 1 ? "" : "s"} in bank
          </h2>
          {stats && stats.totalAttempted > 0 && (
            <div className="text-sm" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
              Your accuracy so far: {Math.round((stats.totalCorrect / stats.totalAttempted) * 100)}%
              ({stats.totalCorrect}/{stats.totalAttempted})
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SUBJECTS.map((s) => {
            const Icon = s.icon;
            const n = counts[s.key] || 0;
            return (
              <button
                key={s.key}
                disabled={n === 0}
                onClick={() => onOpenSubject(s.key)}
                className="text-left p-6 flex items-start gap-4 transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
                style={{ background: "#fff", border: `1px solid ${T.line}` }}
              >
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 48, height: 48, border: `1px solid ${T.ink}`, borderRadius: "50%" }}
                >
                  <Icon size={22} style={{ color: T.ink }} />
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }} className="text-xl">
                      {s.key}
                    </span>
                    <span
                      style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}
                      className="text-xs"
                    >
                      {s.code}
                    </span>
                  </div>
                  <div className="text-sm mt-1" style={{ color: T.inkSoft }}>
                    {n === 0 ? "No questions yet" : `${n} question${n === 1 ? "" : "s"} available`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {total === 0 && (
          <div className="mt-10 p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            The question bank is empty. Sign in as admin to add MCQs and past papers.
          </div>
        )}
      </main>
    </div>
  );
}

// ---------- Subject setup (choose source + count) ----------
function SubjectSetup({ subject, bank, onBack, onStart }) {
  const subjQuestions = bank.filter((q) => q.subject === subject);
  const sources = useMemo(() => {
    const set = new Set(subjQuestions.map((q) => q.source));
    return ["All", ...Array.from(set).sort()];
  }, [subjQuestions]);
  const [source, setSource] = useState("All");
  const [count, setCount] = useState(10);

  const filtered = source === "All" ? subjQuestions : subjQuestions.filter((q) => q.source === source);
  const maxCount = filtered.length;

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <button onClick={onBack} className="flex items-center gap-1 text-sm mb-6" style={{ color: T.inkSoft }}>
          <ArrowLeft size={16} /> Back to subjects
        </button>
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

        <button
          disabled={maxCount === 0}
          onClick={() => onStart(filtered.slice(0, Math.min(count, maxCount)))}
          className="px-6 py-3 text-sm tracking-wide disabled:opacity-40"
          style={{ background: T.ink, color: T.paper, fontFamily: "'IBM Plex Mono', monospace" }}
        >
          Begin practice →
        </button>
      </div>
    </div>
  );
}

// ---------- Quiz ----------
function Quiz({ questions, subject, onFinish, onExit }) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const q = questions[idx];
  const letters = ["A", "B", "C", "D"];

  const select = (i) => setAnswers((a) => ({ ...a, [idx]: i }));

  const finish = () => {
    let correct = 0;
    questions.forEach((qq, i) => {
      if (answers[i] === qq.correct) correct++;
    });
    onFinish({ questions, answers, correct });
  };

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onExit} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
            <ArrowLeft size={16} /> Exit
          </button>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm" >
            {subject} · Q{idx + 1} / {questions.length}
          </div>
        </div>

        <div className="h-1 w-full mb-8" style={{ background: T.line }}>
          <div className="h-1" style={{ width: `${((idx + 1) / questions.length) * 100}%`, background: T.emerald }} />
        </div>

        <div
          className="text-xs tracking-widest uppercase mb-3"
          style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.amber }}
        >
          {q.topic} · {q.source}
        </div>
        <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }} className="text-2xl mb-8 leading-snug">
          {q.question}
        </h2>

        <div className="space-y-3 mb-10">
          {q.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => select(i)}
              className="w-full flex items-center gap-4 p-3 text-left"
              style={{ border: `1px solid ${T.line}`, background: "#fff" }}
            >
              <Bubble letter={letters[i]} state={answers[idx] === i ? "selected" : "idle"} onClick={() => select(i)} />
              <span>{opt}</span>
            </button>
          ))}
        </div>

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
function Results({ result, subject, onRetry, onHome }) {
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
              <div key={i} className="p-4" style={{ border: `1px solid ${T.line}`, background: "#fff" }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div style={{ fontFamily: "'Source Serif 4', serif" }} className="font-semibold">
                    {i + 1}. {q.question}
                  </div>
                  {isCorrect ? (
                    <span className="shrink-0 px-2 py-0.5 text-xs" style={{ background: T.emeraldSoft, color: T.emerald }}>Correct</span>
                  ) : (
                    <span className="shrink-0 px-2 py-0.5 text-xs" style={{ background: T.roseSoft, color: T.rose }}>Incorrect</span>
                  )}
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
                  <div className="mt-3 text-sm p-3" style={{ background: T.amberSoft, color: T.ink }}>
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
            Back to subjects
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Admin ----------
const EMPTY_FORM = { subject: "Biology", topic: "", source: "Practice", question: "", options: ["", "", "", ""], correct: 0, explanation: "" };

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
          style={{ border: `1px solid ${T.ink}`, background: "#fff", fontFamily: "'IBM Plex Mono', monospace" }}
        />
        {error && <div className="text-sm mb-3" style={{ color: T.rose }}>{error}</div>}
        <button onClick={submit} className="w-full py-3 text-sm mt-2" style={{ background: T.ink, color: T.paper }}>
          Unlock admin panel
        </button>
      </div>
    </div>
  );
}

function AdminPanel({ bank, setBank, onExit }) {
  const [tab, setTab] = useState("list"); // list | form | settings
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [filterSubject, setFilterSubject] = useState("All");
  const [search, setSearch] = useState("");
  const [newPass, setNewPass] = useState("");
  const [passMsg, setPassMsg] = useState("");

  const filtered = bank.filter((q) => {
    if (filterSubject !== "All" && q.subject !== filterSubject) return false;
    if (search && !q.question.toLowerCase().includes(search.toLowerCase()) && !q.topic.toLowerCase().includes(search.toLowerCase())) return false;
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
    if (!form.question.trim() || form.options.some((o) => !o.trim()) || !form.topic.trim()) {
      alert("Please fill in the topic, question, and all four options.");
      return;
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
              <div className="flex items-center gap-2 px-3 py-2" style={{ border: `1px solid ${T.line}`, background: "#fff" }}>
                <Search size={14} style={{ color: T.inkSoft }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search question or topic"
                  className="outline-none text-sm"
                  style={{ background: "transparent" }}
                />
              </div>
              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="px-3 py-2 text-sm"
                style={{ border: `1px solid ${T.line}`, background: "#fff" }}
              >
                <option>All</option>
                {SUBJECTS.map((s) => <option key={s.key}>{s.key}</option>)}
              </select>
              <button onClick={startAdd} className="ml-auto flex items-center gap-1 px-4 py-2 text-sm" style={{ background: T.ink, color: T.paper }}>
                <Plus size={16} /> Add MCQ
              </button>
            </div>

            <div className="text-sm mb-3" style={{ color: T.inkSoft }}>{filtered.length} question(s)</div>

            <div className="space-y-2">
              {filtered.map((q) => (
                <div key={q.id} className="p-4 flex items-start justify-between gap-4" style={{ background: "#fff", border: `1px solid ${T.line}` }}>
                  <div>
                    <div className="text-xs tracking-widest uppercase mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.amber }}>
                      {q.subject} · {q.topic} · {q.source}
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
                <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Subject</label>
                <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full px-3 py-2" style={{ border: `1px solid ${T.line}`, background: "#fff" }}>
                  {SUBJECTS.map((s) => <option key={s.key}>{s.key}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Source</label>
                <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Practice or Past Paper 2024" className="w-full px-3 py-2" style={{ border: `1px solid ${T.line}`, background: "#fff" }} />
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Topic</label>
              <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Cell Biology" className="w-full px-3 py-2" style={{ border: `1px solid ${T.line}`, background: "#fff" }} />
            </div>
            <div className="mb-4">
              <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Question</label>
              <textarea value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} rows={3} className="w-full px-3 py-2" style={{ border: `1px solid ${T.line}`, background: "#fff" }} />
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
                    style={{ border: `1px solid ${T.line}`, background: "#fff" }}
                  />
                </div>
              ))}
            </div>
            <div className="mb-6">
              <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Explanation (optional)</label>
              <textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} rows={2} className="w-full px-3 py-2" style={{ border: `1px solid ${T.line}`, background: "#fff" }} />
            </div>
            <div className="flex gap-3">
              <button onClick={submit} className="flex items-center gap-2 px-5 py-2 text-sm" style={{ background: T.ink, color: T.paper }}>
                <Save size={16} /> {editingId ? "Save changes" : "Add to bank"}
              </button>
              <button onClick={() => setTab("list")} className="px-5 py-2 text-sm" style={{ border: `1px solid ${T.ink}` }}>Cancel</button>
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
              style={{ border: `1px solid ${T.line}`, background: "#fff", fontFamily: "'IBM Plex Mono', monospace" }}
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
  const [stats, setStats] = useState(null);
  const [view, setView] = useState("home"); // home | admin-gate | admin | subject | quiz | results
  const [subject, setSubject] = useState(null);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [result, setResult] = useState(null);

  useEffect(() => {
    (async () => {
      let b = await loadBank();
      if (!b) {
        b = SEED_MCQS;
        await saveBank(b);
      }
      setBank(b);
      const st = await loadStats();
      setStats(st || { totalAttempted: 0, totalCorrect: 0, bySubject: {} });
      setLoading(false);
    })();
  }, []);

  const openSubject = (s) => { setSubject(s); setView("subject"); };

  const startQuiz = (qs) => { setQuizQuestions(qs); setView("quiz"); };

  const finishQuiz = async (res) => {
    setResult(res);
    const next = {
      totalAttempted: (stats?.totalAttempted || 0) + res.questions.length,
      totalCorrect: (stats?.totalCorrect || 0) + res.correct,
      bySubject: { ...(stats?.bySubject || {}) },
    };
    next.bySubject[subject] = {
      attempted: (next.bySubject[subject]?.attempted || 0) + res.questions.length,
      correct: (next.bySubject[subject]?.correct || 0) + res.correct,
    };
    setStats(next);
    await saveStats(next);
    setView("results");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: T.paper, color: T.ink }}>
        <FontLoader />
        <div style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Loading question bank…</div>
      </div>
    );
  }

  if (view === "home") {
    return <Home bank={bank} onOpenSubject={openSubject} onOpenAdmin={() => setView("admin-gate")} stats={stats} />;
  }
  if (view === "admin-gate") {
    return <AdminGate onUnlock={() => setView("admin")} onBack={() => setView("home")} />;
  }
  if (view === "admin") {
    return <AdminPanel bank={bank} setBank={setBank} onExit={() => setView("home")} />;
  }
  if (view === "subject") {
    return (
      <SubjectSetup
        subject={subject}
        bank={bank}
        onBack={() => setView("home")}
        onStart={startQuiz}
      />
    );
  }
  if (view === "quiz") {
    return (
      <Quiz
        questions={quizQuestions}
        subject={subject}
        onFinish={finishQuiz}
        onExit={() => setView("subject")}
      />
    );
  }
  if (view === "results") {
    return (
      <Results
        result={result}
        subject={subject}
        onRetry={() => setView("subject")}
        onHome={() => setView("home")}
      />
    );
  }
  return null;
}
