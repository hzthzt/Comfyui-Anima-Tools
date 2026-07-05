import importlib.util
import sys
import types
from pathlib import Path


def load_nodes_module():
    root = Path(__file__).resolve().parents[1]
    package = types.ModuleType("Comfyui_Anima_Tools")
    package.__path__ = [str(root)]
    sys.modules["Comfyui_Anima_Tools"] = package

    server_module = types.ModuleType("server")

    class Routes:
        def get(self, _path):
            return lambda func: func

        def post(self, _path):
            return lambda func: func

    server_module.PromptServer = types.SimpleNamespace(
        instance=types.SimpleNamespace(
            routes=Routes(),
            add_on_prompt_handler=lambda _handler: None,
        )
    )
    sys.modules["server"] = server_module

    aiohttp_module = types.ModuleType("aiohttp")
    aiohttp_module.web = types.SimpleNamespace(
        Response=object,
        FileResponse=object,
        json_response=lambda data=None, status=200: (data, status),
    )
    sys.modules["aiohttp"] = aiohttp_module

    folder_paths_module = types.ModuleType("folder_paths")
    folder_paths_module.get_user_directory = lambda: str(root / ".tmp-user")
    sys.modules["folder_paths"] = folder_paths_module

    spec = importlib.util.spec_from_file_location("Comfyui_Anima_Tools.nodes", root / "nodes.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main():
    nodes = load_nodes_module()

    normalized = nodes.normalize_favorites_data({
        "background": {
            "groups": [{"id": "default", "name": "Cards", "isSystem": True}],
            "items": [{"id": "bg_1", "groupIds": ["default"]}],
        }
    })
    assert normalized["background"]["groups"][0]["name"] == "Cards"
    assert normalized["background"]["items"] == [{"id": "bg_1", "groupIds": ["default"]}]
    assert normalized["background"]["tagGroups"] == [
        {"id": "default", "name": "默认 Tag", "isSystem": True}
    ]
    assert normalized["background"]["tagItems"] == []

    merged = nodes.merge_favorites_data({}, {
        "pose": {
            "tagGroups": [
                {"id": "default", "name": "默认 Tag", "isSystem": True},
                {"id": "group_pose_tags", "name": "Pose Tags", "isSystem": False},
            ],
            "tagItems": [
                {"tag": "standing", "labelZh": "站立", "groupIds": ["group_pose_tags"], "sourceCount": 3}
            ],
        }
    })
    assert merged["pose"]["tagGroups"][1]["name"] == "Pose Tags"
    assert merged["pose"]["tagItems"] == [
        {"tag": "standing", "labelZh": "站立", "groupIds": ["group_pose_tags"], "sourceCount": 3}
    ]
    assert merged["pose"]["groups"][0]["id"] == "default"
    assert merged["pose"]["items"] == []

    existing = nodes.normalize_favorites_data({
        "artist": {
            "groups": [{"id": "default", "name": "默认收藏", "isSystem": True}],
            "items": [],
            "tagGroups": [
                {"id": "default", "name": "默认 Tag", "isSystem": True},
                {"id": "group_artist_tags", "name": "Artist Tags", "isSystem": False},
            ],
            "tagItems": [
                {"tag": "@foo", "labelZh": "Foo", "groupIds": ["group_artist_tags"], "sourceCount": 7}
            ],
        }
    })
    merged_legacy_payload = nodes.merge_favorites_data(existing, {
        "artist": {
            "groups": [{"id": "default", "name": "Updated Cards", "isSystem": True}],
            "items": [{"id": "artist_1", "groupIds": ["default"]}],
        }
    })
    assert merged_legacy_payload["artist"]["groups"][0]["name"] == "Updated Cards"
    assert merged_legacy_payload["artist"]["items"] == [{"id": "artist_1", "groupIds": ["default"]}]
    assert merged_legacy_payload["artist"]["tagGroups"][1]["name"] == "Artist Tags"
    assert merged_legacy_payload["artist"]["tagItems"] == [
        {"tag": "@foo", "labelZh": "Foo", "groupIds": ["group_artist_tags"], "sourceCount": 7}
    ]


if __name__ == "__main__":
    main()
