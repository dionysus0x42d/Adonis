# CLAUDE.md - GVDB 開發者文檔

此文件提供給 Claude Code 和開發者參考，記錄項目架構、決策、已知問題等。

---

## 📋 項目概述

**GVDB** (Gay Video Database Management System) 是一個成人視頻製作數據管理系統。

**核心特性：**
- 本地 Flask 應用用於數據編輯和管理
- 靜態網站用於公開查詢（GitHub Pages）
- 離線優先架構（使用 IndexedDB）
- 零後端成本部署方案

**技術棧：**
- 後端：Python Flask 3.x + PostgreSQL
- 前端：HTML5, CSS3, Vanilla JavaScript
- 離線存儲：IndexedDB
- 部署：GitHub Pages + JSON 靜態數據

---

## 🎯 2026-01 實現里程碑

### ✅ 已完成：靜態網站部署（2026-01-09）

#### 目標
將 GVDB 轉換為可在 GitHub Pages 上無後端運行的靜態網站，實現完全離線查詢。

#### 實現內容

**1. 代碼庫結構**
```
view_only/                    # 靜態網站源代碼
├── index.html               # 首頁
├── view_actor.html          # 演員查詢頁
├── view_production.html     # 作品查詢頁
├── css/                     # 樣式表
├── js/
│   ├── indexeddb-loader.js  # 核心數據庫模塊
│   ├── view_actor.js        # 演員頁邏輯
│   └── view_production.js   # 作品頁邏輯
└── data/                    # JSON 數據（7 個文件，~108KB）

docs/                        # 自動同步副本（GitHub Pages 部署）
scripts/
└── export_to_json.py        # 數據庫→JSON 匯出工具
```

**2. IndexedDB 模塊架構** (`view_only/js/indexeddb-loader.js`)

核心類 `GVDBData`，提供以下功能：

```javascript
// 初始化和數據加載
GVDBData.init()                    // 初始化 IndexedDB，自動載入 JSON
GVDBData.openDatabase()            // 打開/創建數據庫
GVDBData.createObjectStores(db)    // 創建 7 個對象存儲

// 查詢接口（高層）
GVDBData.getActors(filters, sort, pagination)       // 查詢演員列表
GVDBData.getProductions(filters, sort, pagination)  // 查詢作品列表
GVDBData.getProductionDetails(productionId)         // 獲取作品詳情（演員+標籤）
GVDBData.getActorStats(actorId)                      // 計算演員統計

// 通用查詢接口（底層）
GVDBData.getAll(storeName)                // 取得整個對象存儲
GVDBData.get(storeName, key)             // 按鍵取單條記錄
GVDBData.getByIndex(storeName, indexName, value)    // 按索引查詢

// 過濾和排序
GVDBData.applyActorFilters(actors, filters)         // 演員篩選
GVDBData.applyProductionFilters(productions, filters) // 作品篩選
GVDBData.sortActors(actors, field, desc)   // 演員排序
GVDBData.sortProductions(productions, field, desc)  // 作品排序
```

**3. 數據導出工具** (`scripts/export_to_json.py`)

```bash
python scripts/export_to_json.py
```

- 連接本地 PostgreSQL
- 查詢 7 個表的所有數據
- 轉換為 JSON 格式
- 保存到 `view_only/data/` 和 `docs/data/`

匯出的表及數據量：
- studios.json (8 筆)
- actors.json (55 筆)
- stage_names.json (85 筆)
- productions.json (54 筆)
- performances.json (102 筆)
- tags.json (30 筆)
- production_tags.json (262 筆)

**4. 前端邏輯修改**

**view_actor.js 改動：**
- `loadFilters()` - 從 `GVDBData.getAll('studios')` 加載
- `performSearch()` - 從 `GVDBData.getActors()` 查詢而非 `/api/actors/query`
- 數據格式化符合原始 UI 期望

**view_production.js 改動：**
- `loadFilterOptions()` - 改用 IndexedDB
- `searchActors()` - 改用 `GVDBData.searchActorSuggestions()`
- `performSearch()` - 改用 `GVDBData.getProductions()`
- `renderSegments()` - 改用 `GVDBData.getAll('productions').filter()`
- 新增 `formatActors()` 函數格式化演員對象

**5. Bug 修復（2026-01-09）**

修復了靜態網站的 4 個關鍵問題：

| 問題 | 原因 | 解決方案 |
|------|------|--------|
| Actors 顯示 `[object Object]` | 直接轉換對象 | 添加 `formatActors()` 函數格式化為 "Name (Role)" |
| 排序按鈕無效 | 排序邏輯錯誤（分隔符/索引） | 修正 `performSearch()` 直接使用 `state.sortFields[0]` |
| Toggle 無法展開 | `renderSegments()` 仍使用 API | 改為 `GVDBData.getAll() + filter()` |
| Tags 無法顯示 | 數據結構不符合期望 | 添加 `studio_name`，改用 `item.tags?.sex_acts` |

**6. 部署配置**

- 建立 `/docs` 文件夾用於 GitHub Pages 部署
- 自動同步 `view_only/` → `docs/`
- 配置 GitHub Pages：Branch = `main`, Folder = `/docs`
- 更新 `.gitignore` 允許 `view_only/` 和 `scripts/` 追蹤

**7. Git 工作流**

```
feature/view_only_static
    ↓ (多次提交)
main (merge)
    ↓ (push)
origin/main (GitHub)
    ↓ (自動)
GitHub Pages 部署
```

