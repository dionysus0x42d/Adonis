/**
 * GVDB 数据加载模块 - 直接加载 JSON
 * 简化版：不使用 IndexedDB，直接在内存中存储和查询
 */

class GVDBData {
    static data = null;
    static dataLoaded = false;

    /**
     * 初始化：加载所有 JSON 数据
     */
    static async init() {
        if (this.dataLoaded) {
            console.log('✓ GVDB data already loaded');
            return;
        }

        try {
            console.log('Loading GVDB data from JSON...');

            // 并行加载所有 JSON 文件
            const [studios, actors, stageNames, productions, performances, tags, productionTags] =
                await Promise.all([
                    this.loadJSON('data/studios.json'),
                    this.loadJSON('data/actors.json'),
                    this.loadJSON('data/stage_names.json'),
                    this.loadJSON('data/productions.json'),
                    this.loadJSON('data/performances.json'),
                    this.loadJSON('data/tags.json'),
                    this.loadJSON('data/production_tags.json')
                ]);

            // 存储在内存中
            this.data = {
                studios,
                actors,
                stage_names: stageNames,
                productions,
                performances,
                tags,
                production_tags: productionTags
            };

            this.dataLoaded = true;
            console.log('✓ All data loaded successfully');
            console.log(`  Studios: ${studios.length}`);
            console.log(`  Actors: ${actors.length}`);
            console.log(`  Productions: ${productions.length}`);
            console.log(`  Performances: ${performances.length}`);
            console.log(`  Tags: ${tags.length}`);
            console.log(`  Production_tags: ${productionTags.length}`);

        } catch (error) {
            console.error('Failed to load data:', error);
            throw error;
        }
    }

