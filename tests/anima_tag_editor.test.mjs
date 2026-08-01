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
  globalThis.Event = dom.window.Event;
  globalThis.requestAnimationFrame = callback => callback();
  return dom;
}

function createNodeAndWidget(value = "alpha, beta, ") {
  const widget = {
    name: "artist_tags",
    value,
    callback(value) {
      this.lastCallbackValue = value;
    },
  };
  const node = {
    __animaNodeClass: "AnimaArtistTagSelectorTagged",
    properties: {},
    widgets: [widget],
    setDirtyCanvasCalled: 0,
    setDirtyCanvas() {
      this.setDirtyCanvasCalled += 1;
    },
    graph: {
      setDirtyCanvas() {},
    },
  };
  return { node, widget };
}

function findButtonByTitle(element, titles) {
  const acceptedTitles = new Set(Array.isArray(titles) ? titles : [titles]);
  return Array.from(element.querySelectorAll("button")).find(button => acceptedTitles.has(button.title));
}

function clickLikeBrowser(element) {
  for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
    element.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true }));
  }
}

function dispatchDrag(element, type, dataTransfer, clientX = 0) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    clientX: { value: clientX },
  });
  element.dispatchEvent(event);
  return event;
}

test("tag strength helpers recognize repeated braces and brackets", async () => {
  const { formatTagStrength, parseTagStrength, splitTagText } = await import("../js/anima_tag_editor.js?case=strength-helpers");

  assert.deepEqual(parseTagStrength("{{ alpha }}"), { text: "alpha", strength: 2, rawPrefix: "" });
  assert.deepEqual(parseTagStrength("[[beta]]"), { text: "beta", strength: -2, rawPrefix: "" });
  assert.deepEqual(parseTagStrength("_raw_:{gamma}"), { text: "gamma", strength: 1, rawPrefix: "_raw_:" });
  assert.equal(formatTagStrength("{{alpha}}", 3), "{{{alpha}}}");
  assert.equal(formatTagStrength("[[beta]]", -1), "[beta]");
  assert.equal(formatTagStrength("_raw_:{gamma}", 0), "_raw_:gamma");
  assert.deepEqual(splitTagText("{{alpha, beta}}, [gamma], delta"), ["{{alpha, beta}}", "[gamma]", "delta"]);
});

test("createSelectorTagManager adjusts prompt strength repeatedly", async () => {
  installDom();
  const { createSelectorTagManager } = await import("../js/anima_tag_editor.js?case=strength-buttons");
  const { node, widget } = createNodeAndWidget("alpha, [beta], ");
  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  let alphaChip = Array.from(manager.element.querySelectorAll('span[draggable="true"]'))[0];
  alphaChip.querySelector('[data-tag-strength-action="increase"]').focus();
  alphaChip.querySelector('[data-tag-strength-action="increase"]').click();
  assert.equal(document.activeElement.dataset.tagStrengthAction, "increase");
  alphaChip = Array.from(manager.element.querySelectorAll('span[draggable="true"]'))[0];
  alphaChip.querySelector('[data-tag-strength-action="increase"]').click();
  assert.equal(widget.value, "{{alpha}}, [beta], ");
  assert.equal(manager.element.querySelector('[data-tag-strength="2"]').textContent, "+2");

  alphaChip = Array.from(manager.element.querySelectorAll('span[draggable="true"]'))[0];
  alphaChip.querySelector('[data-tag-strength-action="decrease"]').click();
  alphaChip = Array.from(manager.element.querySelectorAll('span[draggable="true"]'))[0];
  alphaChip.querySelector('[data-tag-strength-action="decrease"]').click();
  alphaChip = Array.from(manager.element.querySelectorAll('span[draggable="true"]'))[0];
  alphaChip.querySelector('[data-tag-strength-action="decrease"]').click();
  assert.equal(widget.value, "[alpha], [beta], ");
});

