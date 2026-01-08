import os
from pathlib import Path
from dotenv import load_dotenv

# 使用絕對路徑載入 .env.local 檔案
env_path = Path(__file__).parent / '.env.local'
load_dotenv(env_path)

# 支持 DATABASE_URL（Render/Supabase 用）或個別參數（本地開發用）
DATABASE_URL = os.getenv('DATABASE_URL')

if DATABASE_URL:
    # Render/Supabase：直接使用 DATABASE_URL，讓 psycopg2 來解析
    DB_CONFIG = DATABASE_URL
else:
    # 本地開發：使用個別參數
    DB_CONFIG = {
        'host': os.getenv('DB_HOST', 'localhost'),
        'port': int(os.getenv('DB_PORT', 5432)),
        'database': os.getenv('DB_NAME', 'gvdb_red'),
        'user': os.getenv('DB_USER', 'postgres'),
        'password': os.getenv('DB_PASSWORD', '')
    }

# Flask 設定
SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
DEBUG = os.getenv('FLASK_ENV', 'development') == 'development'