export const TAG_VIEW_PAGE_SIZE = 120;

export function splitSelectorTagText(value) {
    const seen = new Set();
    const result = [];
    const visit = item => {
        if (Array.isArray(item)) {
            item.forEach(visit);
            return;
        }
        String(item || "")
            .replace(/\r/g, ",")
            .replace(/\n/g, ",")
            .split(",")
            .map(part => part.trim().replace(/^_raw_:/, "").trim())
            .filter(Boolean)
            .forEach(tag => {
                const key = normalizeSelectorTagKey(tag);
                if (!key || seen.has(key)) return;
                seen.add(key);
                result.push(tag);
            });
    };
    visit(value);
    return result;
}

export function normalizeSelectorTagKey(value) {
    return String(value || "").replace(/^_raw_:/, "").trim().toLowerCase();
}

export function createDefaultTagFavorites(defaultName = "默认 Tag") {
    return {
        tagGroups: [{ id: "default", name: defaultName, isSystem: true }],
        tagItems: [],
    };
}

export function normalizeSelectorCategoryId(value) {
    const cleaned = String(value || "")
        .replace(/\([^)]*\)/g, "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `auto:${cleaned || "uncategorized"}`;
}

export function normalizeSelectorCategoryLabel(value) {
    const text = String(value || "").trim();
    if (!text) return "Uncategorized";
    const english = text.match(/\(([^)]+)\)/);
    return (english?.[1] || text).trim();
}

export function normalizeSelectorCategory(value) {
    if (value && typeof value === "object") {
        const label = value.label && typeof value.label === "object"
            ? value.label.en || value.label.zh || value.id
            : value.label || value.name || value.id;
        const labelZh = value.label && typeof value.label === "object" ? value.label.zh || "" : value.labelZh || "";
        return {
            id: String(value.id || normalizeSelectorCategoryId(label)).trim(),
            label: normalizeSelectorCategoryLabel(label),
            labelZh,
            booruType: value.booruType || "general",
        };
    }
    return {
        id: normalizeSelectorCategoryId(value),
        label: normalizeSelectorCategoryLabel(value),
    };
}

export function ensureSelectorTagFavorites(sectionConfig, defaultName = "默认 Tag") {
    const defaults = createDefaultTagFavorites(defaultName);
    if (!sectionConfig || typeof sectionConfig !== "object") return defaults;
    sectionConfig.tagGroups = Array.isArray(sectionConfig.tagGroups) && sectionConfig.tagGroups.length
        ? sectionConfig.tagGroups
        : defaults.tagGroups.slice();
    if (!sectionConfig.tagGroups.some(group => group?.id === "default")) {
        sectionConfig.tagGroups = [defaults.tagGroups[0], ...sectionConfig.tagGroups];
    }
    sectionConfig.tagItems = Array.isArray(sectionConfig.tagItems) ? sectionConfig.tagItems : [];
    return sectionConfig;
}

export function buildSelectorTagCatalog(items, options = {}) {
    const getTags = options.getTags || (item => item?.tags);
    const getZhTags = options.getZhTags || (item => item?.tags_zh);
    const getSourceLabel = options.getSourceLabel || (item => item?.name_zh || item?.name || item?.id || "");
    const getCategories = options.getCategories || (item => item?.categories);
    const byKey = new Map();

    (items || []).forEach(item => {
        const tags = splitSelectorTagText(getTags(item));
        const zhTags = splitSelectorTagText(getZhTags(item));
        const rawCategories = getCategories(item);
        const sourceCategories = Array.isArray(rawCategories) && rawCategories.some(category => category && typeof category === "object")
            ? rawCategories
            : splitSelectorTagText(rawCategories);
        const categories = (sourceCategories.length ? sourceCategories : [""]).map(normalizeSelectorCategory);
        const seenInItem = new Set();
        tags.forEach((tag, index) => {
            const key = normalizeSelectorTagKey(tag);
            if (!key || seenInItem.has(key)) return;
            seenInItem.add(key);
            const existing = byKey.get(key) || {
                tag,
                labelZh: "",
                sourceCount: 0,
                sources: [],
                categories: [],
            };
            existing.sourceCount += 1;
            if (!existing.labelZh && zhTags[index]) existing.labelZh = zhTags[index];
            const source = getSourceLabel(item);
            if (source && existing.sources.length < 3 && !existing.sources.includes(source)) {
                existing.sources.push(source);
            }
            categories.forEach(category => {
                if (!existing.categories.some(existingCategory => existingCategory.id === category.id)) {
                    existing.categories.push(category);
                }
            });
            byKey.set(key, existing);
        });
    });

    return Array.from(byKey.values()).sort((a, b) => {
        return Number(b.sourceCount || 0) - Number(a.sourceCount || 0)
            || String(a.tag || "").localeCompare(String(b.tag || ""));
    });
}

