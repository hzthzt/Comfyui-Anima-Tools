import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = {};

const {
  normalizeLoraList,
  parseLoraJsonValue,
  setLoraEnabled,
} = await import("../js/anima_lora_selector.js");
const { translateForLanguage } = await import("../js/i18n.js");

function createLoraNode(loras) {
  const jsonWidget = {
    name: "lora_list_json",
    value: JSON.stringify(loras),
  };
  const dirtyCalls = [];
  return {
    _loraData: normalizeLoraList(loras),
    widgets: [jsonWidget],
    setDirtyCanvas(...args) {
      dirtyCalls.push(args);
    },
    jsonWidget,
    dirtyCalls,
  };
}

test("legacy LoRA entries default to enabled", () => {
  const [lora] = normalizeLoraList([
    { name: "styles/example.safetensors", strength_model: 0.75 },
  ]);

  assert.deepEqual(lora, {
    name: "styles/example.safetensors",
    strength_model: 0.75,
    enabled: true,
  });
});

test("enabling and disabling a LoRA updates serialized state without losing settings", () => {
  const node = createLoraNode([
    { name: "first.safetensors", strength_model: 0.65, enabled: true },
    { name: "second.safetensors", strength_model: -0.4, enabled: true },
  ]);

  assert.equal(setLoraEnabled(node, "first.safetensors", false), true);
  assert.deepEqual(JSON.parse(node.jsonWidget.value), [
    { name: "first.safetensors", strength_model: 0.65, enabled: false },
    { name: "second.safetensors", strength_model: -0.4, enabled: true },
  ]);

  assert.equal(setLoraEnabled(node, "first.safetensors", true), true);
  assert.deepEqual(JSON.parse(node.jsonWidget.value), [
    { name: "first.safetensors", strength_model: 0.65, enabled: true },
    { name: "second.safetensors", strength_model: -0.4, enabled: true },
  ]);
  assert.deepEqual(node.dirtyCalls, [[true, true], [true, true]]);
});

test("serialized disabled state is restored from workflow JSON", () => {
  const restored = parseLoraJsonValue(JSON.stringify([
    { name: "disabled.safetensors", strength_model: 1.2, enabled: false },
  ]));

  assert.deepEqual(restored, [
    { name: "disabled.safetensors", strength_model: 1.2, enabled: false },
  ]);
});

test("LoRA toggle label is localized", () => {
  assert.equal(translateForLanguage("en", "Enable LoRA"), "Enable LoRA");
  assert.equal(translateForLanguage("zh", "Enable LoRA"), "启用 LoRA");
});
