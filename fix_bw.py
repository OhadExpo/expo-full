import os
path = os.path.join(os.path.expanduser('~'), 'Desktop', 'expo-full', 'src', 'ClientPortal.jsx')
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Add "Save BW" button next to the BW input and make it save weekly
old_bw = """<div style={{width:80}}><div style={{fontSize:10,fontFamily:FN,color:C.td,marginBottom:4}}>BW {lb?`(${lb})`:''}</div>
            <input value={bw} onChange={e => setBw(e.target.value)} placeholder="kg" type="number" style={{background:C.sf2,border:`1px solid ${C.bd}`,borderRadius:6,padding:'8px',color:C.tx,fontFamily:FN,fontSize:12,outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center'}}/></div></div>"""

new_bw = """<div style={{width:120}}><div style={{fontSize:10,fontFamily:FN,color:C.td,marginBottom:4}}>BW {lb?`(${lb}kg)`:''}</div>
            <div style={{display:'flex',gap:4}}>
            <input value={bw} onChange={e => setBw(e.target.value)} placeholder="kg" type="number" style={{background:C.sf2,border:`1px solid ${C.bd}`,borderRadius:6,padding:'8px',color:C.tx,fontFamily:FN,fontSize:12,outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center'}}/>
            {bw && <button onClick={()=>{setBwLog(prev=>[...prev,{date:new Date().toISOString(),clientId:ci,week:wk+1,bw:parseFloat(bw)}]);setBw('')}} style={{background:C.acD,border:'none',borderRadius:6,padding:'4px 8px',color:C.ac,fontFamily:FN,fontSize:10,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>Save</button>}
            </div></div></div>"""

c = c.replace(old_bw, new_bw)

# 2. Add BW tab to the tab bar (alongside Program and History)
old_tabs = """[['prog','Program'],['hist',`History (${cw.length})`]]"""
new_tabs = """[['prog','Program'],['bwt','BW Graph'],['hist',`History (${cw.length})`]]"""
c = c.replace(old_tabs, new_tabs)

# 3. Add BW Graph view (insert before the History view)
old_hist = """  // History
  if (vw === 'hist' && cl)"""

