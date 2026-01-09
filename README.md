# GVDB - Gay Video Database Management System

一個用於管理和查詢成人視頻製作數據的資料庫系統，包括演員、公司、作品、標籤等信息。

## 🌐 在線訪問

**靜態查詢網站：** https://dionysus0x42d.github.io/Adonis/

該網站提供完全離線的查詢功能，使用 IndexedDB 在瀏覽器本地存儲數據。

## 📦 項目結構

```
GVDB/
├── 本地開發版本
│   ├── app.py                  # Flask 應用主程序
│   ├── config.py               # 資料庫連接配置
│   ├── gvdb_schema.sql         # PostgreSQL 數據庫架構
│   ├── requirements.txt        # Python 依賴
│   ├── static/                 # 前端資源（開發版本）
│   └── templates/              # HTML 模板（開發版本）
│
├── 靜態部署版本（GitHub Pages）
│   ├── view_only/              # 靜態網站源代碼（本地開發用）
│   │   ├── index.html
│   │   ├── view_actor.html     # 演員查詢頁面
│   │   ├── view_production.html # 作品查詢頁面
│   │   ├── js/
│   │   │   ├── indexeddb-loader.js  # IndexedDB 資料加載器
│   │   │   ├── view_actor.js        # 演員頁面邏輯
│   │   │   └── view_production.js   # 作品頁面邏輯
│   │   ├── css/                # 樣式表
│   │   └── data/               # JSON 資料檔案
│   │
│   └── docs/                   # GitHub Pages 部署目錄（自動生成）
│
├── scripts/
│   └── export_to_json.py       # 資料庫→JSON 匯出工具
│
└── CLAUDE.md                   # 開發者技術文檔

```

## 🚀 快速開始

### 本地開發（Flask 後端）

#### 1. 安裝依賴
```bash
pip install -r requirements.txt
```

#### 2. 配置資料庫
編輯 `config.py`，設定 PostgreSQL 連接信息：
```python
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'gvdb_red',
    'user': 'postgres',
    'password': 'your_password'
}
```

#### 3. 初始化數據庫
```bash
psql -U postgres -d gvdb_red -f gvdb_schema.sql
```

#### 4. 啟動應用
```bash
python app.py
```

訪問：http://localhost:5000

---

### 靜態網站（本地測試）

```bash
cd view_only
python -m http.server 8000
```

訪問：http://localhost:8000

---

## 📊 主要功能

### 查詢功能
- **演員查詢** (`view_actor.html`)
  - 按公司、角色類型篩選
  - 查看演員的作品統計
  - 角色比例圖表
  - 展開查看各公司的詳細信息

- **作品查詢** (`view_production.html`)
  - 按公司、演員、日期、標籤篩選
  - 多維度排序（公司、代碼、標題、日期等）
  - 展開專輯查看片段
  - 完整的性愛行為、風格、體型標籤

### 管理功能（僅在本地 Flask）
- 新增演員、公司、作品
- 編輯演員和作品信息
- 管理標籤和分類

---

## 🔄 資料更新流程

1. **在本地 Flask 應用修改數據**（http://localhost:5000）

2. **匯出為 JSON**
   ```bash
   python scripts/export_to_json.py
   ```
   這會生成 `view_only/data/` 中的 JSON 檔案

3. **同步到部署版本**
   ```bash
   cp -r view_only/* docs/
   ```

4. **上傳到 GitHub**
   ```bash
   git add view_only/ docs/
   git commit -m "Update: Refresh database export"
   git push origin main
   ```

5. **自動部署**
   GitHub Pages 會在 1-2 分鐘內自動更新網站

---

## 🔌 離線功能說明

靜態網站使用 **IndexedDB** 技術實現離線查詢：

1. 首次訪問時，JSON 資料檔案會被加載到瀏覽器的 IndexedDB
2. 所有查詢、篩選、排序都在本地進行，**無需後端服務器**
3. 即使斷網，已加載的數據仍可查詢
4. 數據會持久存儲在瀏覽器中

---

## 📖 API 文檔

詳見 `CLAUDE.md` 中的架構文檔

主要 API 端點（本地 Flask）：
- `GET /api/actors/query` - 查詢演員
- `GET /api/search` - 搜尋作品
- `GET /api/filter-options` - 取得篩選選項
- `POST /add_actor` - 新增演員
- `POST /add_production` - 新增作品
- 更多詳見 CLAUDE.md

---

## 💬 聯絡與貢獻

### 想加入後端開發？

如果您對以下方面感興趣，歡迎聯絡：

- 🔧 **功能開發** - 新增查詢功能、提升性能
- 🗄️ **資料庫最佳化** - 優化查詢效率
- 📱 **前端改進** - UI/UX 增強
- 🐳 **部署優化** - Docker 容器化、自動化部署
- 📊 **資料分析** - 統計和報表功能

**聯絡方式：**
- 在 GitHub 提交 Issues 和 Pull Requests
- 或通過以下方式聯絡開發者

---

## 📋 技術棧

- **後端：** Python Flask 3.x
- **資料庫：** PostgreSQL
- **前端：** HTML5, CSS3, Vanilla JavaScript
- **離線存儲：** IndexedDB
- **部署：** GitHub Pages + JSON 靜態資料

---

## 📝 授權

[待定]

---

## 🙏 致謝

感謝所有貢獻者和用戶的支持！

---

**最後更新：** 2026-01-09

**版本：** 1.0 (首次公開發布)
