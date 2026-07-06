import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

function installDom() {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });
  return dom;
}

test("prompt tag overlay header applies all tags without copying", async () => {
  const {
    PROMPT_TAG_HEADER_ACTION_LABEL,
    createPromptTagsHeaderAction,
  } = await import("../js/anima_selector_card_overlay.js?case=apply-all");

  const calls = [];
  const action = createPromptTagsHeaderAction({
    promptTags: ["standing", "smile"],
    displayName: "Standing Pose",
    applyTags: text => calls.push(["apply", text]),
    triggerSlot: () => calls.push(["trigger"]),
    showToast: text => calls.push(["toast", text]),
    t: (key, values = {}) => key.replace("{text}", values.text ?? ""),
  });

  assert.equal(PROMPT_TAG_HEADER_ACTION_LABEL, "Apply All");
  assert.equal(action.label, "Apply All");

  const didApply = action.run({
    stopPropagation: () => calls.push(["stop"]),
  });

  assert.equal(didApply, true);
  assert.deepEqual(calls, [
    ["stop"],
    ["apply", "standing, smile, "],
    ["trigger"],
    ["toast", "Applied: Standing Pose"],
  ]);
});

test("prompt tag overlay header stays idle when there are no tags", async () => {
  const { createPromptTagsHeaderAction } = await import("../js/anima_selector_card_overlay.js?case=empty");

  const calls = [];
  const action = createPromptTagsHeaderAction({
    promptTags: [],
    displayName: "Empty",
    applyTags: text => calls.push(["apply", text]),
    triggerSlot: () => calls.push(["trigger"]),
    showToast: text => calls.push(["toast", text]),
    t: value => value,
  });

  assert.equal(action.run(), false);
  assert.deepEqual(calls, []);
});

test("card selectors use the shared apply-all overlay action", async () => {
  const selectorFiles = [
    "js/anima_pose_selector.js",
    "js/anima_background_selector.js",
    "js/anima_clothing_selector.js",
  ];

  for (const file of selectorFiles) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /createPromptTagsHeaderAction/, `${file} should use the shared overlay action`);
    assert.doesNotMatch(source, /t\("Copy"\)/, `${file} should not label the card overlay action as Copy`);
    assert.doesNotMatch(source, /t\("Copied Successfully"\)/, `${file} should not copy from the card overlay action`);
  }
});

test("selector tag defaults use the favorites label while preserving legacy display", async () => {
  const {
    createDefaultTagFavorites,
    buildSelectorTagSidebarEntries,
  } = await import("../js/anima_selector_tag_library.js?case=tag-default-label");

  assert.equal(createDefaultTagFavorites().tagGroups[0].name, "Favorite Tags");

  const entries = buildSelectorTagSidebarEntries([], {
    tagGroups: [{ id: "default", name: "Default Tags", isSystem: true }],
    tagItems: [],
  }, { t: value => ({ "Favorite Tags": "收藏标签" })[value] || value });

  assert.deepEqual(
    entries.filter(entry => entry.type === "group").map(entry => [entry.label, entry.displayLabel]),
    [["Default Tags", "收藏标签"]],
  );
});

test("selector favorite labels are consistent in Chinese", async () => {
  const { translateForLanguage } = await import("../js/i18n.js?case=zh-labels");

  assert.equal(translateForLanguage("zh", "My Favorites"), "我的收藏");
  assert.equal(translateForLanguage("zh", "Favorite Tags"), "收藏标签");
  assert.equal(translateForLanguage("zh", "My Collections"), "收藏分组");
});

test("character selector defines the active view-toggle style it applies", async () => {
  installDom();
  const {
    CHARACTER_VIEW_TOGGLE_ACTIVE_CLASS,
    CHARACTER_VIEW_TOGGLE_ACTIVE_STYLE,
  } = await import("../js/anima_character_selector.js?case=view-toggle-style");

  assert.equal(CHARACTER_VIEW_TOGGLE_ACTIVE_CLASS, "anima-btn-active");
  assert.match(CHARACTER_VIEW_TOGGLE_ACTIVE_STYLE, /\.anima-btn-active\s*\{/);
  assert.match(CHARACTER_VIEW_TOGGLE_ACTIVE_STYLE, /border-color:/);
  assert.match(CHARACTER_VIEW_TOGGLE_ACTIVE_STYLE, /color:/);
});

test("selectors initialize tag favorites with the unified label key", async () => {
  const selectorFiles = [
    "js/anima_artist_selector.js",
    "js/anima_character_selector.js",
    "js/anima_pose_selector.js",
    "js/anima_background_selector.js",
    "js/anima_clothing_selector.js",
  ];

  for (const file of selectorFiles) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /t\("Default Tags"\)/, `${file} should not initialize new tag groups as Default Tags`);
    assert.match(source, /t\("Favorite Tags"\)/, `${file} should initialize new tag groups as Favorite Tags`);
  }
});
