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
      ["all", "all", "All Tags", undefined],
      ["group", "group:default", "Saved Tags", undefined],
      ["category", "category:auto:nature-outdoors", "Nature & Outdoors", undefined],
      ["category", "category:auto:urban-daily", "Urban & Daily", undefined],
    ],
  );
  assert.deepEqual(filterSelectorTagCatalog(catalog, tagFavorites, {
    filterType: "category",
    categoryId: "auto:nature-outdoors",
  }).map(item => item.tag), ["sky", "beach"]);
});

test("buildConfiguredSelectorTagCatalog uses only configured tags and bilingual metadata", async () => {
  const {
    buildConfiguredSelectorTagCatalog,
    buildSelectorTagSidebarEntries,
    createDefaultTagFavorites,
    filterSelectorTagCatalog,
  } = await import("../js/anima_selector_tag_library.js?case=configured-catalog");

  const configured = buildConfiguredSelectorTagCatalog({
    categories: [
      { id: "eyes", label: { en: "Eyes", zh: "眼睛" }, booruType: "general" },
    ],
    tags: [
      {
        tag: "blue eyes",
        label: { en: "blue eyes", zh: "蓝色眼睛" },
        meaning: { en: "iris color", zh: "虹膜颜色" },
        categoryIds: ["eyes"],
        booruType: "general",
        aliases: ["aqua eyes"],
      },
    ],
  });

  assert.deepEqual(configured.map(item => item.tag), ["blue eyes"]);
  assert.deepEqual(configured[0].categories, [
    { id: "eyes", label: "Eyes", labelZh: "眼睛", booruType: "general" },
  ]);
  assert.equal(configured[0].labelZh, "蓝色眼睛");
  assert.deepEqual(configured[0].meaning, { en: "iris color", zh: "虹膜颜色" });
  assert.deepEqual(configured[0].aliases, ["aqua eyes"]);

  const favorites = createDefaultTagFavorites("Saved Tags");
  assert.deepEqual(
    buildSelectorTagSidebarEntries(configured, favorites).map(entry => [entry.type, entry.id, entry.label, entry.count]),
    [
      ["all", "all", "All Tags", undefined],
      ["group", "group:default", "Saved Tags", undefined],
      ["category", "category:eyes", "Eyes", undefined],
    ],
  );

  assert.deepEqual(filterSelectorTagCatalog(configured, favorites, { query: "虹膜" }).map(item => item.tag), ["blue eyes"]);
  assert.deepEqual(filterSelectorTagCatalog(configured, favorites, { query: "aqua" }).map(item => item.tag), ["blue eyes"]);
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

test("createSelectorTagFavoriteFromText uses catalog metadata when tag exists", async () => {
  const {
    createDefaultTagFavorites,
    createSelectorTagFavoriteFromText,
  } = await import("../js/anima_selector_tag_library.js?case=create-catalog-favorite");
  const tagFavorites = createDefaultTagFavorites("默认 Tag");
  const catalog = [{ tag: "blue eyes", labelZh: "蓝色眼睛", meaning: { zh: "蓝色虹膜" } }];

  const item = createSelectorTagFavoriteFromText(tagFavorites, catalog, "Blue Eyes", "default");

  assert.equal(item.tag, "blue eyes");
  assert.equal(item.labelZh, "蓝色眼睛");
  assert.equal(item.isCustom, undefined);
  assert.deepEqual(item.groupIds, ["default"]);
  assert.equal(tagFavorites.tagItems.length, 1);
});

test("createSelectorTagFavoriteFromText creates custom favorite when tag is absent from catalog", async () => {
  const {
    createDefaultTagFavorites,
    createSelectorTagFavoriteFromText,
  } = await import("../js/anima_selector_tag_library.js?case=create-custom-favorite");
  const tagFavorites = createDefaultTagFavorites("默认 Tag");

  const item = createSelectorTagFavoriteFromText(tagFavorites, [], "sparkle aura", "tag_group_mood");

  assert.deepEqual(item, {
    tag: "sparkle aura",
    groupIds: ["tag_group_mood"],
    isCustom: true,
  });
});

test("group filtering includes custom favorites while all and categories stay catalog-only", async () => {
  const {
    createDefaultTagFavorites,
    createSelectorTagFavoriteFromText,
    filterSelectorTagCatalog,
  } = await import("../js/anima_selector_tag_library.js?case=custom-group-filter");
  const catalog = [
    { tag: "blue eyes", labelZh: "蓝色眼睛", categories: [{ id: "eyes", label: "Eyes" }] },
  ];
  const tagFavorites = createDefaultTagFavorites("默认 Tag");
  createSelectorTagFavoriteFromText(tagFavorites, catalog, "blue eyes", "default");
  createSelectorTagFavoriteFromText(tagFavorites, catalog, "sparkle aura", "default");

  assert.deepEqual(filterSelectorTagCatalog(catalog, tagFavorites, { groupId: "default" }).map(item => [item.tag, item.isCustom]), [
    ["blue eyes", undefined],
    ["sparkle aura", true],
  ]);
  assert.deepEqual(filterSelectorTagCatalog(catalog, tagFavorites, { groupId: "all" }).map(item => item.tag), ["blue eyes"]);
  assert.deepEqual(filterSelectorTagCatalog(catalog, tagFavorites, { filterType: "category", categoryId: "eyes" }).map(item => item.tag), ["blue eyes"]);
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

test("createSelectorTagView renders bilingual meaning without source usage counts", async () => {
  installDom();
  const { createSelectorTagView } = await import("../js/anima_selector_tag_library.js?case=view-no-counts");
  const view = createSelectorTagView({
    section: "character",
    tagFavorites: createDefaultFavoritesForTest(),
    catalogProvider: () => [{
      tag: "blue eyes",
      labelZh: "蓝色眼睛",
      meaning: { en: "blue eyes", zh: "蓝色眼睛" },
      sourceCount: 99,
    }],
    applyTag: () => {},
    t: (value, params = {}) => Object.entries(params).reduce((text, [key, val]) => text.replace(`{${key}}`, String(val)), value),
  });

  document.body.appendChild(view.element);
  view.render();

  assert.match(view.element.textContent, /blue eyes/);
  assert.match(view.element.textContent, /蓝色眼睛/);
  assert.doesNotMatch(view.element.textContent, /Used by/);
  assert.doesNotMatch(view.element.textContent, /99/);
});

test("createSelectorTagView keeps Chinese off the tag title and uses fixed tag row size", async () => {
  installDom();
  const { createSelectorTagView } = await import("../js/anima_selector_tag_library.js?case=view-title-size");
  const view = createSelectorTagView({
    section: "character",
    tagFavorites: createDefaultFavoritesForTest(),
    catalogProvider: () => [{
      tag: "blue eyes",
      labelZh: "蓝色眼睛",
      meaning: { en: "iris color", zh: "虹膜颜色" },
    }],
    applyTag: () => {},
    t: value => value,
  });

  document.body.appendChild(view.element);
  view.render();

  const row = view.element.querySelector("[data-selector-tag='blue eyes']");
  const title = row.querySelector(".anima-selector-tag-main");
  assert.equal(title.textContent, "blue eyes");
  assert.doesNotMatch(title.textContent, /蓝色眼睛/);
  assert.match(row.style.cssText, /height:\s*64px/i);
  assert.match(row.style.cssText, /min-height:\s*64px/i);
  assert.match(row.style.cssText, /max-height:\s*64px/i);
  const list = view.element.querySelector(".anima-selector-tag-list");
  assert.match(list.style.cssText, /grid-auto-rows:\s*64px/i);
  assert.match(list.style.cssText, /row-gap:\s*10px/i);
});

test("buildSelectorTagSidebarEntries exposes bilingual category labels for sidebar rendering", async () => {
  const {
    buildConfiguredSelectorTagCatalog,
    buildSelectorTagSidebarEntries,
    createDefaultTagFavorites,
  } = await import("../js/anima_selector_tag_library.js?case=sidebar-bilingual");

  const catalog = buildConfiguredSelectorTagCatalog({
    categories: [{ id: "eyes", label: { en: "Eyes", zh: "眼睛" }, booruType: "general" }],
    tags: [{ tag: "blue eyes", categoryIds: ["eyes"] }],
  });
  const entries = buildSelectorTagSidebarEntries(catalog, createDefaultTagFavorites("Saved Tags"));

  assert.deepEqual(
    entries.filter(entry => entry.type === "category").map(entry => [entry.label, entry.labelZh, entry.displayLabel]),
    [["Eyes", "眼睛", "眼睛 / Eyes"]],
  );
});

test("buildSelectorTagSidebarEntries displays the legacy default tag group as favorites", async () => {
  const { buildSelectorTagSidebarEntries } = await import("../js/anima_selector_tag_library.js?case=sidebar-favorites");
  const tagFavorites = {
    tagGroups: [
      { id: "default", name: "Default Tags", isSystem: true },
      { id: "tag_group_mood", name: "Mood Tags", isSystem: false },
    ],
    tagItems: [],
  };

  const entries = buildSelectorTagSidebarEntries([], tagFavorites, {
    t: value => ({ "Favorite Tags": "收藏" })[value] || value,
  });

  assert.deepEqual(
    entries.filter(entry => entry.type === "group").map(entry => [entry.groupId, entry.label, entry.displayLabel]),
    [
      ["default", "Default Tags", "收藏"],
      ["tag_group_mood", "Mood Tags", "Mood Tags"],
    ],
  );
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

test("createSelectorTagView can create and render a custom favorite tag in the active group", async () => {
  installDom();
  window.prompt = () => "sparkle aura";
  const { createSelectorTagView } = await import("../js/anima_selector_tag_library.js?case=view-create-custom");
  const tagFavorites = {
    tagGroups: [
      { id: "default", name: "Default Tags", isSystem: true },
      { id: "tag_group_mood", name: "Mood", isSystem: false },
    ],
    tagItems: [],
  };
  let saveCount = 0;
  const applied = [];
  const view = createSelectorTagView({
    section: "character",
    tagFavorites,
    catalogProvider: () => [{ tag: "blue eyes", labelZh: "蓝色眼睛" }],
    applyTag: tag => applied.push(tag),
    saveTagFavorites: async () => {
      saveCount += 1;
    },
    t: value => value,
  });

  document.body.appendChild(view.element);
  view.setFilter({ type: "group", groupId: "tag_group_mood" });
  const createButton = Array.from(view.element.querySelectorAll("button")).find(button => button.title === "Create Favorite Tag");
  assert.ok(createButton);
  createButton.click();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(saveCount, 1);
  assert.deepEqual(tagFavorites.tagItems, [{
    tag: "sparkle aura",
    groupIds: ["tag_group_mood"],
    isCustom: true,
  }]);

  const row = view.element.querySelector('[data-selector-tag="sparkle aura"]');
  assert.ok(row);
  row.click();
  assert.deepEqual(applied, ["sparkle aura"]);
});

test("createSelectorTagView defaults custom favorite text from the active tag manager tag", async () => {
  installDom();
  let promptDefault = "";
  window.prompt = (_message, defaultValue) => {
    promptDefault = defaultValue;
    return defaultValue;
  };
  const { createSelectorTagView } = await import("../js/anima_selector_tag_library.js?case=view-create-default");
  const tagFavorites = {
    tagGroups: [{ id: "default", name: "Default Tags", isSystem: true }],
    tagItems: [],
  };
  const view = createSelectorTagView({
    section: "character",
    tagFavorites,
    catalogProvider: () => [],
    getCreateTagDefaultText: () => "alpha, beta, ",
    saveTagFavorites: async () => {},
    t: value => value,
  });

  document.body.appendChild(view.element);
  const createButton = Array.from(view.element.querySelectorAll("button")).find(button => button.title === "Create Favorite Tag");
  assert.ok(createButton);
  createButton.click();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(promptDefault, "alpha");
  assert.deepEqual(tagFavorites.tagItems, [{
    tag: "alpha",
    groupIds: ["default"],
    isCustom: true,
  }]);
});

test("createTagGroupSidebarSection manages tag groups with card-style actions", async () => {
  installDom();
  const { createTagGroupSidebarSection } = await import("../js/anima_selector_tag_library.js?case=tag-sidebar-groups");
  const tagFavorites = {
    tagGroups: [
      { id: "default", name: "Default Tags", isSystem: true },
      { id: "tag_group_mood", name: "Mood", isSystem: false },
    ],
    tagItems: [{ tag: "sparkle aura", groupIds: ["tag_group_mood"], isCustom: true }],
  };
  const filters = [];
  let saveCount = 0;
  window.prompt = (_message, defaultValue) => defaultValue ? "Mood Renamed" : "New Group";
  window.confirm = () => true;

  const section = createTagGroupSidebarSection({
    tagFavorites,
    activeGroupId: "tag_group_mood",
    t: value => value,
    onSave: async () => {
      saveCount += 1;
    },
    onFilterChange: filter => filters.push(filter),
  });
  document.body.appendChild(section);

  const add = section.querySelector("[data-tag-group-action='create']");
  assert.ok(add);
  add.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(tagFavorites.tagGroups.at(-1).name, "New Group");
  assert.equal(filters.at(-1).groupId, tagFavorites.tagGroups.at(-1).id);

  const mood = section.querySelector("[data-tag-group-id='tag_group_mood']");
  assert.ok(mood);
  const rename = mood.querySelector("[data-tag-group-action='rename']");
  assert.ok(rename);
  rename.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(tagFavorites.tagGroups.find(group => group.id === "tag_group_mood").name, "Mood Renamed");

  const remove = mood.querySelector("[data-tag-group-action='delete']");
  assert.ok(remove);
  remove.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(tagFavorites.tagGroups.some(group => group.id === "tag_group_mood"), false);
  assert.deepEqual(tagFavorites.tagItems[0].groupIds, []);
  assert.equal(filters.at(-1).groupId, "all");
  assert.equal(saveCount, 3);
});

function createDefaultFavoritesForTest() {
  return {
    tagGroups: [{ id: "default", name: "Default Tags", isSystem: true }],
    tagItems: [],
  };
}
