import {
    buildConfiguredSelectorTagCatalog,
} from "./anima_selector_tag_library.js";

export const SELECTOR_TAG_CATALOG_BASE_URL = new URL("./config/selector_tag_catalog/", import.meta.url);

const sectionCatalogPromises = new Map();

export function getSelectorTagCatalogSectionUrl(section) {
    const safeSection = String(section || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    return new URL(`${safeSection}.json`, SELECTOR_TAG_CATALOG_BASE_URL);
}

export async function loadSelectorTagCatalogConfig(section, fetchImpl = globalThis.fetch) {
    const sectionKey = String(section || "").trim().toLowerCase();
    if (!sectionKey) return null;
    if (!sectionCatalogPromises.has(sectionKey)) {
        sectionCatalogPromises.set(sectionKey, (async () => {
            if (typeof fetchImpl !== "function") return null;
            try {
                const response = await fetchImpl(getSelectorTagCatalogSectionUrl(sectionKey));
                if (!response?.ok) return null;
                const config = await response.json();
                return config && typeof config === "object" ? config : null;
            } catch (error) {
                console.warn(`[Anima Tools] Failed to load selector tag catalog config for ${sectionKey}`, error);
                return null;
            }
        })());
    }
    return sectionCatalogPromises.get(sectionKey);
}

export function resetSelectorTagCatalogConfigCache() {
    sectionCatalogPromises.clear();
}

export async function resolveSelectorTagCatalog(section, options = {}) {
    const sectionConfig = await loadSelectorTagCatalogConfig(section, options.fetchImpl);
    if (sectionConfig && typeof sectionConfig === "object" && Array.isArray(sectionConfig.tags)) {
        return buildConfiguredSelectorTagCatalog(sectionConfig);
    }
    return [];
}

export function createConfiguredCatalogProvider(initialCatalog) {
    let catalog = initialCatalog;
    return {
        get() {
            return Array.isArray(catalog) ? catalog : [];
        },
        set(nextCatalog) {
            catalog = Array.isArray(nextCatalog) ? nextCatalog : [];
        },
    };
}

export function classifyCharacterTag(tag) {
    const value = String(tag || "").trim().toLowerCase();
    if (!value) return "uncategorized";
    if (/\beyes?\b|heterochromia|pupils?|sclera/.test(value)) return "eyes";
    if (/\b(ribbon|bow|hair ornament|hairclip|hairband|hat|cap|headdress|headwear|crown|horn ornament|earrings?|glasses|mask|halo|bell|brooch|pendant|necklace)\b/.test(value)) return "decoration";
    if (/\bhair\b|twintails?|ponytail|braid|bangs|ahoge|hime cut|sidelocks?|drill hair/.test(value)) return "hair";
    if (/dress|shirt|skirt|uniform|serafuku|kimono|sleeves?|gloves?|thighhighs?|pantyhose|jacket|coat|hoodie|leotard|bodysuit|swimsuit|boots?|shoes?|collar|tie|ribbon|cape|apron|armor|pants|shorts|bra|panties/.test(value)) return "clothing";
    if (/ears?|tail|wings?|horns?|fangs?|teeth|skin|breasts?|thighs?|navel|cleavage|scar|mole|tattoo|muscular|abs|monster|animal|fox|cat|wolf|rabbit|dragon|demon|elf|robot|pokemon|no humans|1girl|1boy/.test(value)) return "body-traits";
    return "character-name";
}
