# Danbooru Tag Catalog Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill missing Chinese translations in the existing selector tag catalog files from Danbooru Tag Supermarket data without adding or removing tags.

**Architecture:** Add a focused Python sync utility under `tools/` with pure functions for YAML indexing, JSON catalog updates, and network/cache loading. Add a Python smoke test for the pure functions, then run the utility against the real catalog files and validate with existing tests.

**Tech Stack:** Python 3.9+, PyYAML, JSON catalog files, existing Node test suite.

---

### Task 1: Add Sync Utility Tests

**Files:**
- Create: `tests/check_danbooru_tag_translation_sync.py`
- Read: `docs/superpowers/specs/2026-07-07-danbooru-tag-catalog-translation-design.md`

- [ ] **Step 1: Write the failing test**

Create `tests/check_danbooru_tag_translation_sync.py` with:

```python
import copy
import importlib.util
from pathlib import Path


def load_sync_module():
    root = Path(__file__).resolve().parents[1]
    module_path = root / "tools" / "sync_danbooru_tag_translations.py"
    spec = importlib.util.spec_from_file_location("sync_danbooru_tag_translations", module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    sync = load_sync_module()

    yaml_text = """
name: 示例
content:
  blue eyes:
    name: 蓝色眼睛
    alias:
      - blue eye
    wikiURL: https://danbooru.donmai.us/wiki_pages/blue_eyes.html
  school uniform:
    name: 校服
"""

    index = sync.build_translation_index([("data/tags/human/face.yaml", yaml_text)])
    assert index["blue eyes"]["zh"] == "蓝色眼睛"
    assert index["blue eyes"]["aliases"] == ["blue eye"]
    assert index["blue eyes"]["sources"] == ["data/tags/human/face.yaml"]

    catalog = {
        "version": 1,
        "section": "character",
        "tags": [
            {
                "tag": "blue eyes",
                "label": {"en": "blue eyes", "zh": ""},
                "meaning": {"en": "blue eyes", "zh": ""},
                "aliases": [],
            },
            {
                "tag": "school uniform",
                "label": {"en": "school uniform", "zh": "既有校服"},
                "meaning": {"en": "school uniform", "zh": ""},
                "aliases": ["uniform"],
                "sources": ["manual"],
            },
            {
                "tag": "unknown tag",
                "label": {"en": "unknown tag", "zh": ""},
                "meaning": {"en": "unknown tag", "zh": ""},
                "aliases": [],
            },
        ],
    }

    original = copy.deepcopy(catalog)
    stats = sync.update_catalog(catalog, index, "character.json")

    assert stats["matched"] == 2
    assert stats["label_zh"] == 1
    assert stats["meaning_zh"] == 2
    assert stats["aliases"] == 1
    assert stats["sources"] == 1
    assert catalog["tags"][0]["label"]["zh"] == "蓝色眼睛"
    assert catalog["tags"][0]["meaning"]["zh"] == "蓝色眼睛"
    assert catalog["tags"][0]["aliases"] == ["blue eye"]
    assert "danbooru-diffusion-prompt-builder:data/tags/human/face.yaml" not in catalog["tags"][0]
    assert catalog["tags"][1]["label"]["zh"] == "既有校服"
    assert catalog["tags"][1]["meaning"]["zh"] == "校服"
    assert catalog["tags"][1]["aliases"] == ["uniform"]
    assert catalog["tags"][1]["sources"] == [
        "manual",
        "danbooru-diffusion-prompt-builder:data/tags/human/face.yaml",
    ]
    assert catalog["tags"][2] == original["tags"][2]

    second_stats = sync.update_catalog(catalog, index, "character.json")
    assert second_stats["label_zh"] == 0
    assert second_stats["meaning_zh"] == 0
    assert second_stats["aliases"] == 0
    assert second_stats["sources"] == 0


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python tests/check_danbooru_tag_translation_sync.py`

Expected: FAIL because `tools/sync_danbooru_tag_translations.py` does not exist.

### Task 2: Implement Sync Utility

**Files:**
- Create: `tools/sync_danbooru_tag_translations.py`
- Test: `tests/check_danbooru_tag_translation_sync.py`

- [ ] **Step 1: Add the utility**

Create `tools/sync_danbooru_tag_translations.py` with:

