// Telo Dashboard - Modern UI (Updated Version)
let supabase = null;
let currentUser = null;
let chartInstance = null;

// Supabase Configuration
const SUPABASE_URL = 'https://shwvdqauqnvtodmismjv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNod3ZkcWF1cW52dG9kbWlzbWp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcxMzg2NzMsImV4cCI6MjA2MjcxNDY3M30.cF-PfTTY-IPnwqpCklmOIGSIFEgs9kLTQtH63Qm23xU';

// Initialize Supabase client
function initSupabase() {
    if (!supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabase;
}

// DOM Elements
const el = (id) => document.getElementById(id);

// Safe element value getter
const getElValue = (id, defaultValue = '') => {
    const element = el(id);
    return element ? element.value : defaultValue;
};

// Show/Hide Loading
function setLoading(show) {
    const overlay = el('loadingOverlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

// Format numbers with commas
function formatNumber(num) {
    return new Intl.NumberFormat('ko-KR').format(num || 0);
}

// Format date to Korean format
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

// Login Function
async function login() {
    try {
        const email = getElValue('email', '').trim();
        const password = getElValue('password', '');
        
        if (!email || !password) {
            throw new Error('이메일과 비밀번호를 입력하세요.');
        }
        
        setLoading(true);
        const client = initSupabase();
        
        const { data, error } = await client.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        currentUser = data.user;
        localStorage.setItem('userEmail', email);
        
        // Show dashboard
        el('loginScreen').classList.add('hidden');
        el('dashboard').classList.remove('hidden');
        el('currentUser').textContent = email;
        
        // Load initial data
        await loadOverview();
        
    } catch (error) {
        el('loginError').textContent = error.message || '로그인 실패';
    } finally {
        setLoading(false);
    }
}

// Logout Function
async function logout() {
    try {
        const client = initSupabase();
        await client.auth.signOut();
        
        currentUser = null;
        el('loginScreen').classList.remove('hidden');
        el('dashboard').classList.add('hidden');
        el('loginError').textContent = '';
        
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Check existing session
async function checkSession() {
    try {
        const client = initSupabase();
        const { data } = await client.auth.getSession();
        
        if (data && data.session) {
            currentUser = data.session.user;
            el('loginScreen').classList.add('hidden');
            el('dashboard').classList.remove('hidden');
            el('currentUser').textContent = currentUser.email;
            
            await loadOverview();
        }
    } catch (error) {
        console.error('Session check error:', error);
    }
}

// Load Overview Data
async function loadOverview() {
    try {
        setLoading(true);
        const client = initSupabase();
        
        // Get monthly statistics for summary
        const { data: monthlyData, error: monthlyError } = await client
            .from('vw_device_stats_monthly_kst')
            .select('*');
            
        if (monthlyError) {
            console.error('Monthly data error:', monthlyError);
        }
        
        // Calculate totals
        const totalUsers = monthlyData ? [...new Set(monthlyData.map(d => d.email))].length : 0;
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        
        const monthTotal = monthlyData ? monthlyData
            .filter(d => d.month === currentMonth && d.year === currentYear)
            .reduce((acc, row) => ({
                dm: acc.dm + (row.dm_count || 0),
                invites: acc.invites + (row.invite_success || 0)
            }), { dm: 0, invites: 0 }) : { dm: 0, invites: 0 };
        
        // Get today's active users from login history
        const today = new Date().toISOString().split('T')[0];
        const { data: todayData } = await client
            .from('vw_login_history_kst')
            .select('email')
            .eq('action', 'login')
            .gte('created_at_kst', `${today} 00:00:00`)
            .lte('created_at_kst', `${today} 23:59:59`);
            
        const todayActive = new Set(todayData?.map(d => d.email) || []).size;
        
        // Update stats cards
        el('totalUsers').textContent = formatNumber(totalUsers);
        el('todayActive').textContent = formatNumber(todayActive);
        el('monthInvites').textContent = formatNumber(monthTotal.invites);
        el('monthDMs').textContent = formatNumber(monthTotal.dm);
        
        // Load chart data
        await loadActivityChart();
        
        // Load top users
        loadTopUsers(monthlyData);
        
    } catch (error) {
        console.error('Overview load error:', error);
    } finally {
        setLoading(false);
    }
}

// Load Activity Chart (Last 7 days)
async function loadActivityChart() {
    try {
        const client = initSupabase();
        
        // Get last 7 days
        const dates = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            dates.push(date.toISOString().split('T')[0]);
        }
        
        // Get daily stats for last 7 days
        const { data } = await client
            .from('vw_device_stats_daily_kst')
            .select('day_kst, dm_count, invite_success, contact_success')
            .in('day_kst', dates);
            
        // Aggregate by date
        const chartData = dates.map(date => {
            const dayData = (data || []).filter(d => d.day_kst === date);
            return {
                date,
                dm: dayData.reduce((sum, d) => sum + (d.dm_count || 0), 0),
                invites: dayData.reduce((sum, d) => sum + (d.invite_success || 0), 0),
                contacts: dayData.reduce((sum, d) => sum + (d.contact_success || 0), 0)
            };
        });
        
        // Destroy existing chart
        if (chartInstance) {
            chartInstance.destroy();
        }
        
        // Create new chart
        const ctx = el('activityChart').getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.map(d => {
                    const date = new Date(d.date);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                }),
                datasets: [
                    {
                        label: 'DM 전송',
                        data: chartData.map(d => d.dm),
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: '초대 성공',
                        data: chartData.map(d => d.invites),
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: '연락처 성공',
                        data: chartData.map(d => d.contacts),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#9ca3af',
                            padding: 15,
                            font: { size: 12 }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: '#2d3748',
                            drawBorder: false
                        },
                        ticks: { color: '#9ca3af' }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: { color: '#9ca3af' }
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Chart load error:', error);
    }
}

// Load Top Users
function loadTopUsers(monthlyData) {
    if (!monthlyData) return;
    
    // Aggregate by email
    const userTotals = {};
    monthlyData.forEach(row => {
        if (!userTotals[row.email]) {
            userTotals[row.email] = 0;
        }
        userTotals[row.email] += (row.invite_success || 0);
    });
    
    // Sort and get top 5
    const topUsers = Object.entries(userTotals)
        .map(([email, total]) => ({ email, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
        
    const container = el('topUsersList');
    container.innerHTML = topUsers.map((user, index) => `
        <div class="top-user-item">
            <div class="top-user-info">
                <div class="top-user-rank">${index + 1}</div>
                <div class="top-user-email">${user.email}</div>
            </div>
            <div class="top-user-score">${formatNumber(user.total)}</div>
        </div>
    `).join('');
}

// Load Monthly Stats
async function loadMonthlyStats() {
    try {
        setLoading(true);
        const client = initSupabase();
        
        const year = getElValue('monthlyYear', '2025');
        const search = getElValue('monthlySearch', '').toLowerCase();
        
        let query = client
            .from('vw_device_stats_monthly_kst')
            .select('*')
            .eq('year', parseInt(year))
            .order('month', { ascending: false });
            
        if (search) {
            query = query.ilike('email', `%${search}%`);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        const container = el('monthlyGrid');
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;">데이터가 없습니다</div>';
            return;
        }
        
        container.innerHTML = data.map(row => `
            <div class="data-card">
                <div class="data-card-header">
                    <div class="data-card-title">${row.email}</div>
                    <div class="data-card-badge">${row.year}-${String(row.month).padStart(2, '0')}</div>
                </div>
                <div class="data-card-stats">
                    <div class="data-stat">
                        <span class="data-stat-label">DM 전송</span>
                        <span class="data-stat-value">${formatNumber(row.dm_count)}</span>
                    </div>
                    <div class="data-stat">
                        <span class="data-stat-label">초대 성공</span>
                        <span class="data-stat-value">${formatNumber(row.invite_success)}</span>
                    </div>
                    <div class="data-stat">
                        <span class="data-stat-label">초대 실패</span>
                        <span class="data-stat-value">${formatNumber(row.invite_failed)}</span>
                    </div>
                    <div class="data-stat">
                        <span class="data-stat-label">연락처 처리</span>
                        <span class="data-stat-value">${formatNumber(row.contact_total)}</span>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Monthly stats error:', error);
        const container = el('monthlyGrid');
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">데이터 로드 실패</div>';
    } finally {
        setLoading(false);
    }
}

// Load Daily Stats
async function loadDailyStats() {
    try {
        setLoading(true);
        const client = initSupabase();
        
        const startDate = getElValue('dailyDateStart', '');
        const endDate = getElValue('dailyDateEnd', '');
        const search = getElValue('dailySearch', '').toLowerCase();
        
        let query = client
            .from('vw_device_stats_daily_kst')
            .select('*')
            .order('day_kst', { ascending: false })
            .limit(100);
            
        if (startDate) {
            query = query.gte('day_kst', startDate);
        }
        if (endDate) {
            query = query.lte('day_kst', endDate);
        }
        if (search) {
            query = query.ilike('email', `%${search}%`);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        const tbody = el('dailyTableBody');
        
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#6b7280;">데이터가 없습니다</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.map(row => `
            <tr>
                <td>${row.day_kst}</td>
                <td>${row.email}</td>
                <td>${formatNumber(row.dm_count)}</td>
                <td>${formatNumber(row.invite_success)}</td>
                <td>${formatNumber(row.invite_failed)}</td>
                <td>${formatNumber(row.contact_total)}</td>
                <td>${formatNumber(row.contact_success)}</td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Daily stats error:', error);
        const tbody = el('dailyTableBody');
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ef4444;">데이터 로드 실패</td></tr>';
    } finally {
        setLoading(false);
    }
}

// Load Activity Log (Login History)
async function loadActivityLog() {
    try {
        setLoading(true);
        const client = initSupabase();
        
        const search = getElValue('activitySearch', '').toLowerCase();
        const action = getElValue('activityAction', '');
        
        let query = client
            .from('vw_login_history_kst')
            .select('email, action, created_at_kst_str, ip_address')
            .order('created_at_kst', { ascending: false })
            .limit(50);
            
        if (search) {
            query = query.ilike('email', `%${search}%`);
        }
        if (action) {
            query = query.eq('action', action);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        const container = el('activityTimeline');
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;">활동 기록이 없습니다</div>';
            return;
        }
        
        container.innerHTML = data.map(row => `
            <div class="activity-item">
                <div class="activity-icon ${row.action}">
                    ${row.action === 'login' ? '→' : '←'}
                </div>
                <div class="activity-content">
                    <div class="activity-user">${row.email}</div>
                    <div class="activity-details">
                        ${row.action === 'login' ? '로그인' : '로그아웃'} 
                        ${row.ip_address ? `• IP: ${row.ip_address}` : ''}
                    </div>
                    <div class="activity-time">${row.created_at_kst_str}</div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Activity log error:', error);
        const container = el('activityTimeline');
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">데이터 로드 실패</div>';
    } finally {
        setLoading(false);
    }
}

// Tab Navigation
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            const targetTab = tab.dataset.tab;
            
            // Update active states
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            el(targetTab).classList.add('active');
            
            // Load tab data
            switch (targetTab) {
                case 'overview':
                    await loadOverview();
                    break;
                case 'monthly':
                    await loadMonthlyStats();
                    break;
                case 'daily':
                    await loadDailyStats();
                    break;
                case 'activity':
                    await loadActivityLog();
                    break;
            }
        });
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Check saved email
    const savedEmail = localStorage.getItem('userEmail');
    const emailEl = el('email');
    if (savedEmail && emailEl) {
        emailEl.value = savedEmail;
    }
    
    // Setup event listeners (with null checks)
    const addEvent = (id, event, handler) => {
        const element = el(id);
        if (element) {
            element.addEventListener(event, handler);
        }
    };
    
    addEvent('btnLogin', 'click', login);
    addEvent('btnLogout', 'click', logout);
    addEvent('btnDailyApply', 'click', loadDailyStats);
    addEvent('btnActivityRefresh', 'click', loadActivityLog);
    
    // Enter key for login
    addEvent('password', 'keypress', (e) => {
        if (e.key === 'Enter') login();
    });
    
    // Filter change events
    addEvent('monthlyYear', 'change', loadMonthlyStats);
    addEvent('monthlySearch', 'input', debounce(loadMonthlyStats, 500));
    addEvent('dailySearch', 'input', debounce(loadDailyStats, 500));
    addEvent('activitySearch', 'input', debounce(loadActivityLog, 500));
    addEvent('activityAction', 'change', loadActivityLog);
    
    // Set default dates for daily stats
    const today = new Date();
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    const endDateEl = el('dailyDateEnd');
    const startDateEl = el('dailyDateStart');
    if (endDateEl) endDateEl.value = today.toISOString().split('T')[0];
    if (startDateEl) startDateEl.value = lastWeek.toISOString().split('T')[0];
    
    // Setup tabs
    setupTabs();
    
    // Check existing session
    await checkSession();
});

// Utility: Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}