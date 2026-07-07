# Danbooru Gap Fill Classification Design

## Goal

Fill missing Danbooru Tag Supermarket entries into the existing selector catalogs using the current selector model instead of placing everything in one prompt catalog.

## Source

Use the cached `wfjsw/danbooru-diffusion-prompt-builder` YAML files under `.tmp-user/danbooru-tag-supermarket-cache/data/tags`.

## Scope

Add missing general-purpose tags from Danbooru Tag Supermarket to selector catalog JSON files. Do not import character-name or copyright work-name entries from `characters.yaml`.

Preserve existing tag entries. When a tag already exists, append the relevant category ID and fill missing Chinese metadata, aliases, and source markers.

## Classification

- `natural/*` -> `background.json`, `nature-outdoors`
- `humanities/buildings.yaml`, `humanities/indoors.yaml`, `humanities/outdoors.yaml` -> `background.json`, mostly `urban-daily`, with nature/outdoor terms allowed in `nature-outdoors`
- `humanities/food/*` -> `prompt.json`, new category `food`
- `items.yaml` -> `prompt.json`, new category `object`
- `artistic-license.yaml` -> `prompt.json`, new category `variation`
- `human/hair.yaml` -> `character.json`, `hair`
- `human/ears.yaml`, `human/humantype.yaml`, `human/breasts.yaml` -> `character.json`, `body-traits`
- `human/body_ornament.yaml`, `human/head_ornament.yaml` -> `character.json`, `decoration`
- `human/neck.yaml` -> `character.json`, `decoration`
- `human/clothes.yaml`, `human/upperbody.yaml`, `human/lowerbody.yaml`, `human/shoesock.yaml` -> `clothing.json`; create `shoes-socks` for shoesock terms and use existing clothing categories for the rest
- `human/actions.yaml`, `human/directions.yaml` -> `pose.json`, with existing pose categories selected by keyword
- `human/quality.yaml` -> `prompt.json`, `quality`

Do not modify `artist.json`.

## Validation

After import:

- Parse all selector catalog JSON files.
- Report additions and updates per target file.
- Run `npm test`.