```python
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parents[1]
CATALOG_DIR = REPO_ROOT / "js" / "config" / "selector_tag_catalog"
CACHE_DIR = REPO_ROOT / ".tmp-user" / "danbooru-tag-supermarket-cache"
UPSTREAM_TREE_URL = "https://api.github.com/repos/wfjsw/danbooru-diffusion-prompt-builder/git/trees/master?recursive=1"
UPSTREAM_RAW_BASE_URL = "https://raw.githubusercontent.com/wfjsw/danbooru-diffusion-prompt-builder/master/"
UPSTREAM_SOURCE_PREFIX = "danbooru-diffusion-prompt-builder:"
CATALOG_FILES = [
    "artist.json",
    "background.json",
    "character.json",
    "clothing.json",
    "pose.json",
    "prompt.json",
]


def normalize_tag(value):
    return str(value or "").strip().replace("_", " ").lower()


def unique_preserving_order(values):
    result = []
    seen = set()
    for value in values:
        text = str(value or "").strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(text)
    return result


def build_translation_index(yaml_files):
    index = {}
    for source_path, yaml_text in yaml_files:
        loaded = yaml.safe_load(yaml_text) or {}
        content = loaded.get("content") if isinstance(loaded, dict) else None
        if not isinstance(content, dict):
            continue
        for tag, metadata in content.items():
            key = normalize_tag(tag)
            if not key or not isinstance(metadata, dict):
                continue
            zh = str(metadata.get("name") or "").strip()
            if not zh:
                continue
            aliases = metadata.get("alias") or []
            if isinstance(aliases, str):
                aliases = [aliases]
            if not isinstance(aliases, list):
                aliases = []
            existing = index.setdefault(key, {"zh": zh, "aliases": [], "sources": []})
            if not existing.get("zh"):
                existing["zh"] = zh
            existing["aliases"] = unique_preserving_order([*existing["aliases"], *aliases])
            existing["sources"] = unique_preserving_order([*existing["sources"], source_path])
    return index


def ensure_label_object(tag_entry, key):
    value = tag_entry.get(key)
    if not isinstance(value, dict):
        value = {}
        tag_entry[key] = value
    return value


def update_catalog(catalog, translation_index, catalog_name):
    stats = {
        "file": catalog_name,
        "tags": len(catalog.get("tags") or []),
        "matched": 0,
        "label_zh": 0,
        "meaning_zh": 0,
        "aliases": 0,
        "sources": 0,
    }
    tags = catalog.get("tags")
    if not isinstance(tags, list):
        return stats

    for tag_entry in tags:
        if not isinstance(tag_entry, dict):
            continue
        tag_key = normalize_tag(tag_entry.get("tag"))
        metadata = translation_index.get(tag_key)
        if not metadata:
            continue
        stats["matched"] += 1
        zh = metadata["zh"]

        label = ensure_label_object(tag_entry, "label")
        if not str(label.get("zh") or "").strip():
            label["zh"] = zh
            stats["label_zh"] += 1

        meaning = ensure_label_object(tag_entry, "meaning")
        if not str(meaning.get("zh") or "").strip():
            meaning["zh"] = zh
            stats["meaning_zh"] += 1

        existing_aliases = tag_entry.get("aliases")
        if not isinstance(existing_aliases, list):
            existing_aliases = []
        merged_aliases = unique_preserving_order([*existing_aliases, *metadata["aliases"]])
        if merged_aliases != existing_aliases:
            tag_entry["aliases"] = merged_aliases
            stats["aliases"] += 1

        existing_sources = tag_entry.get("sources")
        if isinstance(existing_sources, list):
            source_markers = [f"{UPSTREAM_SOURCE_PREFIX}{source}" for source in metadata["sources"]]
            merged_sources = unique_preserving_order([*existing_sources, *source_markers])
            if merged_sources != existing_sources:
                tag_entry["sources"] = merged_sources
                stats["sources"] += 1

    return stats


def request_text(url, retries=3):
    last_error = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Comfyui-Anima-Tools"})
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read().decode("utf-8")
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last_error = error
            if attempt + 1 < retries:
                time.sleep(1 + attempt)
    raise RuntimeError(f"Failed to download {url}: {last_error}") from last_error


def list_upstream_yaml_paths():
    tree = json.loads(request_text(UPSTREAM_TREE_URL))
    paths = []
    for item in tree.get("tree", []):
        path = item.get("path", "")
        if item.get("type") == "blob" and path.startswith("data/tags/") and path.endswith(".yaml"):
            paths.append(path)
    return sorted(paths)


def cache_path_for(source_path, cache_dir):
    return cache_dir / source_path


def load_upstream_yaml_files(cache_dir=CACHE_DIR):
    cache_dir.mkdir(parents=True, exist_ok=True)
    source_paths = list_upstream_yaml_paths()
    if not source_paths:
        raise RuntimeError("No upstream YAML files found")

    yaml_files = []
    failures = []
    for source_path in source_paths:
        cache_path = cache_path_for(source_path, cache_dir)
        if cache_path.exists():
            yaml_files.append((source_path, cache_path.read_text(encoding="utf-8")))
            continue
        try:
            text = request_text(f"{UPSTREAM_RAW_BASE_URL}{source_path}")
        except RuntimeError as error:
            failures.append(str(error))
            continue
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(text, encoding="utf-8")
        yaml_files.append((source_path, text))

    if failures and len(yaml_files) != len(source_paths):
        missing = len(source_paths) - len(yaml_files)
        raise RuntimeError(f"Failed to load {missing} upstream YAML files; first error: {failures[0]}")
    return yaml_files


def sync_catalog_files(catalog_dir=CATALOG_DIR, cache_dir=CACHE_DIR, dry_run=False):
    yaml_files = load_upstream_yaml_files(cache_dir)
    translation_index = build_translation_index(yaml_files)
    all_stats = []
    for catalog_name in CATALOG_FILES:
        catalog_path = catalog_dir / catalog_name
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        stats = update_catalog(catalog, translation_index, catalog_name)
        all_stats.append(stats)
        if not dry_run:
            catalog_path.write_text(
                json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
    return all_stats


def print_stats(all_stats):
    for stats in all_stats:
        print(
            "{file}: tags={tags} matched={matched} label_zh={label_zh} "
            "meaning_zh={meaning_zh} aliases={aliases} sources={sources}".format(**stats)
        )


def main(argv=None):
    parser = argparse.ArgumentParser(description="Sync selector tag Chinese translations from Danbooru Tag Supermarket")
    parser.add_argument("--dry-run", action="store_true", help="Report changes without writing catalog files")
    args = parser.parse_args(argv)
    stats = sync_catalog_files(dry_run=args.dry_run)
    print_stats(stats)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Run the unit test**

Run: `python tests/check_danbooru_tag_translation_sync.py`

Expected: PASS.

### Task 3: Execute Dictionary Sync

**Files:**
- Modify: `js/config/selector_tag_catalog/*.json`
- Run: `tools/sync_danbooru_tag_translations.py`

- [ ] **Step 1: Run a dry run**

Run: `python tools/sync_danbooru_tag_translations.py --dry-run`

Expected: one summary line per catalog file. The command must complete before any catalog files are edited by the script.

- [ ] **Step 2: Run the sync**

Run: `python tools/sync_danbooru_tag_translations.py`

Expected: one summary line per catalog file, with non-zero updates for at least `character.json`.

- [ ] **Step 3: Run the sync a second time**

Run: `python tools/sync_danbooru_tag_translations.py`

Expected: `label_zh=0`, `meaning_zh=0`, `aliases=0`, and `sources=0` for every file.

### Task 4: Validate and Commit

**Files:**
- Test: `tests/check_danbooru_tag_translation_sync.py`
- Test: `tests/*.test.mjs`
- Modify: `js/config/selector_tag_catalog/*.json`

- [ ] **Step 1: Parse all catalog JSON files**

Run:

```powershell
node -e "const fs=require('fs'); for (const file of fs.readdirSync('js/config/selector_tag_catalog')) { JSON.parse(fs.readFileSync('js/config/selector_tag_catalog/'+file,'utf8')); console.log(file, 'ok'); }"
```

Expected: each catalog file prints `ok`.

- [ ] **Step 2: Run Python sync test**

Run: `python tests/check_danbooru_tag_translation_sync.py`

Expected: PASS with exit code 0.

- [ ] **Step 3: Run Node tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 4: Review changed files**

Run: `git status --short`

Expected: changes include the sync utility, its test, the plan, and selector catalog JSON files. Pre-existing unrelated changes to `js/anima_character_selector.js` and `tests/anima_character_selector.test.mjs` may still be present and must not be staged for this commit.

- [ ] **Step 5: Commit related changes only**

Run:

```powershell
git add -- tools/sync_danbooru_tag_translations.py tests/check_danbooru_tag_translation_sync.py docs/superpowers/plans/2026-07-07-danbooru-tag-catalog-translation.md js/config/selector_tag_catalog/*.json
git commit -m "data: 补全 Danbooru 标签词库中文翻译"
```

Expected: commit succeeds without staging unrelated pre-existing files.

---

## Self-Review

- Spec coverage: source download/cache, exact existing-tag matching, no new tags, preserving non-empty Chinese text, alias/source merge, deterministic rerun, JSON validation, and `npm test` are all covered.
- Red-flag scan: no incomplete placeholder instructions remain.
- Type consistency: the test and implementation both use `build_translation_index`, `update_catalog`, `label.zh`, `meaning.zh`, `aliases`, and `sources` consistently.
