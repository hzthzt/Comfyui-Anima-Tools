const FAVORITES_BASE_URL = "/anima-tools/favorites";
const stores = new Map();
const FAVORITE_COLLECTIONS = ["groups", "items", "tagGroups", "tagItems"];

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function favoriteCollectionItems(favorites, field) {
    return Array.isArray(favorites?.[field]) ? favorites[field] : [];
}

function favoriteItemKey(field, item, index) {
    const value = field === "tagItems" ? item?.tag : item?.id ?? item?.name;
    return value ? String(value) : `${field}:${index}:${JSON.stringify(item)}`;
}

export function createFavoritesOperation(baseFavorites, requestedFavorites) {
    const collections = {};
    FAVORITE_COLLECTIONS.forEach(field => {
        const baseItems = favoriteCollectionItems(baseFavorites, field);
        const requestedItems = favoriteCollectionItems(requestedFavorites, field);
        const baseByKey = new Map(baseItems.map((item, index) => [favoriteItemKey(field, item, index), item]));
        const requestedKeys = new Set();
        const upserts = [];

        requestedItems.forEach((item, index) => {
            const key = favoriteItemKey(field, item, index);
            requestedKeys.add(key);
            if (JSON.stringify(baseByKey.get(key)) !== JSON.stringify(item)) {
                upserts.push({ key, item: clone(item) });
            }
        });

        collections[field] = {
            upserts,
            deletes: baseItems
                .map((item, index) => favoriteItemKey(field, item, index))
                .filter(key => !requestedKeys.has(key)),
        };
    });
    return clone({ collections });
}

export function applyFavoritesOperation(draft, operation) {
    FAVORITE_COLLECTIONS.forEach(field => {
        const changes = operation?.collections?.[field];
        if (!changes) return;

        const deletedKeys = new Set(changes.deletes || []);
        const upsertsByKey = new Map((changes.upserts || []).map(change => [change.key, change.item]));
        const seenKeys = new Set();
        const nextItems = favoriteCollectionItems(draft, field)
            .filter((item, index) => !deletedKeys.has(favoriteItemKey(field, item, index)))
            .map((item, index) => {
                const key = favoriteItemKey(field, item, index);
                seenKeys.add(key);
                return upsertsByKey.has(key) ? clone(upsertsByKey.get(key)) : item;
            });

        (changes.upserts || []).forEach(({ key, item }) => {
            if (!seenKeys.has(key)) nextItems.push(clone(item));
        });
        draft[field] = nextItems;
    });
}

function createEmptySnapshot(section) {
    return {
        schemaVersion: 1,
        section,
        revision: 1,
        favorites: {
            groups: [],
            items: [],
            tagGroups: [],
            tagItems: [],
        },
    };
}

function normalizeSnapshot(section, snapshot) {
    const fallback = createEmptySnapshot(section);
    const favorites = snapshot?.favorites || {};
    return {
        ...fallback,
        ...snapshot,
        section,
        revision: Number.isInteger(snapshot?.revision) && snapshot.revision > 0
            ? snapshot.revision
            : fallback.revision,
        favorites: {
            ...fallback.favorites,
            ...favorites,
        },
    };
}

async function responseError(response) {
    const body = await response.text();
    return new Error(body || `Failed to save favorites (${response.status})`);
}

export class FavoritesConflictError extends Error {
    constructor(current) {
        super("Favorites revision conflict");
        this.name = "FavoritesConflictError";
        this.current = clone(current);
    }
}

class FavoritesStore {
    constructor(section, fetchImpl) {
        this.section = section;
        this.fetchImpl = fetchImpl;
        this.snapshot = createEmptySnapshot(section);
        this.snapshotGeneration = 0;
        this.subscribers = new Set();
        this.pendingMutation = Promise.resolve();
    }

    get url() {
        return `${FAVORITES_BASE_URL}/${encodeURIComponent(this.section)}`;
    }

    getSnapshot() {
        return clone(this.snapshot);
    }

    subscribe(listener) {
        this.subscribers.add(listener);
        return () => this.subscribers.delete(listener);
    }

    async load() {
        const loadGeneration = this.snapshotGeneration;
        const response = await this.fetchImpl(this.url);
        if (!response.ok) throw await responseError(response);
        const loadedSnapshot = normalizeSnapshot(this.section, await response.json());
        const hasNewerSnapshot = loadedSnapshot.revision < this.snapshot.revision
            || (loadedSnapshot.revision === this.snapshot.revision && this.snapshotGeneration !== loadGeneration);
        if (hasNewerSnapshot) return this.getSnapshot();

        this.snapshot = loadedSnapshot;
        this.snapshotGeneration += 1;
        this.notify();
        return this.getSnapshot();
    }

    mutate(mutator) {
        const mutation = this.pendingMutation.then(() => this.applyMutation(mutator));
        this.pendingMutation = mutation.catch(() => {});
        return mutation;
    }

    async applyMutation(mutator) {
        const before = this.getSnapshot();
        const beforeGeneration = this.snapshotGeneration;
        try {
            const draft = clone(before.favorites);
            await mutator(draft);

            const response = await this.fetchImpl(this.url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ revision: before.revision, favorites: draft }),
            });

            if (response.status === 409) {
                const conflict = await response.json();
                this.snapshot = normalizeSnapshot(this.section, conflict.current);
                this.snapshotGeneration += 1;
                this.notify();
                throw new FavoritesConflictError(this.snapshot);
            }
            if (!response.ok) throw await responseError(response);

            this.snapshot = normalizeSnapshot(this.section, await response.json());
            this.snapshotGeneration += 1;
            this.notify();
            return this.getSnapshot();
        } catch (error) {
            if (error instanceof FavoritesConflictError) throw error;
            if (this.snapshotGeneration === beforeGeneration) {
                this.snapshot = before;
                this.notify();
            }
            throw error;
        }
    }

    notify() {
        this.subscribers.forEach(listener => {
            try {
                listener(this.getSnapshot());
            } catch (_) {}
        });
    }
}

export function getFavoritesStore(section, { fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
    if (!fetchImpl) throw new Error("Favorites store requires fetch");
    if (!stores.has(section)) stores.set(section, new FavoritesStore(section, fetchImpl));
    return stores.get(section);
}
