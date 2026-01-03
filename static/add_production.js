/**
 * 新增作品表單 - JavaScript
 */

let currentActors = [];  // 儲存當前公司的演員清單
let selectedStudioId = null;  // 當前選擇的公司 ID

// ========== 表單可見性控制 ==========

function updateFormVisibility() {
    const type = document.querySelector('input[name="type"]:checked').value;
    
    const basicDataSection = document.getElementById('basic-data-section');
    const segmentDataSection = document.getElementById('segment-data-section');
    const actorsSection = document.getElementById('actors-section');
    const tagsSection = document.getElementById('tags-section');
    
    // 基本資料欄位
    const codeInput = document.getElementById('code');
    const releaseDateInput = document.getElementById('release_date');
    const studioRadios = document.querySelectorAll('input[name="studio_id"]');
    const basicTitleInput = document.getElementById('title');
    
    // 片段資料欄位
    const segmentTitleInput = document.getElementById('segment_title');
    
    if (type === 'single') {
        // 單片：顯示基本資料、演員、標籤
        basicDataSection.style.display = 'block';
        segmentDataSection.style.display = 'none';
        actorsSection.style.display = 'block';
        tagsSection.style.display = 'block';
        
        // 設定必填
        codeInput.required = true;
        releaseDateInput.required = true;
        studioRadios.forEach(radio => radio.required = true);
        
        // 啟用基本資料的 title
        basicTitleInput.disabled = false;
        // 禁用片段的 title
        if (segmentTitleInput) segmentTitleInput.disabled = true;
        
    } else if (type === 'album') {
        // 專輯：只顯示基本資料
        basicDataSection.style.display = 'block';
        segmentDataSection.style.display = 'none';
        actorsSection.style.display = 'none';
        tagsSection.style.display = 'none';
        
        // 設定必填
        codeInput.required = true;
        releaseDateInput.required = true;
        studioRadios.forEach(radio => radio.required = true);
        
        // 啟用基本資料的 title
        basicTitleInput.disabled = false;
        // 禁用片段的 title
        if (segmentTitleInput) segmentTitleInput.disabled = true;
        
    } else if (type === 'segment') {
        // 專輯片段：顯示片段資料、演員、標籤
        basicDataSection.style.display = 'none';
        segmentDataSection.style.display = 'block';
        actorsSection.style.display = 'block';
        tagsSection.style.display = 'block';
        
        // 移除必填（因為片段不需要這些欄位）
        codeInput.required = false;
        releaseDateInput.required = false;
        studioRadios.forEach(radio => radio.required = false);
        
        // 禁用基本資料的 title
        basicTitleInput.disabled = true;
        // 啟用片段的 title
        if (segmentTitleInput) segmentTitleInput.disabled = false;
    }
}

// ========== 片段編號模式切換 ==========

function updateCodeMode() {
    const mode = document.querySelector('input[name="code_mode"]:checked').value;
    const prefixMode = document.getElementById('prefix-mode');
    const customMode = document.getElementById('custom-mode');
    
    if (mode === 'prefix') {
        prefixMode.style.display = 'block';
        customMode.style.display = 'none';
    } else {
        prefixMode.style.display = 'none';
        customMode.style.display = 'block';
    }
}

// ========== 編號預覽 ==========

function updateCodePreview() {
    const prefix = document.getElementById('code_prefix').value.trim();
    const suffix = document.getElementById('code_suffix').value.trim();
    const previewText = document.getElementById('code_preview_text');
    
    if (prefix && suffix) {
        previewText.textContent = `${prefix}_${suffix}`;
        previewText.style.color = '#27ae60';
        previewText.style.fontWeight = 'bold';
    } else {
        previewText.textContent = '（請填寫前綴和後綴）';
        previewText.style.color = '#7f8c8d';
        previewText.style.fontWeight = 'normal';
    }
}

// ========== 專輯搜尋 Autocomplete ==========

let albumSearchTimeout;
const parentAlbumInput = document.getElementById('parent_album');
const albumSuggestions = document.getElementById('album-suggestions');

