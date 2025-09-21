/* Simple SPA + offline Smart Study Planner
   Data structures stored in localStorage:
   - tasks: [{id,subject,title,deadline,priority,notes,createdAt,done,pomodorosCompleted}]
   - sessions: [{id,taskId,start,stop,duration}]
   - settings: {focusMinutes,breakMinutes,theme,firstDay,reminders}
*/

const TASKS_KEY = 'ssp_tasks_v1';
const SESSIONS_KEY = 'ssp_sessions_v1';
const SETTINGS_KEY = 'ssp_settings_v1';

// helpers
function qs(sel, root=document) { return root.querySelector(sel); }
function qsa(sel, root=document) { return Array.from(root.querySelectorAll(sel)); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

// load/save
function loadJSON(key, fallback){ try{ const r=localStorage.getItem(key); return r?JSON.parse(r):fallback; } catch(e){return fallback;} }
function saveJSON(key,obj){ localStorage.setItem(key,JSON.stringify(obj)); }

let tasks = loadJSON(TASKS_KEY, []);
let sessions = loadJSON(SESSIONS_KEY, []);
let settings = loadJSON(SETTINGS_KEY, { focusMinutes:25, breakMinutes:5, theme:'dark', firstDay:0, reminders:false });

// SPA nav
const navBtns = qsa('.nav-btn');
navBtns.forEach(b=>b.addEventListener('click', ()=> showView(b.dataset.view)));
function showView(view){ qsa('.view').forEach(v=>v.classList.add('hidden')); const el = qs('#view-'+view); if(el) el.classList.remove('hidden'); history.replaceState({}, '', '#'+view); }
// show default from hash or dashboard
const initial = location.hash ? location.hash.replace('#','') : 'dashboard';
showView(initial);

// Planner elements
const form = qs('#taskForm');
const subjectIn = qs('#subject');
const titleIn = qs('#title');
const deadlineIn = qs('#deadline');
const priorityIn = qs('#priority');
const notesIn = qs('#notes');
const addBtn = qs('#addBtn');
const clearAllBtn = qs('#clearAllBtn');
const taskList = qs('#taskList');

function saveAll(){ saveJSON(TASKS_KEY,tasks); saveJSON(SESSIONS_KEY,sessions); saveJSON(SETTINGS_KEY,settings); }

function renderTasks(){
  taskList.innerHTML = '';
  tasks.forEach(t => {
    const li = document.createElement('li');
    li.className = 'task-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = t.done;
    checkbox.addEventListener('change', () => toggleTaskDone(t.id));
    li.prepend(checkbox);


    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';

    // title line — show strike-through when done
    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = t.title + ' — ' + t.subject;
    if (t.done) {
      title.style.textDecoration = 'line-through';
      title.style.opacity = '0.7';
    }

    const sub = document.createElement('div');
    sub.className = 'task-sub';
    sub.textContent = (t.deadline ? ('Due: ' + t.deadline + ' • ') : '') + 'Pomodoros: ' + (t.pomodorosCompleted || 0);

    left.appendChild(title);
    left.appendChild(sub);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '8px';
    right.style.alignItems = 'center';

    // Complete / undone toggle button
    const completeBtn = document.createElement('button');
    completeBtn.className = 'small-btn';
    completeBtn.textContent = t.done ? '✓ Done' : 'Mark Done';
    completeBtn.addEventListener('click', () => toggleTaskDone(t.id));

    // Edit button
    const edit = document.createElement('button');
    edit.className = 'small-btn';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => populateFormForEdit(t.id));

    // Delete button
    const del=document.createElement('button');
del.className='small-btn';
del.textContent='Delete';
del.addEventListener('click', ()=>{ 
  if(confirm('Delete this task?')){
    tasks = tasks.filter(x=>x.id!==t.id);
    saveAll();
    renderTasks();
    refreshEverything();
    showToast(`Deleted task: "${t.title}"`, 'error');
  }
});

    // priority badge
    const badge = document.createElement('div');
    badge.className = 'badge ' + t.priority;
    badge.textContent = t.priority;

    right.appendChild(badge);
    right.appendChild(completeBtn);
    right.appendChild(edit);
    right.appendChild(del);

    li.appendChild(left);
    li.appendChild(right);
    taskList.appendChild(li);
  });
  refreshTaskSelects();
}
function toggleTaskDone(id){
  const t = tasks.find(x => x.id === id);
  if(!t) return;
  const wasDone = !!t.done;
  t.done = !t.done;
  // when task becomes done (false -> true), celebrate
  if(!wasDone && t.done){
    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });
    } catch(e) {
      // confetti lib may not be loaded — ignore
    }
  }
  saveAll();
  renderTasks();
  refreshEverything();
}


