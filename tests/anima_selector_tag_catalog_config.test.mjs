import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("resolveSelectorTagCatalog loads only the requested selector section file", async () => {
  const {
    createConfiguredCatalogProvider,
    resetSelectorTagCatalogConfigCache,
    resolveSelectorTagCatalog,
  } = await import("../js/anima_selector_tag_catalog_config.js?case=section-file");

  resetSelectorTagCatalogConfigCache();
  const requestedUrls = [];
  const catalog = await resolveSelectorTagCatalog("character", {
    fetchImpl: async url => {
      requestedUrls.push(String(url));
      return {
        ok: true,
        json: async () => ({
          version: 1,
          section: "character",
          categories: [],
          tags: [{ tag: "blue eyes", categoryIds: [] }],
        }),
      };
    },
  });
  const provider = createConfiguredCatalogProvider(catalog);

  assert.equal(requestedUrls.length, 1);
  assert.match(requestedUrls[0], /selector_tag_catalog\/character\.json$/);
  assert.doesNotMatch(requestedUrls[0], /selector_tag_catalog\.json$/);
  assert.deepEqual(catalog.map(item => item.tag), ["blue eyes"]);
  assert.deepEqual(provider.get().map(item => item.tag), ["blue eyes"]);
});

test("resolveSelectorTagCatalog returns an empty catalog when a section file is unavailable", async () => {
  const {
    resetSelectorTagCatalogConfigCache,
    resolveSelectorTagCatalog,
  } = await import("../js/anima_selector_tag_catalog_config.js?case=no-fallback");

  resetSelectorTagCatalogConfigCache();
  const catalog = await resolveSelectorTagCatalog("pose", {
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });

  assert.deepEqual(catalog, []);
});

test("prompt tag catalog keeps converted composition and restricted categories", async () => {
  const config = JSON.parse(await readFile(
    new URL("../js/config/selector_tag_catalog/prompt.json", import.meta.url),
    "utf8",
  ));

  const categoryIds = new Set(config.categories.map(category => category.id));
  const tags = new Set(config.tags.map(item => item.tag));

  assert.equal(config.section, "prompt");
  assert.ok(categoryIds.has("composition"));
  assert.ok(categoryIds.has("perspective"));
  assert.ok(categoryIds.has("r18-t1"));
  assert.ok(categoryIds.has("r18-t2"));
  assert.ok(config.tags.length > 500);
  assert.ok(tags.has("dutch angle"));
  assert.ok(tags.has("rating explicit"));
});
