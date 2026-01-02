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
        sort_order: 'asc'
    },
    data: {
        actors: [],
        total: 0,
        total_pages: 0
    },
    expandedActors: new Set(),
    keyboardSelectedIndex: -1
};

// 公司顏色映射
const studioColors = {
    'Coat': '#FF6B6B',
    'JUSTICE': '#4ECDC4',
    'ACCEED': '#95E1D3',
    'Carabineer': '#F38181',
    'Omega Tribe': '#AA96DA',
    'K-Tribe': '#FCBAD3',
    'Hunters': '#A8D8EA',
    'MUST': '#8B9DC3',
    'Fantastic': '#C2B0C5'
};

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
    await loadFilters();
    setupEventListeners();
    await performSearch();
});

// ==================== 載入篩選選項 ====================

async function loadFilters() {
    try {
        const response = await fetch('/api/actors/filters');
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
    // 搜尋框
    const searchInput = document.getElementById('actorSearch');
    searchInput.addEventListener('input', debounce(async (e) => {
        state.filters.search = e.target.value.trim();
        state.currentPage = 1;

        if (state.filters.search.length > 0) {
            await showSuggestions(state.filters.search);
        } else {
            hideSuggestions();
        }

        await performSearch();
    }, 300));

    // 搜尋框鍵盤導航
    searchInput.addEventListener('keydown', (e) => {
        const suggestionsBox = document.getElementById('suggestions');
        const items = suggestionsBox.querySelectorAll('.suggestion-item');

        if (items.length === 0) return;

        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                state.keyboardSelectedIndex = Math.min(state.keyboardSelectedIndex + 1, items.length - 1);
                updateKeyboardSelection(items);
                break;

            case 'ArrowUp':
                e.preventDefault();
                state.keyboardSelectedIndex = Math.max(state.keyboardSelectedIndex - 1, -1);
                updateKeyboardSelection(items);
                break;

            case 'Enter':
                e.preventDefault();
                if (state.keyboardSelectedIndex >= 0) {
                    items[state.keyboardSelectedIndex].click();
                }
                break;

            case 'Escape':
                e.preventDefault();
                hideSuggestions();
                state.keyboardSelectedIndex = -1;
                break;
        }
    });

    // 公司篩選複選框
    document.addEventListener('change', (e) => {
        if (e.target.matches('input[data-filter="studios"]')) {
            const checkboxes = document.querySelectorAll('input[data-filter="studios"]:checked');
            state.filters.studios = Array.from(checkboxes).map(cb => parseInt(cb.value));
            state.currentPage = 1;
            performSearch();
        }
    });

    // 排序選項
    document.getElementById('sortBy').addEventListener('change', (e) => {
        state.filters.sort = e.target.value;
        state.currentPage = 1;
        performSearch();
    });

    document.getElementById('sortOrder').addEventListener('change', (e) => {
        state.filters.sort_order = e.target.value;
        state.currentPage = 1;
        performSearch();
    });

    // 清除篩選按鈕
    document.getElementById('clearFilters').addEventListener('click', clearFilters);

    // 展開/收合演員（事件委派）
    document.addEventListener('click', (e) => {
        if (e.target.closest('.toggle-btn')) {
            const actorId = e.target.closest('.toggle-btn').dataset.actorId;
            toggleActor(parseInt(actorId));
        }
    });

    // 防止建議框外點擊時的默認行為
    document.addEventListener('click', (e) => {
        if (!e.target.matches('#actorSearch') && !e.target.closest('.suggestions-box')) {
            setTimeout(hideSuggestions, 100);
        }
    });
}

// ==================== 自動補齊 ====================

async function showSuggestions(query) {
    try {
        const response = await fetch(`/api/actors/suggestions?q=${encodeURIComponent(query)}`);
        const suggestions = await response.json();

        const container = document.getElementById('suggestions');
        container.innerHTML = '';

        if (suggestions.length === 0) {
            container.innerHTML = '<div class="suggestion-item" style="color: #999; cursor: default;">找不到相符的演員</div>';
        } else {
            suggestions.forEach((actor, index) => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.dataset.index = index;

                const stageName = actor.stage_names ? actor.stage_names.join(', ') : '無藝名';
                const studios = actor.studios ? actor.studios.join(', ') : '無';

                item.innerHTML = `
                    <strong>${escapeHtml(actor.actor_tag)}</strong>
                    <small>${escapeHtml(stageName)} (${escapeHtml(studios)})</small>
                `;

                item.addEventListener('click', () => {
                    document.getElementById('actorSearch').value = actor.actor_tag;
                    state.filters.search = actor.actor_tag;
                    state.currentPage = 1;
                    hideSuggestions();
                    performSearch();
                });

                container.appendChild(item);
            });
        }

        container.classList.add('show');
        state.keyboardSelectedIndex = -1;

    } catch (error) {
        console.error('獲取建議失敗:', error);
    }
}

