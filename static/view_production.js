// 全域狀態
const state = {
    currentPage: 1,
    perPage: 30,
    filters: {
        studios: [],
        actors: [],
        types: [],
        sex_acts: [],
        styles: [],
        body_types: [],
        sources: [],
        keyword: '',
        date_from: '',
        date_to: ''
    },
    selectedActors: [], // { stage_name_id, stage_name, studio_name }
    expandedAlbums: new Set(), // 已展開的 album IDs
    filterOptions: null, // 儲存所有可用的篩選選項（包含圖示和排序）
    keyboardSelectedIndex: -1, // 鍵盤選擇的建議索引
    sortFields: ['studio', 'code', 'title', 'date'], // 排序欄位
    sortOrders: {
        studio: 'asc',
        code: 'asc',
        title: 'asc',
        date: 'asc'
    }
};

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    await loadFilterOptions();
    setupEventListeners();
    await performSearch();
});

// 載入篩選選項
async function loadFilterOptions() {
    try {
        const response = await fetch('/api/filter-options');
        state.filterOptions = await response.json();
        
        renderStudioFilters();
        renderTagFilters();
    } catch (error) {
        console.error('載入篩選選項失敗:', error);
    }
}

// 渲染公司篩選器
function renderStudioFilters() {
    const container = document.getElementById('studioFilters');
    container.innerHTML = '';
    
    state.filterOptions.studios.forEach(studio => {
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" value="${studio}" data-filter="studios">
            <span>${studio}</span>
        `;
        container.appendChild(label);
    });
}

// 渲染 Tag 篩選器
function renderTagFilters() {
    const categories = {
        'sex_acts': { id: 'sexActFilters' },
        'styles': { id: 'styleFilters' },
        'body_types': { id: 'bodyTypeFilters' },
        'sources': { id: 'sourceFilters' }
    };
    
    Object.entries(categories).forEach(([category, config]) => {
        const container = document.getElementById(config.id);
        if (!container) return;
        
        container.innerHTML = '';
        
        // 從後端獲取的標籤資料（已經排序和包含圖示）
        const tagData = state.filterOptions.tags[category] || [];
        
        tagData.forEach(item => {
            const label = document.createElement('label');
            
            // item 可能是字串（舊格式）或物件（新格式）
            const tagName = typeof item === 'string' ? item : item.name;
            const displayName = typeof item === 'object' && item.display_name ? item.display_name : tagName;
            
            label.innerHTML = `
                <input type="checkbox" value="${tagName}" data-filter="${category}">
                <span>${displayName}</span>
            `;
            
            container.appendChild(label);
        });
    });
}

// 設定事件監聽
function setupEventListeners() {
    // 篩選條件變更
    document.addEventListener('change', (e) => {
        if (e.target.matches('input[type="checkbox"][data-filter]')) {
            updateFiltersFromCheckboxes();
            state.currentPage = 1;
            performSearch();
        }
    });
    
    // 每頁顯示數量
    document.getElementById('perPage').addEventListener('change', (e) => {
        state.perPage = parseInt(e.target.value);
        state.currentPage = 1;
        performSearch();
    });
    
    // 完整顯示切換
    document.getElementById('fullDisplay').addEventListener('change', (e) => {
        document.body.classList.toggle('full-display', e.target.checked);
    });
    
    // 關鍵字搜尋
    document.getElementById('keyword').addEventListener('input', debounce((e) => {
        state.filters.keyword = e.target.value.trim();
        state.currentPage = 1;
        performSearch();
    }, 500));
    
    // 日期範圍
    document.getElementById('dateFrom').addEventListener('change', (e) => {
        state.filters.date_from = e.target.value.trim();
        state.currentPage = 1;
        performSearch();
    });
    
    document.getElementById('dateTo').addEventListener('change', (e) => {
        state.filters.date_to = e.target.value.trim();
        state.currentPage = 1;
        performSearch();
    });
    
    // 清除篩選
    document.getElementById('clearFilters').addEventListener('click', clearAllFilters);
    
    // 排序按鈕
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const field = btn.dataset.field;
            handleSortClick(field);
        });
    });
    
    // 演員搜尋
    setupActorSearch();
}

// 演員搜尋設定
function setupActorSearch() {
    const actorSearchInput = document.getElementById('actorSearch');
    
    actorSearchInput.addEventListener('input', debounce(async (e) => {
        const query = e.target.value.trim();
        
        if (query.length === 0) {
            hideActorSuggestions();
            return;
        }
        
        if (query.length >= 1) {
            await searchActors(query);
        }
    }, 300));
    
    // 鍵盤導航
    actorSearchInput.addEventListener('keydown', (e) => {
        const suggestions = document.getElementById('actorSuggestions');
        const items = suggestions.querySelectorAll('.suggestion-item');
        
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
                if (state.keyboardSelectedIndex >= 0 && state.keyboardSelectedIndex < items.length) {
                    items[state.keyboardSelectedIndex].click();
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                hideActorSuggestions();
                break;
        }
    });
    
    // 點擊外部關閉 suggestions
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#actorSearch') && !e.target.closest('#actorSuggestions')) {
            hideActorSuggestions();
        }
    });
}

// 更新鍵盤選擇的視覺效果
function updateKeyboardSelection(items) {
    items.forEach((item, index) => {
        if (index === state.keyboardSelectedIndex) {
            item.classList.add('keyboard-selected');
            item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            item.classList.remove('keyboard-selected');
        }
    });
}

// 更新篩選狀態 (從 checkboxes)
function updateFiltersFromCheckboxes() {
    const filterTypes = ['studios', 'types', 'sex_acts', 'styles', 'body_types', 'sources'];
    
    filterTypes.forEach(type => {
        const checkboxes = document.querySelectorAll(`input[data-filter="${type}"]:checked`);
        state.filters[type] = Array.from(checkboxes).map(cb => cb.value);
    });
}

// 演員搜尋
async function searchActors(query) {
    try {
        const response = await fetch(`/api/actors/search?q=${encodeURIComponent(query)}`);
        const actors = await response.json();
        
        showActorSuggestions(actors);
    } catch (error) {
        console.error('演員搜尋失敗:', error);
    }
}

// 顯示演員建議
function showActorSuggestions(actors) {
    const suggestions = document.getElementById('actorSuggestions');
    suggestions.innerHTML = '';
    state.keyboardSelectedIndex = -1;
    
    if (actors.length === 0) {
        suggestions.innerHTML = '<div class="no-results">找不到演員</div>';
        suggestions.classList.add('show');
        return;
    }
    
    actors.forEach(actor => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
            ${actor.stage_name}
            <span class="actor-studio">${actor.studio_name}</span>
        `;
        
        item.addEventListener('click', () => {
            selectActor(actor);
        });
        
        suggestions.appendChild(item);
    });
    
    suggestions.classList.add('show');
}

