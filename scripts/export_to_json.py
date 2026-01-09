#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GVDB 資料庫導出 JSON 腳本
將 PostgreSQL 資料庫中的資料導出為 JSON 檔案，供靜態網站使用
"""

import json
import sys
import os
from datetime import datetime
from pathlib import Path

# Fix encoding for Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("Error: psycopg2 is not installed. Install with: pip install psycopg2-binary")
    sys.exit(1)

# Import config from parent directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DB_CONFIG


class GVDBExporter:
    def __init__(self):
        self.conn = None
        self.output_dir = Path(__file__).parent.parent / 'view_only' / 'data'

    def connect(self):
        """Connect to PostgreSQL database"""
        try:
            self.conn = psycopg2.connect(
                host=DB_CONFIG['host'],
                port=DB_CONFIG['port'],
                database=DB_CONFIG['database'],
                user=DB_CONFIG['user'],
                password=DB_CONFIG['password']
            )
            print(f"[OK] Connected to {DB_CONFIG['database']}")
        except psycopg2.Error as e:
            print(f"[ERROR] Failed to connect to database: {e}")
            sys.exit(1)

    def disconnect(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            print("[OK] Disconnected from database")

    def ensure_output_dir(self):
        """Ensure output directory exists"""
        self.output_dir.mkdir(parents=True, exist_ok=True)
        print(f"[OK] Output directory ready: {self.output_dir}")

    def query_table(self, table_name):
        """Query all data from a table"""
        try:
            cursor = self.conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            # Some tables don't have an 'id' column (e.g., production_tags with composite key)
            if table_name == 'production_tags':
                cursor.execute(f"SELECT * FROM {table_name} ORDER BY production_id, tag_id")
            else:
                cursor.execute(f"SELECT * FROM {table_name} ORDER BY id")
            results = cursor.fetchall()
            cursor.close()

            # Convert to list of dictionaries
            data = [dict(row) for row in results]

            # Convert datetime and other special types to JSON-compatible formats
            for item in data:
                for key, value in item.items():
                    if isinstance(value, datetime):
                        item[key] = value.isoformat()
                    elif isinstance(value, list):
                        # Handle PostgreSQL arrays
                        item[key] = value if value else []

            return data
        except psycopg2.Error as e:
            print(f"[ERROR] Error querying {table_name}: {e}")
            return []

    def export_table(self, table_name):
        """Export table to JSON file"""
        print(f"  Exporting {table_name}...", end=' ')
        data = self.query_table(table_name)

        output_file = self.output_dir / f"{table_name}.json"
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"[OK] ({len(data)} records)")
            return True
        except Exception as e:
            print(f"[ERROR] Error: {e}")
            return False

    def export_all(self):
        """Export all tables"""
        tables = [
            'studios',
            'actors',
            'stage_names',
            'productions',
            'performances',
            'tags',
            'production_tags'
        ]

        print("\n[START] Exporting GVDB data to JSON...")
        self.ensure_output_dir()

        success_count = 0
        for table in tables:
            if self.export_table(table):
                success_count += 1

        print(f"\n[DONE] Export complete: {success_count}/{len(tables)} tables exported")
        print(f"  Files saved to: {self.output_dir}")

        return success_count == len(tables)


def main():
    exporter = GVDBExporter()

    try:
        exporter.connect()
        success = exporter.export_all()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n[CANCELLED] Export cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Unexpected error: {e}")
        sys.exit(1)
    finally:
        exporter.disconnect()


if __name__ == '__main__':
    main()
