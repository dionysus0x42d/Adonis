/**
 * GVDB 資料庫管理系統 - 編輯作品 JavaScript
 */

// 全域狀態
const state = {
    currentProduction: null,
    performers: [],
    performerToDelete: [],
    tags: [],
    availableTags: {},
    studios: [],
    keyboardSelectedIndex: -1,
    performerSearchKeyboardIndex: -1
};

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    await loadStudios();
    await loadFilterOptions();
    generateStudioCheckboxes();
    setupEventListeners();
});

// 載入公司清單
async function loadStudios() {
    try {
        const response = await fetch(`${API_BASE}/api/studios`);
        state.studios = await response.json();

        // 填充公司下拉選單
        const select = document.getElementById('studioId');
        state.studios.forEach(studio => {
            const option = document.createElement('option');
            option.value = studio.id;
            option.textContent = studio.name;
            select.appendChild(option);
        });

        // 填充演員公司下拉選單
        const performerStudioSelect = document.getElementById('performerStudioId');
        state.studios.forEach(studio => {
            const option = document.createElement('option');
            option.value = studio.id;
            option.textContent = studio.name;
            performerStudioSelect.appendChild(option);
        });
    } catch (error) {
        console.error('載入公司清單失敗:', error);
    }
}

// 載入篩選選項（用於標籤）
async function loadFilterOptions() {
    try {
        const response = await fetch(`${API_BASE}/api/filter-options`);
        const data = await response.json();
        state.availableTags = data.tags;
    } catch (error) {
        console.error('載入標籤選項失敗:', error);
    }
}

// 生成公司複選框（預設不選，表示搜尋全部）
function generateStudioCheckboxes() {
    const container = document.getElementById('studioFilters');
    container.innerHTML = '';

    state.studios.forEach(studio => {
        const label = document.createElement('label');
        label.className = 'checkbox-filter-label';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = studio.id;
        input.checked = false;  // 預設不選（表示搜尋所有公司）

        const span = document.createElement('span');
        span.textContent = studio.name;

        label.appendChild(input);
        label.appendChild(span);
        container.appendChild(label);
    });
}

// 設定事件監聽
function setupEventListeners() {
    const productionSearchInput = document.getElementById('productionSearch');

    // 類型篩選變更
    document.getElementById('filterTypeSingle').addEventListener('change', triggerSearch);
    document.getElementById('filterTypeAlbum').addEventListener('change', triggerSearch);
    document.getElementById('filterTypeSegment').addEventListener('change', triggerSearch);

    // 公司篩選變更
    document.getElementById('studioFilters').addEventListener('change', triggerSearch);

    // 作品搜尋
    productionSearchInput.addEventListener('input', debounce(async (e) => {
        const query = e.target.value.trim();

        if (query.length === 0) {
            hideProductionSuggestions();
            return;
        }

        if (query.length >= 1) {
            await searchProductions(query);
        }
    }, 300));

    // 鍵盤導航
    productionSearchInput.addEventListener('keydown', (e) => {
        const suggestions = document.getElementById('productionSuggestions');
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
                hideProductionSuggestions();
                break;
        }
    });

    // 點擊外部關閉 suggestions
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#productionSearch') && !e.target.closest('#productionSuggestions')) {
            hideProductionSuggestions();
        }
    });

    // 演員搜尋
    const performerSearchInput = document.getElementById('performerSearch');
    performerSearchInput.addEventListener('input', debounce(async (e) => {
        const query = e.target.value.trim();
        const studioId = document.getElementById('performerStudioId').value;

        if (!studioId) {
            showFlashMessage('請先選擇公司', 'warning');
            return;
        }

        if (query.length === 0) {
            hidePerformerSuggestions();
            return;
        }

        if (query.length >= 1) {
            await searchPerformers(query, studioId);
        }
    }, 300));

    // 演員搜尋鍵盤導航
    performerSearchInput.addEventListener('keydown', (e) => {
        const suggestions = document.getElementById('performerSuggestions');
        const items = suggestions.querySelectorAll('.suggestion-item');

        if (items.length === 0) return;

        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                state.performerSearchKeyboardIndex = Math.min(state.performerSearchKeyboardIndex + 1, items.length - 1);
                updatePerformerKeyboardSelection(items);
                break;

            case 'ArrowUp':
                e.preventDefault();
                state.performerSearchKeyboardIndex = Math.max(state.performerSearchKeyboardIndex - 1, -1);
                updatePerformerKeyboardSelection(items);
                break;

            case 'Enter':
                e.preventDefault();
                if (state.performerSearchKeyboardIndex >= 0 && state.performerSearchKeyboardIndex < items.length) {
                    items[state.performerSearchKeyboardIndex].click();
                }
                break;

            case 'Escape':
                e.preventDefault();
                hidePerformerSuggestions();
                break;
        }
    });

    // 演員公司選擇變更時重置搜尋
    document.getElementById('performerStudioId').addEventListener('change', () => {
        document.getElementById('performerSearch').value = '';
        hidePerformerSuggestions();
    });

    // 新增演員按鈕
    document.getElementById('addPerformerBtn').addEventListener('click', addPerformer);

    // 取消按鈕
    document.getElementById('cancelBtn').addEventListener('click', () => {
        clearForm();
    });

    // 表單送出
    document.getElementById('editProductionForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveProduction();
    });
}

