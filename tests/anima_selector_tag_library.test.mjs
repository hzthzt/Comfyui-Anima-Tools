import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

function installDom() {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.Event = dom.window.Event;
  return dom;
}

test("splitSelectorTagText trims, dedupes, and removes raw prefixes", async () => {
  const { splitSelectorTagText } = await import("../js/anima_selector_tag_library.js?case=split");

  assert.deepEqual(splitSelectorTagText(" alpha, _raw_:Beta, alpha,\n gamma "), [
    "alpha",
    "Beta",
    "gamma",
  ]);
});

test("buildSelectorTagCatalog keeps zh labels and source counts", async () => {
  const { buildSelectorTagCatalog } = await import("../js/anima_selector_tag_library.js?case=catalog");

  const catalog = buildSelectorTagCatalog([
    {
      id: "a",
      name: "Scene A",
      tags: "beach, sky, beach",
      tags_zh: "海滩, 天空, 海滩",
    },
    {
      id: "b",
      name: "Scene B",
      tags: "sky, moon",
      tags_zh: "天空, 月亮",
    },
  ]);

  assert.deepEqual(catalog.map(item => [item.tag, item.labelZh, item.sourceCount]), [
    ["sky", "天空", 2],
    ["beach", "海滩", 1],
    ["moon", "月亮", 1],
  ]);
  assert.deepEqual(catalog.find(item => item.tag === "sky").categories, [
    { id: "auto:uncategorized", label: "Uncategorized" },
  ]);
});

test("buildSelectorTagCatalog preserves source categories for tag sidebar filters", async () => {
  const {
    buildSelectorTagCatalog,
    buildSelectorTagSidebarEntries,
    createDefaultTagFavorites,
    filterSelectorTagCatalog,
  } = await import("../js/anima_selector_tag_library.js?case=catalog-categories");

  const catalog = buildSelectorTagCatalog([
    { tags: "sky, beach", categories: ["Nature & Outdoors"] },
    { tags: "sky, train", categories: ["Urban & Daily"] },
  ]);
  const tagFavorites = createDefaultTagFavorites("Saved Tags");

  const entries = buildSelectorTagSidebarEntries(catalog, tagFavorites);

  assert.deepEqual(
    entries.map(entry => [entry.type, entry.id, entry.label, entry.count]),
    [
      ["all", "all", "All Tags", 3],
      ["group", "group:default", "Saved Tags", 0],
      ["category", "category:auto:nature-outdoors", "Nature & Outdoors", 2],
      ["category", "category:auto:urban-daily", "Urban & Daily", 2],
    ],
  );
  assert.deepEqual(filterSelectorTagCatalog(catalog, tagFavorites, {
    filterType: "category",
    categoryId: "auto:nature-outdoors",
  }).map(item => item.tag), ["sky", "beach"]);
});

test("filterSelectorTagCatalog filters independent tag groups without touching card groups", async () => {
  const {
    buildSelectorTagCatalog,
    createDefaultTagFavorites,
    filterSelectorTagCatalog,
    toggleSelectorTagFavorite,
  } = await import("../js/anima_selector_tag_library.js?case=groups");

  const catalog = buildSelectorTagCatalog([
    { tags: "beach, sky", tags_zh: "海滩, 天空" },
    { tags: "moon", tags_zh: "月亮" },
  ]);
  const tagFavorites = createDefaultTagFavorites("默认 Tag");
  const cardGroups = [{ id: "group_cards", name: "Card Group" }];

  toggleSelectorTagFavorite(tagFavorites, catalog[0], "group_tags");
  const filtered = filterSelectorTagCatalog(catalog, tagFavorites, {
    groupId: "group_tags",
    query: "",
  });

  assert.deepEqual(filtered.map(item => item.tag), ["beach"]);
  assert.deepEqual(cardGroups, [{ id: "group_cards", name: "Card Group" }]);
});