test("selector updates preserve existing prompt strength for the same tag", async () => {
  installDom();
  const { applySelectorTagsToWidget, createSelectorTagManager } = await import("../js/anima_tag_editor.js?case=strength-preserve");
  const { node, widget } = createNodeAndWidget("{{alpha}}, beta, ");

  createSelectorTagManager(node, widget, { label: "Selected Tags" });
  applySelectorTagsToWidget(node, widget, "alpha, gamma, ", { source: "selector" });

  assert.equal(widget.value, "{{alpha}}, gamma, ");
});

test("createSelectorTagManager reorders tags by dragging chips", async () => {
  installDom();
  const { createSelectorTagManager, getTagFieldState } = await import("../js/anima_tag_editor.js?case=drag-reorder");
  const { node, widget } = createNodeAndWidget("alpha, beta, gamma, ");
  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  const chips = Array.from(manager.element.querySelectorAll('span[draggable="true"]'));
  assert.equal(chips.length, 3);
  assert.equal(chips[0].title, "Drag to reorder tag");
  const dataTransfer = {
    effectAllowed: "",
    dropEffect: "",
    setData() {},
  };

  dispatchDrag(chips[0], "dragstart", dataTransfer);
  const dragOver = dispatchDrag(chips[1], "dragover", dataTransfer, 1);
  assert.equal(dragOver.defaultPrevented, true);
  const indicator = manager.element.querySelector(".anima-tag-drop-indicator");
  assert.ok(indicator);
  assert.equal(indicator.style.display, "block");
  assert.equal(chips[1].style.boxShadow, "");
  dispatchDrag(chips[1], "drop", dataTransfer, 1);

  assert.equal(widget.value, "beta, alpha, gamma, ");
  assert.deepEqual(getTagFieldState(node, "artist_tags", widget).tags.map(tag => tag.text), [
    "beta",
    "alpha",
    "gamma",
  ]);
});

test("createSelectorTagManager supports double-click enable disable without buttons", async () => {
  installDom();
  const { createSelectorTagManager } = await import("../js/anima_tag_editor.js?case=disable");
  const { node, widget } = createNodeAndWidget();

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  assert.match(manager.element.textContent, /Selected Tags/);
  assert.match(manager.element.textContent, /alpha/);
  assert.match(manager.element.textContent, /beta/);

  const disableButton = findButtonByTitle(manager.element, ["Disable tag", "Disable Tag"]);
  const enableButton = findButtonByTitle(manager.element, ["Enable tag", "Enable Tag"]);
  assert.equal(disableButton, undefined);
  assert.equal(enableButton, undefined);
  assert.equal(widget.value, "alpha, beta, ");

  const alphaChip = Array.from(manager.element.querySelectorAll("span"))
    .find(element => element.textContent?.includes("alpha") && element.querySelector("button"));
  assert.ok(alphaChip);
  alphaChip.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));

  assert.equal(widget.value, "beta, ");

  const disabledAlphaChip = Array.from(manager.element.querySelectorAll("span"))
    .find(element => element.textContent?.includes("alpha") && element.querySelector("button"));
  assert.ok(disabledAlphaChip);
  disabledAlphaChip.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));

  assert.equal(widget.value, "alpha, beta, ");
});

