/* =====================================================
   TASS Alumni Contribution Tracker — script.js
   ===================================================== */
 
// ───────────────────────────────────────────────────────
// AUTH
// ───────────────────────────────────────────────────────
const authState = { failedAttempts:0, maxAttempts:5, lockoutMs:5*60*1000, lockedUntil:0, lockTimer:null, active:false };
 
async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function safeEqual(a,b) {
  if(a.length!==b.length) return false;
  let d=0; for(let i=0;i<a.length;i++) d|=a.charCodeAt(i)^b.charCodeAt(i); return d===0;
}
async function initAuth() {
  if(!localStorage.getItem('tass_pw_hash')) {
    localStorage.setItem('tass_pw_hash', await sha256hex('kennedy\\60'));
  }
  if(sessionStorage.getItem('tass_session')==='granted') { authState.active=true; showAdminUI(false); }
}
function isAdminActive() { return !!authState.active; }
function createSession() { sessionStorage.setItem('tass_session','granted'); authState.active=true; authState.failedAttempts=0; authState.lockedUntil=0; }
function destroySession() { sessionStorage.removeItem('tass_session'); authState.active=false; }
 
async function attemptLogin() {
  if(Date.now()<authState.lockedUntil) return;
  const pw=document.getElementById('loginPassword').value;
  const typed=await sha256hex(pw);
  if(safeEqual(typed,localStorage.getItem('tass_pw_hash'))) {
    createSession(); closeLoginModal(); showAdminUI(true);
  } else {
    authState.failedAttempts++;
    const rem=authState.maxAttempts-authState.failedAttempts;
    if(authState.failedAttempts>=authState.maxAttempts) { authState.lockedUntil=Date.now()+authState.lockoutMs; startLockoutCountdown(); }
    else showLoginError(`Incorrect password. ${rem} attempt${rem!==1?'s':''} remaining.`);
  }
}
function startLockoutCountdown() {
  if(authState.lockTimer) clearInterval(authState.lockTimer);
  authState.lockTimer=setInterval(()=>{
    const secs=Math.ceil((authState.lockedUntil-Date.now())/1000);
    if(secs<=0){ clearInterval(authState.lockTimer); authState.failedAttempts=0; authState.lockedUntil=0; showLoginError(''); document.getElementById('loginPassword').disabled=false; }
    else { showLoginError(`Too many attempts. Try again in ${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`); document.getElementById('loginPassword').disabled=true; }
  },1000);
}
function showLoginError(msg) { const el=document.getElementById('loginError'); el.textContent=msg; el.classList.toggle('hidden',!msg); }
function showAdminUI(doRender=true) {
  document.getElementById('adminLoginBtn').classList.add('hidden');
  document.getElementById('adminBanner').classList.remove('hidden');
  document.getElementById('adminControls').classList.remove('hidden');
  document.getElementById('sessionInfo').textContent='(expires on tab close)';
  if(doRender) render();
}
function logout() {
  destroySession();
  document.getElementById('adminLoginBtn').classList.remove('hidden');
  document.getElementById('adminBanner').classList.add('hidden');
  document.getElementById('adminControls').classList.add('hidden');
  render();
}
 
// ───────────────────────────────────────────────────────
// CONSTANTS & HELPERS
// ───────────────────────────────────────────────────────
const AMOUNT = 2000;
 