// 隱藏演員建議
function hideActorSuggestions() {
    const suggestions = document.getElementById('actorSuggestions');
    suggestions.classList.remove('show');
    state.keyboardSelectedIndex = -1;
}

// 選擇演員
function selectActor(actor) {
    // 檢查是否已選擇
    if (state.selectedActors.some(a => a.stage_name_id === actor.stage_name_id)) {
        return;
    }
    
    state.selectedActors.push({
        stage_name_id: actor.stage_name_id,
        stage_name: actor.stage_name,
        studio_name: actor.studio_name
    });
    
    state.filters.actors = state.selectedActors.map(a => a.stage_name_id);
    
    renderSelectedActors();
    hideActorSuggestions();
    document.getElementById('actorSearch').value = '';
    
    state.currentPage = 1;
    performSearch();
}

// 渲染已選演員
function renderSelectedActors() {
    const container = document.getElementById('selectedActors');
    container.innerHTML = '';
    
    state.selectedActors.forEach(actor => {
        const item = document.createElement('div');
        item.className = 'selected-item';
        item.innerHTML = `
            ${actor.stage_name} (${actor.studio_name})
            <span class="remove" data-id="${actor.stage_name_id}">×</span>
        `;
        
        item.querySelector('.remove').addEventListener('click', () => {
            removeSelectedActor(actor.stage_name_id);
        });
        
        container.appendChild(item);
    });
}

