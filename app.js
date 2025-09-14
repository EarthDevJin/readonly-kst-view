let supabase = null;
let currentPage = 1;
let lastQuery = null; // 'runs' | 'daily' | 'ipdaily' | 'monthly'
let sortState = { runs: { col: 'occurred_at_kst', asc: false }, daily: { col: 'day_kst', asc: false }, monthly: { col: 'year', asc: false, col2: 'month', asc2: false } };

// 기본 Supabase URL/ANON KEY.
// ANON KEY는 공개키이므로 정적 웹에 포함해도 됩니다. 필요 시 교체하세요.
const DEFAULT_SPB_URL = 'https://shwvdqauqnvtodmismjv.supabase.co';
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNod3ZkcWF1cW52dG9kbWlzbWp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcxMzg2NzMsImV4cCI6MjA2MjcxNDY3M30.cF-PfTTY-IPnwqpCklmOIGSIFEgs9kLTQtH63Qm23xU';

function safeGetLocalStorage(key, fallback = '') {
  try { return window.localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
}

function safeSetLocalStorage(key, value) {
  try { window.localStorage.setItem(key, value); } catch (_) { /* ignore */ }
}

function el(id) { return document.getElementById(id); }

function on(id, evt, handler) {
  const node = el(id);
  if (node) node.addEventListener(evt, handler);
}

function setError(msg) { el('err').textContent = msg || ''; }
function setStatus(msg) { el('loginStatus').textContent = msg || ''; }

function showSpinner(show) {
  const s = el('spinner');
  if (!s) return;
  if (show) s.classList.remove('hidden'); else s.classList.add('hidden');
}

function setAriaSort(tableId, activeCol, asc) {
  const headers = el(tableId)?.querySelectorAll('thead th.sortable') || [];
  headers.forEach(th => {
    const col = th.getAttribute('data-col');
    if (col === activeCol) {
      th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
    } else {
      th.setAttribute('aria-sort', 'none');
    }
  });
}

function debugLog(label, value) {
  try { console.log(label, value); } catch (_) {}
}

function renderNoRows(tableId) {
  const tbody = el(tableId).querySelector('tbody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  const thCount = el(tableId).querySelectorAll('thead th').length || 1;
  tr.innerHTML = `<td colspan="${thCount}" style="color:#666;text-align:center">No rows</td>`;
  tbody.appendChild(tr);
}

function getPageSize() {
  const v = parseInt((el('pageSize')?.value || '200'), 10);
  return isNaN(v) ? 200 : Math.max(10, Math.min(500, v));
}

function getFilters() {
  const uname = (el('filterUsername')?.value || '').trim();
  const start = (el('filterStart')?.value || '').trim(); // YYYY-MM-DD (KST)
  const end = (el('filterEnd')?.value || '').trim();
  return { uname, start, end };
}

function updatePageInfo(rows) {
  const info = el('pageInfo');
  if (!info) return;
  info.textContent = `page ${currentPage}, rows ${rows}`;
}

async function ensureClient() {
  if (supabase) return supabase;
  const url = (safeGetLocalStorage('spbUrl', DEFAULT_SPB_URL) || '').trim();
  const key = (safeGetLocalStorage('anonKey', DEFAULT_ANON_KEY) || '').trim();
  if (!url || !key) throw new Error('관리자 설정이 필요합니다: Supabase URL/Anon Key 미설정');
  supabase = window.supabase.createClient(url, key);
  return supabase;
}

async function login() {
  try {
    setError('');
    const client = await ensureClient();
    const email = el('email').value.trim();
    const password = el('password').value;
    if (!email || !password) throw new Error('이메일/비밀번호를 입력하세요.');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // 이메일도 저장하여 다음 방문 시 자동 채움
    safeSetLocalStorage('email', email);
    setStatus('로그인 성공');
    // 로그인 성공 시 뷰어 표시
    const viewer = document.getElementById('viewer');
    const loginCard = document.getElementById('loginCard');
    if (viewer && loginCard) {
      viewer.classList.remove('hidden');
      loginCard.classList.add('hidden');
    }
  } catch (e) {
    const raw = (e && e.message) ? e.message : String(e);
    if (/Invalid login credentials/i.test(raw)) {
      setError('이메일 또는 비밀번호를 확인하세요.');
    } else if (/Email not confirmed/i.test(raw)) {
      setError('이메일 인증이 필요합니다. 관리자에게 문의하세요.');
    } else if (/Supabase URL\/Anon Key 미설정/.test(raw)) {
      setError('시스템 설정이 누락되었습니다. 관리자에게 문의하세요.');
    } else {
      setError(raw);
    }
  }
}

async function loadBindings() {
  try {
    setError('');
    const client = await ensureClient();
    const { data, error } = await client.from('vw_device_bindings_kst').select('*').limit(100).order('bound_at_kst', { ascending: false });
    if (error) throw error;
    const tbody = el('tblBindings').querySelector('tbody');
    tbody.innerHTML = '';
    (data || []).forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.license_key || ''}</td>
        <td>${(row.device_id || '').slice(0, 12)}...</td>
        <td>${row.active ? 'true' : 'false'}</td>
        <td>${row.bound_at_kst || ''}</td>
        <td>${row.revoked_at_kst || ''}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    setError(e.message || String(e));
  }
}

async function loadLogs() {
  try {
    setError('');
    const client = await ensureClient();
    const { data, error } = await client.from('vw_ip_access_logs_kst').select('license_key, ip_address, username, access_count, last_seen_kst, country_name, region_name, city_name').limit(100).order('last_seen_kst', { ascending: false });
    if (error) throw error;
    const tbody = el('tblLogs').querySelector('tbody');
    tbody.innerHTML = '';
    (data || []).forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.license_key || ''}</td>
        <td>${row.ip_address || ''}</td>
        <td>${row.username || ''}</td>
        <td>${row.access_count || 0}</td>
        <td>${row.last_seen_kst || ''}</td>
        <td>${row.country_name || ''}</td>
        <td>${row.region_name || ''}</td>
        <td>${row.city_name || ''}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    setError(e.message || String(e));
  }
}

