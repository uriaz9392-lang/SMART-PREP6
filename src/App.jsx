import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Dna, FlaskConical, Atom, BookOpen, Lock, Unlock, Plus, Pencil, Trash2,
  ChevronLeft, ChevronRight, Check, X, RotateCcw, Search, Settings,
  ClipboardList, GraduationCap, ShieldCheck, ArrowLeft, Save, LogOut,
  Stethoscope, HeartPulse, BadgeCheck, Bell, User, Menu, Target,
  ClipboardCheck, FileText, TrendingUp, Calendar, Trophy, Bookmark,
  Home as HomeIcon, Library, Users, FlaskRound, Award, Mail, StickyNote,
  BellRing, ChevronDown, Phone, MessageCircle, Medal, Star, KeyRound,
  Instagram, Facebook, Music2, Brain, FileCheck2, Clock, Smartphone,
  Timer, Activity, Share2, Sun, Moon, Send, AlertTriangle,
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

// Cloudflare Worker that serves the (large, mostly-static) question bank and
// the (small, periodically-refreshed) leaderboard from a free, high-bandwidth
// CDN instead of Supabase — this is what keeps Supabase egress low even as
// more students use the app. Supabase's app_data.bank stays the source of
// truth; the Worker is only pushed a fresh copy whenever the admin saves.
const CDN_BASE = "https://smart-prep-worker.uriaz9392.workers.dev";
const CDN_ADMIN_KEY = "THpKGBzsM4dtsa9ruyvmlxbD6AzPfMwB-ZOawZmHSqY";
// Public VAPID key for Web Push — this one is MEANT to be public (it's the
// "public" half of the key pair; the private half stays a secret on the
// Cloudflare Worker only). Fill this in with the key from `npx web-push
// generate-vapid-keys` — see SETUP.md. Push notifications quietly no-op
// until this is set.
const VAPID_PUBLIC_KEY = "";

// Use localStorage (instead of sessionStorage) to keep the login session.
// This ties "being logged in" to the device/browser itself, not to a single
// open-app session:
// - Closing and reopening the app (or the browser) keeps the student logged in.
// - Only uninstalling the app (or clearing site data / signing out) removes
//   the saved session, at which point the student has to log in again.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});

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

// IMPORTANT: this writes ONLY the fields passed in `partial` directly to the row,
// instead of the old approach (read the whole row, merge in memory, then write it
// all back). That old approach caused a race condition: if two saves happened close
// together (e.g. deleting two questions quickly), the second save could read stale
// data (from before the first save finished) and overwrite the first save's result —
// making a deleted question "come back" a little while later. A direct update has
// no such race. Returns true/false so callers know whether the save actually worked.
export async function saveSharedData(partial) {
  try {
    const { data, error } = await supabase
      .from("app_data")
      .update(partial)
      .eq("id", 1)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      // No row with id=1 yet (only happens on the very first save ever) — create it.
      const { error: insertError } = await supabase.from("app_data").insert({ id: 1, ...partial });
      if (insertError) throw insertError;
    }
    return true;
  } catch (e) {
    console.error("Supabase save failed:", e);
    return false;
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

// ---- Local safety cache of the question bank ----
// A copy of the last successfully-loaded bank, kept on this device only. If a
// Supabase fetch ever fails (network hiccup, timeout, etc.), the app falls back
// to this cache instead of assuming "no data" and seeding demo questions over
// the real bank. This is a safety net, not a substitute for the real database.
//
// Uses IndexedDB rather than localStorage. localStorage typically caps out around
// 5-10MB per site, which is too small to hold an 8000+ question bank — every save
// was silently failing, so the app was re-downloading the full bank on every open
// anyway (defeating the whole point of caching). IndexedDB's quota is tied to
// available device storage (usually hundreds of MB or more), so the cache can
// actually hold the full bank.
const BANK_DB_NAME = "smart-prep-bank-db";
const BANK_STORE_NAME = "bank";
const BANK_KEY = "bank-cache";

function openBankDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB not supported in this browser"));
      return;
    }
    const req = indexedDB.open(BANK_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(BANK_STORE_NAME)) {
        req.result.createObjectStore(BANK_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadLocalBankCache() {
  try {
    const db = await openBankDB();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(BANK_STORE_NAME, "readonly");
      const req = tx.objectStore(BANK_STORE_NAME).get(BANK_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return Array.isArray(result) && result.length > 0 ? result : null;
  } catch (e) {
    // Fall back to any older localStorage cache from before this change,
    // so devices don't lose their cache benefit on the first load after update.
    try {
      const raw = localStorage.getItem("mdcat-bank-cache");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

async function saveLocalBankCache(bank) {
  if (!Array.isArray(bank) || bank.length === 0) return false;
  try {
    const db = await openBankDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(BANK_STORE_NAME, "readwrite");
      tx.objectStore(BANK_STORE_NAME).put(bank, BANK_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    // Clean up any old, now-unused localStorage copy so it doesn't sit around
    // taking up quota needed for other things.
    try {
      localStorage.removeItem("mdcat-bank-cache");
    } catch {}
    return true;
  } catch (e) {
    console.error("IndexedDB bank cache save failed (falling back — bandwidth caching won't apply on this device):", e);
    return false;
  }
}

// ---- Authentication ----
// extra = { name, course } gets saved on the auth user as user_metadata,
// so user.user_metadata.name / user.user_metadata.course are available
// right after sign up / sign in, with no extra database table needed.
export async function signUp(email, password, extra = {}) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { name: extra.name || "", course: extra.course || "", mbbsYear: extra.mbbsYear || "" } },
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
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(session, event));
  return data.subscription;
}

// ---- Forgot / reset password ----
// Sends the student an email with a secure link. Clicking it brings them back to
// this app already signed in to a temporary "recovery" session, at which point
// updatePassword() below is used to set the new password.
export async function sendPasswordReset(email) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
  });
}
export async function updatePassword(newPassword) {
  return supabase.auth.updateUser({ password: newPassword });
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
    const { data, error } = await supabase.from("app_data").update({ notes }).eq("id", 1).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      const { error: insertError } = await supabase.from("app_data").insert({ id: 1, notes });
      if (insertError) throw insertError;
    }
    return true;
  } catch (e) {
    console.error("Save notes failed (add a 'notes' jsonb column to app_data):", e);
    return false;
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
    const { data, error } = await supabase.from("app_data").update({ notifications }).eq("id", 1).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      const { error: insertError } = await supabase.from("app_data").insert({ id: 1, notifications });
      if (insertError) throw insertError;
    }
    return true;
  } catch (e) {
    console.error("Save notifications failed (add a 'notifications' jsonb column to app_data):", e);
    return false;
  }
}

// ---- Note PDF uploads (whole PDF file, no text extraction) ----
// Requires a PUBLIC Storage bucket named exactly "notes-pdfs" in your Supabase project:
// Supabase dashboard → Storage → New bucket → name "notes-pdfs" → toggle "Public bucket" ON.
// Uploads the raw file as-is and returns a public URL that students can open/download.
export async function uploadNotePdf(file) {
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${Date.now()}_${safeName}`;
    const { error } = await supabase.storage.from("notes-pdfs").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: "application/pdf",
    });
    if (error) throw error;
    const { data } = supabase.storage.from("notes-pdfs").getPublicUrl(path);
    return { url: data?.publicUrl || null, error: null };
  } catch (e) {
    console.error("PDF upload failed (create a PUBLIC 'notes-pdfs' Storage bucket in Supabase):", e);
    return { url: null, error: e };
  }
}

// ---- Reviews (public — any signed-in student can add one, everyone can read) ----
// Requires a `reviews` jsonb column on the `app_data` table (default value []).
export async function loadReviews() {
  try {
    const { data, error } = await supabase.from("app_data").select("reviews").eq("id", 1).maybeSingle();
    if (error) throw error;
    return (data && data.reviews) || [];
  } catch (e) {
    console.error("Load reviews failed (add a 'reviews' jsonb column to app_data):", e);
    return [];
  }
}
export async function saveReviews(reviews) {
  try {
    const { data, error } = await supabase.from("app_data").update({ reviews }).eq("id", 1).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      const { error: insertError } = await supabase.from("app_data").insert({ id: 1, reviews });
      if (insertError) throw insertError;
    }
    return true;
  } catch (e) {
    console.error("Save reviews failed (add a 'reviews' jsonb column to app_data):", e);
    return false;
  }
}

// ---- Explanation feedback (👍/👎 per question, shared, admin can review) ----
// Requires an `explanation_feedback` jsonb column on `app_data` (default value {}).
// Shape: { [questionId]: { up: number, down: number } }
export async function loadExplanationFeedback() {
  try {
    const { data, error } = await supabase.from("app_data").select("explanation_feedback").eq("id", 1).maybeSingle();
    if (error) throw error;
    return (data && data.explanation_feedback) || {};
  } catch (e) {
    console.error("Load explanation feedback failed (add an 'explanation_feedback' jsonb column to app_data):", e);
    return {};
  }
}
export async function saveExplanationFeedback(feedback) {
  try {
    const { data, error } = await supabase.from("app_data").update({ explanation_feedback: feedback }).eq("id", 1).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      const { error: insertError } = await supabase.from("app_data").insert({ id: 1, explanation_feedback: feedback });
      if (insertError) throw insertError;
    }
    return true;
  } catch (e) {
    console.error("Save explanation feedback failed (add an 'explanation_feedback' jsonb column to app_data):", e);
    return false;
  }
}

// ---- Question reports (students flag a wrong/confusing MCQ, admin reviews) ----
// Requires a `question_reports` jsonb column on `app_data` (default value []).
export async function loadQuestionReports() {
  try {
    const { data, error } = await supabase.from("app_data").select("question_reports").eq("id", 1).maybeSingle();
    if (error) throw error;
    return (data && data.question_reports) || [];
  } catch (e) {
    console.error("Load question reports failed (add a 'question_reports' jsonb column to app_data):", e);
    return [];
  }
}
export async function saveQuestionReports(reports) {
  try {
    const { data, error } = await supabase.from("app_data").update({ question_reports: reports }).eq("id", 1).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      const { error: insertError } = await supabase.from("app_data").insert({ id: 1, question_reports: reports });
      if (insertError) throw insertError;
    }
    return true;
  } catch (e) {
    console.error("Save question reports failed (add a 'question_reports' jsonb column to app_data):", e);
    return false;
  }
}

// ---- Discussion threads (per topic, students can post doubts/comments) ----
// Requires a `discussions` jsonb column on `app_data` (default value {}).
// Shape: { [topicKey]: [{ id, name, text, createdAt }] }
export async function loadDiscussions() {
  try {
    const { data, error } = await supabase.from("app_data").select("discussions").eq("id", 1).maybeSingle();
    if (error) throw error;
    return (data && data.discussions) || {};
  } catch (e) {
    console.error("Load discussions failed (add a 'discussions' jsonb column to app_data):", e);
    return {};
  }
}
export async function saveDiscussions(discussions) {
  try {
    const { data, error } = await supabase.from("app_data").update({ discussions }).eq("id", 1).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      const { error: insertError } = await supabase.from("app_data").insert({ id: 1, discussions });
      if (insertError) throw insertError;
    }
    return true;
  } catch (e) {
    console.error("Save discussions failed (add a 'discussions' jsonb column to app_data):", e);
    return false;
  }
}

// ---- Rank / percentile (reads the leaderboard table's counts, not full rows) ----
export async function loadRankInfo(myTotalCorrect) {
  try {
    const { count: totalCount, error: e1 } = await supabase
      .from("user_stats")
      .select("user_id", { count: "exact", head: true });
    if (e1) throw e1;
    const { count: aheadCount, error: e2 } = await supabase
      .from("user_stats")
      .select("user_id", { count: "exact", head: true })
      .gt("total_correct", myTotalCorrect || 0);
    if (e2) throw e2;
    return { totalCount: totalCount || 0, rank: (aheadCount || 0) + 1 };
  } catch (e) {
    console.error("Load rank info failed:", e);
    return null;
  }
}

// ---- Admin analytics: aggregate every student's by_subject stats ----
// Reuses the same RLS read-policy as the leaderboard (see loadLeaderboard).
export async function loadAllStudentSubjectStats() {
  try {
    const { data, error } = await supabase.from("user_stats").select("by_subject");
    if (error) throw error;
    return (data || []).map((r) => r.by_subject || {});
  } catch (e) {
    console.error("Load admin analytics failed (same RLS read-policy as the leaderboard is required):", e);
    return [];
  }
}


// Requires a `syllabus` jsonb column on the `app_data` table (default value []).
export async function loadSyllabusItems() {
  try {
    const { data, error } = await supabase.from("app_data").select("syllabus").eq("id", 1).maybeSingle();
    if (error) throw error;
    return (data && data.syllabus) || [];
  } catch (e) {
    console.error("Load syllabus failed (add a 'syllabus' jsonb column to app_data):", e);
    return [];
  }
}
export async function saveSyllabusItems(syllabus) {
  try {
    const { data, error } = await supabase.from("app_data").update({ syllabus }).eq("id", 1).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      const { error: insertError } = await supabase.from("app_data").insert({ id: 1, syllabus });
      if (insertError) throw insertError;
    }
    return true;
  } catch (e) {
    console.error("Save syllabus failed (add a 'syllabus' jsonb column to app_data):", e);
    return false;
  }
}

// ---- Guideline items (admin-authored: links, PDFs, or text blocks) ----
// Requires a `guidelines` jsonb column on the `app_data` table (default value []).
export async function loadGuidelineItems() {
  try {
    const { data, error } = await supabase.from("app_data").select("guidelines").eq("id", 1).maybeSingle();
    if (error) throw error;
    return (data && data.guidelines) || [];
  } catch (e) {
    console.error("Load guidelines failed (add a 'guidelines' jsonb column to app_data):", e);
    return [];
  }
}
export async function saveGuidelineItems(guidelines) {
  try {
    const { data, error } = await supabase.from("app_data").update({ guidelines }).eq("id", 1).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      const { error: insertError } = await supabase.from("app_data").insert({ id: 1, guidelines });
      if (insertError) throw insertError;
    }
    return true;
  } catch (e) {
    console.error("Save guidelines failed (add a 'guidelines' jsonb column to app_data):", e);
    return false;
  }
}

// ---- FLP (Full Length Paper) tests: fixed, admin-built papers ----
// Each test is a FIXED set of question ids, built once from an admin's bulk
// PDF upload — never reshuffled per student or per attempt, so "First Year
// Full Course Test" is the same paper for everyone who takes it, like a
// real exam.
export async function loadFLPTests() {
  try {
    const { data, error } = await supabase.from("app_data").select("flp_tests").eq("id", 1).maybeSingle();
    if (error) throw error;
    return (data && data.flp_tests) || [];
  } catch (e) {
    console.error("Load FLP tests failed (add a 'flp_tests' jsonb column to app_data):", e);
    return [];
  }
}
export async function saveFLPTests(flpTests) {
  try {
    const { data, error } = await supabase.from("app_data").update({ flp_tests: flpTests }).eq("id", 1).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      const { error: insertError } = await supabase.from("app_data").insert({ id: 1, flp_tests: flpTests });
      if (insertError) throw insertError;
    }
    return true;
  } catch (e) {
    console.error("Save FLP tests failed (add a 'flp_tests' jsonb column to app_data):", e);
    return false;
  }
}
// Adds/removes one FLP test directly against whatever is CURRENTLY saved in
// Supabase — re-fetching right before writing, instead of trusting this
// browser tab's own in-memory `flpTests` copy. Without this, if a tab's copy
// was ever behind (e.g. this tab was open from before another admin action,
// or its very first load hadn't finished yet), saving "[...flpTests, test]"
// would silently overwrite the real list on the server with that stale
// local one — which looks exactly like "papers I made earlier disappeared".
// Returns { list, error }: list is the new full list on success (error is
// null), or list is null and error holds the real Supabase error message on
// failure — surfaced to the admin so a real cause (missing column, RLS,
// etc.) is visible on-screen instead of only in a browser console.
export async function addFLPTestRemote(test) {
  try {
    const { data, error } = await supabase.from("app_data").select("flp_tests").eq("id", 1).maybeSingle();
    if (error) throw error;
    const current = (data && data.flp_tests) || [];
    const next = [...current, test];
    const { error: updateError } = await supabase.from("app_data").update({ flp_tests: next }).eq("id", 1).select("id");
    if (updateError) throw updateError;
    return { list: next, error: null };
  } catch (e) {
    const message = e?.message || String(e);
    console.error("Add FLP test failed (add a 'flp_tests' jsonb column to app_data):", e);
    return { list: null, error: message };
  }
}
export async function removeFLPTestRemote(id) {
  try {
    const { data, error } = await supabase.from("app_data").select("flp_tests").eq("id", 1).maybeSingle();
    if (error) throw error;
    const current = (data && data.flp_tests) || [];
    const next = current.filter((t) => t.id !== id);
    const { error: updateError } = await supabase.from("app_data").update({ flp_tests: next }).eq("id", 1).select("id");
    if (updateError) throw updateError;
    return { list: next, error: null };
  } catch (e) {
    const message = e?.message || String(e);
    console.error("Remove FLP test failed:", e);
    return { list: null, error: message };
  }
}

// ---- FLP attempts: one row per student per submitted paper, so admin can
// see who took which test and what they scored. Separate Supabase table
// (not app_data) since this grows over time and admin needs to query/filter
// it, unlike the small admin-managed lists above.
export async function saveFLPAttempt(attempt) {
  try {
    const { error } = await supabase.from("flp_attempts").insert({
      user_id: attempt.userId,
      name: attempt.name || "",
      phone: attempt.phone || "",
      program: attempt.program,
      test_id: attempt.testId,
      test_title: attempt.testTitle,
      score: attempt.score,
      total: attempt.total,
    });
    if (error) throw error;
  } catch (e) {
    console.error("Save FLP attempt failed (create the 'flp_attempts' table, and add a 'phone' column — see comment near its usage):", e);
  }
}
export async function loadFLPAttempts() {
  try {
    const { data, error } = await supabase
      .from("flp_attempts")
      .select("id, user_id, name, phone, program, test_id, test_title, score, total, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error("Load FLP attempts failed:", e);
    return [];
  }
}

// ---- Contact items (admin-authored links: WhatsApp, phone, email, groups, etc.) ----
// Requires a `contact_items` jsonb column on the `app_data` table (default value []).
export async function loadContactItems() {
  try {
    const { data, error } = await supabase.from("app_data").select("contact_items").eq("id", 1).maybeSingle();
    if (error) throw error;
    return (data && data.contact_items) || [];
  } catch (e) {
    console.error("Load contact items failed (add a 'contact_items' jsonb column to app_data):", e);
    return [];
  }
}
export async function saveContactItems(contact_items) {
  try {
    const { data, error } = await supabase.from("app_data").update({ contact_items }).eq("id", 1).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      const { error: insertError } = await supabase.from("app_data").insert({ id: 1, contact_items });
      if (insertError) throw insertError;
    }
    return true;
  } catch (e) {
    console.error("Save contact items failed (add a 'contact_items' jsonb column to app_data):", e);
    return false;
  }
}

// ---- Social links (admin-authored URLs for the fixed WhatsApp Group / Instagram / Facebook / TikTok cards) ----
// Requires a `social_links` jsonb column on the `app_data` table (default value {}).
export async function loadSocialLinksMap() {
  try {
    const { data, error } = await supabase.from("app_data").select("social_links").eq("id", 1).maybeSingle();
    if (error) throw error;
    return (data && data.social_links) || {};
  } catch (e) {
    console.error("Load social links failed (add a 'social_links' jsonb column to app_data):", e);
    return {};
  }
}
export async function saveSocialLinksMap(social_links) {
  try {
    const { data, error } = await supabase.from("app_data").update({ social_links }).eq("id", 1).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      const { error: insertError } = await supabase.from("app_data").insert({ id: 1, social_links });
      if (insertError) throw insertError;
    }
    return true;
  } catch (e) {
    console.error("Save social links failed (add a 'social_links' jsonb column to app_data):", e);
    return false;
  }
}

// ---- Per-user stats (each student's own score, tied to their account) ----
export async function loadUserStats(userId) {
  try {
    const { data, error } = await supabase
      .from("user_stats")
      .select("total_attempted, total_correct, by_subject, bookmarks, wrong_ids, slow_ids, streak, last_challenge_date, name, flp_used, history, course, mbbs_year")
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
      flpUsed: data.flp_used || {},
      history: data.history || [],
      course: data.course || null,
      mbbsYear: data.mbbs_year || null,
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
      flp_used: stats.flpUsed || {},
      history: stats.history || [],
      course: stats.course || null,
      mbbs_year: stats.mbbsYear || null,
    });
    if (error) throw error;
  } catch (e) {
    console.error("Save user stats failed:", e);
  }
}

// ---- Leaderboard (reads every student's aggregate stats) ----
// Two modes:
//  - Unscoped (no course given): reads the Cloudflare Worker's cached copy
//    first for a cheap global "top student" preview (e.g. Home's Quick
//    Access card), falling back to Supabase if the Worker is down.
//  - Scoped (course given, e.g. every real Leaderboard screen a student
//    opens): always reads directly from Supabase with the filter applied
//    server-side. The Worker's cached payload is a separate script this app
//    doesn't control, so it can't be trusted to always have an accurate/
//    up-to-date `course` (or the newer `mbbs_year`) on every cached row —
//    querying Supabase directly guarantees correctness for course- and
//    year-scoped boards (this is what fixed MBBS' board never matching).
export async function loadLeaderboard(limit = 50, filter = null) {
  if (filter && filter.course) {
    try {
      let q = supabase
        .from("user_stats")
        .select("name, total_attempted, total_correct, course, mbbs_year")
        .eq("course", filter.course)
        .order("total_correct", { ascending: false })
        .limit(limit);
      if (filter.mbbsYear) q = q.eq("mbbs_year", filter.mbbsYear);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).filter((r) => r.name && r.name.trim());
    } catch (e) {
      console.error("Scoped leaderboard load failed:", e);
      return [];
    }
  }
  try {
    const res = await fetch(`${CDN_BASE}/leaderboard`);
    if (!res.ok) throw new Error("CDN leaderboard fetch failed: " + res.status);
    const data = await res.json();
    return (Array.isArray(data) ? data : []).slice(0, limit);
  } catch (e) {
    console.error("CDN leaderboard failed, falling back to Supabase:", e);
    // Fallback so the leaderboard still works even if the Worker is briefly down.
    try {
      const { data, error } = await supabase
        .from("user_stats")
        .select("name, total_attempted, total_correct, course")
        .order("total_correct", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []).filter((r) => r.name && r.name.trim());
    } catch (e2) {
      console.error("Supabase leaderboard fallback also failed:", e2);
      return [];
    }
  }
}

// ---- Exam countdown dates (admin-set, one date per program) ----
// Requires an `exam_dates` jsonb column on the `app_data` table (default value {}).
export async function loadExamDates() {
  try {
    const { data, error } = await supabase.from("app_data").select("exam_dates").eq("id", 1).maybeSingle();
    if (error) throw error;
    return (data && data.exam_dates) || {};
  } catch (e) {
    console.error("Load exam dates failed (add an 'exam_dates' jsonb column to app_data):", e);
    return {};
  }
}
export async function saveExamDates(examDates) {
  try {
    const { data, error } = await supabase.from("app_data").update({ exam_dates: examDates }).eq("id", 1).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      const { error: insertError } = await supabase.from("app_data").insert({ id: 1, exam_dates: examDates });
      if (insertError) throw insertError;
    }
    return true;
  } catch (e) {
    console.error("Save exam dates failed (add an 'exam_dates' jsonb column to app_data):", e);
    return false;
  }
}

// ---- Daily push-reminder settings (admin-configured; the Cloudflare Worker's ----
// ---- cron trigger reads this same row to know whether/when/what to send)    ----
// Requires a `daily_reminder` jsonb column on the `app_data` table (default value
// {"enabled": false, "time": "18:00", "message": ""}).
const DEFAULT_DAILY_REMINDER = { enabled: false, time: "18:00", message: "Don't break your streak — today's questions are waiting!" };
export async function loadDailyReminder() {
  try {
    const { data, error } = await supabase.from("app_data").select("daily_reminder").eq("id", 1).maybeSingle();
    if (error) throw error;
    return { ...DEFAULT_DAILY_REMINDER, ...((data && data.daily_reminder) || {}) };
  } catch (e) {
    console.error("Load daily reminder failed (add a 'daily_reminder' jsonb column to app_data):", e);
    return DEFAULT_DAILY_REMINDER;
  }
}

// Combines what used to be 13 separate round trips (loadNotes, loadNotifications,
// loadReviews, loadSyllabusItems, loadGuidelineItems, loadContactItems,
// loadSocialLinksMap, loadExamDates, loadExplanationFeedback, loadQuestionReports,
// loadDiscussions, loadDailyReminder, loadFLPTests — all reading different jsonb
// columns off the very same `app_data` row) into ONE query. Even run in parallel,
// 13 simultaneous requests over a mobile connection add real, noticeable delay to
// every login — this was a meaningful chunk of "the app feels slow". The individual
// load*() functions above are kept as-is and still used for their own on-demand
// refreshes elsewhere; this combined loader is only for the initial app-open sequence.
export async function loadAppData() {
  const empty = {
    notes: [], notifications: [], reviews: [], syllabus: [], guidelines: [], contact_items: [],
    social_links: {}, exam_dates: {}, explanation_feedback: {}, question_reports: [], discussions: {},
    daily_reminder: DEFAULT_DAILY_REMINDER, flp_tests: [],
  };
  try {
    // select("*") deliberately, not a named column list — naming columns meant
    // ANY single missing/renamed column made the WHOLE query fail, silently
    // wiping out everything else in this response (reviews, FLP tests, community
    // links, etc. all "disappeared" together even though nothing was actually
    // deleted server-side — this was a serious bug, now fixed). select("*")
    // simply returns whatever columns exist; anything absent still falls back
    // safely below via `|| []` / `|| {}`.
    const { data, error } = await supabase
      .from("app_data")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return empty;
    return {
      notes: data.notes || [],
      notifications: data.notifications || [],
      reviews: data.reviews || [],
      syllabus: data.syllabus || [],
      guidelines: data.guidelines || [],
      contact_items: data.contact_items || [],
      social_links: data.social_links || {},
      exam_dates: data.exam_dates || {},
      explanation_feedback: data.explanation_feedback || {},
      question_reports: data.question_reports || [],
      discussions: data.discussions || {},
      daily_reminder: { ...DEFAULT_DAILY_REMINDER, ...(data.daily_reminder || {}) },
      flp_tests: data.flp_tests || [],
    };
  } catch (e) {
    console.error("Load app data failed:", e);
    return empty;
  }
}

// Generic safe read-modify-write for a single app_data jsonb column: always
// re-fetches that column's CURRENT value from Supabase immediately before
// writing, instead of trusting a possibly-stale local React state copy.
// This is what closes off the bug class that made community links and
// reviews look "deleted" — a stale/empty local copy (e.g. from a failed
// read) silently overwriting real, already-saved server data the moment
// the admin added or removed one item. `mutate(current)` returns the new
// value to save. Returns the new value on success, or null on failure
// (nothing saved, so the caller can alert instead of assuming success).
async function mergeAppDataField(column, emptyValue, mutate) {
  try {
    const { data, error } = await supabase.from("app_data").select(column).eq("id", 1).maybeSingle();
    if (error) throw error;
    const current = (data && data[column]) || emptyValue;
    const next = mutate(current);
    const { error: updateError } = await supabase.from("app_data").update({ [column]: next }).eq("id", 1);
    if (updateError) throw updateError;
    // Verify the write actually landed by reading it straight back, instead
    // of trusting a successful-looking response — a write that "succeeds"
    // but silently doesn't stick (e.g. an RLS policy quietly rejecting it)
    // is exactly what made saves look fine once, then disappear.
    const { data: verify, error: verifyError } = await supabase.from("app_data").select(column).eq("id", 1).maybeSingle();
    if (verifyError) throw verifyError;
    const persisted = (verify && verify[column]) || emptyValue;
    if (JSON.stringify(persisted) !== JSON.stringify(next)) {
      throw new Error(`Update reported success but did not persist — check Row Level Security policies allow UPDATE on app_data.${column} for this user.`);
    }
    return next;
  } catch (e) {
    console.error(`Safe update of app_data.${column} failed:`, e);
    return null;
  }
}
export async function saveDailyReminder(dailyReminder) {
  try {
    const { data, error } = await supabase.from("app_data").update({ daily_reminder: dailyReminder }).eq("id", 1).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      const { error: insertError } = await supabase.from("app_data").insert({ id: 1, daily_reminder: dailyReminder });
      if (insertError) throw insertError;
    }
    return true;
  } catch (e) {
    console.error("Save daily reminder failed (add a 'daily_reminder' jsonb column to app_data):", e);
    return false;
  }
}

// ---- Push notifications (admin broadcast) ----
// Sent through the Cloudflare Worker (same one that serves the bank CDN cache),
// which holds the VAPID private key + Supabase service-role key as Worker
// secrets — neither of those ever ships to the browser. See SETUP.md for the
// small addition this needs on the Worker side.
export async function sendPushBroadcast({ title, body }) {
  try {
    const res = await fetch(`${CDN_BASE}/send-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": CDN_ADMIN_KEY },
      body: JSON.stringify({ title, body }),
    });
    return res.ok;
  } catch (e) {
    console.error("Send push broadcast failed:", e);
    return false;
  }
}
export async function loadPushSubscriberCount() {
  try {
    const res = await fetch(`${CDN_BASE}/push-subscriber-count`, { headers: { "x-admin-key": CDN_ADMIN_KEY } });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.count === "number" ? data.count : null;
  } catch (e) {
    console.error("Load push subscriber count failed:", e);
    return null;
  }
}

// ---- Usage analytics: installs + daily minutes used (for the Admin Dashboard) ----
// Requires two new tables in Supabase (RLS disabled, same permissive setup `app_data`
// already uses, since both are written directly from the client with the anon key):
//
//   create table app_installs (
//     id bigint generated always as identity primary key,
//     user_id uuid,
//     name text,
//     installed_at timestamptz default now()
//   );
//
//   create table usage_daily (
//     user_id uuid not null,
//     date date not null,
//     name text,
//     minutes int default 0,
//     primary key (user_id, date)
//   );
export async function logAppInstall(userId, name) {
  try {
    const { error } = await supabase.from("app_installs").insert({ user_id: userId, name: name || "" });
    if (error) throw error;
  } catch (e) {
    console.error("Log app install failed (create the 'app_installs' table — see comment above):", e);
  }
}

// Adds `minutes` to today's usage row for this user (creates the row if it doesn't exist yet).
export async function pingUsage(userId, name, minutes = 1) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("usage_daily")
      .select("minutes")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();
    if (error) throw error;
    const nextMinutes = (data?.minutes || 0) + minutes;
    const { error: upsertError } = await supabase
      .from("usage_daily")
      .upsert({ user_id: userId, date: today, name: name || "", minutes: nextMinutes });
    if (upsertError) throw upsertError;
  } catch (e) {
    console.error("Ping usage failed (create the 'usage_daily' table — see comment above):", e);
  }
}

// Pulls everything needed for the Admin Dashboard in one go. Also returns any
// error message hit while loading (e.g. "usage_daily" table missing, or RLS
// blocking the read) so the Admin Dashboard can show it directly on-screen
// instead of it only being visible in the browser console.
export async function loadUsageDashboard() {
  try {
    const [installsRes, usageRes] = await Promise.all([
      supabase.from("app_installs").select("user_id, name, installed_at"),
      supabase.from("usage_daily").select("user_id, date, name, minutes"),
    ]);
    if (installsRes.error) throw installsRes.error;
    if (usageRes.error) throw usageRes.error;
    return { installs: installsRes.data || [], usage: usageRes.data || [], error: null };
  } catch (e) {
    console.error("Load usage dashboard failed (create 'app_installs' + 'usage_daily' tables — see comments above):", e);
    return { installs: [], usage: [], error: e?.message || String(e) };
  }
}
// Quick on-demand check the admin can trigger from the Dashboard tab: tries a
// real insert + delete against usage_daily and reports the exact Postgres/
// Supabase error back (e.g. "relation \"usage_daily\" does not exist" means
// the table was never created; a permission-denied error means RLS is on).
// This exists so a setup problem can be diagnosed from the app itself,
// without needing to open the Supabase dashboard or browser dev tools.
export async function testUsageTracking() {
  const testId = "00000000-0000-0000-0000-000000000000";
  const testDate = "1970-01-01";
  try {
    const { error: upsertError } = await supabase
      .from("usage_daily")
      .upsert({ user_id: testId, date: testDate, name: "__test__", minutes: 1 });
    if (upsertError) throw upsertError;
    const { error: deleteError } = await supabase
      .from("usage_daily")
      .delete()
      .eq("user_id", testId)
      .eq("date", testDate);
    if (deleteError) throw deleteError;
    return { ok: true, message: "usage_daily table is reachable and writable — tracking should work." };
  } catch (e) {
    return { ok: false, message: e?.message || String(e) };
  }
}
// ============================================================================
// END SUPABASE SECTION
// ============================================================================

