// BWChart — shared bodyweight trend chart. Used by the coach TraineeDetail
// bodyweight section, the BHBC athlete modal, and anywhere a coach-facing
// weigh-in trend is shown. Entries: [{ bw:Number, date:String }] oldest→newest.
// Extracted from TraineeDetail (2026-08-16) so the BHBC zone can render the
// exact same chart the athlete portal / trainee page use — one source of truth.
import React from 'react';
import { C, FN } from './theme';
import { Card } from './ui';
import { fmtPrettyDate } from './dates';

export default function BWChart({ entries }) {
  if (!entries || entries.length === 0) {
    return <Card style={{textAlign:'center',padding:'18px 16px',color:C.td,fontSize:13}}>No bodyweight logged yet — appears once the trainee logs weight from their portal.</Card>;
  }
  // Bottom padding shrunk from 24 → 12 because date labels moved OUT
  // of the SVG and into HTML below (preserveAspectRatio="none" was
  // stretching the text horizontally as the SVG scaled wider than its
  // viewBox).
  const W = 800, H = 128, PAD_X = 14, PAD_TOP = 18, PAD_BOTTOM = 12;
  const values = entries.map(e => e.bw);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = (max - min) || 1;
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  const xStep = entries.length === 1 ? 0 : (W - PAD_X * 2) / (entries.length - 1);
  const points = entries.map((e, i) => {
    const x = entries.length === 1 ? W / 2 : PAD_X + i * xStep;
    const y = PAD_TOP + (1 - (e.bw - min) / span) * (H - PAD_TOP - PAD_BOTTOM);
    return { x, y, bw: e.bw, date: e.date };
  });
  const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `M${points[0].x},${H - PAD_BOTTOM} L${polyline.replace(/ /g, ' L')} L${points[points.length - 1].x},${H - PAD_BOTTOM} Z`;
  const deltaColor = delta < 0 ? C.gn : delta > 0 ? C.or : C.tm;
  const fmt = v => `${v.toFixed(1)}kg`;
  return (
    <Card style={{padding:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',flexWrap:'wrap',gap:10,marginBottom:10}}>
        <div style={{display:'flex',gap:18,flexWrap:'wrap'}}>
          <div><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',fontWeight:700}}>Current</div><div style={{fontSize:18,fontWeight:700,color:C.tx,fontFamily:FN}}>{fmt(last)}</div></div>
          <div><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',fontWeight:700}}>Δ from first</div><div style={{fontSize:18,fontWeight:700,color:deltaColor,fontFamily:FN}}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}kg</div></div>
          <div><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',fontWeight:700}}>Range</div><div style={{fontSize:18,fontWeight:700,color:C.tx,fontFamily:FN}}>{fmt(min)} – {fmt(max)}</div></div>
        </div>
        <div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',fontWeight:700}}>{entries.length} ENTR{entries.length === 1 ? 'Y' : 'IES'}</div>
      </div>
      <div style={{position:'relative',width:'100%',height:H}}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:H,display:'block'}} aria-label="Bodyweight chart" preserveAspectRatio="none">
          <defs>
            <linearGradient id="bwAreaGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#39BDFF" stopOpacity="0.35"/>
              <stop offset="100%" stopColor="#39BDFF" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#bwAreaGrad)" />
          <polyline points={polyline} fill="none" stroke="#39BDFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3" fill={C.ac} stroke={C.bg} strokeWidth="1.5">
              <title>{`${fmtPrettyDate(p.date)} · ${fmt(p.bw)}`}</title>
            </circle>
          ))}
        </svg>
        {points.map((p, i) => {
          const prevY = i > 0 ? points[i - 1].y : null;
          const nextY = i < points.length - 1 ? points[i + 1].y : null;
          const prevDown = prevY != null ? prevY > p.y : null;
          const nextDown = nextY != null ? nextY > p.y : null;
          const dirs = [prevDown, nextDown].filter(v => v != null);
          const isPeak = dirs.length > 0 && dirs.every(v => v === true);
          const isTrough = dirs.length > 0 && dirs.every(v => v === false);
          let labelX = p.x, labelY, anchor = 'middle';
          const innerH = H - PAD_TOP - PAD_BOTTOM;
          if (!isPeak && !isTrough && prevY != null && nextY != null) {
            const ascending = nextY < prevY;
            labelX = ascending ? p.x - 6 : p.x + 6;
            labelY = p.y - 4;
            anchor = ascending ? 'end' : 'start';
          } else {
            let above = isPeak;
            if (above && p.y < PAD_TOP + 8) above = false;
            else if (!above && p.y > PAD_TOP + innerH - 4) above = true;
            labelY = above ? p.y - 8 : p.y + 14;
          }
          const tx = anchor === 'end' ? '-100%' : anchor === 'middle' ? '-50%' : '0';
          return (
            <span key={i} style={{
              position:'absolute',
              left:`${(labelX / W) * 100}%`,
              top:labelY,
              transform:`translate(${tx}, -100%)`,
              fontSize:10,
              fontFamily:FN,
              color:C.tx,
              fontWeight:600,
              whiteSpace:'nowrap',
              pointerEvents:'none',
              lineHeight:1,
            }}>{p.bw}</span>
          );
        })}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:4,fontFamily:FN,fontSize:9,color:C.td,letterSpacing:'0.04em'}}>
        <span>{fmtPrettyDate(entries[0].date)}</span>
        <span>{fmtPrettyDate(entries[entries.length-1].date)}</span>
      </div>
    </Card>
  );
}