function generateMonthKeys() {
  const months=[];
  for(let y=2026;y<=2028;y++){
    const startM=(y===2026)?5:1;
    for(let m=startM;m<=12;m++) months.push(`${y}-${String(m).padStart(2,'0')}`);
  }
  return months;
}
function monthLabel(key) {
  const [y,m]=key.split('-');
  return new Date(+y,+m-1,1).toLocaleString('en',{month:'short',year:'2-digit'});
}
function monthLabelFull(key) {
  const [y,m]=key.split('-');
  return new Date(+y,+m-1,1).toLocaleString('en',{month:'long',year:'numeric'});
}
// Returns YYYY-MM for today
function todayKey() {
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
 
// ───────────────────────────────────────────────────────
// BUILD INITIAL DATA
// ───────────────────────────────────────────────────────
const INITIAL_MEMBERS = [
  'Isobel','Wisdom','Yamikani','Wantwa','Zepha','Mac','Ezron','Violet L',
  'Takondwa N','Bright','Memory','Nikita','Chatepa','Happy','Nathaniel',
  'Chisomo','Pile','Patience','Violet G','Beauty','Faith','Priscillah',
  'Jacqueline C','Kelvin','Emily','Tawina','Secret','Elida','Jacqueline B',
  'Precious','Kondwani','Kenedy','Thoko L','Luis'
];
 
function buildInitialData() {
  const allMonths=generateMonthKeys();
  const members=[...INITIAL_MEMBERS];
  const payments={};
  members.forEach((_,i)=>{ payments[i]={}; allMonths.forEach(mk=>{ payments[i][mk]=false; }); });
  return { months:allMonths, members, payments };
}
 
// ───────────────────────────────────────────────────────
// STATE
// ───────────────────────────────────────────────────────
let state = { months:[], members:[], payments:{} };
 
function loadState() {
  try {
    const saved=localStorage.getItem('tass_data');
    const version=localStorage.getItem('tass_version');
    if(saved && version==='2') {
      const parsed=JSON.parse(saved);
      // Migrate: if members array missing, pull from INITIAL_MEMBERS
      if(!parsed.members) parsed.members=[...INITIAL_MEMBERS];
      // Ensure all generated months exist
      generateMonthKeys().forEach(mk=>{
        if(!parsed.months.includes(mk)) { parsed.months.push(mk); parsed.members.forEach((_,i)=>{ if(!parsed.payments[i]) parsed.payments[i]={}; parsed.payments[i][mk]=false; }); }
      });
      parsed.months.sort();
      state=parsed;
    } else {
      state=buildInitialData();
      localStorage.setItem('tass_version','2');
      saveState();
    }
  } catch(e) { state=buildInitialData(); localStorage.setItem('tass_version','2'); saveState(); }
}
function saveState() { localStorage.setItem('tass_data',JSON.stringify(state)); }
 
// ───────────────────────────────────────────────────────
// STATS
// ───────────────────────────────────────────────────────
function getMonthStats(mk) {
  let paid=0;
  state.members.forEach((_,i)=>{ if(state.payments[i]&&state.payments[i][mk]) paid++; });
  const total=state.members.length;
  const unpaid=total-paid;
  return { paid, unpaid, total, received:paid*AMOUNT, expected:total*AMOUNT, outstanding:unpaid*AMOUNT };
}
 
// Only count months up to and including today for overall stats
function getOverallStats() {
  const tk=todayKey();
  let totalReceived=0, totalExpected=0;
  state.months.forEach(mk=>{
    if(mk<=tk) { // only past + current months
      const s=getMonthStats(mk);
      totalReceived+=s.received;
      totalExpected+=s.expected;
    }
  });
  return { totalReceived, totalExpected, totalOutstanding:totalExpected-totalReceived };
}
 
// Current month = most members have paid (active months only, up to today)
function currentMonth() {
  const tk=todayKey();
  const active=state.months.filter(mk=>mk<=tk);
  if(!active.length) return state.months[0];
  // Find the month with the most payments among active months
  let best=active[0], bestPaid=0;
  active.forEach(mk=>{ const p=getMonthStats(mk).paid; if(p>bestPaid){bestPaid=p;best=mk;} });
  return best;
}
 
// ───────────────────────────────────────────────────────
// FILTERS
// ───────────────────────────────────────────────────────
let filteredMonths=[], filteredMembers=[];
 
function applyFilters() {
  const search=document.getElementById('searchInput').value.toLowerCase().trim();
  const monthF=document.getElementById('monthFilter').value;
  const statusF=document.getElementById('statusFilter').value;
  filteredMonths=monthF?[monthF]:[...state.months];
  filteredMembers=state.members.map((name,i)=>({name,i})).filter(({name,i})=>{
    if(search&&!name.toLowerCase().includes(search)) return false;
    if(statusF){ const mk=monthF||currentMonth(); const paid=state.payments[i]&&state.payments[i][mk]; if(statusF==='paid'&&!paid) return false; if(statusF==='unpaid'&&paid) return false; }
    return true;
  });
  renderTable();
}
 
// ───────────────────────────────────────────────────────
// RENDER
// ───────────────────────────────────────────────────────
let trendChart=null, statusChart=null;
 
function render() {
  populateMonthFilter();
  filteredMonths=[...state.months];
  filteredMembers=state.members.map((name,i)=>({name,i}));
  renderDashboard();
  renderTable();
  renderSummary();
  renderCharts();
}
 
function populateMonthFilter() {
  const sel=document.getElementById('monthFilter');
  const cur=sel.value;
  sel.innerHTML='<option value="">All Months</option>';
  state.months.forEach(mk=>{ const o=document.createElement('option'); o.value=mk; o.textContent=monthLabelFull(mk); sel.appendChild(o); });
  if(cur) sel.value=cur;
}
 
function renderDashboard() {
  const mk=currentMonth();
  const s=getMonthStats(mk);
  const overall=getOverallStats();
  const pct=Math.round((s.paid/s.total)*100);
  document.getElementById('dashboard').innerHTML=`
    <div class="card blue"><div class="card-label">Total Members</div><div class="card-value">${s.total}</div><div class="card-sub">Active members</div></div>
    <div class="card green"><div class="card-label">Paid (${monthLabel(mk)})</div><div class="card-value">${s.paid}</div><div class="card-sub">${pct}% of members</div></div>
    <div class="card red"><div class="card-label">Unpaid (${monthLabel(mk)})</div><div class="card-value">${s.unpaid}</div><div class="card-sub">MK ${s.outstanding.toLocaleString()} outstanding</div></div>
    <div class="card green"><div class="card-label">Collected (${monthLabel(mk)})</div><div class="card-value">MK ${s.received.toLocaleString()}</div><div class="card-sub">of MK ${s.expected.toLocaleString()} expected</div></div>
    <div class="card blue"><div class="card-label">Total Collected</div><div class="card-value">MK ${(overall.totalReceived/1000).toFixed(1)}k</div><div class="card-sub">past & current months</div></div>
    <div class="card yellow"><div class="card-label">Total Outstanding</div><div class="card-value">MK ${(overall.totalOutstanding/1000).toFixed(1)}k</div><div class="card-sub">past & current months</div></div>
  `;
}
 
function renderTable() {
  const header=document.getElementById('tableHeader');
  const body=document.getElementById('tableBody');
  const admin=isAdminActive();
  const monthFilterVal=document.getElementById('monthFilter').value;
 
  // Default: show first 6 months (May 2026 onwards). If filter selected, show that month only.
  const displayMonths=monthFilterVal?[monthFilterVal]:filteredMonths.slice(0,6);
 
  // Header
  let hHtml=`<th>#</th><th>Member</th>`;
  displayMonths.forEach(mk=>{ hHtml+=`<th class="month-header">${monthLabel(mk)}</th>`; });
  hHtml+=`<th>Paid</th>`;
  if(admin) hHtml+=`<th>Actions</th>`;
  header.innerHTML=hHtml;
 
  // Rows
  body.innerHTML='';
  filteredMembers.forEach(({name,i})=>{
    const totalPaid=state.months.filter(mk=>state.payments[i]&&state.payments[i][mk]).length;
    const rowClass=monthFilterVal?(state.payments[i]&&state.payments[i][monthFilterVal]?'row-paid':'row-unpaid'):'';
    let cells='';
    displayMonths.forEach(mk=>{
      const paid=state.payments[i]&&state.payments[i][mk];
      if(admin) cells+=`<td class="check-cell"><input type="checkbox" ${paid?'checked':''} onchange="handleCheckboxChange(${i},'${mk}',this)"/></td>`;
      else cells+=`<td class="check-cell">${paid?'<span class="paid-dot">✓</span>':'<span class="unpaid-dot"></span>'}</td>`;
    });
    const actionBtns=admin?`<td class="action-cell">
      <button class="btn-action-edit" onclick="openEditMemberModal(${i})" title="Rename">✏️</button>
      <button class="btn-action-del" onclick="deleteMember(${i})" title="Delete">🗑️</button>
    </td>`:'';
    const tr=document.createElement('tr');
    if(rowClass) tr.className=rowClass;
    tr.innerHTML=`<td><span class="member-num">${i+1}</span></td><td class="member-name">${name}</td>${cells}<td><strong>${totalPaid}</strong><span class="mk"> / ${state.months.length}</span></td>${actionBtns}`;
    body.appendChild(tr);
  });
 
  // Info row
  if(!monthFilterVal&&state.months.length>6) {
    const info=document.createElement('tr');
    info.innerHTML=`<td colspan="${displayMonths.length+(admin?4:3)}" style="text-align:center;color:var(--text-muted);font-size:.75rem;padding:6px;">
      Showing May 2026 – ${monthLabelFull(displayMonths[displayMonths.length-1])}. Use the month filter to see any specific month.
    </td>`;
    body.appendChild(info);
  }
}
 
function renderSummary() {
  const body=document.getElementById('summaryBody');
  body.innerHTML='';
  const tk=todayKey();
  state.months.forEach(mk=>{
    const s=getMonthStats(mk);
    const pct=Math.round((s.received/s.expected)*100);
    const isFuture=mk>tk;
    const tr=document.createElement('tr');
    if(isFuture) tr.style.opacity='0.45';
    tr.innerHTML=`
      <td>${monthLabelFull(mk)}${isFuture?' <span style="font-size:.7rem;color:var(--text-muted)">(upcoming)</span>':''}</td>
      <td>MK ${s.expected.toLocaleString()}</td>
      <td style="color:var(--green);font-weight:600">MK ${s.received.toLocaleString()}</td>
      <td style="color:var(--red)">MK ${s.outstanding.toLocaleString()}</td>
      <td><div class="pct-bar-wrap"><div class="pct-bg"><div class="pct-bar" style="width:${pct}%"></div></div><span class="pct-text">${pct}%</span></div></td>
    `;
    body.appendChild(tr);
  });
}
 
function renderCharts() {
  const tk=todayKey();
  // Only chart past+current months that have some data
  const chartMonths=state.months.filter(mk=>mk<=tk);
 
  const tCtx=document.getElementById('trendChart').getContext('2d');
  if(trendChart) trendChart.destroy();
  trendChart=new Chart(tCtx,{
    type:'bar',
    data:{
      labels:chartMonths.map(monthLabel),
      datasets:[
        {label:'Expected',data:chartMonths.map(mk=>getMonthStats(mk).expected),backgroundColor:'rgba(37,99,235,.15)',borderColor:'#2563eb',borderWidth:1.5,borderRadius:4},
        {label:'Received',data:chartMonths.map(mk=>getMonthStats(mk).received),backgroundColor:'rgba(22,163,74,.65)',borderColor:'#16a34a',borderWidth:1.5,borderRadius:4}
      ]
    },
    options:{responsive:true,maintainAspectRatio:true,
      plugins:{legend:{labels:{color:'#888'}}},
      scales:{x:{ticks:{color:'#888',maxRotation:45},grid:{display:false}},y:{ticks:{color:'#888',callback:v=>`MK ${(v/1000).toFixed(0)}k`},grid:{color:'rgba(128,128,128,.1)'}}}}
  });
 
  const mk=currentMonth();
  const s=getMonthStats(mk);
  const sCtx=document.getElementById('statusChart').getContext('2d');
  if(statusChart) statusChart.destroy();
  statusChart=new Chart(sCtx,{
    type:'doughnut',
    data:{labels:['Paid','Unpaid'],datasets:[{data:[s.paid,s.unpaid],backgroundColor:['#16a34a','#dc2626'],borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:true,
      plugins:{legend:{labels:{color:'#888'}},tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${ctx.parsed} members`}}},cutout:'65%'}
  });
}
 
// ───────────────────────────────────────────────────────
// MEMBER MANAGEMENT (Admin only)
// ───────────────────────────────────────────────────────
function addMember() {
  if(!isAdminActive()) return;
  const nameInput=document.getElementById('newMemberName');
  const name=nameInput.value.trim();
  const errEl=document.getElementById('addMemberError');
  if(!name){ errEl.textContent='Please enter a name.'; errEl.classList.remove('hidden'); return; }
  if(state.members.map(n=>n.toLowerCase()).includes(name.toLowerCase())){ errEl.textContent='Member already exists.'; errEl.classList.remove('hidden'); return; }
  const newIdx=state.members.length;
  state.members.push(name);
  state.payments[newIdx]={};
  state.months.forEach(mk=>{ state.payments[newIdx][mk]=false; });
  saveState();
  nameInput.value='';
  errEl.classList.add('hidden');
  closeAddMemberModal();
  render();
}
 
function openEditMemberModal(idx) {
  if(!isAdminActive()) return;
  document.getElementById('editMemberIdx').value=idx;
  document.getElementById('editMemberName').value=state.members[idx];
  document.getElementById('editMemberError').classList.add('hidden');
  document.getElementById('editMemberModal').classList.remove('hidden');
  setTimeout(()=>document.getElementById('editMemberName').focus(),50);
}
function closeEditMemberModal() { document.getElementById('editMemberModal').classList.add('hidden'); }
 
function saveEditMember() {
  if(!isAdminActive()) return;
  const idx=parseInt(document.getElementById('editMemberIdx').value);
  const name=document.getElementById('editMemberName').value.trim();
  const errEl=document.getElementById('editMemberError');
  if(!name){ errEl.textContent='Name cannot be empty.'; errEl.classList.remove('hidden'); return; }
  const duplicate=state.members.some((n,i)=>i!==idx&&n.toLowerCase()===name.toLowerCase());
  if(duplicate){ errEl.textContent='Another member already has this name.'; errEl.classList.remove('hidden'); return; }
  const oldName=state.members[idx];
  state.members[idx]=name;
  saveState();
  closeEditMemberModal();
  render();
}
 
function deleteMember(idx) {
  if(!isAdminActive()) return;
  const name=state.members[idx];
  openConfirmModal(`Delete Member`,`Permanently delete "${name}" and ALL their payment records? This cannot be undone.`,()=>{
    // Remove member and shift payment indices
    state.members.splice(idx,1);
    const newPayments={};
    let newIdx=0;
    Object.keys(state.payments).map(Number).sort((a,b)=>a-b).forEach(oldIdx=>{
      if(oldIdx===idx) return; // skip deleted
      newPayments[newIdx]=state.payments[oldIdx];
      newIdx++;
    });
    state.payments=newPayments;
    saveState();
    render();
  }, null);
}
 
function openAddMemberModal() {
  if(!isAdminActive()) return;
  document.getElementById('newMemberName').value='';
  document.getElementById('addMemberError').classList.add('hidden');
  document.getElementById('addMemberModal').classList.remove('hidden');
  setTimeout(()=>document.getElementById('newMemberName').focus(),50);
}
function closeAddMemberModal() { document.getElementById('addMemberModal').classList.add('hidden'); }
 
// ───────────────────────────────────────────────────────
// PAYMENT TOGGLE
// ───────────────────────────────────────────────────────
function handleCheckboxChange(memberIdx,monthKey,checkbox) {
  if(!isAdminActive()){ checkbox.checked=!checkbox.checked; return; }
  const newVal=checkbox.checked;
  const name=state.members[memberIdx];
  openConfirmModal(`Mark as ${newVal?'PAID':'UNPAID'}`,`Set ${name} for ${monthLabelFull(monthKey)} as ${newVal?'paid ✅':'unpaid ❌'}?`,
    ()=>{ if(!state.payments[memberIdx]) state.payments[memberIdx]={}; state.payments[memberIdx][monthKey]=newVal; saveState(); render(); },
    ()=>{ checkbox.checked=!newVal; }
  );
}
 
// ───────────────────────────────────────────────────────
// MONTH MANAGEMENT
// ───────────────────────────────────────────────────────
function addMonth() {
  if(!isAdminActive()) return;
  const m=document.getElementById('newMonthMonth').value;
  const y=document.getElementById('newMonthYear').value;
  const key=`${y}-${m}`;
  if(state.months.includes(key)){ document.getElementById('addMonthError').textContent='This month already exists.'; document.getElementById('addMonthError').classList.remove('hidden'); return; }
  state.months.push(key); state.months.sort();
  state.members.forEach((_,i)=>{ if(!state.payments[i]) state.payments[i]={}; state.payments[i][key]=false; });
  saveState(); closeAddMonthModal(); render();
}
 
// ───────────────────────────────────────────────────────
// IMPORT / EXPORT
// ───────────────────────────────────────────────────────
function exportJSON() {
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`tass_backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
}
function importJSON(e) {
  if(!isAdminActive()) return;
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{ try{ const p=JSON.parse(ev.target.result); if(!p.months||!p.payments) throw new Error(); state=p; saveState(); render(); alert('Import successful!'); } catch{ alert('Import failed: invalid format.'); } };
  reader.readAsText(file); e.target.value='';
}
 
// ───────────────────────────────────────────────────────
// MODALS
// ───────────────────────────────────────────────────────
function openLoginModal() { document.getElementById('loginModal').classList.remove('hidden'); document.getElementById('loginPassword').value=''; document.getElementById('loginError').classList.add('hidden'); setTimeout(()=>document.getElementById('loginPassword').focus(),50); }
function closeLoginModal() { document.getElementById('loginModal').classList.add('hidden'); }
function togglePwVisibility() { const i=document.getElementById('loginPassword'); i.type=i.type==='password'?'text':'password'; }
 
function openAddMonthModal() {
  if(!isAdminActive()) return;
  document.getElementById('addMonthError').classList.add('hidden');
  const ysel=document.getElementById('newMonthYear'); ysel.innerHTML='';
  for(let y=2026;y<=2030;y++){ const o=document.createElement('option'); o.value=y; o.textContent=y; ysel.appendChild(o); } ysel.value=new Date().getFullYear();
  document.getElementById('addMonthModal').classList.remove('hidden');
}
function closeAddMonthModal() { document.getElementById('addMonthModal').classList.add('hidden'); }
 
let _confirmOk=null,_confirmCancel=null;
function openConfirmModal(title,msg,onOk,onCancel) {
  document.getElementById('confirmTitle').textContent=title;
  document.getElementById('confirmMessage').textContent=msg;
  _confirmOk=onOk; _confirmCancel=onCancel;
  document.getElementById('confirmModal').classList.remove('hidden');
  document.getElementById('confirmOkBtn').onclick=()=>{
    document.getElementById('confirmModal').classList.add('hidden');
    const cb=_confirmOk; _confirmOk=null; _confirmCancel=null;
    if(cb) cb();
  };
}
function closeConfirmModal() {
  document.getElementById('confirmModal').classList.add('hidden');
  const cb=_confirmCancel; _confirmOk=null; _confirmCancel=null;
  if(cb) cb();
}
 
document.querySelectorAll('.modal-overlay').forEach(overlay=>{
  overlay.addEventListener('click',e=>{
    if(e.target===overlay && overlay.id !== 'confirmModal') overlay.classList.add('hidden');
  });
});
 
// ───────────────────────────────────────────────────────
// DARK MODE
// ───────────────────────────────────────────────────────
function initTheme() {
  const saved=localStorage.getItem('tass_theme')||'light';
  document.body.className=saved;
  document.getElementById('themeToggle').textContent=saved==='dark'?'☀️':'🌙';
}
document.getElementById('themeToggle').addEventListener('click',()=>{
  const next=document.body.classList.contains('dark')?'light':'dark';
  document.body.className=next; localStorage.setItem('tass_theme',next);
  document.getElementById('themeToggle').textContent=next==='dark'?'☀️':'🌙';
  renderCharts();
});
 
async function downloadPDF() {
  const btn = document.querySelector('button[onclick="downloadPDF()"]');
  if (btn) { btn.textContent = '⏳ Generating…'; btn.disabled = true; }
 
  try {
    const { jsPDF } = window.jspdf;
 
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();   // 210
    const pageH = pdf.internal.pageSize.getHeight();  // 297
    const ml = 10, mr = 10, mt = 10;
    const cW = pageW - ml - mr;                       // ~190mm
    let y = mt;
 
    // ── helpers ──────────────────────────────────────────
    function hexToRgb(hex) {
      return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
    }
    function setFill(hex) { pdf.setFillColor(...hexToRgb(hex)); }
    function setDraw(hex) { pdf.setDrawColor(...hexToRgb(hex)); }
    function setTxt(hex)  { pdf.setTextColor(...hexToRgb(hex)); }
 
    function checkPage(needed) {
      if (y + needed > pageH - 12) { pdf.addPage(); y = mt; }
    }
    function fillRect(x, iy, w, h, fillHex) {
      setFill(fillHex); pdf.rect(x, iy, w, h, 'F');
    }
    function strokeRect(x, iy, w, h, strokeHex, lw=0.1) {
      setDraw(strokeHex); pdf.setLineWidth(lw); pdf.rect(x, iy, w, h, 'S');
    }
    function txt(str, x, iy, opts={}) {
      setTxt(opts.color || '#0f172a');
      pdf.setFontSize(opts.size || 9);
      pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      pdf.text(String(str), x, iy, { align: opts.align || 'left', baseline: 'top' });
    }
 
    // Draw tick mark inside a box at (bx,by) with dimensions (bw x bh)
    function drawTick(bx, by, bw, bh, color) {
      pdf.setDrawColor(...hexToRgb(color));
      pdf.setLineWidth(bw * 0.14);
      // short left leg down-right
      const x0 = bx + bw * 0.18, y0 = by + bh * 0.52;
      const x1 = bx + bw * 0.40, y1 = by + bh * 0.75;
      // long right leg up-right
      const x2 = bx + bw * 0.82, y2 = by + bh * 0.22;
      pdf.line(x0, y0, x1, y1);
      pdf.line(x1, y1, x2, y2);
    }
 
    // ── HEADER BANNER (compact: single row) ──────────────
    const hdrH = 12;
    fillRect(0, 0, pageW, hdrH, '#1e3a5f');
    setTxt('#ffffff');
    pdf.setFontSize(11); pdf.setFont('helvetica','bold');
    pdf.text('TASS Alumni Contribution Tracker', ml, 3.5, { baseline:'top' });
    pdf.setFontSize(6.5); pdf.setFont('helvetica','normal');
    const now = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
    pdf.text('Generated: ' + now, pageW - mr, 4.5, { align:'right', baseline:'top' });
    y = hdrH + 2;
 
    // ── PAYMENT INFO BAR (single line) ───────────────────
    fillRect(ml, y, cW, 6, '#0f2d55');
    setTxt('#7dd3fc');
    pdf.setFontSize(6); pdf.setFont('helvetica','bold');
    pdf.text('Pay via: Leah Chibwana  |  Airtel: 0990 557 558  |  TNM: 0888 122 690  |  National Bank: 1011811527', ml+3, y+1.5, { baseline:'top' });
    y += 8;
 
    // ── DASHBOARD CARDS (1 row of 6, compact) ────────────
    const mk = currentMonth();
    const s = getMonthStats(mk);
    const overall = getOverallStats();
    const pct = Math.round((s.paid / s.total) * 100);
 
    const cards = [
      { label:'Total Members',                 value:String(s.total),                                   sub:'Active members',                                  color:'#2563eb' },
      { label:`Paid (${monthLabel(mk)})`,      value:String(s.paid),                                    sub:`${pct}% of members`,                              color:'#16a34a' },
      { label:`Unpaid (${monthLabel(mk)})`,    value:String(s.unpaid),                                  sub:`MK ${s.outstanding.toLocaleString()} outstanding`, color:'#dc2626' },
      { label:`Collected (${monthLabel(mk)})`, value:`MK ${s.received.toLocaleString()}`,               sub:`of MK ${s.expected.toLocaleString()} expected`,   color:'#16a34a' },
      { label:'Total Collected',               value:`MK ${(overall.totalReceived/1000).toFixed(1)}k`,  sub:'past & current months',                           color:'#2563eb' },
      { label:'Total Outstanding',             value:`MK ${(overall.totalOutstanding/1000).toFixed(1)}k`, sub:'past & current months',                         color:'#d97706' },
    ];
 
    const ncols = 6, gap = 2;
    const cardW = (cW - gap*(ncols-1)) / ncols;
    const cardH = 16;
    cards.forEach((c, idx) => {
      const cx = ml + idx * (cardW + gap);
      fillRect(cx, y, cardW, cardH, '#ffffff');
      strokeRect(cx, y, cardW, cardH, '#e2e8f0');
      txt(c.label.toUpperCase(), cx+2, y+1.5,  { size:4.8, color:'#64748b', bold:true });
      txt(c.value,               cx+2, y+5.5,  { size:9,   color:c.color,   bold:true });
      txt(c.sub,                 cx+2, y+12.5, { size:4.5, color:'#64748b' });
    });
    y += cardH + 4;
 
    // ── MEMBER CONTRIBUTIONS TABLE ───────────────────────
    txt('MEMBER CONTRIBUTIONS', ml, y, { size:7.5, bold:true, color:'#1e3a5f' });
    y += 4;
 
    const months6 = state.months.slice(0,6);
    const tk = todayKey();
    const pastMonthCount = state.months.filter(m => m <= tk).length;
 
    // Fixed widths first, then divide remainder among month columns
    const colNum   = 8;
    const colNameW = 52;
    const colPaid  = 18;
    const colMo    = (cW - colNum - colNameW - colPaid) / months6.length;
 
    const thH = 6;
    const rowH = 5.8;
 
    // Header
    checkPage(thH + rowH * 3);
    fillRect(ml, y, cW, thH, '#1e3a5f');
    let cx = ml;
    const hdrCols = [['#', colNum, 'left'], ['MEMBER', colNameW, 'left'],
                     ...months6.map(m => [monthLabel(m).toUpperCase(), colMo, 'center']),
                     ['PAID', colPaid, 'center']];
    hdrCols.forEach(([lbl, w, align]) => {
      txt(lbl, align==='center' ? cx+w/2 : cx+2, y+1.2, { size:5.5, color:'#ffffff', bold:true, align });
      cx += w;
    });
    y += thH;
 
    // Rows
    state.members.forEach((name, i) => {
      checkPage(rowH + 0.5);
      const totalPaid    = state.months.filter(m => state.payments[i] && state.payments[i][m] && m <= tk).length;
      const isCurrentPaid = state.payments[i] && state.payments[i][mk];
      const rowBg = isCurrentPaid ? '#f0fdf4' : '#fff5f5';
 
      fillRect(ml, y, cW, rowH, rowBg);
      // subtle row border
      setDraw('#e2e8f0'); pdf.setLineWidth(0.08); pdf.line(ml, y+rowH, ml+cW, y+rowH);
 
      let rx = ml;
      // #
      txt(String(i+1), rx+1.5, y+1.2, { size:6.5, color:'#94a3b8' }); rx += colNum;
      // Name — clip to fit column width
      const maxNameW = colNameW - 3;
      let displayName = name;
      pdf.setFontSize(7); pdf.setFont('helvetica','bold');
      while (displayName.length > 1 && pdf.getStringUnitWidth(displayName) * 7 / pdf.internal.scaleFactor > maxNameW) {
        displayName = displayName.slice(0, -1);
      }
      if (displayName !== name) displayName = displayName.slice(0,-1) + '…';
      txt(displayName, rx+1.5, y+1.2, { size:7, bold:true, color:'#0f172a' }); rx += colNameW;
      // Month indicators
      months6.forEach(m => {
        const paid = state.payments[i] && state.payments[i][m];
        const bSize = 4.2;
        const bx = rx + colMo/2 - bSize/2;
        const by = y + rowH/2 - bSize/2;
        if (paid) {
          setFill('#16a34a'); pdf.roundedRect(bx, by, bSize, bSize, 0.8, 0.8, 'F');
          drawTick(bx, by, bSize, bSize, '#ffffff');
        } else {
          setFill('#fee2e2'); setDraw('#fca5a5'); pdf.setLineWidth(0.15);
          pdf.roundedRect(bx, by, bSize, bSize, 0.8, 0.8, 'FD');
        }
        rx += colMo;
      });
      // PAID count — denominator = past months only, not all future months
      const paidStr = String(totalPaid);
      const denomStr = `/${pastMonthCount}`;
      const midX = rx + colPaid/2;
      const paidW = pdf.getStringUnitWidth(paidStr) * 7.5 / pdf.internal.scaleFactor;
      txt(paidStr,  midX - paidW/2 - 1, y+1.2, { size:7.5, bold:true,  color:'#0f172a' });
      txt(denomStr, midX - paidW/2 - 1 + paidW + 0.3, y+1.6, { size:5.5, color:'#94a3b8' });
      y += rowH;
    });
    y += 5;
 
    // ── MONTHLY SUMMARY TABLE ────────────────────────────
    checkPage(thH + rowH * 3 + 6);
    txt('MONTHLY SUMMARY', ml, y, { size:7.5, bold:true, color:'#1e3a5f' });
    y += 4;
 
    const smCols = [
      { label:'MONTH',       w: cW*0.28, align:'left'  },
      { label:'EXPECTED',    w: cW*0.18, align:'right' },
      { label:'RECEIVED',    w: cW*0.18, align:'right' },
      { label:'OUTSTANDING', w: cW*0.20, align:'right' },
      { label:'% COLLECTED', w: cW*0.16, align:'right' },
    ];
 
    fillRect(ml, y, cW, thH, '#1e3a5f');
    let scx = ml;
    smCols.forEach(c => {
      txt(c.label, c.align==='right' ? scx+c.w-2 : scx+2, y+1.2, { size:5.5, color:'#ffffff', bold:true, align:c.align });
      scx += c.w;
    });
    y += thH;
 
    state.months.forEach(m => {
      checkPage(rowH + 0.5);
      const st = getMonthStats(m);
      const p  = Math.round((st.received / st.expected) * 100);
      const isFuture = m > tk;
      const rowBg2 = isFuture ? '#f8fafc' : '#ffffff';
      fillRect(ml, y, cW, rowH, rowBg2);
      setDraw('#e2e8f0'); pdf.setLineWidth(0.08); pdf.line(ml, y+rowH, ml+cW, y+rowH);
 
      const pctColor  = p>=80?'#16a34a':p>=40?'#d97706':'#dc2626';
      const muteColor = '#94a3b8';
      let sx = ml;
      smCols.forEach((c, ci) => {
        let val, col;
        if(ci===0){ val = monthLabelFull(m)+(isFuture?' (upcoming)':''); col = isFuture?muteColor:'#0f172a'; }
        else if(ci===1){ val = `MK ${st.expected.toLocaleString()}`;    col = isFuture?muteColor:'#0f172a'; }
        else if(ci===2){ val = `MK ${st.received.toLocaleString()}`;    col = isFuture?muteColor:'#16a34a'; }
        else if(ci===3){ val = `MK ${st.outstanding.toLocaleString()}`; col = isFuture?muteColor:'#dc2626'; }
        else           { val = `${p}%`;                                  col = isFuture?muteColor:pctColor;  }
        txt(val, c.align==='right' ? sx+c.w-2 : sx+2, y+1.2, { size:6, color:col, bold:ci===4&&!isFuture, align:c.align });
        sx += c.w;
      });
      y += rowH;
    });
 
    // ── FOOTER on every page ──────────────────────────────
    const totalPages = pdf.internal.getNumberOfPages();
    for(let pg=1; pg<=totalPages; pg++){
      pdf.setPage(pg);
      setTxt('#94a3b8'); pdf.setFontSize(5.5); pdf.setFont('helvetica','normal');
      pdf.text(`TASS Alumni Contribution Tracker  |  Page ${pg} of ${totalPages}`, pageW/2, pageH-4, { align:'center', baseline:'top' });
    }
 
    pdf.save(`TASS_Contributions_${new Date().toISOString().slice(0,10)}.pdf`);
 
  } catch(err) {
    console.error('PDF generation failed:', err);
    alert('PDF generation failed. Please try again.');
    window.print();
  } finally {
    if (btn) { btn.textContent = '📄 PDF'; btn.disabled = false; }
  }
}
 
// ───────────────────────────────────────────────────────
// INIT
// ───────────────────────────────────────────────────────
async function init() { initTheme(); loadState(); await initAuth(); render(); }
init();