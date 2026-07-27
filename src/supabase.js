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
