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

  ensureTagEditor(node, widget, { label: "Prompt Tags" });
  assert.ok(editorRoot);
  document.body.appendChild(editorRoot);

  const clearTagsButton = Array.from(editorRoot.querySelectorAll("button")).find(button => button.textContent === "Clear Tags");
  assert.ok(clearTagsButton);
  clearTagsButton.click();

  assert.equal(widget.value, "");
  assert.deepEqual(getTagFieldState(node, "artist_tags", widget).tags, []);
  assert.match(editorRoot.textContent, /No tags yet/);
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
  const { node, widget } = createNodeAndWidget("alpha, ");

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  const deleteButton = findButtonByTitle(manager.element, ["Delete tag", "Delete Tag"]);
  assert.ok(deleteButton);
  deleteButton.click();
  assert.equal(widget.value, "");
  assert.match(manager.element.textContent, /History/);

  writeSelectorTagsToWidget(node, widget, "alpha, ", { source: "selector" });

  assert.equal(widget.value, "alpha, ");
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
  const { node, widget } = createNodeAndWidget("alpha, ");

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  const deleteButton = findButtonByTitle(manager.element, ["Delete tag", "Delete Tag"]);
  assert.ok(deleteButton);
  deleteButton.click();
  assert.equal(widget.value, "");
  assert.match(manager.element.textContent, /History/);

  applySelectorTagsToWidget(node, widget, "alpha, ", { source: "selector" });

  assert.equal(widget.value, "alpha, ");
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
