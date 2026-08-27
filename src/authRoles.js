// Role allow-lists and the pure predicates over them.
//
// Split out of auth.jsx for one reason: these decide who may edit the BHBC
// medical board, and until the RLS migration is applied that UI check is the
// ONLY thing enforcing it. The database currently allows any BHBC coach to
// write `expo-bhbc-medical` through the API
// (scripts/migrations/2026-08-26-bhbc-coach-write-scope.sql, still pending).
//
// A guard carrying that much weight has to be testable, and node cannot import
// .jsx. auth.jsx re-exports everything here, so every existing
// `import { ... } from './auth'` keeps working untouched.
//
// OWNER   — Ohad.
// STAFF   — Yuval; coach tools, not owner-only surfaces.
// PARTNER — a trusted evaluator who sees everything but whose writes never
//           land (SELECT-only RLS + a persistent Partner Preview banner).
// BHBC    — basketball coaches whose entire surface is the /bhbc zone.
// PT      — the ONLY BHBC coach besides the owner allowed to report or edit
//           injuries. The others see the medical board read-only.
export const OWNER_EMAILS = ['ohadyproductions@gmail.com'];
export const STAFF_EMAILS = ['yuvalberkovitch@gmail.com'];
export const PARTNER_EMAILS = ['eladeluz24@gmail.com'];
export const BHBC_COACH_EMAILS = ['benshemer4@gmail.com', 'elishai115@gmail.com', 'yehuorland@gmail.com', 'yoel23919@gmail.com', 'tomerlich11@gmail.com'];
// A PT is also a coach — every PT_EMAIL must appear in BHBC_COACH_EMAILS above,
// or they get medical rights without the zone they live in. verify-auth-roles
// asserts that, so the two lists cannot drift apart.
export const PT_EMAILS = ['yoel23919@gmail.com', 'tomerlich11@gmail.com'];

// Everyone who gets coach-portal access at all. Existing
// `TRAINER_EMAILS.includes(...)` checks stay correct because staff ARE trainers.
export const TRAINER_EMAILS = [...OWNER_EMAILS, ...STAFF_EMAILS, ...PARTNER_EMAILS, ...BHBC_COACH_EMAILS];

// All of these lower-case the input before comparing, so a coach who types
// their address with a capital letter is not silently treated as a stranger.
export const isPtEmail = (email) => !!email && PT_EMAILS.includes(email.toLowerCase());
export const isOwnerEmail = (email) => !!email && OWNER_EMAILS.includes(email.toLowerCase());
export const isStaffEmail = (email) => !!email && STAFF_EMAILS.includes(email.toLowerCase());
export const isPartnerEmail = (email) => !!email && PARTNER_EMAILS.includes(email.toLowerCase());
export const isBhbcCoachEmail = (email) => !!email && BHBC_COACH_EMAILS.includes(email.toLowerCase());

// The medical-board rule, in one place instead of inline at the call site.
// App.jsx passes `canMedical={isOwner || isPtEmail(email)}` to BhbcView.
export const canEditMedical = (email) => isOwnerEmail(email) || isPtEmail(email);
