import json
import os
import tempfile
import threading


FAVORITE_SECTIONS = (
    "artist",
    "character",
    "clothing",
    "background",
    "pose",
    "prompt",
    "lora",
)

_FAVORITE_FIELDS = ("groups", "items", "tagGroups", "tagItems")


class FavoritesRevisionConflict(Exception):
    def __init__(self, current):
        self.current = current
        super().__init__("Favorites revision conflict")


class FavoritesSectionStore:
    def __init__(self, root_directory):
        self.root_directory = os.fspath(root_directory)
        self._section_locks = {
            section: threading.Lock()
            for section in FAVORITE_SECTIONS
        }

    def load(self, section):
        return self._read(section)

    def save(self, section, expected_revision, favorites):
        self._validate_section(section)
        with self._section_locks[section]:
            current = self._read(section)
            if expected_revision != current["revision"]:
                raise FavoritesRevisionConflict(current)

            saved = self._envelope(
                section,
                current["revision"] + 1,
                favorites,
            )
            os.makedirs(self.root_directory, exist_ok=True)
            path = self._path(section)
            descriptor, temporary_path = tempfile.mkstemp(
                prefix=f".{section}.",
                suffix=".tmp",
                dir=self.root_directory,
            )
            try:
                with os.fdopen(descriptor, "w", encoding="utf-8") as temporary_file:
                    json.dump(saved, temporary_file, indent=2, ensure_ascii=False)
                    temporary_file.flush()
                    os.fsync(temporary_file.fileno())
                os.replace(temporary_path, path)
            except Exception:
                try:
                    os.unlink(temporary_path)
                except FileNotFoundError:
                    pass
                raise
            return saved

    def _read(self, section):
        self._validate_section(section)
        path = self._path(section)
        if not os.path.exists(path):
            return self._envelope(section, 1, {})
        try:
            with open(path, "r", encoding="utf-8") as favorites_file:
                return self._normalize_envelope(section, json.load(favorites_file))
        except (OSError, ValueError, TypeError):
            return self._envelope(section, 1, {})

    def _path(self, section):
        self._validate_section(section)
        return os.path.join(self.root_directory, f"{section}.json")

    @staticmethod
    def _validate_section(section):
        if section not in FAVORITE_SECTIONS:
            raise ValueError("Unknown favorites section")

    @staticmethod
    def _normalize_favorites(favorites):
        if not isinstance(favorites, dict):
            favorites = {}
        return {
            field: favorites[field] if isinstance(favorites.get(field), list) else []
            for field in _FAVORITE_FIELDS
        }

    def _normalize_envelope(self, section, data):
        if not isinstance(data, dict):
            data = {}
        revision = data.get("revision")
        if not isinstance(revision, int) or isinstance(revision, bool) or revision < 1:
            revision = 1
        return self._envelope(section, revision, data.get("favorites"))

    def _envelope(self, section, revision, favorites):
        return {
            "schemaVersion": 1,
            "section": section,
            "revision": revision,
            "favorites": self._normalize_favorites(favorites),
        }
