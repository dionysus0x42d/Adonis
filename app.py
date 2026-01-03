"""
GVDB 資料庫管理系統 - Flask 應用程式
"""

from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
import psycopg2
from psycopg2.extras import RealDictCursor
from config import DB_CONFIG, SECRET_KEY, DEBUG

app = Flask(__name__)
app.secret_key = SECRET_KEY
app.config['DEBUG'] = DEBUG

# ==================== 全域配置：標籤圖示和排序 ====================
STYLE_ICONS = {
    'BDSM': '🔒',
    '工作/西裝': '🤵',
    '按摩': '💆',
    '軍警': '🪖',
    '校園': '🎓',
    '純愛': '❤️',
    '迷藥': '💊',
    '運動': '⚽'
}

STYLE_ORDER = ['BDSM', '工作/西裝', '按摩', '軍警', '校園', '純愛', '迷藥', '運動']
BODY_TYPE_ORDER = ['大叔', '年輕', '熊', '壯碩', '肌肉', '精瘦', '纖瘦']
SOURCE_ORDER = ['4horlover', 'igay69', 'javboys', 'poapan', 'notebook', 'ssd', 'pending', 'removed', 'unseen']


# ==================== 資料庫連接 ====================

def get_db_connection():
    """建立資料庫連接"""
    conn = psycopg2.connect(**DB_CONFIG)
    return conn


# ==================== 首頁 ====================

@app.route('/')
def index():
    """首頁：顯示功能選單"""
    return render_template('index.html')


# ==================== 新增演員 ====================

@app.route('/add_actor', methods=['GET', 'POST'])
def add_actor():
    """新增演員頁面"""
    
    if request.method == 'GET':
        # 顯示表單：載入所有公司
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # 取得所有公司（按字母排序）
        cur.execute("SELECT id, name FROM studios ORDER BY name")
        studios = cur.fetchall()
        
        cur.close()
        conn.close()
        
        return render_template('add_actor.html', studios=studios)
    
    elif request.method == 'POST':
        # 處理表單提交
        try:
            # 取得表單資料
            actor_tag = request.form.get('actor_tag', '').strip()
            gvdb_id = request.form.get('gvdb_id', '').strip() or None
            notes = request.form.get('notes', '').strip() or None
            
            # 取得藝名資料（可能有多組）
            studio_ids = request.form.getlist('studio_id[]')
            stage_names = request.form.getlist('stage_name[]')
            
            # 驗證資料
            errors = []
            
            # 1. 演員標記不可為空
            if not actor_tag:
                errors.append('演員標記不可為空')
            
            # 2. 至少要有一組藝名
            valid_stage_names = []
            for studio_id, stage_name in zip(studio_ids, stage_names):
                stage_name = stage_name.strip()
                if studio_id and stage_name:
                    valid_stage_names.append((int(studio_id), stage_name))
            
            if not valid_stage_names:
                errors.append('請至少新增一個公司的藝名')
            
            # 3. 檢查同一公司是否重複
            studio_id_list = [sid for sid, _ in valid_stage_names]
            if len(studio_id_list) != len(set(studio_id_list)):
                errors.append('同一個公司不能重複新增藝名')
            
            # 如果有錯誤，返回錯誤訊息
            if errors:
                conn = get_db_connection()
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute("SELECT id, name FROM studios ORDER BY name")
                studios = cur.fetchall()
                cur.close()
                conn.close()
                
                for error in errors:
                    flash(error, 'error')
                
                return render_template('add_actor.html', 
                                     studios=studios,
                                     actor_tag=actor_tag,
                                     gvdb_id=gvdb_id,
                                     notes=notes)
            
            # 開始寫入資料庫
            conn = get_db_connection()
            cur = conn.cursor()
            
            try:
                # 1. 檢查演員標記是否已存在
                cur.execute("SELECT id FROM actors WHERE actor_tag = %s", (actor_tag,))
                if cur.fetchone():
                    flash(f'演員標記「{actor_tag}」已存在，請使用不同的標記', 'error')
                    conn.rollback()
                    
                    # 重新載入公司清單
                    cur.execute("SELECT id, name FROM studios ORDER BY name")
                    studios = cur.fetchall()
                    cur.close()
                    conn.close()
                    
                    return render_template('add_actor.html', 
                                         studios=studios,
                                         gvdb_id=gvdb_id,
                                         notes=notes)
                
                # 2. 新增演員
                cur.execute(
                    "INSERT INTO actors (actor_tag, gvdb_id, notes) VALUES (%s, %s, %s) RETURNING id",
                    (actor_tag, gvdb_id, notes)
                )
                actor_id = cur.fetchone()[0]
                
                # 3. 新增藝名
                for studio_id, stage_name in valid_stage_names:
                    cur.execute(
                        "INSERT INTO stage_names (actor_id, studio_id, stage_name) VALUES (%s, %s, %s)",
                        (actor_id, studio_id, stage_name)
                    )
                
                # 提交交易
                conn.commit()
                
                # 取得新增的藝名清單（用於顯示）
                cur.execute("""
                    SELECT s.name, sn.stage_name
                    FROM stage_names sn
                    JOIN studios s ON sn.studio_id = s.id
                    WHERE sn.actor_id = %s
                    ORDER BY s.name
                """, (actor_id,))
                added_names = cur.fetchall()
                
                cur.close()
                conn.close()
                
                # 顯示成功訊息
                flash(f'✓ 演員「{actor_tag}」新增成功！', 'success')
                for studio_name, stage_name in added_names:
                    flash(f'  • {studio_name}: {stage_name}', 'info')
                
                # 重定向到新增頁面（清空表單）
                return redirect(url_for('add_actor'))
                
            except Exception as e:
                conn.rollback()
                cur.close()
                conn.close()
                flash(f'資料庫錯誤: {str(e)}', 'error')
                
                # 重新載入表單
                conn = get_db_connection()
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute("SELECT id, name FROM studios ORDER BY name")
                studios = cur.fetchall()
                cur.close()
                conn.close()
                
                return render_template('add_actor.html', 
                                     studios=studios,
                                     actor_tag=actor_tag,
                                     gvdb_id=gvdb_id,
                                     notes=notes)
        
        except Exception as e:
            flash(f'發生錯誤: {str(e)}', 'error')
            return redirect(url_for('add_actor'))