function populateFormForEdit(id){ const t=tasks.find(x=>x.id===id); if(!t) return; subjectIn.value=t.subject; titleIn.value=t.title; deadlineIn.value=t.deadline; priorityIn.value=t.priority; notesIn.value=t.notes; addBtn.textContent='Save'; form.dataset.editing=id; }

form.addEventListener('submit', e=>{ e.preventDefault(); const data={ subject:subjectIn.value.trim(), title:titleIn.value.trim(), deadline:deadlineIn.value||'', priority:priorityIn.value, notes:notesIn.value||'' }; if(!data.subject||!data.title){ alert('Add subject and title'); return; } if(form.dataset.editing){ const id=form.dataset.editing; tasks = tasks.map(t=> t.id===id? {...t,...data}:t); delete form.dataset.editing; addBtn.textContent='Add Task'; } else { const newT={ id:uid(), ...data, createdAt:new Date().toISOString(), done:false, pomodorosCompleted:0 }; tasks.unshift(newT); } saveAll(); renderTasks(); form.reset(); refreshTodayTasks(); refreshEverything(); });

clearAllBtn.addEventListener('click', ()=>{ if(!confirm('Clear all tasks?')) return; tasks=[]; saveAll(); renderTasks(); refreshEverything(); });

// Calendar: basic month grid
const calendarGrid = qs('#calendarGrid');
const calendarControls = qs('#calendarControls');
let calDate = new Date();
function renderCalendar(){
  calendarGrid.innerHTML = '';

  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const startDay = (start.getDay() - settings.firstDay + 7) % 7;
  const total = end.getDate();

  // blanks
  for (let i=0; i<startDay; i++){
    const blank = document.createElement('div');
    blank.className = 'day-cell';
    calendarGrid.appendChild(blank);
  }

  // actual days
  for (let d=1; d<=total; d++){
    const cell = document.createElement('div');
    cell.className = 'day-cell';

    const num = document.createElement('div');
    num.className = 'day-num';
    num.textContent = d;
    cell.appendChild(num);

    const dateObj = new Date(year, month, d);
    const dateStr = dateObj.toISOString().slice(0,10);
    cell.dataset.date = dateStr; // store date for modal
    // highlight today
const todayStr = new Date().toISOString().slice(0,10);
if (dateStr === todayStr) {
  cell.classList.add('today');
}


        const dayTasks = tasks.filter(t => t.deadline === dateStr);
    if (dayTasks.length){
      const dotsWrap = document.createElement('div');
      dotsWrap.className = 'day-dots';

      dayTasks.slice(0,3).forEach(t=>{
        const dot = document.createElement('span');
        dot.className = 'dot ' + (t.priority || 'medium'); // fallback
        dotsWrap.appendChild(dot);
      });

      if (dayTasks.length > 3) {
        const more = document.createElement('span');
        more.className = 'dot more';
        more.textContent = '+' + (dayTasks.length - 3);
        dotsWrap.appendChild(more);
      }

      cell.appendChild(dotsWrap);
    }

    // Add click event to open modal
    cell.addEventListener('click', () => openDayModal(dateStr));

    calendarGrid.appendChild(cell);
    // CLICK → open modal
    cell.addEventListener('click', ()=> openDayModal(dateStr));

    calendarGrid.appendChild(cell);
  }

  // controls
  calendarControls.innerHTML = '';
  const prev = document.createElement('button');
  prev.textContent = '<';
  prev.addEventListener('click', ()=>{ calDate.setMonth(calDate.getMonth()-1); renderCalendar(); });
  const next = document.createElement('button');
  next.textContent = '>';
  next.addEventListener('click', ()=>{ calDate.setMonth(calDate.getMonth()+1); renderCalendar(); });
  const title = document.createElement('span');
  title.textContent = calDate.toLocaleString(undefined, {month:'long', year:'numeric'});
  title.style.margin = '0 12px';
  calendarControls.appendChild(prev);
  calendarControls.appendChild(title);
  calendarControls.appendChild(next);
}

