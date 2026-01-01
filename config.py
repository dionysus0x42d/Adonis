# PostgreSQL 連接設定
DB_CONFIG = {
    'host': 'localhost',        # 資料庫主機（通常是 localhost）
    'port': 5432,               # PostgreSQL 預設埠號
    'database': 'gvdb_red',         # 你的資料庫名稱（請修改成實際名稱）
    'user': 'postgres',         # 使用者名稱
    'password': 'c04xup6red' # 密碼（請修改成實際密碼）
}

# Flask 設定
SECRET_KEY = 'your-secret-key-here'  # 用於 session 加密
DEBUG = True  # 開發模式