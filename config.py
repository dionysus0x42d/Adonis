import os
from pathlib import Path
from dotenv import load_dotenv
from urllib.parse import urlparse

# 使用絕對路徑載入 .env.local 檔案
env_path = Path(__file__).parent / '.env.local'
load_dotenv(env_path)

# 支持 DATABASE_URL 或個別參數
DATABASE_URL = os.getenv('DATABASE_URL')

if DATABASE_URL:
    # 解析 DATABASE_URL
    parsed = urlparse(DATABASE_URL)
    DB_CONFIG = {
        'host': parsed.hostname,
        'port': parsed.port or 5432,
        'database': parsed.path.lstrip('/'),
        'user': parsed.username,
        'password': parsed.password
    }
else:
    # 回退到個別參數
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