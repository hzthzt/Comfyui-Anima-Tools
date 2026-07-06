import argparse
import json
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
