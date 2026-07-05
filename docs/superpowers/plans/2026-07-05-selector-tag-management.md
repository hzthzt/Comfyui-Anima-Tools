# Selector Tag Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the same tag-chip management experience from Tagged nodes into the selector modals opened from those nodes.

**Architecture:** Reuse `js/anima_tag_editor.js` as the single source of truth for tag state, chip rendering, history, and selector apply mode. Add a compact selector-facing DOM component there, then replace each selector footer's small `createSelectorApplyModeControl(...)` call with the shared manager while leaving each selector's existing selection-to-prompt logic intact.

**Tech Stack:** Browser ES modules, ComfyUI extension DOM APIs, `node:test`, `assert`, and `jsdom` for focused frontend unit tests.

---

## File Structure

- Modify `js/anima_tag_editor.js`
  - Export a selector modal manager component.
  - Keep existing node DOM widget editor behavior unchanged.
  - Reuse existing functions: `getTagFieldState`, `applyTagsToWidget`, `syncField`, `createApplyModeControl`, `createChip`, and `splitTagText`.
- Modify `js/anima_artist_selector.js`
  - Replace footer `createSelectorApplyModeControl` import/use with the selector manager.
  - Keep `applySelectionAndClose()` and artist custom favorite expansion unchanged.
- Modify `js/anima_character_selector.js`
  - Replace footer `createSelectorApplyModeControl` import/use with the selector manager.
  - Keep both "Apply Trigger" and "Apply Trigger + Tags" flows unchanged.
- Modify `js/anima_clothing_selector.js`
  - Replace footer `createSelectorApplyModeControl` import/use with the selector manager.
  - Keep `buildSelectedText()` unchanged.
- Modify `js/anima_background_selector.js`
  - Replace footer `createSelectorApplyModeControl` import/use with the selector manager.
  - Keep `buildSelectedText()` unchanged.
- Modify `js/anima_pose_selector.js`
  - Replace footer `createSelectorApplyModeControl` import/use with the selector manager.
  - Keep `buildSelectedText()` unchanged.
- Modify `js/i18n.js`
  - Add translations for selector manager labels not already present.
- Create `package.json`
  - Minimal ESM Node test script.
- Create `tests/anima_tag_editor.test.mjs`
  - Unit tests for the shared selector manager.

## Task 1: Add Test Harness

**Files:**
- Create: `package.json`
- Create: `tests/anima_tag_editor.test.mjs`

- [ ] **Step 1: Write the failing test harness**

Create `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs"
  },
  "devDependencies": {
    "jsdom": "^24.1.3"
  }
}
```

Create `tests/anima_tag_editor.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

test("test harness loads jsdom", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  assert.equal(dom.window.document.body.children.length, 0);
});
```

- [ ] **Step 2: Run the test to verify the missing dependency fails before install**

Run:

```bash
npm test
```

Expected: FAIL with `Cannot find package 'jsdom'` if dependencies are not installed yet.

- [ ] **Step 3: Install test dependency**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and `jsdom` is installed.

- [ ] **Step 4: Run the harness and verify it passes**

Run:

```bash
npm test
```

Expected: PASS with one test.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/anima_tag_editor.test.mjs
git commit -m "test: add selector tag editor test harness"
```

## Task 2: Test Selector Manager Behavior

**Files:**
- Modify: `tests/anima_tag_editor.test.mjs`

- [ ] **Step 1: Replace the harness-only test with behavior tests**

Replace `tests/anima_tag_editor.test.mjs` with:

```js
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

test("createSelectorTagManager renders current tags and updates widget when a tag is disabled", async () => {
  installDom();
  const { createSelectorTagManager } = await import("../js/anima_tag_editor.js?case=disable");
  const { node, widget } = createNodeAndWidget();

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  assert.match(manager.element.textContent, /Selected Tags/);
  assert.match(manager.element.textContent, /alpha/);
  assert.match(manager.element.textContent, /beta/);

  const disableButton = Array.from(manager.element.querySelectorAll("button")).find(button => button.title === "Disable tag");
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

  const deleteButton = Array.from(manager.element.querySelectorAll("button")).find(button => button.title === "Delete tag");
  assert.ok(deleteButton);
  deleteButton.click();

  assert.equal(widget.value, "");
  assert.match(manager.element.textContent, /History/);

  const restoreButton = Array.from(manager.element.querySelectorAll("button")).find(button => button.title === "Restore tag");
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
  input.value = "gamma";
  const addButton = Array.from(manager.element.querySelectorAll("button")).find(button => button.textContent === "Add");
  assert.ok(addButton);
  addButton.click();

  assert.equal(widget.value, "gamma, ");
  assert.match(manager.element.textContent, /gamma/);
});

