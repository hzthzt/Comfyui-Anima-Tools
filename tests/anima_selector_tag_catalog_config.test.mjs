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

test("daily generation additions keep complete bilingual metadata and valid categories", async () => {
  const promptConfig = JSON.parse(await readFile(
    new URL("../js/config/selector_tag_catalog/prompt.json", import.meta.url),
    "utf8",
  ));
  const poseConfig = JSON.parse(await readFile(
    new URL("../js/config/selector_tag_catalog/pose.json", import.meta.url),
    "utf8",
  ));
  const expectedPromptTags = [
    "rule of thirds", "leading lines", "golden ratio", "centered composition",
    "asymmetrical composition", "triangular composition", "frame within a frame",
    "foreground framing", "layered composition", "balanced composition", "eye-level shot",
    "high-angle shot", "low-angle shot", "over-the-shoulder shot", "top-down view",
    "worm's-eye view", "wide-angle lens", "telephoto lens", "macro lens", "24mm lens",
    "35mm lens", "50mm lens", "85mm lens", "135mm lens", "shallow depth of field",
    "deep depth of field", "window light", "blue hour", "overcast lighting",
    "rembrandt lighting", "butterfly lighting", "split lighting", "key light", "fill light",
    "global illumination", "subsurface scattering", "skin texture", "skin pores",
    "fabric texture", "metal texture", "physically based rendering", "raw photo", "DSLR",
    "HDR", "sharp focus", "cinematic color grading", "AAA game cinematic",
    "anime game key visual", "visual novel event CG", "subtle smile", "gentle smile",
    "serious expression", "surprised expression", "determined expression", "awkward smile",
    "relaxed expression", "extra fingers", "extra limbs", "fused fingers", "deformed hands",
    "cropped feet", "cropped head", "duplicate character", "oversaturated", "plastic skin",
    "awkward pose", "broken perspective",
  ];
  const expectedPoseTags = [
    "cooking", "reading", "drinking", "eating", "using phone", "taking a selfie", "typing",
    "working", "commuting", "sleeping", "talking", "driving", "opening a door",
    "opening a window", "pouring water", "writing", "washing vegetables", "carrying groceries",
    "serving food", "tying shoelaces", "brushing hair", "applying makeup", "petting an animal",
    "having a conversation", "group photo", "family portrait", "friends together", "hugging",
    "whispering", "dynamic battle pose", "drawing a sword", "casting a spell",
    "dodging an attack", "blocking with a shield", "mid-air attack", "reaching out a hand",
    "holding an injured companion", "standing among ruins", "walking through falling snow",
    "touching a glowing artifact", "sitting on a throne", "raising a weapon",
    "confronting an enemy",
  ];

  for (const [config, expectedTags] of [
    [promptConfig, expectedPromptTags],
    [poseConfig, expectedPoseTags],
  ]) {
    const categoryIds = new Set(config.categories.map(category => category.id));
    const byTag = new Map(config.tags.map(item => [item.tag, item]));
    assert.equal(byTag.size, config.tags.length, `${config.section} tags must be unique`);

    for (const tag of expectedTags) {
      const item = byTag.get(tag);
      assert.ok(item, `${config.section} is missing ${tag}`);
      assert.ok(item.label?.zh?.trim(), `${tag} is missing a Chinese label`);
      assert.ok(item.meaning?.zh?.trim(), `${tag} is missing a Chinese meaning`);
      assert.ok(item.categoryIds.length > 0, `${tag} is missing a category`);
      assert.ok(item.categoryIds.every(categoryId => categoryIds.has(categoryId)), `${tag} has an invalid category`);
    }
  }
});

test("pose tag catalog provides Chinese metadata for every tag", async () => {
  const config = JSON.parse(await readFile(
    new URL("../js/config/selector_tag_catalog/pose.json", import.meta.url),
    "utf8",
  ));

  for (const item of config.tags) {
    assert.ok(item.label?.zh?.trim(), `${item.tag} is missing a Chinese label`);
    assert.ok(item.meaning?.zh?.trim(), `${item.tag} is missing a Chinese meaning`);
  }
});
