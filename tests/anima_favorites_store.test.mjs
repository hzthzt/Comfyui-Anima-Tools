import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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

test("a throwing subscriber cannot roll back a successful save or block later subscribers", async () => {
  const { getFavoritesStore } = await loadStore("subscriber-fault-isolation");
  const saved = envelope("artist", 2, { items: [{ id: "saved" }] });
  const fetchImpl = async (_url, options = {}) => {
    if (options.method === "POST") return response(200, saved);
    return response(200, envelope("artist", 1));
  };
  const store = getFavoritesStore("artist", { fetchImpl });
  const received = [];

  await store.load();
  store.subscribe(() => {
    throw new Error("subscriber failed");
  });
  store.subscribe(snapshot => received.push(snapshot));

  const result = await store.mutate(draft => {
    draft.items.push({ id: "saved" });
  });

  assert.deepEqual(result, saved);
  assert.deepEqual(store.getSnapshot(), saved);
  assert.deepEqual(received, [saved]);
});

test("a stale load cannot overwrite a later successful mutation", async () => {
  const { getFavoritesStore } = await loadStore("stale-load-after-save");
  const staleLoad = deferred();
  const saved = envelope("artist", 2, { items: [{ id: "saved" }] });
  const fetchImpl = async (_url, options = {}) => {
    if (options.method === "POST") return response(200, saved);
    return staleLoad.promise;
  };
  const store = getFavoritesStore("artist", { fetchImpl });

  const pendingLoad = store.load();
  await store.mutate(draft => {
    draft.items.push({ id: "saved" });
  });
  staleLoad.resolve(response(200, envelope("artist", 1, { items: [{ id: "stale" }] })));

  assert.deepEqual(await pendingLoad, saved);
  assert.deepEqual(store.getSnapshot(), saved);
});

test("a failed mutation cannot restore over a newer load", async () => {
  const { getFavoritesStore } = await loadStore("failed-mutation-after-load");
  const postStarted = deferred();
  const pendingPost = deferred();
  const newerLoad = deferred();
  let loadCount = 0;
  const fetchImpl = async (_url, options = {}) => {
    if (options.method === "POST") {
      postStarted.resolve();
      return pendingPost.promise;
    }
    loadCount += 1;
    if (loadCount === 1) return response(200, envelope("background", 1, { items: [{ id: "before" }] }));
    return newerLoad.promise;
  };
  const store = getFavoritesStore("background", { fetchImpl });

  await store.load();
  const pendingMutation = store.mutate(draft => {
    draft.items.push({ id: "failed" });
  });
  await postStarted.promise;
  const pendingLoad = store.load();
  const current = envelope("background", 2, { items: [{ id: "newer" }] });
  newerLoad.resolve(response(200, current));
  await pendingLoad;
  pendingPost.reject(new Error("network failed"));

  await assert.rejects(pendingMutation, /network failed/);
  assert.deepEqual(store.getSnapshot(), current);
});

test("queued favorite add operations merge independently captured user intent", async () => {
  const { applyFavoritesOperation, createFavoritesOperation, getFavoritesStore } = await loadStore("queued-modal-operations");
  const requests = [];
  let revision = 1;
  const fetchImpl = async (_url, options = {}) => {
    if (options.method !== "POST") return response(200, envelope("prompt", revision));
    const body = JSON.parse(options.body);
    requests.push(body);
    revision += 1;
    return response(200, envelope("prompt", revision, body.favorites));
  };
  const store = getFavoritesStore("prompt", { fetchImpl });

  await store.load();
  const base = store.getSnapshot().favorites;
  const addA = createFavoritesOperation(base, { ...base, items: [{ id: "a" }] });
  const addB = createFavoritesOperation(base, { ...base, items: [{ id: "b" }] });
  const first = store.mutate(draft => applyFavoritesOperation(draft, addA));
  const second = store.mutate(draft => applyFavoritesOperation(draft, addB));
  await Promise.all([first, second]);

  assert.deepEqual(requests.map(request => request.favorites.items), [
    [{ id: "a" }],
    [{ id: "a" }, { id: "b" }],
  ]);
  assert.deepEqual(store.getSnapshot().favorites.items, [{ id: "a" }, { id: "b" }]);
});

test("selectors queue favorite operation deltas and keep conflict dialogs open", async () => {
  const selectorFiles = [
    "anima_artist_selector.js",
    "anima_character_selector.js",
    "anima_clothing_selector.js",
    "anima_background_selector.js",
    "anima_pose_selector.js",
    "anima_prompt_tag_selector.js",
    "anima_lora_selector.js",
  ];

  for (const file of selectorFiles) {
    const source = await readFile(new URL(`../js/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /requestedFavorites/, `${file} should not replace favorites from a stale full snapshot`);
    assert.match(source, /createFavoritesOperation/, `${file} should create an action-time favorite delta`);
    assert.match(source, /applyFavoritesOperation\(draft, favoritesOperation\)/, `${file} should apply the captured delta to the queued draft`);
    assert.match(source, /if \(e instanceof FavoritesConflictError\) \{[\s\S]*?return false;/, `${file} should keep conflict dialogs open`);
  }
});

test("each subscriber receives an isolated snapshot payload", async () => {
  const { getFavoritesStore } = await loadStore("subscriber-payload-isolation");
  const saved = envelope("pose", 2, { items: [{ id: "saved" }] });
  const fetchImpl = async (_url, options = {}) => {
    if (options.method === "POST") return response(200, saved);
    return response(200, envelope("pose", 1));
  };
  const store = getFavoritesStore("pose", { fetchImpl });
  const received = [];

  await store.load();
  store.subscribe(snapshot => {
    snapshot.favorites.items.push({ id: "mutated-listener" });
  });
  store.subscribe(snapshot => received.push(snapshot));

  await store.mutate(draft => {
    draft.items.push({ id: "saved" });
  });

  assert.deepEqual(received, [saved]);
  assert.deepEqual(store.getSnapshot(), saved);
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
  const notifications = [];
  const unsubscribe = store.subscribe(snapshot => notifications.push(snapshot));

  await assert.rejects(
    store.mutate(draft => {
      draft.items.push({ id: "after" });
    }),
    /write failed/,
  );

  assert.deepEqual(store.getSnapshot(), before);
  assert.deepEqual(notifications, [before]);
  unsubscribe();
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