// 移除已選演員
function removeSelectedActor(stageNameId) {
    state.selectedActors = state.selectedActors.filter(a => a.stage_name_id !== stageNameId);
    state.filters.actors = state.selectedActors.map(a => a.stage_name_id);
    
    renderSelectedActors();
    state.currentPage = 1;
    performSearch();
}

// 清除所有篩選
function clearAllFilters() {
    // 清除所有 checkbox
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    
    // 清除輸入框
    document.getElementById('keyword').value = '';
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    document.getElementById('actorSearch').value = '';
    
    // 清除狀態
    state.filters = {
        studios: [],
        actors: [],
        types: [],
        sex_acts: [],
        styles: [],
        body_types: [],
        sources: [],
        keyword: '',
        date_from: '',
        date_to: ''
    };
    state.selectedActors = [];
    state.currentPage = 1;
    
    // 重置排序
    state.sortFields = ['studio', 'code', 'title', 'date'];
    state.sortOrders = {
        studio: 'asc',
        code: 'asc',
        title: 'asc',
        date: 'asc'
    };
    
    // 重置排序按鈕狀態和文字
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.dataset.order = 'asc';
        const field = btn.dataset.field;
        const fieldName = field.charAt(0).toUpperCase() + field.slice(1);
        btn.textContent = `${fieldName} ▲`;
    });
    document.querySelector('.sort-btn[data-field="studio"]').classList.add('active');
    
    renderSelectedActors();
    performSearch();
}

// 建立排序字串
function buildSortString() {
    return state.sortFields.map(field => {
        const order = state.sortOrders[field];
        return `${field}_${order}`;
    }).join(',');
}

// 執行搜尋
async function performSearch() {
    showLoading();
    
    try {
        const params = new URLSearchParams();
        params.append('page', state.currentPage);
        params.append('per_page', state.perPage);
        params.append('sort', buildSortString());
        
        // 加入篩選條件
        if (state.filters.studios.length > 0) {
            params.append('studios', state.filters.studios.join(','));
        }
        if (state.filters.types.length > 0) {
            params.append('types', state.filters.types.join(','));
        }
        if (state.filters.actors.length > 0) {
            params.append('actors', state.filters.actors.join(','));
        }
        if (state.filters.sex_acts.length > 0) {
            params.append('sex_acts', state.filters.sex_acts.join(','));
        }
        if (state.filters.styles.length > 0) {
            params.append('styles', state.filters.styles.join(','));
        }
        if (state.filters.body_types.length > 0) {
            params.append('body_types', state.filters.body_types.join(','));
        }
        if (state.filters.sources.length > 0) {
            params.append('sources', state.filters.sources.join(','));
        }
        if (state.filters.keyword) {
            params.append('keyword', state.filters.keyword);
        }
        if (state.filters.date_from) {
            params.append('date_from', state.filters.date_from);
        }
        if (state.filters.date_to) {
            params.append('date_to', state.filters.date_to);
        }
        
        const response = await fetch(`/api/search?${params.toString()}`);
        const data = await response.json();
        
        renderResults(data);
        renderPagination(data);
        updateResultCount(data.total);
        
    } catch (error) {
        console.error('搜尋失敗:', error);
        showError('搜尋失敗，請稍後再試');
    }
}

// 顯示載入中
function showLoading() {
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 50px;">載入中...</td></tr>';
}

// 顯示錯誤
function showError(message) {
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 50px; color: #dc3545;">${message}</td></tr>`;
}