// 觸發搜尋
function triggerSearch() {
    const searchInput = document.getElementById('productionSearch');
    const query = searchInput.value.trim();

    if (query.length > 0) {
        searchProductions(query);
    }
}

// 取得選定的篩選條件
function getSelectedFilters() {
    const types = [];
    if (document.getElementById('filterTypeSingle').checked) types.push('single');
    if (document.getElementById('filterTypeAlbum').checked) types.push('album');
    if (document.getElementById('filterTypeSegment').checked) types.push('segment');

    const studios = [];
    document.querySelectorAll('#studioFilters input:checked').forEach(checkbox => {
        studios.push(checkbox.value);
    });

    return {
        types: types.join(','),
        studios: studios.join(',')
    };
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

// 更新演員搜尋鍵盤選擇的視覺效果
function updatePerformerKeyboardSelection(items) {
    items.forEach((item, index) => {
        if (index === state.performerSearchKeyboardIndex) {
            item.classList.add('keyboard-selected');
            item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            item.classList.remove('keyboard-selected');
        }
    });
}

// 搜尋作品
async function searchProductions(query) {
    try {
        const filters = getSelectedFilters();
        const url = `${API_BASE}/api/search_productions?q=${encodeURIComponent(query)}&types=${encodeURIComponent(filters.types)}&studios=${encodeURIComponent(filters.studios)}`;
        const response = await fetch(url);
        const productions = await response.json();

        showProductionSuggestions(productions);
    } catch (error) {
        console.error('作品搜尋失敗:', error);
    }
}

// 顯示作品建議
function showProductionSuggestions(productions) {
    const suggestions = document.getElementById('productionSuggestions');
    suggestions.innerHTML = '';
    state.keyboardSelectedIndex = -1;

    if (productions.length === 0) {
        suggestions.innerHTML = '<div class="suggestion-item" style="cursor: default; color: #999;">找不到作品</div>';
        suggestions.classList.add('show');
        return;
    }

    productions.forEach(prod => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        const typeLabel = {
            'single': '單片',
            'album': '專輯',
            'segment': '片段'
        }[prod.type] || prod.type;

        let displayText = `${escapeHtml(prod.code)}`;
        if (prod.type === 'segment' && prod.parent_code) {
            displayText += ` (片段：${escapeHtml(prod.parent_code)})`;
        }

        item.innerHTML = `
            ${displayText}
            <span class="production-info" style="display: block; margin-top: 4px;">
                ${escapeHtml(prod.title || '(無標題)')} | ${escapeHtml(prod.studio_name || '?')} | ${typeLabel}
            </span>
        `;

        item.addEventListener('click', () => {
            selectProduction(prod.id);
        });

        suggestions.appendChild(item);
    });

    suggestions.classList.add('show');
}

// 隱藏作品建議
function hideProductionSuggestions() {
    const suggestions = document.getElementById('productionSuggestions');
    suggestions.classList.remove('show');
    state.keyboardSelectedIndex = -1;
}

// 選擇作品
async function selectProduction(productionId) {
    hideProductionSuggestions();
    document.getElementById('productionSearch').value = '';

    try {
        const response = await fetch(`${API_BASE}/api/production/${productionId}`);
        const productionData = await response.json();

        state.currentProduction = productionData;
        state.performers = [...productionData.performers];
        state.performerToDelete = [];

        // 更新可用標籤（包含 scenario 類別）
        if (productionData.available_tags) {
            state.availableTags = productionData.available_tags;
        }

        // 填充表單
        populateForm(productionData);

        // 顯示編輯區域
        document.getElementById('editSection').style.display = 'block';

        // 捲動到編輯區域
        document.getElementById('editSection').scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('載入作品資料失敗:', error);
        showFlashMessage('載入作品資料失敗，請稍後再試', 'error');
    }
}