// Social / community links on the Contact Us page.
// ⚠️ Placeholder hrefs ("#") — replace with your real links whenever you have them.
const SOCIAL_LINKS = [
  { label: "WhatsApp Group", sub: "Join the student community group", icon: Users, color: "#1F9D6B", href: "#" },
  { label: "Instagram", sub: "Follow us for updates & tips", icon: Instagram, color: "#C2437A", href: "#" },
  { label: "Facebook", sub: "Like our page", icon: Facebook, color: "#2E63D6", href: "#" },
  { label: "TikTok", sub: "Watch quick prep videos", icon: Music2, color: "#111111", href: "#" },
];

// ---------- Design tokens ----------
// ---------- Theme (Dark / Light) ----------
// T is kept as a single mutable object (same reference everywhere in the file,
// referenced as T.card, T.ink, etc. in hundreds of inline styles). To support a
// dark/light toggle WITHOUT touching every single one of those call sites, we
// keep two fixed palettes below and, on every render of the root App component,
// copy the currently-selected palette's values onto T in place (Object.assign).
// Since React re-renders the whole visible tree on the toggle's state change,
// every T.xxx read picks up the new values automatically on that same render.
const THEME_DARK = {
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
const THEME_LIGHT = {
  paper: "#F4F6FB",
  paperDark: "#E7EBF5",
  card: "#FFFFFF",
  ink: "#0B1E3D",
  inkSoft: "#5B6B8C",
  line: "#DDE3EF",
  emerald: "#1F7A5C",
  emeraldSoft: "#DCEBE3",
  rose: "#B8493F",
  roseSoft: "#F3E1DD",
  amber: "#9C6C1F",
  amberSoft: "#F1E4CB",
  blue: "#2E63D6",
  blueSoft: "#DCE6FA",
};
const THEME_STORAGE_KEY = "mdcat-theme";
const T = { ...THEME_DARK };

// ---------- Programs ----------
const PROGRAMS = [
  {
    key: "MDCAT", label: "MDCAT", icon: Target, tagline: "Your Journey Starts Here",
    gradient: "linear-gradient(135deg, #0F2A5C, #1B3F7A)",
    links: [
      { label: "Practice MCQS", icon: ClipboardCheck, action: "open" },
      { label: "Notes", icon: BookOpen, action: "soon" },
      { label: "FLP", icon: FileCheck2, action: "flp" },
    ],
  },
  {
    key: "KMUCAT", label: "KMU CAT", icon: Award, tagline: "Your Journey Starts Here",
    gradient: "linear-gradient(135deg, #4A2E7A, #6C3FA3)",
    links: [
      { label: "Practice MCQS", icon: ClipboardCheck, action: "open" },
      { label: "Notes", icon: BookOpen, action: "soon" },
      { label: "FLP", icon: FileCheck2, action: "flp" },
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
      { label: "Year", icon: Library, action: "open" },
      { label: "Practice MCQS", icon: ClipboardCheck, action: "open" },
      { label: "Clinical Cases", icon: FlaskRound, action: "soon" },
    ],
  },
];

// Course options offered at signup — keys match PROGRAMS keys above.
const COURSES = PROGRAMS.map((p) => ({ key: p.key, label: p.label }));

// Programs that use the same fixed Subject -> Topic folder structure as MDCAT
const TOPIC_PROGRAMS = ["MDCAT", "KMUCAT"];

// A special pseudo-subject admins can pick when adding past-paper MCQs, since a
// real past paper mixes subjects the way the exam does. It's deliberately absent
// from MDCAT_TOPICS, so the app's existing "no topics defined = topic not required"
// logic already skips the Topic step for it — topic is instead auto-set to match
// the Source label (the past-paper folder name) when saving.
const PAST_PAPERS_SUBJECT = "Past Papers";

const SUBJECT_ICONS = {
  Biology: Dna,
  Chemistry: FlaskConical,
  Physics: Atom,
  English: BookOpen,
  "Logical Reasoning": Brain,
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
  "Logical Reasoning": "#C2437A",
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

// Sums attempted/correct across every bySubject entry whose key matches `matcher`,
// and returns the student's own accuracy % for that subject/topic/block/year — or
// null if they haven't attempted anything there yet (so we can hide the badge).
function accuracyFor(bySubject, matcher) {
  let attempted = 0;
  let correct = 0;
  Object.entries(bySubject || {}).forEach(([key, val]) => {
    if (matcher(key)) {
      attempted += val?.attempted || 0;
      correct += val?.correct || 0;
    }
  });
  if (attempted === 0) return null;
  return Math.round((correct / attempted) * 100);
}

function AccuracyBadge({ pct }) {
  if (pct === null || pct === undefined) return null;
  const color = pct >= 70 ? T.emerald : pct >= 40 ? T.amber : T.rose;
  return (
    <span
      className="text-xs px-2 py-0.5 shrink-0"
      style={{ fontFamily: "'IBM Plex Mono', monospace", color, background: `${color}22`, borderRadius: 4 }}
    >
      {pct}% accuracy
    </span>
  );
}

// Minimal dependency-free line chart (plain SVG) — used for the accuracy trend on
// the Progress page and the usage trend on the Admin Dashboard.
function TrendChart({ points, height = 140, color = T.blue, unit = "" }) {
  const w = 320;
  const h = height;
  const pad = 24;
  if (!points || points.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs" style={{ height: h, color: T.inkSoft }}>
        Not enough data yet.
      </div>
    );
  }
  const maxY = Math.max(100, ...points.map((p) => p.y));
  const minY = 0;
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((p.y - minY) / (maxY - minY || 1)) * (h - pad * 2);
    return { x, y, ...p };
  });
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${path} L ${coords[coords.length - 1].x.toFixed(1)} ${h - pad} L ${coords[0].x.toFixed(1)} ${h - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke={T.line} strokeWidth="1" />
      <path d={areaPath} fill={color} opacity="0.12" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="3" fill={color} />
      ))}
      {coords.map((c, i) => (
        <text key={`label-${i}`} x={c.x} y={h - 6} fontSize="8" fill={T.inkSoft} textAnchor="middle" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
          {c.label}
        </text>
      ))}
      {coords.map((c, i) => (
        <text key={`val-${i}`} x={c.x} y={c.y - 8} fontSize="8" fill={color} textAnchor="middle" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
          {c.y}{unit}
        </text>
      ))}
    </svg>
  );
}

// Circular exam-countdown badge shown on Home — a ring (fills in as the exam gets
// closer) wrapped around a big, bold day count, plus a short label alongside it.
function CircularCountdown({ days, courseLabel }) {
  const size = 116;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const maxDays = 365;
  const progress = Math.max(0.04, Math.min(1, 1 - Math.min(days, maxDays) / maxDays));
  const dash = circumference * progress;
  const color = days <= 14 ? T.rose : days <= 45 ? T.amber : "#6FA3F5";

  return (
    <div
      className="flex items-center gap-4 mb-4 px-5 py-4 relative z-10"
      style={{ background: "linear-gradient(135deg, #123A6B, #0F2A5C)", border: `1px solid ${T.line}`, borderRadius: 14 }}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 800, fontSize: 42, lineHeight: 1, color: "#fff" }}>
            {days}
          </div>
          <div className="text-[10px] tracking-widest uppercase mt-1" style={{ color: "#B9C4DE" }}>
            {days === 1 ? "day left" : "days left"}
          </div>
        </div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-widest mb-1" style={{ color: "#B9C4DE", fontFamily: "'IBM Plex Mono', monospace" }}>
          Exam Countdown
        </div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700, color: "#fff" }} className="text-xl">
          {courseLabel} Exam
        </div>
        <div className="text-xs mt-1" style={{ color: "#B9C4DE" }}>Keep practicing — you've got this! 💪</div>
      </div>
    </div>
  );
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
    "Sentence Structure/Types of Sentence", "Parts of Speech", "Nouns, Pronouns & Articles",
    "Subject-Verb Agreement", "Verb Forms", "Tenses", "Conditional Sentences",
    "Active & Passive Voice", "Direct & Indirect Speech", "Conjunctions, Phrases & Clauses",
    "Prepositions", "Punctuation", "Error Detection", "Modifiers & Additional Grammar",
    "Figures of Speech", "Reading Comprehension", "Vocabulary",
  ],
  // No sub-topics on purpose — tapping this subject goes straight to practice setup.
  "Logical Reasoning": [],
};

const MBBS_STRUCTURE = {
  "1st Year": {
    "Block A": ["Anatomy", "Physiology", "Biochemistry", "Histology", "Embryology", "MINORS"],
    "Block B": ["Anatomy", "Physiology", "Biochemistry", "Histology", "Embryology", "MINORS"],
    "Block C": ["Anatomy", "Physiology", "Biochemistry", "Histology", "Embryology", "MINORS"],
  },
  "2nd Year": {
    "Block D": ["Anatomy", "Biochemistry", "Physiology", "Histology", "Embryology", "MINORS"],
    "Block E": ["Anatomy", "Biochemistry", "Physiology", "Histology", "Embryology", "MINORS"],
    "Block F": ["Anatomy", "Biochemistry", "Physiology", "Histology", "Embryology", "MINORS"],
  },
};
// Display labels for each MBBS year — used at signup and anywhere the year
// needs a friendlier name than the internal MBBS_STRUCTURE key.
const MBBS_YEAR_LABELS = { "1st Year": "First Year MBBS", "2nd Year": "2nd Year MBBS" };

// ---------- MBBS nested topic / sub-topic tree (per Block → Subject) ----------
// Each subject maps to an array of "items". An item is either:
//   - a plain string  → a leaf topic. Selecting it goes straight to quiz setup,
//     matched against a question's `topic` field (same convention as MDCAT_TOPICS).
//   - { name, children: [...] } → a folder. Selecting it drills one level deeper,
//     showing its own children (which can themselves be leaves or folders).
// Any Block/Subject combination NOT listed here (e.g. Histology, Embryology,
// MINORS, or Anatomy/Biochemistry in Block F) has no topic browsing defined yet —
// tapping that subject goes straight to quiz setup, exactly like before.
const MBBS_TOPICS = {
  "Block A": {
    Anatomy: ["General Anatomy"],
    Physiology: ["Foundation Module", "BLOOD Module"],
    Biochemistry: ["Foundation Module", "BLOOD Module"],
  },
  "Block B": {
    Anatomy: [
      {
        name: "Upper limbs",
        children: ["Osteology", "Regions", "Muscles", "Brachial plexus", "Vasculatures & lymphatic system", "Joints & surface anatomy"],
      },
      {
        name: "Lower limbs",
        children: ["Osteology", "Gluteus anatomy", "Thigh anatomy", "Leg anatomy", "Foot anatomy", "Joints & surface anatomy", "Clinicals Mcqs"],
      },
    ],
    Physiology: ["Musculoskeletal system"],
    Biochemistry: ["Proteins", "Fats soluble vitamins", "Minerals"],
  },
  "Block C": {
    Anatomy: ["Thorax part I", "Thorax part II"],
    Physiology: ["Circulation", "Cardiac physiology", "Respiratory physiology"],
    Biochemistry: ["Lipid", "Enzymes"],
  },
  "Block D": {
    Anatomy: [
      {
        name: "Neuro Anatomy",
        children: [
          "Introduction of CNS and Neurons",
          "Nerve fibers and peripheral innervation",
          "Spinal cord",
          "Brain stem",
          "Cerebellum",
          "Cerebrum",
          "Cerebral cortex",
          "Reticular formation and limbic system",
          "Basal ganglia",
          "Cranial nerves nuclei",
          "Thalamus and hypothalamus",
          "Autonomic nervous system",
          "Meninges",
          "Ventricular system and CSF",
          "Development of CNS and blood supply to CNS",
        ],
      },
      {
        name: "Head and Neck",
        children: [
          "Gross anatomy of Head and Neck",
          "Gross anatomy of Brain",
          "Special Senses",
          "Cranial nerves",
        ],
      },
    ],
    Physiology: ["CNS and sensory physiology", "Motor physiology", "Special senses"],
  },
  "Block E": {
    Anatomy: ["Abdomen Anatomy"],
    Physiology: ["GIT Physiology", "Renal Physiology"],
    Biochemistry: [
      {
        name: "GIT Module",
        children: ["Carbohydrates Metabolism", "Protein Metabolism", "Lipid metabolism"],
      },
      "Renal Module",
    ],
  },
  "Block F": {
    Physiology: ["Endocrine System", "Reproductive system"],
  },
};

// Every leaf topic name nested under a given item (recursively) — used to tally
// question counts for a folder by summing across all of its descendants.
function mbbsLeafNames(item) {
  if (typeof item === "string") return [item];
  return (item.children || []).flatMap(mbbsLeafNames);
}

// Every leaf topic name for an entire Block/Subject — used by the admin forms so
// a Topic dropdown can be offered wherever a tree is defined for that subject.
function mbbsAllLeaves(block, subject) {
  const tree = (MBBS_TOPICS[block] && MBBS_TOPICS[block][subject]) || [];
  return tree.flatMap(mbbsLeafNames);
}

// Walks a folder path (array of folder names chosen so far) down the tree for a
// given Block/Subject, returning the array of items to show at that depth.
function mbbsWalk(block, subject, path) {
  let node = (MBBS_TOPICS[block] && MBBS_TOPICS[block][subject]) || [];
  for (const name of path) {
    const found = node.find((it) => typeof it !== "string" && it.name === name);
    node = found ? found.children || [] : [];
  }
  return node;
}

// ---------- Past Papers — named year/block subfolders per program ----------
// Each folder entry is either:
//   - a plain string  → a leaf folder, matched directly against a question's
//     `source` field (e.g. "KMU MDCAT 2023")
//   - { name, subfolders: [...] } → a folder that contains further named test
//     folders (e.g. "KMU CAT 2025" containing "KMU CAT 2025 First Test" etc.);
//     each subfolder name is itself matched against `source`, same as a leaf.
// Admin's Source field on the question form/bulk-upload suggests every leaf name
// (including subfolder names) so tagging stays consistent. BSN folders will be
// added once provided.
const PAST_PAPER_FOLDERS = {
  MDCAT: ["KMU MDCAT 2023", "KMU MDCAT 2024", "KMU MDCAT 2025"],
  KMUCAT: [
    "KMU CAT 2021",
    "KMU CAT 2022",
    { name: "KMU CAT 2023", subfolders: ["KMU CAT 2023 First Test", "KMU CAT 2023 2nd Test", "KMU CAT 2023 3rd Test"] },
    { name: "KMU CAT 2024", subfolders: ["KMU CAT 2024 First Test", "KMU CAT 2024 2nd Test"] },
    { name: "KMU CAT 2025", subfolders: ["KMU CAT 2025 First Test", "KMU CAT 2025 2nd Test", "KMU CAT 2025 3rd Test"] },
    { name: "KMU CAT 2026", subfolders: ["KMU CAT 2026 First Test", "KMU CAT 2026 2nd Test", "KMU CAT 2026 3rd Test"] },
  ],
  MBBS: [
    { name: "KMU Block A", subfolders: ["KMU Block A 2020", "KMU Block A 2021", "KMU Block A 2022", "KMU Block A 2023", "KMU Block A 2024"] },
    { name: "KMU Block B", subfolders: ["KMU Block B 2020", "KMU Block B 2021", "KMU Block B 2022", "KMU Block B 2023", "KMU Block B 2024"] },
    { name: "KMU Block C", subfolders: ["KMU Block C 2020", "KMU Block C 2021", "KMU Block C 2022", "KMU Block C 2023", "KMU Block C 2024"] },
    { name: "KMU Block D", subfolders: ["KMU Block D 2020", "KMU Block D 2021", "KMU Block D 2022", "KMU Block D 2023", "KMU Block D 2024"] },
    { name: "KMU Block E", subfolders: ["KMU Block E 2020", "KMU Block E 2021", "KMU Block E 2022", "KMU Block E 2023", "KMU Block E 2024"] },
    { name: "KMU Block F", subfolders: ["KMU Block F 2020", "KMU Block F 2021", "KMU Block F 2022", "KMU Block F 2023", "KMU Block F 2024"] },
    {
      name: "Internal Blocks Past Papers",
      subfolders: [
        "Internal Block A", "Internal Block B", "Internal Block C",
        "Internal Block D", "Internal Block E", "Internal Block F",
      ],
    },
  ],
  BSN: [], // to be provided later
};

// Every leaf folder name across a program (subfolder names included, parent names
// of nested folders excluded since those aren't directly taggable) — used for the
// admin Source-field suggestions.
function pastPaperLeafNames(program) {
  return (PAST_PAPER_FOLDERS[program] || []).flatMap((f) =>
    typeof f === "string" ? [f] : f.subfolders || []
  );
}

// ============================================================================
// SHARE HELPERS — every chapter / topic / folder can be shared with a friend
// via a link. Opening the link takes the friend straight to that same content
// inside the app (after they log in), and the shared message also includes a
// line inviting them to install the app.
//
// This is a PWA (installable website), so "download the app" simply means
// visiting this same site's home page and tapping "Add to Home Screen" —
// no separate Play Store link needed. Using window.location.origin means
// this always points to wherever the app is actually deployed, with no
// hardcoded URL to maintain.
// ============================================================================
function getAppDownloadUrl() {
  return typeof window !== "undefined" ? window.location.origin : "";
}

function encodeShareState(state) {
  try {
    return btoa(encodeURIComponent(JSON.stringify(state)));
  } catch {
    return "";
  }
}
function decodeShareState(encoded) {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded)));
  } catch {
    return null;
  }
}
function buildShareUrl(state) {
  if (typeof window === "undefined") return "";
  const code = encodeShareState(state);
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?share=${code}`;
}

// Opens the device's native share sheet (WhatsApp, SMS, email, etc.) when
// available; otherwise falls back to copying the link so the student can
// paste it anywhere themselves.
async function shareTarget({ label, state }) {
  const url = buildShareUrl(state);
  const text = `${label} — check this out on the app:\n${url}\n\nDon't have the app yet? Open this link and tap "Add to Home Screen" to install it: ${getAppDownloadUrl()}`;
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: label, text, url });
    } catch {
      // Student cancelled the native share sheet — nothing else to do.
    }
    return;
  }
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Link copied! You can now paste it to your friend on WhatsApp, SMS, etc.");
      return;
    } catch {}
  }
  window.prompt("Copy this link to share with a friend:", text);
}

// Small share-icon button, meant to sit inside a folder/topic card. Always
// stops the click from bubbling up to the card's own onClick (which would
// otherwise also open the folder when the student only meant to share it).
function ShareButton({ label, state, size = 16, className = "" }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        shareTarget({ label, state });
      }}
      title="Share with a friend"
      aria-label="Share with a friend"
      className={`shrink-0 p-1.5 rounded-full transition-colors hover:opacity-70 ${className}`}
      style={{ color: T.inkSoft }}
    >
      <Share2 size={size} />
    </button>
  );
}