test("createSelectorTagManager toggles tag favorites from chip stars", async () => {
  installDom();
  const { createSelectorTagManager } = await import("../js/anima_tag_editor.js?case=chip-favorites");
  const { createDefaultTagFavorites } = await import("../js/anima_selector_tag_library.js?case=chip-favorites");
  const { node, widget } = createNodeAndWidget("alpha, custom tag, ");
  const tagFavorites = createDefaultTagFavorites();
  let saves = 0;
  const manager = createSelectorTagManager(node, widget, {
    label: "Selected Tags",
    tagFavorites,
    catalogProvider: () => [{ tag: "alpha", labelZh: "阿尔法" }],
    saveTagFavorites: async () => { saves += 1; },
  });
  document.body.appendChild(manager.element);

  const stars = Array.from(manager.element.querySelectorAll('[data-tag-favorite-toggle="true"]'));
  assert.equal(stars.length, 2);
  assert.deepEqual(stars.map(button => button.textContent), ["☆", "☆"]);
  assert.equal(manager.element.querySelector(".anima-tag-chip-primary").textContent, "alpha");
  assert.equal(manager.element.querySelector(".anima-tag-chip-zh").textContent, "阿尔法");

  clickLikeBrowser(stars[0]);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(tagFavorites.tagItems[0], {
    tag: "alpha",
    labelZh: "阿尔法",
    groupIds: ["default"],
  });
  assert.equal(stars[0].textContent, "★");

  clickLikeBrowser(stars[1]);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(tagFavorites.tagItems[1].isCustom, true);
  assert.equal(stars[1].textContent, "★");

  clickLikeBrowser(stars[0]);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(tagFavorites.tagItems.some(item => item.tag === "alpha"), false);
  assert.equal(stars[0].textContent, "☆");
  assert.equal(saves, 3);
});

test("widget text input treats consecutive edits as one tag modification", async () => {
  installDom();
  const { createSelectorTagManager, getTagFieldState } = await import("../js/anima_tag_editor.js?case=text-edit");
  const { node, widget } = createNodeAndWidget("alpha, beta, ");
  widget.inputEl = document.createElement("textarea");
  widget.inputEl.value = widget.value;

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  for (const value of ["alpha, bet, ", "alpha, bett, ", "alpha, better, "]) {
    widget.value = value;
    widget.inputEl.value = value;
    widget.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  }

  assert.deepEqual(getTagFieldState(node, "artist_tags", widget).tags, [
    { text: "alpha", enabled: true, source: "legacy" },
    { text: "better", enabled: true, source: "text" },
  ]);
});

test("createSelectorTagManager keeps full width when empty", async () => {
  installDom();
  const { createSelectorTagManager } = await import("../js/anima_tag_editor.js?case=empty-width");
  const { node, widget } = createNodeAndWidget("");

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  assert.match(manager.element.textContent, /No tags yet/);
  assert.equal(manager.element.style.width, "100%");
  assert.equal(manager.element.style.flexGrow, "1");
  assert.equal(manager.element.style.boxSizing, "border-box");
});

test("createSelectorTagManagerFooter keeps selector manager row at dialog width", async () => {
  installDom();
  const { createSelectorTagManagerFooter } = await import("../js/anima_tag_editor.js?case=footer-width");

  const footerRow = createSelectorTagManagerFooter();

  assert.equal(footerRow.style.display, "flex");
  assert.equal(footerRow.style.width, "100%");
  assert.equal(footerRow.style.flexGrow, "1");
  assert.equal(footerRow.style.minWidth, "0");
  assert.equal(footerRow.style.boxSizing, "border-box");
  assert.equal(footerRow.style.alignItems, "stretch");
});

test("createSelectorTagManager moves deleted tags to history and restores them", async () => {
  installDom();
  const { createSelectorTagManager } = await import("../js/anima_tag_editor.js?case=history");
  const { node, widget } = createNodeAndWidget("alpha, ");

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  const deleteButton = findButtonByTitle(manager.element, ["Delete tag", "Delete Tag"]);
  assert.ok(deleteButton);
  deleteButton.click();

  assert.equal(widget.value, "");
  assert.match(manager.element.textContent, /History/);

  const restoreButton = findButtonByTitle(manager.element, ["Restore tag", "Restore Tag"]);
  assert.ok(restoreButton);
  restoreButton.click();

  assert.equal(widget.value, "alpha, ");
});

test("createSelectorTagManager clears selected tags when history is empty", async () => {
  installDom();
  const { createSelectorTagManager, getTagFieldState } = await import("../js/anima_tag_editor.js?case=clear-empty-history");
  const { node, widget } = createNodeAndWidget("alpha, beta, ");

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  const clearTagsButton = Array.from(manager.element.querySelectorAll("button")).find(button => button.textContent === "Clear Tags");
  assert.ok(clearTagsButton);
  clearTagsButton.click();

  assert.equal(widget.value, "");
  assert.deepEqual(getTagFieldState(node, "artist_tags", widget).tags, []);
  assert.match(manager.element.textContent, /No tags yet/);
});

