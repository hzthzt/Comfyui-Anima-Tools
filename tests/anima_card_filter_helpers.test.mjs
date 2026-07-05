import test from "node:test";
import assert from "node:assert/strict";

test("card collection sidebar order puts favorites and custom groups before all", async () => {
  const { getCardSidebarCollectionOrder } = await import("../js/anima_card_filter_helpers.js?case=collection-order");

  assert.deepEqual(
    getCardSidebarCollectionOrder([
      { id: "group_custom", name: "Custom" },
      { id: "default", name: "Favorites" },
      { id: "group_extra", name: "Extra" },
    ]),
    ["default", "group_custom", "group_extra", "all"],
  );
});

test("card sidebar puts all after collections and before category buttons", async () => {
  const { getCardSidebarSectionOrder } = await import("../js/anima_card_filter_helpers.js?case=section-order");

  assert.deepEqual(
    getCardSidebarSectionOrder([
      { id: "default", name: "Favorites" },
      { id: "group_custom", name: "Custom" },
    ]),
    ["collections", "default", "group_custom", "all", "categories"],
  );
});

test("card category filters only apply to all collections", async () => {
  const {
    getNextCategorizedCardFilters,
    normalizeCategorizedCardFilters,
    shouldApplyCardCategoryFilters,
  } = await import("../js/anima_card_filter_helpers.js?case=category-scope");

  const categorized = getNextCategorizedCardFilters(
    { collection: "group_custom", categories: new Set(["old"]) },
    "new",
  );
  assert.equal(categorized.collection, "all");
  assert.deepEqual(Array.from(categorized.categories), ["new"]);
  assert.equal(shouldApplyCardCategoryFilters(categorized), true);

  const collection = getNextCategorizedCardFilters(categorized, null, {
    collection: "group_custom",
  });
  assert.equal(collection.collection, "group_custom");
  assert.deepEqual(Array.from(collection.categories), []);
  assert.equal(shouldApplyCardCategoryFilters(collection), false);

  const restored = normalizeCategorizedCardFilters({
    collection: "default",
    categories: ["legacy"],
  });
  assert.equal(restored.collection, "default");
  assert.deepEqual(Array.from(restored.categories), []);
});

test("custom item create card appears in favorite collections but not all", async () => {
  const { shouldShowCustomItemCreateCard } = await import("../js/anima_card_filter_helpers.js?case=custom-create-card");

  assert.equal(shouldShowCustomItemCreateCard("default"), true);
  assert.equal(shouldShowCustomItemCreateCard("group_custom"), true);
  assert.equal(shouldShowCustomItemCreateCard("all"), false);
  assert.equal(shouldShowCustomItemCreateCard(null), false);
});
