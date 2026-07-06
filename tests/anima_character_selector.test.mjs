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
  return dom;
}

test("getCharacterOverlayTags puts the character trigger first and dedupes tags", async () => {
  installDom();
  const { getCharacterOverlayTags } = await import("../js/anima_character_selector.js?case=overlay-tags");

  const tags = getCharacterOverlayTags({
    name: "hakurei reimu",
    copyright: "touhou",
    _officialData: {
      trigger: "reimu hakurei, touhou",
      tags: "reimu hakurei, touhou, brown hair",
      core_tags: "brown hair, red eyes",
    },
  });

  assert.deepEqual(tags, [
    "reimu hakurei",
    "touhou",
    "brown hair",
    "red eyes",
  ]);
});

test("classifyCharacterTag places common character tags into configured categories", async () => {
  installDom();
  const { classifyCharacterTag } = await import("../js/anima_selector_tag_catalog_config.js?case=character-classify");

  assert.equal(classifyCharacterTag("blue eyes"), "eyes");
  assert.equal(classifyCharacterTag("long hair"), "hair");
  assert.equal(classifyCharacterTag("hair bow"), "decoration");
  assert.equal(classifyCharacterTag("hatsune miku"), "character-name");
});

test("getNextCharacterCardFilters switches categories directly without toggling them off", async () => {
  installDom();
  const mod = await import("../js/anima_character_selector.js?case=card-filter-switch");

  assert.equal(typeof mod.getNextCharacterCardFilters, "function");
  assert.equal(typeof mod.shouldApplyCharacterCardTypeFilters, "function");

  assert.deepEqual(
    mod.getNextCharacterCardFilters({
      type: "group_favorites",
      gender: null,
      hair: null,
      eye: null,
      series: null,
    }, "group_favorites"),
    {
      type: "group_favorites",
      gender: null,
      hair: null,
      eye: null,
      series: null,
    },
  );

  assert.deepEqual(
    mod.getNextCharacterCardFilters({
      type: "all",
      gender: "1girl",
      hair: "blue",
      eye: "red",
      series: "touhou",
    }, "gender:1girl"),
    {
      type: "all",
      gender: "1girl",
      hair: null,
      eye: null,
      series: null,
    },
  );

  const collectionFilters = mod.getNextCharacterCardFilters({
    type: "all",
    gender: "1girl",
    hair: "blue",
    eye: "red",
    series: "touhou",
  }, "group_favorites");
  assert.deepEqual(collectionFilters, {
    type: "group_favorites",
    gender: null,
    hair: null,
    eye: null,
    series: null,
  });
  assert.equal(mod.shouldApplyCharacterCardTypeFilters(collectionFilters), false);

  const categoryFilters = mod.getNextCharacterCardFilters(collectionFilters, "hair:blue");
  assert.deepEqual(categoryFilters, {
    type: "all",
    gender: null,
    hair: "blue",
    eye: null,
    series: null,
  });
  assert.equal(mod.shouldApplyCharacterCardTypeFilters(categoryFilters), true);
});

test("createCharacterCustomItemModal prefills custom content textarea", async () => {
  installDom();
  const { createCharacterCustomItemModal } = await import("../js/anima_character_selector.js?case=custom-prefill");

  const dialog = createCharacterCustomItemModal({
    defaultContent: "alpha, beta, ",
    onSubmit: async () => true,
  });
  document.body.appendChild(dialog);

  const textarea = dialog.querySelector("textarea");
  assert.ok(textarea);
  assert.equal(textarea.value, "alpha, beta, ");
});

test("getCharacterOverlayTags uses custom prompt content as card tags", async () => {
  installDom();
  const { getCharacterOverlayTags } = await import("../js/anima_character_selector.js?case=custom-tags");

  const tags = getCharacterOverlayTags({
    name: "custom_123",
    nickname: "My Character Set",
    isCustom: true,
    customContent: "alpha, beta, alpha, gamma",
  });

  assert.deepEqual(tags, ["alpha", "beta", "gamma"]);
});