# ==================== 新增公司 ====================

@app.route('/add_studio', methods=['GET', 'POST'])
def add_studio():
    """新增公司頁面"""
    
    if request.method == 'GET':
        # 顯示表單
        return render_template('add_studio.html')
    
    elif request.method == 'POST':
        # 處理表單提交
        try:
            # 取得表單資料
            studio_name = request.form.get('studio_name', '').strip()

            # 驗證資料
            if not studio_name:
                flash('公司名稱不可為空', 'error')
                return redirect(url_for('add_studio'))
            
            # 開始寫入資料庫
            conn = get_db_connection()
            cur = conn.cursor()
            
            try:
                # 1. 檢查公司名稱是否已存在
                cur.execute("SELECT id FROM studios WHERE name = %s", (studio_name,))
                if cur.fetchone():
                    flash(f'公司「{studio_name}」已存在，請使用不同的名稱', 'error')
                    conn.rollback()
                    cur.close()
                    conn.close()
                    return redirect(url_for('add_studio'))
                
                # 2. 新增公司
                cur.execute(
                    "INSERT INTO studios (name) VALUES (%s) RETURNING id",
                    (studio_name,)
                )
                studio_id = cur.fetchone()[0]
                
                # 3. 自動建立匿名演員
                anonymous_actors = [
                    {
                        'actor_tag': f'STUDIO_{studio_name}_SUNGLASSES',
                        'stage_name': f'墨鏡男（{studio_name}）'
                    },
                    {
                        'actor_tag': f'STUDIO_{studio_name}_PASSERBY',
                        'stage_name': f'路人甲（{studio_name}）'
                    }
                ]
                
                for anon in anonymous_actors:
                    # 新增演員
                    cur.execute(
                        "INSERT INTO actors (actor_tag) VALUES (%s) RETURNING id",
                        (anon['actor_tag'],)
                    )
                    actor_id = cur.fetchone()[0]
                    
                    # 新增藝名
                    cur.execute(
                        "INSERT INTO stage_names (actor_id, studio_id, stage_name) VALUES (%s, %s, %s)",
                        (actor_id, studio_id, anon['stage_name'])
                    )
                
                # 提交交易
                conn.commit()
                cur.close()
                conn.close()
                
                # 顯示成功訊息
                flash(f'✓ 公司「{studio_name}」新增成功！', 'success')
                flash(f'  • 已自動建立：墨鏡男（{studio_name}）', 'info')
                flash(f'  • 已自動建立：路人甲（{studio_name}）', 'info')
                
                # 重定向到新增頁面（清空表單）
                return redirect(url_for('add_studio'))
                
            except Exception as e:
                conn.rollback()
                cur.close()
                conn.close()
                flash(f'資料庫錯誤: {str(e)}', 'error')
                return redirect(url_for('add_studio'))
        
        except Exception as e:
            flash(f'發生錯誤: {str(e)}', 'error')
            return redirect(url_for('add_studio'))
        
# ==================== 新增作品 ====================

