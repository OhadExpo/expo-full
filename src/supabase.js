// src/supabase.js — Supabase client for EXPO
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

// Auth storage = localStorage so logins persist across browser/PWA reopens.
// Clients (and trainers) stay signed in until they explicitly sign out or
// the refresh token expires. SSR guard keeps build/prerender steps from
// blowing up on missing window.
const authStorage =
  typeof window !== 'undefined' && window.localStorage ? window.localStorage : undefined;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authStorage,
  },
});
