import asyncio
import importlib.util
import json
import sys
import tempfile
import types
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

def load_nodes_module():
    package = types.ModuleType("Comfyui_Anima_Tools")
    package.__path__ = [str(ROOT)]
    sys.modules["Comfyui_Anima_Tools"] = package

    class Routes:
        def __init__(self):
            self.paths = []

        def get(self, path):
            self.paths.append(("GET", path))
            return lambda func: func

        def post(self, path):
            self.paths.append(("POST", path))
            return lambda func: func

    routes = Routes()
    server_module = types.ModuleType("server")
    server_module.PromptServer = types.SimpleNamespace(
        instance=types.SimpleNamespace(
            routes=routes,
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
    folder_paths_module.get_user_directory = lambda: str(ROOT / ".tmp-user")
    sys.modules["folder_paths"] = folder_paths_module

    spec = importlib.util.spec_from_file_location("Comfyui_Anima_Tools.nodes", ROOT / "nodes.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module, routes


class Request:
    def __init__(self, section, payload=None):
        self.match_info = {"section": section}
        self._payload = payload

    async def text(self):
        return self._payload or ""


def main():
    nodes, routes = load_nodes_module()
    assert ("GET", "/anima-tools/favorites/{section}") in routes.paths
    assert ("POST", "/anima-tools/favorites/{section}") in routes.paths

    with tempfile.TemporaryDirectory() as temporary_directory:
        store = nodes.FavoritesSectionStore(temporary_directory)
        favorites = {
            "tagGroups": [
                {"id": "default", "name": "默认 Tag", "isSystem": True},
                {"id": "group_pose_tags", "name": "Pose Tags", "isSystem": False},
            ],
            "tagItems": [
                {
                    "tag": "standing",
                    "labelZh": "站立",
                    "groupIds": ["group_pose_tags"],
                    "sourceCount": 3,
                }
            ],
        }
        previous_store = nodes.favorites_store
        nodes.favorites_store = store
        try:
            saved, status = asyncio.run(nodes.save_favorites_api(Request(
                "pose",
                json.dumps({"revision": 1, "favorites": favorites}, ensure_ascii=False),
            )))
            assert status == 200
            assert saved["favorites"] == {
                "groups": [],
                "items": [],
                "tagGroups": [
                    {"id": "default", "name": "默认 Tag", "isSystem": True},
                    {"id": "group_pose_tags", "name": "Pose Tags", "isSystem": False},
                ],
                "tagItems": [
                    {
                        "tag": "standing",
                        "labelZh": "站立",
                        "groupIds": ["group_pose_tags"],
                        "sourceCount": 3,
                    }
                ],
            }
            loaded, status = asyncio.run(nodes.get_favorites_api(Request("pose")))
            assert status == 200
            assert loaded == saved
            conflict, status = asyncio.run(nodes.save_favorites_api(Request(
                "pose",
                json.dumps({"revision": 1, "favorites": favorites}, ensure_ascii=False),
            )))
            assert status == 409
            assert conflict == {
                "success": False,
                "error": "revision_conflict",
                "current": saved,
            }
        finally:
            nodes.favorites_store = previous_store


if __name__ == "__main__":
    main()