// Time Tracking
const ttTaskSelect = qs('#ttTaskSelect');
const ttStart = qs('#ttStart');
const ttStop = qs('#ttStop');
const sessionList = qs('#sessionList');
let activeSession = null;

function refreshTaskSelects(){ const selects = [ qs('#pomodoroTaskSelect'), ttTaskSelect ]; selects.forEach(s=>{ if(!s) return; const cur = s.value; s.innerHTML = '<option value=\"\">— none —</option>'; tasks.forEach(t=>{ const opt=document.createElement('option'); opt.value=t.id; opt.textContent = t.title + ' — ' + t.subject; s.appendChild(opt); }); s.value = cur || '' }); }

ttStart.addEventListener('click', ()=>{
  const taskId = ttTaskSelect.value || null;
  activeSession = { id:uid(), taskId, start: new Date().toISOString(), stop:null, duration:0 };
  ttStart.disabled = true; ttStop.disabled = false; sessions.unshift(activeSession); saveAll(); renderSessions();
});

ttStop.addEventListener('click', ()=>{
  if(!activeSession) return;
  activeSession.stop = new Date().toISOString();
  const dur = (new Date(activeSession.stop) - new Date(activeSession.start))/1000;
  activeSession.duration = Math.round(dur/60); // minutes
  saveAll(); renderSessions(); activeSession = null; ttStart.disabled=false; ttStop.disabled=true; refreshEverything();
});

function renderSessions(){
  sessionList.innerHTML = '';
  sessions.forEach(s => {
    const li = document.createElement('li');

    // info text
    const info = document.createElement('span');
    info.textContent = `${new Date(s.start).toLocaleString()} — ${s.duration||0} min ${
      s.taskId ? ('• ' + (tasks.find(t => t.id === s.taskId) || {title:'(task)'}).title) : ''
    }`;

    // delete button
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.className = 'small-btn';
    delBtn.style.marginLeft = '8px';
    delBtn.addEventListener('click', () => {
      if (confirm('Delete this session?')) {
        sessions = sessions.filter(x => x.id !== s.id);
        saveAll();
        renderSessions();
        refreshEverything();
      }
    });

    li.appendChild(info);
    li.appendChild(delBtn);
    sessionList.appendChild(li);
  });
}

// Pomodoro
const pomTaskSelect = qs('#pomodoroTaskSelect');
const timerDisplay = qs('#timerDisplay');
const startBtn = qs('#startBtn');
const pauseBtn = qs('#pauseBtn');
const resetBtn = qs('#resetBtn');
const focusMinutesInput = qs('#focusMinutes');
const breakMinutesInput = qs('#breakMinutes');
const pomStateLabel = qs('#pomState');
const pomAttachedLabel = qs('#pomAttached');

let pomTimer=null, pomRemaining=0, pomIsRunning=false, pomIsFocus=true, pomAttached=null;

function attachPomTo(id){ pomAttached = id || null; pomAttachedLabel.textContent = 'Attached: ' + (pomAttached? (tasks.find(t=>t.id===pomAttached)||{title:'?'}).title : 'none'); }

pomTaskSelect.addEventListener('change', e=> attachPomTo(e.target.value || null));
startBtn.addEventListener('click', ()=>{ saveSettingsFromInputs(); if(!pomIsRunning){ if(!pomRemaining) { pomIsFocus = true; pomRemaining = settings.focusMinutes*60*1000; pomStateLabel.textContent='State: Focus'; } pomTimer = setInterval(()=>{ pomTick(); }, 1000); pomIsRunning=true; startBtn.disabled=true; pauseBtn.disabled=false; } });
pauseBtn.addEventListener('click', ()=>{ if(pomTimer) clearInterval(pomTimer); pomTimer=null; pomIsRunning=false; pomStateLabel.textContent='State: Paused'; startBtn.disabled=false; pauseBtn.disabled=true; });
resetBtn.addEventListener('click', ()=>{ if(pomTimer) clearInterval(pomTimer); pomTimer=null; pomIsRunning=false; pomIsFocus=true; pomRemaining = settings.focusMinutes*60*1000; updatePomDisplay(); startBtn.disabled=false; pauseBtn.disabled=true; pomStateLabel.textContent='State: Ready'; });

