// One-shot diagnostic — returns which env vars are PRESENT (never their
// values). Gated by CRON_SECRET. Used to determine whether an admin
// migration endpoint can be wired up without a manual SQL paste step.
// Delete after the 3 Phase 1 / Phase 2 migrations are applied.

export default function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
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