    /**
     * 加载单个 JSON 文件
     */
    static async loadJSON(path) {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load ${path}: ${response.statusText}`);
        }
        const data = await response.json();
        return Array.isArray(data) ? data : data[Object.keys(data)[0]] || [];
    }

    /**
     * 从存储库获取所有记录
     */
    static async getAll(storeName) {
        return this.data[storeName] || [];
    }

    /**
     * 获取单条记录
     */
    static async get(storeName, key) {
        const store = this.data[storeName] || [];
        return store.find(item => item.id === key);
    }

    /**
     * 按索引查询（简单过滤）
     */
    static async getByIndex(storeName, indexName, value) {
        const store = this.data[storeName] || [];
        return store.filter(item => item[indexName] === value);
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

        // 排除特殊演員（STUDIO_*, 匿名池等）
        const excludePatterns = ['STUDIO_', 'ANONYMOUS_POOL', 'GIRL_POOL', 'UNKNOWN_POOL'];
        filtered = filtered.filter(a => !excludePatterns.some(pattern => a.actor_tag.includes(pattern)));

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

        // 按搜索词过滤
        if (filters.search && filters.search.length > 0) {
            const searchLower = filters.search.toLowerCase();
            const stageNames = await this.getAll('stage_names');
            const matchingActorIds = new Set();

            for (const sn of stageNames) {
                if (sn.stage_name.toLowerCase().includes(searchLower) ||
                    sn.actor_id.toString() === filters.search) {
                    matchingActorIds.add(sn.actor_id);
                }
            }

            filtered = filtered.filter(a => matchingActorIds.has(a.id));
        }

        return filtered;
    }

    /**
     * 获取演员统计信息
     */
    static async getActorStats(actorId) {
        const stageNames = await this.getByIndex('stage_names', 'actor_id', actorId);

        let totalProductions = 0;
        let roleCounts = {
            top: 0,
            bottom: 0,
            giver: 0,
            receiver: 0,
            other: 0
        };

        let latestCode = '無';
        let latestDate = '無';
        let latestTime = 0;

        const seenProductions = new Set();
        const studioStats = {}; // 按公司的统计

        for (const sn of stageNames) {
            const studio = await this.get('studios', sn.studio_id);
            const studioName = studio.name;

            // 初始化该公司的统计
            if (!studioStats[sn.studio_id]) {
                studioStats[sn.studio_id] = {
                    studio_id: sn.studio_id,
                    studio_name: studioName,
                    stage_name: sn.stage_name,
                    productions: 0,
                    role_breakdown: { top: 0, bottom: 0, giver: 0, receiver: 0, other: 0 },
                    role_percentage: { top: 0, bottom: 0, giver: 0, receiver: 0, other: 0 },
                    latest_production_code: '---',
                    latest_date: '無'
                };
            }

            const stagePerfs = await this.getByIndex('performances', 'stage_name_id', sn.id);

            for (const perf of stagePerfs) {
                const prod = await this.get('productions', perf.production_id);
                if (!prod) continue;

                // 去重：只计算实际作品（去除片段重复）
                const key = prod.type === 'segment' ? prod.parent_id : prod.id;
                if (!seenProductions.has(key)) {
                    seenProductions.add(key);
                    totalProductions++;
                }

                // 全局角色统计
                const role = perf.role || 'other';
                if (role === 'top') roleCounts.top++;
                else if (role === 'bottom') roleCounts.bottom++;
                else if (role === 'giver') roleCounts.giver++;
                else if (role === 'receiver') roleCounts.receiver++;
                else roleCounts.other++;

                // 按公司的角色统计
                studioStats[sn.studio_id].role_breakdown[role]++;
                studioStats[sn.studio_id].productions++;

                // 更新最新作品（全局）
                const prodTime = new Date(prod.release_date || prod.updated_at || 0).getTime();
                if (prodTime > latestTime) {
                    latestTime = prodTime;
                    latestCode = prod.code || '無';
                    latestDate = prod.release_date || '無';
                }

                // 更新最新作品（按公司）
                const studioProdTime = new Date(prod.release_date || prod.updated_at || 0).getTime();
                const studioLatestTime = new Date(studioStats[sn.studio_id].latest_date || 0).getTime();
                if (studioProdTime > studioLatestTime) {
                    studioStats[sn.studio_id].latest_production_code = prod.code || '---';
                    studioStats[sn.studio_id].latest_date = prod.release_date || '無';
                }
            }
        }

        // 计算按公司的角色百分比
        for (const studioId in studioStats) {
            const stats = studioStats[studioId];
            const total = stats.productions || 1;
            stats.role_percentage = {
                top: Math.round((stats.role_breakdown.top / total) * 100),
                bottom: Math.round((stats.role_breakdown.bottom / total) * 100),
                giver: Math.round((stats.role_breakdown.giver / total) * 100),
                receiver: Math.round((stats.role_breakdown.receiver / total) * 100),
                other: Math.round((stats.role_breakdown.other / total) * 100)
            };
        }

        return {
            totalProductions: totalProductions,
            roleCounts: roleCounts,
            latestCode: latestCode,
            latestDate: latestDate,
            studio_details: Object.values(studioStats)
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
                    aVal = a.actor_tag || '';
                    bVal = b.actor_tag || '';
                    break;
                case 'count':
                    aVal = a.totalProductions || 0;
                    bVal = b.totalProductions || 0;
                    break;
                case 'latest':
                    aVal = a.latestDate || '';
                    bVal = b.latestDate || '';
                    break;
                case 'newest_edit':
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

        // 按演员过滤
        if (filters.actors && filters.actors.length > 0) {
            const filteredByActors = [];
            for (const prod of filtered) {
                let perfs = await this.getByIndex('performances', 'production_id', prod.id);

                if (prod.type === 'segment' && prod.parent_id) {
                    const parentPerfs = await this.getByIndex('performances', 'production_id', prod.parent_id);
                    perfs = [...perfs, ...parentPerfs];
                }

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

        // 按标签过滤
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
                    const prodTags = await this.getByIndex('production_tags', 'production_id', prod.id);
                    const tagIds = prodTags.map(pt => pt.tag_id);

                    const tags = [];
                    for (const tagId of tagIds) {
                        const tag = await this.get('tags', tagId);
                        if (tag && tag.category === tagCategory) {
                            tags.push(tag.name);
                        }
                    }

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
        const prod = await this.get('productions', productionId);
        const actors = [];
        const seenActorIds = new Set();

        // 仅过滤 STUDIO_* 模式的自动生成演员，保留匿名演员（作品查询页面允许显示）
        const excludeActorPatterns = ['STUDIO_'];

        if (prod.type === 'album') {
            // 专辑：使用 denormalized performer_ids
            const performerIds = prod.performer_ids || [];

            for (const stageNameId of performerIds) {
                if (seenActorIds.has(stageNameId)) continue;
                seenActorIds.add(stageNameId);

                const sn = await this.get('stage_names', stageNameId);
                if (!sn) continue;

                const actor = await this.get('actors', sn.actor_id);
                if (!actor) continue;

                const isExcluded = excludeActorPatterns.some(pattern => actor.actor_tag.includes(pattern));
                if (isExcluded) continue;

                const studio = await this.get('studios', sn.studio_id);

                actors.push({
                    stageName: sn.stage_name,
                    actorName: actor.actor_tag,
                    studioName: studio.name,
                    role: null,
                    performerType: null
                });
            }
        } else {
            // 单片/片段：从 performances 获取
            const performances = await this.getByIndex('performances', 'production_id', productionId);

            for (const perf of performances) {
                const sn = await this.get('stage_names', perf.stage_name_id);
                if (!sn) continue;

                const actor = await this.get('actors', sn.actor_id);
                if (!actor) continue;

                const isExcluded = excludeActorPatterns.some(pattern => actor.actor_tag.includes(pattern));
                if (isExcluded) continue;

                const studio = await this.get('studios', sn.studio_id);

                actors.push({
                    stageName: sn.stage_name,
                    actorName: actor.actor_tag,
                    studioName: studio.name,
                    role: perf.role,
                    performerType: perf.performer_type
                });
            }
        }

        // 获取标签
        const prodTags = await this.getByIndex('production_tags', 'production_id', productionId);
        const tags = { sex_acts: [], styles: [], body_types: [], sources: [] };

        for (const pt of prodTags) {
            const tag = await this.get('tags', pt.tag_id);
            if (!tag) continue;

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

        return suggestions;
    }
}
