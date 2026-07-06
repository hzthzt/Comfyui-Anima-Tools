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
    expected_nodes = {
        "AnimaPromptTagSelector",
        "AnimaPromptTagSelectorPlus",
        "AnimaPromptTagSelectorTagged",
        "AnimaPromptTagSelectorPlusTagged",
    }

    assert expected_nodes.issubset(nodes.NODE_CLASS_MAPPINGS)
    assert expected_nodes.issubset(nodes.NODE_DISPLAY_NAME_MAPPINGS)

    input_types = nodes.AnimaPromptPlus.INPUT_TYPES()["required"]
    assert list(input_types) == [
        "quality_prompt",
        "artist_tags",
        "character_tags",
        "clothing_tags",
        "pose_tags",
        "background_tags",
        "extra_prompt",
        "separator",
        "prompt_tags",
    ]

    result = nodes.AnimaPromptPlus().compose_prompt(
        quality_prompt="masterpiece",
        artist_tags="foo artist",
        character_tags="1girl",
        clothing_tags="dress",
        pose_tags="standing",
        background_tags="city",
        extra_prompt="soft focus",
        prompt_tags="cinematic lighting, _raw_:dutched angle",
    )

    assert result["result"] == (
        "masterpiece, cinematic lighting, dutched angle, @foo artist, 1girl, dress, standing, city, soft focus, ",
    )
    assert result["ui"]["anima_selector_tags"][0]["prompt_tags"] == "cinematic lighting, _raw_:dutched angle"

    selector_result = nodes.AnimaPromptTagSelector().process_tags(
        "wide shot, _raw_:rating explicit",
        "append",
        "masterpiece",
    )
    assert selector_result["result"] == ("wide shot, rating explicit, masterpiece, ",)
    assert selector_result["ui"]["anima_selector_tags"][0]["prompt_tags"] == "wide shot, _raw_:rating explicit"

    prompt_random_text, selected = nodes._selector_random_text(nodes.AnimaPromptComposer(), "prompt")
    assert prompt_random_text
    assert prompt_random_text.endswith(", ")
    assert selected
    assert selected[0]["section"] == "prompt"
    assert selected[0]["title"] in prompt_random_text


if __name__ == "__main__":
    main()