test("createSelectorTagManager can switch selector apply mode", async () => {
  installDom();
  const { createSelectorTagManager, getTagFieldState } = await import("../js/anima_tag_editor.js?case=mode");
  const { node, widget } = createNodeAndWidget("");

  const manager = createSelectorTagManager(node, widget, { label: "Selected Tags" });
  document.body.appendChild(manager.element);

  const appendButton = Array.from(manager.element.querySelectorAll("button")).find(button => button.textContent === "Append");
  assert.ok(appendButton);
  appendButton.click();

  assert.equal(getTagFieldState(node, "artist_tags", widget).applyMode, "append");
});
```

- [ ] **Step 2: Run tests and verify they fail for the missing export**

Run:

```bash
npm test
```

Expected: FAIL with `does not provide an export named 'createSelectorTagManager'`.

- [ ] **Step 3: Commit**

```bash
git add tests/anima_tag_editor.test.mjs
git commit -m "test: define selector tag manager behavior"
```

## Task 3: Implement Shared Selector Tag Manager

**Files:**
- Modify: `js/anima_tag_editor.js`

- [ ] **Step 1: Add selector manager helpers**

In `js/anima_tag_editor.js`, after `renderTagEditor(...)` and before `createApplyModeControl(...)`, add:

```js
function selectorManagerStyle() {
    return `
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 260px;
        max-width: min(52vw, 620px);
        padding: 10px 12px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        background: rgba(0,0,0,0.18);
        box-sizing: border-box;
        color: #e5e7eb;
        font: 12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: auto;
    `;
}

function selectorManagerButtonStyle() {
    return `
        height: 26px;
        border-radius: 7px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.055);
        color: #d1d5db;
        padding: 0 9px;
        font-size: 11px;
        font-weight: 800;
        cursor: pointer;
        white-space: nowrap;
    `;
}

