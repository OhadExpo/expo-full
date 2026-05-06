// Legacy spreadsheet (.xlsx/.xls/.csv) import path. Extracted from App.jsx so
// `xlsx` (~50 KB gzipped) only lands in a chunk fetched when the user actually
// drops a file into the import box, not on every initial visit.
import * as XLSX from 'xlsx';
import { uid } from './theme';

export function parseSingleSheet(ws, sheetName) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // SheetJS stores hyperlinks on the cell object — look up by row,col.
  const getHyperlink = (r, c) => {
    const cellRef = XLSX.utils.encode_cell({ r, c });
    const cell = ws[cellRef];
    return cell?.l?.Target || cell?.l?.target || '';
  };

  // Warm-ups live in the header rows above the first '#' day marker.
  // Pattern "Name (rx)" where rx contains a digit/SEC/REP/MIN. Hyperlink
  // on the cell becomes the warm-up's video URL.
  let firstDayRow = rows.length;
  for (let r = 0; r < rows.length; r++) {
    if (String(rows[r][0]||'').trim() === '#' && String(rows[r][1]||'').trim()) { firstDayRow = r; break; }
  }
  const WU_HEADER_RE = /^\s*(warm[-\s]?up|morning routine|חימום|instructions?|notes?|neck exc|bb\s*-\s*barbell|everything else|bb exercises|week\s*\d|rest|home routine|date:|day\s+\w)/i;
  const WU_RX_RE = /^(.+?)\s*\(\s*([^()]+?)\s*\)\s*$/;
  const warmup = [];
  const wuSeen = new Set();
  for (let r = 0; r < firstDayRow; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c]||'').trim();
      if (!v || WU_HEADER_RE.test(v)) continue;
      const m = v.match(WU_RX_RE);
      if (!m) continue;
      const t = m[1].trim(); const rx = m[2].trim();
      if (!t || !rx) continue;
      if (!/\d|sec|rep|min/i.test(rx)) continue;
      if (/[:]/.test(t)) continue;
      if (/^(week\s|date\s|new\s+gym)/i.test(t)) continue;
      const key = t.toLowerCase();
      if (wuSeen.has(key)) continue; wuSeen.add(key);
      const vid = getHyperlink(r, c);
      warmup.push(vid ? { t, rx, vid } : { t, rx });
    }
  }

  const exercises = []; const days = []; let currentDay = null; let blockName = '';
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]; const a = String(row[0]||'').trim(); const b = String(row[1]||'').trim();
    if (r===0 && a && !blockName) { blockName = a; continue; }
    if (r===0 && !a && b && !blockName) { blockName = b; continue; }
    if (a==='#' && b) { if (currentDay?.ex.length>0) days.push(currentDay); currentDay={name:b,ex:[]}; continue; }
    if (!a||a==='#'||a.toLowerCase().includes('rest')||a.toLowerCase().includes('off')) continue;
    if (b.toLowerCase()==='exercise'||b.toLowerCase()==='name') continue;
    if (b.toLowerCase().includes('rest')&&b.toLowerCase().includes('off')) continue;
    if (a.toLowerCase()==='instructions'||a.toLowerCase().startsWith('bb -')||a.toLowerCase().startsWith('bb exercises')) continue;
    const tempo=String(row[4]||'').trim(); const setsRaw=String(row[5]||'3').trim(); const repsRaw=String(row[6]||'').trim();
    let sets=parseInt(setsRaw)||3; const wave=[];
    if (repsRaw.includes('>')) { for(let ci=7;ci<=10;ci++){if(row[ci])wave.push(String(row[ci]).trim())} }
    // Source rows mark supersets like "6a", "6b" — group 6, parts a/b. Both
    // parts must share the same EXPO superset letter so the day-grouper
    // (ClientPortal + PlansView) keeps consecutive rows in one block. Map
    // the GROUP NUMBER to A..E (cyclic via mod 5) — NOT the part letter.
    let superset='';
    const ssMatch=a.match(/(\d+)[a-e]/i);
    if (ssMatch) {
      const groupN = parseInt(ssMatch[1], 10);
      if (Number.isFinite(groupN) && groupN >= 1) {
        superset = String.fromCharCode(64 + (((groupN - 1) % 5) + 1));
      }
    }
    // Resolve exercise title. Col B is the canonical column, BUT some
    // sheets put the actual name in col C and use col B for a paired-set
    // marker like "SuperSet:" — fall through to col C in that case so we
    // don't misread the label as an exercise name (or drop the row when
    // col B is empty).
    const eid='ex_'+uid();
    let exName = b;
    if (!exName || /^superset:?$/i.test(exName)) exName = String(row[2]||'').trim();
    if (!exName) continue;
    const videoLink=getHyperlink(r, 3);
    exercises.push({id:eid,title:exName,videoLink,cues:'',category:'',resistanceType:'',movementPattern:'',laterality:'',primaryMuscles:'',secondaryMuscles:'',primaryJoints:'',jointMovements:'',bodyPosition:'',movementType:'',notes:''});
    const dayEx={eid,s:sets,r:repsRaw||'8-12'}; if(tempo&&tempo.toLowerCase()!=='tempo'&&tempo.toLowerCase()!=='none')dayEx.tempo=tempo; if(wave.length>0)dayEx.wk=wave; if(superset)dayEx.superset=superset;
    if(!currentDay)currentDay={name:'Day 1',ex:[]}; currentDay.ex.push(dayEx);
  }
  if(currentDay?.ex.length>0) days.push(currentDay);
  return {blockName:blockName||sheetName,exercises,days,warmup};
}

export function parseSpreadsheet(data, fileName) {
  const wb=XLSX.read(data,{type:'array'}); const traineeName=fileName.replace(/\.(xlsx|xls|csv)$/i,'').replace(/[-_]/g,' ').replace(/\s*Training Program\s*$/i,'').replace(/^מעקב\s*/,'').replace(/\s*מעקב\s*$/,'').replace(/^\s*-\s*/,'').replace(/\s*-\s*$/,'').trim();
  const allExercises=[]; const allPlans=[]; const exTitleMap={};
  for(const sheetName of wb.SheetNames){const ws=wb.Sheets[sheetName]; const{blockName,exercises,days,warmup}=parseSingleSheet(ws,sheetName); if(days.length===0)continue;
    const sheetExercises=[]; for(const ex of exercises){if(!exTitleMap[ex.title]){exTitleMap[ex.title]=ex.id;allExercises.push(ex)}sheetExercises.push({...ex,dedupId:exTitleMap[ex.title]})}
    const remappedDays=days.map(d=>({...d,ex:d.ex.map(e=>{const orig=sheetExercises.find(se=>se.id===e.eid);return{...e,eid:orig?orig.dedupId:e.eid}})}));
    allPlans.push({id:'plan_'+uid(),name:blockName,phase:'',rest:'',warmup:warmup||[],days:remappedDays});
  }
  return{trainee:{id:'tr_'+uid(),name:traineeName,status:'Active',format:'In-Person Private',package:'8 Sessions',sessionsRemaining:8},exercises:allExercises,plans:allPlans,version:'2.0',source:fileName};
}
