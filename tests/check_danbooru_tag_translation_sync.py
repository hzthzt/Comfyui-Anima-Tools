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