function createSelectorInput(onSubmit) {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = t("Add tag...");
    input.style.cssText = `
        flex: 1 1 auto;
        min-width: 80px;
        height: 26px;
        border-radius: 7px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.22);
        color: #f9fafb;
        padding: 0 8px;
        outline: none;
        box-sizing: border-box;
    `;
    input.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        onSubmit(input.value);
        input.value = "";
    });
    return input;
}
```

- [ ] **Step 2: Export `createSelectorTagManager`**

In `js/anima_tag_editor.js`, add this export after the helpers from Step 1:

```js
export function createSelectorTagManager(node, widgetOrName, config = {}) {
    const widget = typeof widgetOrName === "string" ? getWidget(node, widgetOrName) : widgetOrName;
    const fieldName = config.fieldName || widget?.name || String(widgetOrName || "");
    const root = document.createElement("div");
    root.className = "anima-selector-tag-manager";
    root.style.cssText = selectorManagerStyle();

    const render = () => {
        const field = getTagFieldState(node, fieldName, widget);
        root.innerHTML = "";

        const header = document.createElement("div");
        header.style.cssText = "display:flex;align-items:center;gap:8px;min-width:0;";

        const title = document.createElement("div");
        title.textContent = config.label || t("Selected Tags");
        title.style.cssText = "flex:1 1 auto;min-width:0;color:#f3f4f6;font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        header.appendChild(title);
        header.appendChild(createApplyModeControl(node, fieldName));
        root.appendChild(header);

        const chips = document.createElement("div");
        chips.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;max-height:72px;overflow:auto;min-height:26px;padding-right:2px;";
        field.tags.forEach(tag => chips.appendChild(createChip(node, widget, fieldName, tag, tag.enabled === false)));
        if (field.tags.length === 0) {
            const empty = document.createElement("span");
            empty.textContent = t("No tags yet");
            empty.style.cssText = "color:#9ca3af;font-size:11px;padding:5px 0;";
            chips.appendChild(empty);
        }
        root.appendChild(chips);

        const inputRow = document.createElement("div");
        inputRow.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0;";

        const input = createSelectorInput(value => {
            applyTagsToWidget(node, widget, value, { mode: "append", source: "manual" });
            render();
        });
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.textContent = t("Add");
        addButton.style.cssText = selectorManagerButtonStyle();
        addButton.addEventListener("click", event => {
            event.preventDefault();
            applyTagsToWidget(node, widget, input.value, { mode: "append", source: "manual" });
            input.value = "";
            render();
        });
        inputRow.appendChild(input);
        inputRow.appendChild(addButton);
        root.appendChild(inputRow);

        if (field.history.length > 0) {
            const historyRow = document.createElement("div");
            historyRow.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:5px;";

            const label = document.createElement("span");
            label.textContent = `${t("History")}:`;
            label.style.cssText = "color:#9ca3af;font-size:11px;font-weight:800;";
            historyRow.appendChild(label);

            field.history.slice(0, 6).forEach(item => {
                const restore = document.createElement("button");
                restore.type = "button";
                restore.textContent = item.text;
                restore.title = t("Restore Tag");
                restore.style.cssText = `
                    max-width: 130px;
                    height: 22px;
                    border-radius: 6px;
                    border: 1px solid rgba(156,163,175,0.18);
                    background: rgba(255,255,255,0.035);
                    color: #9ca3af;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    cursor: pointer;
                    font-size: 11px;
                `;
                restore.addEventListener("click", event => {
                    event.preventDefault();
                    field.history = field.history.filter(historyItem => historyItem !== item);
                    applyIncomingTags(field, [item.text], "append", "history");
                    syncField(node, fieldName, widget);
                    render();
                });
                historyRow.appendChild(restore);
            });

            const clear = document.createElement("button");
            clear.type = "button";
            clear.textContent = t("Clear History");
            clear.style.cssText = selectorManagerButtonStyle();
            clear.addEventListener("click", event => {
                event.preventDefault();
                field.history = [];
                syncField(node, fieldName, widget);
                render();
            });
            historyRow.appendChild(clear);
            root.appendChild(historyRow);
        }
    };

    const manager = {
        element: root,
        render,
    };
    render();
    return manager;
}
```

- [ ] **Step 3: Ensure chip actions refresh selector managers**

Change `syncField(...)` in `js/anima_tag_editor.js` from:

```js
function syncField(node, fieldName, widget, options = {}) {
    const field = getTagFieldState(node, fieldName, widget);
    setWidgetText(widget, enabledText(field), options);
    refreshEditor(node, fieldName);
    refreshNode(node);
}
```

to:

```js
function syncField(node, fieldName, widget, options = {}) {
    const field = getTagFieldState(node, fieldName, widget);
    setWidgetText(widget, enabledText(field), options);
    refreshEditor(node, fieldName);
    refreshSelectorManagers(node, fieldName);
    refreshNode(node);
}
```

Add this helper near `refreshEditor(...)`:

```js
function refreshSelectorManagers(node, fieldName) {
    const managers = node?._animaSelectorTagManagers?.[fieldName];
    if (!Array.isArray(managers)) return;
    managers.forEach(manager => manager?.render?.());
}
```

At the end of `createSelectorTagManager(...)`, before `render();`, register the manager:

```js
    node._animaSelectorTagManagers = node._animaSelectorTagManagers || {};
    node._animaSelectorTagManagers[fieldName] = node._animaSelectorTagManagers[fieldName] || [];
    node._animaSelectorTagManagers[fieldName].push(manager);
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```bash
npm test
```

Expected: PASS for all selector manager tests.

- [ ] **Step 5: Commit**

```bash
git add js/anima_tag_editor.js tests/anima_tag_editor.test.mjs
git commit -m "feat: add selector tag management component"
```

## Task 4: Wire Artist And Character Selectors

**Files:**
- Modify: `js/anima_artist_selector.js`
- Modify: `js/anima_character_selector.js`