if (parentAlbumInput) {
    let albumSelectedIndex = -1;
    
    parentAlbumInput.addEventListener('input', function() {
        clearTimeout(albumSearchTimeout);
        albumSelectedIndex = -1;  // 重置選擇
        const query = this.value.trim();
        
        if (query.length < 2) {
            albumSuggestions.innerHTML = '';
            albumSuggestions.style.display = 'none';
            return;
        }
        
        albumSearchTimeout = setTimeout(() => {
            fetch(`/api/search_albums?q=${encodeURIComponent(query)}`)
                .then(res => res.json())
                .then(albums => {
                    if (albums.length === 0) {
                        albumSuggestions.innerHTML = '<div class="no-results">找不到符合的專輯</div>';
                        albumSuggestions.style.display = 'block';
                        return;
                    }
                    
                    albumSuggestions.innerHTML = albums.map(album => `
                        <div class="suggestion-item" data-code="${album.code}" data-studio="${album.studio_name || ''}" data-date="${album.release_date || ''}">
                            <div class="suggestion-code">${album.code}</div>
                            <div class="suggestion-detail">${album.title || '(無標題)'} (${album.studio_name || ''}, ${album.release_date || ''})</div>
                        </div>
                    `).join('');
                    albumSuggestions.style.display = 'block';
                    
                    // 為每個項目加上點擊事件
                    const albumItems = albumSuggestions.querySelectorAll('.suggestion-item');
                    albumItems.forEach(item => {
                        item.addEventListener('click', function() {
                            const code = this.getAttribute('data-code');
                            const studio = this.getAttribute('data-studio');
                            const date = this.getAttribute('data-date');
                            selectAlbum(code, studio, date);
                            albumSelectedIndex = -1;
                        });
                    });
                })
                .catch(err => {
                    console.error('搜尋專輯失敗:', err);
                });
        }, 300);
    });
    
    // 鍵盤導航
    parentAlbumInput.addEventListener('keydown', function(e) {
        const items = albumSuggestions.querySelectorAll('.suggestion-item');
        
        if (items.length === 0) return;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            albumSelectedIndex = (albumSelectedIndex + 1) % items.length;
            updateSelection(items, albumSelectedIndex);
        }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            albumSelectedIndex = albumSelectedIndex <= 0 ? items.length - 1 : albumSelectedIndex - 1;
            updateSelection(items, albumSelectedIndex);
        }
        else if (e.key === 'Enter' && albumSelectedIndex >= 0) {
            e.preventDefault();
            const selectedItem = items[albumSelectedIndex];
            const code = selectedItem.getAttribute('data-code');
            const studio = selectedItem.getAttribute('data-studio');
            const date = selectedItem.getAttribute('data-date');
            selectAlbum(code, studio, date);
            albumSelectedIndex = -1;
        }
        else if (e.key === 'Escape') {
            albumSuggestions.style.display = 'none';
            albumSelectedIndex = -1;
        }
    });
    
    // 點擊其他地方關閉建議
    document.addEventListener('click', function(e) {
        if (!parentAlbumInput.contains(e.target) && !albumSuggestions.contains(e.target)) {
            albumSuggestions.style.display = 'none';
            albumSelectedIndex = -1;
        }
    });
}

function selectAlbum(code, studioName, releaseDate) {
    // 填入專輯編號
    parentAlbumInput.value = code;
    albumSuggestions.style.display = 'none';
    
    // 提取第一個編號作為前綴
    const firstCode = extractFirstCode(code);
    document.getElementById('code_prefix').value = firstCode;
    updateCodePreview();
    
    // 顯示繼承資訊
    document.getElementById('inherited_studio').textContent = `公司：${studioName} (來自專輯)`;
    document.getElementById('inherited_date').textContent = `日期：${releaseDate} (來自專輯)`;
    
    // 根據公司載入演員
    // 這裡需要從 studioName 找到 studio_id（簡化處理）
    const studioRadios = document.querySelectorAll('input[name="studio_id"]');
    studioRadios.forEach(radio => {
        const label = radio.parentElement;
        if (label.textContent.trim() === studioName) {
            selectedStudioId = parseInt(radio.value);
            loadStudioActors(selectedStudioId);
        }
    });
}

function extractFirstCode(fullCode) {
    // 從 [AAAA0001][BBBB1234] 提取 AAAA0001
    // 或從 ABC-BEST-2024 提取 ABC-BEST-2024
    const match = fullCode.match(/\[([^\]]+)\]/);
    if (match) {
        return match[1];
    }
    return fullCode;
}

// ========== 公司選擇 → 載入演員 ==========

function updateActorList() {
    const studioId = document.querySelector('input[name="studio_id"]:checked')?.value;
    if (!studioId) return;
    
    selectedStudioId = parseInt(studioId);
    loadStudioActors(selectedStudioId);
}

function loadStudioActors(studioId) {
    fetch(`/api/studio_actors/${studioId}`)
        .then(res => res.json())
        .then(actors => {
            currentActors = actors;
            console.log(`已載入 ${actors.length} 個演員`);
        })
        .catch(err => {
            console.error('載入演員失敗:', err);
        });
}