test("filterSelectorTagCatalog lets grouped searches find unassigned tags for classification", async () => {
  const {
    buildSelectorTagCatalog,
    createDefaultTagFavorites,
    filterSelectorTagCatalog,
    toggleSelectorTagFavorite,
  } = await import("../js/anima_selector_tag_library.js?case=group-search");

  const catalog = buildSelectorTagCatalog([
    { tags: "beach, sky", tags_zh: "海滩, 天空" },
    { tags: "moon", tags_zh: "月亮" },
  ]);
  const tagFavorites = createDefaultTagFavorites("默认 Tag");
  toggleSelectorTagFavorite(tagFavorites, catalog[0], "group_tags");

  assert.deepEqual(filterSelectorTagCatalog(catalog, tagFavorites, {
    groupId: "group_tags",
    query: "moon",
  }).map(item => item.tag), ["moon"]);
});

test("removeSelectorTagGroup preserves tag items while removing only the deleted group id", async () => {
  const { removeSelectorTagGroup } = await import("../js/anima_selector_tag_library.js?case=remove-group");
  const tagFavorites = {
    tagGroups: [
      { id: "default", name: "Default Tags", isSystem: true },
      { id: "group_tags", name: "Tag Group", isSystem: false },
    ],
    tagItems: [
      { tag: "moon", labelZh: "月亮", groupIds: ["group_tags"], sourceCount: 1 },
      { tag: "sky", labelZh: "天空", groupIds: ["default", "group_tags"], sourceCount: 2 },
    ],
  };

  removeSelectorTagGroup(tagFavorites, "group_tags");

  assert.deepEqual(tagFavorites.tagGroups, [
    { id: "default", name: "Default Tags", isSystem: true },
  ]);
  assert.deepEqual(tagFavorites.tagItems, [
    { tag: "moon", labelZh: "月亮", groupIds: [], sourceCount: 1 },
    { tag: "sky", labelZh: "天空", groupIds: ["default"], sourceCount: 2 },
  ]);
});

test("createSelectorTagView applies one tag immediately when a tag row is clicked", async () => {
  installDom();
  const { createSelectorTagView } = await import("../js/anima_selector_tag_library.js?case=view");
  const applied = [];
  const view = createSelectorTagView({
    section: "background",
    tagFavorites: createDefaultFavoritesForTest(),
    catalogProvider: () => [{ tag: "beach", labelZh: "海滩", sourceCount: 2 }],
    applyTag: tag => applied.push(tag),
    t: value => value,
  });

  document.body.appendChild(view.element);
  view.render();
  const row = view.element.querySelector("[data-selector-tag='beach']");
  assert.ok(row);

  row.click();

  assert.deepEqual(applied, ["beach"]);
});

test("createSelectorTagView can sync an external selector search query", async () => {
  installDom();
  const { createSelectorTagView } = await import("../js/anima_selector_tag_library.js?case=external-query");
  const view = createSelectorTagView({
    section: "background",
    tagFavorites: createDefaultFavoritesForTest(),
    catalogProvider: () => [
      { tag: "beach", labelZh: "海滩", sourceCount: 2 },
      { tag: "moon", labelZh: "月亮", sourceCount: 1 },
    ],
    applyTag: () => {},
    t: value => value,
  });

  document.body.appendChild(view.element);
  view.render();
  view.setQuery("moon");

  assert.equal(view.element.querySelector("[data-selector-tag='beach']"), null);
  assert.ok(view.element.querySelector("[data-selector-tag='moon']"));
});

test("createSelectorTagView can be filtered from the selector sidebar", async () => {
  installDom();
  const { createSelectorTagView } = await import("../js/anima_selector_tag_library.js?case=external-filter");
  const view = createSelectorTagView({
    section: "background",
    tagFavorites: createDefaultFavoritesForTest(),
    catalogProvider: () => [
      { tag: "beach", labelZh: "海滩", sourceCount: 1, categories: [{ id: "auto:nature", label: "Nature" }] },
      { tag: "train", labelZh: "火车", sourceCount: 1, categories: [{ id: "auto:urban", label: "Urban" }] },
    ],
    applyTag: () => {},
    t: value => value,
  });

  document.body.appendChild(view.element);
  view.setFilter({ type: "category", categoryId: "auto:urban" });

  assert.equal(view.element.querySelector("[data-selector-tag='beach']"), null);
  assert.ok(view.element.querySelector("[data-selector-tag='train']"));
});

function createDefaultFavoritesForTest() {
  return {
    tagGroups: [{ id: "default", name: "Default Tags", isSystem: true }],
    tagItems: [],
  };
}