export function buildConfiguredSelectorTagCatalog(sectionConfig) {
    if (!sectionConfig || typeof sectionConfig !== "object" || !Array.isArray(sectionConfig.tags)) {
        return [];
    }
    const categoriesById = new Map();
    (Array.isArray(sectionConfig.categories) ? sectionConfig.categories : [])
        .map(normalizeSelectorCategory)
        .filter(category => category.id)
        .forEach(category => categoriesById.set(category.id, category));
    const seen = new Set();
    const catalog = [];

    sectionConfig.tags.forEach(rawItem => {
        if (!rawItem || typeof rawItem !== "object") return;
        const tag = String(rawItem.tag || rawItem.name || "").trim();
        const key = normalizeSelectorTagKey(tag);
        if (!key || seen.has(key)) return;
        seen.add(key);
        const label = normalizeLocalizedText(rawItem.label, tag);
        const meaning = normalizeLocalizedText(rawItem.meaning, "");
        const categoryIds = Array.isArray(rawItem.categoryIds) ? rawItem.categoryIds : [];
        const categories = categoryIds
            .map(id => categoriesById.get(String(id || "").trim()))
            .filter(Boolean);
        if (!categories.length) {
            categories.push(categoriesById.get("uncategorized") || normalizeSelectorCategory("Uncategorized"));
        }
        catalog.push({
            tag,
            label: label.en || tag,
            labelZh: label.zh || "",
            meaning,
            aliases: splitSelectorTagText(rawItem.aliases || []),
            categories,
            booruType: rawItem.booruType || categories[0]?.booruType || "general",
            sourceCount: Number(rawItem.sourceCount || 0),
            sources: Array.isArray(rawItem.sources) ? rawItem.sources.slice(0, 3) : [],
        });
    });

    return catalog.sort((a, b) => String(a.tag || "").localeCompare(String(b.tag || "")));
}

export function normalizeLocalizedText(value, fallback = "") {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return {
            en: String(value.en || fallback || "").trim(),
            zh: String(value.zh || "").trim(),
        };
    }
    return {
        en: String(value || fallback || "").trim(),
        zh: "",
    };
}

export function buildSelectorTagSidebarEntries(catalog, tagFavorites, options = {}) {
    const t = options.t || (value => value);
    const favorites = ensureSelectorTagFavorites(tagFavorites || {});
    const entries = [{
        type: "all",
        id: "all",
        label: t("All Tags"),
    }];

    favorites.tagGroups.forEach(group => {
        const label = String(group?.name || "").trim();
        entries.push({
            type: "group",
            id: `group:${group.id}`,
            groupId: group.id,
            label,
            displayLabel: formatSelectorTagGroupLabel(group, t),
            group,
        });
    });

    const categories = new Map();
    (catalog || []).forEach(item => {
        (item.categories || [{ id: "auto:uncategorized", label: "Uncategorized" }]).forEach(category => {
            const entry = categories.get(category.id) || {
                type: "category",
                id: `category:${category.id}`,
                categoryId: category.id,
                label: category.label || category.id,
                labelZh: category.labelZh || "",
                displayLabel: formatSelectorCategoryLabel(category),
                booruType: category.booruType || "general",
            };
            categories.set(category.id, entry);
        });
    });

    entries.push(...Array.from(categories.values()).sort((a, b) => {
        return String(a.label || "").localeCompare(String(b.label || ""));
    }));
    return entries;
}