// 填充表單
function populateForm(production) {
    document.getElementById('productionId').value = production.id;
    document.getElementById('productionCode').value = production.code;
    document.getElementById('productionType').textContent = {
        'single': '單片 (single)',
        'album': '專輯 (album)',
        'segment': '專輯片段 (segment)'
    }[production.type] || production.type;
    document.getElementById('productionTitle').value = production.title || '';
    document.getElementById('comment').value = production.comment || '';

    // 根據作品類型決定顯示哪些欄位
    const isSingleOrSegment = production.type === 'single' || production.type === 'segment';
    document.getElementById('performersSection').style.display = isSingleOrSegment ? 'block' : 'none';
    document.getElementById('tagsSection').style.display = isSingleOrSegment ? 'block' : 'none';
    document.getElementById('studioGroup').style.display = production.type !== 'segment' ? 'block' : 'none';
    document.getElementById('releaseDateGroup').style.display = production.type !== 'segment' ? 'block' : 'none';

    // 填充公司和日期
    const studioIdEl = document.getElementById('studioId');
    const releaseDateEl = document.getElementById('releaseDate');

    if (production.type === 'segment' && production.parent_album) {
        // 片段：禁用並顯示父專輯資訊
        const parentStudio = state.studios.find(s => s.id === production.parent_album.studio_id);
        studioIdEl.value = production.parent_album.studio_id || '';
        studioIdEl.disabled = true;
        studioIdEl.title = '片段繼承自父專輯，無法編輯';

        releaseDateEl.value = production.parent_album.release_date || '';
        releaseDateEl.disabled = true;
        releaseDateEl.title = '片段繼承自父專輯，無法編輯';
    } else {
        // 單片和專輯：可編輯
        studioIdEl.disabled = false;
        studioIdEl.value = production.studio_id || '';

        releaseDateEl.disabled = false;
        releaseDateEl.value = production.release_date || '';
    }

    // 渲染演員列表
    if (isSingleOrSegment) {
        renderPerformersTable();

        // 渲染標籤
        renderTagsCheckboxes(production.tags);
    }
}

