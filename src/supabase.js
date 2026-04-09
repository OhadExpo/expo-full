// src/supabase.js — Supabase client for EXPO
import { createClient } from '@supabase/supabase-js';

// These will be replaced with real values once you create the Supabase project
const SUPABASE_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
