import { Storage } from '@apps-in-toss/web-framework';
import './styles.css';

const APP_KEY = 'work-schedule-pay-calculator-v1';
const SHIFT_META = {
  D: { label: '주간', color: '#3182F6', defaultHours: 8 },
  E: { label: '오후', color: '#8B5CF6', defaultHours: 8 },
  N: { label: '야간', color: '#1F2937', defaultHours: 8 },
  A: { label: '알바', color: '#F59E0B', defaultHours: 5 },
  O: { label: '휴무', color: '#E5E7EB', defaultHours: 0 },
};

const defaultState = {
  rate: 10500,
  month: new Date().getMonth(),
  year: new Date().getFullYear(),
  activeTab: 'today',
  pattern: [],
  patternStart: '',
  entries: {},
};

let state = structuredClone(defaultState);
let selectedDate = '';

async function loadState() {
  try {
    const saved = await Storage.getItem(APP_KEY);
    if (saved) state = { ...state, ...JSON.parse(saved) };
  } catch (_) {
    const saved = localStorage.getItem(APP_KEY);
    if (saved) state = { ...state, ...JSON.parse(saved) };
  }
}

async function saveState() {
  const value = JSON.stringify(state);
  try {
    await Storage.setItem(APP_KEY, value);
  } catch (_) {
    localStorage.setItem(APP_KEY, value);
  }
}

const pad = (value) => String(value).padStart(2, '0');
const keyFor = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;
const todayKey = () => {
  const today = new Date();
  return keyFor(today.getFullYear(), today.getMonth(), today.getDate());
};

function dateFromKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getPatternEntry(key) {
  if (!state.pattern.length || !state.patternStart) return null;
  const difference = Math.floor((dateFromKey(key) - dateFromKey(state.patternStart)) / 86400000);
  if (difference < 0) return null;
  const type = state.pattern[difference % state.pattern.length];
  return { type, hours: SHIFT_META[type].defaultHours, fromPattern: true };
}

function getEntry(key) {
  return state.entries[key] || getPatternEntry(key);
}

function getMonthSummary(year = state.year, month = state.month) {
  const days = new Date(year, month + 1, 0).getDate();
  let hours = 0;
  let shifts = 0;
  let nights = 0;
  for (let day = 1; day <= days; day += 1) {
    const entry = getEntry(keyFor(year, month, day));
    if (entry?.hours) {
      hours += Number(entry.hours);
      shifts += 1;
      if (entry.type === 'N') nights += 1;
    }
  }
  return { hours, shifts, nights, estimate: hours * Number(state.rate || 0) };
}

function currency(value) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function render() {
  const app = document.querySelector('#app');
  app.innerHTML = `
    <main class="app-shell">
      <header class="header">
        <div>
          <p class="eyebrow">내 일정과 예상 급여</p>
          <h1>근무표 급여계산</h1>
        </div>
        <button class="icon-button" data-action="settings" aria-label="설정">⚙️</button>
      </header>
      <section id="view"></section>
      <nav class="bottom-nav" aria-label="주 메뉴">
        ${navItem('today', '⌂', '오늘')}
        ${navItem('calendar', '▦', '근무표')}
        ${navItem('pay', '₩', '급여')}
      </nav>
    </main>
    <div id="modal-root"></div>
  `;
  renderView();
  bindEvents();
}

function navItem(tab, icon, label) {
  return `<button class="nav-item ${state.activeTab === tab ? 'active' : ''}" data-tab="${tab}"><span>${icon}</span>${label}</button>`;
}

function renderView() {
  const view = document.querySelector('#view');
  if (state.activeTab === 'today') view.innerHTML = renderToday();
  if (state.activeTab === 'calendar') view.innerHTML = renderCalendar();
  if (state.activeTab === 'pay') view.innerHTML = renderPay();
}

