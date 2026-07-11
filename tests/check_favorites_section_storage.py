import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from favorites_store import (  # noqa: E402
    FAVORITE_SECTIONS,
    FavoritesRevisionConflict,
    FavoritesSectionStore,
)


def envelope(section, revision=1, favorites=None):
    return {
        "schemaVersion": 1,
        "section": section,
        "revision": revision,
        "favorites": favorites if favorites is not None else {
            "groups": [],
            "items": [],
            "tagGroups": [],
            "tagItems": [],
        },
    }


def favorites_with_group(group_id):
    return {
        "groups": [{"id": group_id, "name": group_id}],
        "items": [],
        "tagGroups": [],
        "tagItems": [],
    }


def main():
    with tempfile.TemporaryDirectory() as temporary_directory:
        root = Path(temporary_directory)
        store = FavoritesSectionStore(root)

        assert FAVORITE_SECTIONS == (
            "artist", "character", "clothing", "background", "pose", "prompt", "lora",
        )
        for section in FAVORITE_SECTIONS:
            assert store.load(section) == envelope(section)

        try:
            store.load("../outside")
        except ValueError:
            pass
        else:
            raise AssertionError("Invalid favorite sections must be rejected")
        assert list(root.iterdir()) == []

        for revision in (True, 1.0, 0, -1):
            try:
                store.save("artist", revision, favorites_with_group("invalid-revision"))
            except ValueError:
                pass
            else:
                raise AssertionError(f"Revision {revision!r} must be rejected")
        assert store.load("artist") == envelope("artist")

        artist_saved = store.save("artist", 1, favorites_with_group("artist-group"))
        assert artist_saved == envelope("artist", 2, favorites_with_group("artist-group"))
        assert json.loads((root / "artist.json").read_text(encoding="utf-8")) == artist_saved

        artist_resaved = store.save("artist", 2, favorites_with_group("artist-group-v2"))
        assert artist_resaved == envelope("artist", 3, favorites_with_group("artist-group-v2"))
        try:
            store.save("artist", 2, favorites_with_group("stale"))
        except FavoritesRevisionConflict as conflict:
            assert conflict.current == artist_resaved
        else:
            raise AssertionError("Stale revisions must raise FavoritesRevisionConflict")

        for section in FAVORITE_SECTIONS:
            if section == "artist":
                continue
            saved = store.save(section, 1, favorites_with_group(f"{section}-group"))
            assert saved == envelope(section, 2, favorites_with_group(f"{section}-group"))
            assert json.loads((root / f"{section}.json").read_text(encoding="utf-8")) == saved
            assert store.load("artist") == artist_resaved

        original_artist_file = root / "artist.json"
        original_artist = json.loads(original_artist_file.read_text(encoding="utf-8"))
        with patch("favorites_store.os.replace", side_effect=OSError("replace failed")):
            try:
                store.save("artist", 3, favorites_with_group("broken-write"))
            except OSError:
                pass
            else:
                raise AssertionError("Write failures must be reported")
        assert json.loads(original_artist_file.read_text(encoding="utf-8")) == original_artist
        assert store.load("artist") == artist_resaved


if __name__ == "__main__":
    main()
