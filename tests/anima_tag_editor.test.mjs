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

test("createSelectorTagManager renders current tags and updates widget when a tag is disabled", async () => {
  installDom();
  const { createSelectorTagManager } = await import("../js/anima_tag_editor.js?case=disable");
  const { node, widget } = createNodeAndWidget();

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  assert.match(manager.element.textContent, /Selected Tags/);
  assert.match(manager.element.textContent, /alpha/);
  assert.match(manager.element.textContent, /beta/);

  const disableButton = findButtonByTitle(manager.element, ["Disable tag", "Disable Tag"]);
  assert.ok(disableButton);
  disableButton.click();

  assert.equal(widget.value, "beta, ");
  assert.equal(widget.lastCallbackValue, undefined);
  assert.ok(node.setDirtyCanvasCalled > 0);
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
  appendButton.click();

  assert.equal(getTagFieldState(node, "artist_tags", widget).applyMode, "append");

  writeTagsToWidget(node, widget, "beta, ", { source: "selector" });

  assert.equal(widget.value, "alpha, beta, ");
});