@app.route('/add_production', methods=['GET', 'POST'])
def add_production():
    """新增作品頁面"""
    
    if request.method == 'GET':
        # 顯示表單：載入所有必要資料
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # 取得所有公司（按字母排序）
        cur.execute("SELECT id, name FROM studios ORDER BY name")
        studios = cur.fetchall()
        
        # 取得所有標籤（按類別分組）
        cur.execute("SELECT id, category, name FROM tags ORDER BY category, name")
        all_tags = cur.fetchall()
        
        # 組織標籤
        tags = {
            'sex_act': [],
            'style': [],
            'scenario': [],
            'body_type': [],
            'source': []
        }
        for tag in all_tags:
            if tag['category'] in tags:
                tags[tag['category']].append(tag)
        
        cur.close()
        conn.close()
        
        return render_template('add_production.html', studios=studios, tags=tags)
    
    elif request.method == 'POST':
        # 處理表單提交
        try:
            # 取得基本資料
            production_type = request.form.get('type', '').strip()
            code = request.form.get('code', '').strip()
            studio_id = request.form.get('studio_id', '').strip()
            title = request.form.get('title', '').strip() or None
            release_date = request.form.get('release_date', '').strip() or None
            comment = request.form.get('comment', '').strip() or None
            
            # 專輯片段特殊處理
            parent_id = None
            if production_type == 'segment':
                parent_code = request.form.get('parent_album', '').strip()
                code_mode = request.form.get('code_mode', 'prefix')
                
                if code_mode == 'prefix':
                    prefix = request.form.get('code_prefix', '').strip()
                    suffix = request.form.get('code_suffix', '').strip()
                    code = f"{prefix}_{suffix}" if prefix and suffix else ''
                else:
                    code = request.form.get('code_custom', '').strip()
            
            # 驗證資料
            errors = []
            
            if not production_type or production_type not in ['single', 'album', 'segment']:
                errors.append('請選擇作品類型')
            
            if not code:
                errors.append('作品編號不可為空')
            
            if production_type in ['single', 'album']:
                if not studio_id:
                    errors.append('請選擇公司')
                if not release_date:
                    errors.append('發行日期不可為空')
            
            if production_type == 'segment':
                if not parent_code:
                    errors.append('請選擇所屬專輯')
            
            # 如果有錯誤，返回
            if errors:
                for error in errors:
                    flash(error, 'error')
                return redirect(url_for('add_production'))
            
            # 開始寫入資料庫
            conn = get_db_connection()
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            try:
                # 檢查作品編號是否重複
                cur.execute("SELECT id FROM productions WHERE code = %s", (code,))
                if cur.fetchone():
                    flash(f'作品編號「{code}」已存在，請使用不同的編號', 'error')
                    conn.rollback()
                    cur.close()
                    conn.close()
                    return redirect(url_for('add_production'))
                
                # 如果是專輯片段，取得 parent_id
                if production_type == 'segment':
                    cur.execute("SELECT id, studio_id FROM productions WHERE code = %s AND type = 'album'", 
                               (parent_code,))
                    parent = cur.fetchone()
                    if not parent:
                        flash(f'找不到專輯「{parent_code}」', 'error')
                        conn.rollback()
                        cur.close()
                        conn.close()
                        return redirect(url_for('add_production'))
                    parent_id = parent['id']
                    studio_id = None  # 片段不儲存 studio_id
                    release_date = None  # 片段不儲存 release_date
                
                # 新增作品
                cur.execute("""
                    INSERT INTO productions (code, studio_id, title, release_date, type, parent_id, comment)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (code, studio_id or None, title, release_date, production_type, parent_id, comment))
                
                production_id = cur.fetchone()['id']
                
                # 處理演員（只有 single 和 segment 才有）
                if production_type in ['single', 'segment']:
                    roles = ['top', 'bottom', 'giver', 'receiver', 'other']
                    for role in roles:
                        stage_name_ids = request.form.getlist(f'actor_{role}[]')
                        for stage_name_id in stage_name_ids:
                            if stage_name_id:
                                actual_role = None if role == 'other' else role
                                cur.execute("""
                                    INSERT INTO performances (production_id, stage_name_id, role, performer_type)
                                    VALUES (%s, %s, %s, 'named')
                                """, (production_id, int(stage_name_id), actual_role))
                
                # 處理標籤（只有 single 和 segment 才有）
                if production_type in ['single', 'segment']:
                    tag_ids = request.form.getlist('tags[]')
                    for tag_id in tag_ids:
                        if tag_id:
                            cur.execute("""
                                INSERT INTO production_tags (production_id, tag_id)
                                VALUES (%s, %s)
                            """, (production_id, int(tag_id)))
                
                # 提交交易
                conn.commit()
                cur.close()
                conn.close()
                
                # 顯示成功訊息
                flash(f'✓ 作品「{code}」新增成功！', 'success')
                return redirect(url_for('add_production'))
                
            except Exception as e:
                conn.rollback()
                cur.close()
                conn.close()
                flash(f'資料庫錯誤: {str(e)}', 'error')
                return redirect(url_for('add_production'))
        
        except Exception as e:
            flash(f'發生錯誤: {str(e)}', 'error')
            return redirect(url_for('add_production'))


# ==================== API：取得公司清單 ====================

@app.route('/api/studios')
def api_studios():
    """API：取得所有公司清單（供 JavaScript 使用）"""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT id, name FROM studios ORDER BY name")
    studios = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(studios)


# ==================== API：搜尋專輯 ====================

@app.route('/api/search_albums')
def api_search_albums():
    """API：搜尋專輯（autocomplete）"""
    query = request.args.get('q', '').strip()
    
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    if query:
        # 模糊搜尋 code 和 title
        cur.execute("""
            SELECT p.id, p.code, p.title, p.release_date, s.name AS studio_name
            FROM productions p
            LEFT JOIN studios s ON p.studio_id = s.id
            WHERE p.type = 'album' 
              AND (p.code LIKE %s OR p.title LIKE %s)
            ORDER BY p.release_date DESC
            LIMIT 10
        """, (f'%{query}%', f'%{query}%'))
    else:
        # 如果沒有查詢，返回最近的專輯
        cur.execute("""
            SELECT p.id, p.code, p.title, p.release_date, s.name AS studio_name
            FROM productions p
            LEFT JOIN studios s ON p.studio_id = s.id
            WHERE p.type = 'album'
            ORDER BY p.release_date DESC
            LIMIT 10
        """)
    
    albums = cur.fetchall()
    cur.close()
    conn.close()
    
    return jsonify(albums)


# ==================== API：取得公司的演員 ====================

@app.route('/api/studio_actors/<int:studio_id>')
def api_studio_actors(studio_id):
    """API：取得某公司的所有演員（供 autocomplete 使用）"""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    cur.execute("""
        SELECT sn.id, sn.stage_name, a.actor_tag
        FROM stage_names sn
        JOIN actors a ON sn.actor_id = a.id
        WHERE sn.studio_id = %s
        ORDER BY 
            CASE 
                WHEN a.actor_tag LIKE '%%POOL' THEN 0
                ELSE 1
            END,
            sn.stage_name
    """, (studio_id,))
    
    actors = cur.fetchall()
    cur.close()
    conn.close()
    
    return jsonify(actors)


# ==================== 查詢作品功能 (新增) ====================

@app.route('/search')
def search_page():
    """查詢作品頁面"""
    return render_template('view_production.html')


@app.route('/api/filter-options', methods=['GET'])
def get_filter_options():
    """取得所有篩選選項 (公司列表、所有 tags，包含圖示和排序)"""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # 公司列表
    cur.execute("SELECT DISTINCT name FROM studios ORDER BY name")
    studios = [row['name'] for row in cur.fetchall()]
    
    # Tags (不排序，後面會自訂排序)
    cur.execute("""
        SELECT category, name
        FROM tags
    """)
    tags_result = cur.fetchall()
    
    # 組織標籤並加上圖示和排序
    tags = {
        'sex_acts': [],
        'styles': [],
        'body_types': [],
        'sources': []
    }
    
    # 類別映射
    category_map = {
        'sex_act': 'sex_acts',
        'style': 'styles',
        'body_type': 'body_types',
        'source': 'sources'
    }
    
    # 先收集所有標籤
    for row in tags_result:
        category = category_map.get(row['category'])
        if category:
            tags[category].append(row['name'])
    
    # 處理 styles：加上圖示並按照 STYLE_ORDER 排序
    styles_with_icons = []
    for style_name in STYLE_ORDER:
        if style_name in tags['styles']:
            icon = STYLE_ICONS.get(style_name, '')
            styles_with_icons.append({
                'name': style_name,
                'display_name': f"{icon} {style_name}" if icon else style_name
            })
    # 加上不在 STYLE_ORDER 中的其他 style（如果有）
    for style_name in tags['styles']:
        if style_name not in STYLE_ORDER:
            styles_with_icons.append({
                'name': style_name,
                'display_name': style_name
            })
    tags['styles'] = styles_with_icons
    
    # 處理 body_types：按照 BODY_TYPE_ORDER 排序
    tags['body_types'] = sorted(tags['body_types'], 
                                 key=lambda x: BODY_TYPE_ORDER.index(x) 
                                 if x in BODY_TYPE_ORDER else 999)
    
    # 處理 sources：按照 SOURCE_ORDER 排序
    tags['sources'] = sorted(tags['sources'],
                             key=lambda x: SOURCE_ORDER.index(x)
                             if x in SOURCE_ORDER else 999)
    
    # sex_acts 保持字母排序
    tags['sex_acts'] = sorted(tags['sex_acts'])
    
    cur.close()
    conn.close()
    
    return jsonify({
        'studios': studios,
        'tags': tags
    })


@app.route('/api/search', methods=['GET'])
def search_productions():
    """
    查詢作品 API
    參數:
    - studios: 公司名稱 (逗號分隔)
    - actors: stage_name_id (逗號分隔)
    - sex_acts, styles, body_types, sources: tag 名稱 (逗號分隔)
    - keyword: 關鍵字
    - date_from, date_to: 日期範圍
    - page: 頁碼
    - per_page: 每頁筆數
    """
    
    studios = request.args.get('studios', '')
    actors = request.args.get('actors', '')
    types = request.args.get('types', '')      # 新增這行
    sex_acts = request.args.get('sex_acts', '')
    styles = request.args.get('styles', '')
    body_types = request.args.get('body_types', '')
    sources = request.args.get('sources', '')
    keyword = request.args.get('keyword', '')
    date_from = request.args.get('date_from', '')
    date_to = request.args.get('date_to', '')
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 30))
    
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # 建立基礎查詢
    query = "SELECT * FROM production_search_view WHERE 1=1"
    params = []

    # 作品類型篩選
    if types:
        type_list = types.split(',')
        expanded_types = []
        for t in type_list:
            if t == 'album':
                expanded_types.extend(['album', 'segment'])
            elif t == 'single':
                expanded_types.append('single')
        
        if expanded_types:
            placeholders = ','.join(['%s'] * len(expanded_types))
            query += f" AND type IN ({placeholders})"
            params.extend(expanded_types)
    else:
        # 預設: 只顯示 album 和 single
        query += " AND type IN ('album', 'single')"
    
    # 動態加入條件
    if studios:
        studio_list = studios.split(',')
        placeholders = ','.join(['%s'] * len(studio_list))
        query += f" AND studio IN ({placeholders})"
        params.extend(studio_list)
    
    if actors:
        actor_ids = [int(x) for x in actors.split(',')]
        query += " AND performer_ids && %s"
        params.append(actor_ids)
    
    if sex_acts:
        tags = sex_acts.split(',')
        query += " AND sex_acts && %s::varchar[]"
        params.append(tags)
    
    if styles:
        tags = styles.split(',')
        query += " AND styles && %s::varchar[]"
        params.append(tags)
    
    if body_types:
        tags = body_types.split(',')
        query += " AND body_types && %s::varchar[]"
        params.append(tags)
    
    if sources:
        tags = sources.split(',')
        query += " AND sources && %s::varchar[]"
        params.append(tags)
    
    if keyword:
        query += " AND (code ILIKE %s OR title ILIKE %s OR comment ILIKE %s)"
        keyword_pattern = f'%{keyword}%'
        params.extend([keyword_pattern, keyword_pattern, keyword_pattern])
    
    if date_from:
        query += " AND release_date >= %s"
        params.append(date_from)
    
    if date_to:
        query += " AND release_date <= %s"
        params.append(date_to)
    
    # 動態排序
    sort_param = request.args.get('sort', 'studio_asc,code_asc,title_asc,date_asc')
    order_by_parts = []
    
    for sort_item in sort_param.split(','):
        if '_' in sort_item:
            field, order = sort_item.rsplit('_', 1)
            # 安全檢查
            allowed_fields = {'studio': 'studio', 'code': 'code', 'title': 'title', 'date': 'release_date'}
            if field in allowed_fields and order in ['asc', 'desc']:
                order_by_parts.append(f"{allowed_fields[field]} {order.upper()}")
    
    if order_by_parts:
        query += " ORDER BY " + ", ".join(order_by_parts)
    else:
        query += " ORDER BY studio, code, title, release_date"
    
    # 計算總數
    count_query = f"SELECT COUNT(*) as total FROM ({query}) as subquery"
    cur.execute(count_query, params)
    total = cur.fetchone()['total']
    
    # 分頁
    offset = (page - 1) * per_page
    query += " LIMIT %s OFFSET %s"
    params.extend([per_page, offset])
    
    # 執行查詢
    cur.execute(query, params)
    results = cur.fetchall()
    
    # 處理 NULL 陣列並轉換演員 ID 為名稱
    for row in results:
        for key in ['sex_acts', 'styles', 'body_types', 'sources', 'performer_ids']:
            if row[key] is None:
                row[key] = []

        # 將 performer_ids 轉換為演員名稱
        if row['type'] == 'album' and row.get('performer_ids'):
            # 專輯：直接從 performer_ids 獲取演員名稱
            # 優化：不需要 JOIN performances 和 segments，直接查詢 stage_names
            cur.execute("""
                SELECT sn.stage_name
                FROM stage_names sn
                WHERE sn.id = ANY(%s)
                ORDER BY sn.stage_name
            """, (row['performer_ids'],))
            actors = [r['stage_name'] for r in cur.fetchall()]
            # 過濾掉匿名演員
            actors = [a for a in actors if '墨鏡男' not in a and '路人甲' not in a]
            row['actors'] = ', '.join(actors)
        elif row.get('performer_ids'):
            # 單片/片段：依照角色排序（保持原來的邏輯）
            cur.execute("""
                SELECT sn.stage_name
                FROM stage_names sn
                JOIN performances p ON sn.id = p.stage_name_id
                WHERE sn.id = ANY(%s) AND p.production_id = %s
                ORDER BY
                    CASE p.role
                        WHEN 'top' THEN 1
                        WHEN 'bottom' THEN 2
                        WHEN 'giver' THEN 3
                        WHEN 'receiver' THEN 4
                        ELSE 5
                    END,
                    sn.stage_name
            """, (row['performer_ids'], row['id']))
            actors = [r['stage_name'] for r in cur.fetchall()]
            # 過濾掉匿名演員
            actors = [a for a in actors if '墨鏡' not in a and '路人' not in a]
            row['actors'] = ', '.join(actors)
        else:
            row['actors'] = ''
    
    cur.close()
    conn.close()
    
    return jsonify({
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': (total + per_page - 1) // per_page,
        'results': results
    })


@app.route('/api/segments/<int:parent_id>', methods=['GET'])
def get_segments(parent_id):
    """取得專輯的子片段"""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    cur.execute("""
        SELECT * FROM production_search_view
        WHERE parent_id = %s
        ORDER BY code
    """, (parent_id,))
    
    results = cur.fetchall()
    
    # 處理 NULL 陣列並轉換演員 ID 為名稱
    for row in results:
        for key in ['sex_acts', 'styles', 'body_types', 'sources', 'performer_ids']:
            if row[key] is None:
                row[key] = []
        
        # 將 performer_ids 轉換為演員名稱（依照角色排序）
        if row.get('performer_ids'):
            cur.execute("""
                SELECT sn.stage_name 
                FROM stage_names sn 
                JOIN performances p ON sn.id = p.stage_name_id
                WHERE sn.id = ANY(%s) AND p.production_id = %s
                ORDER BY 
                    CASE p.role 
                        WHEN 'top' THEN 1 
                        WHEN 'bottom' THEN 2 
                        WHEN 'giver' THEN 3 
                        WHEN 'receiver' THEN 4 
                        ELSE 5 
                    END,
                    sn.stage_name
            """, (row['performer_ids'], row['id']))
            actors = [r['stage_name'] for r in cur.fetchall()]
            row['actors'] = ', '.join(actors)
        else:
            row['actors'] = ''
    
    cur.close()
    conn.close()
    
    return jsonify(results)


@app.route('/api/actors/search', methods=['GET'])
def api_search_actors():
    """搜尋演員 (for search page autocomplete)"""
    query = request.args.get('q', '')
    
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    sql = """
        SELECT DISTINCT
            a.id as actor_id,
            sn.id as stage_name_id,
            sn.stage_name,
            a.actor_tag as actor_name,
            s.name as studio_name
        FROM stage_names sn
        JOIN actors a ON sn.actor_id = a.id
        LEFT JOIN studios s ON sn.studio_id = s.id
        WHERE (sn.stage_name ILIKE %s OR a.actor_tag ILIKE %s)
        ORDER BY sn.stage_name
        LIMIT 20
    """
    
    cur.execute(sql, (f'%{query}%', f'%{query}%'))
    results = cur.fetchall()
    cur.close()
    conn.close()
    
    return jsonify(results)

# ==================== 編輯演員功能 ====================

@app.route('/edit_actor')
def edit_actor_page():
    """編輯演員頁面"""
    return render_template('edit_actor.html')


@app.route('/api/actor/<int:actor_id>', methods=['GET'])
def get_actor(actor_id):
    """取得演員完整資料"""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # 取得演員基本資料
    cur.execute("SELECT * FROM actors WHERE id = %s", (actor_id,))
    actor = cur.fetchone()
    
    if not actor:
        cur.close()
        conn.close()
        return jsonify({'error': '找不到演員'}), 404
    
    # 取得所有藝名
    cur.execute("""
        SELECT sn.id, sn.studio_id, s.name as studio_name, sn.stage_name
        FROM stage_names sn
        JOIN studios s ON sn.studio_id = s.id
        WHERE sn.actor_id = %s
        ORDER BY s.name
    """, (actor_id,))
    stage_names = cur.fetchall()
    
    cur.close()
    conn.close()
    
    return jsonify({
        'id': actor['id'],
        'actor_tag': actor['actor_tag'],
        'gvdb_id': actor['gvdb_id'],
        'notes': actor['notes'],
        'stage_names': stage_names
    })


@app.route('/api/actor/<int:actor_id>', methods=['PUT'])
def update_actor(actor_id):
    """更新演員資料"""
    data = request.get_json()

    actor_tag = (data.get('actor_tag') or '').strip()
    gvdb_id = (data.get('gvdb_id') or '').strip() or None
    notes = (data.get('notes') or '').strip() or None
    stage_names = data.get('stage_names', [])
    
    if not actor_tag:
        return jsonify({'error': 'Actor Tag 不可為空'}), 400
    
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        # 檢查 actor_tag 是否與其他演員重複
        cur.execute("SELECT id FROM actors WHERE actor_tag = %s AND id != %s", (actor_tag, actor_id))
        if cur.fetchone():
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({'error': f'Actor Tag「{actor_tag}」已被其他演員使用'}), 400
        
        # 更新演員基本資料
        cur.execute("""
            UPDATE actors 
            SET actor_tag = %s, gvdb_id = %s, notes = %s
            WHERE id = %s
        """, (actor_tag, gvdb_id, notes, actor_id))
        
        # 處理藝名
        for sn in stage_names:
            if sn.get('is_new'):
                # 新增藝名
                cur.execute("""
                    INSERT INTO stage_names (actor_id, studio_id, stage_name)
                    VALUES (%s, %s, %s)
                """, (actor_id, int(sn['studio_id']), sn['stage_name']))
            elif sn.get('modified'):
                # 更新藝名
                cur.execute("""
                    UPDATE stage_names
                    SET stage_name = %s
                    WHERE id = %s AND actor_id = %s
                """, (sn['stage_name'], sn['id'], actor_id))
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'success': True, 'message': '演員資料已更新'})
        
    except Exception as e:
        conn.rollback()
        cur.close()
        conn.close()
        return jsonify({'error': str(e)}), 500


# ==================== 演員查詢功能 ====================

@app.route('/actors')
def actor_search_page():
    """演員查詢頁面"""
    return render_template('view_actor.html')


@app.route('/api/actors/filters', methods=['GET'])
def get_actor_filters():
    """取得演員查詢篩選選項（公司列表、排序選項）"""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # 取得所有公司
    cur.execute("SELECT id, name FROM studios ORDER BY name")
    studios = cur.fetchall()

    cur.close()
    conn.close()

    return jsonify({
        'studios': studios,
        'sort_options': [
            {'value': 'name', 'label': '按名字 (A-Z)'},
            {'value': 'latest', 'label': '按最新作品'},
            {'value': 'count', 'label': '按作品數量'}
        ]
    })


@app.route('/api/actors/suggestions', methods=['GET'])
def get_actor_suggestions():
    """取得演員建議（自動補齊）"""
    query = request.args.get('q', '').strip()

    if not query:
        return jsonify([])

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # 搜尋 actor_tag 和 stage_name（排除自動生成的演員）
    sql = """
        SELECT DISTINCT
            a.id as actor_id,
            a.actor_tag,
            array_agg(DISTINCT sn.stage_name) as stage_names,
            array_agg(DISTINCT s.name) as studios
        FROM actors a
        LEFT JOIN stage_names sn ON a.id = sn.actor_id
        LEFT JOIN studios s ON sn.studio_id = s.id
        WHERE (a.actor_tag ILIKE %s OR sn.stage_name ILIKE %s)
            AND a.actor_tag NOT LIKE 'STUDIO_%%'
        GROUP BY a.id, a.actor_tag
        ORDER BY
            CASE WHEN a.actor_tag ILIKE %s THEN 0 ELSE 1 END,
            a.actor_tag
        LIMIT 10
    """

    search_pattern = f'%{query}%'
    exact_pattern = f'{query}%'
    cur.execute(sql, (search_pattern, search_pattern, exact_pattern))
    results = cur.fetchall()
    cur.close()
    conn.close()

    return jsonify(results)


@app.route('/api/actors/query', methods=['GET'])
def query_actors():
    """
    演員查詢 API
    參數:
    - search: 搜尋關鍵字 (actor_tag 或 stage_name)
    - studios: 公司 ID (逗號分隔，可選)
    - sort: 排序欄位 (name|latest|count，默認 name)
    - sort_order: 排序順序 (asc|desc，默認 asc)
    - page: 頁碼（默認 1）
    - per_page: 每頁筆數（默認 20）
    """

    try:
        search = request.args.get('search', '').strip()
        studios = request.args.get('studios', '')
        sort = request.args.get('sort', 'name')
        sort_order = request.args.get('sort_order', 'asc').lower()
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        show_anonymous = request.args.get('show_anonymous', '0') == '1'

        # 驗證參數
        if sort not in ['name', 'latest', 'count']:
            sort = 'name'
        if sort_order not in ['asc', 'desc']:
            sort_order = 'asc'
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # 建立基礎查詢 - 查詢符合條件的演員（去重）
        # 排除 STUDIO_ 開頭的自動生成演員
        query_where = "a.actor_tag NOT LIKE 'STUDIO_%%'"

        # 排除或包含匿名演員
        if not show_anonymous:
            query_where += " AND a.actor_tag NOT IN ('ANONYMOUS_POOL', 'UNKNOWN_POOL')"

        params = []

        # 搜尋條件
        if search:
            query_where += " AND (a.actor_tag ILIKE %s OR sn.stage_name ILIKE %s)"
            search_pattern = f'%{search}%'
            params.extend([search_pattern, search_pattern])

        # 公司篩選
        if studios:
            try:
                studio_ids = [int(x) for x in studios.split(',')]
                placeholders = ','.join(['%s'] * len(studio_ids))
                query_where += f" AND sn.studio_id IN ({placeholders})"
                params.extend(studio_ids)
            except ValueError:
                pass

        # 計算總數
        count_query = f"""
            SELECT COUNT(DISTINCT a.id) as total
            FROM actors a
            LEFT JOIN stage_names sn ON a.id = sn.actor_id
            WHERE {query_where}
        """
        cur.execute(count_query, params)
        total = cur.fetchone()['total']

        # 排序子句
        sort_by = "a.actor_tag"
        if sort_order == 'desc' and sort == 'name':
            sort_by = "a.actor_tag DESC"
        elif sort_order == 'asc' and sort == 'name':
            sort_by = "a.actor_tag ASC"
        elif sort == 'latest':
            # 按最新作品日期排序
            sort_by = """(
                COALESCE(
                    (SELECT MAX(CASE
                        WHEN p.type IN ('single', 'album') THEN p.release_date
                        ELSE (SELECT release_date FROM productions WHERE id = p.parent_id)
                    END)
                    FROM performances perf
                    JOIN productions p ON perf.production_id = p.id
                    WHERE perf.stage_name_id IN (SELECT id FROM stage_names WHERE actor_id = a.id)
                    AND p.type IN ('single', 'segment')), '0000-01-01')
                ) DESC"""
        elif sort == 'count':
            # 按作品數量排序
            sort_by = """(
                COALESCE(
                    (SELECT COUNT(DISTINCT CASE
                        WHEN p.type IN ('single', 'album') THEN p.id
                        WHEN p.type = 'segment' THEN p.parent_id
                    END)
                    FROM performances perf
                    JOIN productions p ON perf.production_id = p.id
                    WHERE perf.stage_name_id IN (SELECT id FROM stage_names WHERE actor_id = a.id)
                    AND p.type IN ('single', 'segment')), 0)
                ) DESC"""

        # 分頁
        offset = (page - 1) * per_page
        # 使用 GROUP BY 避免 DISTINCT 與複雜 ORDER BY 的衝突
        full_query = f"""
            SELECT a.id as actor_id
            FROM actors a
            LEFT JOIN stage_names sn ON a.id = sn.actor_id
            WHERE {query_where}
            GROUP BY a.id
            ORDER BY {sort_by}
            LIMIT {per_page} OFFSET {offset}
        """

        cur.execute(full_query, params)
        actor_ids = [row['actor_id'] for row in cur.fetchall()]

        # 為每個演員取得詳細統計信息
        results = []
        for actor_id in actor_ids:
            # 取得演員基本信息
            cur.execute("SELECT id, actor_tag, gvdb_id, notes FROM actors WHERE id = %s", (actor_id,))
            actor = cur.fetchone()

            # 計算全局統計
            # 演員的作品數 = 單片數 + 專輯數（通過片段統計）
            # 角色統計 = 單片的角色 + 片段的角色（不包括專輯自身）
            cur.execute("""
                SELECT
                    COUNT(DISTINCT CASE
                        WHEN p.type = 'single' THEN p.id
                        WHEN p.type = 'segment' THEN p.parent_id
                    END) as total_productions,
                    COALESCE(SUM(CASE WHEN perf.role = 'top' THEN 1 ELSE 0 END), 0) as role_top,
                    COALESCE(SUM(CASE WHEN perf.role = 'bottom' THEN 1 ELSE 0 END), 0) as role_bottom,
                    COALESCE(SUM(CASE WHEN perf.role = 'giver' THEN 1 ELSE 0 END), 0) as role_giver,
                    COALESCE(SUM(CASE WHEN perf.role = 'receiver' THEN 1 ELSE 0 END), 0) as role_receiver,
                    COALESCE(SUM(CASE WHEN perf.role NOT IN ('top', 'bottom', 'giver', 'receiver') OR perf.role IS NULL THEN 1 ELSE 0 END), 0) as role_other
                FROM performances perf
                JOIN stage_names sn ON perf.stage_name_id = sn.id
                JOIN productions p ON perf.production_id = p.id
                WHERE sn.actor_id = %s AND p.type IN ('single', 'segment')
            """, (actor_id,))
            global_stats = cur.fetchone()

            # 取得最新作品信息（只考慮專輯或單片，不包括片段）
            # 通過 UNION 將單片和專輯片段的父專輯合併
            cur.execute("""
                SELECT p.code, p.release_date
                FROM performances perf
                JOIN stage_names sn ON perf.stage_name_id = sn.id
                JOIN productions p ON perf.production_id = p.id
                WHERE sn.actor_id = %s AND p.type = 'single'

                UNION

                SELECT p.code, p.release_date
                FROM performances perf
                JOIN stage_names sn ON perf.stage_name_id = sn.id
                JOIN productions seg ON perf.production_id = seg.id
                JOIN productions p ON seg.parent_id = p.id
                WHERE sn.actor_id = %s AND seg.type = 'segment' AND p.type = 'album'

                ORDER BY release_date DESC
                LIMIT 1
            """, (actor_id, actor_id))
            latest_prod = cur.fetchone()

            # 計算各公司的詳細統計
            # 顯示演員在所有公司的信息（即使沒有出演過）
            # 演員的作品數 = 單片數 + 專輯數（通過片段統計）
            # 角色統計 = 單片的角色 + 片段的角色（不包括專輯自身）
            cur.execute("""
                SELECT
                    s.id as studio_id,
                    s.name as studio_name,
                    sn.id as stage_name_id,
                    sn.stage_name,
                    COUNT(DISTINCT CASE
                        WHEN p.type = 'single' THEN p.id
                        WHEN p.type = 'segment' THEN p.parent_id
                    END) as productions,
                    COALESCE(SUM(CASE WHEN perf.role = 'top' THEN 1 ELSE 0 END), 0) as role_top,
                    COALESCE(SUM(CASE WHEN perf.role = 'bottom' THEN 1 ELSE 0 END), 0) as role_bottom,
                    COALESCE(SUM(CASE WHEN perf.role = 'giver' THEN 1 ELSE 0 END), 0) as role_giver,
                    COALESCE(SUM(CASE WHEN perf.role = 'receiver' THEN 1 ELSE 0 END), 0) as role_receiver,
                    COALESCE(SUM(CASE WHEN perf.role NOT IN ('top', 'bottom', 'giver', 'receiver') OR perf.role IS NULL THEN 1 ELSE 0 END), 0) as role_other,
                    (SELECT release_date FROM (
                        SELECT p2.release_date, p2.code FROM performances perf2
                        JOIN productions p2 ON perf2.production_id = p2.id
                        WHERE perf2.stage_name_id = sn.id AND p2.type = 'single'

                        UNION

                        SELECT p2.release_date, p2.code FROM performances perf2
                        JOIN productions seg ON perf2.production_id = seg.id
                        JOIN productions p2 ON seg.parent_id = p2.id
                        WHERE perf2.stage_name_id = sn.id AND seg.type = 'segment' AND p2.type = 'album'
                     ) AS latest_prod
                     ORDER BY release_date DESC
                     LIMIT 1) as latest_date,
                    (SELECT code FROM (
                        SELECT p2.release_date, p2.code FROM performances perf2
                        JOIN productions p2 ON perf2.production_id = p2.id
                        WHERE perf2.stage_name_id = sn.id AND p2.type = 'single'

                        UNION

                        SELECT p2.release_date, p2.code FROM performances perf2
                        JOIN productions seg ON perf2.production_id = seg.id
                        JOIN productions p2 ON seg.parent_id = p2.id
                        WHERE perf2.stage_name_id = sn.id AND seg.type = 'segment' AND p2.type = 'album'
                     ) AS latest_prod
                     ORDER BY release_date DESC
                     LIMIT 1) as latest_production_code
                FROM stage_names sn
                LEFT JOIN studios s ON sn.studio_id = s.id
                LEFT JOIN performances perf ON sn.id = perf.stage_name_id
                LEFT JOIN productions p ON perf.production_id = p.id AND p.type IN ('single', 'segment')
                WHERE sn.actor_id = %s
                GROUP BY s.id, s.name, sn.id, sn.stage_name
                ORDER BY s.name
            """, (actor_id,))
            studio_details = cur.fetchall()

            # 計算角色百分比
            total_roles = (global_stats['role_top'] + global_stats['role_bottom'] +
                          global_stats['role_giver'] + global_stats['role_receiver'] +
                          global_stats['role_other']) or 1

            studio_details_list = []
            for studio in studio_details:
                studio_total_roles = (studio['role_top'] + studio['role_bottom'] +
                                     studio['role_giver'] + studio['role_receiver'] +
                                     studio['role_other']) or 1

                studio_details_list.append({
                    'studio_id': studio['studio_id'],
                    'studio_name': studio['studio_name'],
                    'stage_name_id': studio['stage_name_id'],
                    'stage_name': studio['stage_name'],
                    'productions': studio['productions'],
                    'latest_date': studio['latest_date'],
                    'latest_production_code': studio['latest_production_code'],
                    'role_breakdown': {
                        'top': studio['role_top'],
                        'bottom': studio['role_bottom'],
                        'giver': studio['role_giver'],
                        'receiver': studio['role_receiver'],
                        'other': studio['role_other']
                    },
                    'role_percentage': {
                        'top': round((studio['role_top'] / studio_total_roles) * 100) if studio['role_top'] > 0 else 0,
                        'bottom': round((studio['role_bottom'] / studio_total_roles) * 100) if studio['role_bottom'] > 0 else 0,
                        'giver': round((studio['role_giver'] / studio_total_roles) * 100) if studio['role_giver'] > 0 else 0,
                        'receiver': round((studio['role_receiver'] / studio_total_roles) * 100) if studio['role_receiver'] > 0 else 0,
                        'other': round((studio['role_other'] / studio_total_roles) * 100) if studio['role_other'] > 0 else 0
                    }
                })

            results.append({
                'actor_id': actor['id'],
                'actor_tag': actor['actor_tag'],
                'gvdb_id': actor['gvdb_id'],
                'notes': actor['notes'],
                'global_stats': {
                    'total_productions': global_stats['total_productions'],
                    'latest_production_code': latest_prod['code'] if latest_prod else None,
                    'latest_release_date': latest_prod['release_date'] if latest_prod else None,
                    'role_breakdown': {
                        'top': global_stats['role_top'],
                        'bottom': global_stats['role_bottom'],
                        'giver': global_stats['role_giver'],
                        'receiver': global_stats['role_receiver'],
                        'other': global_stats['role_other']
                    }
                },
                'studio_details': studio_details_list
            })

        cur.close()
        conn.close()

        return jsonify({
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page,
            'results': results
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ==================== 啟動應用程式 ====================

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=DEBUG)