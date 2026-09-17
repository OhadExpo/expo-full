const rep = (src, from, to, n = 1) => { const c = src.split(from).length - 1; if (c !== n) throw new Error(`expected ${n} match(es), got ${c}: ${from.slice(0, 70)}`); return src.split(from).join(to); };
export default (src0) => {
  const crlf = src0.includes(String.fromCharCode(13,10));
  let s = crlf ? src0.split(String.fromCharCode(13,10)).join(String.fromCharCode(10)) : src0;
  if (!s.includes(`function CompareModal({ leftLabel, leftUrl, leftTitle, rightLabel, rightUrl, rightTitle, rightMode, onClose, closing }) {`)) throw new Error('no branch matched');

  // A compare label is "BLOCK #19 · W2 · Day A — title · 7 בספטמבר 2026": a
  // Latin-first string, so the Hebrew date inside it resolved LTR and rendered
  // "7 2026 בספטמבר" (photographed 09-11). Each " · " segment becomes its own
  // bidi paragraph, so the date reads as Hebrew and the rest stays as it was.
  s = rep(s, `function CompareModal({ leftLabel, leftUrl, leftTitle, rightLabel, rightUrl, rightTitle, rightMode, onClose, closing }) {`,
`const bidiParts = (label) => String(label || '').split(' · ').map((p, i) => (
  <span key={i}>{i > 0 && ' · '}<span style={{ unicodeBidi: 'plaintext' }}>{p}</span></span>
));

function CompareModal({ leftLabel, leftUrl, leftTitle, rightLabel, rightUrl, rightTitle, rightMode, onClose, closing }) {`);
  s = rep(s, `  const demo = rightMode === 'demo';
  useEscClose(true, onClose); // Escape closes the compare modal`,
`  const demo = rightMode === 'demo';
  const tt = useAppT();
  useEscClose(true, onClose); // Escape closes the compare modal`);
  s = rep(s, `{demo ? 'FORM VS DEMO' : 'COMPARE'}</h3>`, `{demo ? tt('FORM VS DEMO') : tt('COMPARE')}</h3>`);
  s = rep(s, `<div style={titleStyle}>{leftLabel}</div>`, `<div style={titleStyle}>{bidiParts(leftLabel)}</div>`);
  s = rep(s, `<div style={titleStyle}>{rightLabel}</div>`, `<div style={titleStyle}>{bidiParts(rightLabel)}</div>`);
  s = rep(s, `{playing ? '❚❚  PAUSE' : '▶  PLAY BOTH'}`, `{playing ? '❚❚  ' + tt('PAUSE') : '▶  ' + tt('PLAY BOTH')}`);
  s = rep(s, `style={btn(loop)}>↻ LOOP</button>`, `style={btn(loop)}>↻ {tt('LOOP')}</button>`);
  s = rep(s, `style={btn(false)}>SYNC →</button>`, `style={btn(false)}>{tt('SYNC')} →</button>`);
  s = rep(s, `style={btn(false)}>← SYNC</button>`, `style={btn(false)}>← {tt('SYNC')}</button>`);
  // The picker: its count line was English in Hebrew, and its candidate labels
  // carry the same Latin-first date.
  s = rep(s, `{cmpPickerHold.value.candidates.length} other video{cmpPickerHold.value.candidates.length===1?'':'s'} from this client:`,
    `{cmpPickerHold.value.candidates.length} {tt(cmpPickerHold.value.candidates.length === 1 ? 'other video from this client:' : 'other videos from this client:')}`);
  s = rep(s, `<div style={{fontSize:12,color:C.tx}}>{c.label}</div>`, `<div style={{fontSize:12,color:C.tx}}>{bidiParts(c.label)}</div>`);
  return crlf ? s.split(String.fromCharCode(10)).join(String.fromCharCode(13,10)) : s;
};