// 渲染演員列表
function renderPerformersTable() {
    const tbody = document.getElementById('performersTable');
    tbody.innerHTML = '';

    if (state.performers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">尚無演員</td></tr>';
        return;
    }

    state.performers.forEach((perf, index) => {
        const tr = document.createElement('tr');
        tr.dataset.index = index;

        const roleLabel = {
            'top': 'Top',
            'bottom': 'Bottom',
            'giver': 'Giver',
            'receiver': 'Receiver',
            null: '-'
        }[perf.role] || '-';

        const typeLabel = {
            'named': 'Named',
            'anonymous': 'Anonymous',
            'masked': 'Masked',
            'pov_only': 'POV Only'
        }[perf.performer_type] || perf.performer_type;

        tr.innerHTML = `
            <td>${escapeHtml(perf.stage_name)}</td>
            <td>${escapeHtml(perf.studio_name)}</td>
            <td class="performer-role-cell">
                <span class="performer-role-display">${roleLabel}</span>
                <select class="performer-role-input" style="display: none;">
                    <option value="">-- 選擇角色 --</option>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                    <option value="giver">Giver</option>
                    <option value="receiver">Receiver</option>
                </select>
            </td>
            <td class="performer-type-cell">
                <span class="performer-type-display">${typeLabel}</span>
                <select class="performer-type-input" style="display: none;">
                    <option value="named">Named</option>
                    <option value="anonymous">Anonymous</option>
                    <option value="masked">Masked</option>
                    <option value="pov_only">POV Only</option>
                </select>
            </td>
            <td class="action-cell">
                <button type="button" class="btn-edit" onclick="editPerformer(${index})">編輯</button>
                <button type="button" class="btn-remove" onclick="removePerformer(${index})">移除</button>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

// 編輯演員
function editPerformer(index) {
    const tr = document.querySelector(`tr[data-index="${index}"]`);
    const roleDisplay = tr.querySelector('.performer-role-display');
    const roleInput = tr.querySelector('.performer-role-input');
    const typeDisplay = tr.querySelector('.performer-type-display');
    const typeInput = tr.querySelector('.performer-type-input');
    const actionCell = tr.querySelector('.action-cell');

    // 填充下拉選單當前值
    roleInput.value = state.performers[index].role || '';
    typeInput.value = state.performers[index].performer_type || 'named';

    // 切換到編輯模式
    roleDisplay.style.display = 'none';
    roleInput.style.display = 'inline-block';
    typeDisplay.style.display = 'none';
    typeInput.style.display = 'inline-block';

    actionCell.innerHTML = `
        <button type="button" class="btn-save" onclick="savePerformer(${index})">儲存</button>
        <button type="button" class="btn-cancel-edit" onclick="cancelEditPerformer(${index})">取消</button>
    `;
}

// 儲存演員編輯
function savePerformer(index) {
    const tr = document.querySelector(`tr[data-index="${index}"]`);
    const roleInput = tr.querySelector('.performer-role-input');
    const typeInput = tr.querySelector('.performer-type-input');

    // 更新狀態
    state.performers[index].role = roleInput.value || null;
    state.performers[index].performer_type = typeInput.value;
    state.performers[index].modified = true;

    // 重新渲染
    renderPerformersTable();
}

// 取消編輯演員
function cancelEditPerformer(index) {
    renderPerformersTable();
}

// 搜尋演員
async function searchPerformers(query, studioId) {
    try {
        const response = await fetch(`${API_BASE}/api/studio_actors/${studioId}`);
        const allActors = await response.json();

        // 進行本地過濾
        const filtered = allActors.filter(actor =>
            actor.stage_name.toLowerCase().includes(query.toLowerCase()) ||
            actor.actor_tag.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 10);

        showPerformerSuggestions(filtered);
    } catch (error) {
        console.error('演員搜尋失敗:', error);
    }
}

// 顯示演員建議
function showPerformerSuggestions(actors) {
    const suggestions = document.getElementById('performerSuggestions');
    suggestions.innerHTML = '';
    state.performerSearchKeyboardIndex = -1;

    if (actors.length === 0) {
        suggestions.innerHTML = '<div class="suggestion-item" style="cursor: default; color: #999;">找不到演員</div>';
        suggestions.classList.add('show');
        return;
    }

    actors.forEach(actor => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
            ${escapeHtml(actor.stage_name)}
            <span class="production-info" style="display: block; margin-top: 4px;">
                [${escapeHtml(actor.actor_tag)}]
            </span>
        `;

        item.addEventListener('click', () => {
            selectPerformer(actor);
        });

        suggestions.appendChild(item);
    });

    suggestions.classList.add('show');
}

// 隱藏演員建議
function hidePerformerSuggestions() {
    const suggestions = document.getElementById('performerSuggestions');
    suggestions.classList.remove('show');
    state.performerSearchKeyboardIndex = -1;
}

// 選擇演員
function selectPerformer(actor) {
    // 檢查是否已加入
    const exists = state.performers.some(p => p.stage_name_id === actor.id);
    if (exists) {
        showFlashMessage('此演員已在列表中', 'warning');
        return;
    }

    const role = document.getElementById('performerRole').value || null;
    const performerType = document.getElementById('performerType').value;

    // 新增演員
    state.performers.push({
        stage_name_id: actor.id,
        stage_name: actor.stage_name,
        studio_id: actor.studio_id,
        studio_name: actor.studio_name,
        role: role,
        performer_type: performerType,
        is_new: true
    });

    // 清空輸入
    document.getElementById('performerSearch').value = '';
    document.getElementById('performerRole').value = '';
    document.getElementById('performerType').value = 'named';
    hidePerformerSuggestions();

    // 重新渲染
    renderPerformersTable();
    showFlashMessage('✓ 演員已新增');
}

// 新增演員按鈕點擊事件
function addPerformer() {
    showFlashMessage('請從搜尋結果選擇演員', 'info');
}

// 移除演員
function removePerformer(index) {
    if (confirm('確定要移除此演員？')) {
        const performer = state.performers[index];
        if (!performer.is_new && performer.stage_name_id) {
            state.performerToDelete.push(performer.stage_name_id);
        }
        state.performers.splice(index, 1);
        renderPerformersTable();
    }
}

