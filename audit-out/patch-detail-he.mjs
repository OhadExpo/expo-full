const rep = (src, from, to, n = 1) => { const c = src.split(from).length - 1; if (c !== n) throw new Error(`expected ${n} match(es), got ${c}: ${from.slice(0, 70)}`); return src.split(from).join(to); };
export default (src0) => {
  const crlf = src0.includes(String.fromCharCode(13,10));
  let s = crlf ? src0.split(String.fromCharCode(13,10)).join(String.fromCharCode(10)) : src0;
  // The review detail in Hebrew still said ← BACK, the hotkey legend and
  // ✓ MARK REVIEWED — BACK in English (dumped 09-12 00:55).
  s = rep(s, `          ← BACK
        </button>`, `          {tt('← BACK')}
        </button>`);
  s = rep(s, `          M · MARK REVIEWED · &nbsp; J · SKIP · &nbsp; C · COMMENT AT PLAYHEAD`, `          M · {tt('MARK REVIEWED')} · &nbsp; J · {tt('SKIP')} · &nbsp; C · {tt('COMMENT AT PLAYHEAD')}`);
  s = rep(s, `            ← BACK
          </button>}`, `            {tt('← BACK')}
          </button>}`);
  s = rep(s, `              ✓ MARK REVIEWED — BACK`, `              ✓ {tt('MARK REVIEWED')} — {tt('BACK')}`);
  // "20/20 sets" on the review card: the word after the numbers.
  s = rep(s, `<span>{doneSets}/{totalSets} sets</span>`, `<span>{doneSets}/{totalSets} {tt('sets')}</span>`);
  // The day card's corner element was pinned with a physical right — it is
  // what the mirror probe flagged as 65px off; inset-inline-end mirrors it.
  s = rep(s, `.wr-day-card > div:last-child{ position: absolute !important; top: 8px !important; right: 12px !important; margin-left: 0 !importan`, `.wr-day-card > div:last-child{ position: absolute !important; top: 8px !important; inset-inline-end: 12px !important; margin-inline-start: 0 !importan`);
  return crlf ? s.split(String.fromCharCode(10)).join(String.fromCharCode(13,10)) : s;
};
