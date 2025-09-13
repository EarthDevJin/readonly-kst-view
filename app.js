let supabase = null;

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

function setError(msg) { el('err').textContent = msg || ''; }
function setStatus(msg) { el('loginStatus').textContent = msg || ''; }

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
    const client = await ensureClient();
    const { data, error } = await client
      .from('vw_program_runs_kst')
      .select('username, occurred_at_kst, ip_address')
      .limit(200)
      .order('occurred_at_kst', { ascending: false });
    if (error) throw error;
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
  } catch (e) {
    setError(e.message || String(e));
  }
}
async function loadIpDaily() {
  try {
    setError('');
    const client = await ensureClient();
    const { data, error } = await client
      .from('vw_ip_access_daily_kst')
      .select('username, day_kst, active_rows')
      .limit(200)
      .order('day_kst', { ascending: false });
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
  } catch (e) {
    setError(e.message || String(e));
  }
}

async function loadStatsDaily() {
  try {
    setError('');
    const client = await ensureClient();
    const { data, error } = await client
      .from('vw_device_stats_daily_kst')
      .select('username, day_kst, dm_count, invite_success, invite_failed, contact_total, contact_success, contact_failed')
      .limit(200)
      .order('day_kst', { ascending: false });
    if (error) throw error;
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
  } catch (e) {
    setError(e.message || String(e));
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  // URL 쿼리 파라미터로 기본값 주입 가능: ?url=...&key=...&email=...
  try {
    const params = new URLSearchParams(window.location.search);
    const urlFromQuery = params.get('url');
    const keyFromQuery = params.get('key');
    const emailFromQuery = params.get('email');
    if (urlFromQuery) safeSetLocalStorage('spbUrl', urlFromQuery);
    if (keyFromQuery) safeSetLocalStorage('anonKey', keyFromQuery);
    if (emailFromQuery) safeSetLocalStorage('email', emailFromQuery);
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

  el('btnLogin').addEventListener('click', login);
  el('btnLoadRuns').addEventListener('click', loadRuns);
  el('btnLoadIpDaily').addEventListener('click', loadIpDaily);
  el('btnLoadStatsDaily').addEventListener('click', loadStatsDaily);
  el('btnLoadStatsMonthly').addEventListener('click', async () => {
    try {
      setError('');
      const client = await ensureClient();
      const { data, error } = await client
        .from('vw_device_stats_monthly_username')
        .select('year, month, username, dm_count, invite_success, invite_failed, contact_total, contact_success, contact_failed')
        .limit(200)
        .order('year', { ascending: false })
        .order('month', { ascending: false });
      if (error) throw error;
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
    } catch (e) {
      setError(e.message || String(e));
    }
  });
});


