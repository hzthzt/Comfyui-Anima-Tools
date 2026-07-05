# Tag View Custom Favorites Design

## Goal

Tag view should support custom favorite tags and favorite tag group management with the same sidebar interaction style as card collections.

## Current Context

`js/anima_selector_tag_library.js` already owns tag favorite data:

- `tagGroups`: favorite tag groups, including system group `default`.
- `tagItems`: favorited tags with `tag`, optional metadata, and `groupIds`.

Card view already provides the preferred group interaction pattern in each selector sidebar: a group header with a `+` action, and hover actions for renaming or deleting non-default groups.

## Scope

Apply to tag view in all selector modals that use `createSelectorTagView`:

- artist
- character
- background
- clothing
- pose

Do not change card favorite item storage or normal card selection behavior.

## Design

### Favorite Tag Groups

The tag sidebar `Tag Groups` section should use the same interaction model as card collections:

- The section header includes a `+` action to create a tag group.
- Non-default tag groups show rename and delete actions on hover.
- The default tag group cannot be renamed or deleted.
- Deleting a group removes that group id from tag items, but does not delete the tag item itself.

The toolbar-level group buttons in tag view become unnecessary once the sidebar owns the group management workflow.

### Custom Favorite Tags

Tag view gains a create-tag action for favorite tags. The action creates or favorites a tag into the active tag group:

- If the active tag filter is a specific tag group, use that group.
- If the active tag filter is `all` or a category, use `default`.

When the user enters a tag:

1. Normalize the input with existing selector tag normalization.
2. Search the current catalog for a matching tag key.
3. If a catalog tag exists, favorite the catalog item into the target group.
4. If no catalog tag exists, create a custom `tagItems` entry in the target group.

Custom tag entries should be recognizable in data with `isCustom: true`.

### Display and Filtering

Catalog tags remain the source of truth for all-tag and category browsing.

Favorite group filtering should display:

- Favorited catalog tags.
- Custom favorite tags that are assigned to the selected group.

Custom favorite tags should not appear in catalog category browsing unless they later become catalog matches through normalization.

### Applying and Removing Tags

Custom favorite tags behave like catalog tags in the list:

- Clicking a custom tag applies its text to the current node.
- The star control removes or adds it from the current group.
- If removing a custom tag leaves it in no groups, remove the custom item.

### Persistence

Persist through the existing `saveTagFavorites -> saveFavorites` path. No new backend endpoint is required.

## Testing

Add front-end module tests for:

- Creating a favorite tag from text uses the catalog item when the tag exists.
- Creating a favorite tag from text creates `isCustom: true` when the tag is not in the catalog.
- Group filtering includes custom tags assigned to the group.
- Category/all catalog browsing does not show custom-only tags.
- Removing a tag group keeps tag items but removes the deleted group id.

Add a tag view DOM test that proves the create-tag action adds a custom tag and renders it in the active group.
