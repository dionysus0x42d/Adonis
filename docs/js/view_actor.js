/**
 * 演員查詢頁面 - JavaScript 邏輯
 * 功能：自動補齐、搜尋、篩選、排序、分頁、展開/收合等
 */

// ==================== 全局狀態 ====================

const state = {
    currentPage: 1,
    perPage: 20,
    filters: {
        search: '',
        studios: [],
        sort: 'name',
        sort_order: 'asc',
        showAnonymous: false
    },
    data: {
        actors: [],
        total: 0,
        total_pages: 0
    },
    expandedActors: new Set(),
    keyboardSelectedIndex: -1
};

// 公司顏色映射（統一灰色背景）
const studioColors = {
    'Coat': '#95a5a6',
    'JUSTICE': '#95a5a6',
    'ACCEED': '#95a5a6',
    'Carabineer': '#95a5a6',
    'Omega Tribe': '#95a5a6',
    'K-Tribe': '#95a5a6',
    'Hunters': '#95a5a6',
    'MUST': '#95a5a6',
    'Fantastic': '#95a5a6'
};

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
    await loadFilters();
    setupEventListeners();
    updateSortButtons();
    // 初始時顯示所有演員（不搜尋任何關鍵字）
    await performSearch();
});

// ==================== 載入篩選選項 ====================

async function loadFilters() {
    try {
        const response = await fetch(`${API_BASE}/api/actors/filters`);
        const data = await response.json();

        // 渲染公司篩選複選框
        const studioFiltersContainer = document.getElementById('studioFilters');
        studioFiltersContainer.innerHTML = '';

        data.studios.forEach(studio => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = studio.id;
            checkbox.dataset.filter = 'studios';

            const span = document.createElement('span');
            span.textContent = studio.name;

            label.appendChild(checkbox);
            label.appendChild(span);
            studioFiltersContainer.appendChild(label);
        });

    } catch (error) {
        console.error('載入篩選選項失敗:', error);
    }
}

// ==================== 事件監聽設置 ====================

function setupEventListeners() {
    // 公司篩選複選框
    document.addEventListener('change', (e) => {
        if (e.target.matches('input[data-filter="studios"]')) {
            const checkboxes = document.querySelectorAll('input[data-filter="studios"]:checked');
            state.filters.studios = Array.from(checkboxes).map(cb => parseInt(cb.value));
            state.currentPage = 1;
            performSearch();
        }
    });

    // 匿名演員篩選勾選框
    document.getElementById('showAnonymous').addEventListener('change', (e) => {
        state.filters.showAnonymous = e.target.checked;
        state.currentPage = 1;
        performSearch();
    });

    // 排序按鈕
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const field = btn.dataset.field;
            handleSortClick(field);
        });
    });

    // 搜尋輸入框（debounce 版本，無自動補全）
    const searchInput = document.getElementById('actorSearch');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            state.filters.search = e.target.value.trim();
            state.currentPage = 1;
            performSearch();
        }, 300));
    }

    // 清除篩選按鈕
    document.getElementById('clearFilters').addEventListener('click', clearFilters);

    // 展開/收合演員（事件委派）
    document.addEventListener('click', (e) => {
        if (e.target.closest('.toggle-btn')) {
            const actorId = e.target.closest('.toggle-btn').dataset.actorId;
            toggleActor(parseInt(actorId));
        }
    });
}

// [自動補齊功能已移除 - 使用下方篩選面板進行查詢]

// ==================== 搜尋和篩選 ====================