export function tagFavoriteKey(tag) {
    return normalizeSelectorTagKey(tag);
}

export function getSelectorTagFavorite(tagFavorites, tag) {
    const key = tagFavoriteKey(tag);
    return (tagFavorites?.tagItems || []).find(item => tagFavoriteKey(item?.tag) === key);
}

export function toggleSelectorTagFavorite(tagFavorites, catalogItem, groupId = "default") {
    ensureSelectorTagFavorites(tagFavorites);
    const key = tagFavoriteKey(catalogItem?.tag);
    if (!key) return null;
    let item = getSelectorTagFavorite(tagFavorites, catalogItem.tag);
    if (!item) {
        item = {
            tag: catalogItem.tag,
            labelZh: catalogItem.labelZh || "",
            groupIds: [],
        };
        tagFavorites.tagItems.push(item);
    }
    item.groupIds = Array.isArray(item.groupIds) ? item.groupIds : [];
    if (item.groupIds.includes(groupId)) {
        item.groupIds = item.groupIds.filter(id => id !== groupId);
    } else {
        item.groupIds.push(groupId);
    }
    if (!item.groupIds.length) {
        tagFavorites.tagItems = tagFavorites.tagItems.filter(existing => tagFavoriteKey(existing.tag) !== key);
        return null;
    }
    return item;
}

export function createSelectorTagFavoriteFromText(tagFavorites, catalog = [], text, groupId = "default") {
    ensureSelectorTagFavorites(tagFavorites);
    const clean = String(text || "").trim();
    const key = tagFavoriteKey(clean);
    if (!key) return null;

    const catalogItem = (catalog || []).find(item => tagFavoriteKey(item?.tag) === key);
    let item = getSelectorTagFavorite(tagFavorites, catalogItem?.tag || clean);
    if (!item) {
        item = catalogItem
            ? {
                tag: catalogItem.tag,
                labelZh: catalogItem.labelZh || "",
                groupIds: [],
            }
            : {
                tag: clean,
                groupIds: [],
                isCustom: true,
            };
        tagFavorites.tagItems.push(item);
    } else if (catalogItem && item.isCustom) {
        item.tag = catalogItem.tag;
        item.labelZh = catalogItem.labelZh || item.labelZh || "";
        delete item.isCustom;
    }

    item.groupIds = Array.isArray(item.groupIds) ? item.groupIds : [];
    if (!item.groupIds.includes(groupId)) item.groupIds.push(groupId);
    return item;
}

export function getSelectorTagFavoriteGroupItems(catalog = [], tagFavorites, groupId = "default") {
    const favorites = ensureSelectorTagFavorites(tagFavorites || {});
    const catalogByKey = new Map((catalog || []).map(item => [tagFavoriteKey(item?.tag), item]));
    const seen = new Set();
    const result = [];

    (favorites.tagItems || [])
        .filter(item => groupId === "all" || item.groupIds?.includes(groupId))
        .forEach(item => {
            const key = tagFavoriteKey(item?.tag);
            if (!key || seen.has(key)) return;
            seen.add(key);
            const catalogItem = catalogByKey.get(key);
            if (catalogItem) {
                result.push(catalogItem);
                return;
            }
            if (item.isCustom) {
                result.push({
                    tag: item.tag,
                    labelZh: item.labelZh || "",
                    isCustom: true,
                });
            }
        });

    return result;
}

export function removeSelectorTagGroup(tagFavorites, groupId) {
    ensureSelectorTagFavorites(tagFavorites);
    tagFavorites.tagGroups = tagFavorites.tagGroups.filter(group => group.id !== groupId || group.id === "default");
    tagFavorites.tagItems.forEach(item => {
        item.groupIds = (item.groupIds || []).filter(id => id !== groupId);
    });
}

