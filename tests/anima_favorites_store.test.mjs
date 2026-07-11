import test from "node:test";
import assert from "node:assert/strict";

function envelope(section, revision, favorites = {}) {
  return {
    schemaVersion: 1,
    section,
    revision,
    favorites: {
      groups: [],
      items: [],
      tagGroups: [],
      tagItems: [],
      ...favorites,
    },
  };
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

async function loadStore(caseName) {
  return import(`../js/anima_favorites_store.js?case=${caseName}`);
}

test("getFavoritesStore returns one store for each section and isolates sections", async () => {
  const { getFavoritesStore } = await loadStore("singleton-isolation");
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.endsWith("/artist")) return response(200, envelope("artist", 3, { items: [{ id: "artist-1" }] }));
    return response(200, envelope("character", 7, { items: [{ id: "character-1" }] }));
  };

  const artist = getFavoritesStore("artist", { fetchImpl });
  const artistAgain = getFavoritesStore("artist", { fetchImpl });
  const character = getFavoritesStore("character", { fetchImpl });

  assert.equal(artistAgain, artist);
  assert.notEqual(character, artist);

  await Promise.all([artist.load(), character.load()]);

  assert.deepEqual(artist.getSnapshot().favorites.items, [{ id: "artist-1" }]);
  assert.deepEqual(character.getSnapshot().favorites.items, [{ id: "character-1" }]);
  assert.deepEqual(calls, ["/anima-tools/favorites/artist", "/anima-tools/favorites/character"]);
});

test("mutate saves only its section and consumes the returned revision", async () => {
  const { getFavoritesStore } = await loadStore("save-revision");
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === "POST") {
      assert.equal(url, "/anima-tools/favorites/pose");
      assert.deepEqual(JSON.parse(options.body), {
        revision: 4,
        favorites: {
          groups: [],
          items: [{ id: "pose-1" }],
          tagGroups: [],
          tagItems: [],
        },
      });
      return response(200, envelope("pose", 5, { items: [{ id: "pose-1" }] }));
    }
    return response(200, envelope("pose", 4));
  };
  const store = getFavoritesStore("pose", { fetchImpl });

  await store.load();
  await store.mutate(draft => {
    draft.items.push({ id: "pose-1" });
  });

  assert.equal(store.getSnapshot().revision, 5);
  assert.deepEqual(store.getSnapshot().favorites.items, [{ id: "pose-1" }]);
  assert.deepEqual(calls.map(call => call.url), [
    "/anima-tools/favorites/pose",
    "/anima-tools/favorites/pose",
  ]);
});

test("mutate preserves the pre-save snapshot after a normal save failure", async () => {
  const { getFavoritesStore } = await loadStore("restore-on-failure");
  const fetchImpl = async (_url, options = {}) => {
    if (options.method === "POST") return response(500, { error: "write failed" });
    return response(200, envelope("background", 2, { items: [{ id: "before" }] }));
  };
  const store = getFavoritesStore("background", { fetchImpl });

  await store.load();
  const before = store.getSnapshot();

  await assert.rejects(
    store.mutate(draft => {
      draft.items.push({ id: "after" });
    }),
    /write failed/,
  );

  assert.deepEqual(store.getSnapshot(), before);
});

test("a 409 replaces local state, notifies subscribers, and throws FavoritesConflictError", async () => {
  const { FavoritesConflictError, getFavoritesStore } = await loadStore("conflict");
  const current = envelope("lora", 9, { items: [{ id: "server-model" }] });
  const fetchImpl = async (_url, options = {}) => {
    if (options.method === "POST") {
      return response(409, { success: false, error: "revision_conflict", current });
    }
    return response(200, envelope("lora", 8, { items: [{ id: "local-model" }] }));
  };
  const store = getFavoritesStore("lora", { fetchImpl });
  const notifications = [];

  await store.load();
  const unsubscribe = store.subscribe(snapshot => notifications.push(snapshot));

  await assert.rejects(
    store.mutate(draft => {
      draft.items.push({ id: "new-model" });
    }),
    error => error instanceof FavoritesConflictError && error.current.revision === 9,
  );

  assert.deepEqual(store.getSnapshot(), current);
  assert.deepEqual(notifications, [current]);
  unsubscribe();
});

test("the store never sends a full aggregate favorites request", async () => {
  const { getFavoritesStore } = await loadStore("section-routes-only");
  const urls = [];
  const fetchImpl = async (url, options = {}) => {
    urls.push(url);
    if (options.method === "POST") return response(200, envelope("prompt", 2, { items: [{ id: "tag" }] }));
    return response(200, envelope("prompt", 1));
  };
  const store = getFavoritesStore("prompt", { fetchImpl });

  await store.load();
  await store.mutate(draft => {
    draft.items.push({ id: "tag" });
  });

  assert.ok(urls.every(url => /^\/anima-tools\/favorites\/[^/]+$/.test(url)));
  assert.ok(!urls.includes("/anima-tools/favorites"));
});