// Small delete-icon button, meant to sit right next to a ShareButton inside a
// folder/topic card — ADMIN ONLY. Deletes every MCQ matching that folder's
// scope (the `ids` array is computed by the caller using the exact same
// filter each page already uses for its own question-count badge, so this
// only ever removes the questions actually shown as belonging to that card).
// Always confirms with the admin first and never renders for non-admins.
function DeleteMcqsButton({ label, ids, onDelete, size = 16, className = "" }) {
  const [busy, setBusy] = useState(false);
  if (!ids || ids.length === 0) return null;
  const handleClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const ok = window.confirm(
      `Delete ALL ${ids.length} MCQ${ids.length === 1 ? "" : "s"} under "${label}"?\n\nThis cannot be undone.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      await onDelete(ids);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title={`Delete all MCQs under "${label}" (admin only)`}
      aria-label={`Delete all MCQs under ${label}`}
      className={`shrink-0 p-1.5 rounded-full transition-colors hover:opacity-70 disabled:opacity-40 ${className}`}
      style={{ color: T.rose }}
    >
      <Trash2 size={size} />
    </button>
  );
}

// ---------- FLP (Full Length Paper) — fixed, admin-built exam papers ----------
// Only offered for MDCAT and KMU CAT (per the admin's request) — MBBS/BSN
// don't show an FLP tab at all.
const FLP_PROGRAMS = ["MDCAT", "KMUCAT"];

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
//
// loadBank() return values, and why they're 3-way instead of 2-way:
//   - an array            → the real bank, loaded successfully (may be empty [] on purpose)
//   - null                → Supabase was reached fine and confirmed there is genuinely no
//                           bank yet (brand new project) — safe to seed demo questions
//   - false                → the fetch itself FAILED (network/timeout/Supabase error) — this
//                           is NOT the same as "no data exists" and must never trigger seeding
//
// The original bug: loadBank() used to return null for BOTH "no data" and "fetch failed",
// so a single dropped request could make the app think the bank was empty and silently
// overwrite the real question bank with 8 demo questions.
async function loadBank() {
  // Try the Cloudflare CDN first (free, fast bandwidth). Only trust it if it
  // actually has data — an empty [] there just means nothing has been synced
  // to the CDN yet, in which case we fall through to Supabase (the real
  // source of truth) instead of wrongly treating it as "no bank exists".
  try {
    const res = await fetch(`${CDN_BASE}/bank`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (e) {
    console.error("CDN bank fetch failed, falling back to Supabase:", e);
  }
  try {
    const { data, error } = await supabase.from("app_data").select("bank").eq("id", 1).maybeSingle();
    if (error) throw error;
    return data && data.bank ? data.bank : null;
  } catch (e) {
    console.error("Load bank failed (network/Supabase error) — NOT treating this as an empty bank:", e);
    return false;
  }
}

// ---- Bandwidth saver: only re-download the (large) question bank when it has
// actually changed. bank_version is a tiny integer column on app_data that gets
// bumped every time saveBank() succeeds. Checking it first is a near-free request
// (a handful of bytes) instead of re-downloading the entire multi-MB bank on
// every single app open, which was the main driver of Supabase egress usage.
async function loadBankVersion() {
  try {
    const res = await fetch(`${CDN_BASE}/bank-version`);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.version === "number") return data.version;
    }
  } catch (e) {
    console.error("CDN bank-version fetch failed, falling back to Supabase:", e);
  }
  try {
    const { data, error } = await supabase.from("app_data").select("bank_version").eq("id", 1).maybeSingle();
    if (error) throw error;
    return data && typeof data.bank_version === "number" ? data.bank_version : null;
  } catch (e) {
    console.error("Load bank_version failed:", e);
    return null;
  }
}
function loadLocalBankVersion() {
  try {
    const v = localStorage.getItem("mdcat-bank-version");
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}
function saveLocalBankVersion(v) {
  try {
    if (typeof v === "number") localStorage.setItem("mdcat-bank-version", String(v));
  } catch {}
}
function clearLocalBankVersion() {
  try {
    localStorage.removeItem("mdcat-bank-version");
  } catch {}
}

// Tracks the last known-good bank size in this browser tab, so saveBank() can refuse a
// save that would suddenly wipe out most of the question bank in one go — a save that
// large is almost always an accident (a bad load, a bug, a bad merge), not an intentional
// edit. Genuine bulk deletes (which already ask for confirmation) pass { force: true }.
let lastKnownBankLength = null;

// Tracks the bank_version this browser tab last saw from SUPABASE specifically
// (NOT the Cloudflare CDN's separate KV version counter below — those are two
// different counters that increment independently). Used as an optimistic-
// concurrency check: if some OTHER tab/device has changed the bank in Supabase
// since we last saw it, we refuse to blindly overwrite with our own (now-stale)
// copy. Keeping this Supabase-only (instead of mixing in the CDN's number, which
// can lag behind on a slow connection even for OUR OWN just-completed save) is
// what stops a slow/flaky network from ever triggering a false "changed
// elsewhere" warning against ourselves.
let lastKnownSupabaseBankVersion = null;

// Tracks the bank_version this browser tab last saw (either from its initial load,
// or right after this tab itself last saved). Used as an optimistic-concurrency
// check: if some OTHER tab/device has changed the bank since we last saw it, we
// refuse to blindly overwrite with our own (now-stale) copy. Without this, an
// admin editing from two tabs/devices at once could have an old tab's stale bank
// silently "resurrect" MCQs that were just deleted in the other tab.
let lastKnownBankVersion = null;

// Pushes the given bank to the Cloudflare CDN Worker. Used after every
// Supabase write (add/edit/delete) so the CDN copy that students actually
// read from stays in sync. Supabase remains the real save in all cases —
// this only affects how fast the CDN catches up, never data safety.
// Retries on failure: on a slow mobile connection the PUT can time out
// client-side even though it actually reached and succeeded on the server —
// a retry clears up most of those false "sync failed" alerts without risking
// a duplicate write (the PUT always replaces the bank with this exact same
// payload, so re-sending it is always safe). Bumped from 3 to 5 attempts with
// a longer backoff between them (up to 8s), since on a genuinely slow/flaky
// connection (a few hundred KB/s or less) a multi-MB payload needs more room
// to eventually get through than 3 quick retries gave it.
async function pushBankToCdn(bank, attempt = 1) {
  let lastError = null;
  try {
    const body = JSON.stringify(bank);
    const cdnRes = await fetch(`${CDN_BASE}/bank`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-admin-key": CDN_ADMIN_KEY },
      body,
    });
    if (cdnRes.ok) {
      const cdnData = await cdnRes.json();
      return { version: typeof cdnData.version === "number" ? cdnData.version : null, error: null };
    }
    // Try to read the response body for a real reason (e.g. Cloudflare KV's
    // 25MB per-value limit being hit as the bank grows) instead of just a
    // status code — this is what actually shows up in the "sync failed"
    // alert now, so it says WHY instead of just "check your connection".
    let bodyText = "";
    try { bodyText = await cdnRes.text(); } catch {}
    lastError = `HTTP ${cdnRes.status}${bodyText ? ": " + bodyText.slice(0, 200) : ""}`;
    console.error("CDN bank push failed with status:", cdnRes.status, bodyText);
  } catch (e) {
    lastError = e?.message || String(e);
    console.error("CDN bank push failed:", e);
  }
  if (attempt < 5) {
    await new Promise((r) => setTimeout(r, Math.min(attempt * 2000, 8000)));
    return pushBankToCdn(bank, attempt + 1);
  }
  return { version: null, error: lastError };
}

async function saveBank(bank, opts = {}) {
  const newLen = Array.isArray(bank) ? bank.length : 0;
  if (!opts.force && lastKnownBankLength !== null && lastKnownBankLength >= 10 && newLen < lastKnownBankLength * 0.5) {
    console.error(
      `saveBank blocked: this save would shrink the question bank from ${lastKnownBankLength} to ${newLen} questions in one go. ` +
      `That looks like an accidental wipe rather than an intentional edit, so nothing was saved. ` +
      `If this drop really is intentional, delete in smaller batches, or confirm through the bulk-delete flow.`
    );
    return "blocked";
  }
  // Concurrency check: has someone else (another tab/device) saved since we last loaded?
  // Checks Supabase's own bank_version directly — NOT the CDN's separate version
  // counter — so a slow/flaky connection to the CDN can never cause this to
  // fire against our own edits.
  //
  // Fails CLOSED on a network error here (blocks the save) rather than fails
  // open. This used to fail open — proceed with the save if the check itself
  // couldn't be reached — on the theory that a transient network hiccup
  // shouldn't block an edit. In practice, on a slow/unstable connection that
  // meant: an admin tab left open with an older, in-memory copy of the bank
  // (e.g. from before another device added a new program's questions) could
  // silently overwrite the live bank with that stale copy whenever this
  // specific check happened to fail to reach Supabase — with no warning.
  // That's a much worse outcome than occasionally asking the admin to retry
  // a save, so this now blocks whenever the check can't be verified.
  if (!opts.force && lastKnownSupabaseBankVersion !== null) {
    try {
      const { data, error } = await supabase.from("app_data").select("bank_version").eq("id", 1).maybeSingle();
      if (error) throw error;
      const currentRemoteVersion = data && typeof data.bank_version === "number" ? data.bank_version : null;
      if (currentRemoteVersion !== null && currentRemoteVersion !== lastKnownSupabaseBankVersion) {
        alert(
          "This question bank was changed elsewhere (another tab or device) since this screen loaded your copy. " +
          "To avoid undoing that change or bringing back a deleted question, please reload the app and try your edit again."
        );
        return "stale";
      }
    } catch (e) {
      console.error("Could not verify bank_version before saving — blocking this save rather than risking an overwrite:", e);
      alert(
        "Couldn't confirm this is the latest version of the question bank (connection issue) — nothing was saved, " +
        "to avoid the risk of overwriting a change made elsewhere. Please check your connection and try again."
      );
      return "stale";
    }
  }
  const ok = await saveSharedData({ bank });
  if (ok) {
    lastKnownBankLength = newLen;
    const cacheSaved = await saveLocalBankCache(bank);
    // Bump bank_version so every student's app knows to re-download the fresh
    // bank next time it opens, instead of everyone re-downloading on every open.
    // This part always runs, regardless of whether OUR OWN local cache below
    // fit in this browser's storage — other devices still need the real signal.
    try {
      const { data } = await supabase.from("app_data").select("bank_version").eq("id", 1).maybeSingle();
      const nextVersion = (data && typeof data.bank_version === "number" ? data.bank_version : 0) + 1;
      await supabase.from("app_data").update({ bank_version: nextVersion }).eq("id", 1);
      lastKnownSupabaseBankVersion = nextVersion;
      // Only record this version as "ours" if our own local cache actually
      // saved successfully — otherwise this same device would wrongly trust
      // its own stale/incomplete cache next time it opens the app.
      if (cacheSaved) {
        saveLocalBankVersion(nextVersion);
      } else {
        clearLocalBankVersion();
      }
    } catch (e) {
      console.error("Could not bump bank_version (bank still saved fine):", e);
    }
    // Push the fresh bank up to the Cloudflare CDN so every student's app can
    // keep reading it from there (free bandwidth) instead of from Supabase.
    // Supabase above is still the real save — if this CDN push fails, the
    // data is NOT lost, students just keep serving the previous CDN copy
    // until the next successful save retries this.
    const { version: cdnVersion } = await pushBankToCdn(bank);
    if (cdnVersion !== null) lastKnownBankVersion = cdnVersion;
  }
  return ok;
}
async function loadPasscode() {
  const data = await loadSharedData();
  return data && data.passcode ? data.passcode : null;
}
async function savePasscode(pc) {
  return await saveSharedData({ passcode: pc });
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
// complete=true only if question + all options (4, or 5 when a 5th "E)" option
// is present — MBBS past papers sometimes have one) + answer letter + explanation
// were all found.
function parseQuestionBlock(block) {
  const withoutQNum = block.replace(/^Q\s*\d+\s*\)\s*/, "");

  const optRegex = /(?:^|\n)\s*([A-E])\s*[).]\s*/g;
  const optPositions = [];
  let m;
  while ((m = optRegex.exec(withoutQNum)) !== null) {
    optPositions.push({ letter: m[1], markerStart: m.index, contentStart: m.index + m[0].length });
  }

  if (optPositions.length < 4) {
    return { complete: false, question: "", options: [], correct: null, explanation: "", rawBlock: block };
  }

  const questionText = withoutQNum.slice(0, optPositions[0].markerStart).replace(/\n/g, " ").trim();

  const answerMatch = withoutQNum.match(/Answer\s*[:\-]\s*([A-E])/i);
  const explanationMatch = withoutQNum.match(/Explanation\s*[:\-]\s*([\s\S]*)$/i);

  const stopIndex = answerMatch ? withoutQNum.indexOf(answerMatch[0]) : withoutQNum.length;

  const options = [];
  for (let i = 0; i < optPositions.length; i++) {
    const startIdx = optPositions[i].contentStart;
    const endIdx = i + 1 < optPositions.length ? optPositions[i + 1].markerStart : stopIndex;
    const optText = withoutQNum.slice(startIdx, Math.max(startIdx, endIdx)).replace(/\n/g, " ").trim();
    options.push(optText);
  }

  const correct = answerMatch ? "ABCDE".indexOf(answerMatch[1].toUpperCase()) : null;
  const explanation = explanationMatch ? explanationMatch[1].replace(/\n/g, " ").trim() : "";

  const hasQuestion = questionText.length > 0;
  const hasAllOptions = options.every((o) => o.length > 0);
  const complete = hasQuestion && hasAllOptions && correct !== null && correct >= 0 && explanation.length > 0;

  return { complete, question: questionText, options, correct, explanation, rawBlock: block };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// True random shuffle (Fisher–Yates) — used so the same subject/topic doesn't
// always serve questions in the same fixed order every time someone practices.
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Shuffles a question's option order (A/B/C/D) so the correct answer isn't always
// in the same position on repeat attempts — remaps `correct` to match the new order.
function shuffleQuestionOptions(q) {
  const order = shuffleArray(q.options.map((_, i) => i));
  return { ...q, options: order.map((i) => q.options[i]), correct: order.indexOf(q.correct) };
}

// ---------- WhatsApp brand icon ----------
// lucide-react (the icon set this app uses) doesn't include brand/logo icons,
// so the recognizable WhatsApp glyph is drawn inline here instead of pulling
// in a whole extra icon-package dependency for one icon.
function WhatsAppIcon({ size = 20, color = "#fff" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M16.004 3C9.377 3 4 8.373 4 15c0 2.34.657 4.527 1.797 6.39L3 29l7.86-2.06A11.94 11.94 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3zm0 21.7c-1.98 0-3.83-.55-5.41-1.5l-.39-.23-4.66 1.22 1.24-4.54-.25-.4A9.66 9.66 0 0 1 5.3 15c0-5.9 4.8-10.7 10.7-10.7S26.7 9.1 26.7 15 21.9 24.7 16 24.7zm5.87-8.02c-.32-.16-1.9-.94-2.2-1.05-.3-.11-.51-.16-.73.16-.21.32-.84 1.05-1.03 1.26-.19.21-.38.24-.7.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.9-1.78-2.22-.19-.32-.02-.49.14-.65.14-.14.32-.38.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.73-1.76-1-2.41-.26-.63-.53-.54-.73-.55h-.62c-.21 0-.56.08-.85.4-.29.32-1.12 1.1-1.12 2.67 0 1.57 1.15 3.09 1.31 3.3.16.21 2.26 3.45 5.47 4.84.76.33 1.36.53 1.82.67.77.24 1.46.21 2.01.13.61-.09 1.9-.78 2.17-1.53.27-.75.27-1.4.19-1.53-.08-.13-.29-.21-.61-.37z" />
    </svg>
  );
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
function BottomNav({ tab, setTab, onSaved, userCourse }) {
  const items = [
    { key: "home", label: "Home", icon: HomeIcon },
    { key: "pastpapers", label: "Past Papers", icon: FileText },
    // FLP only exists for MDCAT and KMU CAT — hidden from the nav entirely
    // for every other course instead of showing an empty/"coming soon" tab.
    ...(FLP_PROGRAMS.includes(userCourse) ? [{ key: "flp", label: "FLP", icon: FileCheck2 }] : []),
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

// ---------- Simple info folder pages: Reviews / Syllabus / Guidelines ----------
// These render inside Home's navTab switcher, so BottomNav (with its own Home button)
// is already shown alongside them — see the "reviews"/"syllabus"/"guidelines" cases in Home().
function InfoFolderPage({ title, icon: Icon, color, onBack, children }) {
  return (
    <div className="min-h-screen pb-20" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <button onClick={onBack} className="flex items-center gap-1 text-sm mb-6" style={{ color: T.inkSoft }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex items-center gap-3 mb-6">
          <div
            className="flex items-center justify-center shrink-0"
            style={{ width: 48, height: 48, borderRadius: "50%", background: color }}
          >
            <Icon size={22} style={{ color: "#fff" }} />
          </div>
          <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- Generic admin-editable content list (used for Syllabus & Guidelines) ----------
// Everyone can read the items. The "+ Add item" form only renders when isAdmin is true.
// Items are organised into a folder per program (MDCAT / KMU CAT / MBBS / BSN) — pick a
// program first, then see/add items just for that program, same pattern as Notes.
function ContentListPage({ title, icon: Icon, color, items, isAdmin, onAdd, onRemove, onBack, emptyText, addLabel, programs }) {
  const [prog, setProg] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", type: "link", value: "" });

  const submit = async () => {
    if (!form.title.trim() || !form.value.trim()) {
      alert(`Please fill in the title and ${form.type === "text" ? "content" : "link"}.`);
      return;
    }
    await onAdd({ title: form.title.trim(), type: form.type, value: form.value.trim(), program: prog });
    setForm({ title: "", type: "link", value: "" });
    setShowForm(false);
  };

  // Step 1: choose a program folder (e.g. "MDCAT Syllabus", "BSN Syllabus", …)
  if (!prog) {
    return (
      <InfoFolderPage title={title} icon={Icon} color={color} onBack={onBack}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(programs || []).map((p) => {
            const PIcon = p.icon;
            const n = (items || []).filter((it) => it.program === p.key).length;
            return (
              <button
                key={p.key}
                disabled={n === 0 && !isAdmin}
                onClick={() => setProg(p.key)}
                className="text-left p-5 flex items-center gap-3 disabled:opacity-40"
                style={{ background: T.card, border: `1px solid ${T.line}` }}
              >
                <PIcon size={22} />
                <div>
                  <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{p.label}</div>
                  <div className="text-xs" style={{ color: T.inkSoft }}>{n} item{n === 1 ? "" : "s"}</div>
                </div>
              </button>
            );
          })}
        </div>
      </InfoFolderPage>
    );
  }

  // Step 2: items inside the chosen program's folder
  const progInfo = (programs || []).find((p) => p.key === prog);
  const progItems = (items || []).filter((it) => it.program === prog);

  return (
    <InfoFolderPage title={`${title} — ${progInfo ? progInfo.label : prog}`} icon={Icon} color={color} onBack={() => setProg(null)}>
      {isAdmin && (
        <div className="mb-6">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 text-sm px-4 py-2"
              style={{ background: T.ink, color: T.paper }}
            >
              <Plus size={14} /> {addLabel || "Add item"}
            </button>
          ) : (
            <div className="p-4 space-y-3" style={{ background: T.card, border: `1px solid ${T.line}` }}>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Title"
                className="w-full px-3 py-2"
                style={{ border: `1px solid ${T.line}`, background: T.paper, color: T.ink }}
              />
              <div className="flex gap-2">
                {["link", "pdf", "text"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm({ ...form, type: t })}
                    className="px-3 py-1.5 text-xs uppercase"
                    style={{
                      border: `1px solid ${T.ink}`,
                      background: form.type === t ? T.ink : "transparent",
                      color: form.type === t ? T.paper : T.ink,
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {form.type === "text" ? (
                <textarea
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  rows={4}
                  placeholder="Write the content…"
                  className="w-full px-3 py-2"
                  style={{ border: `1px solid ${T.line}`, background: T.paper, color: T.ink }}
                />
              ) : (
                <input
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder={form.type === "pdf" ? "PDF link (e.g. Google Drive share link)" : "https://…"}
                  className="w-full px-3 py-2"
                  style={{ border: `1px solid ${T.line}`, background: T.paper, color: T.ink }}
                />
              )}
              <div className="flex gap-2">
                <button onClick={submit} className="px-4 py-2 text-sm" style={{ background: T.emerald, color: "#fff" }}>
                  Save
                </button>
                <button
                  onClick={() => { setShowForm(false); setForm({ title: "", type: "link", value: "" }); }}
                  className="px-4 py-2 text-sm"
                  style={{ border: `1px solid ${T.ink}` }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {(!progItems || progItems.length === 0) ? (
        <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>{emptyText}</div>
      ) : (
        <div className="space-y-3">
          {progItems.map((it) => (
            <div key={it.id} className="p-4 flex items-start justify-between gap-3" style={{ background: T.card, border: `1px solid ${T.line}` }}>
              <div className="flex-1 min-w-0">
                <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }} className="mb-1">{it.title}</div>
                {it.type === "text" ? (
                  <div className="text-sm whitespace-pre-wrap" style={{ color: T.inkSoft }}>{it.value}</div>
                ) : (
                  <a href={it.value} target="_blank" rel="noreferrer" className="text-sm break-all" style={{ color: "#6FA3F5" }}>
                    {it.type === "pdf" ? "📄 " : "🔗 "}{it.value}
                  </a>
                )}
              </div>
              {isAdmin && (
                <button onClick={() => onRemove(it.id)} className="p-2 shrink-0" style={{ border: `1px solid ${T.rose}`, color: T.rose }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </InfoFolderPage>
  );
}

// ---------- Reviews: every signed-in student can post one, everyone can read all of them ----------
function ReviewsPage({ onBack, reviews, userName, onAdd, onLike, onReply, onDelete, onToggleProgram, isAdmin }) {
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");

  const submit = async () => {
    if (!text.trim()) {
      alert("Please write a short review first.");
      return;
    }
    await onAdd({ name: userName || "Student", rating, text: text.trim() });
    setText("");
    setRating(5);
    setShowForm(false);
  };

  const sorted = [...(reviews || [])].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  return (
    <InfoFolderPage title="Reviews" icon={Star} color="#B5822A" onBack={onBack}>
      <div className="mb-6">
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 text-sm px-4 py-2"
            style={{ background: T.ink, color: T.paper }}
          >
            <Plus size={14} /> Write a review
          </button>
        ) : (
          <div className="p-4 space-y-3" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)}>
                  <Star size={22} style={{ color: n <= rating ? T.amber : T.inkSoft }} fill={n <= rating ? T.amber : "none"} />
                </button>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Share your experience…"
              className="w-full px-3 py-2"
              style={{ border: `1px solid ${T.line}`, background: T.paper, color: T.ink }}
            />
            <div className="flex gap-2">
              <button onClick={submit} className="px-4 py-2 text-sm" style={{ background: T.emerald, color: "#fff" }}>
                Post review
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm" style={{ border: `1px solid ${T.ink}` }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
          No reviews yet — be the first to share your experience!
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((r) => {
            const liked = userName && (r.likes || []).includes(userName);
            const likeCount = (r.likes || []).length;
            return (
              <div key={r.id} className="p-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                <div className="flex items-center justify-between mb-1">
                  <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{r.name}</div>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} size={13} style={{ color: n <= r.rating ? T.amber : T.inkSoft }} fill={n <= r.rating ? T.amber : "none"} />
                    ))}
                  </div>
                </div>
                <div className="text-sm mb-2" style={{ color: T.inkSoft }}>{r.text}</div>

                {isAdmin && (
                  <div className="mb-2">
                    <div className="text-xs mb-1" style={{ color: (r.programs || (r.program ? [r.program] : [])).length ? T.inkSoft : T.rose, fontFamily: "'IBM Plex Mono', monospace" }}>
                      Visible to: {(r.programs || (r.program ? [r.program] : [])).length ? (r.programs || [r.program]).join(", ") : "nobody — unassigned"}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const current = r.programs || (r.program ? [r.program] : []);
                        return (
                          <>
                            <label className="flex items-center gap-1 text-xs px-2 py-1 cursor-pointer select-none" style={{ border: `1px solid ${current.includes("All") ? T.emerald : T.line}`, color: current.includes("All") ? T.emerald : T.inkSoft }}>
                              <input type="checkbox" checked={current.includes("All")} onChange={() => onToggleProgram(r.id, "All")} className="hidden" />
                              All courses
                            </label>
                            {COURSES.map((c) => (
                              <label
                                key={c.key}
                                className="flex items-center gap-1 text-xs px-2 py-1 cursor-pointer select-none"
                                style={{ border: `1px solid ${current.includes(c.key) ? T.emerald : T.line}`, color: current.includes(c.key) ? T.emerald : T.inkSoft, opacity: current.includes("All") ? 0.4 : 1 }}
                              >
                                <input type="checkbox" checked={current.includes(c.key)} disabled={current.includes("All")} onChange={() => onToggleProgram(r.id, c.key)} className="hidden" />
                                {c.label}
                              </label>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {r.adminReply && (
                  <div className="mt-2 mb-2 p-2 text-sm" style={{ background: T.paper, borderLeft: `2px solid ${T.emerald}` }}>
                    <div className="text-xs mb-1" style={{ color: T.emerald, fontFamily: "'IBM Plex Mono', monospace" }}>
                      Admin reply
                    </div>
                    {r.adminReply.text}
                  </div>
                )}

                <div className="flex items-center gap-3 mt-2">
                  <button
                    onClick={() => onLike(r.id)}
                    className="flex items-center gap-1 text-xs"
                    style={{ color: liked ? T.emerald : T.inkSoft }}
                  >
                    <Star size={12} fill={liked ? T.emerald : "none"} /> {likeCount > 0 ? likeCount : "Like"}
                  </button>
                  {isAdmin && !r.adminReply && (
                    <AdminReplyInline onSubmit={(text) => onReply(r.id, text)} />
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => {
                        if (window.confirm("Delete this review? This cannot be undone.")) {
                          onDelete(r.id);
                        }
                      }}
                      className="flex items-center gap-1 text-xs"
                      style={{ color: T.rose }}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </InfoFolderPage>
  );
}

// ---------- Notes: browse by program -> subject -> note ----------
function NotesFlow({ notesBank, programs, onExit, isAdmin, onAddNote }) {
  // step: "program" (only shown if the student has more than one visible program) -> "subject" -> "note"
  const [prog, setProg] = useState(programs.length === 1 ? programs[0].key : null);
  const [subject, setSubject] = useState(null);
  const [noteId, setNoteId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNote, setNewNote] = useState({ title: "", type: "text", content: "" });
  const [pdfUploading, setPdfUploading] = useState(false);

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
          {note.type === "pdf" ? (
            <a
              href={note.content}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-3 text-sm"
              style={{ background: T.card, border: `1px solid ${T.line}`, color: "#6FA3F5" }}
            >
              <FileText size={16} /> Open PDF
            </a>
          ) : (
            <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
              {note.content}
            </div>
          )}
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

          {isAdmin && (
            <div className="mb-6">
              {!showAddForm ? (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-2 text-sm px-4 py-2"
                  style={{ background: T.ink, color: T.paper }}
                >
                  <Plus size={14} /> Add note here
                </button>
              ) : (
                <div className="p-4 space-y-3" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                  <input
                    value={newNote.title}
                    onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                    placeholder="Note title"
                    className="w-full px-3 py-2"
                    style={{ border: `1px solid ${T.line}`, background: T.paper, color: T.ink }}
                  />
                  <div className="flex gap-2">
                    {["text", "pdf"].map((t) => (
                      <button
                        key={t}
                        onClick={() => setNewNote({ ...newNote, type: t, content: "" })}
                        className="px-3 py-1.5 text-xs uppercase"
                        style={{
                          border: `1px solid ${T.ink}`,
                          background: newNote.type === t ? T.ink : "transparent",
                          color: newNote.type === t ? T.paper : T.ink,
                        }}
                      >
                        {t === "pdf" ? "PDF file" : "Written text"}
                      </button>
                    ))}
                  </div>
                  {newNote.type === "pdf" ? (
                    <div>
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setPdfUploading(true);
                          const { url, error } = await uploadNotePdf(file);
                          setPdfUploading(false);
                          if (!url) {
                            alert("Could not upload this PDF. Make sure a public 'notes-pdfs' Storage bucket exists in Supabase, then try again.\n\n" + (error?.message || ""));
                            return;
                          }
                          setNewNote((prevNote) => ({ ...prevNote, content: url }));
                        }}
                        className="w-full text-sm"
                        style={{ color: T.ink }}
                      />
                      {pdfUploading && <div className="text-xs mt-1" style={{ color: T.inkSoft }}>Uploading PDF…</div>}
                      {!pdfUploading && newNote.content && (
                        <div className="text-xs mt-1" style={{ color: T.emerald }}>✓ PDF uploaded — ready to save.</div>
                      )}
                    </div>
                  ) : (
                    <textarea
                      value={newNote.content}
                      onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                      rows={6}
                      placeholder="Write or paste the note content…"
                      className="w-full px-3 py-2"
                      style={{ border: `1px solid ${T.line}`, background: T.paper, color: T.ink }}
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!newNote.title.trim() || !newNote.content.trim()) {
                          alert(newNote.type === "pdf" ? "Please choose a title and upload a PDF." : "Please fill in the title and content.");
                          return;
                        }
                        await onAddNote(prog, subject, newNote.title.trim(), newNote.content.trim(), newNote.type);
                        setNewNote({ title: "", type: "text", content: "" });
                        setShowAddForm(false);
                      }}
                      disabled={pdfUploading}
                      className="px-4 py-2 text-sm disabled:opacity-50"
                      style={{ background: T.emerald, color: "#fff" }}
                    >
                      Save note
                    </button>
                    <button
                      onClick={() => { setShowAddForm(false); setNewNote({ title: "", type: "text", content: "" }); }}
                      className="px-4 py-2 text-sm"
                      style={{ border: `1px solid ${T.ink}` }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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
                  {n.type === "pdf" ? (
                    <FileText size={18} style={{ color: "#6FA3F5" }} />
                  ) : (
                    <StickyNote size={18} style={{ color: T.amber }} />
                  )}
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
          (n.type !== "pdf" && (n.content || "").toLowerCase().includes(query))
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
                  {["A", "B", "C", "D", "E"][i]}. {opt}
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
            {openNote.type === "pdf" ? (
              <a
                href={openNote.content}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm"
                style={{ background: T.paper, border: `1px solid ${T.line}`, color: "#6FA3F5" }}
              >
                <FileText size={16} /> Open PDF
              </a>
            ) : (
              <div className="text-sm whitespace-pre-wrap">{openNote.content}</div>
            )}
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
function LeaderboardView({ onBack, currentUserName, userCourse, userMbbsYear }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      // Course- (and for MBBS, year-) scoped boards always read straight from
      // Supabase with the filter applied server-side — see loadLeaderboard.
      const data = await loadLeaderboard(50, userCourse ? { course: userCourse, mbbsYear: userMbbsYear } : null);
      setRows(data);
      setError(data.length === 0);
      setLoading(false);
    })();
  }, [userCourse, userMbbsYear]);

  const medalColor = (i) => (i === 0 ? "#D4AF37" : i === 1 ? "#B7C0C7" : i === 2 ? "#C9793C" : T.inkSoft);
  const scopeLabel = userCourse ? `${userCourse}${userMbbsYear ? ` — ${MBBS_YEAR_LABELS[userMbbsYear] || userMbbsYear}` : ""}` : null;

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
        <p className="text-sm mb-6" style={{ color: T.inkSoft }}>Ranked by total correct answers{scopeLabel ? ` among ${scopeLabel} students` : " across all students"}.</p>

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
function ContactUsPage({ onBack, contactItems, isAdmin, onAddContact, onRemoveContact, socialLinks, onUpdateSocialLink }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", value: "" });
  const [editingSocial, setEditingSocial] = useState(null);
  const [socialUrl, setSocialUrl] = useState("");

  const submit = async () => {
    if (!form.title.trim() || !form.value.trim()) {
      alert("Please fill in the label and the WhatsApp number / link.");
      return;
    }
    await onAddContact({ title: form.title.trim(), value: form.value.trim() });
    setForm({ title: "", value: "" });
    setShowForm(false);
  };

  const startEditSocial = (label) => {
    setEditingSocial(label);
    setSocialUrl((socialLinks && socialLinks[label]) || "");
  };
  const saveSocial = async (label) => {
    await onUpdateSocialLink(label, socialUrl.trim());
    setEditingSocial(null);
  };

  return (
    <div className="min-h-screen pb-20" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-md mx-auto px-6 py-10">
        <button onClick={onBack} className="flex items-center gap-1 text-sm mb-6" style={{ color: T.inkSoft }}>
          <ArrowLeft size={16} /> Back
        </button>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl mb-1">Contact Us</h1>
        <p className="text-sm mb-6" style={{ color: T.inkSoft }}>Reach out to us — tap a link below to start chatting.</p>

        {isAdmin && (
          <div className="mb-4">
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 text-sm px-4 py-2"
                style={{ background: T.ink, color: T.paper }}
              >
                <Plus size={14} /> Add contact link
              </button>
            ) : (
              <div className="p-4 space-y-3" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Label (e.g. Support Line 1)"
                  className="w-full px-3 py-2"
                  style={{ border: `1px solid ${T.line}`, background: T.paper, color: T.ink }}
                />
                <input
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder="https://wa.me/92XXXXXXXXXX or any link"
                  className="w-full px-3 py-2"
                  style={{ border: `1px solid ${T.line}`, background: T.paper, color: T.ink }}
                />
                <div className="flex gap-2">
                  <button onClick={submit} className="px-4 py-2 text-sm" style={{ background: T.emerald, color: "#fff" }}>Save</button>
                  <button
                    onClick={() => { setShowForm(false); setForm({ title: "", value: "" }); }}
                    className="px-4 py-2 text-sm"
                    style={{ border: `1px solid ${T.ink}` }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Non-admin students only see this block if there's actually something to show */}
        {(isAdmin || (contactItems && contactItems.length > 0)) && (
          (!contactItems || contactItems.length === 0) ? (
            <div className="p-6 text-sm mb-10" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
              No contact links added yet.
            </div>
          ) : (
            <div className="space-y-3 mb-10">
              {contactItems.map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <a
                    href={c.value}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 flex items-center gap-4 p-4 min-w-0"
                    style={{ background: T.card, border: `1px solid ${T.line}`, textDecoration: "none", color: T.ink }}
                  >
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{ width: 44, height: 44, borderRadius: "50%", background: T.emerald }}
                    >
                      <MessageCircle size={20} style={{ color: "#fff" }} />
                    </div>
                    <div className="min-w-0">
                      <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{c.title}</div>
                      <div className="text-sm truncate" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>{c.value}</div>
                    </div>
                  </a>
                  {isAdmin && (
                    <button onClick={() => onRemoveContact(c.id)} className="p-2 shrink-0" style={{ border: `1px solid ${T.rose}`, color: T.rose }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-lg mb-1">Follow & Join Us</h2>
        {isAdmin && (
          <p className="text-xs mb-4" style={{ color: T.inkSoft }}>
            Tap the pencil on any card below to set or update its link.
          </p>
        )}
        <div className="space-y-3">
          {SOCIAL_LINKS.map((s) => {
            const Icon = s.icon;
            const url = (socialLinks && socialLinks[s.label]) || "";
            const isEditing = editingSocial === s.label;
            return (
              <div key={s.label}>
                <div className="flex items-center gap-3">
                  <a
                    href={url || "#"}
                    target={url ? "_blank" : undefined}
                    rel="noreferrer"
                    onClick={(e) => { if (!url) e.preventDefault(); }}
                    className="flex-1 flex items-center gap-4 p-4 min-w-0"
                    style={{ background: T.card, border: `1px solid ${T.line}`, textDecoration: "none", color: T.ink, opacity: url ? 1 : 0.6 }}
                  >
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{ width: 44, height: 44, borderRadius: "50%", background: s.color }}
                    >
                      <Icon size={20} style={{ color: "#fff" }} />
                    </div>
                    <div className="min-w-0">
                      <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{s.label}</div>
                      <div className="text-sm truncate" style={{ color: T.inkSoft }}>{url || s.sub}</div>
                    </div>
                  </a>
                  {isAdmin && (
                    <button onClick={() => startEditSocial(s.label)} className="p-2 shrink-0" style={{ border: `1px solid ${T.ink}` }}>
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
                {isAdmin && isEditing && (
                  <div className="p-3 mt-2 flex gap-2" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                    <input
                      value={socialUrl}
                      onChange={(e) => setSocialUrl(e.target.value)}
                      placeholder="https://…"
                      className="flex-1 px-3 py-2 text-sm"
                      style={{ border: `1px solid ${T.line}`, background: T.paper, color: T.ink }}
                    />
                    <button onClick={() => saveSocial(s.label)} className="px-3 py-2 text-sm" style={{ background: T.emerald, color: "#fff" }}>Save</button>
                    <button onClick={() => setEditingSocial(null)} className="px-3 py-2 text-sm" style={{ border: `1px solid ${T.ink}` }}>Cancel</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- Home: dashboard ----------
// ---------- Browser notification permission (reminder toggle in Settings) ----------
// Note: this only fires a notification while the app tab is open in a browser that
// supports the Notification API — it isn't a true server-sent push notification
// that can wake up a closed app, since that needs a push server + service worker.
// Converts the VAPID public key (base64url string) into the Uint8Array format
// the browser's PushManager API requires.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function NotificationPermissionRow({ userId, userCourse }) {
  const pushSupported =
    typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  const [permission, setPermission] = useState(pushSupported ? Notification.permission : "unsupported");
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    if (!pushSupported || busy) return;
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;

      // Real Web Push: this keeps working even if the app/browser is fully
      // closed, unlike a plain in-page Notification (which only fires while
      // this tab is open).
      if (!VAPID_PUBLIC_KEY) {
        console.error("Push not configured: VAPID_PUBLIC_KEY is empty. See SETUP.md.");
        alert("Push notifications aren't fully set up yet on the server side — ask the admin to finish the setup steps.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      const json = sub.toJSON();
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: userId || null,
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          course: userCourse || null,
        },
        { onConflict: "endpoint" }
      );
      if (error) throw error;
    } catch (e) {
      console.error("Enabling push notifications failed:", e);
      alert("Couldn't enable phone notifications — check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!pushSupported) return null;

  return (
    <div className="p-5 mb-4 flex items-center justify-between gap-3" style={{ background: T.card, border: `1px solid ${T.line}` }}>
      <div>
        <div className="text-sm flex items-center gap-2" style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>
          <BellRing size={14} /> Push notifications
        </div>
        <div className="text-xs mt-1" style={{ color: T.inkSoft }}>
          {permission === "granted"
            ? "Enabled — you'll get alerts, announcements & reminders even if the app is closed."
            : "Get alerts, announcements & the daily reminder on your phone — even when the app is closed."}
        </div>
      </div>
      {permission !== "granted" && (
        <button onClick={enable} disabled={busy} className="text-xs px-3 py-1.5 shrink-0 disabled:opacity-50" style={{ background: T.ink, color: T.paper }}>
          {busy ? "Enabling…" : "Enable"}
        </button>
      )}
    </div>
  );
}

function Home({
  bank, programs, onOpenProgram, onOpenAdmin, stats, showAdminEntry, userEmail, userName, userCourse,
  onSignOut, onDailyChallenge, onReviewMistakes, onOpenSaved, onOpenLeaderboard, onOpenFLP, flpTests,
  notesBank, notifications, onRefreshNotifications, isAdmin,
  reviews, onAddReview, onLikeReview, onReplyReview, onDeleteReview, onToggleReviewProgram,
  syllabusItems, onAddSyllabus, onRemoveSyllabus,
  guidelineItems, onAddGuideline, onRemoveGuideline,
  contactItems, onAddContact, onRemoveContact,
  socialLinks, onUpdateSocialLink,
  onAddNote,
  examDates,
  onOpenPastPapers,
  isDark, onToggleTheme,
  userId,
  flpShareNav, onClearFLPShareNav,
  userMbbsYear,
}) {
  const [navTab, setNavTab] = useState("home");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  // FLP: ask for real name + mobile number right before the paper opens, so
  // admin can match results to students even when account names differ.
  const [pendingFLPTest, setPendingFLPTest] = useState(null);
  const [flpNameInput, setFlpNameInput] = useState("");
  const [flpPhoneInput, setFlpPhoneInput] = useState("");
  const openFLPDetailsPrompt = (t) => {
    setFlpNameInput(stats?.name || userName || "");
    setFlpPhoneInput(stats?.phone || "");
    setPendingFLPTest(t);
  };
  // A friend opened a shared FLP link: jump to the FLP tab, and if the link
  // pointed at one specific paper, open the "before you start" prompt for it
  // as soon as the papers have loaded.
  useEffect(() => {
    if (!flpShareNav) return;
    setNavTab("flp");
    if (flpTests.length === 0) return; // wait for papers to load before looking one up
    if (flpShareNav.testId) {
      const t = flpTests.find((x) => x.id === flpShareNav.testId);
      if (t) openFLPDetailsPrompt(t);
    }
    onClearFLPShareNav();
  }, [flpShareNav, flpTests]);
  const confirmFLPStart = () => {
    if (!flpNameInput.trim() || !flpPhoneInput.trim()) return;
    const t = pendingFLPTest;
    setPendingFLPTest(null);
    onOpenFLP(t, flpNameInput.trim(), flpPhoneInput.trim());
  };
  const total = bank.filter((q) => programs.some((p) => p.key === q.program)).length;
  const counts = useMemo(() => {
    const c = {};
    programs.forEach((p) => (c[p.key] = bank.filter((q) => q.program === p.key).length));
    return c;
  }, [bank, programs]);

  // WhatsApp community link for the student's own course only (admin sets one
  // link per course under a "Community:<COURSE>" key in the same social-links
  // map already used for the WhatsApp Group / Instagram / Facebook / TikTok cards).
  const communityLink = userCourse ? (socialLinks && socialLinks[`Community:${userCourse}`]) || "" : "";

  // Exam countdown for the student's own course (admin sets the date; hidden once it's passed).
  const daysToExam = useMemo(() => {
    const examKey = userCourse === "MBBS" && userMbbsYear ? `MBBS|${userMbbsYear}` : userCourse;
    const dateStr = examKey ? examDates?.[examKey] : null;
    if (!dateStr) return null;
    const examDay = new Date(dateStr + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((examDay - today) / 86400000);
    return diff >= 0 ? diff : null;
  }, [examDates, userCourse, userMbbsYear]);

  const [seenNotifCount, setSeenNotifCount] = useState(() => {
    try { return Number(localStorage.getItem("mdcat-notif-seen") || 0); } catch { return 0; }
  });
  const unseenNotifs = Math.max(0, (notifications?.length || 0) - seenNotifCount);
  const openNotifPanel = async () => {
    // Pull the freshest notifications from the server first — a student who was
    // already logged in when the admin sent a new one otherwise wouldn't see it
    // until they logged out and back in.
    let list = notifications;
    if (onRefreshNotifications) {
      const fresh = await onRefreshNotifications();
      if (fresh) list = fresh;
    }
    setNotifOpen(true);
    setSeenNotifCount(list?.length || 0);
    try { localStorage.setItem("mdcat-notif-seen", String(list?.length || 0)); } catch {}
  };

  const topicsCompleted = stats ? Object.keys(stats.bySubject || {}).length : 0;
  const attempted = stats?.totalAttempted || 0;
  const accuracy = attempted > 0 ? Math.round((stats.totalCorrect / attempted) * 100) : 0;

  // Daily Challenge reminder banner — dismissible for the rest of the day.
  const todayLocal = new Date().toISOString().slice(0, 10);
  const [reminderDismissed, setReminderDismissed] = useState(() => {
    try { return localStorage.getItem("mdcat-reminder-dismissed") === todayLocal; } catch { return false; }
  });
  const showDailyReminder = stats?.lastChallengeDate !== todayLocal && !reminderDismissed;
  const dismissDailyReminder = () => {
    setReminderDismissed(true);
    try { localStorage.setItem("mdcat-reminder-dismissed", todayLocal); } catch {}
  };

  // Topper shown right on the Quick Access card, no need to open the leaderboard.
  const [topLeader, setTopLeader] = useState(null);
  useEffect(() => {
    (async () => {
      const data = await loadLeaderboard(1, userCourse ? { course: userCourse, mbbsYear: userMbbsYear } : null);
      if (data && data[0]) setTopLeader(data[0]);
    })();
  }, [userCourse, userMbbsYear]);
  const topLeaderAccuracy =
    topLeader && topLeader.total_attempted > 0 ? Math.round((topLeader.total_correct / topLeader.total_attempted) * 100) : 0;

  // Rank comparison — only fetched once the student opens "Your Progress" (no need
  // to hit the DB on every Home load).
  const [rankInfo, setRankInfo] = useState(null);
  useEffect(() => {
    if (navTab !== "progress") return;
    (async () => {
      const info = await loadRankInfo(stats?.totalCorrect || 0);
      setRankInfo(info);
    })();
  }, [navTab, stats?.totalCorrect]);

  // Weak Topics Dashboard — every subject/topic/block the student has attempted at
  // least 3 questions in, sorted by lowest accuracy first.
  const weakTopics = useMemo(() => {
    const entries = Object.entries(stats?.bySubject || {});
    return entries
      .map(([key, v]) => ({
        key,
        attempted: v.attempted || 0,
        correct: v.correct || 0,
        accuracy: v.attempted > 0 ? Math.round((v.correct / v.attempted) * 100) : 0,
      }))
      .filter((e) => e.attempted >= 3)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 6);
  }, [stats?.bySubject]);

  // Badges & Streak rewards — simple thresholds computed from stats already on hand.
  const badges = useMemo(() => {
    const list = [];
    const streak = stats?.streak || 0;
    const correct = stats?.totalCorrect || 0;
    const attempted = stats?.totalAttempted || 0;
    if (streak >= 3) list.push({ label: "3-Day Streak", icon: "🔥", earned: true });
    if (streak >= 7) list.push({ label: "7-Day Streak", icon: "🔥", earned: true });
    if (streak >= 30) list.push({ label: "30-Day Streak", icon: "🔥", earned: true });
    if (correct >= 50) list.push({ label: "50 Correct", icon: "⭐", earned: true });
    if (correct >= 100) list.push({ label: "100 Correct", icon: "🌟", earned: true });
    if (correct >= 500) list.push({ label: "500 Correct", icon: "🏆", earned: true });
    if (attempted >= 100) list.push({ label: "Century Club", icon: "🎯", earned: true });
    if (attempted >= 500) list.push({ label: "500 Attempted", icon: "🎯", earned: true });
    if (attempted > 0 && correct / attempted >= 0.8) list.push({ label: "80%+ Accuracy", icon: "🧠", earned: true });
    return list;
  }, [stats?.streak, stats?.totalCorrect, stats?.totalAttempted]);

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
        <NotesFlow notesBank={notesBank} programs={programs} onExit={() => setNavTab("home")} isAdmin={isAdmin} onAddNote={onAddNote} />
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} userCourse={userCourse} />
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
                  onClick={() => onOpenPastPapers(p.key)}
                  className="text-left p-5 flex items-center gap-3"
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
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} userCourse={userCourse} />
      </div>
    );
  }
  if (navTab === "flp") {
    const FLP_ICON_COLORS = { MDCAT: "#2E63D6", KMUCAT: "#7C5CD6" };
    const myTests = flpTests.filter((t) => t.program === userCourse);
    return (
      <div className="min-h-screen pb-20" style={{ background: T.paper, color: T.ink }}>
        <FontLoader />
        <div className="max-w-5xl mx-auto px-6 py-10">
          <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl mb-2">Full Length Paper</h2>
          <p className="text-sm mb-6" style={{ color: T.inkSoft }}>
            Fixed, timed papers set by your admin — same paper for everyone, just like the real exam.
          </p>
          {myTests.length === 0 ? (
            <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
              No Full Length Papers have been added for your course yet — check back soon.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {myTests.map((t) => (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openFLPDetailsPrompt(t)}
                  onKeyDown={(e) => { if (e.key === "Enter") openFLPDetailsPrompt(t); }}
                  className="text-left p-5 flex items-center gap-4 cursor-pointer"
                  style={{ background: T.card, border: `1px solid ${T.line}` }}
                >
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 48, height: 48, borderRadius: "50%", background: FLP_ICON_COLORS[t.program] || T.blue }}
                  >
                    <FileCheck2 size={22} style={{ color: "#fff" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{t.title}</div>
                    <div className="text-xs mt-1" style={{ color: T.inkSoft }}>
                      {t.questionIds.length} MCQs · {Math.round(t.timeSeconds / 60)} min
                    </div>
                  </div>
                  <ShareButton label={t.title} state={{ v: "flp", p: t.program, ftId: t.id }} />
                  <ChevronRight size={16} style={{ color: T.inkSoft }} />
                </div>
              ))}
            </div>
          )}
        </div>
        {pendingFLPTest && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ background: "rgba(0,0,0,0.5)" }}
          >
            <div className="w-full max-w-sm p-6" style={{ background: T.paper, border: `1px solid ${T.line}` }}>
              <h3 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-lg mb-1">
                Before you start
              </h3>
              <p className="text-sm mb-4" style={{ color: T.inkSoft }}>
                Enter your real name and mobile number for "{pendingFLPTest.title}". This is how your admin will identify your result.
              </p>
              <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
                Real name
              </label>
              <input
                value={flpNameInput}
                onChange={(e) => setFlpNameInput(e.target.value)}
                placeholder="e.g. Ayesha Khan"
                className="w-full px-3 py-2 text-sm mb-3"
                style={{ border: `1px solid ${T.line}`, background: T.card, color: T.ink }}
              />
              <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
                Mobile number
              </label>
              <input
                value={flpPhoneInput}
                onChange={(e) => setFlpPhoneInput(e.target.value)}
                placeholder="e.g. 03001234567"
                type="tel"
                className="w-full px-3 py-2 text-sm mb-5"
                style={{ border: `1px solid ${T.line}`, background: T.card, color: T.ink }}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setPendingFLPTest(null)}
                  className="flex-1 px-4 py-2 text-sm"
                  style={{ border: `1px solid ${T.line}`, color: T.inkSoft }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmFLPStart}
                  disabled={!flpNameInput.trim() || !flpPhoneInput.trim()}
                  className="flex-1 px-4 py-2 text-sm disabled:opacity-50"
                  style={{ background: T.ink, color: T.paper }}
                >
                  Start paper
                </button>
              </div>
            </div>
          </div>
        )}
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} userCourse={userCourse} />
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

          <div className="p-5 mb-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            <div className="text-sm mb-3 flex items-center gap-2" style={{ color: T.inkSoft }}>
              <Activity size={14} /> Accuracy trend (last {Math.min(14, stats?.history?.length || 0)} days)
            </div>
            <TrendChart
              points={(stats?.history || []).slice(-14).map((h) => ({
                label: h.date.slice(5).replace("-", "/"),
                y: h.attempted > 0 ? Math.round((h.correct / h.attempted) * 100) : 0,
              }))}
              color={T.blue}
              unit="%"
            />
          </div>

          {rankInfo && (
            <div className="p-5 mb-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
              <div className="text-sm mb-1 flex items-center gap-2" style={{ color: T.inkSoft }}>
                <Trophy size={14} /> Your rank
              </div>
              <div className="text-2xl" style={{ fontFamily: "'Source Serif 4', serif" }}>
                #{rankInfo.rank} <span className="text-sm" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>of {rankInfo.totalCount}</span>
              </div>
              {rankInfo.totalCount > 0 && (
                <div className="text-xs mt-1" style={{ color: T.inkSoft }}>
                  Top {Math.max(1, Math.round((rankInfo.rank / rankInfo.totalCount) * 100))}% of all students
                </div>
              )}
            </div>
          )}

          {badges.length > 0 && (
            <div className="p-5 mb-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
              <div className="text-sm mb-3 flex items-center gap-2" style={{ color: T.inkSoft }}>
                <Award size={14} /> Badges earned
              </div>
              <div className="flex flex-wrap gap-2">
                {badges.map((b) => (
                  <span
                    key={b.label}
                    className="px-3 py-1.5 text-xs flex items-center gap-1"
                    style={{ background: T.amberSoft, color: "#3A2C0E", borderRadius: 6 }}
                  >
                    <span>{b.icon}</span> {b.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {weakTopics.length > 0 && (
            <div className="p-5 mb-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
              <div className="text-sm mb-3 flex items-center gap-2" style={{ color: T.inkSoft }}>
                <Target size={14} /> Weak topics — focus here
              </div>
              <div className="space-y-2">
                {weakTopics.map((w) => (
                  <div key={w.key} className="flex items-center justify-between text-sm">
                    <span className="truncate pr-2">{w.key}</span>
                    <span
                      className="shrink-0"
                      style={{ fontFamily: "'IBM Plex Mono', monospace", color: w.accuracy < 50 ? "#B8493F" : T.inkSoft }}
                    >
                      {w.accuracy}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} userCourse={userCourse} />
      </div>
    );
  }
  if (navTab === "contact") {
    return (
      <>
        <ContactUsPage
          onBack={() => setNavTab("profile")}
          contactItems={contactItems}
          isAdmin={isAdmin}
          onAddContact={onAddContact}
          onRemoveContact={onRemoveContact}
          socialLinks={socialLinks}
          onUpdateSocialLink={onUpdateSocialLink}
        />
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} userCourse={userCourse} />
      </>
    );
  }
  if (navTab === "reviews") {
    // Students only see reviews tagged with their own course, or tagged "All".
    // A review with no course tags at all (written before this feature
    // existed) is now admin-only until the admin assigns it a course — it no
    // longer leaks to every student by default.
    const visibleReviews = isAdmin
      ? reviews
      : reviews.filter((r) => {
          const programs = r.programs || (r.program ? [r.program] : []);
          return programs.includes("All") || programs.includes(userCourse);
        });
    return (
      <>
        <ReviewsPage
          onBack={() => setNavTab("profile")}
          reviews={visibleReviews}
          userName={userName}
          onAdd={onAddReview}
          onLike={onLikeReview}
          onReply={onReplyReview}
          onDelete={onDeleteReview}
          onToggleProgram={onToggleReviewProgram}
          isAdmin={isAdmin}
        />
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} userCourse={userCourse} />
      </>
    );
  }
  if (navTab === "syllabus") {
    return (
      <>
        <ContentListPage
          title="Syllabus"
          icon={BookOpen}
          color="#2E63D6"
          onBack={() => setNavTab("profile")}
          items={syllabusItems}
          isAdmin={isAdmin}
          onAdd={onAddSyllabus}
          onRemove={onRemoveSyllabus}
          addLabel="Add syllabus item"
          emptyText="The syllabus breakdown will appear here soon."
          programs={programs}
        />
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} userCourse={userCourse} />
      </>
    );
  }
  if (navTab === "guidelines") {
    return (
      <>
        <ContentListPage
          title="Guidelines"
          icon={ClipboardList}
          color="#1F9D6B"
          onBack={() => setNavTab("profile")}
          items={guidelineItems}
          isAdmin={isAdmin}
          onAdd={onAddGuideline}
          onRemove={onRemoveGuideline}
          addLabel="Add guideline item"
          emptyText="Exam & app guidelines will appear here soon."
          programs={programs}
        />
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} userCourse={userCourse} />
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
            onClick={onToggleTheme}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm mb-3"
            style={{ border: `1px solid ${T.line}`, background: T.card }}
          >
            <span className="flex items-center gap-2">{isDark ? <Moon size={14} /> : <Sun size={14} />} Dark mode</span>
            <span style={{ color: T.inkSoft }}>{isDark ? "On" : "Off"}</span>
          </button>
          <NotificationPermissionRow userId={userId} userCourse={userCourse} />
          <button
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm"
            style={{ border: `1px solid ${T.rose}`, color: T.rose }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} userCourse={userCourse} />
      </div>
    );
  }
  if (navTab === "profile") {
    const menuItems = [
      { label: "My Progress", sub: "Topics, MCQs & accuracy", icon: TrendingUp, color: "#2E63D6", action: () => setNavTab("progress") },
      { label: "Reviews", sub: "See what students are saying", icon: Star, color: "#B5822A", action: () => setNavTab("reviews") },
      { label: "Syllabus", sub: "Browse the full syllabus", icon: BookOpen, color: "#7C5CD6", action: () => setNavTab("syllabus") },
      { label: "Guidelines", sub: "Exam & app guidelines", icon: ClipboardList, color: "#1F9D6B", action: () => setNavTab("guidelines") },
      { label: "Contact Us", sub: "Chat with us on WhatsApp", icon: Phone, color: "#2EA8A0", action: () => setNavTab("contact") },
      { label: "Settings", sub: showAdminEntry ? "Account & admin access" : "Account settings", icon: Settings, color: "#B8493F", action: () => setNavTab("settings") },
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
                  <div className="flex items-center justify-center shrink-0" style={{ width: 40, height: 40, borderRadius: "50%", background: m.color || "rgba(255,255,255,0.08)" }}>
                    <Icon size={18} style={{ color: "#fff" }} />
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
        <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} userCourse={userCourse} />
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
              <button onClick={onToggleTheme} title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
                {isDark ? <Sun size={20} color="#fff" /> : <Moon size={20} color="#fff" />}
              </button>
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
          bank={bank.filter((q) => programs.some((p) => p.key === q.program) && (!userMbbsYear || q.program !== "MBBS" || (q.year || "") === userMbbsYear))}
          notesBank={(notesBank || []).filter((n) => programs.some((p) => p.key === n.program))}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {notifOpen && (
        <NotificationsOverlay notifications={notifications || []} onClose={() => setNotifOpen(false)} />
      )}

      <main className="max-w-5xl mx-auto px-6 -mt-4">
        {daysToExam !== null && <CircularCountdown days={daysToExam} courseLabel={userCourse} />}
        {showDailyReminder && (
          <div
            className="flex items-center justify-between gap-3 mb-4 px-4 py-3"
            style={{ background: T.amberSoft, color: "#3A2C0E", borderRadius: 10 }}
          >
            <div className="flex items-center gap-2 text-sm">
              <Bell size={16} /> You haven't done today's Daily Challenge yet — keep the streak going!
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button onClick={onDailyChallenge} className="text-xs px-3 py-1.5" style={{ background: "#3A2C0E", color: "#fff", borderRadius: 6 }}>
                Do it now
              </button>
              <button onClick={dismissDailyReminder} style={{ color: "#3A2C0E" }}>
                <X size={14} />
              </button>
            </div>
          </div>
        )}
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
                        onClick={() => (l.action === "open" ? onOpenProgram(p.key) : l.action === "flp" ? onOpenFLP(p.key) : soon(l.label))}
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
            { label: "Leaderboard", sub: topLeader ? `🏆 ${topLeader.name} · ${topLeaderAccuracy}%` : "Compete & be the best", icon: Trophy, action: onOpenLeaderboard, highlight: !!topLeader },
            // Community shortcut: only shown to a student who has a course set, and only
            // ever links to THAT course's community — never any other course's link.
            ...(userCourse
              ? [{
                  label: "Community",
                  sub: communityLink ? `Join ${userCourse} group` : "Coming soon",
                  isWhatsApp: true,
                  action: communityLink
                    ? () => window.open(communityLink, "_blank", "noopener,noreferrer")
                    : () => alert("The community link hasn't been added yet — check back soon."),
                  highlight: !!communityLink,
                }]
              : []),
          ].map((q) => {
            const Icon = q.icon;
            return (
              <button key={q.label} onClick={q.action} className="p-4 text-left flex flex-col gap-2" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10 }}>
                {q.isWhatsApp ? (
                  <div className="flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: "50%", background: "#25D366" }}>
                    <WhatsAppIcon size={24} color="#fff" />
                  </div>
                ) : (
                  <div className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }}>
                    <Icon size={16} />
                  </div>
                )}
                <div className="text-sm font-medium">{q.label}</div>
                <div className="text-xs truncate" style={{ color: q.highlight ? T.amber : T.inkSoft }}>{q.sub}</div>
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

      <BottomNav tab={navTab} setTab={setNavTab} onSaved={onOpenSaved} userCourse={userCourse} />
    </div>
  );
}

// ---------- Program page: choose Subject (or Year for MBBS) ----------
// Shared header row: a "Back to X" link on the left, and a "Home" link on the
// right whenever onHome is provided — so students are never more than one tap
// away from Home, even deep inside Program → Subject → Topic navigation.
function BackHomeBar({ onBack, backLabel = "Back", onHome }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
        <ArrowLeft size={16} /> {backLabel}
      </button>
      {onHome && (
        <button onClick={onHome} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
          <HomeIcon size={16} /> Home
        </button>
      )}
    </div>
  );
}

function ProgramPage({ program, bank, stats, onBack, onOpenSubject, onOpenYear, onHome, isAdmin, onDeleteMcqs, restrictedMbbsYear }) {
  const progQuestions = bank.filter((q) => q.program === program);
  const isMBBS = program === "MBBS";
  const isMDCAT = TOPIC_PROGRAMS.includes(program);
  const bySubject = stats?.bySubject || {};

  const groups = useMemo(() => {
    if (isMBBS) {
      const years = restrictedMbbsYear ? [restrictedMbbsYear] : Object.keys(MBBS_STRUCTURE);
      return years.map((name) => {
        const qs = progQuestions.filter((q) => (q.year || "") === name);
        return { name, count: qs.length, ids: qs.map((q) => q.id),
        // MBBS stats keys look like "Year | Block | Subject" — match on the year prefix.
        accuracy: accuracyFor(bySubject, (key) => key.startsWith(`${name} | `)) };
      });
    }
    if (isMDCAT) {
      return Object.keys(MDCAT_TOPICS).map((name) => {
        const qs = progQuestions.filter((q) => q.subject === name);
        return { name, count: qs.length, ids: qs.map((q) => q.id),
        // Topic-program stats keys look like "Subject - Topic" — match on the subject prefix.
        accuracy: accuracyFor(bySubject, (key) => key === name || key.startsWith(`${name} - `)) };
      });
    }
    const map = {};
    progQuestions.forEach((q) => {
      map[q.subject] = (map[q.subject] || 0) + 1;
    });
    return Object.keys(map).sort().map((name) => ({
      name,
      count: map[name],
      ids: progQuestions.filter((q) => q.subject === name).map((q) => q.id),
      accuracy: accuracyFor(bySubject, (key) => key === name),
    }));
  }, [progQuestions, isMBBS, isMDCAT, bySubject, restrictedMbbsYear]);

  const progInfo = PROGRAMS.find((p) => p.key === program);

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
            <ArrowLeft size={16} /> Back to programs
          </button>
          <div className="flex items-center gap-1">
            <ShareButton label={progInfo ? progInfo.label : program} state={{ v: "program", p: program }} />
            {isAdmin && <DeleteMcqsButton label={progInfo ? progInfo.label : program} ids={progQuestions.map((q) => q.id)} onDelete={onDeleteMcqs} />}
          </div>
        </div>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-3xl mb-1">
          {progInfo ? progInfo.label : program}
        </h1>
        <p className="text-sm mb-8" style={{ color: T.inkSoft }}>
          {groups.length} {isMBBS ? "year" : "subject"}{groups.length === 1 ? "" : "s"}
        </p>

        {groups.length === 0 ? (
          <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            No questions yet for this program.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {groups.map((s) => {
              const Icon = isMBBS ? GraduationCap : subjectIcon(s.name);
              const hasTopics = !isMBBS && TOPIC_PROGRAMS.includes(program) && (MDCAT_TOPICS[s.name] || []).length > 0;
              const shareState = isMBBS
                ? { v: "year", p: program, y: s.name }
                : hasTopics
                ? { v: "topic", p: program, s: s.name }
                : { v: "subject", p: program, s: s.name };
              return (
                <div
                  key={s.name}
                  role="button"
                  tabIndex={0}
                  onClick={() => (isMBBS ? onOpenYear(s.name) : onOpenSubject(s.name))}
                  onKeyDown={(e) => { if (e.key === "Enter") (isMBBS ? onOpenYear(s.name) : onOpenSubject(s.name))(); }}
                  className="text-left p-6 flex items-start gap-4 transition-transform hover:-translate-y-0.5 cursor-pointer"
                  style={{ background: T.card, border: `1px solid ${T.line}` }}
                >
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 48, height: 48, background: colorForName(s.name), borderRadius: "50%" }}
                  >
                    <Icon size={22} style={{ color: "#fff" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <span style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }} className="text-xl">
                        {s.name}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <ShareButton label={s.name} state={shareState} />
                        {isAdmin && <DeleteMcqsButton label={s.name} ids={s.ids} onDelete={onDeleteMcqs} />}
                      </div>
                    </div>
                    <div className="text-sm mt-1 flex items-center gap-2 flex-wrap" style={{ color: T.inkSoft }}>
                      <AccuracyBadge pct={s.accuracy} />
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

// ---------- MBBS Year page (lists Blocks within a chosen year) ----------
function YearPage({ program, year, bank, stats, onBack, onOpenBlock, onHome, isAdmin, onDeleteMcqs }) {
  const yearQuestions = bank.filter((q) => q.program === program && (q.year || "") === year);
  const bySubject = stats?.bySubject || {};
  const blockNames = Object.keys(MBBS_STRUCTURE[year] || {});
  const blocks = blockNames.map((name) => {
    const qs = yearQuestions.filter((q) => (q.block || "") === name);
    return { name, count: qs.length, ids: qs.map((q) => q.id),
    accuracy: accuracyFor(bySubject, (key) => key.startsWith(`${year} | ${name} | `)) };
  });

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
            <ArrowLeft size={16} /> Back to years
          </button>
          <div className="flex items-center gap-3">
            {onHome && (
              <button onClick={onHome} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
                <HomeIcon size={16} /> Home
              </button>
            )}
            <ShareButton label={year} state={{ v: "year", p: program, y: year }} />
            {isAdmin && <DeleteMcqsButton label={year} ids={yearQuestions.map((q) => q.id)} onDelete={onDeleteMcqs} />}
          </div>
        </div>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-3xl mb-1">
          {year}
        </h1>
        <p className="text-sm mb-8" style={{ color: T.inkSoft }}>
          {blocks.length} block{blocks.length === 1 ? "" : "s"}
        </p>

        {blocks.length === 0 ? (
          <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            No blocks defined for this year.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {blocks.map((b) => (
              <div
                key={b.name}
                role="button"
                tabIndex={0}
                onClick={() => onOpenBlock(b.name)}
                onKeyDown={(e) => { if (e.key === "Enter") onOpenBlock(b.name); }}
                className="text-left p-6 flex items-start gap-4 transition-transform hover:-translate-y-0.5 cursor-pointer"
                style={{ background: T.card, border: `1px solid ${T.line}` }}
              >
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 48, height: 48, background: colorForName(b.name), borderRadius: "50%" }}
                >
                  <Library size={22} style={{ color: "#fff" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }} className="text-xl">
                      {b.name}
                    </span>
                    <ShareButton label={`${year} · ${b.name}`} state={{ v: "block", p: program, y: year, b: b.name }} />
                    {isAdmin && <DeleteMcqsButton label={`${year} · ${b.name}`} ids={b.ids} onDelete={onDeleteMcqs} />}
                  </div>
                  <div className="text-sm mt-1 flex items-center gap-2 flex-wrap" style={{ color: T.inkSoft }}>
                    <AccuracyBadge pct={b.accuracy} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- MBBS Block page (lists fixed subjects within a chosen block) ----------
function BlockPage({ program, year, block, bank, stats, onBack, onOpenSubject, onHome, isAdmin, onDeleteMcqs }) {
  const blockQuestions = bank.filter(
    (q) => q.program === program && (q.year || "") === year && (q.block || "") === block
  );
  const bySubject = stats?.bySubject || {};
  const subjectNames = (MBBS_STRUCTURE[year] && MBBS_STRUCTURE[year][block]) || [];
  const subjects = subjectNames.map((name) => {
    const qs = blockQuestions.filter((q) => q.subject === name);
    return { name, count: qs.length, ids: qs.map((q) => q.id),
    accuracy: accuracyFor(bySubject, (key) => key === `${year} | ${block} | ${name}`) };
  });

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
            <ArrowLeft size={16} /> Back to blocks
          </button>
          <div className="flex items-center gap-3">
            {onHome && (
              <button onClick={onHome} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
                <HomeIcon size={16} /> Home
              </button>
            )}
            <ShareButton label={`${year} · ${block}`} state={{ v: "block", p: program, y: year, b: block }} />
            {isAdmin && <DeleteMcqsButton label={`${year} · ${block}`} ids={blockQuestions.map((q) => q.id)} onDelete={onDeleteMcqs} />}
          </div>
        </div>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-3xl mb-1">
          {year} · {block}
        </h1>
        <p className="text-sm mb-8" style={{ color: T.inkSoft }}>
          {subjects.length} subject{subjects.length === 1 ? "" : "s"}
        </p>

        {subjects.length === 0 ? (
          <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            No subjects defined for this block.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {subjects.map((s) => {
              const Icon = subjectIcon(s.name);
              const hasTree = mbbsWalk(block, s.name, []).length > 0;
              const shareState = hasTree
                ? { v: "mbbs-topic", p: program, y: year, b: block, s: s.name, mp: [] }
                : { v: "subject", p: program, y: year, b: block, s: s.name };
              return (
                <div
                  key={s.name}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenSubject(s.name)}
                  onKeyDown={(e) => { if (e.key === "Enter") onOpenSubject(s.name); }}
                  className="text-left p-6 flex items-start gap-4 transition-transform hover:-translate-y-0.5 cursor-pointer"
                  style={{ background: T.card, border: `1px solid ${T.line}` }}
                >
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 48, height: 48, background: colorForName(s.name), borderRadius: "50%" }}
                  >
                    <Icon size={22} style={{ color: "#fff" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <span style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }} className="text-xl">
                        {s.name}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <ShareButton label={s.name} state={shareState} />
                        {isAdmin && <DeleteMcqsButton label={s.name} ids={s.ids} onDelete={onDeleteMcqs} />}
                      </div>
                    </div>
                    <div className="text-sm mt-1 flex items-center gap-2 flex-wrap" style={{ color: T.inkSoft }}>
                      <AccuracyBadge pct={s.accuracy} />
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

// ---------- MDCAT Topic page (lists fixed topics within a chosen subject) ----------
function TopicPage({ program, subject, bank, stats, onBack, onOpenTopic, onHome, isAdmin, onDeleteMcqs }) {
  const subjQuestions = bank.filter((q) => q.program === program && q.subject === subject);
  const bySubject = stats?.bySubject || {};
  const topicNames = MDCAT_TOPICS[subject] || [];
  const topics = topicNames.map((name) => {
    const qs = subjQuestions.filter((q) => q.topic === name);
    return { name, count: qs.length, ids: qs.map((q) => q.id),
    accuracy: accuracyFor(bySubject, (key) => key === `${subject} - ${name}`) };
  });

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
            <ArrowLeft size={16} /> Back to subjects
          </button>
          <div className="flex items-center gap-3">
            {onHome && (
              <button onClick={onHome} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
                <HomeIcon size={16} /> Home
              </button>
            )}
            <ShareButton label={subject} state={{ v: "topic", p: program, s: subject }} />
            {isAdmin && <DeleteMcqsButton label={subject} ids={subjQuestions.map((q) => q.id)} onDelete={onDeleteMcqs} />}
          </div>
        </div>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-3xl mb-1">
          {subject}
        </h1>
        <p className="text-sm mb-8" style={{ color: T.inkSoft }}>
          {topics.length} topic{topics.length === 1 ? "" : "s"}
        </p>

        {topics.length === 0 ? (
          <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            No topics defined for this subject.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {topics.map((t) => (
              <div
                key={t.name}
                role="button"
                tabIndex={0}
                onClick={() => onOpenTopic(t.name)}
                onKeyDown={(e) => { if (e.key === "Enter") onOpenTopic(t.name); }}
                className="text-left p-4 flex items-center justify-between gap-4 transition-transform hover:-translate-y-0.5 cursor-pointer"
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
                <span className="text-xs shrink-0 flex items-center gap-2" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
                  <AccuracyBadge pct={t.accuracy} />
                  <ShareButton label={`${subject} — ${t.name}`} state={{ v: "subject", p: program, s: subject, t: t.name }} />
                  {isAdmin && <DeleteMcqsButton label={`${subject} — ${t.name}`} ids={t.ids} onDelete={onDeleteMcqs} />}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- MBBS Topic/Subtopic browser (arbitrary depth, per Block → Subject) ----------
// Renders whatever level of the MBBS_TOPICS tree `items` represents. Folder items
// drill deeper (handled by the caller pushing onto the path); leaf items go
// straight to quiz setup.
function MbbsTopicPage({ program, year, block, subject, path, items, bank, onBack, onOpenItem, onHome, isAdmin, onDeleteMcqs }) {
  const scoped = bank.filter(
    (q) =>
      q.program === program &&
      (year ? (q.year || "") === year : true) &&
      (block ? (q.block || "") === block : true) &&
      q.subject === subject
  );
  const rows = items.map((item) => {
    const isFolder = typeof item !== "string";
    const name = isFolder ? item.name : item;
    const leaves = mbbsLeafNames(item);
    const matched = scoped.filter((q) => leaves.includes(q.topic));
    return { item, name, isFolder, count: matched.length, ids: matched.map((q) => q.id) };
  });
  const crumb = [subject, ...path].join(" › ");
  const title = path.length ? path[path.length - 1] : subject;
  const totalQ = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div className="flex items-center gap-3">
            {onHome && (
              <button onClick={onHome} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
                <HomeIcon size={16} /> Home
              </button>
            )}
            <ShareButton label={title} state={{ v: "mbbs-topic", p: program, y: year, b: block, s: subject, mp: path }} />
            {isAdmin && <DeleteMcqsButton label={title} ids={scoped.map((q) => q.id)} onDelete={onDeleteMcqs} />}
          </div>
        </div>
        <div className="text-xs tracking-widest uppercase mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
          {crumb}
        </div>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-3xl mb-1">
          {title}
        </h1>
        <p className="text-sm mb-8" style={{ color: T.inkSoft }}>
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </p>

        {rows.length === 0 ? (
          <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            Nothing here yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {rows.map((r) => {
              const shareState = r.isFolder
                ? { v: "mbbs-topic", p: program, y: year, b: block, s: subject, mp: [...path, r.name] }
                : { v: "subject", p: program, y: year, b: block, s: subject, t: r.item };
              return (
                <div
                  key={r.name}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenItem(r.item)}
                  onKeyDown={(e) => { if (e.key === "Enter") onOpenItem(r.item); }}
                  className="text-left p-4 flex items-center justify-between gap-4 transition-transform hover:-translate-y-0.5 cursor-pointer"
                  style={{ background: T.card, border: `1px solid ${T.line}` }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{ width: 36, height: 36, background: colorForName(r.name), borderRadius: "50%" }}
                    >
                      {r.isFolder ? <Library size={16} style={{ color: "#fff" }} /> : <ClipboardList size={16} style={{ color: "#fff" }} />}
                    </div>
                    <span style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{r.name}</span>
                  </div>
                  <span className="text-xs shrink-0 flex items-center gap-2" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {r.isFolder && <ChevronRight size={14} />}
                    <ShareButton label={r.name} state={shareState} />
                    {isAdmin && <DeleteMcqsButton label={r.name} ids={r.ids} onDelete={onDeleteMcqs} />}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Past Papers: named year/block folders per program ----------
function PastPaperFoldersPage({ program, bank, onBack, onOpenFolder, onOpenSubfolders, onHome, isAdmin, onDeleteMcqs, restrictedMbbsBlocks }) {
  const allFolders = PAST_PAPER_FOLDERS[program] || [];
  // MBBS students only see past-paper folders for their own year's blocks
  // (e.g. Block A/B/C for 1st Year) — same restriction as topic browsing.
  // "Internal Blocks Past Papers" is a container covering every block, so it
  // always stays visible here — its own subfolders get filtered instead,
  // inside PastPaperSubfoldersPage.
  const folders = (restrictedMbbsBlocks && restrictedMbbsBlocks.length > 0)
    ? allFolders.filter((f) => {
        const name = typeof f === "string" ? f : f.name;
        if (name === "Internal Blocks Past Papers") return true;
        return restrictedMbbsBlocks.some((blk) => name.includes(blk));
      })
    : allFolders;
  const idsByName = useMemo(() => {
    const c = {};
    folders.forEach((f) => {
      if (typeof f === "string") {
        c[f] = bank.filter((q) => q.program === program && q.source === f).map((q) => q.id);
      } else {
        // Parent folder: everything filed directly under it OR under any of its subfolders.
        const names = [f.name, ...(f.subfolders || [])];
        c[f.name] = bank.filter((q) => q.program === program && names.includes(q.source)).map((q) => q.id);
      }
    });
    return c;
  }, [bank, program, folders]);
  const counts = useMemo(() => {
    const c = {};
    Object.keys(idsByName).forEach((k) => { c[k] = idsByName[k].length; });
    return c;
  }, [idsByName]);

  const progInfo = PROGRAMS.find((p) => p.key === program);

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
            <ArrowLeft size={16} /> Back to Past Papers
          </button>
          <div className="flex items-center gap-3">
            {onHome && (
              <button onClick={onHome} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
                <HomeIcon size={16} /> Home
              </button>
            )}
            <ShareButton
              label={`${progInfo ? progInfo.label : program} — Past Papers`}
              state={{ v: "pastpaper-folders", p: program }}
            />
            {isAdmin && (
              <DeleteMcqsButton
                label={`${progInfo ? progInfo.label : program} — Past Papers`}
                ids={bank.filter((q) => q.program === program && /past/i.test(q.source || "")).map((q) => q.id)}
                onDelete={onDeleteMcqs}
              />
            )}
          </div>
        </div>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-3xl mb-1">
          {progInfo ? progInfo.label : program} — Past Papers
        </h1>
        <p className="text-sm mb-8" style={{ color: T.inkSoft }}>
          {folders.length} folder{folders.length === 1 ? "" : "s"} available
        </p>

        {folders.length === 0 ? (
          <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            No past paper folders have been set up for this program yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {folders.map((f) => {
              const isNested = typeof f !== "string";
              const name = isNested ? f.name : f;
              const n = counts[name] || 0;
              const shareState = isNested
                ? { v: "pastpaper-subfolders", p: program, ppName: name }
                : { v: "pastpaper-setup", p: program, pf: name };
              return (
                <div
                  key={name}
                  role="button"
                  tabIndex={0}
                  onClick={() => (isNested ? onOpenSubfolders(f) : onOpenFolder(name))}
                  onKeyDown={(e) => { if (e.key === "Enter") (isNested ? onOpenSubfolders(f) : onOpenFolder(name)); }}
                  className="text-left p-6 flex items-start gap-4 transition-transform hover:-translate-y-0.5 cursor-pointer"
                  style={{ background: T.card, border: `1px solid ${T.line}` }}
                >
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 48, height: 48, background: colorForName(name), borderRadius: "50%" }}
                  >
                    {isNested ? <Library size={20} style={{ color: "#fff" }} /> : <FileText size={20} style={{ color: "#fff" }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }} className="text-lg">
                          {name}
                        </span>
                        {isNested && <ChevronRight size={16} style={{ color: T.inkSoft }} />}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <ShareButton label={name} state={shareState} />
                        {isAdmin && <DeleteMcqsButton label={name} ids={idsByName[name] || []} onDelete={onDeleteMcqs} />}
                      </div>
                    </div>
                    {!isNested && (
                      <div className="text-xs mt-1" style={{ color: T.inkSoft }}>
                        {n} question{n === 1 ? "" : "s"}
                      </div>
                    )}
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

// Lists the test-level subfolders inside a single past-paper year (e.g. all the
// individual tests inside "KMU CAT 2025").
function PastPaperSubfoldersPage({ program, parent, bank, onBack, onOpenFolder, onHome, isAdmin, onDeleteMcqs, restrictedMbbsBlocks }) {
  const allSubfolders = parent?.subfolders || [];
  // "Internal Blocks Past Papers" covers every block — restrict its children
  // to the student's own year's blocks, same as everywhere else. Other
  // parents (e.g. "KMU Block A") are already fully within the student's
  // allowed blocks by the time they're opened, so nothing to filter there.
  const subfolders = (restrictedMbbsBlocks && restrictedMbbsBlocks.length > 0 && parent?.name === "Internal Blocks Past Papers")
    ? allSubfolders.filter((f) => restrictedMbbsBlocks.some((blk) => f.includes(blk)))
    : allSubfolders;
  const idsByName = useMemo(() => {
    const c = {};
    subfolders.forEach((f) => {
      c[f] = bank.filter((q) => q.program === program && q.source === f).map((q) => q.id);
    });
    return c;
  }, [bank, program, subfolders]);
  const counts = useMemo(() => {
    const c = {};
    Object.keys(idsByName).forEach((k) => { c[k] = idsByName[k].length; });
    return c;
  }, [idsByName]);

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
            <ArrowLeft size={16} /> Back to folders
          </button>
          <div className="flex items-center gap-3">
            {onHome && (
              <button onClick={onHome} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
                <HomeIcon size={16} /> Home
              </button>
            )}
            <ShareButton label={parent?.name} state={{ v: "pastpaper-subfolders", p: program, ppName: parent?.name }} />
            {isAdmin && (
              <DeleteMcqsButton
                label={parent?.name}
                ids={subfolders.flatMap((f) => idsByName[f] || [])}
                onDelete={onDeleteMcqs}
              />
            )}
          </div>
        </div>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-3xl mb-1">
          {parent?.name}
        </h1>
        <p className="text-sm mb-8" style={{ color: T.inkSoft }}>
          {subfolders.length} test{subfolders.length === 1 ? "" : "s"} available
        </p>

        {subfolders.length === 0 ? (
          <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            No tests have been added under this year yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {subfolders.map((f) => {
              const n = counts[f] || 0;
              return (
                <div
                  key={f}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenFolder(f)}
                  onKeyDown={(e) => { if (e.key === "Enter") onOpenFolder(f); }}
                  className="text-left p-6 flex items-start gap-4 transition-transform hover:-translate-y-0.5 cursor-pointer"
                  style={{ background: T.card, border: `1px solid ${T.line}` }}
                >
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 48, height: 48, background: colorForName(f), borderRadius: "50%" }}
                  >
                    <FileText size={20} style={{ color: "#fff" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }} className="text-lg">
                        {f}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <ShareButton label={f} state={{ v: "pastpaper-setup", p: program, pf: f }} />
                        {isAdmin && <DeleteMcqsButton label={f} ids={idsByName[f] || []} onDelete={onDeleteMcqs} />}
                      </div>
                    </div>
                    <div className="text-xs mt-1" style={{ color: T.inkSoft }}>
                      {n} question{n === 1 ? "" : "s"}
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

// Quiz setup for a single past-paper folder — no subject/topic step, since a real
// past paper already mixes subjects the way the actual exam does.
function PastPaperSetup({ program, folder, bank, onBack, onStart, onHome, isAdmin, onDeleteMcqs }) {
  const folderQuestions = bank.filter((q) => q.program === program && q.source === folder);
  const [count, setCount] = useState(10);
  const [timed, setTimed] = useState(false);
  const maxCount = folderQuestions.length;
  const chosenCount = Math.min(count, Math.max(1, maxCount));
  const SECONDS_PER_Q = 60;

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
            <ArrowLeft size={16} /> Back to folders
          </button>
          <div className="flex items-center gap-3">
            {onHome && (
              <button onClick={onHome} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
                <HomeIcon size={16} /> Home
              </button>
            )}
            <ShareButton label={folder} state={{ v: "pastpaper-setup", p: program, pf: folder }} />
            {isAdmin && <DeleteMcqsButton label={folder} ids={folderQuestions.map((q) => q.id)} onDelete={onDeleteMcqs} />}
          </div>
        </div>
        <div className="text-xs tracking-widest uppercase mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.amber }}>
          {program} · Past Paper
        </div>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-3xl mb-1">
          {folder}
        </h1>
        {maxCount === 0 ? (
          <div className="p-6 text-sm" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
            No questions have been added to this folder yet — check back soon.
          </div>
        ) : (
          <>
            <div className="mb-8">
              <label className="text-xs tracking-widest uppercase block mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
                Number of questions (max {maxCount})
              </label>
              <input
                type="range"
                min={1}
                max={Math.max(1, maxCount)}
                value={chosenCount}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full"
              />
              <div style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="text-lg mt-1">
                {chosenCount} questions
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
              onClick={() => onStart(folderQuestions.slice(0, chosenCount), { timeLimit: timed ? chosenCount * SECONDS_PER_Q : null })}
              className="px-6 py-3 text-sm tracking-wide"
              style={{ background: T.ink, color: T.paper, fontFamily: "'IBM Plex Mono', monospace" }}
            >
              {timed ? "Begin timed exam →" : "Begin practice →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Subject setup (choose source + count) ----------
// Small inline "Reply" control admin sees under a student's comment — click to
// reveal a text box, type, and submit. Kept collapsed by default so the thread
// doesn't look cluttered for the common case of comments with no reply yet.
function AdminReplyInline({ onSubmit }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-xs" style={{ color: T.blue }}>
        <MessageCircle size={12} /> Reply
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            onSubmit(text.trim());
            setText("");
            setOpen(false);
          }
        }}
        placeholder="Write a reply as admin…"
        className="flex-1 px-2 py-1 text-xs"
        style={{ border: `1px solid ${T.line}`, background: T.paper }}
        autoFocus
      />
      <button
        onClick={() => {
          if (text.trim()) {
            onSubmit(text.trim());
            setText("");
            setOpen(false);
          }
        }}
        className="text-xs px-2 py-1"
        style={{ background: T.ink, color: T.paper }}
      >
        Send
      </button>
    </div>
  );
}

function SubjectSetup({ program, year, block, topic, subject, bank, onBack, onStart, onHome, discussions, onPostDiscussion, onLikeDiscussion, onReplyDiscussion, onDeleteDiscussion, currentUserName, isAdmin, onDeleteMcqs }) {
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
  const topicKey = [program, year, block, subject, topic].filter(Boolean).join(" | ");
  const thread = (discussions && discussions[topicKey]) || [];
  const [comment, setComment] = useState("");
  const submitComment = () => {
    const text = comment.trim();
    if (!text) return;
    onPostDiscussion(topicKey, text);
    setComment("");
  };

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
            <ArrowLeft size={16} /> Back to subjects
          </button>
          <div className="flex items-center gap-3">
            {onHome && (
              <button onClick={onHome} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
                <HomeIcon size={16} /> Home
              </button>
            )}
            <ShareButton label={topic ? `${subject} — ${topic}` : subject} state={{ v: "subject", p: program, y: year, b: block, s: subject, t: topic }} />
            {isAdmin && (
              <DeleteMcqsButton
                label={topic ? `${subject} — ${topic}` : subject}
                ids={subjQuestions.map((q) => q.id)}
                onDelete={onDeleteMcqs}
              />
            )}
          </div>
        </div>
        <div className="text-xs tracking-widest uppercase mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.amber }}>
          {program}
        </div>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-3xl mb-1">
          {subject}
        </h1>
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
              Timed Practice ({SECONDS_PER_Q}s per question — {Math.round((chosenCount * SECONDS_PER_Q) / 60)} min total)
            </span>
          </label>
        </div>

        <button
          disabled={maxCount === 0}
          onClick={() => onStart(shuffleArray(filtered).slice(0, chosenCount), { timeLimit: timed ? chosenCount * SECONDS_PER_Q : null })}
          className="px-6 py-3 text-sm tracking-wide disabled:opacity-40"
          style={{ background: T.ink, color: T.paper, fontFamily: "'IBM Plex Mono', monospace" }}
        >
          {timed ? "Begin timed exam →" : "Begin practice →"}
        </button>

        <div className="mt-12 pt-8" style={{ borderTop: `1px solid ${T.line}` }}>
          <div className="text-sm mb-4 flex items-center gap-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
            <MessageCircle size={14} /> Doubts & Discussion
          </div>
          <div className="space-y-3 mb-4">
            {thread.length === 0 ? (
              <div className="text-sm" style={{ color: T.inkSoft }}>No questions asked yet — be the first!</div>
            ) : (
              thread.map((c) => {
                const liked = currentUserName && (c.likes || []).includes(currentUserName);
                const likeCount = (c.likes || []).length;
                return (
                  <div key={c.id} className="p-3 text-sm" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                    <div className="flex items-center justify-between mb-1">
                      <span style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>
                        {c.name}{currentUserName && c.name === currentUserName ? " (You)" : ""}
                      </span>
                      <span className="text-xs" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
                        {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mb-2">{c.text}</div>

                    {c.adminReply && (
                      <div className="mt-2 mb-2 p-2 text-sm" style={{ background: T.paperDark || T.paper, borderLeft: `2px solid ${T.emerald}` }}>
                        <div className="text-xs mb-1" style={{ color: T.emerald, fontFamily: "'IBM Plex Mono', monospace" }}>
                          Admin reply
                        </div>
                        {c.adminReply.text}
                      </div>
                    )}

                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => onLikeDiscussion(topicKey, c.id)}
                        className="flex items-center gap-1 text-xs"
                        style={{ color: liked ? T.emerald : T.inkSoft }}
                      >
                        <Star size={12} fill={liked ? T.emerald : "none"} /> {likeCount > 0 ? likeCount : "Like"}
                      </button>
                      {isAdmin && !c.adminReply && (
                        <AdminReplyInline onSubmit={(text) => onReplyDiscussion(topicKey, c.id, text)} />
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => {
                            if (window.confirm("Delete this comment? This cannot be undone.")) {
                              onDeleteDiscussion(topicKey, c.id);
                            }
                          }}
                          className="flex items-center gap-1 text-xs"
                          style={{ color: T.rose }}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitComment()}
              placeholder="Ask a doubt or share a tip…"
              className="flex-1 px-3 py-2 text-sm"
              style={{ border: `1px solid ${T.line}`, background: T.card }}
            />
            <button onClick={submitComment} className="px-4 py-2 text-sm" style={{ background: T.ink, color: T.paper }}>
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Quiz ----------
// ---------- Explanation feedback + Report a question (used in Quiz & Results) ----------
function QuestionFeedbackBar({ question, feedback, onVote, onReport }) {
  const [voted, setVoted] = useState(() => {
    try {
      return localStorage.getItem(`mdcat-voted-${question.id}`) || "";
    } catch {
      return "";
    }
  });
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const counts = (feedback && feedback[question.id]) || { up: 0, down: 0 };

  const vote = (dir) => {
    if (voted) return;
    setVoted(dir);
    try {
      localStorage.setItem(`mdcat-voted-${question.id}`, dir);
    } catch {}
    onVote(question.id, dir);
  };

  const submitReport = () => {
    onReport(question, reportText.trim());
    setReportSent(true);
    setReportOpen(false);
  };

  return (
    <div className="flex items-center justify-between flex-wrap gap-2 mb-6 text-xs" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
      <div className="flex items-center gap-3">
        <span>Was this explanation helpful?</span>
        <button
          onClick={() => vote("up")}
          disabled={!!voted}
          className="flex items-center gap-1 px-2 py-1 disabled:opacity-60"
          style={{ border: `1px solid ${T.line}`, background: voted === "up" ? T.emeraldSoft || T.card : T.card }}
        >
          👍 {counts.up || 0}
        </button>
        <button
          onClick={() => vote("down")}
          disabled={!!voted}
          className="flex items-center gap-1 px-2 py-1 disabled:opacity-60"
          style={{ border: `1px solid ${T.line}`, background: voted === "down" ? T.card : T.card }}
        >
          👎 {counts.down || 0}
        </button>
      </div>
      <div>
        {reportSent ? (
          <span>Report sent — thanks!</span>
        ) : reportOpen ? (
          <div className="flex items-center gap-2">
            <input
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder="What's wrong? (optional)"
              className="px-2 py-1"
              style={{ border: `1px solid ${T.line}`, background: T.card, fontFamily: "inherit" }}
            />
            <button onClick={submitReport} className="px-2 py-1" style={{ background: T.ink, color: T.paper }}>
              Send
            </button>
            <button onClick={() => setReportOpen(false)} style={{ color: T.inkSoft }}>
              <X size={12} />
            </button>
          </div>
        ) : (
          <button onClick={() => setReportOpen(true)} className="flex items-center gap-1" style={{ color: T.inkSoft }}>
            <FileText size={12} /> Report a question
          </button>
        )}
      </div>
    </div>
  );
}

function Quiz({ questions, subject, onFinish, onExit, onHome, timeLimit, bookmarks, onToggleBookmark, explanationFeedback, onVoteExplanation, onReportQuestion, deferFeedback }) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [answerTimes, setAnswerTimes] = useState({});
  const [showExplain, setShowExplain] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(timeLimit || 0);
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now());
  // Guards against submitting more than once. Without this, the timer effect
  // below could call finish() repeatedly once secondsLeft hit 0 — any parent
  // re-render (notification polling, unrelated state elsewhere in the app,
  // etc.) recreates the `finish` callback, which was in the effect's own
  // dependency array, re-triggering it again and again while still on the
  // results transition. Each extra call added the same questions to the
  // student's totalAttempted a second (or hundredth) time — this is what
  // produced impossible numbers like "43640 attempted" on the leaderboard.
  const finishedRef = useRef(false);
  // Options are re-shuffled once whenever a fresh `questions` array arrives (i.e. once
  // per quiz), so the correct answer isn't always in the same A/B/C/D slot on repeats.
  const shuffledQuestions = useMemo(() => questions.map(shuffleQuestionOptions), [questions]);
  const q = shuffledQuestions[idx];
  // Options are A/B/C/D by default; MBBS past-paper questions can have a 5th
  // option (E), so the letter list follows however many options this
  // question actually has instead of assuming 4.
  const letters = ["A", "B", "C", "D", "E"].slice(0, q.options.length);
  const hasAnswered = answers[idx] !== undefined;
  // In FLP mode, right/wrong and the explanation stay hidden until the whole
  // paper is submitted — same as a real exam. Everywhere else (normal
  // practice, past papers, etc.) feedback still shows the moment you pick an
  // option, same as before.
  const revealed = hasAnswered && !deferFeedback;
  const isCorrect = revealed && answers[idx] === q.correct;
  const isBookmarked = bookmarks && q ? bookmarks.includes(q.id) : false;

  useEffect(() => {
    setQuestionStartedAt(Date.now());
  }, [idx]);

  const select = (i) => {
    if (revealed) return; // locked once feedback is shown; in FLP mode this never locks, so the answer can be changed until Submit
    const elapsedSeconds = Math.round((Date.now() - questionStartedAt) / 1000);
    setAnswers((a) => ({ ...a, [idx]: i }));
    setAnswerTimes((t) => ({ ...t, [idx]: elapsedSeconds }));
  };

  const toggleExplain = () => setShowExplain((s) => ({ ...s, [idx]: !s[idx] }));

  const finish = useCallback(() => {
    if (finishedRef.current) return; // already submitted — ignore any further calls
    finishedRef.current = true;
    let correct = 0;
    shuffledQuestions.forEach((qq, i) => {
      if (answers[i] === qq.correct) correct++;
    });
    onFinish({ questions: shuffledQuestions, answers, answerTimes, correct });
  }, [shuffledQuestions, answers, answerTimes, onFinish]);

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
          <div className="flex items-center gap-4">
            <button onClick={onExit} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
              <ArrowLeft size={16} /> Exit
            </button>
            {onHome && (
              <button onClick={onHome} className="flex items-center gap-1 text-sm" style={{ color: T.inkSoft }}>
                <HomeIcon size={16} /> Home
              </button>
            )}
          </div>
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

        {revealed && (
          <QuestionFeedbackBar
            question={q}
            feedback={explanationFeedback}
            onVote={onVoteExplanation}
            onReport={onReportQuestion}
          />
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
function Results({ result, subject, onRetry, onHome, bookmarks, onToggleBookmark, explanationFeedback, onVoteExplanation, onReportQuestion, hideScore }) {
  const { questions, answers, correct } = result;
  const pct = Math.round((correct / questions.length) * 100);
  // Up to 5 options (A-E) — MBBS past-paper questions can have a 5th option.
  const letters = ["A", "B", "C", "D", "E"];

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink }}>
      <FontLoader />
      <div className="max-w-2xl mx-auto px-6 py-10">
        {hideScore ? (
          // FLP: the overall percentage/score is intentionally withheld here —
          // that gets announced separately by the admin. Each question below
          // still shows whether it was answered right or wrong, plus its
          // explanation, so review isn't held back — just the final tally.
          <div className="text-center mb-10">
            <div className="text-xs tracking-widest uppercase mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
              {subject} — Submitted
            </div>
            <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl">
              Your paper has been submitted.
            </div>
            <div className="text-sm mt-2" style={{ color: T.inkSoft }}>
              Your overall result will be announced separately. Review your answers and explanations below.
            </div>
          </div>
        ) : (
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
        )}

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
                <div className="mt-3">
                  <QuestionFeedbackBar
                    question={q}
                    feedback={explanationFeedback}
                    onVote={onVoteExplanation}
                    onReport={onReportQuestion}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 justify-center">
          {!hideScore && (
            <button onClick={onRetry} className="flex items-center gap-2 px-5 py-2 text-sm" style={{ border: `1px solid ${T.ink}` }}>
              <RotateCcw size={16} /> Practice again
            </button>
          )}
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
  const [mode, setMode] = useState("login"); // "login" | "signup" | "forgot"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [course, setCourse] = useState("");
  const [courseOpen, setCourseOpen] = useState(false);
  const [mbbsYear, setMbbsYear] = useState("");
  const [mbbsYearOpen, setMbbsYearOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const isLogin = mode === "login";
  const isForgot = mode === "forgot";
  const accent = isForgot ? "#F1C177" : isLogin ? "#6FA3F5" : "#4CD9A0";
  const btnBg = isForgot ? T.amber : isLogin ? T.blue : T.emerald;

  const submit = async () => {
    setError("");
    setNotice("");

    if (isForgot) {
      if (!email.trim()) {
        setError("Please enter your email.");
        return;
      }
      setBusy(true);
      const { error: err } = await sendPasswordReset(email.trim());
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      setNotice("If an account exists for that email, a reset link has been sent. Check your inbox (and spam folder), then follow the link to set a new password.");
      return;
    }

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
    if (mode === "signup" && course === "MBBS" && !mbbsYear) {
      setError("Please select your MBBS year.");
      return;
    }
    setBusy(true);
    if (mode === "signup") {
      const { data, error: err } = await signUp(email.trim(), password, { name: name.trim(), course, mbbsYear: course === "MBBS" ? mbbsYear : "" });
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
          {isForgot ? <KeyRound size={24} color={accent} /> : isLogin ? <ShieldCheck size={24} color={accent} /> : <FlaskConical size={24} color={accent} />}
        </div>

        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700, color: accent }} className="text-3xl mb-1">
          {isForgot ? "Reset your password" : isLogin ? "Log in" : "Create your account"}
        </h1>
        <p className="text-sm mb-6" style={{ color: "#B9C4DE" }}>
          {isForgot
            ? "Enter the email on your account and we'll send you a link to set a new password."
            : isLogin ? "Log in to track your own MCQ scores." : "Sign up to save your practice scores."}
        </p>

        {!isLogin && !isForgot && (
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
              onKeyDown={(e) => e.key === "Enter" && isForgot && submit()}
              placeholder="you@example.com"
              className="w-full py-3 outline-none"
              style={{ background: "transparent", color: "#fff", fontFamily: "'IBM Plex Mono', monospace" }}
            />
          </div>
        </div>

        {!isForgot && (
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
        )}

        {isLogin && (
          <button
            type="button"
            onClick={() => { setMode("forgot"); setError(""); setNotice(""); }}
            className="text-xs mt-1 mb-1"
            style={{ color: "#8FA0C4" }}
          >
            Forgot password?
          </button>
        )}

        {!isLogin && !isForgot && (
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
                    onClick={() => { setCourse(c.key); setCourseOpen(false); if (c.key !== "MBBS") setMbbsYear(""); }}
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

        {!isLogin && !isForgot && course === "MBBS" && (
          <div className="mb-2 relative">
            <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#B9C4DE" }}>
              MBBS Year
            </label>
            <button
              type="button"
              onClick={() => setMbbsYearOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-2 px-3 py-3"
              style={{ border: `1px solid rgba(255,255,255,0.3)`, background: "rgba(255,255,255,0.06)" }}
            >
              <span className="flex items-center gap-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: mbbsYear ? "#fff" : "#8FA0C4" }}>
                <GraduationCap size={14} color={accent} />
                {mbbsYear ? MBBS_YEAR_LABELS[mbbsYear] : "Select your MBBS year…"}
              </span>
              <ChevronDown size={16} color="#8FA0C4" />
            </button>
            {mbbsYearOpen && (
              <div
                className="absolute left-0 right-0 mt-1 z-10"
                style={{ background: "#0F2748", border: `1px solid rgba(255,255,255,0.2)` }}
              >
                {Object.keys(MBBS_STRUCTURE).map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => { setMbbsYear(y); setMbbsYearOpen(false); }}
                    className="w-full text-left px-3 py-3 text-sm"
                    style={{ color: mbbsYear === y ? accent : "#fff", fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    {MBBS_YEAR_LABELS[y] || y}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs mt-1" style={{ color: "#8FA0C4" }}>
              You'll only see {MBBS_YEAR_LABELS[mbbsYear] || "your year's"} content throughout the app.
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
          {busy ? "Please wait…" : isForgot ? "Send reset link" : isLogin ? "Log in" : "Sign up"}
        </button>

        {isForgot ? (
          <button
            onClick={() => { setMode("login"); setError(""); setNotice(""); }}
            className="w-full text-sm mt-4"
            style={{ color: accent }}
          >
            Back to log in
          </button>
        ) : (
          <button
            onClick={() => { setMode(isLogin ? "signup" : "login"); setError(""); setNotice(""); }}
            className="w-full text-sm mt-4"
            style={{ color: accent }}
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Reset Password screen (shown after clicking the emailed reset link) ----------
function ResetPasswordScreen({ onDone, onSignOutAndCancel }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const { error: err } = await updatePassword(password);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDone();
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, #0A1B3D, #123A6B 55%, #0A1B3D)", color: "#fff" }}
    >
      <FontLoader />
      <div className="w-full max-w-sm px-6 relative z-10">
        <div
          className="flex items-center justify-center mb-5"
          style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: `1px solid rgba(255,255,255,0.2)` }}
        >
          <KeyRound size={24} color="#F1C177" />
        </div>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700, color: "#F1C177" }} className="text-3xl mb-1">
          Set a new password
        </h1>
        <p className="text-sm mb-6" style={{ color: "#B9C4DE" }}>
          You've followed a password reset link. Choose a new password below.
        </p>

        <div className="mb-3">
          <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#B9C4DE" }}>
            New password
          </label>
          <div className="flex items-center gap-2 px-3" style={{ border: `1px solid rgba(255,255,255,0.3)`, background: "rgba(255,255,255,0.06)" }}>
            <Lock size={14} color="#F1C177" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full py-3 outline-none"
              style={{ background: "transparent", color: "#fff", fontFamily: "'IBM Plex Mono', monospace" }}
            />
          </div>
        </div>

        <div className="mb-2">
          <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#B9C4DE" }}>
            Confirm new password
          </label>
          <div className="flex items-center gap-2 px-3" style={{ border: `1px solid rgba(255,255,255,0.3)`, background: "rgba(255,255,255,0.06)" }}>
            <Lock size={14} color="#F1C177" />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Re-enter new password"
              className="w-full py-3 outline-none"
              style={{ background: "transparent", color: "#fff", fontFamily: "'IBM Plex Mono', monospace" }}
            />
          </div>
        </div>

        {error && <div className="text-sm mt-2" style={{ color: "#F5A3A3" }}>{error}</div>}

        <button
          onClick={submit}
          disabled={busy}
          className="w-full py-3 text-sm mt-5 disabled:opacity-50 font-medium"
          style={{ background: T.amber, color: "#fff" }}
        >
          {busy ? "Please wait…" : "Update password"}
        </button>

        <button
          onClick={onSignOutAndCancel}
          className="w-full text-sm mt-4"
          style={{ color: "#8FA0C4" }}
        >
          Cancel and sign out
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
          Enter the admin passcode. This screen is only a second check — you must
          already be signed in with the designated admin account for changes to save.
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

const EMPTY_NOTE_FORM = { program: "MDCAT", subject: "", title: "", type: "text", content: "" };
const EMPTY_NOTIF_FORM = { title: "", message: "", sendPush: true, program: "All" };

// ---------- Admin: per-course WhatsApp Community links ----------
// Reuses the same generic social-links key/value store as the WhatsApp Group /
// Instagram / Facebook / TikTok cards (loadSocialLinksMap / saveSocialLinksMap),
// just under different keys ("Community:MDCAT", "Community:MBBS", ...) — no new
// database table needed. Each course only ever sees its OWN key on the Home
// screen (see the `communityLink` lookup in Home), so setting the MDCAT link
// here can never leak into what an MBBS student sees, and vice versa.
function AdminCommunityLinksPanel({ socialLinks, onUpdateSocialLink }) {
  const [drafts, setDrafts] = useState({});
  const [savedFlash, setSavedFlash] = useState(null);

  const valueFor = (courseKey) =>
    drafts[courseKey] !== undefined ? drafts[courseKey] : (socialLinks && socialLinks[`Community:${courseKey}`]) || "";

  const save = async (courseKey) => {
    await onUpdateSocialLink(`Community:${courseKey}`, valueFor(courseKey).trim());
    setSavedFlash(courseKey);
    setTimeout(() => setSavedFlash((cur) => (cur === courseKey ? null : cur)), 1500);
  };

  return (
    <div className="max-w-2xl">
      <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-xl mb-2">WhatsApp Community links</h2>
      <p className="text-sm mb-6" style={{ color: T.inkSoft }}>
        Set one WhatsApp community/group invite link per course. A student only ever sees the shortcut for their own course on the Home screen.
      </p>
      <div className="space-y-4">
        {PROGRAMS.map((p) => (
          <div key={p.key} className="p-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            <label className="text-xs tracking-widest uppercase block mb-2 flex items-center gap-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
              <Users size={13} /> {p.label}
            </label>
            <div className="flex gap-2">
              <input
                value={valueFor(p.key)}
                onChange={(e) => setDrafts({ ...drafts, [p.key]: e.target.value })}
                placeholder="https://chat.whatsapp.com/..."
                className="flex-1 px-3 py-2"
                style={{ border: `1px solid ${T.line}`, background: T.paper, color: T.ink }}
              />
              <button onClick={() => save(p.key)} className="px-4 py-2 text-sm shrink-0" style={{ background: T.emerald, color: "#fff" }}>
                {savedFlash === p.key ? <Check size={14} /> : "Save"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminPanel({ bank, setBank, notesBank, setNotesBank, notifications, setNotifications, questionReports, onResolveReport, onDeleteReport, explanationFeedback, onExit, isDark, onToggleTheme, socialLinks, onUpdateSocialLink, pushSubscriberCount, onSendPush, dailyReminder, onUpdateDailyReminder, flpTests, onAddFLPTest, onDeleteFLPTest }) {
  const [tab, setTab] = useState("list");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  // Guards against duplicate saves: on a slow connection, submit()/saveBulkResults()
  // can take a while, and without this a second (or third) tap on the button before
  // the first save finishes would fire off separate saves — which is what was
  // causing the same MCQ(s) to end up added 2-3 times.
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [filterProgram, setFilterProgram] = useState("All");
  const [search, setSearch] = useState("");
  const [newPass, setNewPass] = useState("");
  const [passMsg, setPassMsg] = useState("");

  // ---- Local-cache bank recovery ----
  // Every device keeps its own IndexedDB copy of the bank purely as a
  // bandwidth-saving cache (see loadLocalBankCache/saveLocalBankCache) — and
  // that cache is NEVER overwritten with an empty array (saveLocalBankCache
  // refuses to save one). So if the live bank in Supabase is ever wiped or
  // shrinks drastically, whichever device most recently had the real, full
  // bank still has it sitting in its local cache, untouched. This checks for
  // that on every Admin Panel open and offers a one-tap restore if found.
  const [cacheRecovery, setCacheRecovery] = useState(null); // { cached, count } | null
  const [recovering, setRecovering] = useState(false);
  const [cacheCheckDone, setCacheCheckDone] = useState(false);
  const [localCacheCount, setLocalCacheCount] = useState(null); // for the always-visible debug line below
  useEffect(() => {
    (async () => {
      const cached = await loadLocalBankCache();
      console.log("[bank recovery check] local cache:", cached ? cached.length : "none found", "| live bank:", bank.length);
      setLocalCacheCount(cached ? cached.length : 0);
      if (cached && cached.length > bank.length + 50) {
        setCacheRecovery({ cached, count: cached.length });
      }
      setCacheCheckDone(true);
    })();
  }, []);
  const restoreFromCache = async () => {
    if (!cacheRecovery || recovering) return;
    const typed = window.prompt(
      `This will replace the live database's ${bank.length} question(s) with the ${cacheRecovery.count} question(s) found in this device's local cache. ` +
      `To confirm, type the exact number ${cacheRecovery.count} below:`
    );
    if (typed === null || typed.trim() !== String(cacheRecovery.count)) {
      alert("Restore cancelled — the number didn't match, nothing was changed.");
      return;
    }
    setRecovering(true);
    const ok = await saveBank(cacheRecovery.cached);
    setRecovering(false);
    if (ok !== true) {
      alert("Could not restore — check your internet connection and try again. Nothing was changed yet, so it's safe to retry.");
      return;
    }
    setBank(cacheRecovery.cached);
    setCacheRecovery(null);
    alert(`Restored ${cacheRecovery.count} questions to the live database.`);
  };

  const [noteForm, setNoteForm] = useState(EMPTY_NOTE_FORM);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [notePdfUploading, setNotePdfUploading] = useState(false);
  const [notifForm, setNotifForm] = useState(EMPTY_NOTIF_FORM);
  const [flpForm, setFlpForm] = useState({ title: "", program: "MDCAT", timeMinutes: 180 });
  const [flpAttempts, setFlpAttempts] = useState([]);
  const [flpAttemptsLoading, setFlpAttemptsLoading] = useState(false);
  const [flpResultsFilter, setFlpResultsFilter] = useState("");

  const saveNoteForm = async () => {
    if (!noteForm.subject.trim() || !noteForm.title.trim() || !noteForm.content.trim()) {
      alert(noteForm.type === "pdf" ? "Please fill in subject and title, and upload a PDF." : "Please fill in subject, title, and content.");
      return;
    }
    const prevNotes = notesBank;
    const fresh = (await loadNotes()) || notesBank;
    let next;
    if (editingNoteId) {
      next = fresh.map((n) => (n.id === editingNoteId ? { ...noteForm, id: editingNoteId } : n));
    } else {
      next = [...fresh, { ...noteForm, id: uid() }];
    }
    setNotesBank(next);
    const ok = await saveNotes(next);
    if (!ok) {
      setNotesBank(prevNotes);
      alert("Could not save this note — check your internet connection and try again.");
      return;
    }
    setNoteForm(EMPTY_NOTE_FORM);
    setEditingNoteId(null);
  };
  const startEditNote = (n) => { setNoteForm({ type: "text", ...n }); setEditingNoteId(n.id); };
  const removeNote = async (id) => {
    const prev = notesBank;
    const fresh = (await loadNotes()) || notesBank;
    const next = fresh.filter((n) => n.id !== id);
    setNotesBank(next);
    const ok = await saveNotes(next);
    if (!ok) {
      setNotesBank(prev);
      alert("Could not delete this note — check your internet connection and try again.");
    }
  };

  const addNotification = async () => {
    if (!notifForm.title.trim() || !notifForm.message.trim()) {
      alert("Please fill in a title and message.");
      return;
    }
    const prev = notifications;
    const fresh = (await loadNotifications()) || notifications;
    const next = [...fresh, { ...notifForm, sendPush: undefined, id: uid(), createdAt: new Date().toISOString() }];
    setNotifications(next);
    const ok = await saveNotifications(next);
    if (!ok) {
      setNotifications(prev);
      alert("This notification was NOT sent — it could not be saved to the database, so students would not have seen it. Check your internet connection and try again.");
      return;
    }
    // Also push it to phones (even closed-app / installed-app) if the admin checked that box.
    if (notifForm.sendPush && onSendPush) {
      const pushOk = await onSendPush({ title: notifForm.title.trim(), body: notifForm.message.trim() });
      if (!pushOk) {
        alert("The in-app notification was sent, but the push (phone) notification could not be sent — check the push server setup.");
      }
    }
    setNotifForm(EMPTY_NOTIF_FORM);
  };
  const removeNotification = async (id) => {
    const prev = notifications;
    const fresh = (await loadNotifications()) || notifications;
    const next = fresh.filter((n) => n.id !== id);
    setNotifications(next);
    const ok = await saveNotifications(next);
    if (!ok) {
      setNotifications(prev);
      alert("Could not delete this notification — check your internet connection and try again.");
    }
  };

  const deleteFLPTest = async (id) => {
    if (!window.confirm("Delete this paper? Students will no longer be able to open it. Past results for it are kept.")) return;
    await onDeleteFLPTest(id);
  };

  // ---- FLP tests: build a fixed paper from a bulk-uploaded PDF. Reuses the
  // exact same PDF-reading/parsing helpers as the "Bulk Upload (PDF)"
  // question-bank tab (extractPdfText, splitIntoQuestionBlocks,
  // parseQuestionBlock) but keeps its own state so the two upload flows
  // never interfere with each other. This is the only way to build an FLP
  // paper — there is no auto/random draw from the bank. Only offered for
  // MDCAT/KMU CAT (flpForm.program is already restricted to FLP_PROGRAMS).
  const [flpBulkFile, setFlpBulkFile] = useState(null);
  const [flpBulkStatus, setFlpBulkStatus] = useState("idle");
  const [flpBulkProgressText, setFlpBulkProgressText] = useState("");
  const [flpBulkError, setFlpBulkError] = useState("");
  const [flpBulkResults, setFlpBulkResults] = useState([]);
  const [flpBulkSummary, setFlpBulkSummary] = useState("");
  const [flpBulkSaving, setFlpBulkSaving] = useState(false);

  const runFLPBulkExtract = async () => {
    if (!flpBulkFile) {
      setFlpBulkError("Please choose a PDF file first.");
      return;
    }
    if (!flpForm.title.trim()) {
      setFlpBulkError("Please give this paper a title above before uploading.");
      return;
    }
    setFlpBulkError("");
    setFlpBulkResults([]);
    setFlpBulkSummary("");
    setFlpBulkPendingTest(null); // starting a fresh extraction — abandon any earlier partial save
    try {
      setFlpBulkStatus("extracting");
      setFlpBulkProgressText("Reading PDF…");
      const fullText = await extractPdfText(flpBulkFile, (page, total) => {
        setFlpBulkProgressText(`Reading PDF — page ${page} of ${total}…`);
      });
      if (!fullText.trim()) {
        setFlpBulkError("Could not find any text in this PDF (it may be a scanned image). Try a text-based PDF.");
        setFlpBulkStatus("error");
        return;
      }

      setFlpBulkStatus("analyzing");
      setFlpBulkProgressText("Parsing questions from the PDF text…");
      const blocks = splitIntoQuestionBlocks(fullText);

      if (blocks.length === 0) {
        setFlpBulkError(
          'This PDF doesn\'t match the expected format ("Q1) question / A) B) C) D) / Answer: / Explanation:"). No questions could be extracted.'
        );
        setFlpBulkStatus("error");
        return;
      }

      const complete = [];
      const incomplete = [];
      blocks.forEach((block) => {
        const parsed = parseQuestionBlock(block);
        const entry = {
          question: parsed.question,
          options: parsed.options.length >= 4 ? parsed.options : ["", "", "", ""],
          correct: parsed.correct !== null ? parsed.correct : 0,
          explanation: parsed.explanation,
          answer_source: parsed.complete ? "text" : "missing",
          include: true,
        };
        if (parsed.complete) complete.push(entry);
        else incomplete.push(entry);
      });

      const combined = [...complete, ...incomplete];
      if (combined.length === 0) {
        setFlpBulkError("No MCQs could be extracted from this PDF. Please check the file and try again.");
        setFlpBulkStatus("error");
        return;
      }

      setFlpBulkSummary(
        incomplete.length > 0
          ? `${complete.length} question(s) parsed completely · ${incomplete.length} question(s) are missing Answer and/or Explanation — please fill those in manually below before creating the paper`
          : `${complete.length} question(s) parsed completely — all good.`
      );
      setFlpBulkResults(combined);
      setFlpBulkStatus("done");
      setFlpBulkProgressText("");
    } catch (e) {
      setFlpBulkError(String(e?.message || e));
      setFlpBulkStatus("error");
    }
  };

  const toggleFLPBulkInclude = (idx) => {
    setFlpBulkResults((prev) => prev.map((m, i) => (i === idx ? { ...m, include: !m.include } : m)));
  };
  const updateFLPBulkResult = (idx, patch) => {
    setFlpBulkResults((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  // If the FLP-paper save fails after the questions were already added to the
  // bank (see createFLPTestFromBulk below), this holds onto that already-saved
  // test object so a retry re-attempts only the paper save — not a duplicate
  // bank insert of the same questions.
  const [flpBulkPendingTest, setFlpBulkPendingTest] = useState(null);

  // Adds the reviewed questions to the bank (tagged with this paper's title
  // as their source/topic, so they're easy to find later) and then creates
  // the fixed FLP test pointing at exactly those new question ids — no
  // random draw involved, since the whole paper came from the uploaded PDF.
  const createFLPTestFromBulk = async () => {
    if (flpBulkSaving) return; // already in-flight — ignore extra taps
    setFlpBulkSaving(true);

    let test = flpBulkPendingTest;
    if (!test) {
      if (!flpForm.title.trim()) {
        alert("Please give this paper a title.");
        setFlpBulkSaving(false);
        return;
      }
      const toAdd = flpBulkResults
        .filter((m) => m.include)
        .map((m) => ({
          id: uid(),
          program: flpForm.program,
          year: "",
          block: "",
          subject: "FLP",
          topic: flpForm.title.trim(),
          source: flpForm.title.trim(),
          question: m.question,
          options: m.options,
          correct: m.correct,
          explanation: m.explanation,
        }));
      if (toAdd.length === 0) {
        alert("No questions selected. Tick \"Include\" on at least one question below.");
        setFlpBulkSaving(false);
        return;
      }
      const prevBank = bank;
      const nextBank = [...bank, ...toAdd];
      setBank(nextBank);
      const ok = await saveBank(nextBank);
      if (ok !== true) {
        setBank(prevBank);
        setFlpBulkSaving(false);
        alert(
          ok === "blocked"
            ? "Save blocked: this looked like it would wipe most of the bank at once, so nothing was saved. Please reload and try again."
            : "Could not save these questions — check your internet connection and try again."
        );
        return;
      }
      test = {
        id: uid(),
        title: flpForm.title.trim(),
        program: flpForm.program,
        timeSeconds: Math.max(1, Number(flpForm.timeMinutes) || 1) * 60,
        questionIds: toAdd.map((q) => q.id),
        createdAt: new Date().toISOString(),
      };
      setFlpBulkPendingTest(test);
    }

    const testSaved = await onAddFLPTest(test);
    setFlpBulkSaving(false);
    if (!testSaved) {
      // The questions are already safely in the bank (or were on a previous
      // attempt) — only the FLP paper record itself failed to save. Keep
      // flpBulkPendingTest set so the next click retries just this step,
      // never re-adding the same questions to the bank again.
      return;
    }
    setFlpBulkPendingTest(null);
    setFlpBulkResults([]);
    setFlpBulkSummary("");
    setFlpBulkStatus("idle");
    setFlpBulkFile(null);
    setFlpForm({ title: "", program: flpForm.program, timeMinutes: 180 });
    alert(`FLP paper "${test.title}" created with ${test.questionIds.length} question(s).`);
  };


  // ---- Exam countdown dates ----
  const [examDates, setExamDates] = useState({});
  const [examDatesLoading, setExamDatesLoading] = useState(true);
  const [examDatesMsg, setExamDatesMsg] = useState("");
  useEffect(() => {
    (async () => {
      setExamDates(await loadExamDates());
      setExamDatesLoading(false);
    })();
  }, []);
  const saveExamDate = async (programKey, dateStr) => {
    const next = await mergeAppDataField("exam_dates", {}, (current) => {
      const merged = { ...current, [programKey]: dateStr || undefined };
      if (!dateStr) delete merged[programKey];
      return merged;
    });
    if (next === null) {
      setExamDatesMsg("Could not save — check your internet connection.");
      setTimeout(() => setExamDatesMsg(""), 2000);
      return;
    }
    setExamDates(next);
    setExamDatesMsg("Saved.");
    setTimeout(() => setExamDatesMsg(""), 2000);
  };

  // ---- Admin Dashboard: installs + daily usage ----
  const [dashLoading, setDashLoading] = useState(true);
  const [dashData, setDashData] = useState({ installs: [], usage: [], error: null });
  const loadDashboard = async () => {
    setDashLoading(true);
    setDashData(await loadUsageDashboard());
    setDashLoading(false);
  };
  useEffect(() => { loadDashboard(); }, []);
  // On-demand diagnostic: lets the admin check directly from the app whether
  // usage tracking is actually reachable/writable, and see the exact error if not.
  const [usageTestResult, setUsageTestResult] = useState(null);
  const [usageTesting, setUsageTesting] = useState(false);
  const runUsageTest = async () => {
    setUsageTesting(true);
    setUsageTestResult(null);
    const res = await testUsageTracking();
    setUsageTestResult(res);
    setUsageTesting(false);
  };

  // ---- Content Analytics: bank breakdown + cross-student weak topics ----
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [allSubjectStats, setAllSubjectStats] = useState([]);
  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    setAllSubjectStats(await loadAllStudentSubjectStats());
    setAnalyticsLoading(false);
  };
  useEffect(() => { loadAnalytics(); }, []);

  const bankBreakdown = useMemo(() => {
    const c = {};
    bank.forEach((q) => { c[q.program] = (c[q.program] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [bank]);

  const cohortWeakTopics = useMemo(() => {
    const totals = {};
    allSubjectStats.forEach((bySubject) => {
      Object.entries(bySubject || {}).forEach(([key, v]) => {
        if (!totals[key]) totals[key] = { attempted: 0, correct: 0 };
        totals[key].attempted += v.attempted || 0;
        totals[key].correct += v.correct || 0;
      });
    });
    return Object.entries(totals)
      .map(([key, v]) => ({ key, ...v, accuracy: v.attempted > 0 ? Math.round((v.correct / v.attempted) * 100) : 0 }))
      .filter((e) => e.attempted >= 5)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 10);
  }, [allSubjectStats]);

  const lowestRatedExplanations = useMemo(() => {
    return Object.entries(explanationFeedback || {})
      .map(([qId, v]) => ({ qId, up: v.up || 0, down: v.down || 0 }))
      .filter((e) => e.down > 0)
      .sort((a, b) => b.down - a.down)
      .slice(0, 10)
      .map((e) => ({ ...e, question: bank.find((q) => q.id === e.qId) }));
  }, [explanationFeedback, bank]);

  const openReports = questionReports.filter((r) => !r.resolved);

  const dashStats = useMemo(() => {
    const { installs, usage } = dashData;
    const installedUsers = new Set(installs.map((r) => r.user_id)).size;
    const today = new Date().toISOString().slice(0, 10);
    const todayRows = usage.filter((r) => r.date === today);
    const activeToday = todayRows.length;
    const minutesToday = todayRows.reduce((sum, r) => sum + (r.minutes || 0), 0);
    const hoursToday = (minutesToday / 60).toFixed(1);

    // Last 7 days total usage, for the trend chart.
    const byDate = {};
    usage.forEach((r) => { byDate[r.date] = (byDate[r.date] || 0) + (r.minutes || 0); });
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      last7.push({ label: d.slice(5).replace("-", "/"), y: Math.round(((byDate[d] || 0) / 60) * 10) / 10 });
    }

    // Total minutes per user, for a simple "most active students" list.
    const perUser = {};
    usage.forEach((r) => {
      if (!perUser[r.user_id]) perUser[r.user_id] = { name: r.name || "Student", minutes: 0 };
      perUser[r.user_id].minutes += r.minutes || 0;
    });
    const topUsers = Object.values(perUser).sort((a, b) => b.minutes - a.minutes).slice(0, 10);

    return { installedUsers, activeToday, hoursToday, last7, topUsers };
  }, [dashData]);

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
      : !!(
          bulkForm.subject &&
          (TOPIC_PROGRAMS.includes(bulkForm.program) && (MDCAT_TOPICS[bulkForm.subject] || []).length > 0
            ? bulkForm.topic
            : true)
        );

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
          options: parsed.options.length >= 4 ? parsed.options : ["", "", "", ""],
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
    if (bulkSaving) return; // already in-flight — ignore extra taps
    const toAdd = bulkResults
      .filter((m) => m.include)
      .map((m) => ({
        id: uid(),
        program: bulkForm.program,
        year: bulkForm.program === "MBBS" ? bulkForm.year : "",
        block: bulkForm.program === "MBBS" ? bulkForm.block : "",
        subject: bulkForm.subject,
        topic: bulkForm.subject === PAST_PAPERS_SUBJECT ? bulkForm.source : ((TOPIC_PROGRAMS.includes(bulkForm.program) || bulkForm.program === "MBBS") ? bulkForm.topic : ""),
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
    const prevBank = bank;
    // Use the bank already held in memory instead of re-downloading the entire
    // bank over the network first. saveBank() below already protects against
    // another tab/device's changes via its own concurrency check (bank_version),
    // so this extra download was purely redundant — it doubled the data
    // transferred (download the full bank, then upload the full bank again)
    // on every single save. On a slow mobile connection with a large, growing
    // bank, that's what made the admin panel slow and made bulk PDF saves
    // increasingly likely to time out (the 2nd/3rd PDF fails more often than
    // the 1st, since the bank — and so the download+upload size — has already
    // grown from the previous save).
    const next = [...bank, ...toAdd];
    setBulkSaving(true);
    setBank(next);
    const ok = await saveBank(next);
    setBulkSaving(false);
    if (ok !== true) {
      setBank(prevBank);
      alert(
        ok === "blocked"
          ? "Save blocked: this looked like it would wipe most of the bank at once, so nothing was saved. Please reload and try again."
          : "Could not save these questions — check your internet connection and try again."
      );
      return;
    }
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

  // Deletes exactly one question, directly and atomically inside the database
  // via the delete_mcq() function — not by reading the whole bank, removing
  // the item locally, and writing the whole bank back. This is what makes
  // the deletion permanent: there's no "stale copy from elsewhere" that can
  // ever overwrite it back into existence, because nothing ever sends the
  // full array back for a delete.
  const remove = async (id) => {
    const prev = bank;
    const next = bank.filter((q) => q.id !== id);
    setBank(next); // optimistic UI update
    try {
      const { error } = await supabase.rpc("delete_mcq", { question_id: id });
      if (error) throw error;
      lastKnownBankLength = next.length;
      const cacheSaved = await saveLocalBankCache(next);
      const cdnVersion = (await pushBankToCdn(next)).version;
      if (cdnVersion !== null) {
        lastKnownBankVersion = cdnVersion;
        if (cacheSaved) saveLocalBankVersion(cdnVersion);
        else clearLocalBankVersion();
      }
    } catch (e) {
      console.error("Delete failed:", e);
      setBank(prev);
      alert("Could not delete this question — check your internet connection and try again.");
    }
  };

  // Deletes every question currently matching the search/program filters in one go
  // (e.g. filter to "Chemistry" and wipe the whole subject instead of deleting one by one).
  // Also atomic on the database side via delete_mcqs() — same permanence guarantee.
  // One-time (or anytime) manual sync — pushes whatever is currently loaded
  // from Supabase up to the Cloudflare CDN. Useful right after connecting the
  // CDN for the first time, so students start getting the existing bank from
  // there immediately instead of waiting for the next add/edit/delete.
  const [cdnSyncing, setCdnSyncing] = useState(false);
  const syncToCdn = async () => {
    setCdnSyncing(true);
    try {
      const { version: cdnVersion, error: cdnError } = await pushBankToCdn(bank);
      if (cdnVersion !== null) {
        lastKnownBankVersion = cdnVersion;
        lastKnownBankLength = bank.length;
        alert(`Synced ${bank.length} question(s) to the CDN.`);
      } else {
        alert(`CDN sync failed: ${cdnError || "unknown error"}`);
      }
    } finally {
      setCdnSyncing(false);
    }
  };

  const bulkDeleteFiltered = async () => {
    if (filtered.length === 0) return;
    const ok1 = window.confirm(
      `Delete all ${filtered.length} matching question(s)? This cannot be undone.`
    );
    if (!ok1) return;
    const prev = bank;
    const idsToRemove = filtered.map((q) => q.id);
    const idSet = new Set(idsToRemove);
    const next = bank.filter((q) => !idSet.has(q.id));
    setBank(next);
    try {
      const { error } = await supabase.rpc("delete_mcqs", { question_ids: idsToRemove });
      if (error) throw error;
      lastKnownBankLength = next.length;
      const cacheSaved = await saveLocalBankCache(next);
      const cdnVersion = (await pushBankToCdn(next)).version;
      if (cdnVersion !== null) {
        lastKnownBankVersion = cdnVersion;
        if (cacheSaved) saveLocalBankVersion(cdnVersion);
        else clearLocalBankVersion();
      }
      alert(`${idsToRemove.length} question(s) deleted.`);
    } catch (e) {
      console.error("Bulk delete failed:", e);
      setBank(prev);
      alert("Could not delete these questions — check your internet connection and try again.");
    }
  };

  const submit = async () => {
    if (saving) return; // already in-flight — ignore extra taps
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
      const needsTopic = !(TOPIC_PROGRAMS.includes(form.program) && (MDCAT_TOPICS[form.subject] || []).length === 0);
      if (!form.subject.trim() || (needsTopic && !form.topic.trim())) {
        alert("Please fill in the subject and topic.");
        return;
      }
    }
    const prevBank = bank;
    // Same reasoning as in saveBulkResults() above: use the bank already held
    // in memory rather than re-downloading the whole thing first. saveBank()'s
    // own bank_version check already guards against another tab/device having
    // changed things in the meantime, so this avoids doubling the network
    // transfer on every single question add/edit.
    const formToSave = form.subject === PAST_PAPERS_SUBJECT ? { ...form, topic: form.source } : form;
    let next;
    if (editingId) {
      next = bank.map((q) => (q.id === editingId ? { ...formToSave, id: editingId } : q));
    } else {
      next = [...bank, { ...formToSave, id: uid() }];
    }
    setSaving(true);
    setBank(next);
    const ok = await saveBank(next);
    setSaving(false);
    if (ok !== true) {
      setBank(prevBank);
      alert(
        ok === "blocked"
          ? "Save blocked: this looked like it would wipe most of the bank at once, so nothing was saved. Please reload and try again."
          : "Could not save this question — check your internet connection and try again."
      );
      return;
    }
    setTab("list");
  };

  const changePass = async () => {
    if (!newPass.trim()) return;
    const ok = await savePasscode(newPass.trim());
    setPassMsg(ok ? "Passcode updated." : "Could not update passcode — check your internet connection and try again.");
    if (ok) setNewPass("");
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
          <div className="flex items-center gap-2">
            <button onClick={onToggleTheme} className="p-2" style={{ border: `1px solid ${T.line}` }} title="Toggle dark/light mode">
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button onClick={onExit} className="flex items-center gap-1 text-sm px-3 py-1.5" style={{ border: `1px solid ${T.ink}` }}>
              <LogOut size={14} /> Exit admin
            </button>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-6 flex gap-1 pb-3">
          {[
            { k: "list", label: "All questions" },
            { k: "form", label: editingId ? "Edit question" : "Add question" },
            { k: "bulk", label: "Bulk Upload (PDF)" },
            { k: "notes", label: "Notes" },
            { k: "notifications", label: "Notifications" },
            { k: "community", label: "Community Links" },
            { k: "examdates", label: "Exam Dates" },
            { k: "flp", label: "FLP Tests" },
            { k: "flpresults", label: "FLP Results" },
            { k: "dashboard", label: "Dashboard" },
            { k: "analytics", label: "Analytics" },
            { k: "reports", label: `Reports${openReports.length > 0 ? ` (${openReports.length})` : ""}` },
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

      {cacheCheckDone && !cacheRecovery && (
        <div className="max-w-5xl mx-auto px-6 pt-4">
          <div className="text-xs" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
            Local cache check (this device): {localCacheCount === 0 ? "no cache found" : `${localCacheCount} questions cached`} · Live bank: {bank.length} questions
          </div>
        </div>
      )}

      {cacheRecovery && (
        <div className="max-w-5xl mx-auto px-6 pt-6">
          <div className="p-4 flex items-center justify-between gap-4 flex-wrap" style={{ background: T.roseSoft, border: `1px solid ${T.rose}` }}>
            <div>
              <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700, color: T.rose }} className="mb-1">
                Possible bank recovery found
              </div>
              <div className="text-sm" style={{ color: T.ink }}>
                This device has a locally cached copy of the question bank with <strong>{cacheRecovery.count}</strong> questions,
                but the live database currently only has <strong>{bank.length}</strong>. If the live bank was recently wiped by
                mistake, this cache is very likely your real data — restoring it will replace what's live now with this cached copy.
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={restoreFromCache}
                disabled={recovering}
                className="px-4 py-2 text-sm disabled:opacity-50"
                style={{ background: T.rose, color: "#fff" }}
              >
                {recovering ? "Restoring…" : `Restore ${cacheRecovery.count} questions`}
              </button>
              <button onClick={() => setCacheRecovery(null)} className="px-3 py-2 text-sm" style={{ border: `1px solid ${T.line}`, color: T.inkSoft }}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

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
              <button
                onClick={syncToCdn}
                disabled={cdnSyncing}
                className="flex items-center gap-1 px-4 py-2 text-sm disabled:opacity-40"
                style={{ border: `1px solid ${T.ink}`, color: T.ink }}
                title="Push the currently loaded question bank to the Cloudflare CDN right now"
              >
                {cdnSyncing ? "Syncing…" : "Sync to CDN"}
              </button>
              <button
                onClick={bulkDeleteFiltered}
                disabled={filtered.length === 0}
                className="flex items-center gap-1 px-4 py-2 text-sm disabled:opacity-40"
                style={{ border: `1px solid ${T.rose}`, color: T.rose }}
                title="Deletes every question currently shown below (matching your search/program filter)"
              >
                <Trash2 size={16} /> Delete all filtered ({filtered.length})
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
                <input
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  placeholder="Practice or Past Paper 2024"
                  list="source-suggestions"
                  className="w-full px-3 py-2"
                  style={{ border: `1px solid ${T.line}`, background: T.card }}
                />
                <datalist id="source-suggestions">
                  <option value="Practice" />
                  {pastPaperLeafNames(form.program).map((f) => <option key={f} value={f} />)}
                </datalist>
                <p className="text-xs mt-1" style={{ color: T.inkSoft }}>
                  Use an exact Past Papers folder name (see suggestions) to file this question into that folder.
                </p>
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
                    <option value={PAST_PAPERS_SUBJECT}>{PAST_PAPERS_SUBJECT} (mixed subjects)</option>
                    {Object.keys(MDCAT_TOPICS).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Topic</label>
                  {(MDCAT_TOPICS[form.subject] || []).length > 0 ? (
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
                  ) : (
                    <div className="w-full px-3 py-2 text-sm" style={{ border: `1px solid ${T.line}`, background: T.card, color: T.inkSoft }}>
                      {form.subject === PAST_PAPERS_SUBJECT
                        ? "Auto-set to match Source above"
                        : form.subject
                        ? "No sub-topics for this subject"
                        : "Choose subject first"}
                    </div>
                  )}
                </div>
              </div>
            )}

            {form.program === "MBBS" && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Year</label>
                  <select
                    value={form.year}
                    onChange={(e) => setForm({ ...form, year: e.target.value, block: "", subject: "", topic: "" })}
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
                    onChange={(e) => setForm({ ...form, block: e.target.value, subject: "", topic: "" })}
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
                    onChange={(e) => setForm({ ...form, subject: e.target.value, topic: "" })}
                    disabled={!form.block}
                    className="w-full px-3 py-2"
                    style={{ border: `1px solid ${T.line}`, background: T.card }}
                  >
                    <option value="">{form.block ? "Select subject…" : "Choose block first"}</option>
                    {((MBBS_STRUCTURE[form.year] || {})[form.block] || []).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Topic</label>
                  {mbbsAllLeaves(form.block, form.subject).length > 0 ? (
                    <select
                      value={form.topic}
                      onChange={(e) => setForm({ ...form, topic: e.target.value })}
                      disabled={!form.subject}
                      className="w-full px-3 py-2"
                      style={{ border: `1px solid ${T.line}`, background: T.card }}
                    >
                      <option value="">{form.subject ? "Select topic…" : "Choose subject first"}</option>
                      {mbbsAllLeaves(form.block, form.subject).map((t) => <option key={t}>{t}</option>)}
                    </select>
                  ) : (
                    <input
                      value={form.topic}
                      onChange={(e) => setForm({ ...form, topic: e.target.value })}
                      placeholder={form.subject ? "Optional topic" : "Choose subject first"}
                      disabled={!form.subject}
                      className="w-full px-3 py-2"
                      style={{ border: `1px solid ${T.line}`, background: T.card }}
                    />
                  )}
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
                    letter={["A", "B", "C", "D", "E"][i]}
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
                  {form.program === "MBBS" && form.options.length === 5 && i === 4 && (
                    <button
                      onClick={() => {
                        const o = form.options.slice(0, 4);
                        setForm({ ...form, options: o, correct: form.correct === 4 ? 0 : form.correct });
                      }}
                      title="Remove option E"
                      style={{ color: T.rose }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {form.program === "MBBS" && form.options.length === 4 && (
                <button
                  onClick={() => setForm({ ...form, options: [...form.options, ""] })}
                  className="flex items-center gap-2 text-xs px-3 py-1.5"
                  style={{ border: `1px solid ${T.line}`, color: T.inkSoft }}
                >
                  <Plus size={12} /> Add option E (for past papers with 5 options)
                </button>
              )}
            </div>
            <div className="mb-6">
              <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Explanation (optional)</label>
              <textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} rows={2} className="w-full px-3 py-2" style={{ border: `1px solid ${T.line}`, background: T.card }} />
            </div>
            <div className="flex gap-3">
              <button onClick={submit} disabled={saving} className="flex items-center gap-2 px-5 py-2 text-sm disabled:opacity-50" style={{ background: T.ink, color: T.paper }}>
                <Save size={16} /> {saving ? "Saving…" : editingId ? "Save changes" : "Add to bank"}
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
                <input
                  value={bulkForm.source}
                  onChange={(e) => setBulkForm({ ...bulkForm, source: e.target.value })}
                  placeholder="e.g. Past Paper 2024"
                  list="bulk-source-suggestions"
                  className="w-full px-3 py-2"
                  style={{ border: `1px solid ${T.line}`, background: T.card }}
                />
                <datalist id="bulk-source-suggestions">
                  {pastPaperLeafNames(bulkForm.program).map((f) => <option key={f} value={f} />)}
                </datalist>
                <p className="text-xs mt-1" style={{ color: T.inkSoft }}>
                  Use an exact Past Papers folder name (see suggestions) to file these into that folder.
                </p>
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
                    <option value={PAST_PAPERS_SUBJECT}>{PAST_PAPERS_SUBJECT} (mixed subjects)</option>
                    {Object.keys(MDCAT_TOPICS).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Topic</label>
                  {(MDCAT_TOPICS[bulkForm.subject] || []).length > 0 ? (
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
                  ) : (
                    <div className="w-full px-3 py-2 text-sm" style={{ border: `1px solid ${T.line}`, background: T.card, color: T.inkSoft }}>
                      {bulkForm.subject === PAST_PAPERS_SUBJECT
                        ? "Auto-set to match Source label above"
                        : bulkForm.subject
                        ? "No sub-topics for this subject"
                        : "Choose subject first"}
                    </div>
                  )}
                </div>
              </div>
            )}

            {bulkForm.program === "MBBS" && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Year</label>
                  <select
                    value={bulkForm.year}
                    onChange={(e) => setBulkForm({ ...bulkForm, year: e.target.value, block: "", subject: "", topic: "" })}
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
                    onChange={(e) => setBulkForm({ ...bulkForm, block: e.target.value, subject: "", topic: "" })}
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
                    onChange={(e) => setBulkForm({ ...bulkForm, subject: e.target.value, topic: "" })}
                    disabled={!bulkForm.block}
                    className="w-full px-3 py-2"
                    style={{ border: `1px solid ${T.line}`, background: T.card }}
                  >
                    <option value="">{bulkForm.block ? "Select subject…" : "Choose block first"}</option>
                    {((MBBS_STRUCTURE[bulkForm.year] || {})[bulkForm.block] || []).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Topic</label>
                  {mbbsAllLeaves(bulkForm.block, bulkForm.subject).length > 0 ? (
                    <select
                      value={bulkForm.topic}
                      onChange={(e) => setBulkForm({ ...bulkForm, topic: e.target.value })}
                      disabled={!bulkForm.subject}
                      className="w-full px-3 py-2"
                      style={{ border: `1px solid ${T.line}`, background: T.card }}
                    >
                      <option value="">{bulkForm.subject ? "Select topic…" : "Choose subject first"}</option>
                      {mbbsAllLeaves(bulkForm.block, bulkForm.subject).map((t) => <option key={t}>{t}</option>)}
                    </select>
                  ) : (
                    <input
                      value={bulkForm.topic}
                      onChange={(e) => setBulkForm({ ...bulkForm, topic: e.target.value })}
                      placeholder={bulkForm.subject ? "Optional topic" : "Choose subject first"}
                      disabled={!bulkForm.subject}
                      className="w-full px-3 py-2"
                      style={{ border: `1px solid ${T.line}`, background: T.card }}
                    />
                  )}
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
                  <button onClick={saveBulkResults} disabled={bulkSaving} className="flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50" style={{ background: T.emerald, color: "#fff" }}>
                    <Save size={16} /> {bulkSaving ? "Saving…" : "Add selected to bank"}
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
                              letter={["A", "B", "C", "D", "E"][oi]}
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
                            {bulkForm.program === "MBBS" && m.options.length === 5 && oi === 4 && (
                              <button
                                onClick={() => updateBulkResult(idx, { options: m.options.slice(0, 4), correct: m.correct === 4 ? 0 : m.correct })}
                                title="Remove option E"
                                style={{ color: T.rose }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                        {bulkForm.program === "MBBS" && m.options.length === 4 && (
                          <button
                            onClick={() => updateBulkResult(idx, { options: [...m.options, ""] })}
                            className="flex items-center gap-1 text-xs px-2 py-1"
                            style={{ border: `1px solid ${T.line}`, color: T.inkSoft }}
                          >
                            <Plus size={12} /> Add option E
                          </button>
                        )}
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
                <button onClick={saveBulkResults} disabled={bulkSaving} className="flex items-center gap-2 px-4 py-2 text-sm mt-4 disabled:opacity-50" style={{ background: T.emerald, color: "#fff" }}>
                  <Save size={16} /> {bulkSaving ? "Saving…" : "Add selected to bank"}
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
              <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Note type</label>
              <div className="flex gap-2">
                {["text", "pdf"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setNoteForm({ ...noteForm, type: t, content: "" })}
                    className="px-3 py-1.5 text-xs uppercase"
                    style={{
                      border: `1px solid ${T.ink}`,
                      background: noteForm.type === t ? T.ink : "transparent",
                      color: noteForm.type === t ? T.paper : T.ink,
                    }}
                  >
                    {t === "pdf" ? "PDF file" : "Written text"}
                  </button>
                ))}
              </div>
            </div>
            {noteForm.type === "pdf" ? (
              <div className="mb-4">
                <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>PDF file</label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setNotePdfUploading(true);
                    const { url, error } = await uploadNotePdf(file);
                    setNotePdfUploading(false);
                    if (!url) {
                      alert("Could not upload this PDF. Make sure a public 'notes-pdfs' Storage bucket exists in Supabase, then try again.\n\n" + (error?.message || ""));
                      return;
                    }
                    setNoteForm((prevForm) => ({ ...prevForm, content: url }));
                  }}
                  className="w-full text-sm"
                />
                {notePdfUploading && <div className="text-xs mt-1" style={{ color: T.inkSoft }}>Uploading PDF…</div>}
                {!notePdfUploading && noteForm.content && (
                  <div className="text-xs mt-1" style={{ color: T.emerald }}>✓ PDF uploaded — ready to save.</div>
                )}
              </div>
            ) : (
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
            )}
            <div className="flex gap-3 mb-8">
              <button onClick={saveNoteForm} disabled={notePdfUploading} className="flex items-center gap-2 px-5 py-2 text-sm disabled:opacity-50" style={{ background: T.ink, color: T.paper }}>
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
                      {n.program} · {n.subject} {n.type === "pdf" ? "· PDF" : ""}
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
              Choose which course this notification goes to below — students only see notifications for their own course (plus "All courses" ones).
            </p>
            <div className="mb-4">
              <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>Send to</label>
              <select
                value={notifForm.program}
                onChange={(e) => setNotifForm({ ...notifForm, program: e.target.value })}
                className="w-full px-3 py-2"
                style={{ border: `1px solid ${T.line}`, background: T.card }}
              >
                <option value="All">All courses</option>
                {PROGRAMS.map((p) => <option key={p.key} value={p.key}>{p.key}</option>)}
              </select>
            </div>
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
            <label className="flex items-center gap-2 text-sm mb-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!notifForm.sendPush}
                onChange={(e) => setNotifForm({ ...notifForm, sendPush: e.target.checked })}
              />
              <span>
                Also send as a <b>push notification</b> — reaches students' phones even if the app is closed
                {typeof pushSubscriberCount === "number" ? ` (${pushSubscriberCount} subscribed)` : ""}
              </span>
            </label>
            <button onClick={addNotification} className="flex items-center gap-2 px-5 py-2 text-sm mb-8" style={{ background: T.ink, color: T.paper }}>
              <Send size={16} /> Send notification
            </button>

            <div className="p-4 mb-8 flex items-start gap-3" style={{ background: T.card, border: `1px solid ${T.line}` }}>
              <Bell size={16} style={{ color: T.amber, marginTop: 2 }} />
              <div className="text-sm" style={{ color: T.inkSoft }}>
                <b style={{ color: T.ink }}>Automatic daily reminder</b> is configured separately — see the toggle below.
              </div>
            </div>
            <div className="p-5 mb-8" style={{ background: T.card, border: `1px solid ${T.line}` }}>
              <h3 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-lg mb-2 flex items-center gap-2">
                <Clock size={16} /> Daily study reminder
              </h3>
              <p className="text-sm mb-3" style={{ color: T.inkSoft }}>
                Sends a push notification to every subscribed student at this time, every day — no admin action needed once set.
              </p>
              <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!dailyReminder?.enabled}
                  onChange={(e) => onUpdateDailyReminder({ ...dailyReminder, enabled: e.target.checked })}
                />
                <span>Enabled</span>
              </label>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="time"
                  value={dailyReminder?.time || "18:00"}
                  onChange={(e) => onUpdateDailyReminder({ ...dailyReminder, time: e.target.value })}
                  className="px-3 py-2"
                  style={{ border: `1px solid ${T.line}`, background: T.paper, color: T.ink }}
                />
                <span className="text-xs" style={{ color: T.inkSoft }}>Server time (see setup notes)</span>
              </div>
              <input
                value={dailyReminder?.message || "Don't break your streak — today's questions are waiting!"}
                onChange={(e) => onUpdateDailyReminder({ ...dailyReminder, message: e.target.value })}
                placeholder="Reminder message"
                className="w-full px-3 py-2"
                style={{ border: `1px solid ${T.line}`, background: T.paper, color: T.ink }}
              />
            </div>

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
                    <div className="text-sm mb-1" style={{ color: T.inkSoft }}>{n.message}</div>
                    <div className="text-xs" style={{ color: T.amber, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {!n.program || n.program === "All" ? "All courses" : n.program}
                    </div>
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

        {tab === "community" && (
          <AdminCommunityLinksPanel socialLinks={socialLinks} onUpdateSocialLink={onUpdateSocialLink} />
        )}

        {tab === "examdates" && (
          <div className="max-w-lg">
            <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-xl mb-2 flex items-center gap-2">
              <Clock size={18} /> Exam Countdown Dates
            </h2>
            <p className="text-sm mb-5" style={{ color: T.inkSoft }}>
              Set the exam date for each program. Students only see a countdown for their
              own course — clear the date to hide the countdown again. MBBS has a separate
              date for First Year and 2nd Year, since students only see their own year's date.
            </p>
            {examDatesLoading ? (
              <div className="text-sm" style={{ color: T.inkSoft }}>Loading…</div>
            ) : (
              <div className="space-y-3">
                {PROGRAMS.flatMap((p) =>
                  p.key === "MBBS"
                    ? Object.keys(MBBS_STRUCTURE).map((y) => ({ key: `MBBS|${y}`, label: MBBS_YEAR_LABELS[y] || `MBBS ${y}` }))
                    : [{ key: p.key, label: p.label }]
                ).map((row) => (
                  <div key={row.key} className="p-4 flex items-center justify-between gap-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                    <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{row.label}</div>
                    <input
                      type="date"
                      value={examDates[row.key] || ""}
                      onChange={(e) => saveExamDate(row.key, e.target.value)}
                      className="px-3 py-2 text-sm"
                      style={{ border: `1px solid ${T.line}`, background: T.paper, color: T.ink, fontFamily: "'IBM Plex Mono', monospace" }}
                    />
                  </div>
                ))}
              </div>
            )}
            {examDatesMsg && <div className="text-sm mt-3" style={{ color: T.emerald }}>{examDatesMsg}</div>}
          </div>
        )}

        {tab === "flp" && (
          <div className="max-w-3xl">
            <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-xl mb-2 flex items-center gap-2">
              <FileCheck2 size={18} /> Full Length Paper Tests
            </h2>
            <p className="text-sm mb-6" style={{ color: T.inkSoft }}>
              Upload a PDF to build a fixed paper — every question extracted from it becomes
              this paper, and it stays exactly the same for every student who opens it (like
              a real, printed exam). Only offered to MDCAT and KMU CAT.
            </p>

            <div className="p-5 mb-8" style={{ background: T.card, border: `1px solid ${T.line}` }}>
              <label className="text-xs tracking-widest uppercase block mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
                Title
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {["First Year Full Course Test", "2nd Year Full Course Test", "Full Course Test"].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setFlpForm({ ...flpForm, title: preset })}
                    className="text-xs px-2 py-1"
                    style={{ border: `1px solid ${flpForm.title === preset ? T.ink : T.line}`, color: flpForm.title === preset ? T.ink : T.inkSoft }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                value={flpForm.title}
                onChange={(e) => setFlpForm({ ...flpForm, title: e.target.value })}
                placeholder="Or type a custom title…"
                className="w-full px-3 py-2 text-sm mb-4"
                style={{ border: `1px solid ${T.line}`, background: T.paper }}
              />

              <label className="text-xs tracking-widest uppercase block mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
                Program
              </label>
              <div className="flex gap-2 mb-4">
                {FLP_PROGRAMS.map((key) => {
                  const label = PROGRAMS.find((p) => p.key === key)?.label || key;
                  return (
                    <button
                      key={key}
                      onClick={() => setFlpForm({ ...flpForm, program: key })}
                      className="text-sm px-3 py-1.5"
                      style={{
                        background: flpForm.program === key ? T.ink : "transparent",
                        color: flpForm.program === key ? T.paper : T.inkSoft,
                        border: `1px solid ${T.ink}`,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <label className="text-xs tracking-widest uppercase block mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
                Time limit (minutes)
              </label>
              <input
                type="number"
                min={1}
                value={flpForm.timeMinutes}
                onChange={(e) => setFlpForm({ ...flpForm, timeMinutes: e.target.value })}
                className="w-32 px-3 py-2 text-sm mb-4"
                style={{ border: `1px solid ${T.line}`, background: T.paper, fontFamily: "'IBM Plex Mono', monospace" }}
              />

              <div>
                  <p className="text-sm mb-4" style={{ color: T.inkSoft }}>
                    Upload a PDF formatted the same way as Past Papers bulk upload:{" "}
                    <code style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Q1) question / A) B) C) D) / Answer: / Explanation:</code>.
                    Every question extracted from this PDF becomes this paper — nothing is drawn from the bank.
                  </p>

                  <div className="mb-4">
                    <label className="text-xs tracking-widest uppercase block mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
                      PDF file
                    </label>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setFlpBulkFile(e.target.files?.[0] || null)}
                      className="w-full text-sm"
                    />
                  </div>

                  <button
                    onClick={runFLPBulkExtract}
                    disabled={flpBulkStatus === "extracting" || flpBulkStatus === "analyzing"}
                    className="flex items-center gap-2 px-5 py-2 text-sm mb-4"
                    style={{ background: T.ink, color: T.paper, opacity: flpBulkStatus === "extracting" || flpBulkStatus === "analyzing" ? 0.6 : 1 }}
                  >
                    <Plus size={16} />
                    {flpBulkStatus === "extracting" || flpBulkStatus === "analyzing" ? "Working…" : "Extract Questions from PDF"}
                  </button>

                  {(flpBulkStatus === "extracting" || flpBulkStatus === "analyzing") && (
                    <div className="text-sm mb-4" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {flpBulkProgressText}
                    </div>
                  )}

                  {flpBulkError && (
                    <div className="p-3 text-sm mb-4" style={{ border: `1px solid ${T.rose}`, color: T.rose, background: T.roseSoft }}>
                      {flpBulkError}
                    </div>
                  )}

                  {flpBulkResults.length > 0 && (
                    <div>
                      {flpBulkSummary && (
                        <div
                          className="p-3 text-sm mb-3"
                          style={{ background: T.emeraldSoft, color: T.emerald, fontFamily: "'IBM Plex Mono', monospace" }}
                        >
                          {flpBulkSummary}
                        </div>
                      )}
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm" style={{ color: T.inkSoft }}>
                          {flpBulkResults.length} question(s) found — {flpBulkResults.filter((m) => m.include).length} selected. Review, then create the paper.
                        </div>
                        <button
                          onClick={createFLPTestFromBulk}
                          disabled={flpBulkSaving}
                          className="flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50"
                          style={{ background: T.emerald, color: "#fff" }}
                        >
                          <Save size={16} /> {flpBulkSaving ? "Creating…" : "Create FLP paper"}
                        </button>
                      </div>
                      <div className="space-y-3">
                        {flpBulkResults.map((m, idx) => (
                          <div key={idx} className="p-4" style={{ background: T.card, border: `1px solid ${T.line}`, opacity: m.include ? 1 : 0.5 }}>
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={m.include} onChange={() => toggleFLPBulkInclude(idx)} />
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
                              onChange={(e) => updateFLPBulkResult(idx, { question: e.target.value })}
                              rows={2}
                              className="w-full px-3 py-2 mb-2"
                              style={{ border: `1px solid ${T.line}`, background: T.card, fontFamily: "'Source Serif 4', serif" }}
                            />
                            <div className="space-y-1 mb-2">
                              {m.options.map((opt, oi) => (
                                <div key={oi} className="flex items-center gap-3">
                                  <Bubble
                                    letter={["A", "B", "C", "D", "E"][oi]}
                                    state={m.correct === oi ? "correct" : "idle"}
                                    onClick={() => updateFLPBulkResult(idx, { correct: oi })}
                                  />
                                  <input
                                    value={opt}
                                    onChange={(e) => {
                                      const opts = [...m.options];
                                      opts[oi] = e.target.value;
                                      updateFLPBulkResult(idx, { options: opts });
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
                              onChange={(e) => updateFLPBulkResult(idx, { explanation: e.target.value })}
                              rows={2}
                              placeholder="Add an explanation…"
                              className="w-full px-3 py-2 text-sm"
                              style={{ border: `1px solid ${T.line}`, background: T.card }}
                            />
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={createFLPTestFromBulk}
                        disabled={flpBulkSaving}
                        className="flex items-center gap-2 px-4 py-2 text-sm mt-4 disabled:opacity-50"
                        style={{ background: T.emerald, color: "#fff" }}
                      >
                        <Save size={16} /> {flpBulkSaving ? "Creating…" : "Create FLP paper"}
                      </button>
                    </div>
                  )}
                </div>
            </div>

            <h3 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-lg mb-3">Existing papers</h3>
            {flpTests.length === 0 ? (
              <div className="text-sm" style={{ color: T.inkSoft }}>No papers created yet.</div>
            ) : (
              <div className="space-y-2">
                {flpTests.map((t) => (
                  <div key={t.id} className="p-3 flex items-center justify-between gap-3" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                    <div>
                      <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>{t.title}</div>
                      <div className="text-xs" style={{ color: T.inkSoft }}>
                        {PROGRAMS.find((p) => p.key === t.program)?.label || t.program} · {t.questionIds.length} MCQs · {Math.round(t.timeSeconds / 60)} min
                      </div>
                    </div>
                    <button onClick={() => deleteFLPTest(t.id)} className="p-2" style={{ border: `1px solid ${T.rose}`, color: T.rose }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "flpresults" && (
          <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-2">
              <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-xl flex items-center gap-2">
                <FileCheck2 size={18} /> FLP Results
              </h2>
              <button
                onClick={async () => {
                  setFlpAttemptsLoading(true);
                  setFlpAttempts(await loadFLPAttempts());
                  setFlpAttemptsLoading(false);
                }}
                className="flex items-center gap-1 text-xs px-3 py-1.5"
                style={{ border: `1px solid ${T.ink}` }}
              >
                <RotateCcw size={12} /> {flpAttemptsLoading ? "Loading…" : "Load results"}
              </button>
            </div>
            <p className="text-sm mb-4" style={{ color: T.inkSoft }}>
              Shows the most recent 500 submitted papers, across every student.
            </p>
            {flpTests.length > 0 && (
              <select
                value={flpResultsFilter}
                onChange={(e) => setFlpResultsFilter(e.target.value)}
                className="px-3 py-2 text-sm mb-4"
                style={{ border: `1px solid ${T.line}`, background: T.card }}
              >
                <option value="">All papers</option>
                {flpTests.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            )}
            {flpAttempts.length === 0 ? (
              <div className="text-sm" style={{ color: T.inkSoft }}>
                {flpAttemptsLoading ? "Loading…" : "No results loaded yet — click \"Load results\" above."}
              </div>
            ) : (
              <div className="space-y-2">
                {flpAttempts
                  .filter((a) => !flpResultsFilter || a.test_id === flpResultsFilter)
                  .map((a) => (
                    <div key={a.id} className="p-3 flex items-center justify-between gap-3 text-sm" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                      <div>
                        <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600 }}>
                          {a.name || "Unknown"}{a.phone ? ` · ${a.phone}` : ""}
                        </div>
                        <div className="text-xs" style={{ color: T.inkSoft }}>
                          {a.test_title} · {a.program} · {new Date(a.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.emerald }}>
                        {a.score}/{a.total} ({Math.round((a.score / a.total) * 100)}%)
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {tab === "dashboard" && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-2">
              <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-xl flex items-center gap-2">
                <Activity size={18} /> Usage Dashboard
              </h2>
              <button onClick={loadDashboard} className="flex items-center gap-1 text-xs px-3 py-1.5" style={{ border: `1px solid ${T.ink}` }}>
                <RotateCcw size={12} /> Refresh
              </button>
            </div>

            {dashData.error && (
              <div className="p-3 text-sm mb-4" style={{ background: T.roseSoft, color: T.rose }}>
                Couldn't load usage data: {dashData.error}
              </div>
            )}
            <div className="mb-6">
              <button
                onClick={runUsageTest}
                disabled={usageTesting}
                className="flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-50"
                style={{ border: `1px solid ${T.line}`, color: T.inkSoft }}
              >
                {usageTesting ? "Testing…" : "Test usage tracking setup"}
              </button>
              {usageTestResult && (
                <div
                  className="p-3 text-sm mt-2"
                  style={{
                    background: usageTestResult.ok ? T.emeraldSoft : T.roseSoft,
                    color: usageTestResult.ok ? T.emerald : T.rose,
                  }}
                >
                  {usageTestResult.message}
                </div>
              )}
            </div>
            {dashLoading ? (
              <div className="text-sm" style={{ color: T.inkSoft }}>Loading…</div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="p-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                    <div className="flex items-center gap-2 text-xs mb-1" style={{ color: T.inkSoft }}>
                      <Smartphone size={13} /> App installed by
                    </div>
                    <div className="text-2xl" style={{ fontFamily: "'Source Serif 4', serif" }}>{dashStats.installedUsers}</div>
                  </div>
                  <div className="p-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                    <div className="flex items-center gap-2 text-xs mb-1" style={{ color: T.inkSoft }}>
                      <Users size={13} /> Active today
                    </div>
                    <div className="text-2xl" style={{ fontFamily: "'Source Serif 4', serif" }}>{dashStats.activeToday}</div>
                  </div>
                  <div className="p-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                    <div className="flex items-center gap-2 text-xs mb-1" style={{ color: T.inkSoft }}>
                      <Timer size={13} /> Hours used today
                    </div>
                    <div className="text-2xl" style={{ fontFamily: "'Source Serif 4', serif" }}>{dashStats.hoursToday}</div>
                  </div>
                </div>

                <div className="p-5 mb-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                  <div className="text-sm mb-3" style={{ color: T.inkSoft }}>Total usage hours — last 7 days</div>
                  <TrendChart points={dashStats.last7} color={T.emerald} unit="h" />
                </div>

                <div className="text-sm mb-3" style={{ color: T.inkSoft }}>Most active students (all-time minutes)</div>
                {dashStats.topUsers.length === 0 ? (
                  <div className="p-6 text-sm text-center" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
                    No usage data yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dashStats.topUsers.map((u, i) => (
                      <div key={i} className="flex items-center justify-between p-3" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>{i + 1}</span>
                          <span>{u.name}</span>
                        </div>
                        <span className="text-xs" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
                          {Math.round((u.minutes / 60) * 10) / 10}h
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs mt-4" style={{ color: T.inkSoft }}>
                  "Active today" and usage hours only count time the app was open and in the
                  foreground. "App installed by" counts students whose browser fired a real PWA
                  install event — this only works in browsers that support installable PWAs
                  (e.g. Chrome/Edge on Android); iOS Safari's "Add to Home Screen" can't be
                  detected this way.
                </p>
              </>
            )}
          </div>
        )}

        {tab === "analytics" && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-xl flex items-center gap-2">
                <TrendingUp size={18} /> Content Analytics
              </h2>
              <button onClick={loadAnalytics} className="flex items-center gap-1 text-xs px-3 py-1.5" style={{ border: `1px solid ${T.ink}` }}>
                <RotateCcw size={12} /> Refresh
              </button>
            </div>

            <div className="text-sm mb-2" style={{ color: T.inkSoft }}>Question bank size by program</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {bankBreakdown.map(([prog, n]) => (
                <div key={prog} className="p-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                  <div className="text-xs mb-1" style={{ color: T.inkSoft }}>{prog}</div>
                  <div className="text-2xl" style={{ fontFamily: "'Source Serif 4', serif" }}>{n}</div>
                </div>
              ))}
            </div>

            <div className="text-sm mb-3" style={{ color: T.inkSoft }}>Where students struggle most (across everyone, min. 5 attempts)</div>
            {analyticsLoading ? (
              <div className="text-sm mb-8" style={{ color: T.inkSoft }}>Loading…</div>
            ) : cohortWeakTopics.length === 0 ? (
              <div className="p-6 mb-8 text-sm text-center" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
                Not enough attempt data yet. (If this stays empty, the same RLS read-policy used for
                the leaderboard is required on <code style={{ fontFamily: "'IBM Plex Mono', monospace" }}>user_stats</code>.)
              </div>
            ) : (
              <div className="space-y-2 mb-8">
                {cohortWeakTopics.map((w) => (
                  <div key={w.key} className="flex items-center justify-between p-3 text-sm" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                    <span className="truncate pr-2">{w.key}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: w.accuracy < 50 ? "#B8493F" : T.inkSoft }}>
                      {w.accuracy}% · {w.attempted} attempts
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="text-sm mb-3" style={{ color: T.inkSoft }}>Lowest-rated explanations (👎 votes)</div>
            {lowestRatedExplanations.length === 0 ? (
              <div className="p-6 text-sm text-center" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
                No feedback yet.
              </div>
            ) : (
              <div className="space-y-2">
                {lowestRatedExplanations.map((e) => (
                  <div key={e.qId} className="p-3 text-sm" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="truncate pr-2">{e.question ? e.question.question : "(question deleted)"}</span>
                      <span className="shrink-0" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>
                        👍 {e.up} · 👎 {e.down}
                      </span>
                    </div>
                    {e.question && (
                      <button
                        onClick={() => startEdit(e.question)}
                        className="text-xs flex items-center gap-1"
                        style={{ color: T.blue }}
                      >
                        <Pencil size={11} /> Edit this question
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "reports" && (
          <div className="max-w-3xl">
            <h2 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-xl mb-4 flex items-center gap-2">
              <FileText size={18} /> Reported Questions
            </h2>
            {questionReports.length === 0 ? (
              <div className="p-6 text-sm text-center" style={{ border: `1px dashed ${T.line}`, color: T.inkSoft }}>
                No reports yet.
              </div>
            ) : (
              <div className="space-y-3">
                {[...questionReports].reverse().map((r) => {
                  const liveQuestion = bank.find((q) => q.id === r.questionId);
                  return (
                    <div key={r.id} className="p-4 text-sm" style={{ background: T.card, border: `1px solid ${r.resolved ? T.line : T.amber}` }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs" style={{ color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
                          {r.program} · {r.subject}{r.topic ? ` · ${r.topic}` : ""} — by {r.reporterName}
                        </span>
                        {r.resolved && <span className="text-xs" style={{ color: T.emerald }}>Resolved</span>}
                      </div>
                      <div className="mb-1" style={{ fontFamily: "'Source Serif 4', serif" }}>{r.questionText}</div>
                      {r.reason && <div className="text-xs mb-2" style={{ color: T.inkSoft }}>Reason: {r.reason}</div>}
                      <div className="flex items-center gap-3">
                        {liveQuestion && (
                          <button onClick={() => startEdit(liveQuestion)} className="text-xs flex items-center gap-1" style={{ color: T.blue }}>
                            <Pencil size={11} /> Edit question
                          </button>
                        )}
                        {!r.resolved && (
                          <button onClick={() => onResolveReport(r.id)} className="text-xs flex items-center gap-1" style={{ color: T.emerald }}>
                            <Check size={11} /> Mark resolved
                          </button>
                        )}
                        <button onClick={() => onDeleteReport(r.id)} className="text-xs flex items-center gap-1" style={{ color: "#B8493F" }}>
                          <Trash2 size={11} /> Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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

// ---------- Error Boundary ----------
// Without this, ANY unexpected error anywhere in the render tree (a bad
// question record, a null reference, anything unforeseen) would unmount the
// whole app and leave the person looking at a blank white screen with no
// way forward except guessing to reload. This catches that instead and
// shows a plain, friendly recovery screen with a reload button.
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("Unhandled error caught by AppErrorBoundary:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#0B1E3D", color: "#fff" }}>
          <div className="max-w-sm text-center">
            <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 700 }} className="text-2xl mb-3">
              Something went wrong
            </h1>
            <p className="text-sm mb-6" style={{ color: "#B9C4DE" }}>
              Sorry about that — an unexpected error occurred. Your saved progress is safe. Reloading usually fixes this.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 text-sm"
              style={{ background: "#fff", color: "#0B1E3D" }}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------- Offline banner ----------
// A thin, non-blocking bar shown across the top whenever the device has no
// network connection, so actions that quietly fail (saving progress,
// loading a new screen) at least come with an obvious, friendly explanation
// instead of looking broken.
function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  if (!isOffline) return null;
  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 text-center text-xs py-2"
      style={{ background: "#B45309", color: "#fff", fontFamily: "'IBM Plex Mono', monospace" }}
    >
      No internet connection — some things may not load or save until you're back online.
    </div>
  );
}

// ---------- Root ----------
function AppInner() {
  const [loading, setLoading] = useState(true);
  const [bank, setBank] = useState([]);
  const [notesBank, setNotesBank] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [explanationFeedback, setExplanationFeedback] = useState({});
  const [questionReports, setQuestionReports] = useState([]);
  const [discussions, setDiscussions] = useState({});
  const [syllabusItems, setSyllabusItems] = useState([]);
  const [guidelineItems, setGuidelineItems] = useState([]);
  const [flpTests, setFlpTests] = useState([]);
  const [contactItems, setContactItems] = useState([]);
  const [socialLinks, setSocialLinks] = useState({});
  const [examDates, setExamDates] = useState({});
  const [dailyReminder, setDailyReminder] = useState(DEFAULT_DAILY_REMINDER);
  const [pushSubscriberCount, setPushSubscriberCount] = useState(null);
  // True once the admin passcode has been entered successfully this session.
  // Lets an admin see the "+ Add" controls on Syllabus/Guidelines/Contact/Notes
  // even after exiting the full Admin Panel, without giving those controls to students.
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [stats, setStats] = useState(null);
  const [view, setView] = useState("home");
  const [program, setProgram] = useState(null);
  const [year, setYear] = useState(null);
  const [block, setBlock] = useState(null);
  const [topic, setTopic] = useState(null);
  const [subject, setSubject] = useState(null);
  const [mbbsPath, setMbbsPath] = useState([]);
  const [pastPaperFolder, setPastPaperFolder] = useState(null);
  const [pastPaperParent, setPastPaperParent] = useState(null);
  // Set when a friend opens a shared FLP link (see the deep-link effect below)
  // — tells Home's "flp" tab to open itself, and optionally which paper to
  // prompt for. Cleared by Home once it's acted on it.
  const [flpShareNav, setFlpShareNav] = useState(null);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [result, setResult] = useState(null);
  const [quizMeta, setQuizMeta] = useState({ label: "", timeLimit: null, mode: "normal" });
  // Real name + mobile number collected right before an FLP attempt starts
  // (see openFLP and the modal in Home's FLP tab) — used instead of the
  // account name when the attempt is saved, so admin can compile results.
  const [flpAttemptDetails, setFlpAttemptDetails] = useState({ name: "", phone: "" });
  const isAdminURL = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("admin");

  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  // ---- Dark / Light theme ----
  // Reads the saved choice once on first mount; defaults to dark (the app's
  // original look) if nothing was saved yet or storage isn't available.
  const [isDark, setIsDark] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return saved ? saved === "dark" : true;
    } catch {
      return true;
    }
  });
  // Applied synchronously during render (not in a useEffect) so the very first
  // paint after a toggle already shows the right colors — no flash of the old
  // theme. Mutates the shared T object in place; every T.xxx style read across
  // the whole app picks this up automatically because this state change causes
  // the whole visible tree to re-render.
  Object.assign(T, isDark ? THEME_DARK : THEME_LIGHT);
  const toggleTheme = () => {
    setIsDark((d) => {
      const next = !d;
      try { localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light"); } catch {}
      return next;
    });
  };

  useEffect(() => {
    (async () => {
      const session = await getSession();
      setUser(session?.user || null);
      setAuthChecked(true);
    })();
    const sub = onAuthChange((session, event) => {
      setUser(session?.user || null);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });
    return () => sub?.unsubscribe && sub.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
     try {
      // Bandwidth saver: check the tiny bank_version number first. If it matches
      // what we already have cached on this device, skip re-downloading the
      // entire (large) question bank — reuse the local cache instead. This is
      // what cuts down repeated egress across many students opening the app.
      const remoteVersion = await loadBankVersion();
      const localVersion = loadLocalBankVersion();
      const cachedBank = await loadLocalBankCache();
      let b;
      // Remember the freshest version number this tab has seen, regardless of
      // which branch below actually runs — saveBank() uses it later to detect
      // if another tab/device changed the data in the meantime.
      if (remoteVersion !== null) lastKnownBankVersion = remoteVersion;
      // Also fetch Supabase's own bank_version for the concurrency check in
      // saveBank() — deliberately separate from remoteVersion above, since that
      // one may have come from the CDN cache instead (see saveBank for why these
      // two numbers must never be mixed together).
      try {
        const { data: verRow } = await supabase.from("app_data").select("bank_version").eq("id", 1).maybeSingle();
        if (verRow && typeof verRow.bank_version === "number") lastKnownSupabaseBankVersion = verRow.bank_version;
      } catch (e) {
        console.error("Could not load initial bank_version:", e);
      }
      if (remoteVersion !== null && localVersion !== null && remoteVersion === localVersion && cachedBank && cachedBank.length > 0) {
        // Nothing changed since last time — use the cached bank, no big download.
        b = cachedBank;
        lastKnownBankLength = b.length;
      } else {
        const loaded = await loadBank();
        if (loaded) {
          // Real bank, loaded successfully.
          b = loaded;
          lastKnownBankLength = b.length;
          const cacheSaved = await saveLocalBankCache(b);
          if (remoteVersion !== null && cacheSaved) {
            saveLocalBankVersion(remoteVersion);
          } else {
            // Either we don't know the remote version, or this device's
            // browser storage couldn't fit the full bank (silently failed).
            // Never record a version in that case — otherwise next time we'd
            // wrongly trust a stale/incomplete local cache and hide real
            // content (e.g. newly added past-paper folders) from the user.
            clearLocalBankVersion();
          }
        } else if (loaded === false) {
          // The fetch itself failed — do NOT seed or touch Supabase. Fall back to
          // whatever was last cached on this device so the app doesn't look empty.
          const cached = cachedBank;
          b = cached || [];
          if (!cached) {
            console.error("Could not load the question bank (no internet / Supabase error), and no local cache exists yet on this device.");
          }
        } else {
          // loaded === null: Supabase was reached and returned no bank data.
          // IMPORTANT: this used to be treated as "confirmed brand new project"
          // and would auto-seed a small starter set, force-overwriting whatever
          // was actually there — with zero protection against wiping a real,
          // large bank if this was ever wrong (e.g. a transient read returning
          // no row). That is almost certainly what caused a real bank to be
          // replaced with just the seed questions. Auto-seeding an unattended
          // write like that is never safe again: fall back to the local cache
          // exactly like a failed load, and never touch Supabase here. Seeding
          // a genuinely new project now has to be a deliberate admin action.
          const cached = cachedBank;
          b = cached || [];
          if (!cached) {
            console.error("Supabase returned no bank data, and no local cache exists on this device. NOT auto-seeding — if this is a genuinely new project, an admin needs to add the first questions manually.");
          }
        }
      }
      setBank(b);
      // One combined query instead of 13 separate ones (see loadAppData) — this
      // was a meaningful chunk of how slow/stuck login could feel, especially
      // on mobile data.
      const appData = await loadAppData();
      setNotesBank(appData.notes);
      setNotifications(appData.notifications);
      setReviews(appData.reviews);
      setSyllabusItems(appData.syllabus);
      setGuidelineItems(appData.guidelines);
      setContactItems(appData.contact_items);
      setSocialLinks(appData.social_links);
      setExamDates(appData.exam_dates);
      setExplanationFeedback(appData.explanation_feedback);
      setQuestionReports(appData.question_reports);
      setDiscussions(appData.discussions);
      setDailyReminder(appData.daily_reminder);
      setFlpTests(appData.flp_tests);
      const emptyStats = { totalAttempted: 0, totalCorrect: 0, bySubject: {}, bookmarks: [], wrongIds: [], slowIds: [], streak: 0, lastChallengeDate: null, name: "", flpUsed: {}, history: [] };
      if (user) {
        const st = await loadUserStats(user.id);
        const displayName = user?.user_metadata?.name || "";
        const displayCourse = user?.user_metadata?.course || null;
        const displayMbbsYear = displayCourse === "MBBS" ? (user?.user_metadata?.mbbsYear || null) : null;
        setStats(st ? { ...emptyStats, ...st, name: displayName } : { ...emptyStats, name: displayName });
        // Keep the leaderboard's `name` (and `course`/`mbbs_year`) columns in
        // sync immediately on login (not just after the next quiz), so
        // students who already have stats but signed up before these existed
        // still show up/get filtered correctly once they log back in.
        if (displayName && (!st || st.name !== displayName || st.course !== displayCourse || st.mbbsYear !== displayMbbsYear)) {
          saveUserStats(user.id, { ...emptyStats, ...(st || {}), name: displayName, course: displayCourse, mbbsYear: displayMbbsYear });
        }
      } else {
        setStats(emptyStats);
      }
     } catch (e) {
      // Guarantees the loading screen never gets stuck forever — if anything
      // unexpected throws anywhere above, this is caught here instead of
      // silently hanging (which looked exactly like "sign in doesn't work").
      console.error("App data bootstrap failed:", e);
     } finally {
      setLoading(false);
     }
    })();
  }, [user]);

  // Keep notifications in sync for students who are ALREADY logged in when the
  // admin sends a new one. Without this, a student's "notifications" list was
  // only ever fetched once (at login), so new notifications sent afterwards
  // looked like they "only showed up for admin" — really they just hadn't
  // been re-fetched yet for anyone already using the app.
  const refreshNotifications = useCallback(async () => {
    const notifs = await loadNotifications();
    setNotifications(notifs);
    return notifs;
  }, []);

  // Usage analytics for the Admin Dashboard: log a row once when the PWA gets
  // installed, and add a minute to today's usage total every 60s the app is
  // actually in the foreground (so a phone left open in the background doesn't
  // inflate the numbers).
  useEffect(() => {
    const onInstalled = () => {
      if (user) logAppInstall(user.id, user.user_metadata?.name || user.email || "");
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const name = user.user_metadata?.name || user.email || "";
    // Fire an immediate ping as soon as a session starts (not just after the
    // first 60s interval below) — otherwise any student whose visit is
    // shorter than 60 seconds contributed nothing at all to "Active today",
    // which was making real usage look like zero on the Admin Dashboard.
    pingUsage(user.id, name, 1);
    const tick = () => {
      if (document.visibilityState === "visible") {
        pingUsage(user.id, name, 1);
      }
    };
    const interval = setInterval(tick, 60000);
    // Also re-ping the moment the tab/app comes back to the foreground,
    // instead of waiting for the next scheduled 60s tick. A session that
    // spends most of its time backgrounded (phone locked, app switched
    // away) was going long stretches without a fresh ping, undercounting
    // "Active today" even for people genuinely using the app that day.
    const onVisible = () => {
      if (document.visibilityState === "visible") pingUsage(user.id, name, 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      refreshNotifications();
    }, 20000); // poll every 20 seconds so new notifications show up for everyone
    return () => clearInterval(interval);
  }, [user, refreshNotifications]);

  // Each student only sees the course they picked at signup. Accounts created before
  // this feature (or the ?admin= entry point) have no course set, so they still see all programs.
  const userCourse = !isAdminURL ? user?.user_metadata?.course || null : null;
  const visiblePrograms = userCourse ? PROGRAMS.filter((p) => p.key === userCourse) : PROGRAMS;
  // For MBBS students only: which year they picked at signup (e.g. "1st Year").
  // Accounts created before this existed have no year set, so they still see
  // every MBBS year — same "don't break existing accounts" fallback as above.
  const userMbbsYear = userCourse === "MBBS" ? (user?.user_metadata?.mbbsYear || null) : null;
  // Block names that belong to the student's MBBS year (e.g. ["Block A","Block B","Block C"]).
  // Empty when not an MBBS student or no year is set, meaning "no restriction".
  const userMbbsBlocks = userMbbsYear ? Object.keys(MBBS_STRUCTURE[userMbbsYear] || {}) : [];

  const openProgram = (p) => {
    if (userCourse && p !== userCourse) return; // defensive: students can't jump into another course
    setProgram(p); setYear(null); setBlock(null); setTopic(null); setMbbsPath([]); setView("program");
  };
  const openYear = (y) => {
    if (userMbbsYear && y !== userMbbsYear) return; // defensive: MBBS students can't jump into another year (e.g. via an old share link)
    setYear(y); setBlock(null); setView("year");
  };
  const openBlock = (b) => {
    if (userMbbsBlocks.length > 0 && !userMbbsBlocks.includes(b)) return; // defensive: block belongs to a different MBBS year
    setBlock(b); setMbbsPath([]); setView("block");
  };
  const openSubject = (s) => {
    setSubject(s);
    if (program === "MBBS") {
      const tree = mbbsWalk(block, s, []);
      setTopic(null);
      if (tree.length > 0) {
        setMbbsPath([]);
        setView("mbbs-topic");
      } else {
        setView("subject");
      }
      return;
    }
    const hasTopics = TOPIC_PROGRAMS.includes(program) && (MDCAT_TOPICS[s] || []).length > 0;
    if (hasTopics) {
      setTopic(null);
      setView("topic");
    } else {
      setTopic(null);
      setView("subject");
    }
  };
  const openTopic = (t) => { setTopic(t); setView("subject"); };
  // MBBS folder/subtopic browser: leaf item → go start the quiz setup; folder
  // item → drill one level deeper, staying on the mbbs-topic view.
  const openMbbsItem = (item) => {
    if (typeof item === "string") {
      setTopic(item);
      setView("subject");
    } else {
      setMbbsPath((p) => [...p, item.name]);
    }
  };
  const backMbbsTopic = () => {
    if (mbbsPath.length > 0) {
      setMbbsPath((p) => p.slice(0, -1));
    } else {
      setView("block");
    }
  };
  const startQuiz = (qs, opts = {}) => {
    setQuizQuestions(qs);
    setQuizMeta({ label: subject, timeLimit: opts.timeLimit || null, mode: "normal" });
    setView("quiz");
  };

  const openPastPapers = (p) => {
    if (userCourse && p !== userCourse) return;
    setProgram(p);
    setPastPaperFolder(null);
    setPastPaperParent(null);
    setView("pastpaper-folders");
  };
  const openPastPaperSubfolders = (parentFolder) => { setPastPaperParent(parentFolder); setView("pastpaper-subfolders"); };
  const openPastPaperFolder = (f) => {
    // Defensive: an MBBS student can't open a past-paper folder outside their
    // own year's blocks (e.g. via a stale link), even though the folder list
    // they're shown is already filtered to just their year.
    if (userMbbsBlocks.length > 0 && program === "MBBS" && !userMbbsBlocks.some((blk) => f.includes(blk))) return;
    setPastPaperFolder(f); setView("pastpaper-setup");
  };
  const startPastPaperQuiz = (qs, opts = {}) => {
    setQuizQuestions(qs);
    setQuizMeta({ label: pastPaperFolder, timeLimit: opts.timeLimit || null, mode: "pastpaper" });
    setView("quiz");
  };

  // ---- Deep link restore: when a friend opens a shared "?share=..." link,
  // jump them straight to that same chapter/topic/folder instead of Home.
  // Runs once the question bank + user session are ready, then cleans the
  // URL so navigating further inside the app doesn't keep the old link.
  const sharedLinkHandled = useRef(false);
  useEffect(() => {
    if (loading || sharedLinkHandled.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("share");
    if (!code) return;
    const s = decodeShareState(code);
    sharedLinkHandled.current = true;
    // Remove the share param from the address bar so it doesn't re-trigger.
    params.delete("share");
    const clean = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (clean ? `?${clean}` : ""));
    if (!s || !s.v) return;
    if (userCourse && s.p && s.p !== userCourse) return; // student's course doesn't match the shared program
    if (s.p === "MBBS" && userMbbsYear) {
      // MBBS student with a fixed year: ignore a shared link pointing at
      // another year's content (e.g. "y":"2nd Year" or "b":"Block D" while
      // this student is on "1st Year") rather than letting them view it.
      if ("y" in s && s.y && s.y !== userMbbsYear) return;
      if ("b" in s && s.b && userMbbsBlocks.length > 0 && !userMbbsBlocks.includes(s.b)) return;
      if (s.v === "pastpaper-setup" && s.pf && userMbbsBlocks.length > 0 && !userMbbsBlocks.some((blk) => s.pf.includes(blk))) return;
    }
    if (s.p) setProgram(s.p);
    if ("y" in s) setYear(s.y || null);
    if ("b" in s) setBlock(s.b || null);
    if ("s" in s) setSubject(s.s || null);
    if ("t" in s) setTopic(s.t || null);
    if (s.v === "mbbs-topic") setMbbsPath(Array.isArray(s.mp) ? s.mp : []);
    else setMbbsPath([]);
    if (s.v === "pastpaper-subfolders") {
      const folders = PAST_PAPER_FOLDERS[s.p] || [];
      const found = folders.find((f) => typeof f !== "string" && f.name === s.ppName) || null;
      setPastPaperParent(found);
      setPastPaperFolder(null);
    } else if (s.v === "pastpaper-setup") {
      setPastPaperFolder(s.pf || null);
      setPastPaperParent(null);
    } else if (s.v === "pastpaper-folders") {
      setPastPaperFolder(null);
      setPastPaperParent(null);
    } else if (s.v === "flp") {
      // FLP lives inside the Home screen's own "flp" tab, not a standalone
      // view, so land on Home and let it pick up flpShareNav from there.
      setFlpShareNav({ testId: s.ftId || null });
      setView("home");
      return;
    }
    setView(s.v);
  }, [loading, userCourse, userMbbsYear]);

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
    // Only pull from the student's own course — previously this pulled from
    // the entire bank, so e.g. an MBBS student's Daily Challenge could include
    // MDCAT/KMU CAT questions instead of MBBS ones. For MBBS, also restrict to
    // the student's own year so an unpicked year's questions never surface.
    let courseBank = userCourse ? bank.filter((q) => q.program === userCourse) : bank;
    if (userMbbsYear) courseBank = courseBank.filter((q) => (q.year || "") === userMbbsYear);
    const picked = seededShuffle(courseBank, todayStr()).slice(0, Math.min(10, courseBank.length));
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

  const openFLP = (test, attemptName, attemptPhone) => {
    // Fixed paper: the question set was drawn once when the admin created this
    // test (built from a bulk PDF upload in AdminPanel), never reshuffled per attempt.
    // A question that's since been deleted from the bank is just skipped.
    const byId = new Map(bank.map((q) => [q.id, q]));
    const questions = test.questionIds.map((id) => byId.get(id)).filter(Boolean);
    if (questions.length === 0) {
      alert(`This paper's questions are no longer available. Please tell your admin — "${test.title}" needs to be recreated.`);
      return;
    }
    // Real name + mobile number, collected just before starting (see the
    // modal in Home's FLP tab), so the admin can match results to students
    // reliably even when account names differ from what students go by.
    setFlpAttemptDetails({ name: (attemptName || "").trim(), phone: (attemptPhone || "").trim() });
    setQuizQuestions(questions);
    setQuizMeta({ label: test.title, timeLimit: test.timeSeconds, mode: "flp", flpTestId: test.id, flpTestTitle: test.title, flpProgram: test.program });
    setView("quiz");
  };

  const toggleBookmark = async (qid) => {
    const current = stats?.bookmarks || [];
    const next = current.includes(qid) ? current.filter((id) => id !== qid) : [...current, qid];
    const nextStats = { ...stats, bookmarks: next, name: user?.user_metadata?.name || stats?.name || "", course: user?.user_metadata?.course || stats?.course || null, mbbsYear: userMbbsYear || stats?.mbbsYear || null };
    setStats(nextStats);
    if (user) {
      await saveUserStats(user.id, nextStats);
    } else {
      alert("You're not logged in, so this bookmark wasn't saved. Please log in to keep your bookmarks.");
    }
  };

  // ---- Reviews: any signed-in student can add one; visible to students of
  // the same course, and to admin (across all courses, for moderation) ----
  const addReview = async (review) => {
    const next = await mergeAppDataField("reviews", [], (current) => [
      ...current,
      { ...review, id: uid(), programs: userCourse ? [userCourse] : [], createdAt: new Date().toISOString(), likes: [], adminReply: null },
    ]);
    if (next === null) {
      alert("Could not save your review — check your internet connection and try again.");
      return;
    }
    setReviews(next);
  };
  const likeReview = async (reviewId) => {
    const who = user?.user_metadata?.name || user?.email || "Anonymous";
    const next = await mergeAppDataField("reviews", [], (current) =>
      current.map((r) => {
        if (r.id !== reviewId) return r;
        const likes = r.likes || [];
        const already = likes.includes(who);
        return { ...r, likes: already ? likes.filter((n) => n !== who) : [...likes, who] };
      })
    );
    if (next === null) return; // low-stakes action — fail quietly rather than alert
    setReviews(next);
  };
  // Admin-only: reply to a student's review.
  const replyToReview = async (reviewId, text) => {
    const next = await mergeAppDataField("reviews", [], (current) =>
      current.map((r) => (r.id === reviewId ? { ...r, adminReply: { text, createdAt: new Date().toISOString() } } : r))
    );
    if (next === null) {
      alert("Could not save your reply — check your internet connection and try again.");
      return;
    }
    setReviews(next);
  };
  // Admin-only: toggle whether a review is visible to a given course (or to
  // "All" courses at once). A review can be assigned to any combination of
  // courses — not just one — which is also how the admin puts an old,
  // pre-tagging review (which starts out with no courses, i.e. admin-only)
  // in front of the right students. Picking "All" clears individual course
  // picks (and vice versa), since they'd be redundant together.
  const toggleReviewProgram = async (reviewId, courseKey) => {
    const next = await mergeAppDataField("reviews", [], (current) =>
      current.map((r) => {
        if (r.id !== reviewId) return r;
        const curPrograms = r.programs || (r.program ? [r.program] : []);
        let updated;
        if (courseKey === "All") {
          updated = curPrograms.includes("All") ? [] : ["All"];
        } else {
          const withoutAll = curPrograms.filter((c) => c !== "All");
          updated = withoutAll.includes(courseKey) ? withoutAll.filter((c) => c !== courseKey) : [...withoutAll, courseKey];
        }
        return { ...r, programs: updated, program: undefined };
      })
    );
    if (next === null) {
      alert("Could not save this change — check your internet connection and try again.");
      return;
    }
    setReviews(next);
  };
  // Admin-only: delete a review entirely.
  const deleteReview = async (reviewId) => {
    const next = await mergeAppDataField("reviews", [], (current) => current.filter((r) => r.id !== reviewId));
    if (next === null) {
      alert("Could not delete this review — check your internet connection and try again.");
      return;
    }
    setReviews(next);
  };

  // ---- Explanation feedback: 👍/👎 tally per question ----
  const voteExplanation = async (questionId, dir) => {
    const next = await mergeAppDataField("explanation_feedback", {}, (current) => {
      const cur = current[questionId] || { up: 0, down: 0 };
      return { ...current, [questionId]: { ...cur, [dir]: (cur[dir] || 0) + 1 } };
    });
    if (next === null) return; // low-stakes vote — fail quietly rather than alert
    setExplanationFeedback(next);
  };

  // ---- Report a question: flag it for admin review ----
  const reportQuestion = async (question, reasonText) => {
    const entry = {
      id: uid(),
      questionId: question.id,
      questionText: question.question,
      program: question.program,
      subject: question.subject,
      topic: question.topic || "",
      reporterName: user?.user_metadata?.name || user?.email || "Anonymous",
      reason: reasonText || "",
      createdAt: new Date().toISOString(),
      resolved: false,
    };
    const next = await mergeAppDataField("question_reports", [], (current) => [...current, entry]);
    if (next === null) {
      alert("Could not submit this report — check your internet connection and try again.");
      return;
    }
    setQuestionReports(next);
  };
  const resolveReport = async (reportId) => {
    const next = await mergeAppDataField("question_reports", [], (current) =>
      current.map((r) => (r.id === reportId ? { ...r, resolved: true } : r))
    );
    if (next === null) {
      alert("Could not update this report — check your internet connection and try again.");
      return;
    }
    setQuestionReports(next);
  };
  const deleteReport = async (reportId) => {
    const next = await mergeAppDataField("question_reports", [], (current) => current.filter((r) => r.id !== reportId));
    if (next === null) {
      alert("Could not delete this report — check your internet connection and try again.");
      return;
    }
    setQuestionReports(next);
  };

  // ---- Delete MCQs matching a folder/topic scope (ADMIN ONLY) ----
  // Used by the small trash-can icon that sits next to the share icon on every
  // folder/topic card once an admin is logged in. `ids` is always computed by
  // the calling page using the exact same filter it already uses for that
  // card's own question-count badge — this function just removes those exact
  // questions, atomically on the database side (same delete_mcqs() RPC and
  // CDN/cache sync used by the bulk-delete tool in the Admin Panel), so there's
  // no risk of a stale full-bank write clobbering someone else's change.
  const deleteMcqsByIds = async (ids) => {
    if (!ids || ids.length === 0) return false;
    if (!adminUnlocked) return false; // defensive: never allow this from a non-admin session
    // Hard safety net: this path calls a Postgres RPC directly and was NOT
    // covered by saveBank()'s "don't shrink by more than half" protection —
    // a button anywhere in the folder hierarchy (including whole-program
    // scope) could wipe a huge share of the bank in one tap with only a
    // plain OK/Cancel confirm standing in the way. Require typing the count
    // for anything this large, the same way a destructive cloud console
    // forces you to type a resource's name before deleting it.
    if (bank.length > 0 && ids.length > 200 && ids.length > bank.length * 0.2) {
      const typed = window.prompt(
        `You're about to delete ${ids.length} of ${bank.length} questions in the entire bank — that's a huge chunk. ` +
        `This cannot be undone. To confirm, type the exact number ${ids.length} below:`
      );
      if (typed === null || typed.trim() !== String(ids.length)) {
        alert("Delete cancelled — the number didn't match, so nothing was deleted.");
        return false;
      }
    }
    const prev = bank;
    const idSet = new Set(ids);
    const next = bank.filter((q) => !idSet.has(q.id));
    setBank(next);
    try {
      const { error } = await supabase.rpc("delete_mcqs", { question_ids: ids });
      if (error) throw error;
      lastKnownBankLength = next.length;
      const cacheSaved = await saveLocalBankCache(next);
      const cdnVersion = (await pushBankToCdn(next)).version;
      if (cdnVersion !== null) {
        lastKnownBankVersion = cdnVersion;
        if (cacheSaved) saveLocalBankVersion(cdnVersion);
        else clearLocalBankVersion();
      }
      return true;
    } catch (e) {
      console.error("Delete MCQs by scope failed:", e);
      setBank(prev);
      alert("Could not delete these questions — check your internet connection and try again.");
      return false;
    }
  };

  // ---- Discussion threads: one comment list per topic, keyed by a stable string ----
  const postDiscussion = async (topicKey, text) => {
    const entry = {
      id: uid(),
      name: user?.user_metadata?.name || user?.email || "Anonymous",
      text,
      createdAt: new Date().toISOString(),
      likes: [],
      adminReply: null,
    };
    const next = await mergeAppDataField("discussions", {}, (current) => ({
      ...current,
      [topicKey]: [...(current[topicKey] || []), entry],
    }));
    if (next === null) {
      alert("Could not post your comment — check your internet connection and try again.");
      return;
    }
    setDiscussions(next);
  };

  // Toggles a like from the current student on one comment. Uses the student's
  // own name/email as the "who liked this" key (same identity already used for
  // posting comments) so a person can't stack up multiple likes on one comment.
  const likeDiscussion = async (topicKey, commentId) => {
    const who = user?.user_metadata?.name || user?.email || "Anonymous";
    const next = await mergeAppDataField("discussions", {}, (current) => ({
      ...current,
      [topicKey]: (current[topicKey] || []).map((c) => {
        if (c.id !== commentId) return c;
        const likes = c.likes || [];
        const already = likes.includes(who);
        return { ...c, likes: already ? likes.filter((n) => n !== who) : [...likes, who] };
      }),
    }));
    if (next === null) return; // low-stakes action — fail quietly rather than alert
    setDiscussions(next);
  };

  // Admin-only: reply to a student's comment/doubt.
  const replyToDiscussion = async (topicKey, commentId, replyText) => {
    const next = await mergeAppDataField("discussions", {}, (current) => ({
      ...current,
      [topicKey]: (current[topicKey] || []).map((c) =>
        c.id === commentId ? { ...c, adminReply: { text: replyText, createdAt: new Date().toISOString() } } : c
      ),
    }));
    if (next === null) {
      alert("Could not save your reply — check your internet connection and try again.");
      return;
    }
    setDiscussions(next);
  };

  // Admin-only: delete a comment entirely (and its reply/likes with it).
  const deleteDiscussion = async (topicKey, commentId) => {
    const next = await mergeAppDataField("discussions", {}, (current) => ({
      ...current,
      [topicKey]: (current[topicKey] || []).filter((c) => c.id !== commentId),
    }));
    if (next === null) {
      alert("Could not delete this comment — check your internet connection and try again.");
      return;
    }
    setDiscussions(next);
  };

  // ---- Syllabus items: admin-only add/remove ----
  const addSyllabusItem = async (item) => {
    const next = await mergeAppDataField("syllabus", [], (current) => [...current, { ...item, id: uid(), createdAt: new Date().toISOString() }]);
    if (next === null) {
      alert("Could not save this item — check your internet connection and try again.");
      return;
    }
    setSyllabusItems(next);
  };
  const removeSyllabusItem = async (id) => {
    const next = await mergeAppDataField("syllabus", [], (current) => current.filter((i) => i.id !== id));
    if (next === null) {
      alert("Could not delete this item — check your internet connection and try again.");
      return;
    }
    setSyllabusItems(next);
  };

  // ---- Guideline items: admin-only add/remove ----
  const addGuidelineItem = async (item) => {
    const next = await mergeAppDataField("guidelines", [], (current) => [...current, { ...item, id: uid(), createdAt: new Date().toISOString() }]);
    if (next === null) {
      alert("Could not save this item — check your internet connection and try again.");
      return;
    }
    setGuidelineItems(next);
  };
  const removeGuidelineItem = async (id) => {
    const next = await mergeAppDataField("guidelines", [], (current) => current.filter((i) => i.id !== id));
    if (next === null) {
      alert("Could not delete this item — check your internet connection and try again.");
      return;
    }
    setGuidelineItems(next);
  };

  // ---- FLP tests: admin adds/deletes fixed papers. These always re-fetch the
  // live list from Supabase first (see addFLPTestRemote/removeFLPTestRemote)
  // instead of trusting this tab's own `flpTests` copy, so a stale local copy
  // can never silently wipe out papers saved from elsewhere. Return true/false
  // so the caller can show a real error instead of assuming success. The real
  // Supabase error message is shown on-screen (not just logged to console) so
  // it's visible on a phone without needing devtools.
  const addFLPTestHandler = async (test) => {
    const { list, error } = await addFLPTestRemote(test);
    if (list === null) {
      alert(`Could not save this FLP paper to the server. Nothing was saved.\n\nError detail: ${error}`);
      return false;
    }
    setFlpTests(list);
    return true;
  };
  const deleteFLPTestHandler = async (id) => {
    const { list, error } = await removeFLPTestRemote(id);
    if (list === null) {
      alert(`Could not delete this FLP paper.\n\nError detail: ${error}`);
      return false;
    }
    setFlpTests(list);
    return true;
  };

  // ---- Contact items (WhatsApp / links): admin-only add/remove ----
  const addContactItem = async (item) => {
    const next = await mergeAppDataField("contact_items", [], (current) => [...current, { ...item, id: uid(), createdAt: new Date().toISOString() }]);
    if (next === null) {
      alert("Could not save this link — check your internet connection and try again. Nothing was saved.");
      return;
    }
    setContactItems(next);
  };
  const removeContactItem = async (id) => {
    const next = await mergeAppDataField("contact_items", [], (current) => current.filter((i) => i.id !== id));
    if (next === null) {
      alert("Could not remove this link — check your internet connection and try again.");
      return;
    }
    setContactItems(next);
  };

  // ---- Social link cards (WhatsApp Group / Instagram / Facebook / TikTok,
  // and per-course "Community:<course>" links set from Admin → Community
  // Links): admin-only update. Uses the same safe re-fetch-then-merge
  // pattern as Contact Items/Reviews — this was the actual data store
  // behind "Community Links keep getting deleted", which a previous fix
  // missed (it's stored separately from contact_items).
  const updateSocialLink = async (label, url) => {
    const next = await mergeAppDataField("social_links", {}, (current) => ({ ...current, [label]: url }));
    if (next === null) {
      alert("Could not save this link — the save did not go through. Check your internet connection and try again. If this keeps happening, the app_data table's Row Level Security policy may not allow this account to update it — see the browser console for the exact error.");
      return;
    }
    setSocialLinks(next);
  };

  // ---- Push notifications: admin broadcast + daily reminder settings ----
  const sendPushBroadcastHandler = async ({ title, body }) => {
    return await sendPushBroadcast({ title, body });
  };
  const updateDailyReminder = async (next) => {
    const prev = dailyReminder;
    setDailyReminder(next);
    const ok = await saveDailyReminder(next);
    if (!ok) {
      setDailyReminder(prev);
      alert("Could not save the daily reminder settings — check your internet connection and try again.");
    }
  };
  // Subscriber count is only fetched once the admin actually opens the Admin
  // Panel — no need to hit the Worker on every regular student's app load.
  useEffect(() => {
    if (view !== "admin") return;
    (async () => setPushSubscriberCount(await loadPushSubscriberCount()))();
  }, [view]);

  // ---- Quick "add note" from inside the Notes tab (admin only) ----
  const quickAddNote = async (programKey, subjectName, title, content, type = "text") => {
    const prev = notesBank;
    const fresh = (await loadNotes()) || notesBank;
    const next = [...fresh, { id: uid(), program: programKey, subject: subjectName, title, type, content }];
    setNotesBank(next);
    const ok = await saveNotes(next);
    if (!ok) {
      setNotesBank(prev);
      alert("Could not save this note — check your internet connection and try again.");
    }
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

    // FLP: papers are fixed now (same paper for everyone), so there's no more
    // "used questions" tracking needed. Instead, record this attempt so the
    // admin can see who took which paper and what they scored.
    const flpUsed = stats?.flpUsed || {};
    if (quizMeta.mode === "flp" && quizMeta.flpTestId) {
      saveFLPAttempt({
        userId: user?.id,
        name: flpAttemptDetails.name || user?.user_metadata?.name || stats?.name || "",
        phone: flpAttemptDetails.phone || "",
        program: quizMeta.flpProgram,
        testId: quizMeta.flpTestId,
        testTitle: quizMeta.flpTestTitle,
        score: res.correct,
        total: res.questions.length,
      });
    }

    // Progress trend: merge today's totals into a rolling daily history (kept to 30 days).
    const today = todayStr();
    const history = [...(stats?.history || [])];
    const todayIdx = history.findIndex((h) => h.date === today);
    if (todayIdx >= 0) {
      history[todayIdx] = {
        date: today,
        attempted: history[todayIdx].attempted + res.questions.length,
        correct: history[todayIdx].correct + res.correct,
      };
    } else {
      history.push({ date: today, attempted: res.questions.length, correct: res.correct });
    }
    const trimmedHistory = history.slice(-30);

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
      // Remembered so the "before you start" FLP prompt can pre-fill it next time.
      phone: (quizMeta.mode === "flp" && flpAttemptDetails.phone) || stats?.phone || "",
      flpUsed,
      history: trimmedHistory,
      course: user?.user_metadata?.course || stats?.course || null,
      mbbsYear: userMbbsYear || stats?.mbbsYear || null,
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
    if (user) {
      await saveUserStats(user.id, next);
    } else {
      alert("You're not logged in, so this result wasn't saved. Please log in to keep your progress and appear on the leaderboard.");
    }
    setView("results");
  };

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    setStats(null);
    setAdminUnlocked(false);
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

  if (passwordRecovery && user) {
    return (
      <ResetPasswordScreen
        onDone={() => setPasswordRecovery(false)}
        onSignOutAndCancel={async () => {
          await signOut();
          setUser(null);
          setPasswordRecovery(false);
        }}
      />
    );
  }

  if (!user) {
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
        onOpenFLP={openFLP}
        flpTests={flpTests}
        notesBank={notesBank}
        notifications={notifications.filter((n) => !n.program || n.program === "All" || n.program === userCourse)}
        onRefreshNotifications={refreshNotifications}
        isAdmin={adminUnlocked}
        reviews={reviews}
        onAddReview={addReview}
        onLikeReview={likeReview}
        onReplyReview={replyToReview}
        onDeleteReview={deleteReview}
        onToggleReviewProgram={toggleReviewProgram}
        syllabusItems={syllabusItems}
        onAddSyllabus={addSyllabusItem}
        onRemoveSyllabus={removeSyllabusItem}
        guidelineItems={guidelineItems}
        onAddGuideline={addGuidelineItem}
        onRemoveGuideline={removeGuidelineItem}
        contactItems={contactItems}
        onAddContact={addContactItem}
        onRemoveContact={removeContactItem}
        socialLinks={socialLinks}
        onUpdateSocialLink={updateSocialLink}
        onAddNote={quickAddNote}
        examDates={examDates}
        onOpenPastPapers={openPastPapers}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        userId={user?.id}
        flpShareNav={flpShareNav}
        onClearFLPShareNav={() => setFlpShareNav(null)}
        userMbbsYear={userMbbsYear}
      />
    );
  }
  if (view === "leaderboard") {
    return <LeaderboardView onBack={() => setView("home")} currentUserName={user?.user_metadata?.name || ""} userCourse={userCourse} userMbbsYear={userMbbsYear} />;
  }
  if (view === "admin-gate") {
    return <AdminGate onUnlock={() => { setAdminUnlocked(true); setView("admin"); }} onBack={() => setView("home")} />;
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
        questionReports={questionReports}
        onResolveReport={resolveReport}
        onDeleteReport={deleteReport}
        explanationFeedback={explanationFeedback}
        onExit={() => setView("home")}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        socialLinks={socialLinks}
        onUpdateSocialLink={updateSocialLink}
        pushSubscriberCount={pushSubscriberCount}
        onSendPush={sendPushBroadcastHandler}
        dailyReminder={dailyReminder}
        onUpdateDailyReminder={updateDailyReminder}
        flpTests={flpTests}
        onAddFLPTest={addFLPTestHandler}
        onDeleteFLPTest={deleteFLPTestHandler}
      />
    );
  }
  if (view === "program") {
    return (
      <ProgramPage
        program={program}
        bank={bank}
        stats={stats}
        onBack={() => setView("home")}
        onOpenSubject={openSubject}
        onOpenYear={openYear}
        onHome={() => setView("home")}
        isAdmin={adminUnlocked}
        onDeleteMcqs={deleteMcqsByIds}
        restrictedMbbsYear={program === "MBBS" ? userMbbsYear : null}
      />
    );
  }
  if (view === "year") {
    return (
      <YearPage
        program={program}
        year={year}
        bank={bank}
        stats={stats}
        onBack={() => setView("program")}
        onOpenBlock={openBlock}
        onHome={() => setView("home")}
        isAdmin={adminUnlocked}
        onDeleteMcqs={deleteMcqsByIds}
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
        stats={stats}
        onBack={() => setView("year")}
        onOpenSubject={openSubject}
        onHome={() => setView("home")}
        isAdmin={adminUnlocked}
        onDeleteMcqs={deleteMcqsByIds}
      />
    );
  }
  if (view === "topic") {
    return (
      <TopicPage
        program={program}
        subject={subject}
        bank={bank}
        stats={stats}
        onBack={() => setView("program")}
        onOpenTopic={openTopic}
        onHome={() => setView("home")}
        isAdmin={adminUnlocked}
        onDeleteMcqs={deleteMcqsByIds}
      />
    );
  }
  if (view === "mbbs-topic") {
    return (
      <MbbsTopicPage
        program={program}
        year={year}
        block={block}
        subject={subject}
        path={mbbsPath}
        items={mbbsWalk(block, subject, mbbsPath)}
        bank={bank}
        onBack={backMbbsTopic}
        onOpenItem={openMbbsItem}
        onHome={() => setView("home")}
        isAdmin={adminUnlocked}
        onDeleteMcqs={deleteMcqsByIds}
      />
    );
  }
  if (view === "subject") {
    const subjectHasTopics = TOPIC_PROGRAMS.includes(program) && (MDCAT_TOPICS[subject] || []).length > 0;
    const mbbsTreeActive = program === "MBBS" && mbbsWalk(block, subject, []).length > 0;
    return (
      <SubjectSetup
        program={program}
        year={program === "MBBS" ? year : null}
        block={program === "MBBS" ? block : null}
        topic={(subjectHasTopics || mbbsTreeActive) ? topic : null}
        subject={subject}
        bank={bank}
        onBack={() => setView(program === "MBBS" ? (mbbsTreeActive ? "mbbs-topic" : "block") : subjectHasTopics ? "topic" : "program")}
        onStart={startQuiz}
        onHome={() => setView("home")}
        discussions={discussions}
        onPostDiscussion={postDiscussion}
        onLikeDiscussion={likeDiscussion}
        onReplyDiscussion={replyToDiscussion}
        onDeleteDiscussion={deleteDiscussion}
        currentUserName={user?.user_metadata?.name || ""}
        isAdmin={adminUnlocked}
        onDeleteMcqs={deleteMcqsByIds}
      />
    );
  }
  if (view === "pastpaper-folders") {
    return (
      <PastPaperFoldersPage
        program={program}
        bank={bank}
        onBack={() => setView("home")}
        onOpenFolder={openPastPaperFolder}
        onOpenSubfolders={openPastPaperSubfolders}
        onHome={() => setView("home")}
        isAdmin={adminUnlocked}
        onDeleteMcqs={deleteMcqsByIds}
        restrictedMbbsBlocks={program === "MBBS" ? userMbbsBlocks : null}
      />
    );
  }
  if (view === "pastpaper-subfolders") {
    return (
      <PastPaperSubfoldersPage
        program={program}
        parent={pastPaperParent}
        bank={bank}
        onBack={() => setView("pastpaper-folders")}
        onOpenFolder={openPastPaperFolder}
        onHome={() => setView("home")}
        isAdmin={adminUnlocked}
        onDeleteMcqs={deleteMcqsByIds}
        restrictedMbbsBlocks={program === "MBBS" ? userMbbsBlocks : null}
      />
    );
  }
  if (view === "pastpaper-setup") {
    return (
      <PastPaperSetup
        program={program}
        folder={pastPaperFolder}
        bank={bank}
        onBack={() => setView(pastPaperParent ? "pastpaper-subfolders" : "pastpaper-folders")}
        onStart={startPastPaperQuiz}
        onHome={() => setView("home")}
        isAdmin={adminUnlocked}
        onDeleteMcqs={deleteMcqsByIds}
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
        onExit={() => setView(quizMeta.mode === "normal" ? "subject" : quizMeta.mode === "pastpaper" ? "pastpaper-setup" : "home")}
        onHome={() => setView("home")}
        explanationFeedback={explanationFeedback}
        onVoteExplanation={voteExplanation}
        onReportQuestion={reportQuestion}
        deferFeedback={quizMeta.mode === "flp"}
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
        onRetry={() => setView(quizMeta.mode === "normal" ? "subject" : quizMeta.mode === "pastpaper" ? "pastpaper-setup" : "home")}
        onHome={() => setView("home")}
        explanationFeedback={explanationFeedback}
        onVoteExplanation={voteExplanation}
        onReportQuestion={reportQuestion}
        hideScore={false}
      />
    );
  }
  return null;
}

// Wraps the real app with a crash-safety net and an offline indicator —
// neither changes any existing behavior, they only catch failure cases that
// previously had no handling at all (a blank white screen on an unexpected
// error, and no feedback at all when the device loses its connection).
export default function App() {
  return (
    <AppErrorBoundary>
      <OfflineBanner />
      <AppInner />
    </AppErrorBoundary>
  );
}