function renderToday() {
  const key = todayKey();
  const entry = getEntry(key);
  const summary = getMonthSummary();
  const today = new Date();
  const dayName = ['일', '월', '화', '수', '목', '금', '토'][today.getDay()];
  return `
    <section class="today-card">
      <div class="date-line">${today.getMonth() + 1}월 ${today.getDate()}일 (${dayName})</div>
      <div class="shift-mark ${entry ? entry.type : 'none'}">${entry ? SHIFT_META[entry.type].label : '등록된 근무 없음'}</div>
      <h2>${entry?.hours ? `${entry.hours}시간 근무 예정` : '오늘은 쉬어가도 좋아요'}</h2>
      <p>${entry?.hours ? `시급 ${currency(state.rate)} 기준 약 ${currency(entry.hours * state.rate)}` : '근무표에서 일정을 추가해 보세요.'}</p>
      <button class="primary-button" data-action="add-today">오늘 근무 ${entry ? '수정' : '등록'}</button>
    </section>
    <section class="section-block">
      <div class="section-title"><h2>이번 달 한눈에</h2><button class="text-button" data-tab="pay">자세히</button></div>
      <div class="summary-grid">
        ${summaryTile('총 근무', `${summary.hours}시간`)}
        ${summaryTile('근무일', `${summary.shifts}일`)}
        ${summaryTile('예상 급여', currency(summary.estimate), 'wide')}
      </div>
    </section>
    <section class="tip-card"><span>i</span><p>예상 급여는 입력한 시급과 근무시간으로 계산해요. 실제 지급액과 공제액은 계약 조건에 따라 달라질 수 있어요.</p></section>
  `;
}

function summaryTile(label, value, wide = '') {
  return `<article class="summary-tile ${wide}"><p>${label}</p><strong>${value}</strong></article>`;
}

function renderCalendar() {
  const firstDay = new Date(state.year, state.month, 1).getDay();
  const lastDate = new Date(state.year, state.month + 1, 0).getDate();
  const monthSummary = getMonthSummary();
  const cells = [];
  for (let index = 0; index < firstDay; index += 1) cells.push('<div class="calendar-cell empty"></div>');
  for (let day = 1; day <= lastDate; day += 1) {
    const key = keyFor(state.year, state.month, day);
    const entry = getEntry(key);
    const isToday = key === todayKey();
    cells.push(`
      <button class="calendar-cell ${isToday ? 'today' : ''}" data-date="${key}">
        <span class="day-number">${day}</span>
        ${entry ? `<span class="shift-chip ${entry.type}">${SHIFT_META[entry.type].label}</span><small>${entry.hours ? `${entry.hours}h` : '휴무'}</small>` : '<span class="shift-chip empty-chip">+</span>'}
      </button>`);
  }
  return `
    <section class="month-head">
      <button class="icon-button" data-action="prev-month" aria-label="이전 달">‹</button>
      <div><h2>${state.year}년 ${state.month + 1}월</h2><p>근무 ${monthSummary.shifts}일 · ${monthSummary.hours}시간</p></div>
      <button class="icon-button" data-action="next-month" aria-label="다음 달">›</button>
    </section>
    <section class="pattern-card">
      <div><h3>반복 교대 패턴</h3><p>${state.pattern.length ? `${state.pattern.map((type) => SHIFT_META[type].label).join(' · ')} 자동 적용 중` : '교대근무라면 한 번만 설정하세요.'}</p></div>
      <button class="outline-button" data-action="pattern">${state.pattern.length ? '수정' : '설정'}</button>
    </section>
    <section class="calendar-wrap">
      <div class="weekdays"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
      <div class="calendar-grid">${cells.join('')}</div>
    </section>
    <button class="floating-add" data-action="add-shift">＋ 근무 추가</button>
  `;
}

function renderPay() {
  const summary = getMonthSummary();
  const rate = Number(state.rate || 0);
  return `
    <section class="pay-hero">
      <p>${state.month + 1}월 예상 급여</p>
      <h2>${currency(summary.estimate)}</h2>
      <span>시급 ${currency(rate)} · 총 ${summary.hours}시간</span>
    </section>
    <section class="section-block">
      <div class="section-title"><h2>계산 기준</h2><button class="text-button" data-action="settings">수정</button></div>
      <div class="detail-list">
        <div><span>기본 시급</span><strong>${currency(rate)}</strong></div>
        <div><span>등록된 근무일</span><strong>${summary.shifts}일</strong></div>
        <div><span>야간 근무</span><strong>${summary.nights}일</strong></div>
      </div>
    </section>
    <section class="tip-card"><span>!</span><p>주휴수당, 야간·휴일 가산, 세금 공제는 근무 계약과 사업장 조건에 따라 달라요. 이 화면은 기본 시급 기준의 예상값입니다.</p></section>
  `;
}

function bindEvents() {
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
    state.activeTab = button.dataset.tab;
    render();
  }));
  document.querySelectorAll('[data-date]').forEach((button) => button.addEventListener('click', () => {
    selectedDate = button.dataset.date;
    openShiftModal(selectedDate);
  }));
  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => handleAction(button.dataset.action)));
}

