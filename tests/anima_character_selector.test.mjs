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
});
