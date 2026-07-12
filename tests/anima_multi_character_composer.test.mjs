import test from "node:test";
import assert from "node:assert/strict";

const moduleUrl = new URL("../js/anima_multi_character_composer.js", import.meta.url);

test("multi-character layouts are filtered by active character count", async () => {
  const { getLayoutsForCount, normalizeLayoutForCount } = await import(`${moduleUrl}?case=layouts`);
  assert.deepEqual(getLayoutsForCount(2), ["two_side_by_side", "two_facing", "two_depth"]);
  assert.deepEqual(getLayoutsForCount(3), ["three_row", "three_triangle", "three_center_focus"]);
  assert.deepEqual(getLayoutsForCount(4), ["four_row", "four_two_rows", "four_cluster"]);
  assert.equal(normalizeLayoutForCount(3, "two_facing"), "three_row");
  assert.equal(normalizeLayoutForCount(4, "four_cluster"), "four_cluster");
});

test("multi-character slot visibility follows the selected count", async () => {
  const { getVisibleSlotNumbers } = await import(`${moduleUrl}?case=slots`);
  assert.deepEqual(getVisibleSlotNumbers(2), [1, 2]);
  assert.deepEqual(getVisibleSlotNumbers(3), [1, 2, 3]);
  assert.deepEqual(getVisibleSlotNumbers(4), [1, 2, 3, 4]);
});

test("every layout exposes one stable preview box per character", async () => {
  const { getLayoutBoxes, LAYOUTS_BY_COUNT } = await import(`${moduleUrl}?case=boxes`);
  for (const [count, layouts] of Object.entries(LAYOUTS_BY_COUNT)) {
    for (const layout of layouts) {
      const boxes = getLayoutBoxes(layout);
      assert.equal(boxes.length, Number(count));
      for (const box of boxes) {
        assert.ok(box.x >= 0 && box.y >= 0);
        assert.ok(box.x + box.width <= 100);
        assert.ok(box.y + box.height <= 100);
      }
    }
  }
});

test("temporarily hidden character widgets keep their saved values", async () => {
  const { setWidgetVisible } = await import(`${moduleUrl}?case=preserve-values`);
  const widget = {
    type: "text",
    value: "saved character description",
    hidden: false,
    disabled: false,
    computeSize: () => [240, 30],
    draw: () => {},
  };

  setWidgetVisible(widget, false);
  assert.equal(widget.type, "hidden");
  assert.equal(widget.serialize, true);
  assert.equal(widget.value, "saved character description");

  setWidgetVisible(widget, true);
  assert.equal(widget.type, "text");
  assert.equal(widget.hidden, false);
  assert.equal(widget.disabled, false);
  assert.equal(widget.value, "saved character description");
});