function handleAction(action) {
  if (action === 'settings') openSettingsModal();
  if (action === 'add-today') openShiftModal(todayKey());
  if (action === 'add-shift') openShiftModal(keyFor(state.year, state.month, 1));
  if (action === 'pattern') openPatternModal();
  if (action === 'prev-month') { state.month -= 1; if (state.month < 0) { state.month = 11; state.year -= 1; } render(); }
  if (action === 'next-month') { state.month += 1; if (state.month > 11) { state.month = 0; state.year += 1; } render(); }
}

function openModal(content) {
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop"><section class="modal">${content}</section></div>`;
  document.querySelector('[data-action="close-modal"]').addEventListener('click', closeModal);
}

function closeModal() {
  document.querySelector('#modal-root').innerHTML = '';
}

function openShiftModal(key) {
  const entry = getEntry(key) || { type: 'A', hours: 5 };
  selectedDate = key;
  openModal(`
    <div class="modal-head"><div><p>${key.replaceAll('-', '.')}</p><h2>근무 등록</h2></div><button class="icon-button" data-action="close-modal">×</button></div>
    <div class="type-picker">${Object.entries(SHIFT_META).map(([type, meta]) => `<button class="type-option ${entry.type === type ? 'selected' : ''}" data-type="${type}"><span style="background:${meta.color}"></span>${meta.label}</button>`).join('')}</div>
    <label class="field-label">근무 시간<input id="hours-input" type="number" min="0" max="24" step="0.5" value="${entry.hours}" /></label>
    <div class="modal-actions"><button class="danger-button" id="delete-shift">삭제</button><button class="primary-button" id="save-shift">저장</button></div>
  `);
  let selectedType = entry.type;
  document.querySelectorAll('[data-type]').forEach((button) => button.addEventListener('click', () => {
    selectedType = button.dataset.type;
    document.querySelectorAll('[data-type]').forEach((item) => item.classList.toggle('selected', item === button));
    if (selectedType === 'O') document.querySelector('#hours-input').value = 0;
    else if (!Number(document.querySelector('#hours-input').value)) document.querySelector('#hours-input').value = SHIFT_META[selectedType].defaultHours;
  }));
  document.querySelector('#save-shift').addEventListener('click', async () => {
    state.entries[selectedDate] = { type: selectedType, hours: Number(document.querySelector('#hours-input').value || 0) };
    await saveState(); closeModal(); render();
  });
  document.querySelector('#delete-shift').addEventListener('click', async () => {
    delete state.entries[selectedDate]; await saveState(); closeModal(); render();
  });
}

function openSettingsModal() {
  openModal(`
    <div class="modal-head"><div><p>급여 계산 기준</p><h2>시급 설정</h2></div><button class="icon-button" data-action="close-modal">×</button></div>
    <label class="field-label">기본 시급<input id="rate-input" type="number" min="0" step="100" value="${state.rate}" inputmode="numeric" /></label>
    <p class="field-help">야간·휴일 수당, 주휴수당, 세금·공제는 초기 버전에 포함하지 않았어요.</p>
    <button class="primary-button" id="save-rate">저장</button>
  `);
  document.querySelector('#save-rate').addEventListener('click', async () => {
    state.rate = Number(document.querySelector('#rate-input').value || 0);
    await saveState(); closeModal(); render();
  });
}

function openPatternModal() {
  const templates = [
    { name: '2교대', sequence: ['D', 'D', 'O', 'O'] },
    { name: '3교대', sequence: ['D', 'E', 'N', 'O'] },
    { name: '주주야야휴휴', sequence: ['D', 'D', 'N', 'N', 'O', 'O'] },
  ];
  openModal(`
    <div class="modal-head"><div><p>한 번 설정하면 달력에 자동 반영돼요</p><h2>반복 교대 패턴</h2></div><button class="icon-button" data-action="close-modal">×</button></div>
    <label class="field-label">시작일<input id="pattern-start" type="date" value="${state.patternStart || todayKey()}" /></label>
    <div class="template-list">${templates.map((template, index) => `<button class="template-button" data-template="${index}"><strong>${template.name}</strong><span>${template.sequence.map((type) => SHIFT_META[type].label).join(' · ')}</span></button>`).join('')}</div>
    <p class="field-help">직접 수정 기능은 다음 버전에 추가할 수 있어요. 먼저 가장 가까운 패턴을 적용해 보세요.</p>
  `);
  document.querySelectorAll('[data-template]').forEach((button) => button.addEventListener('click', async () => {
    const template = templates[Number(button.dataset.template)];
    state.pattern = template.sequence;
    state.patternStart = document.querySelector('#pattern-start').value;
    await saveState(); closeModal(); render();
  }));
}

await loadState();
render();

