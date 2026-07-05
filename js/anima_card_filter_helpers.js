export function getCardSidebarCollectionOrder(groups = []) {
    const ids = [];
    const seen = new Set();
    const add = id => {
        if (!id || seen.has(id)) return;
        seen.add(id);
        ids.push(id);
    };

    if (groups.some(group => group?.id === "default")) {
        add("default");
    }
    groups.forEach(group => {
        if (group?.id !== "default") add(group?.id);
    });
    add("all");
    return ids;
}

export function getOrderedCardCollectionGroups(groups = []) {
    const byId = new Map(groups.filter(Boolean).map(group => [group.id, group]));
    return getCardSidebarCollectionOrder(groups)
        .filter(id => id !== "all")
        .map(id => byId.get(id))
        .filter(Boolean);
}

export function getCardSidebarSectionOrder(groups = []) {
    return [
        "collections",
        ...getCardSidebarCollectionOrder(groups),
        "categories",
    ];
}

export function getNextCategorizedCardFilters(currentFilters = {}, category, options = {}) {
    const next = normalizeCategorizedCardFilters(currentFilters);

    if (options.collection) {
        next.collection = options.collection;
        next.categories = new Set();
        return next;
    }

    if (category) {
        next.collection = "all";
        next.categories = new Set([category]);
    }
    return next;
}

export function shouldApplyCardCategoryFilters(filters = {}) {
    return filters.collection === "all" && filters.categories instanceof Set && filters.categories.size > 0;
}

export function shouldShowCustomItemCreateCard(collectionId) {
    return Boolean(collectionId && collectionId !== "all");
}

export function normalizeCategorizedCardFilters(filters = {}) {
    const collection = filters.collection || "all";
    const categories = filters.categories instanceof Set
        ? new Set(filters.categories)
        : new Set(Array.isArray(filters.categories) ? filters.categories : []);

    return {
        ...filters,
        collection,
        categories: collection === "all" ? categories : new Set(),
    };
}
