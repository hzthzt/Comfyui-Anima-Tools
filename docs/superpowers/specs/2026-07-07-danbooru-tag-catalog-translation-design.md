# Danbooru Tag Catalog Translation Sync Design

## Goal

Improve the existing selector tag dictionaries by filling missing Chinese translations from Danbooru Tag Supermarket data, without changing the visible catalog scope.

## Source

The upstream source is `wfjsw/danbooru-diffusion-prompt-builder`, specifically `data/tags/**/*.yaml`. These files provide Danbooru-style tag keys with Chinese names, aliases, and optional wiki URLs.

The sync should download or cache upstream YAML files and build an exact `tag -> metadata` index. Network retries are acceptable because raw GitHub requests can fail intermittently.

## Scope

Update only existing entries in:

- `js/config/selector_tag_catalog/artist.json`
- `js/config/selector_tag_catalog/background.json`
- `js/config/selector_tag_catalog/character.json`
- `js/config/selector_tag_catalog/clothing.json`
- `js/config/selector_tag_catalog/pose.json`
- `js/config/selector_tag_catalog/prompt.json`

Do not add new tags from upstream. Do not remove existing tags. Preserve current category assignment and ordering.

## Mapping Rules

For each local tag, match the normalized tag text exactly against the upstream tag key.

When a match is found:

- Fill `label.zh` when it is empty.
- Fill `meaning.zh` when it is empty.
- Keep existing non-empty Chinese text unchanged.
- Merge upstream aliases into `aliases` without duplicates.
- Append an upstream source marker to `sources` only when the local entry already uses source metadata or when a new source field is useful for traceability.

When no match is found, leave the entry unchanged.

## Data Safety

The sync must be deterministic. Running it twice should produce no extra changes after the first successful run.

Generated JSON should remain pretty-printed with two-space indentation and valid UTF-8.

## Validation

After updating dictionaries:

- Parse every selector catalog JSON file.
- Report how many entries were updated per file.
- Run the existing Node test suite with `npm test`.

If upstream cannot be reached, stop before modifying dictionaries unless a complete local cache already exists.