function hideSuggestions() {
    document.getElementById('suggestions').classList.remove('show');
    state.keyboardSelectedIndex = -1;
}

function updateKeyboardSelection(items) {
    items.forEach((item, index) => {
        if (index === state.keyboardSelectedIndex) {
            item.style.background = '#f8f9fa';
            item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            item.style.background = '';
        }
    });
}

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

        if (state.filters.studios.length > 0) {
            params.append('studios', state.filters.studios.join(','));
        }

        const response = await fetch(`/api/actors/query?${params.toString()}`);
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
    document.getElementById('sortBy').value = 'name';
    document.getElementById('sortOrder').value = 'asc';

    state.filters = {
        search: '',
        studios: [],
        sort: 'name',
        sort_order: 'asc'
    };
    state.currentPage = 1;
    state.expandedActors.clear();

    performSearch();
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
                       globalStats.role_breakdown.giver + globalStats.role_breakdown.receiver) || 1;

    const globalRolePercentages = {
        top: Math.round((globalStats.role_breakdown.top / totalRoles) * 100),
        bottom: Math.round((globalStats.role_breakdown.bottom / totalRoles) * 100),
        giver: Math.round((globalStats.role_breakdown.giver / totalRoles) * 100),
        receiver: Math.round((globalStats.role_breakdown.receiver / totalRoles) * 100)
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

    // 5. 角色比例條形圖
    const chartDiv = document.createElement('div');
    chartDiv.className = 'role-chart';
    chartDiv.appendChild(createRoleBar(globalStats.role_breakdown, globalRolePercentages));

    // 6. 最新作品
    const latestSpan = document.createElement('span');
    latestSpan.className = 'latest-production';
    latestSpan.title = globalStats.latest_production_code || '無';
    latestSpan.textContent = globalStats.latest_production_code || '無';

    // 7. 最新日期
    const dateSpan = document.createElement('span');
    dateSpan.className = 'latest-date';
    dateSpan.textContent = globalStats.latest_release_date || '無';

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

    // 1. Spacer
    const spacer = document.createElement('div');
    spacer.style.display = 'none';

    // 2. 公司名稱和藝名
    const infoDiv = document.createElement('div');
    infoDiv.className = 'studio-info';

    const stageName = document.createElement('span');
    stageName.className = 'stage-name';
    stageName.textContent = studio.stage_name || '無藝名';

    const badge = document.createElement('span');
    badge.className = 'studio-badge';
    badge.style.background = studioColors[studio.studio_name] || '#95a5a6';
    badge.textContent = studio.studio_name;

    infoDiv.appendChild(stageName);
    infoDiv.appendChild(badge);

    // 3. 作品總數
    const productionSpan = document.createElement('span');
    productionSpan.className = 'production-count';
    productionSpan.textContent = studio.productions;

    // 4. 角色比例條形圖
    const chartDiv = document.createElement('div');
    chartDiv.className = 'role-chart';
    chartDiv.appendChild(createRoleBar(studio.role_breakdown, studio.role_percentage));

    // 5. 最新作品
    const latestSpan = document.createElement('span');
    latestSpan.className = 'latest-production';
    latestSpan.textContent = '---';

    // 6. 最新日期
    const dateSpan = document.createElement('span');
    dateSpan.className = 'latest-date';
    dateSpan.textContent = studio.latest_date || '無';

    // 組合所有元素
    const gridItem = document.createElement('div');
    gridItem.style.gridColumn = '1 / -1';
    gridItem.style.display = 'contents';

    gridItem.appendChild(spacer);
    gridItem.appendChild(infoDiv);
    gridItem.appendChild(productionSpan);
    gridItem.appendChild(chartDiv);
    gridItem.appendChild(latestSpan);
    gridItem.appendChild(dateSpan);

    studioItem.appendChild(gridItem);

    return studioItem;
}

function createRoleBar(roleBreakdown, rolePercentages) {
    const chartBar = document.createElement('div');
    chartBar.className = 'chart-bar';

    const roles = ['top', 'bottom', 'giver', 'receiver'];
    const roleLabels = {
        top: 'Top',
        bottom: 'Bottom',
        giver: 'Giver',
        receiver: 'Receiver'
    };

    roles.forEach(role => {
        const count = roleBreakdown[role];
        const percentage = rolePercentages[role];

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
