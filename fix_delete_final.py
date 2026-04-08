import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the entire permanent delete dialog with a simple "type DELETE" approach
old_block = '''      {/* Permanent delete — triple check: confirm dialog + type name */}
      {deleteConfirm && <div style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }} onClick={() => {setDeleteConfirm(null);setDeleteTyped("")}}>
        <div onClick={e => e.stopPropagation()} style={{ background: C.sf, border: `1px solid ${C.rd}40`, borderRadius: 12, width: 420, padding: 24 }}>
          <h3 style={{ margin: "0 0 8px", fontFamily: FN, fontSize: 15, color: C.rd }}>⚠ Permanent Deletion</h3>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: C.tm }}>This will permanently delete <strong style={{color:C.tx}}>{deleteConfirm.name}</strong> and ALL their data (plans, workouts, payments).</p>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: C.rd, fontWeight: 600 }}>This cannot be undone.</p>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.tm, textTransform: "uppercase", fontFamily: FN, display: "block", marginBottom: 4 }}>Type "{deleteConfirm.name}" to confirm</label>
            <input value={deleteTyped} onChange={e => setDeleteTyped(e.target.value)} style={{ background: C.sf2, border: `1px solid ${C.rd}40`, borderRadius: 6, padding: "8px 12px", color: C.tx, fontFamily: FB, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" }} placeholder={deleteConfirm.name} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn variant="ghost" onClick={() => {setDeleteConfirm(null);setDeleteTyped("")}}>Cancel</Btn>
            <Btn variant="danger" onClick={() => { if (deleteTyped.trim().normalize('NFC') === deleteConfirm.name.trim().normalize('NFC')) handlePermanentDelete(deleteConfirm.id); }}
              style={{ opacity: deleteTyped.trim().normalize('NFC') === deleteConfirm.name.trim().normalize('NFC') ? 1 : 0.3, cursor: deleteTyped.trim().normalize('NFC') === deleteConfirm.name.trim().normalize('NFC') ? "pointer" : "not-allowed", pointerEvents: deleteTyped.trim().normalize('NFC') === deleteConfirm.name.trim().normalize('NFC') ? "auto" : "none" }}>
              Delete Permanently</Btn>
          </div>
        </div>
      </div>}'''

new_block = '''      {/* Permanent delete — type DELETE to confirm */}
      {deleteConfirm && <div style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }} onClick={() => {setDeleteConfirm(null);setDeleteTyped("")}}>
        <div onClick={e => e.stopPropagation()} style={{ background: C.sf, border: `1px solid ${C.rd}40`, borderRadius: 12, width: 420, padding: 24 }}>
          <h3 style={{ margin: "0 0 8px", fontFamily: FN, fontSize: 15, color: C.rd }}>⚠ Permanent Deletion</h3>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: C.tm }}>This will permanently delete <strong style={{color:C.tx}}>{deleteConfirm.name}</strong> and ALL their data (plans, workouts, payments).</p>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: C.rd, fontWeight: 600 }}>This cannot be undone.</p>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.tm, textTransform: "uppercase", fontFamily: FN, display: "block", marginBottom: 4 }}>Type "DELETE" to confirm</label>
            <input value={deleteTyped} onChange={e => setDeleteTyped(e.target.value)} style={{ background: C.sf2, border: `1px solid ${C.rd}40`, borderRadius: 6, padding: "8px 12px", color: C.tx, fontFamily: FN, fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box", letterSpacing: "0.1em" }} placeholder="DELETE" autoComplete="off" />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn variant="ghost" onClick={() => {setDeleteConfirm(null);setDeleteTyped("")}}>Cancel</Btn>
            <Btn variant="danger" onClick={() => { if (deleteTyped.trim().toUpperCase() === "DELETE") handlePermanentDelete(deleteConfirm.id); }}
              style={{ opacity: deleteTyped.trim().toUpperCase() === "DELETE" ? 1 : 0.3, pointerEvents: deleteTyped.trim().toUpperCase() === "DELETE" ? "auto" : "none" }}>
              Delete Permanently</Btn>
          </div>
        </div>
      </div>}'''

if old_block in content:
    content = content.replace(old_block, new_block)
    print("Replaced TraineesView delete dialog")
else:
    print("WARNING: Could not find exact old block in TraineesView")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
