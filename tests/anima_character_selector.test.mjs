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
