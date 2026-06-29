// ── Firebase Setup ──────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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

// ── ✏️ EDITABLE: Friend names shown in the login dropdown ────────
// Add, remove, or rename entries here. Order determines dropdown order.
const FRIEND_NAMES = [
  "I played county minor",
  "Connor Long Schlong Sommers",
  "Tall Angry Ginge",
  "Barry man shuffle",
  "Waste of 6 foot",
  "Harry hands up a dogs arse",
  "Dylan O fannyFart",
  "Runo hide your TechGraph box Ayovoro"
];

// ── ✏️ EDITABLE: Unavailability reason categories ────────────────
// These appear as tap-to-select buttons when marking a day unavailable.
// Add, remove, or rename entries here. Keep them short (1-2 words).
const UNAVAIL_REASONS = [
  "Work",
  "Holiday",
  "Sport",
  "Gay"
];

// ── Date Range ──────────────────────────────────────────────────
// Last 2 weeks of July: July 18–31
// First 2 weeks of August: Aug 1–14
function buildDateRange() {
  const dates = [];
  for (let d = 18; d <= 31; d++) dates.push(new Date(2026, 6, d)); // July (month index 6)
  for (let d = 1;  d <= 14; d++) dates.push(new Date(2026, 7, d)); // August (month index 7)
  return dates;
}

const ALL_DATES = buildDateRange();
const WEEKDAYS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS    = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'];

// Produces a sortable string key for each date, e.g. "2026-07-18"
function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

// Returns "1st", "2nd", "3rd", "4th" etc.
function ordinal(n) {
  const s = ['th','st','nd','rd'];
  return n + (s[(n % 10 > 3 || Math.floor(n/10) === 1) ? 0 : n % 10] || 'th');
}

// ── App State ───────────────────────────────────────────────────
let currentUser  = null;  // The selected name string, e.g. "Oran"
let allData      = {};    // Live mirror of Firebase: { "2026-07-18": { "Oran": { available, reason } } }
let modalDate    = null;  // The date currently open in the modal
let modalAction  = null;  // "mark-unavailable" | "mark-available"
let unsubscribe  = null;  // Firebase onValue cleanup function
let selectedReason = null; // Currently highlighted reason button in modal

// ── Build Login Dropdown ─────────────────────────────────────────
// Populates the <select> with the names from FRIEND_NAMES above
function buildNameDropdown() {
  const select = document.getElementById('name-select');
  select.innerHTML = '<option value="">— Select your name —</option>';
  FRIEND_NAMES.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

// ── Login ───────────────────────────────────────────────────────
window.handleLogin = function() {
  const select = document.getElementById('name-select');
  const name   = select.value;
  if (!name) { select.focus(); return; }

  currentUser = name;
  sessionStorage.setItem('awf_user', name);
  document.getElementById('header-name').textContent = name;
  showPage('calendar');
  subscribeToData();
};

// Allow tapping "Go" on mobile keyboards
document.getElementById('name-select').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});

window.logout = function() {
  currentUser = null;
  sessionStorage.removeItem('awf_user');
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  document.getElementById('name-select').value = '';
  showPage('login');
};

// ── Page Navigation ─────────────────────────────────────────────
window.showPage = function(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const map = { login: 'page-login', calendar: 'page-calendar', group: 'page-group' };
  document.getElementById(map[page]).classList.add('active');
  // Re-render the group view each time it's opened so it's always fresh
  if (page === 'group') renderGroupView();
};

// ── Firebase: Live Sync ──────────────────────────────────────────
// onValue fires immediately with current data, then again on every change
function subscribeToData() {
  const dbRef = ref(db, 'availability');
  unsubscribe = onValue(dbRef, snapshot => {
    allData = snapshot.val() || {};
    renderCalendar();
    ensureUserRegistered(); // write defaults for any missing dates
  }, err => console.error('Firebase error:', err));
}

// Writes { available: true, reason: '' } for every date this user hasn't touched yet
async function ensureUserRegistered() {
  if (!currentUser) return;
  for (const date of ALL_DATES) {
    const key = dateKey(date);
    if (!allData[key]?.[currentUser]) {
      await set(ref(db, `availability/${key}/${currentUser}`), { available: true, reason: '' });
    }
  }
}

// ── Render: Personal Calendar ────────────────────────────────────
function renderCalendar() {
  renderGrid('july-grid',   ALL_DATES.filter(d => d.getMonth() === 6));
  renderGrid('august-grid', ALL_DATES.filter(d => d.getMonth() === 7));
}

