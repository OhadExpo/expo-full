// package.json and package-lock.json must agree, or every deploy dies.
//
// WHY THIS EXISTS. Prod sat frozen on an old bundle while push after push
// "succeeded". Vercel installs with `npm ci`, which does not repair a
// mismatch the way `npm install` does — it refuses outright:
//
//   npm error `npm ci` can only install packages when your package.json
//   and package-lock.json are in sync.
//   npm error Missing: pngjs@7.0.0 from lock file
//
// The cause was a `git add package.json` that swept up a dependency added in
// an earlier session without its lockfile half. Nothing local complains:
// `npm run build` works fine here, because node_modules is already populated.
// The failure only exists on a clean install, which is the one thing a
// developer machine never does.
//
// So this runs in the build. It compares the dependency ranges declared in
// package.json against the lockfile's own mirror of them, which is exactly
// what npm ci checks first.
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));

// npm v7+ lockfiles mirror the manifest at packages[""].
const root = lock.packages && lock.packages[''];
if (!root) {
  console.log('LOCKFILE SYNC: package-lock.json has no packages[""] root.');
  console.log('Cannot verify. Regenerate the lockfile with `npm install`.');
  process.exit(1);
}

const FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const problems = [];

for (const field of FIELDS) {
  const declared = pkg[field] || {};
  const mirrored = root[field] || {};
  for (const [name, range] of Object.entries(declared)) {
    if (!(name in mirrored)) {
      problems.push(`${field}: "${name}" is in package.json but MISSING from the lockfile`);
    } else if (mirrored[name] !== range) {
      problems.push(`${field}: "${name}" is ${range} in package.json but ${mirrored[name]} in the lockfile`);
    }
  }
  for (const name of Object.keys(mirrored)) {
    if (!(name in declared)) {
      problems.push(`${field}: "${name}" is in the lockfile but MISSING from package.json`);
    }
  }
}

// A dependency the lock declares must also have a resolved entry to install.
for (const field of ['dependencies', 'devDependencies']) {
  for (const name of Object.keys(root[field] || {})) {
    if (!lock.packages[`node_modules/${name}`]) {
      problems.push(`${field}: "${name}" has no node_modules entry in the lockfile — npm ci cannot install it`);
    }
  }
}

if (problems.length) {
  console.log(`LOCKFILE SYNC: ${problems.length} mismatch(es) — every Vercel deploy will FAIL at install.\n`);
  for (const p of problems) console.log('  x ' + p);
  console.log('\nFix: run `npm install` (not `npm ci`) and commit BOTH package.json and package-lock.json.');
  process.exit(1);
}

const n = FIELDS.reduce((a, f) => a + Object.keys(pkg[f] || {}).length, 0);
console.log(`LOCKFILE SYNC: ${n} declared dependencies all match the lockfile.`);