// 渲染結果
function renderResults(data) {
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';
    
    if (data.results.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="no-results-message">沒有符合條件的作品</td></tr>';
        return;
    }
    
    data.results.forEach(item => {
        const row = createResultRow(item);
        tbody.appendChild(row);
        
        // 如果是已展開的專輯，渲染其片段
        if (item.type === 'album' && state.expandedAlbums.has(item.id)) {
            renderSegments(item.id, tbody);
        }
    });
}

// 建立結果列
function createResultRow(item) {
    const tr = document.createElement('tr');
    
    if (item.type === 'album') {
        tr.className = 'album-row';
    } else if (item.type === 'segment') {
        tr.className = 'segment-row';
    }
    
    const isExpanded = state.expandedAlbums.has(item.id);
    const toggleIcon = item.type === 'album' ? (isExpanded ? '▼' : '▶') : '';
    
    tr.innerHTML = `
        <td class="toggle-btn" data-id="${item.id}" data-type="${item.type}">${toggleIcon}</td>
        <td>${escapeHtml(item.code || '')}</td>
        <td><span class="studio-badge" style="background-color: ${getStudioColor(item.studio)}">${escapeHtml(item.studio || '')}</span></td>
        <td class="truncate">${escapeHtml(item.title || '')}</td>
        <td>${escapeHtml(item.release_date || '')}</td>
        <td class="truncate">${escapeHtml(item.actors || '')}</td>
        <td>${renderTags(item.sex_acts, 'sex-act')}</td>
        <td>${renderTags(item.styles, 'style')}</td>
        <td>${renderTags(item.body_types, 'body-type')}</td>
        <td>${renderTags(item.sources, 'source')}</td>
        <td class="truncate">${escapeHtml(item.comment || '')}</td>
    `;
    
    // 專輯展開/收合
    if (item.type === 'album') {
        const toggleBtn = tr.querySelector('.toggle-btn');
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.addEventListener('click', () => {
            toggleAlbum(item.id);
        });
    }
    
    return tr;
}

// 渲染標籤
function renderTags(tags, type) {
    if (!tags || tags.length === 0) return '';
    
    return tags.map(tag => `<span class="tag-badge tag-${type}">${escapeHtml(tag)}</span>`).join(' ');
}

// 取得公司顏色
function getStudioColor(studio) {
    const colors = {
        'Coat': '#FF6B6B',
        'JUSTICE': '#4ECDC4',
        'ACCEED': '#95E1D3',
        'Carabineer': '#F38181',
        'Omega Tribe': '#AA96DA',
        'K-Tribe': '#FCBAD3',
        'Hunters': '#A8D8EA'
    };
    return colors[studio] || '#E0E0E0';
}

// 展開/收合專輯
async function toggleAlbum(albumId) {
    if (state.expandedAlbums.has(albumId)) {
        // 收合
        state.expandedAlbums.delete(albumId);
        removeSegments(albumId);
    } else {
        // 展開
        state.expandedAlbums.add(albumId);
        await renderSegments(albumId);
    }
    
    // 更新展開按鈕
    const toggleBtn = document.querySelector(`.toggle-btn[data-id="${albumId}"]`);
    if (toggleBtn) {
        toggleBtn.textContent = state.expandedAlbums.has(albumId) ? '▼' : '▶';
    }
}

// 渲染片段
async function renderSegments(albumId, tbody = null) {
    try {
        const response = await fetch(`/api/segments/${albumId}`);
        const segments = await response.json();
        
        if (!tbody) {
            tbody = document.getElementById('resultsBody');
        }
        
        const albumRow = tbody.querySelector(`.toggle-btn[data-id="${albumId}"]`)?.closest('tr');
        if (!albumRow) return;
        
        // 移除舊的片段
        removeSegments(albumId);
        
        // 插入新片段
        let insertAfter = albumRow;
        segments.forEach(segment => {
            const segmentRow = createResultRow(segment);
            insertAfter.insertAdjacentElement('afterend', segmentRow);
            insertAfter = segmentRow;
        });
        
    } catch (error) {
        console.error('載入片段失敗:', error);
    }
}