function renderGrid(containerId, dates) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  for (const date of dates) {
    const key         = dateKey(date);
    const dayData     = allData[key] || {};
    const myStatus    = dayData[currentUser];
    const isAvailable = !myStatus || myStatus.available;
    const reason      = myStatus?.reason || '';

    // Count how many confirmed-logged-in people are available this day
    const people         = Object.values(dayData);
    const availableCount = people.filter(p => p.available).length;
    const totalConfirmed = people.length;

    const card = document.createElement('div');
    card.className = `day-card ${isAvailable ? 'available' : 'unavailable'}`;
    card.onclick   = () => openModal(date, isAvailable);

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

// ── Modal: Mark Available / Unavailable ──────────────────────────
function openModal(date, currentlyAvailable) {
  modalDate   = date;
  modalAction = currentlyAvailable ? 'mark-unavailable' : 'mark-available';
  selectedReason = null;

  const day = date.getDate();
  document.getElementById('modal-title').textContent =
    `${WEEKDAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${ordinal(day)}`;

  const confirmBtn      = document.getElementById('modal-confirm-btn');
  const unavailSection  = document.getElementById('modal-unavailable-section');
  const statusText      = document.getElementById('modal-status-text');

  if (modalAction === 'mark-unavailable') {
    statusText.textContent        = "You're available. Mark yourself unavailable?";
    unavailSection.style.display  = 'block';
    confirmBtn.textContent        = "Mark unavailable";
    confirmBtn.className          = '';
    buildReasonButtons();         // render the category buttons
  } else {
    statusText.textContent        = "You're unavailable. Mark yourself free again?";
    unavailSection.style.display  = 'none';
    confirmBtn.textContent        = "Mark available";
    confirmBtn.className          = 'marking-available';
  }

  document.getElementById('modal-overlay').classList.remove('hidden');
}

// Builds the reason category buttons from the UNAVAIL_REASONS list above
function buildReasonButtons() {
  const container = document.getElementById('reason-buttons');
  container.innerHTML = '';
  UNAVAIL_REASONS.forEach(reason => {
    const btn = document.createElement('button');
    btn.className   = 'reason-btn';
    btn.textContent = reason;
    btn.onclick     = () => selectReason(reason, btn);
    container.appendChild(btn);
  });
}

// Highlights the tapped reason button and stores the selection
function selectReason(reason, btnEl) {
  document.querySelectorAll('.reason-btn').forEach(b => b.classList.remove('selected'));
  btnEl.classList.add('selected');
  selectedReason = reason;
}

window.closeModal = function(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModalDirect();
};

window.closeModalDirect = function() {
  document.getElementById('modal-overlay').classList.add('hidden');
  modalDate = null;
  modalAction = null;
  selectedReason = null;
};

window.confirmModal = async function() {
  if (!modalDate || !currentUser) return;
  const key         = dateKey(modalDate);
  const isAvailable = modalAction === 'mark-available';
  // Use the selected category button, or fall back to empty string if none chosen
  const reason      = isAvailable ? '' : (selectedReason || '');
  await set(ref(db, `availability/${key}/${currentUser}`), { available: isAvailable, reason });
  closeModalDirect();
};

// ── Render: Group Overview ───────────────────────────────────────
function renderGroupView() {
  const container = document.getElementById('group-grid');
  container.innerHTML = '';
  let lastMonth = null;

  for (const date of ALL_DATES) {
    const key      = dateKey(date);
    const dayData  = allData[key] || {};
    const people   = Object.entries(dayData);

    const availableCount = people.filter(([, p]) => p.available).length;
    const totalConfirmed = people.length;

    // Month separator header
    const month = date.getMonth();
    if (month !== lastMonth) {
      const header = document.createElement('div');
      header.className   = 'group-month-header';
      header.textContent = `${MONTHS[month]} 2026`;
      container.appendChild(header);
      lastMonth = month;
    }

    const row    = document.createElement('div');
    row.className = 'group-row';

    // Colour-code the count: green ≥70%, amber ≥40%, red <40%
    const ratio      = totalConfirmed > 0 ? availableCount / totalConfirmed : 0;
    const countClass = ratio >= 0.7 ? 'high' : ratio >= 0.4 ? 'mid' : 'low';

    const day = date.getDate();
    let chipsHtml = people.length === 0
      ? `<span class="no-data">No one logged in yet</span>`
      : people
          .sort((a, b) => (b[1].available ? 1 : 0) - (a[1].available ? 1 : 0)) // free first
          .map(([name, status]) => status.available
            ? `<span class="person-chip free">${name}</span>`
            : `<span class="person-chip busy">${name}${status.reason ? ': ' + status.reason : ''}</span>`)
          .join('');

    row.innerHTML = `
      <div class="group-row-date">
        <span class="g-weekday">${WEEKDAYS[date.getDay()]}</span>
        <span class="g-date">${ordinal(day)} ${MONTHS[month].slice(0,3)}</span>
      </div>
      <div class="group-row-count ${countClass}">${availableCount}/${totalConfirmed}</div>
      <div class="group-row-people">${chipsHtml}</div>
    `;
    container.appendChild(row);
  }
}

// ── Init ─────────────────────────────────────────────────────────
buildNameDropdown();

// If the user already selected a name this session, skip the login page
const savedUser = sessionStorage.getItem('awf_user');
if (savedUser && FRIEND_NAMES.includes(savedUser)) {
  currentUser = savedUser;
  document.getElementById('header-name').textContent = savedUser;
  showPage('calendar');
  subscribeToData();
}