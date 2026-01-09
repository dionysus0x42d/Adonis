/**
 * GVDB IndexedDB 数据加载和查询模块
 * 用于将 JSON 数据导入浏览器 IndexedDB，提供快速离线查询
 */

class GVDBData {
    static dbName = 'GVDB-Database';
    static dbVersion = 1;
    static db = null;
    static dataLoaded = false;

    /**
     * 初始化 IndexedDB
     */
    static async init() {
        if (this.db && this.dataLoaded) {
            console.log('✓ GVDB data already loaded');
            return;
        }

        try {
            // 打开或创建数据库
            this.db = await this.openDatabase();
            console.log('✓ IndexedDB opened:', this.dbName);

            // 检查是否需要加载数据
            const count = await this.countRecords('studios');
            if (count === 0) {
                console.log('Loading GVDB data from JSON...');
                await this.loadDataFromJSON();
                this.dataLoaded = true;
                console.log('✓ All data loaded into IndexedDB');
            } else {
                this.dataLoaded = true;
                console.log('✓ Data already exists in IndexedDB');
            }
        } catch (error) {
            console.error('Failed to initialize IndexedDB:', error);
            throw error;
        }
    }

    /**
     * 打开或创建 IndexedDB 数据库
     */
    static openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 创建对象存储库
                this.createObjectStores(db);
            };
        });
    }

    /**
     * 创建对象存储库
     */
    static createObjectStores(db) {
        const stores = [
            { name: 'studios', keyPath: 'id', indexes: [{ name: 'name', unique: true }] },
            { name: 'actors', keyPath: 'id', indexes: [{ name: 'actor_tag', unique: true }] },
            { name: 'stage_names', keyPath: 'id', indexes: [{ name: 'actor_id' }, { name: 'studio_id' }, { name: 'composite', keyPath: ['actor_id', 'studio_id'], unique: true }] },
            { name: 'productions', keyPath: 'id', indexes: [{ name: 'code', unique: true }, { name: 'type' }, { name: 'studio_id' }, { name: 'parent_id' }] },
            { name: 'performances', keyPath: 'id', indexes: [{ name: 'production_id' }, { name: 'stage_name_id' }, { name: 'composite', keyPath: ['production_id', 'stage_name_id'], unique: true }] },
            { name: 'tags', keyPath: 'id', indexes: [{ name: 'composite', keyPath: ['category', 'name'], unique: true }] },
            { name: 'production_tags', keyPath: ['production_id', 'tag_id'], indexes: [{ name: 'production_id' }, { name: 'tag_id' }] }
        ];

        for (const store of stores) {
            if (!db.objectStoreNames.contains(store.name)) {
                const objStore = db.createObjectStore(store.name, { keyPath: store.keyPath });
                if (store.indexes) {
                    for (const index of store.indexes) {
                        objStore.createIndex(index.name, index.keyPath || index.name, { unique: index.unique || false });
                    }
                }
            }
        }
    }

    /**
     * 从 JSON 文件加载数据
     */
    static async loadDataFromJSON() {
        const tables = ['studios', 'actors', 'stage_names', 'productions', 'performances', 'tags', 'production_tags'];

        for (const table of tables) {
            try {
                const response = await fetch(`./data/${table}.json`);
                if (!response.ok) {
                    console.warn(`Warning: ${table}.json not found`);
                    continue;
                }

                const data = await response.json();
                await this.insertBatch(table, Array.isArray(data) ? data : data[table] || []);
                console.log(`✓ Loaded ${table}`);
            } catch (error) {
                console.error(`Error loading ${table}:`, error);
            }
        }
    }

    /**
     * 批量插入数据
     */
    static async insertBatch(storeName, items) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);

            for (const item of items) {
                store.add(item);
            }

            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => resolve();
        });
    }

    /**
     * 计算存储库中的记录数
     */
    static async countRecords(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    /**
     * 从存储库获取所有记录
     */
    static async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    /**
     * 按索引查询
     */
    static async getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    /**
     * 获取单条记录
     */
    static async get(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    /**
     * 获取演员列表（带过滤、排序、分页）
     */
    static async getActors(filters = {}, sort = {}, pagination = {}) {
        const pageSize = pagination.pageSize || 30;
        const pageNumber = pagination.page || 1;
        const offset = (pageNumber - 1) * pageSize;

        // 获取所有演员
        let actors = await this.getAll('actors');

        // 应用过滤器
        actors = await this.applyActorFilters(actors, filters);

        // 获取演员的作品统计
        actors = await Promise.all(actors.map(async (actor) => {
            const stats = await this.getActorStats(actor.id);
            return { ...actor, ...stats };
        }));

        // 应用排序
        if (sort.field) {
            actors = this.sortActors(actors, sort.field, sort.order === 'desc');
        }

        // 应用分页
        const total = actors.length;
        const paginatedActors = actors.slice(offset, offset + pageSize);

        return {
            data: paginatedActors,
            total: total,
            page: pageNumber,
            pageSize: pageSize,
            totalPages: Math.ceil(total / pageSize)
        };
    }

    /**
     * 应用演员过滤器
     */
    static async applyActorFilters(actors, filters) {
        let filtered = actors;

        // 按公司过滤
        if (filters.studios && filters.studios.length > 0) {
            const stageNames = await this.getAll('stage_names');
            const actorsByStudio = new Set();

            for (const stageName of stageNames) {
                if (filters.studios.includes(stageName.studio_id)) {
                    actorsByStudio.add(stageName.actor_id);
                }
            }

            filtered = filtered.filter(a => actorsByStudio.has(a.id));
        }

        // 按名字过滤
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            filtered = filtered.filter(a =>
                a.actor_tag.toLowerCase().includes(searchLower)
            );
        }

        // 隐藏匿名演员
        if (!filters.showAnonymous) {
            filtered = filtered.filter(a =>
                !a.actor_tag.match(/^(STUDIO_|ANONYMOUS|UNKNOWN|GIRL)/)
            );
        }

        return filtered;
    }

    /**
     * 获取演员统计信息
     */
    static async getActorStats(actorId) {
        const stageNames = await this.getByIndex('stage_names', 'actor_id', actorId);
        const performances = [];
        const studioMap = new Map(); // studio_id -> { stage_names: [sn], performances: [perf] }
        const studios = new Set();

        // 按工作室组织舞台名称和演出
        for (const sn of stageNames) {
            studios.add(sn.studio_id);
            if (!studioMap.has(sn.studio_id)) {
                studioMap.set(sn.studio_id, { stage_names: [], performances: [] });
            }
            studioMap.get(sn.studio_id).stage_names.push(sn);

            const perfs = await this.getByIndex('performances', 'stage_name_id', sn.id);
            performances.push(...perfs);
            studioMap.get(sn.studio_id).performances.push(...perfs);
        }

        // 计算全局作品数（去重）
        const productionIds = new Set();
        for (const perf of performances) {
            const prod = await this.get('productions', perf.production_id);
            if (prod.type === 'segment') {
                productionIds.add(prod.parent_id);
            } else {
                productionIds.add(prod.id);
            }
        }

        // 计算全局角色统计
        const roleCounts = { top: 0, bottom: 0, giver: 0, receiver: 0, other: 0 };
        for (const perf of performances) {
            const role = perf.role || 'other';
            if (role in roleCounts) {
                roleCounts[role]++;
            }
        }

        // 获取最新作品日期
        let latestDate = null;
        let latestCode = null;
        for (const prodId of productionIds) {
            const prod = await this.get('productions', prodId);
            if (prod && prod.release_date) {
                if (!latestDate || prod.release_date > latestDate) {
                    latestDate = prod.release_date;
                    latestCode = prod.code;
                }
            }
        }

        // 构建每个工作室的统计信息
        const studioDetails = [];
        for (const [studioId, data] of studioMap) {
            const studio = await this.get('studios', studioId);
            const stageName = data.stage_names[0]?.stage_name || '';

            // 该工作室的作品数（去重）
            const studioProductions = new Set();
            for (const perf of data.performances) {
                const prod = await this.get('productions', perf.production_id);
                if (prod.type === 'segment') {
                    studioProductions.add(prod.parent_id);
                } else {
                    studioProductions.add(prod.id);
                }
            }

            // 该工作室的角色统计
            const studioRoleCounts = { top: 0, bottom: 0, giver: 0, receiver: 0, other: 0 };
            for (const perf of data.performances) {
                const role = perf.role || 'other';
                if (role in studioRoleCounts) {
                    studioRoleCounts[role]++;
                }
            }

            // 计算该工作室的角色百分比
            const totalRoles = Object.values(studioRoleCounts).reduce((a, b) => a + b, 0) || 1;
            const rolePercentage = {
                top: Math.round((studioRoleCounts.top / totalRoles) * 100),
                bottom: Math.round((studioRoleCounts.bottom / totalRoles) * 100),
                giver: Math.round((studioRoleCounts.giver / totalRoles) * 100),
                receiver: Math.round((studioRoleCounts.receiver / totalRoles) * 100),
                other: Math.round((studioRoleCounts.other / totalRoles) * 100)
            };

            // 该工作室的最新作品
            let studioLatestDate = null;
            let studioLatestCode = null;
            for (const prodId of studioProductions) {
                const prod = await this.get('productions', prodId);
                if (prod && prod.release_date) {
                    if (!studioLatestDate || prod.release_date > studioLatestDate) {
                        studioLatestDate = prod.release_date;
                        studioLatestCode = prod.code;
                    }
                }
            }

            studioDetails.push({
                studio_id: studioId,
                studio_name: studio.name,
                stage_name: stageName,
                productions: studioProductions.size,
                role_breakdown: studioRoleCounts,
                role_percentage: rolePercentage,
                latest_production_code: studioLatestCode || '無',
                latest_date: studioLatestDate || '無'
            });
        }

        return {
            totalProductions: productionIds.size,
            studios: Array.from(studios),
            studio_details: studioDetails,
            roleCounts: roleCounts,
            latestDate: latestDate,
            latestCode: latestCode
        };
    }

    /**
     * 排序演员
     */
    static sortActors(actors, field, desc = false) {
        const sorted = [...actors].sort((a, b) => {
            let aVal, bVal;

            switch (field) {
                case 'name':
                    aVal = a.actor_tag.toLowerCase();
                    bVal = b.actor_tag.toLowerCase();
                    break;
                case 'latest':
                    aVal = a.latestDate || '';
                    bVal = b.latestDate || '';
                    break;
                case 'count':
                    aVal = a.totalProductions || 0;
                    bVal = b.totalProductions || 0;
                    break;
                case 'newest_edit':
                    aVal = a.newest_edit || '';
                    bVal = b.newest_edit || '';
                    break;
                default:
                    return 0;
            }

            if (aVal < bVal) return desc ? 1 : -1;
            if (aVal > bVal) return desc ? -1 : 1;
            return 0;
        });

        return sorted;
    }

    /**
     * 获取作品列表（带过滤、排序、分页）
     */
    static async getProductions(filters = {}, sort = {}, pagination = {}) {
        const pageSize = pagination.pageSize || 30;
        const pageNumber = pagination.page || 1;
        const offset = (pageNumber - 1) * pageSize;

        // 获取所有作品
        let productions = await this.getAll('productions');

        // 仅显示非片段的作品
        productions = productions.filter(p => p.type !== 'segment');

        // 应用过滤器
        productions = await this.applyProductionFilters(productions, filters);

        // 添加演员、标签和工作室信息
        productions = await Promise.all(productions.map(async (prod) => {
            const details = await this.getProductionDetails(prod.id);
            const studio = await this.get('studios', prod.studio_id);
            return {
                ...prod,
                ...details,
                studio_name: studio.name
            };
        }));

        // 应用排序
        if (sort.field) {
            productions = this.sortProductions(productions, sort.field, sort.order === 'desc');
        }

        // 应用分页
        const total = productions.length;
        const paginatedProductions = productions.slice(offset, offset + pageSize);

        return {
            data: paginatedProductions,
            total: total,
            page: pageNumber,
            pageSize: pageSize,
            totalPages: Math.ceil(total / pageSize)
        };
    }

    /**
     * 应用作品过滤器
     */
    static async applyProductionFilters(productions, filters) {
        let filtered = productions;

        // 按公司过滤
        if (filters.studios && filters.studios.length > 0) {
            filtered = filtered.filter(p => filters.studios.includes(p.studio_id));
        }

        // 按类型过滤
        if (filters.types && filters.types.length > 0) {
            filtered = filtered.filter(p => filters.types.includes(p.type));
        }

        // 按演员(舞台名称ID)过滤
        if (filters.actors && filters.actors.length > 0) {
            const filteredByActors = [];
            for (const prod of filtered) {
                // 获取该作品的所有演出
                let perfs = await this.getByIndex('performances', 'production_id', prod.id);

                // 如果是段，也要检查父作品
                if (prod.type === 'segment' && prod.parent_id) {
                    const parentPerfs = await this.getByIndex('performances', 'production_id', prod.parent_id);
                    perfs = [...perfs, ...parentPerfs];
                }

                // 检查是否有任何演出的舞台名称ID匹配过滤器
                const hasMatchingActor = perfs.some(p => filters.actors.includes(p.stage_name_id));
                if (hasMatchingActor) {
                    filteredByActors.push(prod);
                }
            }
            filtered = filteredByActors;
        }

        // 按日期范围过滤
        if (filters.dateFrom || filters.dateTo) {
            filtered = filtered.filter(p => {
                if (filters.dateFrom && p.release_date < filters.dateFrom) return false;
                if (filters.dateTo && p.release_date > filters.dateTo) return false;
                return true;
            });
        }

        // 按标签过滤（性爱行为、风格、体型、来源）
        const tagCategories = {
            sex_acts: 'sex_act',
            styles: 'style',
            body_types: 'body_type',
            sources: 'source'
        };

        for (const [filterKey, tagCategory] of Object.entries(tagCategories)) {
            if (filters[filterKey] && filters[filterKey].length > 0) {
                const filteredByTags = [];
                for (const prod of filtered) {
                    // 获取该作品的所有标签
                    const prodTags = await this.getByIndex('production_tags', 'production_id', prod.id);
                    const tagIds = prodTags.map(pt => pt.tag_id);

                    // 获取这些标签的详细信息
                    const tags = [];
                    for (const tagId of tagIds) {
                        const tag = await this.get('tags', tagId);
                        if (tag && tag.category === tagCategory) {
                            tags.push(tag.name);
                        }
                    }

                    // 检查是否有任何标签匹配过滤器
                    const hasMatchingTag = tags.some(t => filters[filterKey].includes(t));
                    if (hasMatchingTag) {
                        filteredByTags.push(prod);
                    }
                }
                filtered = filteredByTags;
            }
        }

        // 按关键字过滤
        if (filters.keyword) {
            const keywordLower = filters.keyword.toLowerCase();
            filtered = filtered.filter(p =>
                p.code.toLowerCase().includes(keywordLower) ||
                (p.title && p.title.toLowerCase().includes(keywordLower)) ||
                (p.comment && p.comment.toLowerCase().includes(keywordLower))
            );
        }

        return filtered;
    }

    /**
     * 获取作品详情（演员和标签）
     */
    static async getProductionDetails(productionId) {
        // 获取演员
        const performances = await this.getByIndex('performances', 'production_id', productionId);
        const actors = [];

        for (const perf of performances) {
            const sn = await this.get('stage_names', perf.stage_name_id);
            const actor = await this.get('actors', sn.actor_id);
            const studio = await this.get('studios', sn.studio_id);

            actors.push({
                stageName: sn.stage_name,
                actorName: actor.actor_tag,
                studioName: studio.name,
                role: perf.role,
                performerType: perf.performer_type
            });
        }

        // 获取标签
        const prodTags = await this.getByIndex('production_tags', 'production_id', productionId);
        const tags = { sex_acts: [], styles: [], body_types: [], sources: [] };

        for (const pt of prodTags) {
            const tag = await this.get('tags', pt.tag_id);
            if (tag.category === 'sex_act') tags.sex_acts.push(tag.name);
            else if (tag.category === 'style') tags.styles.push(tag.name);
            else if (tag.category === 'body_type') tags.body_types.push(tag.name);
            else if (tag.category === 'source') tags.sources.push(tag.name);
        }

        return {
            actors: actors,
            tags: tags
        };
    }

    /**
     * 排序作品
     */
    static sortProductions(productions, field, desc = false) {
        const sorted = [...productions].sort((a, b) => {
            let aVal, bVal;

            switch (field) {
                case 'studio':
                    aVal = a.studio_name || '';
                    bVal = b.studio_name || '';
                    break;
                case 'code':
                    aVal = a.code || '';
                    bVal = b.code || '';
                    break;
                case 'title':
                    aVal = a.title || '';
                    bVal = b.title || '';
                    break;
                case 'date':
                    aVal = a.release_date || '';
                    bVal = b.release_date || '';
                    break;
                case 'updated':
                    aVal = a.updated_at || '';
                    bVal = b.updated_at || '';
                    break;
                default:
                    return 0;
            }

            if (aVal < bVal) return desc ? 1 : -1;
            if (aVal > bVal) return desc ? -1 : 1;
            return 0;
        });

        return sorted;
    }

    /**
     * 搜索演员建议
     */
    static async searchActorSuggestions(query) {
        const stageNames = await this.getAll('stage_names');
        const queryLower = query.toLowerCase();
        const suggestions = [];
        const seen = new Set();

        for (const sn of stageNames) {
            if (sn.stage_name.toLowerCase().includes(queryLower) && !seen.has(sn.id)) {
                const actor = await this.get('actors', sn.actor_id);
                const studio = await this.get('studios', sn.studio_id);

                suggestions.push({
                    stageName: sn.stage_name,
                    stageNameId: sn.id,
                    actorName: actor.actor_tag,
                    actorId: actor.id,
                    studioName: studio.name,
                    studioId: studio.id
                });

                seen.add(sn.id);
            }
        }

        return suggestions.slice(0, 20); // 限制前20个
    }
}

// 页面加载时自动初始化
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await GVDBData.init();
    } catch (error) {
        console.error('Failed to initialize GVDB:', error);
    }
});