// ========== 演員 Autocomplete ==========

document.addEventListener('DOMContentLoaded', function() {
    // 檢查是否有預選的公司
    const selectedStudio = document.querySelector('input[name="studio_id"]:checked');
    if (selectedStudio) {
        selectedStudioId = parseInt(selectedStudio.value);
        loadStudioActors(selectedStudioId);
    }
    
    setupActorAutocomplete();
});

function setupActorAutocomplete() {
    const inputs = document.querySelectorAll('.actor-autocomplete');
    
    inputs.forEach(input => {
        const suggestionsDiv = input.nextElementSibling.nextElementSibling;
        const hiddenInput = input.nextElementSibling;
        let selectedIndex = -1;  // 追蹤當前選中的項目
        
        input.addEventListener('input', function() {
            selectedIndex = -1;  // 重置選擇
            const query = this.value.trim().toLowerCase();
            
            if (query.length === 0) {
                suggestionsDiv.innerHTML = '';
                suggestionsDiv.style.display = 'none';
                hiddenInput.value = '';
                return;
            }
            
            // 檢查是否已選擇公司
            if (!selectedStudioId) {
                suggestionsDiv.innerHTML = '<div class="no-results">請先選擇公司</div>';
                suggestionsDiv.style.display = 'block';
                return;
            }
            
            // 如果有選公司但演員清單還沒載入，先載入
            if (currentActors.length === 0) {
                loadStudioActors(selectedStudioId);
                suggestionsDiv.innerHTML = '<div class="no-results">載入中...</div>';
                suggestionsDiv.style.display = 'block';
                return;
            }
            
            const filtered = currentActors.filter(actor => 
                actor.stage_name.toLowerCase().includes(query)
            );
            
            if (filtered.length === 0) {
                suggestionsDiv.innerHTML = '<div class="no-results">找不到演員</div>';
                suggestionsDiv.style.display = 'block';
                return;
            }
            
            // 分離通用演員和具名演員
            const poolActors = filtered.filter(a => a.actor_tag.includes('POOL'));
            const namedActors = filtered.filter(a => !a.actor_tag.includes('POOL'));
            
            let html = '';
            if (poolActors.length > 0) {
                html += '<div class="suggestion-category">─── 通用演員 ───</div>';
                poolActors.forEach(actor => {
                    html += `<div class="suggestion-item" data-id="${actor.id}" data-name="${actor.stage_name}">
                        ${actor.stage_name}
                    </div>`;
                });
            }
            if (namedActors.length > 0) {
                html += '<div class="suggestion-category">─── 具名演員 ───</div>';
                namedActors.forEach(actor => {
                    html += `<div class="suggestion-item" data-id="${actor.id}" data-name="${actor.stage_name}">
                        ${actor.stage_name}
                    </div>`;
                });
            }
            
            suggestionsDiv.innerHTML = html;
            suggestionsDiv.style.display = 'block';
            
            // 為每個項目加上點擊事件
            const items = suggestionsDiv.querySelectorAll('.suggestion-item');
            items.forEach(item => {
                item.addEventListener('click', function() {
                    const id = this.getAttribute('data-id');
                    const name = this.getAttribute('data-name');
                    input.value = name;
                    hiddenInput.value = id;
                    suggestionsDiv.style.display = 'none';
                    selectedIndex = -1;
                });
            });
        });
        
        // 鍵盤導航
        input.addEventListener('keydown', function(e) {
            const items = suggestionsDiv.querySelectorAll('.suggestion-item');
            
            if (items.length === 0) return;
            
            // 下方向鍵
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % items.length;
                updateSelection(items, selectedIndex);
            }
            // 上方向鍵
            else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = selectedIndex <= 0 ? items.length - 1 : selectedIndex - 1;
                updateSelection(items, selectedIndex);
            }
            // Enter 鍵
            else if (e.key === 'Enter' && selectedIndex >= 0) {
                e.preventDefault();
                const selectedItem = items[selectedIndex];
                const id = selectedItem.getAttribute('data-id');
                const name = selectedItem.getAttribute('data-name');
                input.value = name;
                hiddenInput.value = id;
                suggestionsDiv.style.display = 'none';
                selectedIndex = -1;
            }
            // Esc 鍵
            else if (e.key === 'Escape') {
                suggestionsDiv.style.display = 'none';
                selectedIndex = -1;
            }
        });
        
        // 點擊其他地方關閉建議
        document.addEventListener('click', function(e) {
            if (!input.contains(e.target) && !suggestionsDiv.contains(e.target)) {
                suggestionsDiv.style.display = 'none';
                selectedIndex = -1;
            }
        });
    });
}

