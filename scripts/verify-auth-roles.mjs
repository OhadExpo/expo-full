// Who is allowed to touch the BHBC medical board.
//
// WHY THIS MATTERS RIGHT NOW. The RLS migration
// (scripts/migrations/2026-08-26-bhbc-coach-write-scope.sql) has NOT been
// applied. The database still lets any BHBC coach write `expo-bhbc-medical`
// through the API — verified from the real seats, 5/8 on
// scripts/verify-bhbc-write-scope.mjs.
//
// So `canMedical={isOwner || isPtEmail(email)}` in App.jsx is, today, the ONLY
// thing keeping a regular coach off the injury board. If that predicate quietly
// changes — an address added to the wrong list, a lower-case slip — nothing
// else catches it. Hence this.
//
// Delete none of these when the migration lands. Defence in depth means the UI
// check keeps mattering even once the database enforces it too.
import {
  OWNER_EMAILS, STAFF_EMAILS, PARTNER_EMAILS, BHBC_COACH_EMAILS, PT_EMAILS,
  TRAINER_EMAILS, isPtEmail, isOwnerEmail, isStaffEmail, isPartnerEmail,
  isBhbcCoachEmail, canEditMedical, canLogLoad,
} from '../src/authRoles.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

const OWNER = 'ohadyproductions@gmail.com';
const PT = 'yoel23919@gmail.com';
const COACH = 'benshemer4@gmail.com';
const STRANGER = 'someone@example.com';

// --- the medical rule, which is the load-bearing one ----------------------
check('the owner may edit medical', canEditMedical(OWNER) === true);
check('the PT may edit medical', canEditMedical(PT) === true);
check('a regular BHBC coach may NOT edit medical', canEditMedical(COACH) === false);
check('a stranger may NOT edit medical', canEditMedical(STRANGER) === false);
check('staff may NOT edit medical', canEditMedical(STAFF_EMAILS[0]) === false);
check('the partner may NOT edit medical', canEditMedical(PARTNER_EMAILS[0]) === false);

// --- who may record practice load (RPE x minutes) -------------------------
// Added 2026-08-28 with the capability itself. Same shape as the medical
// check and for the same reason: this predicate is the only thing standing
// between a regular coach and writing load data that feeds every athlete's
// ACWR.
check('the owner may log load', canLogLoad(OWNER) === true);
check('the PT may log load', canLogLoad(PT) === true);
check('Tomer (PT) may log load', canLogLoad('tomerlich11@gmail.com') === true);
check('a regular BHBC coach may NOT log load', canLogLoad(COACH) === false);
check('a stranger may NOT log load', canLogLoad(STRANGER) === false);
check('the partner may NOT log load', canLogLoad(PARTNER_EMAILS[0]) === false);
check('canLogLoad is case-insensitive', canLogLoad('TomerLich11@Gmail.com') === true);

// --- the PTs, and they are BHBC coaches -----------------------------------
// There were two PTs from 2026-08-27 (Yoel, Tomer). The count is not the
// invariant worth asserting - these are the ones that actually matter:
check('there is at least one PT', PT_EMAILS.length >= 1);
// A PT who is not in the coach list gets medical rights without the zone they
// live in, which is a half-provisioned account.
check('EVERY PT is also a BHBC coach', PT_EMAILS.every((e) => BHBC_COACH_EMAILS.includes(e)));
// And the read-only coaches must still exist, or the medical board is editable
// by everyone and the whole distinction is gone.
check('not every BHBC coach is a PT', BHBC_COACH_EMAILS.some((e) => !isPtEmail(e)));
check('the PT count matches the coaches flagged as PT', BHBC_COACH_EMAILS.filter(isPtEmail).length === PT_EMAILS.length);

// --- case and junk must not open a door -----------------------------------
check('an upper-case PT address still matches', isPtEmail('YOEL23919@GMAIL.COM') === true);
check('an upper-case coach address still matches', isBhbcCoachEmail('BenShemer4@Gmail.com') === true);
check('empty string is nobody', isPtEmail('') === false && isOwnerEmail('') === false);
check('null is nobody', isPtEmail(null) === false && canEditMedical(null) === false);
check('undefined is nobody', isPtEmail(undefined) === false && canEditMedical(undefined) === false);
check('a lookalike address is nobody', isPtEmail('yoel23919@gmail.com.evil.com') === false);

// --- the roster of coach-portal access ------------------------------------
check('every BHBC coach is a trainer', BHBC_COACH_EMAILS.every((e) => TRAINER_EMAILS.includes(e)));
check('the owner is a trainer', TRAINER_EMAILS.includes(OWNER));
check('staff are trainers', STAFF_EMAILS.every((e) => TRAINER_EMAILS.includes(e)));
check('a stranger is not a trainer', !TRAINER_EMAILS.includes(STRANGER));
check('no duplicates in the trainer list', new Set(TRAINER_EMAILS).size === TRAINER_EMAILS.length);

// --- the roles stay distinct ----------------------------------------------
check('the owner is not a BHBC coach', !isBhbcCoachEmail(OWNER));
check('the owner is not staff', !isStaffEmail(OWNER));
check('a BHBC coach is not the owner', !isOwnerEmail(COACH));
check('a BHBC coach is not the partner', !isPartnerEmail(COACH));
check('every list is lower-case already', [...OWNER_EMAILS, ...STAFF_EMAILS, ...PARTNER_EMAILS, ...BHBC_COACH_EMAILS, ...PT_EMAILS].every((e) => e === e.toLowerCase()));

console.log(`\nAUTH ROLES: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
