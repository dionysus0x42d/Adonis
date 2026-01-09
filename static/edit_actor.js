// 全域狀態
const state = {
    currentActor: null,
    stageNames: [],
    studios: [],
    keyboardSelectedIndex: -1
};

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    await loadStudios();
    setupEventListeners();
});

// 載入公司清單
async function loadStudios() {
    try {
        const response = await fetch(`${API_BASE}/api/studios`);
        state.studios = await response.json();
        
        // 填充下拉選單
        const select = document.getElementById('newStudioId');
        state.studios.forEach(studio => {
            const option = document.createElement('option');
            option.value = studio.id;
            option.textContent = studio.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('載入公司清單失敗:', error);
    }
}

// 設定事件監聽
function setupEventListeners() {
    const actorSearchInput = document.getElementById('actorSearch');
    
    // 演員搜尋
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
    
    // 新增藝名按鈕
    document.getElementById('addStageNameBtn').addEventListener('click', addStageName);
    
    // 取消按鈕
    document.getElementById('cancelBtn').addEventListener('click', () => {
        if (confirm('確定要取消編輯？未儲存的修改將會遺失。')) {
            clearForm();
        }
    });
    
    // 表單送出
    document.getElementById('editActorForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveActor();
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

// 搜尋演員
async function searchActors(query) {
    try {
        const response = await fetch(`${API_BASE}/api/actors/search?q=${encodeURIComponent(query)}`);
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
        suggestions.innerHTML = '<div class="suggestion-item" style="cursor: default; color: #999;">找不到演員</div>';
        suggestions.classList.add('show');
        return;
    }
    
    actors.forEach(actor => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
            ${actor.stage_name} (${actor.studio_name})
            <span class="actor-info">[${actor.actor_name}]</span>
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
async function selectActor(actor) {
    hideActorSuggestions();
    document.getElementById('actorSearch').value = '';
    
    // 載入演員完整資料
    try {
        const response = await fetch(`${API_BASE}/api/actor/${actor.actor_id}`);
        const actorData = await response.json();
        
        state.currentActor = actorData;
        state.stageNames = actorData.stage_names;
        
        // 填充表單
        document.getElementById('actorId').value = actorData.id;
        document.getElementById('actorTag').value = actorData.actor_tag;
        document.getElementById('gvdbId').value = actorData.gvdb_id || '';
        document.getElementById('notes').value = actorData.notes || '';
        
        // 渲染藝名列表
        renderStageNames();
        
        // 顯示編輯區域
        document.getElementById('editSection').style.display = 'block';
        
        // 捲動到編輯區域
        document.getElementById('editSection').scrollIntoView({ behavior: 'smooth' });
        
    } catch (error) {
        console.error('載入演員資料失敗:', error);
        alert('載入演員資料失敗，請稍後再試');
    }
}

// 渲染藝名列表
function renderStageNames() {
    const tbody = document.getElementById('stageNamesTable');
    tbody.innerHTML = '';
    
    if (state.stageNames.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #999;">尚無藝名</td></tr>';
        return;
    }
    
    state.stageNames.forEach((sn, index) => {
        const tr = document.createElement('tr');
        tr.dataset.index = index;
        
        tr.innerHTML = `
            <td>${escapeHtml(sn.studio_name)}</td>
            <td class="stage-name-cell">
                <span class="stage-name-display">${escapeHtml(sn.stage_name)}</span>
                <input type="text" class="stage-name-input" value="${escapeHtml(sn.stage_name)}" style="display: none;">
            </td>
            <td class="action-cell">
                <button type="button" class="btn-edit" onclick="editStageName(${index})">編輯</button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

// 編輯藝名
function editStageName(index) {
    const tr = document.querySelector(`tr[data-index="${index}"]`);
    const display = tr.querySelector('.stage-name-display');
    const input = tr.querySelector('.stage-name-input');
    const actionCell = tr.querySelector('.action-cell');
    
    // 切換到編輯模式
    display.style.display = 'none';
    input.style.display = 'block';
    input.focus();
    
    actionCell.innerHTML = `
        <button type="button" class="btn-save" onclick="saveStageName(${index})">儲存</button>
        <button type="button" class="btn-cancel-edit" onclick="cancelEditStageName(${index})">取消</button>
    `;
}

// 儲存藝名編輯
function saveStageName(index) {
    const tr = document.querySelector(`tr[data-index="${index}"]`);
    const input = tr.querySelector('.stage-name-input');
    const newName = input.value.trim();
    
    if (!newName) {
        alert('藝名不可為空');
        return;
    }
    
    // 更新狀態
    state.stageNames[index].stage_name = newName;
    state.stageNames[index].modified = true;
    
    // 重新渲染
    renderStageNames();
}

// 取消編輯藝名
function cancelEditStageName(index) {
    renderStageNames();
}

// 新增藝名
function addStageName() {
    const studioId = document.getElementById('newStudioId').value;
    const stageName = document.getElementById('newStageName').value.trim();
    
    if (!studioId) {
        alert('請選擇公司');
        return;
    }
    
    if (!stageName) {
        alert('請輸入藝名');
        return;
    }
    
    // 檢查是否已有該公司的藝名
    const exists = state.stageNames.some(sn => sn.studio_id == studioId);
    if (exists) {
        alert('此公司已有藝名，請改用編輯功能修改');
        return;
    }
    
    // 找到公司名稱
    const studio = state.studios.find(s => s.id == studioId);
    
    // 加入列表
    state.stageNames.push({
        studio_id: studioId,
        studio_name: studio.name,
        stage_name: stageName,
        is_new: true
    });
    
    // 清空輸入
    document.getElementById('newStudioId').value = '';
    document.getElementById('newStageName').value = '';
    
    // 重新渲染
    renderStageNames();
}

// 顯示訊息橫幅（自動消失）
function showFlashMessage(message, category = 'success', duration = 3000) {
    // 取得或創建 flash-messages 容器
    let flashContainer = document.querySelector('.flash-messages');
    if (!flashContainer) {
        flashContainer = document.createElement('div');
        flashContainer.className = 'flash-messages';
        document.querySelector('main.container').insertBefore(flashContainer, document.querySelector('.page-header') || document.querySelector('main.container').firstChild);
    }

    // 創建訊息元素
    const messageEl = document.createElement('div');
    messageEl.className = `flash-message flash-${category}`;
    messageEl.textContent = message;
    flashContainer.appendChild(messageEl);

    // 自動消失
    setTimeout(() => {
        messageEl.remove();
    }, duration);
}

// 儲存演員資料
async function saveActor() {
    const actorId = document.getElementById('actorId').value;
    const actorTag = document.getElementById('actorTag').value.trim();
    const gvdbId = document.getElementById('gvdbId').value.trim() || null;
    const notes = document.getElementById('notes').value.trim() || null;

    if (!actorTag) {
        showFlashMessage('Actor Tag 不可為空', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/actor/${actorId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                actor_tag: actorTag,
                gvdb_id: gvdbId,
                notes: notes,
                stage_names: state.stageNames
            })
        });

        const result = await response.json();

        if (response.ok) {
            showFlashMessage('✓ 演員資料已儲存');
            clearForm();
        } else {
            showFlashMessage('儲存失敗: ' + (result.error || '未知錯誤'), 'error');
        }

    } catch (error) {
        console.error('儲存失敗:', error);
        showFlashMessage('儲存失敗，請稍後再試', 'error');
    }
}

// 清空表單
function clearForm() {
    state.currentActor = null;
    state.stageNames = [];
    
    document.getElementById('actorId').value = '';
    document.getElementById('actorTag').value = '';
    document.getElementById('gvdbId').value = '';
    document.getElementById('notes').value = '';
    document.getElementById('newStudioId').value = '';
    document.getElementById('newStageName').value = '';
    
    renderStageNames();
    
    document.getElementById('editSection').style.display = 'none';
    document.getElementById('actorSearch').value = '';
    document.getElementById('actorSearch').focus();
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
