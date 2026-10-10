// verify-function-count.mjs - the deploy fits Vercel's Hobby plan: at most 12 serverless functions.
//
// 10.10: deploy-1010h passed every gate here and then FAILED on Vercel at patchBuild -
// "No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan" -
// because #559 added api/video-health.js as the 13th. Production stayed on the old build (no
// harm), but nothing local had counted. Every .js/.mjs/.ts file under api/ is a function unless
// its name (or a folder on its path) starts with an underscore.
import fs from 'node:fs';
import path from 'node:path';

const LIMIT = 12;
const fns = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs|cjs|ts)$/.test(e.name)) fns.push(p.replace(/\\/g, '/'));
  }
};
if (fs.existsSync('api')) walk('api');
if (fns.length > LIMIT) {
  console.log(`FUNCTION COUNT: ${fns.length} serverless functions, the Hobby plan deploys at most ${LIMIT} - Vercel will refuse this build.`);
  for (const f of fns) console.log('  ' + f);
  console.log('Fold one into another route, or rename a helper to start with "_".');
  process.exit(1);
}
console.log(`FUNCTION COUNT: ${fns.length} of ${LIMIT} serverless functions`);