export function createSelectorTagGroup(tagFavorites, name) {
    const favorites = ensureSelectorTagFavorites(tagFavorites);
    const clean = String(name || "").trim();
    if (!clean) return null;
    const group = { id: `tag_group_${Date.now()}`, name: clean, isSystem: false };
    favorites.tagGroups.push(group);
    return group;
}

export function renameSelectorTagGroup(tagFavorites, groupId, name) {
    const favorites = ensureSelectorTagFavorites(tagFavorites);
    if (!groupId || groupId === "default") return null;
    const group = favorites.tagGroups.find(item => item.id === groupId);
    const clean = String(name || "").trim();
    if (!group || !clean) return null;
    group.name = clean;
    return group;
}

export function createTagGroupSidebarSection(options = {}) {
    const t = options.t || (value => value);
    const favorites = ensureSelectorTagFavorites(options.tagFavorites || {});
    const activeGroupId = options.activeGroupId || "all";
    const container = document.createElement("div");
    container.className = "anima-selector-tag-group-sidebar-section";

    const header = document.createElement("div");
    header.style.cssText = "font-size:11px;font-weight:700;color:#6b7280;padding:16px 10px 8px;text-transform:uppercase;letter-spacing:0.05em;display:flex;align-items:center;justify-content:space-between;";
    const title = document.createElement("span");
    title.textContent = t("Tag Groups");
    const add = document.createElement("span");
    add.dataset.tagGroupAction = "create";
    add.textContent = "+";
    add.title = t("Create Tag Group");
    add.style.cssText = "cursor:pointer;font-size:16px;font-weight:bold;color:#0b8ce9;opacity:0.8;border-radius:4px;background:rgba(11,140,233,0.1);display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;line-height:1;padding:0;box-sizing:border-box;transition:all 0.2s ease;";
    add.onmouseenter = () => {
        add.style.opacity = "1";
        add.style.background = "rgba(11,140,233,0.2)";
        add.style.transform = "scale(1.1)";
    };
    add.onmouseleave = () => {
        add.style.opacity = "0.8";
        add.style.background = "rgba(11,140,233,0.1)";
        add.style.transform = "scale(1)";
    };
    add.onclick = async event => {
        event.stopPropagation();
        const name = window.prompt?.(t("Enter tag group name..."));
        const group = createSelectorTagGroup(favorites, name);
        if (!group) return;
        await options.onSave?.();
        options.onFilterChange?.({ type: "group", groupId: group.id });
    };
    header.appendChild(title);
    header.appendChild(add);
    container.appendChild(header);

    favorites.tagGroups.forEach(group => {
        const item = document.createElement("div");
        item.className = `sidebar-item ${activeGroupId === group.id ? "active" : ""}`;
        item.dataset.tagGroupId = group.id;
        item.style.cssText = "position:relative;";
        const isDefault = group.id === "default";
        item.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;min-width:0;max-width:65%;overflow:hidden;">
                <span style="font-size:14px;">${isDefault ? "★" : "📁"}</span>
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeSidebarHtml(formatSelectorTagGroupLabel(group, t))}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                ${!isDefault ? `
                    <div class="tag-group-actions" style="display:flex;gap:6px;align-items:center;overflow:hidden;max-width:0;opacity:0;transform:translateX(10px);transition:all 0.25s cubic-bezier(0.4,0,0.2,1);">
                        <span data-tag-group-action="rename" style="cursor:pointer;opacity:0.6;color:#e2e8f0;transition:opacity 0.2s;display:flex;align-items:center;" title="${escapeSidebarHtml(t("Rename"))}">✎</span>
                        <span data-tag-group-action="delete" style="cursor:pointer;opacity:0.6;color:#ef4444;transition:opacity 0.2s;display:flex;align-items:center;" title="${escapeSidebarHtml(t("Delete"))}">×</span>
                    </div>
                ` : ""}
            </div>
        `;
        item.onclick = () => options.onFilterChange?.({ type: "group", groupId: group.id });

        if (!isDefault) {
            const actions = item.querySelector(".tag-group-actions");
            const rename = item.querySelector("[data-tag-group-action='rename']");
            const remove = item.querySelector("[data-tag-group-action='delete']");
            item.onmouseenter = () => {
                actions.style.maxWidth = "48px";
                actions.style.opacity = "1";
                actions.style.transform = "translateX(0)";
            };
            item.onmouseleave = () => {
                actions.style.maxWidth = "0";
                actions.style.opacity = "0";
                actions.style.transform = "translateX(10px)";
            };
            rename.onclick = async event => {
                event.stopPropagation();
                const name = window.prompt?.(t("Enter new tag group name..."), group.name);
                if (!renameSelectorTagGroup(favorites, group.id, name)) return;
                await options.onSave?.();
                options.onFilterChange?.({ type: "group", groupId: group.id });
            };
            remove.onclick = async event => {
                event.stopPropagation();
                if (!window.confirm?.(t("Are you sure you want to delete this tag group? Tags inside won't be deleted."))) return;
                removeSelectorTagGroup(favorites, group.id);
                await options.onSave?.();
                options.onFilterChange?.({ type: "group", groupId: "all" });
            };
        }

        container.appendChild(item);
    });

    return container;
}

export function filterSelectorTagCatalog(catalog, tagFavorites, filters = {}) {
    const query = normalizeSelectorTagKey(filters.query);
    const filterType = filters.filterType || (filters.categoryId ? "category" : "group");
    const groupId = filters.groupId || "all";
    const categoryId = filters.categoryId || "all";
    const favoriteKeys = new Set((tagFavorites?.tagItems || [])
        .filter(item => groupId === "all" || item.groupIds?.includes(groupId))
        .map(item => tagFavoriteKey(item.tag)));

    const sourceItems = filterType === "group" && groupId !== "all" && !query
        ? getSelectorTagFavoriteGroupItems(catalog, tagFavorites, groupId)
        : (catalog || []);

    return sourceItems.filter(item => {
        const key = tagFavoriteKey(item.tag);
        if (!query) {
            if (filterType === "category") {
                return categoryId === "all" || item.categories?.some(category => category.id === categoryId);
            }
            return groupId === "all" || favoriteKeys.has(key);
        }
        const haystack = [
            item.tag,
            item.label,
            item.labelZh,
            item.meaning?.en,
            item.meaning?.zh,
            ...(Array.isArray(item.aliases) ? item.aliases : []),
            ...(Array.isArray(item.sources) ? item.sources : []),
            ...(Array.isArray(item.categories) ? item.categories.flatMap(category => [category.label, category.labelZh]) : []),
        ].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
        if (filterType === "category") {
            return categoryId === "all" || item.categories?.some(category => category.id === categoryId);
        }
        return true;
    });
}

export function createSelectorTagView(options) {
    const state = {
        filterType: "group",
        groupId: "all",
        categoryId: "all",
        query: "",
        page: 1,
    };
    const t = options.t || (value => value);
    const element = document.createElement("div");
    element.className = "anima-selector-tag-view";
    element.style.cssText = `
        display: none;
        flex: 1;
        min-height: 0;
        grid-column: 1 / -1;
        flex-direction: column;
        gap: 12px;
        overflow: hidden;
    `;

    const toolbar = document.createElement("div");
    toolbar.className = "anima-selector-tag-toolbar";
    toolbar.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        padding: 10px;
        background: rgba(15, 23, 42, 0.52);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        box-sizing: border-box;
    `;

    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = t("Search tags...");
    searchInput.style.cssText = `${controlStyle()} flex: 1; min-width: 180px;`;

    const createTagBtn = document.createElement("button");
    createTagBtn.type = "button";
    createTagBtn.textContent = t("+ Tag");
    createTagBtn.title = t("Create Favorite Tag");
    createTagBtn.style.cssText = buttonStyle();

    toolbar.appendChild(searchInput);
    toolbar.appendChild(createTagBtn);

    const list = document.createElement("div");
    list.className = "anima-selector-tag-list";
    list.style.cssText = `
        flex: 1;
        min-height: 0;
        overflow: auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        grid-auto-rows: 64px;
        row-gap: 10px;
        column-gap: 10px;
        padding: 2px 2px 10px;
        box-sizing: border-box;
    `;

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;color:#a1a1aa;font-size:12px;";
    const stats = document.createElement("span");
    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = t("Prev");
    prev.style.cssText = buttonStyle();
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = t("Next");
    next.style.cssText = buttonStyle();
    const pager = document.createElement("span");
    pager.appendChild(prev);
    pager.appendChild(next);
    footer.appendChild(stats);
    footer.appendChild(pager);

    element.appendChild(toolbar);
    element.appendChild(list);
    element.appendChild(footer);

    const save = async () => {
        if (options.saveTagFavorites) await options.saveTagFavorites();
    };

    function tagFavorites() {
        return ensureSelectorTagFavorites(options.tagFavorites || {});
    }

    function catalog() {
        return options.catalogProvider?.() || [];
    }

    function currentGroup() {
        const favorites = tagFavorites();
        if (state.groupId !== "all" && !favorites.tagGroups.some(group => group.id === state.groupId)) {
            state.groupId = "all";
        }
        return favorites.tagGroups.find(group => group.id === state.groupId);
    }

    function targetGroupId() {
        return state.filterType === "group" && state.groupId !== "all" ? state.groupId : "default";
    }

    function createTagDefaultText() {
        const value = options.getCreateTagDefaultText?.();
        return splitSelectorTagText(value)[0] || String(value || "").trim();
    }

    function renderControls() {
        currentGroup();
    }

    function render() {
        renderControls();
        list.innerHTML = "";
        searchInput.value = state.query;
        const filtered = filterSelectorTagCatalog(catalog(), tagFavorites(), {
            filterType: state.filterType,
            groupId: state.groupId,
            categoryId: state.categoryId,
            query: state.query,
        });
        const totalPages = Math.max(1, Math.ceil(filtered.length / TAG_VIEW_PAGE_SIZE));
        state.page = Math.max(1, Math.min(state.page, totalPages));
        const start = (state.page - 1) * TAG_VIEW_PAGE_SIZE;
        const pageItems = filtered.slice(start, start + TAG_VIEW_PAGE_SIZE);

        if (!pageItems.length) {
            const empty = document.createElement("div");
            empty.style.cssText = "grid-column:1/-1;padding:48px 16px;text-align:center;color:#a1a1aa;font-weight:700;";
            empty.textContent = t("No matching tags found");
            list.appendChild(empty);
        } else {
            const favorites = tagFavorites();
            pageItems.forEach(item => list.appendChild(createTagRow(item, favorites)));
        }

        const end = filtered.length === 0 ? 0 : Math.min(start + pageItems.length, filtered.length);
        stats.textContent = t("Total {total} tags | Showing {start}-{end}", {
            total: filtered.length,
            start: filtered.length === 0 ? 0 : start + 1,
            end,
        });
        prev.disabled = state.page <= 1;
        next.disabled = state.page >= totalPages;
    }

    function createTagRow(item, favorites) {
        const row = document.createElement("button");
        row.type = "button";
        row.dataset.selectorTag = item.tag;
        row.className = "anima-selector-tag-row";
        row.style.cssText = `
            min-width: 0;
            text-align: left;
            border: 1px solid rgba(255,255,255,0.08);
            background: rgba(24, 24, 34, 0.72);
            color: #f8fafc;
            border-radius: 10px;
            padding: 10px 12px;
            height: 64px;
            min-height: 64px;
            max-height: 64px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            justify-content: space-between;
            box-sizing: border-box;
        `;
        const text = document.createElement("span");
        text.style.cssText = "min-width:0;display:flex;flex-direction:column;gap:3px;";
        const main = document.createElement("span");
        main.className = "anima-selector-tag-main";
        main.textContent = item.tag;
        main.title = main.textContent;
        main.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:800;";
        const sub = document.createElement("span");
        sub.textContent = formatSelectorTagMeaning(item);
        sub.style.cssText = "color:#94a3b8;font-size:11px;";
        text.appendChild(main);
        if (sub.textContent) text.appendChild(sub);

        const favoriteInfo = getSelectorTagFavorite(favorites, item.tag);
        const favorite = document.createElement("span");
        favorite.textContent = favoriteInfo?.groupIds?.includes(targetGroupId()) ? "★" : "☆";
        favorite.title = t("Add to Tag Group");
        favorite.style.cssText = "font-size:16px;color:#facc15;flex:0 0 auto;";
        favorite.onclick = async event => {
            event.stopPropagation();
            toggleSelectorTagFavorite(favorites, item, targetGroupId());
            await save();
            render();
        };

        row.appendChild(text);
        row.appendChild(favorite);
        row.onclick = () => options.applyTag?.(item.tag);
        return row;
    }

    searchInput.oninput = () => {
        state.query = searchInput.value;
        state.page = 1;
        render();
    };
    createTagBtn.onclick = async () => {
        const tagText = window.prompt?.(t("Enter favorite tag..."), createTagDefaultText());
        if (!tagText || !tagText.trim()) return;
        const target = targetGroupId();
        const created = createSelectorTagFavoriteFromText(tagFavorites(), catalog(), tagText, target);
        if (!created) return;
        state.filterType = "group";
        state.groupId = target;
        state.categoryId = "all";
        await save();
        render();
        options.onTagFilterChange?.({ type: "group", groupId: target });
    };
    prev.onclick = () => {
        state.page -= 1;
        render();
    };
    next.onclick = () => {
        state.page += 1;
        render();
    };

    return {
        element,
        render,
        setQuery(query) {
            state.query = String(query || "");
            state.page = 1;
            render();
        },
        setFilter(filter = {}) {
            state.filterType = filter.type === "category" ? "category" : "group";
            state.groupId = state.filterType === "group" ? (filter.groupId || "all") : "all";
            state.categoryId = state.filterType === "category" ? (filter.categoryId || "all") : "all";
            state.page = 1;
            render();
        },
        getFilter() {
            return {
                type: state.filterType,
                groupId: state.groupId,
                categoryId: state.categoryId,
            };
        },
        setVisible(visible) {
            element.style.display = visible ? "flex" : "none";
            if (visible) render();
        },
    };
}

function formatSelectorTagMeaning(item) {
    const meaningEn = String(item?.meaning?.en || "").trim();
    const meaningZh = String(item?.meaning?.zh || "").trim();
    if (meaningEn && meaningZh && meaningZh !== item.labelZh) return `${meaningEn} / ${meaningZh}`;
    if (meaningZh) return meaningZh;
    if (meaningEn && meaningEn !== item.tag) return meaningEn;
    return item.labelZh || "";
}

function formatSelectorCategoryLabel(category) {
    const label = String(category?.label || category?.id || "").trim();
    const labelZh = String(category?.labelZh || "").trim();
    if (label && labelZh && label !== labelZh) return `${labelZh} / ${label}`;
    return labelZh || label;
}

function formatSelectorTagGroupLabel(group, t) {
    const label = String(group?.name || "").trim();
    if (group?.id === "default") return t("Favorite Tags");
    return label;
}

function escapeSidebarHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function controlStyle() {
    return `
        background: rgba(15,23,42,0.85);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        color: #e5e7eb;
        min-height: 34px;
        padding: 0 10px;
        box-sizing: border-box;
        outline: none;
    `;
}

function buttonStyle(color = "#e5e7eb") {
    return `
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(255,255,255,0.06);
        color: ${color};
        border-radius: 8px;
        min-height: 34px;
        padding: 0 10px;
        cursor: pointer;
        font-weight: 800;
    `;
}
