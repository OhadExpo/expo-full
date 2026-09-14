// The hook ran before its element existed: the coach header mounts inside a
// branch that renders after the first effect pass, so ref.current was null,
// the listeners were never attached and data-fade never appeared (measured:
// both .hdr-scroll elements came back with no attribute at all). Wait for the
// node across frames, then attach.
import fs from 'node:fs';
const f = 'src/ui.jsx';
let s = fs.readFileSync(f, 'utf8');
const a = `export function useEdgeFade(ref) {
  React.useEffect(() => {
    const el = ref && ref.current;
    if (!el) return undefined;
    const update = () => {`;
const b = `export function useEdgeFade(ref) {
  React.useEffect(() => {
    let el = null, ro = null, raf = 0, tries = 0;
    const update = () => {
      if (!el) return;`;
if (s.split(a).length !== 2) throw new Error('head anchor');
s = s.replace(a, b);

const a2 = `    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(update); ro.observe(el); for (const kid of el.children) ro.observe(kid); }
    const t = setTimeout(update, 400);   // fonts land after first paint
    return () => { clearTimeout(t); el.removeEventListener('scroll', update); window.removeEventListener('resize', update); if (ro) ro.disconnect(); };
  });
}`;
const b2 = `    // The element can mount a few frames after this effect first runs.
    const attach = () => {
      el = ref && ref.current;
      if (!el) { if (tries++ < 180) raf = requestAnimationFrame(attach); return; }
      update();
      el.addEventListener('scroll', update, { passive: true });
      if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(update); ro.observe(el); for (const kid of el.children) ro.observe(kid); }
    };
    attach();
    window.addEventListener('resize', update);
    const t = setTimeout(update, 600);   // fonts land after first paint
    return () => {
      clearTimeout(t); cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      if (el) el.removeEventListener('scroll', update);
      if (ro) ro.disconnect();
    };
  }, [ref]);
}`;
if (s.split(a2).length !== 2) throw new Error('tail anchor');
s = s.replace(a2, b2);
fs.writeFileSync(f, s);
console.log('ok useEdgeFade waits for its node');