// 更新選中項目的樣式
function updateSelection(items, index) {
    items.forEach((item, i) => {
        if (i === index) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

// ========== 新增演員欄位 ==========

function addActorRow(role) {
    const container = document.getElementById(`actors-${role}`);
    const newRow = document.createElement('div');
    newRow.className = 'actor-input-row';
    newRow.innerHTML = `
        <input 
            type="text" 
            class="actor-autocomplete" 
            data-role="${role}"
            placeholder="輸入演員名稱搜尋"
            autocomplete="off"
        >
        <input type="hidden" name="actor_${role}[]" class="actor-value">
        <div class="autocomplete-suggestions"></div>
        <button type="button" class="btn-remove-actor" onclick="removeActorRow(this)">✕</button>
    `;
    
    container.appendChild(newRow);
    
    // 為新欄位設定 autocomplete
    const newInput = newRow.querySelector('.actor-autocomplete');
    const suggestionsDiv = newRow.querySelector('.autocomplete-suggestions');
    const hiddenInput = newRow.querySelector('.actor-value');
    let selectedIndex = -1;
    
    newInput.addEventListener('input', function() {
        selectedIndex = -1;  // 重置選擇
        const query = this.value.trim().toLowerCase();
        
        if (query.length === 0) {
            suggestionsDiv.innerHTML = '';
            suggestionsDiv.style.display = 'none';
            hiddenInput.value = '';
            return;
        }
        
        // 檢查是否已選擇公司
        if (!selectedStudioId) {
            suggestionsDiv.innerHTML = '<div class="no-results">請先選擇公司</div>';
            suggestionsDiv.style.display = 'block';
            return;
        }
        
        // 如果有選公司但演員清單還沒載入，先載入
        if (currentActors.length === 0) {
            loadStudioActors(selectedStudioId);
            suggestionsDiv.innerHTML = '<div class="no-results">載入中...</div>';
            suggestionsDiv.style.display = 'block';
            return;
        }
        
        const filtered = currentActors.filter(actor => 
            actor.stage_name.toLowerCase().includes(query)
        );
        
        if (filtered.length === 0) {
            suggestionsDiv.innerHTML = '<div class="no-results">找不到演員</div>';
            suggestionsDiv.style.display = 'block';
            return;
        }
        
        const poolActors = filtered.filter(a => a.actor_tag.includes('POOL'));
        const namedActors = filtered.filter(a => !a.actor_tag.includes('POOL'));
        
        let html = '';
        if (poolActors.length > 0) {
            html += '<div class="suggestion-category">─── 通用演員 ───</div>';
            poolActors.forEach(actor => {
                html += `<div class="suggestion-item" data-id="${actor.id}" data-name="${actor.stage_name}">
                    ${actor.stage_name}
                </div>`;
            });
        }
        if (namedActors.length > 0) {
            html += '<div class="suggestion-category">─── 具名演員 ───</div>';
            namedActors.forEach(actor => {
                html += `<div class="suggestion-item" data-id="${actor.id}" data-name="${actor.stage_name}">
                    ${actor.stage_name}
                </div>`;
            });
        }
        
        suggestionsDiv.innerHTML = html;
        suggestionsDiv.style.display = 'block';
        
        // 為每個項目加上點擊事件
        const items = suggestionsDiv.querySelectorAll('.suggestion-item');
        items.forEach(item => {
            item.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                const name = this.getAttribute('data-name');
                newInput.value = name;
                hiddenInput.value = id;
                suggestionsDiv.style.display = 'none';
                selectedIndex = -1;
            });
        });
    });
    
    // 鍵盤導航（新增欄位）
    newInput.addEventListener('keydown', function(e) {
        const items = suggestionsDiv.querySelectorAll('.suggestion-item');
        
        if (items.length === 0) return;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % items.length;
            updateSelection(items, selectedIndex);
        }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = selectedIndex <= 0 ? items.length - 1 : selectedIndex - 1;
            updateSelection(items, selectedIndex);
        }
        else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            const selectedItem = items[selectedIndex];
            const id = selectedItem.getAttribute('data-id');
            const name = selectedItem.getAttribute('data-name');
            newInput.value = name;
            hiddenInput.value = id;
            suggestionsDiv.style.display = 'none';
            selectedIndex = -1;
        }
        else if (e.key === 'Escape') {
            suggestionsDiv.style.display = 'none';
            selectedIndex = -1;
        }
    });
    
    document.addEventListener('click', function(e) {
        if (!newInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
            suggestionsDiv.style.display = 'none';
            selectedIndex = -1;
        }
    });
}