function pomTick(){ pomRemaining -= 1000; if(pomRemaining<=0){ if(pomIsFocus){ if(pomAttached){ tasks = tasks.map(t=> t.id===pomAttached? {...t, pomodorosCompleted:(t.pomodorosCompleted||0)+1} : t); saveAll(); renderTasks(); } pomIsFocus=false; pomRemaining = settings.breakMinutes*60*1000; pomStateLabel.textContent='State: Break'; } else { pomIsFocus=true; pomRemaining = settings.focusMinutes*60*1000; pomStateLabel.textContent='State: Focus'; } playBell(); updatePomDisplay(); return; } updatePomDisplay(); }

function updatePomDisplay(){ timerDisplay.textContent = msToTime(pomRemaining || settings.focusMinutes*60*1000); }
function msToTime(ms){ const tot = Math.ceil(ms/1000); const m=Math.floor(tot/60).toString().padStart(2,'0'); const s=(tot%60).toString().padStart(2,'0'); return `${m}:${s}`; }
function playBell(){ try{ const ctx=new (window.AudioContext||window.webkitAudioContext)(); const o=ctx.createOscillator(); const g=ctx.createGain(); o.type='sine'; o.frequency.value=880; o.connect(g); g.connect(ctx.destination); o.start(); g.gain.setValueAtTime(0.001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime+0.01); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.4); o.stop(ctx.currentTime+0.45);}catch(e){} }

function saveSettingsFromInputs(){ settings.focusMinutes = Math.max(1, parseInt(focusMinutesInput.value)||25); settings.breakMinutes = Math.max(1, parseInt(breakMinutesInput.value)||5); saveAll(); }

// Analytics - simple weekly minutes chart drawn on canvas
const weeklyCanvas = qs('#weeklyChart');
function calcWeeklyMinutes(){ const dayMs = 24*60*60*1000; const now = new Date(); const days = []; for(let i=6;i>=0;i--){ const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()-i); const key = d.toISOString().slice(0,10); const total = sessions.filter(s=> s.start.slice(0,10)===key).reduce((acc,s)=> acc + (s.duration||0), 0); days.push({date:key, minutes:total}); } return days; }
function drawWeeklyChart(){ if(!weeklyCanvas) return; const data = calcWeeklyMinutes(); const ctx = weeklyCanvas.getContext('2d'); const w=weeklyCanvas.width; const h=weeklyCanvas.height; ctx.clearRect(0,0,w,h); const padding=30; const max = Math.max(30, ...data.map(d=>d.minutes)); const barW = (w-2*padding)/data.length - 10; data.forEach((d,i)=>{ const x = padding + i*(barW+10); const barH = (d.minutes/max)*(h-2*padding); ctx.fillStyle='rgba(30,79,255,0.8)'; ctx.fillRect(x, h-padding-barH, barW, barH); ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.font='12px Arial'; ctx.fillText(String(d.minutes)+'m', x, h-padding-barH-6); ctx.fillStyle='rgba(170,190,210,0.8)'; ctx.fillText(new Date(d.date).toLocaleDateString(undefined,{weekday:'short'}), x, h-6); }); }

// replace existing renderPomSummary with this
function renderPomSummary(){
  const ul = qs('#pomSummary');
  if(!ul) return;
  ul.innerHTML = '';

  // show tasks and their pomodoro counts with controls
  tasks.forEach(t => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.justifyContent = 'space-between';
    li.style.gap = '8px';
    li.style.padding = '6px 4px';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';

    const title = document.createElement('div');
    title.textContent = `${t.title} — ${t.subject}`;
    title.style.fontWeight = '600';

    const sub = document.createElement('div');
    sub.textContent = `Pomodoros: ${t.pomodorosCompleted||0}`;
    sub.style.fontSize = '13px';
    sub.style.opacity = '0.85';

    left.appendChild(title);
    left.appendChild(sub);

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '8px';
    controls.style.alignItems = 'center';

    const decBtn = document.createElement('button');
    decBtn.className = 'pom-btn dec';
    decBtn.textContent = '-1';
    decBtn.title = 'Remove one pomodoro';
    decBtn.addEventListener('click', () => decrementPomodoros(t.id));

    const resetBtn = document.createElement('button');
    resetBtn.className = 'pom-btn reset';
    resetBtn.textContent = 'Reset';
    resetBtn.title = 'Reset pomodoros to 0';
    resetBtn.addEventListener('click', () => {
      if(confirm(`Reset pomodoros for "${t.title}" to 0?`)) resetPomodoros(t.id);
    });

    controls.appendChild(decBtn);
    controls.appendChild(resetBtn);

    li.appendChild(left);
    li.appendChild(controls);
    ul.appendChild(li);
  });
}