bw_graph_view = """  // BW Graph tab
  if (vw === 'bwt' && cl) { 
    const bwData = bwLog.filter(b => b.clientId === ci).sort((a,b) => new Date(a.date) - new Date(b.date));
    const maxBw = bwData.length ? Math.max(...bwData.map(b=>b.bw)) : 100;
    const minBw = bwData.length ? Math.min(...bwData.map(b=>b.bw)) : 50;
    const range = Math.max(maxBw - minBw, 2);
    return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
      <div style={{padding:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <button onClick={() => setVw('prog')} style={{background:'none',border:'none',color:C.ac,cursor:'pointer',fontFamily:FB,fontSize:13,padding:0}}>← Back</button>
          <img src={EXPO_ICON} alt="EXPO" style={{height:18,opacity:0.5}} />
        </div>
        <h2 style={{margin:'0 0 4px',fontFamily:FN,fontSize:18}}>Bodyweight Tracking</h2>
        <div style={{color:C.tm,fontSize:12,marginBottom:16}}>{cl.name} · {bwData.length} entries</div>

        {/* Quick log */}
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:14,marginBottom:16}}>
          <div style={{fontSize:11,fontFamily:FN,color:C.td,marginBottom:8}}>LOG THIS WEEK (W{wk+1})</div>
          <div style={{display:'flex',gap:8}}>
            <input value={bw} onChange={e => setBw(e.target.value)} placeholder="Weight in kg" type="number" style={{flex:1,background:C.sf2,border:`1px solid ${C.bd}`,borderRadius:8,padding:'10px 12px',color:C.tx,fontFamily:FN,fontSize:14,outline:'none',boxSizing:'border-box'}}/>
            <button onClick={()=>{if(bw){setBwLog(prev=>[...prev,{date:new Date().toISOString(),clientId:ci,week:wk+1,bw:parseFloat(bw)}]);setBw('')}}} 
              style={{padding:'10px 20px',borderRadius:8,border:'none',background:bw?C.ac:C.sf3,color:bw?'#fff':C.td,fontFamily:FB,fontSize:13,fontWeight:700,cursor:bw?'pointer':'default'}}>Save</button>
          </div>
        </div>

        {/* Graph */}
        {bwData.length < 2 ? (
          <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:40,textAlign:'center',color:C.td,marginBottom:16}}>
            <div style={{fontSize:24,marginBottom:8}}>📊</div>
            <div style={{fontSize:13}}>Log at least 2 weigh-ins to see your trend</div>
          </div>
        ) : (
          <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:14,marginBottom:16}}>
            <div style={{fontSize:11,fontFamily:FN,color:C.td,marginBottom:10}}>TREND</div>
            <svg viewBox={`0 0 ${Math.max(bwData.length * 60, 300)} 160`} style={{width:'100%',height:160}}>
              {/* Grid lines */}
              {[0,0.25,0.5,0.75,1].map((p,i) => {
                const y = 10 + p * 130;
                const val = (maxBw - p * range).toFixed(1);
                return <g key={i}>
                  <line x1="40" y1={y} x2={Math.max(bwData.length*60,300)-10} y2={y} stroke={C.bd} strokeWidth="0.5" strokeDasharray="4"/>
                  <text x="36" y={y+4} fill={C.td} fontSize="9" fontFamily={FN} textAnchor="end">{val}</text>
                </g>;
              })}
              {/* Line + dots */}
              <polyline fill="none" stroke={C.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                points={bwData.map((d,i) => `${50+i*50},${10+((maxBw-d.bw)/range)*130}`).join(' ')}/>
              {bwData.map((d,i) => {
                const x = 50 + i * 50;
                const y = 10 + ((maxBw - d.bw) / range) * 130;
                return <g key={i}>
                  <circle cx={x} cy={y} r="4" fill={C.ac} stroke={C.bg} strokeWidth="2"/>
                  <text x={x} y={y-10} fill={C.tx} fontSize="10" fontFamily={FN} textAnchor="middle" fontWeight="600">{d.bw}</text>
                  <text x={x} y={152} fill={C.td} fontSize="8" fontFamily={FN} textAnchor="middle">W{d.week||'?'}</text>
                </g>;
              })}
            </svg>
            {/* Stats */}
            <div style={{display:'flex',gap:12,marginTop:10}}>
              <div style={{flex:1,background:C.sf2,borderRadius:8,padding:10,textAlign:'center'}}>
                <div style={{fontSize:9,fontFamily:FN,color:C.td}}>LATEST</div>
                <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:C.tx}}>{bwData[bwData.length-1].bw}kg</div>
              </div>
              <div style={{flex:1,background:C.sf2,borderRadius:8,padding:10,textAlign:'center'}}>
                <div style={{fontSize:9,fontFamily:FN,color:C.td}}>CHANGE</div>
                <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:(bwData[bwData.length-1].bw-bwData[0].bw)<=0?C.gn:C.or}}>
                  {(bwData[bwData.length-1].bw-bwData[0].bw)>0?'+':''}{(bwData[bwData.length-1].bw-bwData[0].bw).toFixed(1)}kg</div>
              </div>
              <div style={{flex:1,background:C.sf2,borderRadius:8,padding:10,textAlign:'center'}}>
                <div style={{fontSize:9,fontFamily:FN,color:C.td}}>ENTRIES</div>
                <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:C.tx}}>{bwData.length}</div>
              </div>
            </div>
          </div>
        )}

        {/* Log history */}
        <div style={{fontSize:11,fontFamily:FN,color:C.td,marginBottom:8}}>HISTORY</div>
        {bwData.slice().reverse().map((d,i) => (
          <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:i%2===0?C.sf:'transparent',borderRadius:6,marginBottom:2}}>
            <div>
              <span style={{fontSize:13,fontWeight:600,color:C.tx}}>{d.bw} kg</span>
              <span style={{fontSize:11,color:C.tm,marginLeft:8}}>W{d.week||'?'}</span>
            </div>
            <span style={{fontSize:10,color:C.td}}>{new Date(d.date).toLocaleDateString()}</span>
          </div>
        ))}
        {bwData.length === 0 && <div style={{textAlign:'center',padding:20,color:C.td,fontSize:13}}>No bodyweight entries yet</div>}
      </div>
    </div>;
  }

  // History
  if (vw === 'hist' && cl)"""

c = c.replace(old_hist, bw_graph_view)

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)

print("Done: BW tab + weekly logging + graph added")
