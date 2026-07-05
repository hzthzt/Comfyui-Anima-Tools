# Tag View Custom Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add custom favorite tag creation and card-style favorite tag group management to selector tag view.

**Architecture:** Extend `js/anima_selector_tag_library.js` as the shared tag favorite model and UI owner. Keep catalog browsing catalog-only, but merge custom favorite entries into group-filtered lists. Move tag group management controls into selector sidebars by adding reusable sidebar helpers and wiring them from all five selector modals.

**Tech Stack:** JavaScript ES modules, DOM APIs, Node test runner, jsdom.

---

### Task 1: Tag Favorite Model Helpers

**Files:**
- Modify: `js/anima_selector_tag_library.js`
- Test: `tests/anima_selector_tag_library.test.mjs`

- [ ] Add `createSelectorTagFavoriteFromText(tagFavorites, catalog, text, groupId)` to normalize text, find a matching catalog item, and create or update a favorite entry.
- [ ] Add `getSelectorTagFavoriteGroupItems(catalog, tagFavorites, groupId)` to return catalog-backed favorites plus custom favorites for a group.
- [ ] Ensure custom entries use `{ tag, groupIds, isCustom: true }`.
- [ ] Ensure catalog matches do not create `isCustom`.
- [ ] Add tests for catalog match, custom creation, group filtering, and catalog-only category/all browsing.

### Task 2: Tag View Create Action

**Files:**
- Modify: `js/anima_selector_tag_library.js`
- Test: `tests/anima_selector_tag_library.test.mjs`

- [ ] Add a create-tag button to tag view toolbar.
- [ ] Use current group as the target group; use `default` when current view is all tags or a category.
- [ ] Prompt for tag text, call the model helper, save favorites, switch to the target group, and render.
- [ ] Render custom favorite rows in group views and allow click-to-apply.
- [ ] Add DOM tests proving a custom tag can be created and rendered in the active group.

### Task 3: Card-Style Tag Group Sidebar Management

**Files:**
- Modify: `js/anima_selector_tag_library.js`
- Modify: `js/anima_artist_selector.js`
- Modify: `js/anima_character_selector.js`
- Modify: `js/anima_background_selector.js`
- Modify: `js/anima_clothing_selector.js`
- Modify: `js/anima_pose_selector.js`
- Test: `tests/anima_selector_tag_library.test.mjs`

- [ ] Export reusable helpers for creating, renaming, and deleting tag groups.
- [ ] Add a reusable `createTagGroupSidebarSection` helper that renders Tag Groups with a header `+` and hover rename/delete actions for non-default groups.
- [ ] Wire each selector's `renderTagSidebar` to use the reusable section helper.
- [ ] Remove toolbar-level tag group create/rename/delete controls from tag view.
- [ ] Add tests for sidebar section group create, rename, delete, and active filter callbacks.

### Task 4: Verification and Commit

**Files:**
- Verify changed files.

- [ ] Run `npm test`.
- [ ] Run `git diff --check`.
- [ ] Inspect `git status --short` and `git diff --stat`.
- [ ] Commit docs separately with `doc:` if needed, then implementation with `feat:`.