// 移除片段
function removeSegments(albumId) {
    const tbody = document.getElementById('resultsBody');
    const albumRow = tbody.querySelector(`.toggle-btn[data-id="${albumId}"]`)?.closest('tr');
    if (!albumRow) return;
    
    let nextRow = albumRow.nextElementSibling;
    while (nextRow && nextRow.classList.contains('segment-row')) {
        const toRemove = nextRow;
        nextRow = nextRow.nextElementSibling;
        toRemove.remove();
    }
}

// 渲染分頁
function renderPagination(data) {
    const container = document.getElementById('pagination');
    container.innerHTML = '';
    
    const totalPages = data.total_pages;
    
    if (totalPages <= 1) return;
    
    // 上一頁
    const prevBtn = createPageButton('‹ 上一頁', state.currentPage - 1, state.currentPage === 1);
    container.appendChild(prevBtn);
    
    // 頁碼
    const maxButtons = 7;
    let startPage = Math.max(1, state.currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    
    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }
    
    if (startPage > 1) {
        container.appendChild(createPageButton(1, 1));
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.className = 'page-btn';
            ellipsis.style.cursor = 'default';
            container.appendChild(ellipsis);
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const btn = createPageButton(i, i);
        if (i === state.currentPage) {
            btn.classList.add('active');
        }
        container.appendChild(btn);
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.className = 'page-btn';
            ellipsis.style.cursor = 'default';
            container.appendChild(ellipsis);
        }
        container.appendChild(createPageButton(totalPages, totalPages));
    }
    
    // 下一頁
    const nextBtn = createPageButton('下一頁 ›', state.currentPage + 1, state.currentPage === totalPages);
    container.appendChild(nextBtn);
}

// 建立分頁按鈕
function createPageButton(text, page, disabled = false) {
    const btn = document.createElement('button');
    btn.className = 'page-btn';
    btn.textContent = text;
    btn.disabled = disabled;
    
    if (!disabled) {
        btn.addEventListener('click', () => {
            state.currentPage = page;
            performSearch();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
    
    return btn;
}

// 更新結果數量
function updateResultCount(total) {
    const countElement = document.getElementById('resultCount');
    countElement.textContent = `共 ${total} 筆結果`;
}

// 處理排序點擊
function handleSortClick(field) {
    // 如果欄位已經在排序列表中
    const fieldIndex = state.sortFields.indexOf(field);
    
    if (fieldIndex === 0) {
        // 如果是第一個排序欄位，切換排序方向
        state.sortOrders[field] = state.sortOrders[field] === 'asc' ? 'desc' : 'asc';
    } else {
        // 如果不是第一個，將其移到最前面，並重置為遞增
        state.sortFields = state.sortFields.filter(f => f !== field);
        state.sortFields.unshift(field);
        state.sortOrders[field] = 'asc';
    }
    
    // 更新所有排序按鈕的視覺狀態
    updateSortButtons();
    
    // 執行搜尋
    state.currentPage = 1;
    performSearch();
}

// 更新排序按鈕
function updateSortButtons() {
    document.querySelectorAll('.sort-btn').forEach(btn => {
        const field = btn.dataset.field;
        const fieldIndex = state.sortFields.indexOf(field);
        const order = state.sortOrders[field];
        const arrow = order === 'asc' ? '▲' : '▼';
        const fieldName = field.charAt(0).toUpperCase() + field.slice(1);
        
        // 更新按鈕文字
        btn.textContent = `${fieldName} ${arrow}`;
        btn.dataset.order = order;
        
        // 更新 active 狀態（只有第一個排序欄位才會是 active）
        if (fieldIndex === 0) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Debounce 函數
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

// HTML 跳脫
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}