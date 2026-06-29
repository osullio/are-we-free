// ── Firebase Setup ──────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCBM3W81BMv48w4kp2UE4DJzJbiLxkqziA",
  authDomain: "calender-app-ee04e.firebaseapp.com",
  databaseURL: "https://calender-app-ee04e-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "calender-app-ee04e",
  storageBucket: "calender-app-ee04e.firebasestorage.app",
  messagingSenderId: "81092946647",
  appId: "1:81092946647:web:c46f5769a61e70314a1e92"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ── Date Range ──────────────────────────────────────────────────
// Last 2 weeks of July: July 18–31
// First 2 weeks of August: Aug 1–14
function buildDateRange() {
  const dates = [];
  for (let d = 18; d <= 31; d++) dates.push(new Date(2026, 6, d)); // July (month 6)
  for (let d = 1; d <= 14; d++) dates.push(new Date(2026, 7, d));  // August (month 7)
  return dates;
}

const ALL_DATES = buildDateRange();

const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function formatDateTitle(date) {
  const day = date.getDate();
  const suffix = ['th','st','nd','rd'][(day % 10 > 3 || Math.floor(day/10) === 1) ? 0 : day % 10];
  return `${WEEKDAYS[date.getDay()]} ${day}${suffix}`;
}

// ── State ───────────────────────────────────────────────────────
let currentUser = null;       // first name string
let allData = {};             // { dateKey: { userName: { available: bool, reason: string } } }
let modalDate = null;
let modalAction = null;       // 'mark-unavailable' | 'mark-available'
let unsubscribe = null;

// ── Login ───────────────────────────────────────────────────────
window.handleLogin = function() {
  const input = document.getElementById('name-input');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }

  const formatted = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  currentUser = formatted;
  sessionStorage.setItem('awf_user', formatted);

  document.getElementById('header-name').textContent = formatted;
  showPage('calendar');
  subscribeToData();
};

document.getElementById('name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});

window.logout = function() {
  currentUser = null;
  sessionStorage.removeItem('awf_user');
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  document.getElementById('name-input').value = '';
  showPage('login');
};

// ── Pages ───────────────────────────────────────────────────────
window.showPage = function(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const map = { login: 'page-login', calendar: 'page-calendar', group: 'page-group' };
  document.getElementById(map[page]).classList.add('active');
  if (page === 'group') renderGroupView();
};

// ── Firebase Subscription ────────────────────────────────────────
function subscribeToData() {
  const dbRef = ref(db, 'availability');

  unsubscribe = onValue(dbRef, snapshot => {
    allData = snapshot.val() || {};
    renderCalendar();
    // register that this user has logged in for each date (default: available)
    ensureUserRegistered();
  }, error => {
    console.error('Firebase error:', error);
  });
}

async function ensureUserRegistered() {
  if (!currentUser) return;
  const updates = [];

  for (const date of ALL_DATES) {
    const key = dateKey(date);
    if (!allData[key] || !allData[key][currentUser]) {
      updates.push({ key, name: currentUser });
    }
  }

  for (const { key, name } of updates) {
    await set(ref(db, `availability/${key}/${name}`), { available: true, reason: '' });
  }
}

// ── Render Calendar ──────────────────────────────────────────────
function renderCalendar() {
  const julyDates = ALL_DATES.filter(d => d.getMonth() === 6);
  const augDates = ALL_DATES.filter(d => d.getMonth() === 7);

  renderGrid('july-grid', julyDates);
  renderGrid('august-grid', augDates);
}

function renderGrid(containerId, dates) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  for (const date of dates) {
    const key = dateKey(date);
    const dayData = allData[key] || {};
    const myStatus = dayData[currentUser];
    const isAvailable = !myStatus || myStatus.available;
    const reason = myStatus?.reason || '';

    // Count people confirmed available
    const people = Object.values(dayData);
    const availableCount = people.filter(p => p.available).length;
    const totalConfirmed = people.length;

    const card = document.createElement('div');
    card.className = `day-card ${isAvailable ? 'available' : 'unavailable'}`;
    card.onclick = () => openModal(date, isAvailable);

    card.innerHTML = `
      <span class="day-weekday">${WEEKDAYS[date.getDay()]}</span>
      <span class="day-date">${date.getDate()}</span>
      <span class="day-status-icon">${isAvailable ? '✓' : '✗'}</span>
      ${!isAvailable && reason ? `<span class="day-reason">${reason}</span>` : ''}
      <span class="day-count">${availableCount}/${totalConfirmed} free</span>
    `;

    container.appendChild(card);
  }
}