// helper: decrement one pomodoro (min 0)
function decrementPomodoros(taskId){
  const t = tasks.find(x => x.id === taskId);
  if(!t) return;
  t.pomodorosCompleted = Math.max(0, (t.pomodorosCompleted||0) - 1);
  saveAll();
  renderPomSummary();
  renderTasks();
  refreshMiniStats();
  // optional subtle feedback
  try { confetti({ particleCount: 12, spread: 40, origin: { y: 0.9 } }); } catch(e){}
}

// helper: reset to zero
function resetPomodoros(taskId){
  const t = tasks.find(x => x.id === taskId);
  if(!t) return;
  t.pomodorosCompleted = 0;
  saveAll();
  renderPomSummary();
  renderTasks();
  refreshMiniStats();
  try { confetti({ particleCount: 18, spread: 60, origin: { y: 0.9 } }); } catch(e){}
}

// Export / Import
const exportBtn = qs('#exportBtn'); const importFile = qs('#importFile');
exportBtn.addEventListener('click', ()=>{ const payload = { tasks, sessions, settings }; const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'}); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download = 'ssp_backup_'+new Date().toISOString().slice(0,10)+'.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });
importFile.addEventListener('change', e=>{ const f = e.target.files[0]; if(!f) return; const reader = new FileReader(); reader.onload = ev=>{ try{ const data = JSON.parse(ev.target.result); if(data.tasks) tasks = data.tasks; if(data.sessions) sessions = data.sessions; if(data.settings) settings = data.settings; saveAll(); renderTasks(); renderSessions(); renderCalendar(); drawWeeklyChart(); renderPomSummary(); alert('Imported successfully'); }catch(err){ alert('Invalid file'); } }; reader.readAsText(f); });

// UI refresh helpers
function refreshTodayTasks(){ const today = new Date().toISOString().slice(0,10); const ul = qs('#todayTasks'); if(!ul) return; ul.innerHTML=''; tasks.filter(t=> t.deadline===today).forEach(t=>{ const li=document.createElement('li'); li.textContent = t.title + ' • ' + t.subject; ul.appendChild(li); }); }

function refreshMiniStats(){ const mini = qs('#miniStats'); if(!mini) return; const total = tasks.length; const pomos = tasks.reduce((a,b)=>a+(b.pomodorosCompleted||0),0); mini.innerHTML = `${total} tasks • ${pomos} pomodoros`; }

function refreshEverything(){ refreshTodayTasks(); renderTasks(); renderSessions(); renderCalendar(); drawWeeklyChart(); renderPomSummary(); refreshMiniStats(); }

// init
renderTasks(); renderSessions(); renderCalendar(); drawWeeklyChart(); renderPomSummary(); refreshTodayTasks(); refreshMiniStats(); refreshTaskSelects();

// apply settings theme
if(settings.theme==='light'){ document.body.classList.remove('dark-theme'); } else { document.body.classList.add('dark-theme'); }

// back-button friendly: listen to hashchange
window.addEventListener('hashchange', ()=>{ const view = location.hash.replace('#','') || 'dashboard'; showView(view); });

// initial quick-pomodoro note
qs('#quickPomodoro').textContent = 'Open Pomodoro tab to start focused sessions.';
// =======================
// Calendar Day Modal Logic
// =======================
const dayModal = qs('#dayModal');
const dayModalOverlay = qs('#dayModalOverlay');
const dayModalClose = qs('#dayModalClose');
const dayModalDateLabel = qs('#dayModalDate');
const dayTaskList = qs('#dayTaskList');
const dayNoTasks = qs('#dayNoTasks');
const dayQuickForm = qs('#dayQuickForm');
const daySubject = qs('#daySubject');
const dayTitle = qs('#dayTitle');
const dayPriority = qs('#dayPriority');
const dayNotes = qs('#dayNotes');
const dayAddBtn = qs('#dayAddBtn');
const dayCancelBtn = qs('#dayCancelBtn');
// Close modal when clicking overlay
dayModal.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    closeDayModal();
  }
});