// 渲染標籤複選框
function renderTagsCheckboxes(currentTags) {
    state.tags = currentTags.map(t => t.tag_id);

    // 清空所有標籤容器
    document.getElementById('sexActTags').innerHTML = '';
    document.getElementById('styleTags').innerHTML = '';
    document.getElementById('scenarioTags').innerHTML = '';
    document.getElementById('bodyTypeTags').innerHTML = '';
    document.getElementById('sourceTags').innerHTML = '';

    // 對應 API 類別名稱到 HTML 容器 ID
    const containers = {
        'sex_act': document.getElementById('sexActTags'),
        'style': document.getElementById('styleTags'),
        'scenario': document.getElementById('scenarioTags'),
        'body_type': document.getElementById('bodyTypeTags'),
        'source': document.getElementById('sourceTags')
    };

    // 渲染每個類別的標籤
    for (const [categoryKey, tags] of Object.entries(state.availableTags)) {
        const container = containers[categoryKey];
        if (!container || !tags || !Array.isArray(tags)) continue;

        tags.forEach(tag => {
            const label = document.createElement('label');
            label.className = 'checkbox-label';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = tag.id;
            input.checked = state.tags.includes(tag.id);

            input.addEventListener('change', (e) => {
                if (e.target.checked) {
                    if (!state.tags.includes(tag.id)) {
                        state.tags.push(tag.id);
                    }
                } else {
                    state.tags = state.tags.filter(id => id !== tag.id);
                }
            });

            const span = document.createElement('span');
            // Handle both regular tags and style tags with display_name
            span.textContent = tag.display_name ? tag.display_name : tag.name;

            label.appendChild(input);
            label.appendChild(span);
            container.appendChild(label);
        });
    }
}

// 顯示訊息橫幅
function showFlashMessage(message, category = 'success', duration = 3000) {
    let flashContainer = document.querySelector('.flash-messages');
    if (!flashContainer) {
        flashContainer = document.createElement('div');
        flashContainer.className = 'flash-messages';
        document.querySelector('main.container').insertBefore(flashContainer, document.querySelector('.page-header') || document.querySelector('main.container').firstChild);
    }

    const messageEl = document.createElement('div');
    messageEl.className = `flash-message flash-${category}`;
    messageEl.textContent = message;
    flashContainer.appendChild(messageEl);

    setTimeout(() => {
        messageEl.remove();
    }, duration);
}

// 儲存作品資料
async function saveProduction() {
    const productionId = document.getElementById('productionId').value;
    const code = document.getElementById('productionCode').value.trim();
    const title = document.getElementById('productionTitle').value.trim() || null;
    const comment = document.getElementById('comment').value.trim() || null;

    if (!code) {
        showFlashMessage('作品編號不可為空', 'error');
        return;
    }

    // 取得可能的 release_date 和 studio_id（如果未被禁用）
    const releaseDateEl = document.getElementById('releaseDate');
    const studioIdEl = document.getElementById('studioId');

    const releaseDate = (releaseDateEl && !releaseDateEl.disabled && releaseDateEl.value) ? releaseDateEl.value.trim() : null;
    const studioId = (studioIdEl && !studioIdEl.disabled && studioIdEl.value) ? parseInt(studioIdEl.value) : null;

    const requestData = {
        code: code,
        title: title,
        comment: comment,
        release_date: releaseDate,
        studio_id: studioId,
        performers: state.performers.map(p => ({
            stage_name_id: p.stage_name_id,
            role: p.role,
            performer_type: p.performer_type,
            is_new: p.is_new,
            modified: p.modified
        })),
        tags: state.tags,
        delete_performers: state.performerToDelete
    };

    try {
        const response = await fetch(`${API_BASE}/api/production/${productionId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();

        if (response.ok) {
            showFlashMessage('✓ 作品資料已儲存');
            setTimeout(() => {
                clearForm();
            }, 1000);
        } else {
            showFlashMessage('儲存失敗: ' + (result.error || '未知錯誤'), 'error');
        }

    } catch (error) {
        console.error('儲存失敗:', error);
        showFlashMessage('儲存失敗，請稱後再試', 'error');
    }
}

// 清空表單
function clearForm() {
    // 清空狀態
    state.currentProduction = null;
    state.performers = [];
    state.performerToDelete = [];
    state.tags = [];

    // 隱藏編輯區域
    document.getElementById('editSection').style.display = 'none';

    // 重新啟用所有表單欄位（以防被禁用）
    const studioIdEl = document.getElementById('studioId');
    const releaseDateEl = document.getElementById('releaseDate');
    if (studioIdEl) studioIdEl.disabled = false;
    if (releaseDateEl) releaseDateEl.disabled = false;

    // 清空搜尋框和隱藏建議
    document.getElementById('productionSearch').value = '';
    const suggestions = document.getElementById('productionSuggestions');
    if (suggestions) {
        suggestions.classList.remove('show');
    }

    // 焦點回到搜尋框
    document.getElementById('productionSearch').focus();
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
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
