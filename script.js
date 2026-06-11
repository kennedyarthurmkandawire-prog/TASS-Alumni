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

function downloadPDF() { window.print(); }

// ───────────────────────────────────────────────────────
// INIT
// ───────────────────────────────────────────────────────
async function init() { initTheme(); loadState(); await initAuth(); render(); }
init();