async function loadRuns() {
  try {
    setError('');
    showSpinner(true);
    const client = await ensureClient();
    const { uname, start, end } = getFilters();
    const limit = getPageSize();
    const offset = (currentPage - 1) * limit;
    const s = sortState.runs;
    let q = client
      .from('vw_program_runs_kst')
      .select('username, occurred_at_kst, ip_address')
      .order(s.col, { ascending: !!s.asc })
      .range(offset, offset + limit - 1);
    if (uname) q = q.ilike('username', `%${uname}%`);
    if (start) q = q.gte('occurred_at_kst', `${start} 00:00:00+09`);
    if (end) q = q.lte('occurred_at_kst', `${end} 23:59:59+09`);
    const { data, error } = await q;
    if (error) throw error;
    debugLog('runs rows', (data||[]).length);
    const tbody = el('tblRuns').querySelector('tbody');
    tbody.innerHTML = '';
    (data || []).forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.username || ''}</td>
        <td>${row.occurred_at_kst || ''}</td>
        <td>${row.ip_address || ''}</td>
      `;
      tbody.appendChild(tr);
    });
    if (!data || data.length === 0) renderNoRows('tblRuns');
    updatePageInfo((data||[]).length);
    lastQuery = 'runs';
  } catch (e) {
    debugLog('runs error', e);
    setError(e.message || String(e));
  } finally {
    showSpinner(false);
  }
}
async function loadIpDaily() {
  try {
    setError('');
    showSpinner(true);
    const client = await ensureClient();
    const { uname, start, end } = getFilters();
    const limit = getPageSize();
    const offset = (currentPage - 1) * limit;
    let q = client
      .from('vw_ip_access_daily_kst')
      .select('username, day_kst, active_rows')
      .order('day_kst', { ascending: !!(sortState.daily?.col === 'day_kst' ? sortState.daily.asc : false) })
      .range(offset, offset + limit - 1);
    if (uname) q = q.ilike('username', `%${uname}%`);
    if (start) q = q.gte('day_kst', start);
    if (end) q = q.lte('day_kst', end);
    const { data, error } = await q;
    if (error) throw error;
    const tbody = el('tblIpDaily').querySelector('tbody');
    tbody.innerHTML = '';
    (data || []).forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.username || ''}</td>
        <td>${row.day_kst || ''}</td>
        <td>${row.active_rows || 0}</td>
      `;
      tbody.appendChild(tr);
    });
    if (!data || data.length === 0) renderNoRows('tblIpDaily');
    updatePageInfo((data||[]).length);
    lastQuery = 'ipdaily';
  } catch (e) {
    setError(e.message || String(e));
  } finally {
    showSpinner(false);
  }
}

