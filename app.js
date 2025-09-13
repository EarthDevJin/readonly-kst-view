let supabase = null;

function el(id) { return document.getElementById(id); }

function setError(msg) { el('err').textContent = msg || ''; }
function setStatus(msg) { el('loginStatus').textContent = msg || ''; }

async function ensureClient() {
  if (supabase) return supabase;
  const url = el('spbUrl').value.trim();
  const key = el('anonKey').value.trim();
  if (!url || !key) throw new Error('Supabase URL/Anon Key를 입력하세요.');
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
    setStatus('로그인 성공');
  } catch (e) {
    setError(e.message || String(e));
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

window.addEventListener('DOMContentLoaded', () => {
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