- [ ] **Step 1: Update imports**

In both files, change:

```js
import { createSelectorApplyModeControl, ensureTagEditor, isTaggedAnimaNode, writeTagsToWidget } from "./anima_tag_editor.js";
```

to:

```js
import { createSelectorTagManager, ensureTagEditor, isTaggedAnimaNode, writeTagsToWidget } from "./anima_tag_editor.js";
```

- [ ] **Step 2: Replace the artist selector footer control**

In `js/anima_artist_selector.js`, replace:

```js
    if (isTaggedAnimaNode(node)) footerButtons.appendChild(createSelectorApplyModeControl(node, tagsWidget));
```

with:

```js
    if (isTaggedAnimaNode(node)) {
        footerButtons.insertBefore(
            createSelectorTagManager(node, tagsWidget, { label: t("Selected Tags") }).element,
            footerButtons.firstChild
        );
    }
```

- [ ] **Step 3: Replace the character selector footer control**

In `js/anima_character_selector.js`, replace:

```js
    if (isTaggedAnimaNode(node)) footerButtons.appendChild(createSelectorApplyModeControl(node, tagsWidget));
```

with:

```js
    if (isTaggedAnimaNode(node)) {
        footerButtons.insertBefore(
            createSelectorTagManager(node, tagsWidget, { label: t("Selected Tags") }).element,
            footerButtons.firstChild
        );
    }
```

- [ ] **Step 4: Run text checks**

Run:

```bash
rg "createSelectorApplyModeControl" js/anima_artist_selector.js js/anima_character_selector.js
```

Expected: no matches in those two files.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/anima_artist_selector.js js/anima_character_selector.js
git commit -m "feat: add selector tag manager to artist and character"
```

## Task 5: Wire Clothing, Background, And Pose Selectors

**Files:**
- Modify: `js/anima_clothing_selector.js`
- Modify: `js/anima_background_selector.js`
- Modify: `js/anima_pose_selector.js`

- [ ] **Step 1: Update imports**

In each file, change:

```js
import { createSelectorApplyModeControl, ensureTagEditor, isTaggedAnimaNode, writeTagsToWidget } from "./anima_tag_editor.js";
```

to:

```js
import { createSelectorTagManager, ensureTagEditor, isTaggedAnimaNode, writeTagsToWidget } from "./anima_tag_editor.js";
```

- [ ] **Step 2: Replace the clothing selector footer control**

In `js/anima_clothing_selector.js`, replace:

```js
    if (isTaggedAnimaNode(node)) footerBtns.appendChild(createSelectorApplyModeControl(node, tagsWidget));
```

with:

```js
    if (isTaggedAnimaNode(node)) {
        footerBtns.insertBefore(
            createSelectorTagManager(node, tagsWidget, { label: t("Selected Tags") }).element,
            footerBtns.firstChild
        );
    }
```

- [ ] **Step 3: Replace the background selector footer control**

In `js/anima_background_selector.js`, replace:

```js
    if (isTaggedAnimaNode(node)) footerBtns.appendChild(createSelectorApplyModeControl(node, tagsWidget));
```

with:

```js
    if (isTaggedAnimaNode(node)) {
        footerBtns.insertBefore(
            createSelectorTagManager(node, tagsWidget, { label: t("Selected Tags") }).element,
            footerBtns.firstChild
        );
    }
```

- [ ] **Step 4: Replace the pose selector footer control**

In `js/anima_pose_selector.js`, replace:

```js
    if (isTaggedAnimaNode(node)) footerBtns.appendChild(createSelectorApplyModeControl(node, tagsWidget));
```

with:

```js
    if (isTaggedAnimaNode(node)) {
        footerBtns.insertBefore(
            createSelectorTagManager(node, tagsWidget, { label: t("Selected Tags") }).element,
            footerBtns.firstChild
        );
    }
```

- [ ] **Step 5: Run text checks**

Run:

```bash
rg "createSelectorApplyModeControl" js/anima_clothing_selector.js js/anima_background_selector.js js/anima_pose_selector.js
```

Expected: no matches in those three selector files. `js/anima_tag_editor.js` may still export the old function for backward compatibility.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add js/anima_clothing_selector.js js/anima_background_selector.js js/anima_pose_selector.js
git commit -m "feat: add selector tag manager to visual selectors"
```

