# Custom Item Active Tags Prefill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefill selector custom-item content with active tags from the current node tag manager.

**Architecture:** Add one exported helper in `js/anima_tag_editor.js` that reads enabled tags from existing tag manager state and formats them as widget text. Pass that helper's value into each selector's custom-item modal so the textarea starts with the active tags while empty state remains unchanged.

**Tech Stack:** JavaScript ES modules, Node test runner, jsdom.

---

### Task 1: Active Tag Helper

**Files:**
- Modify: `js/anima_tag_editor.js`
- Test: `tests/anima_tag_editor.test.mjs`

- [ ] **Step 1: Write failing tests**

Add tests that import `getActiveSelectorTagText` and assert enabled tags format as `alpha, gamma, `, disabled tags are ignored, history is ignored, and empty state returns `""`.

- [ ] **Step 2: Verify red**

Run:

```bash
npm test -- tests/anima_tag_editor.test.mjs
```

Expected: FAIL because `getActiveSelectorTagText` is not exported.

- [ ] **Step 3: Implement helper**

Export `getActiveSelectorTagText(node, widgetOrName)` from `js/anima_tag_editor.js`. Resolve widget and field name using the same logic as `createSelectorTagManager`; read `getTagFieldState`; filter `field.tags` by `enabled !== false`; format non-empty tag text as comma-suffixed text.

- [ ] **Step 4: Verify green**

Run:

```bash
npm test -- tests/anima_tag_editor.test.mjs
```

Expected: PASS.

### Task 2: Custom Item Modal Prefill

**Files:**
- Modify: `js/anima_artist_selector.js`
- Modify: `js/anima_character_selector.js`
- Modify: `js/anima_background_selector.js`
- Modify: `js/anima_clothing_selector.js`
- Modify: `js/anima_pose_selector.js`
- Test: `tests/anima_character_selector.test.mjs`

- [ ] **Step 1: Write failing selector test**

Add a test for one exported modal helper path proving that opening a custom-item modal with default content puts that text in the textarea.

- [ ] **Step 2: Verify red**

Run:

```bash
npm test -- tests/anima_character_selector.test.mjs
```

Expected: FAIL because the modal helper does not accept or apply default content.

- [ ] **Step 3: Implement selector prefill**

Import `getActiveSelectorTagText` in each selector file. On create-custom-card click, compute `const defaultContent = getActiveSelectorTagText(node, tagsWidget);` and pass it into `openCustomItemCreateModal`. Update each `openCustomItemCreateModal` to accept `defaultContent = ""` and assign it to the textarea.

- [ ] **Step 4: Verify selector tests**

Run:

```bash
npm test -- tests/anima_character_selector.test.mjs
```

Expected: PASS.

### Task 3: Full Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run all tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Inspect git diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intended files changed.