let currentModalDate = null;

function openDayModal(dateStr) {
  currentModalDate = dateStr;
  dayModalDateLabel.textContent = dateStr;

  // Make modal visible (remove hidden), then trigger open state for animation
  dayModal.classList.remove('hidden');

  // small delay so transition can pick up from the removed-hidden state
  setTimeout(() => {
    dayModal.classList.add('open');
  }, 20);

  renderDayTasks(dateStr);

  // reset form fields
  daySubject.value = '';
  dayTitle.value = '';
  dayPriority.value = 'medium';
  dayNotes.value = '';

  // focus first input after animation starts
  setTimeout(() => {
    try { daySubject.focus(); } catch(e) {}
  }, 160);
}

function closeDayModal() {
  // remove open class to play closing animation
  dayModal.classList.remove('open');

  // after animation ends, hide the modal (matches CSS transition duration ~220ms)
  const hideDelay = 240;
  setTimeout(() => {
    dayModal.classList.add('hidden');
    currentModalDate = null;
  }, hideDelay);
}
// Close modal on ESC key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !dayModal.classList.contains('hidden')) {
    closeDayModal();
  }
});


function renderDayTasks(dateStr) {
  dayTaskList.innerHTML = '';
  const dayTasks = tasks.filter(t => t.deadline === dateStr);

  if (dayTasks.length === 0) {
    dayNoTasks.style.display = 'block';
  } else {
    dayNoTasks.style.display = 'none';
    dayTasks.forEach(t => {
      const li = document.createElement('li');
      
      // info span (click → edit in Planner)
      const info = document.createElement('span');
      info.textContent = `${t.title} — ${t.subject} (${t.priority})`;
      info.style.cursor = 'pointer';
      info.addEventListener('click', () => {
        showView('planner');
        populateFormForEdit(t.id);
        closeDayModal();
      });

      // delete button
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.className = 'small-btn';
      delBtn.style.marginLeft = '8px';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent triggering edit
        if (confirm('Delete this task?')) {
          tasks = tasks.filter(x => x.id !== t.id);
          saveAll();
          renderTasks();
          renderCalendar();
          renderDayTasks(dateStr);
          refreshEverything();
          showToast(`Deleted task: "${t.title}"`, 'error'); // ✅ toast here
        }
      });

      li.appendChild(info);
      li.appendChild(delBtn);
      dayTaskList.appendChild(li);
    });
  }
}


// event hooks
if (dayModalOverlay) dayModalOverlay.addEventListener('click', closeDayModal);
if (dayModalClose) dayModalClose.addEventListener('click', closeDayModal);
if (dayCancelBtn) dayCancelBtn.addEventListener('click', closeDayModal);

dayQuickForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!currentModalDate) return;

  const newTask = {
    id: uid(),
    subject: daySubject.value.trim(),
    title: dayTitle.value.trim(),
    deadline: currentModalDate,
    priority: dayPriority.value,
    notes: dayNotes.value.trim(),
    createdAt: new Date().toISOString(),
    done: false,
    pomodorosCompleted: 0
  };

  if (!newTask.subject || !newTask.title) {
    return alert('Please add subject and title.');
  }

  tasks.unshift(newTask);
  saveAll();
  renderTasks();
  renderCalendar();
  renderDayTasks(currentModalDate);

  // 🎉 celebrate when task is added
  confetti({
    particleCount: 60,
    spread: 70,
    origin: { y: 0.7 }
  });

  // little feedback
  dayAddBtn.textContent = 'Added ✓';
  setTimeout(() => { 
    dayAddBtn.textContent = 'Add task'; 
    closeDayModal(); 
  }, 800);
});


// allow ESC to close
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !dayModal.classList.contains('hidden')) {
    closeDayModal();
  }
});
// Toast helper
function showToast(message, type='success') {
  const container = qs('#toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// init
renderTasks();
renderSessions();
renderCalendar();
drawWeeklyChart();
renderPomSummary();
refreshTodayTasks();
refreshMiniStats();
refreshTaskSelects();