test("ensureTagEditor clears selected tags when history is empty", async () => {
  installDom();
  const { ensureTagEditor, getTagFieldState } = await import("../js/anima_tag_editor.js?case=node-clear-empty-history");
  const { node, widget } = createNodeAndWidget("alpha, beta, ");
  let editorRoot = null;
  node.addDOMWidget = function (_name, _type, element, options = {}) {
    editorRoot = element;
    const domWidget = {
      element,
      inputEl: element,
      container: element,
      ...options,
    };
    this.widgets.push(domWidget);
    return domWidget;
  };

  ensureTagEditor(node, widget, { label: "Prompt Tags", favoriteSection: false });
  assert.ok(editorRoot);
  document.body.appendChild(editorRoot);

  const clearTagsButton = Array.from(editorRoot.querySelectorAll("button")).find(button => button.textContent === "Clear Tags");
  assert.ok(clearTagsButton);
  clearTagsButton.click();

  assert.equal(widget.value, "");
  assert.deepEqual(getTagFieldState(node, "artist_tags", widget).tags, []);
  assert.match(editorRoot.textContent, /No tags yet/);
});

test("ensureTagEditor shows persistent favorite stars on node tags", async () => {
  installDom();
  const { ensureTagEditor } = await import("../js/anima_tag_editor.js?case=node-favorites");
  const { node, widget } = createNodeAndWidget("alpha, beta, ");
  let editorRoot = null;
  let snapshot = {
    revision: 1,
    favorites: { groups: [], items: [], tagGroups: [], tagItems: [] },
  };
  const listeners = new Set();
  const favoritesStore = {
    getSnapshot: () => structuredClone(snapshot),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load() {
      listeners.forEach(listener => listener(structuredClone(snapshot)));
      return structuredClone(snapshot);
    },
    async mutate(mutator) {
      const draft = structuredClone(snapshot.favorites);
      await mutator(draft);
      snapshot = { revision: snapshot.revision + 1, favorites: draft };
      listeners.forEach(listener => listener(structuredClone(snapshot)));
      return structuredClone(snapshot);
    },
  };
  node.addDOMWidget = function (_name, _type, element, options = {}) {
    editorRoot = element;
    const domWidget = { element, inputEl: element, container: element, ...options };
    this.widgets.push(domWidget);
    return domWidget;
  };

  ensureTagEditor(node, widget, {
    label: "Artist Tags",
    favoritesStore,
    catalogProvider: () => [{ tag: "alpha", labelZh: "阿尔法" }],
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  document.body.appendChild(editorRoot);

  let stars = Array.from(editorRoot.querySelectorAll('[data-tag-favorite-toggle="true"]'));
  assert.deepEqual(stars.map(button => button.textContent), ["☆", "☆"]);
  assert.equal(editorRoot.querySelector(".anima-tag-chip-primary").textContent, "alpha");
  assert.equal(editorRoot.querySelector(".anima-tag-chip-zh").textContent, "阿尔法");

  clickLikeBrowser(stars[0]);
  await new Promise(resolve => setTimeout(resolve, 0));
  stars = Array.from(editorRoot.querySelectorAll('[data-tag-favorite-toggle="true"]'));
  assert.equal(stars[0].textContent, "★");
  assert.deepEqual(snapshot.favorites.tagItems, [{
    tag: "alpha",
    labelZh: "阿尔法",
    groupIds: ["default"],
  }]);
});

test("createSelectorTagManager appends manual input as a tag", async () => {
  installDom();
  const { createSelectorTagManager } = await import("../js/anima_tag_editor.js?case=manual");
  const { node, widget } = createNodeAndWidget("");

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  const input = manager.element.querySelector("input");
  assert.ok(input);
  input.value = "gamma";
  const addButton = Array.from(manager.element.querySelectorAll("button")).find(button => button.textContent === "Add");
  assert.ok(addButton);
  addButton.click();

  assert.equal(widget.value, "gamma, ");
  assert.match(manager.element.textContent, /gamma/);
});

test("createSelectorTagManager can switch selector apply mode", async () => {
  installDom();
  const { createSelectorTagManager, getTagFieldState, writeTagsToWidget } = await import("../js/anima_tag_editor.js?case=mode");
  const { node, widget } = createNodeAndWidget("alpha, ");

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  const appendButton = Array.from(manager.element.querySelectorAll("button")).find(button => button.textContent === "Append");
  assert.ok(appendButton);
  clickLikeBrowser(appendButton);

  assert.equal(getTagFieldState(node, "artist_tags", widget).applyMode, "append");

  writeTagsToWidget(node, widget, "beta, ", { source: "selector" });

  assert.equal(widget.value, "alpha, beta, ");
});

test("createSelectorTagManager clears selected tags without clearing history", async () => {
  installDom();
  const { createSelectorTagManager, getTagFieldState } = await import("../js/anima_tag_editor.js?case=clear-tags");
  const { node, widget } = createNodeAndWidget("alpha, ");

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  const deleteButton = findButtonByTitle(manager.element, ["Delete tag", "Delete Tag"]);
  assert.ok(deleteButton);
  deleteButton.click();
  assert.match(manager.element.textContent, /History/);

  const input = manager.element.querySelector("input");
  assert.ok(input);
  input.value = "beta";
  const addButton = Array.from(manager.element.querySelectorAll("button")).find(button => button.textContent === "Add");
  assert.ok(addButton);
  addButton.click();
  assert.equal(widget.value, "beta, ");

  const clearTagsButton = Array.from(manager.element.querySelectorAll("button")).find(button => button.textContent === "Clear Tags");
  assert.ok(clearTagsButton);
  clearTagsButton.click();

  assert.equal(widget.value, "");
  assert.equal(getTagFieldState(node, "artist_tags", widget).history.length, 1);
  assert.match(manager.element.textContent, /History/);
});

test("writeSelectorTagsToWidget keeps manual selector manager tags on confirm", async () => {
  installDom();
  const { createSelectorTagManager, writeSelectorTagsToWidget } = await import("../js/anima_tag_editor.js?case=confirm-manual");
  const { node, widget } = createNodeAndWidget("");

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  const input = manager.element.querySelector("input");
  assert.ok(input);
  input.value = "manual";
  const addButton = Array.from(manager.element.querySelectorAll("button")).find(button => button.textContent === "Add");
  assert.ok(addButton);
  addButton.click();

  writeSelectorTagsToWidget(node, widget, "card, ", { source: "selector" });

  assert.equal(widget.value, "card, manual, ");
});

test("writeSelectorTagsToWidget restores a history tag when it is selected again", async () => {
  installDom();
  const { createSelectorTagManager, writeSelectorTagsToWidget } = await import("../js/anima_tag_editor.js?case=confirm-history-reselect");
  const { node, widget } = createNodeAndWidget("{{alpha}}, ");

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  const deleteButton = findButtonByTitle(manager.element, ["Delete tag", "Delete Tag"]);
  assert.ok(deleteButton);
  deleteButton.click();
  assert.equal(widget.value, "");
  assert.match(manager.element.textContent, /History/);

  const appendButton = Array.from(manager.element.querySelectorAll("button")).find(button => button.textContent === "Append");
  assert.ok(appendButton);
  clickLikeBrowser(appendButton);

  writeSelectorTagsToWidget(node, widget, "alpha, ", { source: "selector" });

  assert.equal(widget.value, "{{alpha}}, ");
});

test("applySelectorTagsToWidget replaces tags in replace mode", async () => {
  installDom();
  const { createSelectorTagManager, applySelectorTagsToWidget } = await import("../js/anima_tag_editor.js?case=selector-tag-click");
  const { node, widget } = createNodeAndWidget("alpha, beta, ");

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  applySelectorTagsToWidget(node, widget, "beta, gamma, ", { source: "selector" });

  assert.equal(widget.value, "beta, gamma, ");
  assert.doesNotMatch(manager.element.textContent, /alpha/);
  assert.match(manager.element.textContent, /gamma/);
});

test("applySelectorTagsToWidget appends tags in append mode", async () => {
  installDom();
  const { createSelectorTagManager, applySelectorTagsToWidget } = await import("../js/anima_tag_editor.js?case=selector-tag-click-append");
  const { node, widget } = createNodeAndWidget("alpha, beta, ");

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  const appendButton = Array.from(manager.element.querySelectorAll("button")).find(button => button.textContent === "Append");
  assert.ok(appendButton);
  clickLikeBrowser(appendButton);

  applySelectorTagsToWidget(node, widget, "beta, gamma, ", { source: "selector" });

  assert.equal(widget.value, "alpha, beta, gamma, ");
  assert.match(manager.element.textContent, /gamma/);
});

test("applySelectorTagsToWidget restores a history tag selected directly", async () => {
  installDom();
  const { createSelectorTagManager, applySelectorTagsToWidget, getTagFieldState } = await import("../js/anima_tag_editor.js?case=selector-tag-click-history");
  const { node, widget } = createNodeAndWidget("{{alpha}}, ");

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  const deleteButton = findButtonByTitle(manager.element, ["Delete tag", "Delete Tag"]);
  assert.ok(deleteButton);
  deleteButton.click();
  assert.equal(widget.value, "");
  assert.match(manager.element.textContent, /History/);

  applySelectorTagsToWidget(node, widget, "alpha, ", { source: "selector" });

  assert.equal(widget.value, "{{alpha}}, ");
  assert.equal(getTagFieldState(node, "artist_tags", widget).history.length, 0);
});

test("writeSelectorTagsToWidget falls back to plain text for non Tagged nodes", async () => {
  installDom();
  const { writeSelectorTagsToWidget } = await import("../js/anima_tag_editor.js?case=confirm-plain");
  const { node, widget } = createNodeAndWidget("alpha, ");
  node.__animaNodeClass = "AnimaArtistTagSelector";

  writeSelectorTagsToWidget(node, widget, "beta, ", { source: "selector" });

  assert.equal(widget.value, "beta, ");
  assert.equal(widget.lastCallbackValue, "beta, ");
});

test("getActiveSelectorTagText returns enabled tag manager tags in widget text format", async () => {
  installDom();
  const {
    createSelectorTagManager,
    getActiveSelectorTagText,
    getTagFieldState,
  } = await import("../js/anima_tag_editor.js?case=active-tags");
  const { node, widget } = createNodeAndWidget("alpha, beta, gamma, ");

  createSelectorTagManager(node, widget, { label: "Selected Tags" });
  const field = getTagFieldState(node, "artist_tags", widget);
  field.tags[1].enabled = false;
  field.history.push({ text: "history-only", removedAt: Date.now() });

  assert.equal(getActiveSelectorTagText(node, widget), "alpha, gamma, ");
});

test("getActiveSelectorTagText returns empty text when there are no active tags", async () => {
  installDom();
  const {
    createSelectorTagManager,
    getActiveSelectorTagText,
    getTagFieldState,
  } = await import("../js/anima_tag_editor.js?case=active-tags-empty");
  const { node, widget } = createNodeAndWidget("alpha, ");

  createSelectorTagManager(node, widget, { label: "Selected Tags" });
  const field = getTagFieldState(node, "artist_tags", widget);
  field.tags[0].enabled = false;
  field.history.push({ text: "history-only", removedAt: Date.now() });

  assert.equal(getActiveSelectorTagText(node, widget), "");
  assert.equal(getActiveSelectorTagText(null, widget), "");
});