function removeActorRow(button) {
    button.parentElement.remove();
}

// ========== 快速填入功能 ==========

document.addEventListener('DOMContentLoaded', function() {
    const quickFillInput = document.getElementById('quick_fill_input');
    const quickFillPreview = document.getElementById('quick_fill_preview');
    
    if (quickFillInput) {
        quickFillInput.addEventListener('input', function() {
            const text = this.value.trim();
            
            if (text.length === 0) {
                quickFillPreview.style.display = 'none';
                return;
            }
            
            // 切片邏輯
            const parsed = parseGVDBText(text);
            
            if (parsed.code || parsed.title || parsed.date) {
                // 顯示預覽
                document.getElementById('preview_code').textContent = parsed.code || '(無)';
                document.getElementById('preview_title').textContent = parsed.title || '(無)';
                document.getElementById('preview_date').textContent = parsed.date || '(無)';
                quickFillPreview.style.display = 'block';
                
                // 自動填入表單欄位
                if (parsed.code) {
                    document.getElementById('code').value = parsed.code;
                }
                if (parsed.title) {
                    document.getElementById('title').value = parsed.title;
                }
                if (parsed.date) {
                    document.getElementById('release_date').value = parsed.date;
                }
            } else {
                quickFillPreview.style.display = 'none';
            }
        });
    }
});

function parseGVDBText(text) {
    const result = {
        code: '',
        title: '',
        date: ''
    };

    // 提取所有 [...] 作為 code
    const codeMatches = text.match(/\[[^\]]+\]/g);
    if (codeMatches) {
        result.code = codeMatches.join('');
    }

    // 查找最後一個 (...) 作為 date
    const lastParenIndex = text.lastIndexOf('(');
    const lastCloseParenIndex = text.lastIndexOf(')');
    if (lastParenIndex !== -1 && lastCloseParenIndex !== -1 && lastParenIndex < lastCloseParenIndex) {
        result.date = text.substring(lastParenIndex + 1, lastCloseParenIndex).trim();

        // 先從原始 text 中移除最後的 (...)，再移除所有 [...]
        let titleText = text.substring(0, lastParenIndex) + text.substring(lastCloseParenIndex + 1);
        titleText = titleText.replace(/\[[^\]]+\]/g, '');
        result.title = titleText.trim();
    } else {
        // 如果沒有日期，就把整個去掉 [...] 的內容作為 title
        let titleText = text;
        titleText = titleText.replace(/\[[^\]]+\]/g, '');
        result.title = titleText.trim();
    }

    return result;
}

// ========== 防止按 Enter 送出表單 ==========

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('productionForm');
    
    if (form) {
        // 阻止表單內所有輸入框的 Enter 鍵送出
        form.addEventListener('keydown', function(e) {
            // 如果按下 Enter 且不是在 textarea 中
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                return false;
            }
        });
    }
});
// ========== 快速添加匿名演員 ==========

/**
 * 快速添加匿名演員（墨鏡男或路人甲）
 * @param {string} role - 角色類型 (top, bottom, giver, receiver, other)
 * @param {string} type - 匿名類型 (sunglasses 或 passerby)
 */
async function addAnonymousActor(role, type) {
    // 檢查是否選擇了公司
    if (!selectedStudioId) {
        alert('請先選擇公司！');
        return;
    }
    
    // 根據類型決定搜尋的關鍵字
    const keyword = type === 'sunglasses' ? '墨鏡男_' : '不知名_';

    // 從當前公司的演員清單中尋找匿名演員
    const anonymousActor = currentActors.find(actor => 
        actor.stage_name.startsWith(keyword)
    );
    
    if (!anonymousActor) {
        alert(`找不到該公司的${keyword}！請確認是否已建立該匿名演員。`);
        return;
    }
    
    // 添加新的演員輸入行
    const container = document.getElementById(`actors-${role}`);
    const newRow = document.createElement('div');
    newRow.className = 'actor-input-row';
    newRow.innerHTML = `
        <input 
            type="text" 
            class="actor-autocomplete" 
            data-role="${role}"
            value="${anonymousActor.stage_name}"
            autocomplete="off"
            readonly
        >
        <input type="hidden" name="actor_${role}[]" class="actor-value" value="${anonymousActor.id}">
        <button type="button" class="btn-remove-actor" onclick="this.parentElement.remove()">✕</button>
        <div class="autocomplete-suggestions"></div>
    `;
    
    container.appendChild(newRow);
}