async function loadStatsDaily() {
  try {
    setError('');
    showSpinner(true);
    const client = await ensureClient();
    const { uname, start, end } = getFilters();
    const limit = getPageSize();
    const offset = (currentPage - 1) * limit;
    const s = sortState.daily;
    let q = client
      .from('vw_device_stats_daily_kst')
      .select('username, day_kst, dm_count, invite_success, invite_failed, contact_total, contact_success, contact_failed')
      .order(s.col, { ascending: !!s.asc })
      .range(offset, offset + limit - 1);
    if (uname) q = q.ilike('username', `%${uname}%`);
    if (start) q = q.gte('day_kst', start);
    if (end) q = q.lte('day_kst', end);
    const { data, error } = await q;
    if (error) throw error;
    debugLog('daily rows', (data||[]).length);
    const tbody = el('tblStatsDaily').querySelector('tbody');
    tbody.innerHTML = '';
    (data || []).forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.username || ''}</td>
        <td>${row.day_kst || ''}</td>
        <td>${row.dm_count || 0}</td>
        <td>${row.invite_success || 0}</td>
        <td>${row.invite_failed || 0}</td>
        <td>${row.contact_total || 0}</td>
        <td>${row.contact_success || 0}</td>
        <td>${row.contact_failed || 0}</td>
      `;
      tbody.appendChild(tr);
    });
    if (!data || data.length === 0) renderNoRows('tblStatsDaily');
    updatePageInfo((data||[]).length);
    lastQuery = 'daily';
  } catch (e) {
    debugLog('daily error', e);
    setError(e.message || String(e));
  } finally {
    showSpinner(false);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  // 초기 상태에서 스피너는 숨김 유지
  try { showSpinner(false); } catch (_) {}
  // URL 쿼리 파라미터로 기본값 주입 가능: ?url=...&key=...&email=...
  try {
    const params = new URLSearchParams(window.location.search);
    const urlFromQuery = params.get('url');
    const keyFromQuery = params.get('key');
    const emailFromQuery = params.get('email');
    const logoutFlag = params.get('logout');
    if (urlFromQuery) safeSetLocalStorage('spbUrl', urlFromQuery);
    if (keyFromQuery) safeSetLocalStorage('anonKey', keyFromQuery);
    if (emailFromQuery) safeSetLocalStorage('email', emailFromQuery);
    // 강제 로그아웃: ?logout=1
    if (logoutFlag === '1') {
      try {
        const client = await ensureClient();
        await client.auth.signOut();
        const viewer = document.getElementById('viewer');
        const loginCard = document.getElementById('loginCard');
        if (viewer && loginCard) {
          viewer.classList.add('hidden');
          loginCard.classList.remove('hidden');
        }
      } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore */ }

  // 로그인 폼 채우기
  const storedEmail = safeGetLocalStorage('email', '');
  if (el('email') && storedEmail) {
    el('email').value = storedEmail;
  }

  // 이미 세션이 있으면 바로 뷰어 표시
  try {
    const client = await ensureClient();
    const { data } = await client.auth.getSession();
    if (data && data.session) {
      const viewer = document.getElementById('viewer');
      const loginCard = document.getElementById('loginCard');
      if (viewer && loginCard) {
        viewer.classList.remove('hidden');
        loginCard.classList.add('hidden');
      }
    }
  } catch (_) { /* ignore */ }

  on('btnLogin', 'click', login);
  on('btnLoadRuns', 'click', loadRuns);
  on('btnLoadStatsDaily', 'click', loadStatsDaily);
  on('btnLoadStatsMonthly', 'click', async () => {
    try {
      setError('');
      showSpinner(true);
      const client = await ensureClient();
      const { uname, start, end } = getFilters();
      const limit = getPageSize();
      const offset = (currentPage - 1) * limit;
      const s = sortState.monthly;
      let q = client
        .from('vw_device_stats_monthly_username')
        .select('year, month, username, dm_count, invite_success, invite_failed, contact_total, contact_success, contact_failed')
        .order(s.col, { ascending: !!s.asc })
        .order(s.col2, { ascending: !!s.asc2 })
        .range(offset, offset + limit - 1);
      if (uname) q = q.ilike('username', `%${uname}%`);
      const { data, error } = await q;
      if (error) throw error;
      debugLog('monthly rows', (data||[]).length);
      const tbody = el('tblStatsMonthly').querySelector('tbody');
      tbody.innerHTML = '';
      (data || []).forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.year}</td>
          <td>${row.month}</td>
          <td>${row.username || ''}</td>
          <td>${row.dm_count || 0}</td>
          <td>${row.invite_success || 0}</td>
          <td>${row.invite_failed || 0}</td>
          <td>${row.contact_total || 0}</td>
          <td>${row.contact_success || 0}</td>
          <td>${row.contact_failed || 0}</td>
        `;
        tbody.appendChild(tr);
      });
      if (!data || data.length === 0) renderNoRows('tblStatsMonthly');
      updatePageInfo((data||[]).length);
      lastQuery = 'monthly';
    } catch (e) {
      debugLog('monthly error', e);
      setError(e.message || String(e));
    } finally {
      showSpinner(false);
    }
  });
  // pagination + filters
  on('prevPage', 'click', () => { if (currentPage > 1) { currentPage -= 1; rerunLast(); } });
  on('nextPage', 'click', () => { currentPage += 1; rerunLast(); });
  on('pageSize', 'change', () => { currentPage = 1; rerunLast(); });
  on('filterUsername', 'change', () => { currentPage = 1; rerunLast(); });
  on('filterStart', 'change', () => { currentPage = 1; rerunLast(); });
  on('filterEnd', 'change', () => { currentPage = 1; rerunLast(); });

  // Sorting handlers
  function attachSortHandlers() {
    const runsHeaders = el('tblRuns')?.querySelectorAll('thead th.sortable') || [];
    runsHeaders.forEach(th => th.addEventListener('click', () => {
      const col = th.getAttribute('data-col');
      if (!col) return;
      const s = sortState.runs;
      s.asc = (s.col === col) ? !s.asc : true; // first click asc
      s.col = col;
      updateSortIndicators('tblRuns', col, s.asc);
      setAriaSort('tblRuns', col, s.asc);
      currentPage = 1;
      loadRuns();
    }));
    // keyboard support
    runsHeaders.forEach(th => th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); th.click(); }
    }));

    const dailyHeaders = el('tblStatsDaily')?.querySelectorAll('thead th.sortable') || [];
    dailyHeaders.forEach(th => th.addEventListener('click', () => {
      const col = th.getAttribute('data-col');
      if (!col) return;
      const s = sortState.daily;
      s.asc = (s.col === col) ? !s.asc : true;
      s.col = col;
      updateSortIndicators('tblStatsDaily', col, s.asc);
      setAriaSort('tblStatsDaily', col, s.asc);
      currentPage = 1;
      loadStatsDaily();
    }));
    dailyHeaders.forEach(th => th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); th.click(); }
    }));

    const monthlyHeaders = el('tblStatsMonthly')?.querySelectorAll('thead th.sortable') || [];
    monthlyHeaders.forEach(th => th.addEventListener('click', () => {
      const col = th.getAttribute('data-col');
      if (!col) return;
      // special: if click year or month, toggle ordering primary/secondary
      const s = sortState.monthly;
      if (col === 'year' || col === 'month') {
        if (s.col === col) {
          s.asc = !s.asc;
        } else if (s.col2 === col) {
          s.asc2 = !s.asc2;
        } else {
          // set clicked as primary
          s.col = col; s.asc = true;
          s.col2 = (col === 'year') ? 'month' : 'year';
        }
      } else {
        s.col = col; s.asc = true; // default asc for other columns
      }
      updateSortIndicators('tblStatsMonthly', s.col, s.asc);
      setAriaSort('tblStatsMonthly', s.col, s.asc);
      currentPage = 1;
      document.getElementById('btnLoadStatsMonthly')?.click();
    }));
    monthlyHeaders.forEach(th => th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); th.click(); }
    }));
  }

  function updateSortIndicators(tableId, activeCol, asc) {
    const headers = el(tableId)?.querySelectorAll('thead th.sortable') || [];
    headers.forEach(th => {
      th.classList.remove('asc', 'desc');
      if (th.getAttribute('data-col') === activeCol) th.classList.add(asc ? 'asc' : 'desc');
    });
  }

  attachSortHandlers();
  // initial indicators per default sort state
  updateSortIndicators('tblRuns', sortState.runs.col, sortState.runs.asc);
  setAriaSort('tblRuns', sortState.runs.col, sortState.runs.asc);
  updateSortIndicators('tblStatsDaily', sortState.daily.col, sortState.daily.asc);
  setAriaSort('tblStatsDaily', sortState.daily.col, sortState.daily.asc);
  updateSortIndicators('tblStatsMonthly', sortState.monthly.col, sortState.monthly.asc);
  setAriaSort('tblStatsMonthly', sortState.monthly.col, sortState.monthly.asc);

  // Health indicator: latest KST dates (오류 무시, 스피너 영향 없음)
  try {
    const client = await ensureClient();
    const [{ data: runs }, { data: daily }, { data: monthly }] = await Promise.all([
      client.from('vw_program_runs_kst').select('occurred_at_kst').order('occurred_at_kst', { ascending: false }).limit(1),
      client.from('vw_device_stats_daily_kst').select('day_kst').order('day_kst', { ascending: false }).limit(1),
      client.from('vw_device_stats_monthly_username').select('year,month').order('year', { ascending: false }).order('month', { ascending: false }).limit(1),
    ]);
    const r = runs && runs[0]?.occurred_at_kst ? String(runs[0].occurred_at_kst).slice(0, 16) : '-';
    const d = daily && daily[0]?.day_kst ? String(daily[0].day_kst) : '-';
    const m = monthly && monthly[0] ? `${monthly[0].year}-${String(monthly[0].month).padStart(2, '0')}` : '-';
    const health = el('health');
    if (health) health.textContent = `Runs 최신: ${r} · Daily 최신: ${d} · Monthly 최신: ${m}`;
  } catch (e) { /* ignore */ }
});

function rerunLast() {
  if (lastQuery === 'runs') return loadRuns();
  if (lastQuery === 'daily') return loadStatsDaily();
  if (lastQuery === 'ipdaily') return loadIpDaily();
  if (lastQuery === 'monthly') return (document.getElementById('btnLoadStatsMonthly')?.click());
}