// ── Modal ────────────────────────────────────────────────────────
function openModal(date, currentlyAvailable) {
  modalDate = date;
  modalAction = currentlyAvailable ? 'mark-unavailable' : 'mark-available';

  const day = date.getDate();
  const suffix = ['th','st','nd','rd'][(day % 10 > 3 || Math.floor(day/10) === 1) ? 0 : day % 10];
  document.getElementById('modal-title').textContent = `${WEEKDAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${day}${suffix}`;

  const confirmBtn = document.getElementById('modal-confirm-btn');
  const unavailSection = document.getElementById('modal-unavailable-section');
  const statusText = document.getElementById('modal-status-text');

  if (modalAction === 'mark-unavailable') {
    statusText.textContent = "You're currently marked as available. Mark yourself unavailable?";
    unavailSection.style.display = 'block';
    confirmBtn.textContent = "Mark unavailable";
    confirmBtn.className = '';
    document.getElementById('modal-reason').value = '';
  } else {
    statusText.textContent = "You're currently unavailable. Mark yourself available again?";
    unavailSection.style.display = 'none';
    confirmBtn.textContent = "Mark available";
    confirmBtn.className = 'marking-available';
  }

  document.getElementById('modal-overlay').classList.remove('hidden');
}

window.closeModal = function(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModalDirect();
};

window.closeModalDirect = function() {
  document.getElementById('modal-overlay').classList.add('hidden');
  modalDate = null;
  modalAction = null;
};

window.confirmModal = async function() {
  if (!modalDate || !currentUser) return;

  const key = dateKey(modalDate);
  const isAvailable = modalAction === 'mark-available';
  const reason = isAvailable ? '' : (document.getElementById('modal-reason').value.trim());

  await set(ref(db, `availability/${key}/${currentUser}`), { available: isAvailable, reason });
  closeModalDirect();
};

// ── Group View ───────────────────────────────────────────────────
function renderGroupView() {
  const container = document.getElementById('group-grid');
  container.innerHTML = '';

  let lastMonth = null;

  for (const date of ALL_DATES) {
    const key = dateKey(date);
    const dayData = allData[key] || {};
    const people = Object.entries(dayData);

    const availableCount = people.filter(([, p]) => p.available).length;
    const totalConfirmed = people.length;

    // Month header
    const month = date.getMonth();
    if (month !== lastMonth) {
      const header = document.createElement('div');
      header.className = 'group-month-header';
      header.textContent = `${MONTHS[month]} 2026`;
      container.appendChild(header);
      lastMonth = month;
    }

    const row = document.createElement('div');
    row.className = 'group-row';

    const ratio = totalConfirmed > 0 ? availableCount / totalConfirmed : 0;
    const countClass = ratio >= 0.7 ? 'high' : ratio >= 0.4 ? 'mid' : 'low';

    const day = date.getDate();
    const suffix = ['th','st','nd','rd'][(day % 10 > 3 || Math.floor(day/10) === 1) ? 0 : day % 10];

    let chipsHtml = '';
    if (people.length === 0) {
      chipsHtml = `<span style="color:var(--text-muted);font-size:13px;">No one logged in yet</span>`;
    } else {
      // Sort: available first, then unavailable
      const sorted = people.sort((a, b) => (b[1].available ? 1 : 0) - (a[1].available ? 1 : 0));
      for (const [name, status] of sorted) {
        if (status.available) {
          chipsHtml += `<span class="person-chip free">${name}</span>`;
        } else {
          const label = status.reason ? `${name}: ${status.reason}` : name;
          chipsHtml += `<span class="person-chip busy">${label}</span>`;
        }
      }
    }

    row.innerHTML = `
      <div class="group-row-date">
        <span class="g-weekday">${WEEKDAYS[date.getDay()]}</span>
        <span class="g-date">${day}${suffix} ${MONTHS[month].slice(0,3)}</span>
      </div>
      <div class="group-row-count ${countClass}">${availableCount}/${totalConfirmed}</div>
      <div class="group-row-people">${chipsHtml}</div>
    `;

    container.appendChild(row);
  }
}

// ── Auto-login from session ──────────────────────────────────────
const savedUser = sessionStorage.getItem('awf_user');
if (savedUser) {
  currentUser = savedUser;
  document.getElementById('header-name').textContent = savedUser;
  showPage('calendar');
  subscribeToData();
}