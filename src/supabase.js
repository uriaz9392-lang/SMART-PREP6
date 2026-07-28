import { createClient } from "@supabase/supabase-js";

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
export async function signUp(email, password) {
  return supabase.auth.signUp({ email, password });
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

// ---- Per-user stats (each student's own score, tied to their account) ----
export async function loadUserStats(userId) {
  try {
    const { data, error } = await supabase
      .from("user_stats")
      .select("total_attempted, total_correct, by_subject")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      totalAttempted: data.total_attempted || 0,
      totalCorrect: data.total_correct || 0,
      bySubject: data.by_subject || {},
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
    });
    if (error) throw error;
  } catch (e) {
    console.error("Save user stats failed:", e);
  }
}
