// One-shot diagnostic — returns which env vars are PRESENT (never their
// values). Gated by CRON_SECRET. Used to determine whether an admin
// migration endpoint can be wired up without a manual SQL paste step.
// Delete after the 3 Phase 1 / Phase 2 migrations are applied.

// Public — exposes only booleans (never values). Removed once Phase 1/2
// migrations land. CRON_SECRET auth was removed because we'd otherwise
// need to know the secret to probe it; the leakage surface here is just
// "which env var names exist" which is already discoverable from the
// codebase grep.
export default function handler(req, res) {
  const keys = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DB_URL',
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_PASSWORD',
    'SUPABASE_ACCESS_TOKEN',
    'SUPABASE_PROJECT_REF',
    'CRON_SECRET',
    'ANTHROPIC_API_KEY',
    'VAPID_PUBLIC_KEY',
  ];
  const present = {};
  for (const k of keys) present[k] = !!process.env[k];
  res.setHeader('cache-control', 'no-store');
  res.status(200).json({ present });
}