## Task 6: Add Missing Translations

**Files:**
- Modify: `js/i18n.js`

- [ ] **Step 1: Add translation key for the selector manager title**

In the English dictionary near existing tag editor strings, add:

```js
    "Selected Tags": "Selected Tags",
```

In the Chinese dictionary near existing tag editor strings, add:

```js
    "Selected Tags": "已选标签",
```

- [ ] **Step 2: Run a syntax check**

Run:

```bash
node --check js/i18n.js
```

Expected: no syntax errors.

- [ ] **Step 3: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add js/i18n.js
git commit -m "feat: add selector tag manager translations"
```

## Task 7: Final Verification

**Files:**
- Read only unless a verification failure exposes a real issue.

- [ ] **Step 1: Run full automated checks**

Run:

```bash
npm test
node --check js/anima_tag_editor.js
node --check js/anima_artist_selector.js
node --check js/anima_character_selector.js
node --check js/anima_clothing_selector.js
node --check js/anima_background_selector.js
node --check js/anima_pose_selector.js
```

Expected: all commands pass.

- [ ] **Step 2: Run integration text checks**

Run:

```bash
rg "createSelectorTagManager" js/anima_artist_selector.js js/anima_character_selector.js js/anima_clothing_selector.js js/anima_background_selector.js js/anima_pose_selector.js
rg "createSelectorApplyModeControl" js/anima_artist_selector.js js/anima_character_selector.js js/anima_clothing_selector.js js/anima_background_selector.js js/anima_pose_selector.js
```

Expected: first command finds one import and one footer usage per selector file. Second command finds no matches in selector files.

- [ ] **Step 3: Manual ComfyUI smoke test**

Start ComfyUI as usual, then:

1. Add a `*Tagged` variant of an artist selector node.
2. Type `alpha, beta, ` into its tag widget or add tags through the node tag editor.
3. Open the artist selector.
4. Confirm the footer shows `Selected Tags`, `alpha`, and `beta`.
5. Disable `alpha`; confirm the underlying widget becomes `beta, ` after closing or before applying.
6. Delete `beta`; confirm it appears in the selector manager history.
7. Restore `beta`; confirm the widget becomes `beta, `.
8. Pick one artist card and click `Confirm & Apply`; confirm selector output still writes to the widget and respects Replace/Append.
9. Repeat a quick open-and-visual-check for character, clothing, background, and pose `*Tagged` selectors.
10. Open a non-Tagged selector node and confirm it does not show the selector tag manager.

Expected: all selector modals remain usable, no console syntax errors appear, and non-Tagged nodes keep their old footer layout.

- [ ] **Step 4: Review git diff for accidental unrelated changes**

Run:

```bash
git diff --stat
git diff -- js/anima_tag_editor.js js/anima_artist_selector.js js/anima_character_selector.js js/anima_clothing_selector.js js/anima_background_selector.js js/anima_pose_selector.js js/i18n.js tests/anima_tag_editor.test.mjs package.json package-lock.json
```

Expected: diff only contains selector tag manager code, selector footer wiring, translations, and tests.

- [ ] **Step 5: Commit any final fixups**

Only if Step 1-4 required edits:

```bash
git add js/anima_tag_editor.js js/anima_artist_selector.js js/anima_character_selector.js js/anima_clothing_selector.js js/anima_background_selector.js js/anima_pose_selector.js js/i18n.js tests/anima_tag_editor.test.mjs package.json package-lock.json
git commit -m "fix: polish selector tag manager integration"
```

## Self-Review

- Spec coverage: The plan adds selector-modal tag chip management, history restore, delete/disable, manual add, and Replace/Append reuse through Tasks 2-5. Task 7 covers Tagged and non-Tagged smoke behavior.
- Placeholder scan: No task uses placeholder work; every code-changing task names files, snippets, commands, and expected results.
- Type consistency: The exported API is `createSelectorTagManager(node, widgetOrName, config)`, and all selector wiring uses `.element` from that return value.
