// src/supabase.js — Supabase client for EXPO
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

// Auth storage = sessionStorage (not localStorage). Sessions persist across
// page refreshes within the same tab/window but die when the browser/tab
// closes — a fresh Chrome session always lands on the login screen. SSR
// guard keeps build/prerender steps from blowing up on missing window.
const authStorage =
  typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : undefined;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authStorage,
  },
});
