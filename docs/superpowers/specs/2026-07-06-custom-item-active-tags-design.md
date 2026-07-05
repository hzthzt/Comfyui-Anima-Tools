# Custom Item Active Tags Prefill Design

## Goal

When a user clicks the create-custom-item card inside a selector favorite collection, the custom item modal should prefill its prompt content with the currently active tags from the same node's tag manager.

## Scope

Apply the behavior to selector custom item creation in:

- `js/anima_artist_selector.js`
- `js/anima_character_selector.js`
- `js/anima_background_selector.js`
- `js/anima_clothing_selector.js`
- `js/anima_pose_selector.js`

This does not change normal card selection, favorite toggling, tag application, or the selector sidebar filter state.

## State Source

The source of truth is the node tag manager state in `js/anima_tag_editor.js`.

The active tags are the field tags whose `enabled` value is not `false`. Disabled tags and history items are ignored. The helper should return the same comma-suffixed text format used by the tag manager widget, for example:

```text
alpha, beta, 
```

If there are no active tags, the helper returns an empty string.

## Implementation Shape

Add an exported helper in `anima_tag_editor.js`, named `getActiveSelectorTagText(node, widgetOrName)`, that:

- Resolves the field name from the widget or widget name.
- Reads the field through `getTagFieldState`.
- Joins enabled tag text in current tag order.
- Returns an empty string for missing node, missing widget, or empty active tags.

Update each selector's custom item modal creation path so the create-card click computes the default prompt content from `getActiveSelectorTagText(node, tagsWidget)` and passes it into the modal.

Update each `openCustomItemCreateModal` implementation to accept an optional default content string and assign it to the textarea value before the modal is shown.

## Error Handling

Missing or empty tag manager state should not block custom item creation. The modal opens normally with an empty content field.

## Tests

Add front-end module tests for the tag editor helper:

- Enabled tags are returned in widget text format.
- Disabled tags and history entries are ignored.
- Missing or empty state returns an empty string.

Where practical, add a lightweight selector test for at least one modal implementation path to prove the default content reaches the textarea.