#### 數據流架構

```
本地 PostgreSQL
        ↓ (export_to_json.py)
JSON 文件 (view_only/data/)
        ↓ (IndexedDB 加載)
瀏覽器 IndexedDB
        ↓ (查詢)
視圖層 (HTML/JavaScript)
        ↓ (渲染)
用戶界面
```

#### 性能指標

- **總數據量：** ~108KB JSON
- **初始加載時間：** <1 秒（包括 IndexedDB 導入）
- **查詢響應時間：** <50ms（本地 JavaScript）
- **無後端依賴**：完全離線運作

---

## 🔧 維護指南

### 更新數據流程

1. **在本地 Flask 修改數據** (http://localhost:5000)
2. **運行匯出腳本**
   ```bash
   python scripts/export_to_json.py
   ```
3. **同步到 docs/**
   ```bash
   cp -r view_only/* docs/
   ```
4. **提交並推送**
   ```bash
   git add view_only/ docs/
   git commit -m "Update: Refresh database export"
   git push origin main
   ```
5. **GitHub Pages 自動重新部署**

### 本地開發測試

**啟動靜態網站：**
```bash
cd view_only
python -m http.server 8000
# 訪問 http://localhost:8000
```

**啟動 Flask 應用：**
```bash
python app.py
# 訪問 http://localhost:5000
```

---

## 📊 數據庫架構

### 關鍵表結構

| 表 | 用途 | 備註 |
|----|------|------|
| studios | 製作公司 | |
| actors | 演員 | actor_tag 唯一 |
| stage_names | 藝名映射 | actor ↔ studio 的橋接表 |
| productions | 作品 | 類型：single/album/segment |
| performances | 演出記錄 | production ↔ stage_name 的橋接 |
| tags | 標籤 | 類別：sex_act, style, body_type, source |
| production_tags | 作品-標籤 | 多對多關聯 |

### IndexedDB 對象存儲

7 個對象存儲對應 7 個表，包含以下索引：
- studios: name (unique)
- actors: actor_tag (unique)
- stage_names: actor_id, studio_id, (actor_id, studio_id) composite unique
- productions: code (unique), type, studio_id, parent_id
- performances: production_id, stage_name_id, (production_id, stage_name_id) composite unique
- tags: (category, name) composite unique
- production_tags: production_id, tag_id

---

## ⚠️ 已知限制

1. **數據更新延遲**
   - 用戶需要手動運行匯出腳本
   - 無實時同步

2. **初始加載體驗**
   - 首次訪問需加載 ~108KB JSON
   - 後續訪問使用本地 IndexedDB（快速）

3. **大數據集性能**
   - 目前 ~50-100 條記錄表現良好
   - 若超過 10000 條記錄應考慮分頁策略

4. **移動端支持**
   - IndexedDB 在移動瀏覽器有存儲限制（通常 50MB）
   - 當前 108KB 完全兼容

---

## 🚀 未來改進方向

### 短期 (1-3 個月)

- [ ] 添加 GitHub Actions 自動化匯出（定時或觸發）
- [ ] 實現增量更新（只同步變化的數據）
- [ ] 添加搜索建議/自動完成
- [ ] 改進移動端 UI

### 中期 (3-6 個月)

- [ ] PWA 支持（離線安裝、推送通知）
- [ ] 用戶收藏/標記功能
- [ ] 高級搜索和過濾 UI
- [ ] 數據統計儀表板

### 長期

- [ ] 考慮輕量級後端（用於評論、收藏同步）
- [ ] 多語言支持
- [ ] 社群功能（用戶評分、評論）

---

## 📝 開發筆記

### 決策記錄

**決定 1：為什麼選擇 IndexedDB？**
- ✅ 離線優先架構
- ✅ 無後端成本
- ✅ 快速本地查詢
- ❌ 無跨域同步（但對只讀網站可接受）

**決定 2：為什麼使用 JSON 而非壓縮格式？**
- ✅ 易於人工檢查和編輯
- ✅ git diff 清晰
- ✅ 108KB 足夠小（< 1 秒加載）
- ❌ 如果數據量 > 1MB 應考慮 msgpack/protobuf

**決定 3：為什麼雙份部署（view_only + docs）？**
- ✅ view_only 用於本地開發和手動測試
- ✅ docs 用於 GitHub Pages 部署（官方推薦）
- ✅ 便於同時維護

### 已解決的技術問題

1. **Windows 編碼問題** - 在 export_to_json.py 添加 UTF-8 編碼修復
2. **排序參數格式** - 修復了 buildSortString() 中的分隔符錯誤
3. **演員數據結構** - 添加 formatActors() 處理對象→字符串轉換
4. **片段查詢** - 改為使用 IndexedDB filter 而非 API 調用

---

## 🔐 安全考慮

### 當前狀態

- ✅ 靜態網站無安全風險（只讀，不包含敏感數據）
- ✅ JSON 數據完全公開（無個人隱私信息）
- ⚠️ 本地 Flask 應用需要認證保護（如果部署公開）

### 建議

1. Flask 應用部署時添加認證層（HTTP Basic Auth、OAuth 等）
2. 定期備份 PostgreSQL 數據
3. 敏感信息（密碼等）使用環境變量

---

## 📞 聯絡開發者

如有問題或建議，可通過以下方式聯絡：
- GitHub Issues
- [待補充具體聯絡方式]

---

**最後更新：** 2026-01-09
**維護者：** GVDB 開發團隊
**版本：** 1.0 - 首次公開發布