async function performSearch() {
    try {
        showLoading(true);
        hideError();

        const params = new URLSearchParams();
        params.append('search', state.filters.search);
        params.append('sort', state.filters.sort);
        params.append('sort_order', state.filters.sort_order);
        params.append('page', state.currentPage);
        params.append('per_page', state.perPage);
        params.append('show_anonymous', state.filters.showAnonymous ? '1' : '0');

        if (state.filters.studios.length > 0) {
            params.append('studios', state.filters.studios.join(','));
        }

        const response = await fetch(`${API_BASE}/api/actors/query?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        state.data = data;

        renderActorsList(data.results);
        renderPagination(data);
        updateResultCount(data.total);

    } catch (error) {
        console.error('搜尋失敗:', error);
        showError('搜尋失敗，請稍後再試');
    } finally {
        showLoading(false);
    }
}

function clearFilters() {
    document.getElementById('actorSearch').value = '';
    document.querySelectorAll('input[data-filter="studios"]').forEach(cb => cb.checked = false);
    document.getElementById('showAnonymous').checked = false;

    state.filters = {
        search: '',
        studios: [],
        sort: 'name',
        sort_order: 'asc',
        showAnonymous: false
    };
    state.currentPage = 1;
    state.expandedActors.clear();

    updateSortButtons();
    performSearch();
}

// ==================== 排序管理 ====================

function handleSortClick(field) {
    // 如果點擊的是當前排序欄位，切換排序方向
    if (state.filters.sort === field) {
        state.filters.sort_order = state.filters.sort_order === 'asc' ? 'desc' : 'asc';
    } else {
        // 如果是新的排序欄位，設置為預設方向（大多數為asc，newest_edit預設desc）
        state.filters.sort = field;
        state.filters.sort_order = field === 'newest_edit' ? 'desc' : 'asc';
    }

    state.currentPage = 1;
    updateSortButtons();
    performSearch();
}

function updateSortButtons() {
    document.querySelectorAll('.sort-btn').forEach(btn => {
        const field = btn.dataset.field;

        if (field === state.filters.sort) {
            // 當前排序欄位 - 顯示active狀態和排序方向
            btn.classList.add('active');
            const order = state.filters.sort_order === 'asc' ? ' ▲' : ' ▼';
            btn.textContent = btn.textContent.replace(/\s[▲▼]$/, '') + order;
        } else {
            // 非當前排序欄位 - 移除active，設置預設方向
            btn.classList.remove('active');
            let defaultText = btn.textContent.replace(/\s[▲▼]$/, '');
            const defaultOrder = field === 'newest_edit' ? ' ▼' : ' ▲';
            btn.textContent = defaultText + defaultOrder;
        }
    });
}

// ==================== 結果渲染 ====================

function renderActorsList(actors) {
    const container = document.getElementById('actorsList');
    container.innerHTML = '';

    if (actors.length === 0) {
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: #999;">找不到相符的演員</div>';
        return;
    }

    actors.forEach(actor => {
        const actorItem = createActorItem(actor);
        container.appendChild(actorItem);
    });
}

function createActorItem(actor) {
    const isExpanded = state.expandedActors.has(actor.actor_id);
    const toggleIcon = isExpanded ? '▼' : '▶';

    // 計算全局角色百分比
    const globalStats = actor.global_stats;
    const totalRoles = (globalStats.role_breakdown.top + globalStats.role_breakdown.bottom +
                       globalStats.role_breakdown.giver + globalStats.role_breakdown.receiver +
                       globalStats.role_breakdown.other) || 1;

    const globalRolePercentages = {
        top: Math.round((globalStats.role_breakdown.top / totalRoles) * 100),
        bottom: Math.round((globalStats.role_breakdown.bottom / totalRoles) * 100),
        giver: Math.round((globalStats.role_breakdown.giver / totalRoles) * 100),
        receiver: Math.round((globalStats.role_breakdown.receiver / totalRoles) * 100),
        other: Math.round((globalStats.role_breakdown.other / totalRoles) * 100)
    };

    // 創建容器
    const itemDiv = document.createElement('div');
    itemDiv.className = 'actor-item';
    itemDiv.dataset.actorId = actor.actor_id;

    // 演員標題行（母項）
    const headerDiv = document.createElement('div');
    headerDiv.className = 'actor-header';

    // 1. Toggle 按鈕
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'toggle-btn';
    toggleBtn.dataset.actorId = actor.actor_id;
    toggleBtn.innerHTML = `<span class="toggle-icon">${toggleIcon}</span>`;

    // 2. 演員名字
    const nameSpan = document.createElement('span');
    nameSpan.className = 'actor-name';
    nameSpan.textContent = actor.actor_tag;

    // 3. 公司 badges
    const companiesDiv = document.createElement('div');
    companiesDiv.className = 'company-badges';
    if (actor.studio_details && actor.studio_details.length > 0) {
        actor.studio_details.forEach(studio => {
            const badge = document.createElement('span');
            badge.className = 'company-badge';
            badge.style.background = studioColors[studio.studio_name] || '#95a5a6';
            badge.textContent = studio.studio_name;
            companiesDiv.appendChild(badge);
        });
    }

    // 4. 作品總數
    const productionSpan = document.createElement('span');
    productionSpan.className = 'production-count';
    productionSpan.textContent = globalStats.total_productions;
    productionSpan.style.textAlign = 'center';

    // 5. 角色比例條形圖
    const chartDiv = document.createElement('div');
    chartDiv.className = 'role-chart';
    chartDiv.appendChild(createRoleBar(globalStats.role_breakdown, globalRolePercentages));
    chartDiv.style.textAlign = 'center';

    // 6. 最新作品
    const latestSpan = document.createElement('span');
    latestSpan.className = 'latest-production';
    latestSpan.title = globalStats.latest_production_code || '無';
    latestSpan.textContent = globalStats.latest_production_code || '無';
    latestSpan.style.textAlign = 'center';

    // 7. 最新日期
    const dateSpan = document.createElement('span');
    dateSpan.className = 'latest-date';
    dateSpan.textContent = globalStats.latest_release_date || '無';
    dateSpan.style.textAlign = 'right';

    headerDiv.appendChild(toggleBtn);
    headerDiv.appendChild(nameSpan);
    headerDiv.appendChild(companiesDiv);
    headerDiv.appendChild(productionSpan);
    headerDiv.appendChild(chartDiv);
    headerDiv.appendChild(latestSpan);
    headerDiv.appendChild(dateSpan);

    // 詳細信息區（各公司）
    const detailsDiv = document.createElement('div');
    detailsDiv.className = `actor-details ${isExpanded ? 'expanded' : ''}`;

    if (actor.studio_details && actor.studio_details.length > 0) {
        actor.studio_details.forEach(studio => {
            const studioItem = createStudioItem(studio);
            detailsDiv.appendChild(studioItem);
        });
    }

    itemDiv.appendChild(headerDiv);
    itemDiv.appendChild(detailsDiv);

    return itemDiv;
}

function createStudioItem(studio) {
    const totalRoles = (studio.role_breakdown.top + studio.role_breakdown.bottom +
                       studio.role_breakdown.giver + studio.role_breakdown.receiver) || 1;

    const studioItem = document.createElement('div');
    studioItem.className = 'studio-item';
    studioItem.dataset.studioId = studio.studio_id;

    // 如果沒有作品，添加 disabled 類名使其顯示為淺灰色
    if (studio.productions === 0) {
        studioItem.classList.add('disabled');
    }

    // 1. Spacer (matches toggle button column)
    const spacer = document.createElement('div');
    spacer.style.width = '36px';

    // 2. 藝名（在該公司）
    const stageName = document.createElement('div');
    stageName.className = 'stage-name';
    stageName.textContent = studio.stage_name || '無藝名';

    // 3. 公司名稱 badge
    const badge = document.createElement('div');
    badge.className = 'studio-badge';
    badge.style.background = studioColors[studio.studio_name] || '#95a5a6';
    badge.textContent = studio.studio_name;

    // 4. 作品總數
    const productionSpan = document.createElement('div');
    productionSpan.className = 'production-count';
    productionSpan.textContent = studio.productions;
    productionSpan.style.textAlign = 'center';

    // 5. 角色比例條形圖
    const chartDiv = document.createElement('div');
    chartDiv.className = 'role-chart';

    // 如果沒有作品，顯示灰色占位符；否則顯示角色條
    if (studio.productions === 0) {
        // 顯示灰色占位符，表示沒有數據
        const placeholder = document.createElement('div');
        placeholder.className = 'chart-bar-disabled';
        placeholder.style.display = 'flex';
        placeholder.style.height = '24px';
        placeholder.style.borderRadius = '4px';
        placeholder.style.overflow = 'hidden';
        placeholder.style.flex = '1';
        placeholder.style.minWidth = '200px';
        placeholder.style.background = '#e8e8e8';
        placeholder.style.boxShadow = 'inset 0 1px 2px rgba(0, 0, 0, 0.05)';
        placeholder.style.cursor = 'default';
        placeholder.title = '尚無作品數據';
        chartDiv.appendChild(placeholder);
    } else {
        chartDiv.appendChild(createRoleBar(studio.role_breakdown, studio.role_percentage));
    }
    chartDiv.style.textAlign = 'center';

    // 6. 最新作品
    const latestSpan = document.createElement('div');
    latestSpan.className = 'latest-production';
    latestSpan.textContent = studio.latest_production_code || '---';
    latestSpan.style.textAlign = 'center';

    // 7. 最新日期
    const dateSpan = document.createElement('div');
    dateSpan.className = 'latest-date';
    dateSpan.textContent = studio.latest_date || '無';
    dateSpan.style.textAlign = 'right';

    // 附加元素到 studioItem
    studioItem.appendChild(spacer);
    studioItem.appendChild(stageName);
    studioItem.appendChild(badge);
    studioItem.appendChild(productionSpan);
    studioItem.appendChild(chartDiv);
    studioItem.appendChild(latestSpan);
    studioItem.appendChild(dateSpan);

    return studioItem;
}

function createRoleBar(roleBreakdown, rolePercentages) {
    const chartBar = document.createElement('div');
    chartBar.className = 'chart-bar';

    const roles = ['top', 'bottom', 'giver', 'receiver', 'other'];
    const roleLabels = {
        top: 'Top',
        bottom: 'Bottom',
        giver: 'Giver',
        receiver: 'Receiver',
        other: 'Other'
    };

    roles.forEach(role => {
        const count = roleBreakdown[role];
        const percentage = rolePercentages[role];

        // Debug: Log role data
        if (!window.roleDebugLogged) {
            console.log('Role breakdown:', roleBreakdown);
            console.log('Role percentages:', rolePercentages);
            window.roleDebugLogged = true;
        }

        if (percentage > 0) {
            const segment = document.createElement('div');
            segment.className = `segment ${role}`;
            segment.style.width = `${percentage}%`;
            segment.title = `${roleLabels[role]}: ${count}`;

            if (percentage >= 15) { // 只在空間足夠時顯示數字
                const countSpan = document.createElement('span');
                countSpan.className = 'count';
                countSpan.textContent = count;
                segment.appendChild(countSpan);
            }

            chartBar.appendChild(segment);
        }
    });

    return chartBar;
}

// ==================== 展開/收合 ====================

function toggleActor(actorId) {
    const actorItem = document.querySelector(`[data-actor-id="${actorId}"]`);
    const details = actorItem.querySelector('.actor-details');
    const toggle = actorItem.querySelector('.toggle-btn');

    if (state.expandedActors.has(actorId)) {
        state.expandedActors.delete(actorId);
        details.classList.remove('expanded');
        toggle.querySelector('.toggle-icon').textContent = '▶';
    } else {
        state.expandedActors.add(actorId);
        details.classList.add('expanded');
        toggle.querySelector('.toggle-icon').textContent = '▼';
    }
}

// ==================== 分頁 ====================

function renderPagination(data) {
    const container = document.getElementById('pagination');
    container.innerHTML = '';

    if (data.total_pages <= 1) {
        return;
    }

    // 上一頁按鈕
    const prevBtn = document.createElement('button');
    prevBtn.className = `page-btn ${data.page === 1 ? 'disabled' : ''}`;
    prevBtn.textContent = '上一頁';
    prevBtn.disabled = data.page === 1;
    prevBtn.addEventListener('click', () => {
        if (data.page > 1) {
            state.currentPage = data.page - 1;
            performSearch();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    container.appendChild(prevBtn);

    // 頁碼按鈕
    const maxPagesToShow = 7;
    let startPage = Math.max(1, data.page - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(data.total_pages, startPage + maxPagesToShow - 1);

    if (endPage - startPage < maxPagesToShow - 1) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    if (startPage > 1) {
        const firstBtn = document.createElement('button');
        firstBtn.className = 'page-btn';
        firstBtn.textContent = '1';
        firstBtn.addEventListener('click', () => {
            state.currentPage = 1;
            performSearch();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        container.appendChild(firstBtn);

        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.style.padding = '8px 5px';
            container.appendChild(ellipsis);
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `page-btn ${i === data.page ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.disabled = i === data.page;
        pageBtn.addEventListener('click', () => {
            state.currentPage = i;
            performSearch();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        container.appendChild(pageBtn);
    }

    if (endPage < data.total_pages) {
        if (endPage < data.total_pages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.style.padding = '8px 5px';
            container.appendChild(ellipsis);
        }

        const lastBtn = document.createElement('button');
        lastBtn.className = 'page-btn';
        lastBtn.textContent = data.total_pages;
        lastBtn.addEventListener('click', () => {
            state.currentPage = data.total_pages;
            performSearch();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        container.appendChild(lastBtn);
    }

    // 下一頁按鈕
    const nextBtn = document.createElement('button');
    nextBtn.className = `page-btn ${data.page === data.total_pages ? 'disabled' : ''}`;
    nextBtn.textContent = '下一頁';
    nextBtn.disabled = data.page === data.total_pages;
    nextBtn.addEventListener('click', () => {
        if (data.page < data.total_pages) {
            state.currentPage = data.page + 1;
            performSearch();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    container.appendChild(nextBtn);
}

// ==================== UI 狀態管理 ====================

function updateResultCount(total) {
    const container = document.getElementById('resultCount');
    container.textContent = `共 ${total} 個演員`;
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
        loading.style.display = 'block';
    } else {
        loading.style.display = 'none';
    }
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

// ==================== 工具函數 ====================

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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
