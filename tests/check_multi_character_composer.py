from check_prompt_tag_selector import load_nodes_module


def character_kwargs(count, genders=None):
    genders = genders or ["female"] * count
    values = {}
    for index in range(1, 5):
        active = index <= count
        values[f"character_{index}_gender"] = genders[index - 1] if active else "female"
        values[f"character_{index}_prompt"] = f"Character {index}, with feature {index}" if active else ""
        values[f"character_{index}_clothing"] = f"outfit {index}" if active else ""
        values[f"character_{index}_pose"] = f"pose {index}" if active else ""
    return values


def main():
    nodes = load_nodes_module()
    composer = nodes.AnimaMultiCharacterComposer()

    assert nodes.NODE_CLASS_MAPPINGS["AnimaMultiCharacterComposer"] is nodes.AnimaMultiCharacterComposer
    assert nodes.NODE_DISPLAY_NAME_MAPPINGS["AnimaMultiCharacterComposer"] == "Anima Multi Character Composer"
    assert nodes.AnimaMultiCharacterComposer.INPUT_TYPES()["required"]["global_tags"][1]["default"] == ""

    result = composer.compose_prompt(
        character_count=2,
        layout="two_side_by_side",
        global_tags="",
        interaction="holding hands,",
        scene="a city street.",
        **character_kwargs(2, ["female", "male"]),
    )
    assert result == (
        "1girl, 1boy. A two-character composition with both characters standing side by side. "
        "On the left is Character 1, with feature 1, wearing outfit 1, pose 1. "
        "On the right is Character 2, with feature 2, wearing outfit 2, pose 2. "
        "The characters are holding hands. The scene is a city street.",
    )

    optional = character_kwargs(2)
    optional["character_1_clothing"] = "wearing a white dress"
    optional["character_1_pose"] = ""
    optional["character_2_clothing"] = ""
    optional["character_2_pose"] = ""
    optional_text = composer.compose_prompt(
        character_count=2,
        layout="two_facing",
        global_tags="",
        interaction="",
        scene="",
        **optional,
    )[0]
    assert "wearing wearing" not in optional_text
    assert "On the left is Character 1, with feature 1, wearing a white dress." in optional_text
    assert "On the right is Character 2, with feature 2." in optional_text

    layouts = nodes.AnimaMultiCharacterComposer.LAYOUTS
    for count, options in layouts.items():
        for layout in options:
            text = composer.compose_prompt(
                character_count=count,
                layout=layout,
                global_tags="masterpiece, best quality, ",
                interaction="",
                scene="",
                **character_kwargs(count),
            )[0]
            assert text.startswith(f"masterpiece, best quality, {count}girls.")
            assert text.count("Character ") == count
            assert ",,." not in text

    try:
        composer.compose_prompt(
            character_count=2,
            layout="three_row",
            global_tags="",
            interaction="",
            scene="",
            **character_kwargs(2),
        )
        raise AssertionError("invalid layout should fail")
    except ValueError as error:
        assert "not valid" in str(error)

    missing = character_kwargs(2)
    missing["character_2_prompt"] = ""
    try:
        composer.compose_prompt(
            character_count=2,
            layout="two_side_by_side",
            global_tags="",
            interaction="",
            scene="",
            **missing,
        )
        raise AssertionError("missing character prompt should fail")
    except ValueError as error:
        assert "slot 2" in str(error)


if __name__ == "__main__":
    main()
