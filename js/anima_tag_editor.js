import { t } from "./i18n.js";
import {
    createSelectorTagFavoriteFromText,
    ensureSelectorTagFavorites,
    getSelectorTagLabelParts,
    getSelectorTagFavorite,
    normalizeSelectorTagKey,
    toggleSelectorTagFavorite,
} from "./anima_selector_tag_library.js";
import { resolveSelectorTagCatalog } from "./anima_selector_tag_catalog_config.js";
import {
    applyFavoritesOperation,
    createFavoritesOperation,
    FavoritesConflictError,
    getFavoritesStore,
} from "./anima_favorites_store.js";

export const TAG_STATE_PROPERTY = "anima_prompt_tag_state";
const DEFAULT_HISTORY_LIMIT = 20;
const DEFAULT_APPLY_MODE = "replace";

function normalizeTagKey(value) {
    return String(value || "")
        .replace(/^_raw_:/, "")
        .trim()
        .toLowerCase();
}

export function splitTagText(value) {
    if (Array.isArray(value)) {
        return value.flatMap(splitTagText);
    }
    if (value && typeof value === "object") {
        return tagsFromState(value) || [];
    }

    const text = String(value || "").trim();
    if (text.startsWith("{")) {
        try {
            const payload = JSON.parse(text);
            const tags = tagsFromState(payload);
            if (tags !== null || hasTagState(payload)) return tags || [];
            if (typeof payload?._resolved_prompt === "string") return splitTagText(payload._resolved_prompt);
            return [];
        } catch (_) {}
    }

    return text
        .replace(/\r/g, ",")
        .replace(/\n/g, ",")
        .split(",")
        .map(part => part.trim())
        .filter(Boolean);
}

function hasTagState(value) {
    return Boolean(value && typeof value === "object" && (
        Array.isArray(value.tags)
        || (value.fields && typeof value.fields === "object")
    ));
}

function tagsFromState(value) {
    if (!value || typeof value !== "object") return null;
    const tags = Array.isArray(value.tags)
        ? value.tags
        : Object.values(value.fields || {}).flatMap(field => Array.isArray(field?.tags) ? field.tags : []);
    if (!Array.isArray(value.tags) && !(value.fields && typeof value.fields === "object")) return null;

    return tags
        .filter(item => item && typeof item === "object" ? item.enabled !== false : true)
        .map(item => {
            if (item && typeof item === "object") {
                return String(item.text ?? item.tag ?? item.value ?? item.name ?? "").trim();
            }
            return String(item || "").trim();
        })
        .filter(Boolean);
}

function getWidget(node, fieldName) {
    return node?.widgets?.find(widget => widget?.name === fieldName);
}

function getTagState(node) {
    node.properties = node.properties || {};
    const existing = node.properties[TAG_STATE_PROPERTY];
    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
        existing.version = existing.version || 1;
        existing.fields = existing.fields && typeof existing.fields === "object" ? existing.fields : {};
        return existing;
    }
    node.properties[TAG_STATE_PROPERTY] = { version: 1, fields: {} };
    return node.properties[TAG_STATE_PROPERTY];
}

export function getTagFieldState(node, fieldName, widget) {
    const state = getTagState(node);
    const fields = state.fields;
    let field = fields[fieldName];
    if (!field || typeof field !== "object" || Array.isArray(field)) {
        field = {};
        fields[fieldName] = field;
    }

    field.tags = Array.isArray(field.tags) ? field.tags : [];
    field.history = Array.isArray(field.history) ? field.history : [];
    field.applyMode = field.applyMode === "append" ? "append" : DEFAULT_APPLY_MODE;
    field.historyLimit = Number.isFinite(Number(field.historyLimit))
        ? Math.max(1, Number(field.historyLimit))
        : DEFAULT_HISTORY_LIMIT;

    if (field.tags.length === 0 && field.history.length === 0 && widget?.value) {
        field.tags = uniqueTags(splitTagText(widget.value).map(text => ({
            text,
            enabled: true,
            source: "legacy",
        })));
    }

    pruneHistory(field);
    return field;
}

function tagText(tag) {
    if (tag && typeof tag === "object") {
        return String(tag.text ?? tag.tag ?? tag.value ?? tag.name ?? "").trim();
    }
    return String(tag || "").trim();
}

function uniqueTags(tags) {
    const seen = new Set();
    const result = [];
    for (const tag of tags) {
        const text = String(tag?.text || "").trim();
        const key = normalizeTagKey(text);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push({
            text,
            enabled: tag?.enabled !== false,
            source: tag?.source || "manual",
        });
    }
    return result;
}

function pruneHistory(field) {
    const seen = new Set();
    field.history = field.history
        .filter(item => item && String(item.text || "").trim())
        .filter(item => {
            const key = normalizeTagKey(item.text);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => Number(b.removedAt || 0) - Number(a.removedAt || 0))
        .slice(0, field.historyLimit || DEFAULT_HISTORY_LIMIT);
}

function enabledText(field) {
    const parts = field.tags
        .filter(tag => tag?.enabled !== false)
        .map(tag => String(tag.text || "").trim())
        .filter(Boolean);
    return parts.length ? `${parts.join(", ")}, ` : "";
}

function setWidgetText(widget, value, options = {}) {
    if (!widget) return;
    const text = String(value || "");
    widget.__animaTagSyncingText = true;
    widget.value = text;
    if (widget.inputEl) {
        widget.inputEl.value = text;
        widget.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
    widget.__animaTagSyncingText = false;
    if (options.notify !== false) {
        widget.callback?.(text);
    }
}

function refreshNode(node) {
    node?.setDirtyCanvas?.(true, true);
    node?.graph?.setDirtyCanvas?.(true, true);
    window?.app?.graph?.setDirtyCanvas?.(true, true);
    window?.app?.canvas?.setDirtyCanvas?.(true, true);
    window?.app?.canvas?.setDirty?.(true, true);
}

function syncField(node, fieldName, widget, options = {}) {
    const field = getTagFieldState(node, fieldName, widget);
    setWidgetText(widget, enabledText(field), options);
    refreshEditor(node, fieldName);
    refreshSelectorManagers(node, fieldName);
    refreshNode(node);
}

function clearFieldTags(node, fieldName, widget, syncOptions = {}) {
    const field = getTagFieldState(node, fieldName, widget);
    field.tags = [];
    setWidgetText(widget, "", { ...syncOptions, notify: false });
    syncField(node, fieldName, widget, syncOptions);
}

function refreshEditor(node, fieldName) {
    const editors = node?._animaTagEditors;
    const editor = editors?.[fieldName];
    editor?.render?.();
}

function refreshSelectorManagers(node, fieldName) {
    const managers = node?._animaSelectorTagManagers?.[fieldName];
    if (!Array.isArray(managers)) return;
    const activeManagers = managers.filter(manager => manager?.element?.isConnected !== false);
    node._animaSelectorTagManagers[fieldName] = activeManagers;
    activeManagers.forEach(manager => manager?.render?.());
}

function addToHistory(field, text) {
    const clean = String(text || "").trim();
    const key = normalizeTagKey(clean);
    if (!key) return;
    field.history = field.history.filter(item => normalizeTagKey(item.text) !== key);
    field.history.unshift({ text: clean, removedAt: Date.now() });
    pruneHistory(field);
}

function removeHistoryKeys(field, keys) {
    if (!keys?.size || !Array.isArray(field.history)) return;
    field.history = field.history.filter(item => !keys.has(normalizeTagKey(item.text)));
}

function applyIncomingTags(field, incomingTags, mode, source) {
    const incoming = uniqueTags(incomingTags.map(text => ({
        text,
        enabled: true,
        source,
    })));
    if (mode === "append") {
        const byKey = new Map(field.tags.map(tag => [normalizeTagKey(tag.text), { ...tag }]));
        for (const tag of incoming) {
            const key = normalizeTagKey(tag.text);
            const existing = byKey.get(key);
            byKey.set(key, existing ? { ...existing, text: existing.text || tag.text, enabled: true, source } : tag);
        }
        field.tags = uniqueTags(Array.from(byKey.values()));
        return;
    }

    const incomingKeys = new Set(incoming.map(tag => normalizeTagKey(tag.text)));
    const disabledPrevious = field.tags
        .filter(tag => !incomingKeys.has(normalizeTagKey(tag.text)))
        .map(tag => ({
            ...tag,
            enabled: false,
        }));
    field.tags = uniqueTags([...incoming, ...disabledPrevious]);
}

function reconcileTextTags(field, incomingTags) {
    const incoming = uniqueTags(incomingTags.map(text => ({
        text,
        enabled: true,
        source: "text",
    })));
    const active = field.tags.filter(tag => tag?.enabled !== false);
    const disabled = field.tags.filter(tag => tag?.enabled === false);
    const oldKeys = active.map(tag => normalizeTagKey(tagText(tag)));
    const newKeys = incoming.map(tag => normalizeTagKey(tag.text));

    // Match unchanged tags first, then treat paired gaps as edits at the same position.
    const lengths = Array.from({ length: active.length + 1 }, () => Array(incoming.length + 1).fill(0));
    for (let oldIndex = active.length - 1; oldIndex >= 0; oldIndex -= 1) {
        for (let newIndex = incoming.length - 1; newIndex >= 0; newIndex -= 1) {
            lengths[oldIndex][newIndex] = oldKeys[oldIndex] === newKeys[newIndex]
                ? lengths[oldIndex + 1][newIndex + 1] + 1
                : Math.max(lengths[oldIndex + 1][newIndex], lengths[oldIndex][newIndex + 1]);
        }
    }

    const matches = [];
    let oldIndex = 0;
    let newIndex = 0;
    while (oldIndex < active.length && newIndex < incoming.length) {
        if (oldKeys[oldIndex] === newKeys[newIndex]) {
            matches.push([oldIndex, newIndex]);
            oldIndex += 1;
            newIndex += 1;
        } else if (lengths[oldIndex + 1][newIndex] >= lengths[oldIndex][newIndex + 1]) {
            oldIndex += 1;
        } else {
            newIndex += 1;
        }
    }

    const enabled = [];
    const removed = [];
    let oldCursor = 0;
    let newCursor = 0;
    const reconcileGap = (oldEnd, newEnd) => {
        const editCount = Math.min(oldEnd - oldCursor, newEnd - newCursor);
        for (let offset = 0; offset < editCount; offset += 1) {
            enabled.push({
                ...active[oldCursor + offset],
                text: incoming[newCursor + offset].text,
                enabled: true,
                source: "text",
            });
        }
        enabled.push(...incoming.slice(newCursor + editCount, newEnd));
        removed.push(...active.slice(oldCursor + editCount, oldEnd).map(tag => ({ ...tag, enabled: false })));
    };

    for (const [matchedOld, matchedNew] of matches) {
        reconcileGap(matchedOld, matchedNew);
        enabled.push({ ...active[matchedOld], text: incoming[matchedNew].text, enabled: true });
        oldCursor = matchedOld + 1;
        newCursor = matchedNew + 1;
    }
    reconcileGap(active.length, incoming.length);
    field.tags = uniqueTags([...enabled, ...disabled, ...removed]);
}

function mergeSelectorManagerTags(field, incomingTags, source) {
    const incoming = uniqueTags(incomingTags.map(text => ({
        text,
        enabled: true,
        source,
    })));
    const suppressedKeys = new Set([
        ...field.tags
            .filter(tag => tag?.enabled === false)
            .map(tag => normalizeTagKey(tagText(tag))),
    ].filter(Boolean));
    const incomingKeys = new Set(incoming.map(tag => normalizeTagKey(tag.text)));
    removeHistoryKeys(field, incomingKeys);
    const result = incoming.filter(tag => !suppressedKeys.has(normalizeTagKey(tag.text)));
    for (const tag of field.tags) {
        const key = normalizeTagKey(tagText(tag));
        if (!key) continue;
        if (tag?.enabled === false) {
            result.push({ ...tag });
            continue;
        }
        if (incomingKeys.has(key)) continue;
        if (tag.source === "manual" || tag.source === "history") {
            result.push({ ...tag });
        }
    }
    field.tags = uniqueTags(result);
}

function appendSelectorManagerTags(field, incomingTags, source) {
    const incoming = uniqueTags(incomingTags.map(text => ({
        text,
        enabled: true,
        source,
    })));
    const suppressedKeys = new Set([
        ...field.tags
            .filter(tag => tag?.enabled === false)
            .map(tag => normalizeTagKey(tagText(tag))),
    ].filter(Boolean));
    const incomingKeys = new Set(incoming.map(tag => normalizeTagKey(tag.text)));
    removeHistoryKeys(field, incomingKeys);
    const byKey = new Map(field.tags.map(tag => [normalizeTagKey(tagText(tag)), { ...tag }]));
    for (const tag of incoming) {
        const key = normalizeTagKey(tag.text);
        if (!key || suppressedKeys.has(key)) continue;
        const existing = byKey.get(key);
        byKey.set(key, existing ? { ...existing, text: existing.text || tag.text, enabled: true, source } : tag);
    }
    field.tags = uniqueTags(Array.from(byKey.values()));
}

function syncFieldFromWidget(node, fieldName, widget) {
    if (!node || !widget || widget.__animaTagSyncingText) return;
    const field = getTagFieldState(node, fieldName, widget);
    reconcileTextTags(field, splitTagText(widget.value));
    refreshEditor(node, fieldName);
    refreshSelectorManagers(node, fieldName);
    refreshNode(node);
}

function attachWidgetTextSync(node, fieldName, widget) {
    if (!widget || widget.__animaTagTextSyncInstalled) return;
    widget.__animaTagTextSyncInstalled = true;
    const sync = () => syncFieldFromWidget(node, fieldName, widget);
    widget.__animaTagTextSyncHandler = sync;
    widget.inputEl?.addEventListener?.("input", sync);
    widget.inputEl?.addEventListener?.("change", sync);
}

export function applyTagsToWidget(node, widgetOrName, value, options = {}) {
    const widget = typeof widgetOrName === "string" ? getWidget(node, widgetOrName) : widgetOrName;
    if (!node || !widget) return;
    const fieldName = options.fieldName || widget.name;
    const field = getTagFieldState(node, fieldName, widget);
    const mode = options.mode || field.applyMode || DEFAULT_APPLY_MODE;
    const source = options.source || "selector";
    applyIncomingTags(field, splitTagText(value), mode, source);
    syncField(node, fieldName, widget, { notify: false });
}

export function setPlainWidgetText(node, widgetOrName, value, options = {}) {
    const widget = typeof widgetOrName === "string" ? getWidget(node, widgetOrName) : widgetOrName;
    if (!widget) return;
    setWidgetText(widget, value, options);
    refreshNode(node);
}

export function isTaggedAnimaNode(nodeOrName) {
    const name = typeof nodeOrName === "string"
        ? nodeOrName
        : (nodeOrName?.__animaNodeClass || nodeOrName?.comfyClass || nodeOrName?.type || nodeOrName?.constructor?.name || "");
    return /^Anima.*Tagged$/.test(String(name || ""));
}

export function writeTagsToWidget(node, widgetOrName, value, options = {}) {
    if (isTaggedAnimaNode(node)) {
        applyTagsToWidget(node, widgetOrName, value, options);
    } else {
        setPlainWidgetText(node, widgetOrName, value, options);
    }
}

export function writeSelectorTagsToWidget(node, widgetOrName, value, options = {}) {
    if (!isTaggedAnimaNode(node)) {
        setPlainWidgetText(node, widgetOrName, value, options);
        return;
    }

    const widget = typeof widgetOrName === "string" ? getWidget(node, widgetOrName) : widgetOrName;
    if (!node || !widget) return;
    const fieldName = options.fieldName || widget.name;
    const field = getTagFieldState(node, fieldName, widget);
    const mode = options.mode || field.applyMode || DEFAULT_APPLY_MODE;
    const source = options.source || "selector";
    if (mode === "append") {
        appendSelectorManagerTags(field, splitTagText(value), source);
    } else {
        mergeSelectorManagerTags(field, splitTagText(value), source);
    }
    syncField(node, fieldName, widget, { notify: false });
}

export function applySelectorTagsToWidget(node, widgetOrName, value, options = {}) {
    if (!isTaggedAnimaNode(node)) {
        const widget = typeof widgetOrName === "string" ? getWidget(node, widgetOrName) : widgetOrName;
        const existing = splitTagText(widget?.value || "");
        const incoming = splitTagText(value);
        const seen = new Set();
        const merged = [];
        [...existing, ...incoming].forEach(text => {
            const key = normalizeTagKey(text);
            if (!key || seen.has(key)) return;
            seen.add(key);
            merged.push(text);
        });
        setPlainWidgetText(node, widget, merged.length ? `${merged.join(", ")}, ` : "", options);
        return;
    }

    const widget = typeof widgetOrName === "string" ? getWidget(node, widgetOrName) : widgetOrName;
    if (!node || !widget) return;
    const fieldName = options.fieldName || widget.name;
    const field = getTagFieldState(node, fieldName, widget);
    const incomingTags = splitTagText(value);
    removeHistoryKeys(field, new Set(incomingTags.map(text => normalizeTagKey(text)).filter(Boolean)));
    const mode = options.mode || field.applyMode || DEFAULT_APPLY_MODE;
    const source = options.source || "selector";
    if (mode === "append") {
        applyIncomingTags(field, incomingTags, "append", source);
    } else {
        field.tags = uniqueTags(incomingTags.map(text => ({
            text,
            enabled: true,
            source,
        })));
    }
    syncField(node, fieldName, widget, { notify: false });
}

export function setTagApplyMode(node, fieldName, mode) {
    const field = getTagFieldState(node, fieldName, getWidget(node, fieldName));
    field.applyMode = mode === "append" ? "append" : DEFAULT_APPLY_MODE;
    refreshEditor(node, fieldName);
    refreshSelectorManagers(node, fieldName);
}

function getEditorHeight(field, width = 340) {
    const chipCount = Math.max(1, field.tags.length);
    const columns = Math.max(1, Math.floor((Math.max(260, width) - 28) / 116));
    const rows = Math.ceil(chipCount / columns);
    const historyRows = field.history.length > 0 ? Math.min(2, Math.ceil(field.history.length / columns)) : 0;
    return 116 + rows * 44 + historyRows * 26;
}

function measureEditorHeight(root, field, width = 340) {
    const estimate = getEditorHeight(field, width);
    const measured = root ? Math.ceil(root.scrollHeight || root.offsetHeight || 0) + 4 : 0;
    return Math.max(40, estimate, measured);
}

function editorContentWidth(node, width) {
    const raw = Number(width || node?.size?.[0] || 340);
    return Math.max(220, raw - 20);
}

function setElementWidth(element, width) {
    if (!element?.style) return;
    const value = `${Math.max(1, Math.floor(width))}px`;
    element.style.setProperty("width", value, "important");
    element.style.setProperty("max-width", value, "important");
    element.style.setProperty("box-sizing", "border-box", "important");
}

function applyEditorWidth(node, domWidget, root, width) {
    const contentWidth = editorContentWidth(node, width);
    setElementWidth(root, contentWidth);
    [domWidget?.element, domWidget?.inputEl, domWidget?.el, domWidget?.container].forEach(el => setElementWidth(el, contentWidth));
    return contentWidth;
}

function setEditorComputeSize(node, fieldName, widget, domWidget, root) {
    domWidget.computeSize = width => {
        const contentWidth = applyEditorWidth(node, domWidget, root, width);
        const field = getTagFieldState(node, fieldName, widget);
        const height = measureEditorHeight(root, field, contentWidth);
        domWidget.computedHeight = height;
        return [width, height];
    };
}

function updateEditorSize(node, fieldName, widget, root) {
    const domWidget = node?._animaTagEditors?.[fieldName]?.widget;
    if (!domWidget) return;
    const contentWidth = applyEditorWidth(node, domWidget, root, node.size?.[0] || 340);
    const height = measureEditorHeight(root, getTagFieldState(node, fieldName, widget), contentWidth);
    const previous = Number(domWidget.computedHeight || 0);
    domWidget.computedHeight = height;
    if (Math.abs(previous - height) > 1) {
        refreshNode(node);
    }
}

function scheduleEditorSizeUpdate(node, fieldName, widget, root) {
    requestAnimationFrame(() => updateEditorSize(node, fieldName, widget, root));
}

function updateAllTagEditorSizes(node) {
    const editors = node?._animaTagEditors;
    if (!editors || typeof editors !== "object") return;
    Object.values(editors).forEach(editor => editor?.updateSize?.());
}

function installNodeResizeSync(node) {
    if (!node || node.__animaTagResizeSyncInstalled) return;
    node.__animaTagResizeSyncInstalled = true;
    const originalSetSize = node.setSize;
    if (typeof originalSetSize === "function") {
        node.setSize = function () {
            const result = originalSetSize.apply(this, arguments);
            requestAnimationFrame(() => updateAllTagEditorSizes(this));
            return result;
        };
    }
}

export function ensureTagEditor(node, widgetOrName, config = {}) {
    const widget = typeof widgetOrName === "string" ? getWidget(node, widgetOrName) : widgetOrName;
    if (!node || !widget || typeof node.addDOMWidget !== "function") return null;
    const fieldName = config.fieldName || widget.name;
    installNodeResizeSync(node);
    node._animaTagEditors = node._animaTagEditors || {};
    const existingEditor = node._animaTagEditors[fieldName];
    if (existingEditor && node.widgets?.includes(existingEditor.widget)) {
        existingEditor.render?.();
        return existingEditor.widget;
    }
    if (existingEditor) {
        delete node._animaTagEditors[fieldName];
    }

    const field = getTagFieldState(node, fieldName, widget);
    attachWidgetTextSync(node, fieldName, widget);

    const root = document.createElement("div");
    root.className = "anima-tag-editor";
    root.style.cssText = `
        width: 100%;
        box-sizing: border-box;
        padding: 6px 0 8px;
        color: #e5e7eb;
        font: 12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: auto;
    `;

    const domWidget = node.addDOMWidget(`anima_tag_editor_${fieldName}`, "div", root, {
        serialize: false,
        hideOnZoom: false,
        getValue: () => "",
        setValue: () => {},
    });
    domWidget.__animaTagEditor = true;
    domWidget.__animaTagFieldName = fieldName;
    domWidget.serialize = false;
    setEditorComputeSize(node, fieldName, widget, domWidget, root);
    domWidget.computedHeight = measureEditorHeight(root, field, node.size?.[0] || 340);

    const editor = {
        widget: domWidget,
        render: () => renderTagEditor(node, widget, fieldName, root, config),
        updateSize: () => updateEditorSize(node, fieldName, widget, root),
    };
    node._animaTagEditors[fieldName] = editor;
    connectNodeTagFavorites(editor, config, fieldName);
    if (typeof ResizeObserver !== "undefined") {
        editor.resizeObserver = new ResizeObserver(() => editor.updateSize?.());
        editor.resizeObserver.observe(root);
        requestAnimationFrame(() => {
            if (root.parentElement) editor.resizeObserver.observe(root.parentElement);
        });
    }
    editor.render();
    syncField(node, fieldName, widget);
    return domWidget;
}

const TAG_FAVORITE_SECTION_BY_FIELD = Object.freeze({
    artist_tags: "artist",
    character_tags: "character",
    clothing_tags: "clothing",
    background_tags: "background",
    pose_tags: "pose",
    prompt_tags: "prompt",
});

function connectNodeTagFavorites(editor, config, fieldName) {
    const section = config.favoriteSection ?? TAG_FAVORITE_SECTION_BY_FIELD[fieldName];
    if (!section || config.tagFavorites) return;

    const store = config.favoritesStore || getFavoritesStore(section);
    let favoritesConfig = null;
    const applySnapshot = snapshot => {
        favoritesConfig = snapshot.favorites;
        config.tagFavorites = ensureSelectorTagFavorites(favoritesConfig, t("Favorite Tags"));
        editor.render();
    };
    editor.unsubscribeFavorites = store.subscribe(applySnapshot);
    if (typeof config.catalogProvider !== "function") {
        let catalog = [];
        config.catalogProvider = () => catalog;
        resolveSelectorTagCatalog(section).then(nextCatalog => {
            catalog = nextCatalog;
            editor.render();
        }).catch(error => {
            console.warn(`[Anima Tools] Failed to load ${section} tag labels`, error);
        });
    }
    config.saveTagFavorites = async () => {
        if (!favoritesConfig) return false;
        const favoritesOperation = createFavoritesOperation(store.getSnapshot().favorites, favoritesConfig);
        try {
            await store.mutate(draft => applyFavoritesOperation(draft, favoritesOperation));
            return true;
        } catch (error) {
            if (error instanceof FavoritesConflictError) {
                globalThis.alert?.(t("Favorites changed elsewhere. Latest favorites were loaded."));
                return false;
            }
            console.error(`[Anima Tools] Failed to save ${section} tag favorites`, error);
            globalThis.alert?.(t("Failed to save favorites"));
            return false;
        }
    };

    store.load().catch(error => {
        console.error(`[Anima Tools] Failed to load ${section} tag favorites`, error);
    });
}

function stopNodeDrag(event) {
    event.stopPropagation();
}

function buttonStyle(active = false) {
    return `
        min-width: 0;
        height: 24px;
        border-radius: 6px;
        border: 1px solid ${active ? "rgba(251,191,36,0.55)" : "rgba(255,255,255,0.12)"};
        background: ${active ? "rgba(251,191,36,0.16)" : "rgba(255,255,255,0.055)"};
        color: ${active ? "#fbbf24" : "#d1d5db"};
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
    `;
}

function iconButton(label, title, color = "#d1d5db") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.style.cssText = `
        border: 0;
        background: transparent;
        color: ${color};
        padding: 0 2px;
        font-size: 12px;
        font-weight: 900;
        cursor: pointer;
        line-height: 1;
    `;
    button.addEventListener("pointerdown", stopNodeDrag);
    button.addEventListener("mousedown", stopNodeDrag);
    return button;
}

function createChipDragContext(container) {
    const indicator = document.createElement("div");
    indicator.className = "anima-tag-drop-indicator";
    indicator.style.cssText = `
        position: absolute;
        display: none;
        width: 2px;
        height: 24px;
        border-radius: 1px;
        background: #38bdf8;
        pointer-events: none;
        z-index: 1;
    `;
    container.appendChild(indicator);
    return { container, indicator };
}

function clearChipDropIndicator(dragContext) {
    if (dragContext?.indicator) dragContext.indicator.style.display = "none";
}

function showChipDropIndicator(dragContext, chip, insertAfter) {
    const { container, indicator } = dragContext;
    if (!container || !indicator) return;
    const chipRect = chip.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const gap = Number.parseFloat(window.getComputedStyle(container).columnGap) || 0;
    const boundary = insertAfter ? chipRect.right + gap / 2 : chipRect.left - gap / 2;
    indicator.style.left = `${boundary - containerRect.left + container.scrollLeft - 1}px`;
    indicator.style.top = `${chipRect.top - containerRect.top + container.scrollTop}px`;
    indicator.style.height = `${chipRect.height || 24}px`;
    indicator.style.display = "block";
}

function createChip(node, widget, fieldName, tag, disabled = false, syncOptions = {}, dragContext = {}, chipOptions = {}) {
    const chip = document.createElement("span");
    chip.draggable = true;
    chip.title = t("Drag Tag to Reorder");
    chip.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 5px;
        max-width: 100%;
        min-height: 38px;
        padding: 3px 7px;
        box-sizing: border-box;
        border-radius: 7px;
        border: 1px solid ${disabled ? "rgba(156,163,175,0.22)" : "rgba(14,165,233,0.38)"};
        background: ${disabled ? "rgba(107,114,128,0.13)" : "rgba(14,165,233,0.13)"};
        color: ${disabled ? "#9ca3af" : "#e0f2fe"};
        text-decoration: ${disabled ? "line-through" : "none"};
        overflow: hidden;
        cursor: grab;
        user-select: none;
    `;

    const tagValue = tagText(tag);
    const catalog = typeof chipOptions.catalogProvider === "function"
        ? chipOptions.catalogProvider()
        : chipOptions.catalog || [];
    const catalogItem = catalog.find(item => normalizeSelectorTagKey(item?.tag) === normalizeSelectorTagKey(tagValue));
    const labels = getSelectorTagLabelParts(catalogItem, tagValue);
    const label = document.createElement("span");
    label.title = [labels.primary, labels.secondary].filter(Boolean).join("\n");
    label.style.cssText = "display:flex;flex-direction:column;justify-content:center;min-width:0;line-height:1.15;";
    const primary = document.createElement("span");
    primary.className = "anima-tag-chip-primary";
    primary.textContent = labels.primary;
    primary.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;";
    label.appendChild(primary);
    if (labels.secondary) {
        const secondary = document.createElement("span");
        secondary.className = "anima-tag-chip-zh";
        secondary.textContent = labels.secondary;
        secondary.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;color:#94a3b8;font-size:10px;";
        label.appendChild(secondary);
    }
    chip.appendChild(label);

    if (chipOptions.tagFavorites) {
        const groupId = chipOptions.favoriteGroupId || "default";
        const favorite = iconButton("", "", "#facc15");
        favorite.dataset.tagFavoriteToggle = "true";
        favorite.style.fontSize = "14px";
        favorite.style.padding = "0";

        const updateFavorite = () => {
            const info = getSelectorTagFavorite(chipOptions.tagFavorites, tagText(tag));
            const active = Boolean(info?.groupIds?.includes(groupId));
            favorite.textContent = active ? "★" : "☆";
            favorite.title = t(active ? "Unfavorite Tag" : "Favorite Tag");
            favorite.setAttribute("aria-pressed", String(active));
        };
        updateFavorite();

        favorite.addEventListener("click", async event => {
            stopNodeDrag(event);
            if (favorite.disabled) return;

            const text = tagText(tag);
            const info = getSelectorTagFavorite(chipOptions.tagFavorites, text);
            if (info?.groupIds?.includes(groupId)) {
                toggleSelectorTagFavorite(chipOptions.tagFavorites, { tag: text }, groupId);
            } else {
                const catalog = typeof chipOptions.catalogProvider === "function"
                    ? chipOptions.catalogProvider()
                    : chipOptions.catalog || [];
                createSelectorTagFavoriteFromText(chipOptions.tagFavorites, catalog, text, groupId);
            }
            updateFavorite();
            favorite.disabled = true;
            try {
                await chipOptions.saveTagFavorites?.();
                chipOptions.onTagFavoritesChanged?.();
            } finally {
                favorite.disabled = false;
                updateFavorite();
            }
        });
        chip.appendChild(favorite);
    }

    chip.addEventListener("dragstart", event => {
        if (event.target?.closest?.("button")) {
            event.preventDefault();
            return;
        }
        event.stopPropagation();
        dragContext.draggedTag = tag;
        dragContext.dropChip = null;
        chip.style.opacity = "0.5";
        chip.style.cursor = "grabbing";
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", tagText(tag));
        }
    });

    chip.addEventListener("dragover", event => {
        if (!dragContext.draggedTag || dragContext.draggedTag === tag) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        const rect = chip.getBoundingClientRect();
        const insertAfter = event.clientX >= rect.left + rect.width / 2;
        dragContext.dropChip = chip;
        dragContext.insertAfter = insertAfter;
        showChipDropIndicator(dragContext, chip, insertAfter);
    });

    chip.addEventListener("dragleave", event => {
        event.stopPropagation();
        if (dragContext.dropChip !== chip) return;
        clearChipDropIndicator(dragContext);
        dragContext.dropChip = null;
    });

    chip.addEventListener("drop", event => {
        if (!dragContext.draggedTag || dragContext.draggedTag === tag) return;
        event.preventDefault();
        event.stopPropagation();
        const field = getTagFieldState(node, fieldName, widget);
        const fromIndex = field.tags.indexOf(dragContext.draggedTag);
        const targetIndex = field.tags.indexOf(tag);
        if (fromIndex < 0 || targetIndex < 0) return;
        const [movedTag] = field.tags.splice(fromIndex, 1);
        const adjustedTarget = field.tags.indexOf(tag);
        const insertionIndex = adjustedTarget + (dragContext.insertAfter ? 1 : 0);
        field.tags.splice(insertionIndex, 0, movedTag);
        dragContext.draggedTag = null;
        clearChipDropIndicator(dragContext);
        dragContext.dropChip = null;
        syncField(node, fieldName, widget, syncOptions);
    });

    chip.addEventListener("dragend", event => {
        event.stopPropagation();
        chip.style.opacity = "";
        chip.style.cursor = "grab";
        clearChipDropIndicator(dragContext);
        dragContext.draggedTag = null;
        dragContext.dropChip = null;
    });

    chip.addEventListener("dblclick", event => {
        if (event.target?.closest?.("button")) return;
        stopNodeDrag(event);
        tag.enabled = tag.enabled === false;
        syncField(node, fieldName, widget, syncOptions);
    });

    const remove = iconButton("x", t("Delete Tag"), "#fca5a5");
    remove.addEventListener("click", event => {
        stopNodeDrag(event);
        const field = getTagFieldState(node, fieldName, widget);
        const key = normalizeTagKey(tagText(tag));
        field.tags = field.tags.filter(item => normalizeTagKey(tagText(item)) !== key);
        addToHistory(field, tagText(tag));
        syncField(node, fieldName, widget, syncOptions);
    });
    chip.appendChild(remove);

    return chip;
}

function renderTagEditor(node, widget, fieldName, root, config) {
    const field = getTagFieldState(node, fieldName, widget);
    root.innerHTML = "";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";

    const title = document.createElement("div");
    title.textContent = config.label || widget.name || t("Prompt Tags");
    title.style.cssText = "flex:1;min-width:0;color:#f3f4f6;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    header.appendChild(title);
    header.appendChild(createApplyModeControl(node, fieldName));
    const clearTags = document.createElement("button");
    clearTags.type = "button";
    clearTags.textContent = t("Clear Tags");
    clearTags.style.cssText = buttonStyle(false);
    clearTags.addEventListener("pointerdown", stopNodeDrag);
    clearTags.addEventListener("mousedown", stopNodeDrag);
    clearTags.addEventListener("click", event => {
        stopNodeDrag(event);
        clearFieldTags(node, fieldName, widget);
    });
    header.appendChild(clearTags);
    root.appendChild(header);

    const chips = document.createElement("div");
    chips.style.cssText = "position:relative;display:flex;flex-wrap:wrap;gap:6px;min-height:26px;margin-bottom:7px;";
    const dragContext = createChipDragContext(chips);
    field.tags.forEach(tag => chips.appendChild(createChip(
        node,
        widget,
        fieldName,
        tag,
        tag.enabled === false,
        {},
        dragContext,
        config,
    )));
    if (field.tags.length === 0) {
        const empty = document.createElement("span");
        empty.textContent = t("No tags yet");
        empty.style.cssText = "color:#6b7280;font-size:11px;padding:5px 0;";
        chips.appendChild(empty);
    }
    root.appendChild(chips);

    const inputRow = document.createElement("div");
    inputRow.style.cssText = "display:flex;gap:6px;margin-bottom:7px;";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = t("Add tag...");
    input.style.cssText = `
        flex: 1 1 auto;
        min-width: 0;
        height: 26px;
        border-radius: 7px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.2);
        color: #f9fafb;
        padding: 0 8px;
        outline: none;
        box-sizing: border-box;
    `;
    input.addEventListener("pointerdown", event => event.stopPropagation());
    input.addEventListener("mousedown", event => event.stopPropagation());
    input.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        applyTagsToWidget(node, widget, input.value, { mode: "append", source: "manual" });
        input.value = "";
    });
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.textContent = t("Add");
    addButton.style.cssText = buttonStyle(false);
    addButton.addEventListener("pointerdown", stopNodeDrag);
    addButton.addEventListener("mousedown", stopNodeDrag);
    addButton.addEventListener("click", event => {
        stopNodeDrag(event);
        applyTagsToWidget(node, widget, input.value, { mode: "append", source: "manual" });
        input.value = "";
    });
    inputRow.appendChild(input);
    inputRow.appendChild(addButton);
    root.appendChild(inputRow);

    if (field.history.length > 0) {
        const historyHeader = document.createElement("div");
        historyHeader.style.cssText = "display:flex;align-items:center;gap:6px;margin:2px 0 5px;";
        const historyTitle = document.createElement("div");
        historyTitle.textContent = `${t("History")} (${field.history.length}/${field.historyLimit})`;
        historyTitle.style.cssText = "flex:1;color:#9ca3af;font-size:11px;font-weight:800;";
        const clear = document.createElement("button");
        clear.type = "button";
        clear.textContent = t("Clear History");
        clear.style.cssText = buttonStyle(false);
        clear.addEventListener("pointerdown", stopNodeDrag);
        clear.addEventListener("mousedown", stopNodeDrag);
        clear.addEventListener("click", event => {
            stopNodeDrag(event);
            field.history = [];
            syncField(node, fieldName, widget);
        });
        historyHeader.appendChild(historyTitle);
        historyHeader.appendChild(clear);
        root.appendChild(historyHeader);

        const history = document.createElement("div");
        history.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;";
        field.history.forEach(item => {
            const restore = document.createElement("button");
            restore.type = "button";
            restore.textContent = item.text;
            restore.title = t("Restore Tag");
            restore.style.cssText = `
                max-width: 100%;
                height: 22px;
                border-radius: 6px;
                border: 1px solid rgba(156,163,175,0.18);
                background: rgba(255,255,255,0.035);
                color: #9ca3af;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                cursor: pointer;
                font-size: 11px;
            `;
            restore.addEventListener("pointerdown", stopNodeDrag);
            restore.addEventListener("mousedown", stopNodeDrag);
            restore.addEventListener("click", event => {
                stopNodeDrag(event);
                field.history = field.history.filter(historyItem => historyItem !== item);
                applyIncomingTags(field, [item.text], "append", "history");
                syncField(node, fieldName, widget);
            });
            history.appendChild(restore);
        });
        root.appendChild(history);
    }

    const domWidget = node._animaTagEditors?.[fieldName]?.widget;
    if (domWidget) {
        setEditorComputeSize(node, fieldName, widget, domWidget, root);
        scheduleEditorSizeUpdate(node, fieldName, widget, root);
    }
}

export function createApplyModeControl(node, fieldName) {
    const field = getTagFieldState(node, fieldName, getWidget(node, fieldName));
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:4px;flex:0 0 auto;";

    const makeButton = (mode, label) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.style.cssText = buttonStyle(field.applyMode === mode);
        button.addEventListener("pointerdown", stopNodeDrag);
        button.addEventListener("mousedown", stopNodeDrag);
        button.addEventListener("click", event => {
            stopNodeDrag(event);
            setTagApplyMode(node, fieldName, mode);
        });
        return button;
    };

    row.appendChild(makeButton("replace", t("Replace")));
    row.appendChild(makeButton("append", t("Append")));
    return row;
}

export function createSelectorApplyModeControl(node, widgetOrName) {
    const widget = typeof widgetOrName === "string" ? getWidget(node, widgetOrName) : widgetOrName;
    const fieldName = widget?.name || String(widgetOrName || "");
    const control = createApplyModeControl(node, fieldName);
    control.title = t("Selector Apply Mode");
    control.style.cssText += "align-items:center;";
    return control;
}

export function getActiveSelectorTagText(node, widgetOrName) {
    if (!node || !widgetOrName) return "";
    const widget = typeof widgetOrName === "string" ? getWidget(node, widgetOrName) : widgetOrName;
    const fieldName = widget?.name || String(widgetOrName || "");
    if (!fieldName) return "";

    const field = getTagFieldState(node, fieldName, widget);
    const parts = field.tags
        .filter(tag => tag?.enabled !== false)
        .map(tag => tagText(tag))
        .filter(Boolean);
    return parts.length ? `${parts.join(", ")}, ` : "";
}

export function createSelectorTagManagerFooter(gap = 12) {
    const row = document.createElement("div");
    row.style.cssText = `
        display: flex;
        align-items: stretch;
        gap: ${gap}px;
        flex: 1 1 auto;
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
    `;
    return row;
}

export function createSelectorTagManager(node, widgetOrName, config = {}) {
    const widget = typeof widgetOrName === "string" ? getWidget(node, widgetOrName) : widgetOrName;
    const fieldName = config.fieldName || widget?.name || String(widgetOrName || "");
    const element = document.createElement("div");
    element.className = "anima-selector-tag-manager";
    element.style.cssText = `
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        width: 100%;
        box-sizing: border-box;
        gap: 7px;
        min-width: 0;
        color: #e5e7eb;
        font: 12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: auto;
    `;

    const manager = {
        element,
        render: () => renderSelectorTagManager(node, widget, fieldName, element, config),
    };

    if (node && fieldName) {
        node._animaSelectorTagManagers = node._animaSelectorTagManagers || {};
        node._animaSelectorTagManagers[fieldName] = node._animaSelectorTagManagers[fieldName] || [];
        if (!node._animaSelectorTagManagers[fieldName].includes(manager)) {
            node._animaSelectorTagManagers[fieldName].push(manager);
        }
    }

    getTagFieldState(node, fieldName, widget);
    attachWidgetTextSync(node, fieldName, widget);
    manager.render();
    return manager;
}

function renderSelectorTagManager(node, widget, fieldName, root, config = {}) {
    const field = getTagFieldState(node, fieldName, widget);
    root.innerHTML = "";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:8px;min-width:0;width:100%;box-sizing:border-box;";

    const title = document.createElement("div");
    title.textContent = config.label || t("Selected Tags");
    title.style.cssText = "flex:1 1 auto;min-width:0;color:#f3f4f6;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    header.appendChild(title);
    header.appendChild(createApplyModeControl(node, fieldName));
    const clearTags = document.createElement("button");
    clearTags.type = "button";
    clearTags.textContent = t("Clear Tags");
    clearTags.style.cssText = buttonStyle(false);
    clearTags.addEventListener("pointerdown", stopNodeDrag);
    clearTags.addEventListener("mousedown", stopNodeDrag);
    clearTags.addEventListener("click", event => {
        stopNodeDrag(event);
        clearFieldTags(node, fieldName, widget, { notify: false });
    });
    header.appendChild(clearTags);
    root.appendChild(header);

    const chips = document.createElement("div");
    chips.style.cssText = "position:relative;display:flex;flex-wrap:wrap;gap:6px;min-height:26px;width:100%;box-sizing:border-box;";
    const dragContext = createChipDragContext(chips);
    field.tags.forEach(tag => chips.appendChild(createChip(
        node,
        widget,
        fieldName,
        tag,
        tag.enabled === false,
        { notify: false },
        dragContext,
        config,
    )));
    if (field.tags.length === 0) {
        const empty = document.createElement("span");
        empty.textContent = t("No tags yet");
        empty.style.cssText = "color:#6b7280;font-size:11px;padding:5px 0;";
        chips.appendChild(empty);
    }
    root.appendChild(chips);

    const inputRow = document.createElement("div");
    inputRow.style.cssText = "display:flex;gap:6px;min-width:0;width:100%;box-sizing:border-box;";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = t("Add tag...");
    input.style.cssText = `
        flex: 1 1 auto;
        min-width: 0;
        height: 26px;
        border-radius: 7px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.2);
        color: #f9fafb;
        padding: 0 8px;
        outline: none;
        box-sizing: border-box;
    `;
    input.addEventListener("pointerdown", event => event.stopPropagation());
    input.addEventListener("mousedown", event => event.stopPropagation());
    input.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        applyTagsToWidget(node, widget, input.value, { mode: "append", source: "manual" });
        input.value = "";
    });

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.textContent = t("Add");
    addButton.style.cssText = buttonStyle(false);
    addButton.addEventListener("pointerdown", stopNodeDrag);
    addButton.addEventListener("mousedown", stopNodeDrag);
    addButton.addEventListener("click", event => {
        stopNodeDrag(event);
        applyTagsToWidget(node, widget, input.value, { mode: "append", source: "manual" });
        input.value = "";
    });

    inputRow.appendChild(input);
    inputRow.appendChild(addButton);
    root.appendChild(inputRow);

    if (field.history.length === 0) return;

    const historyHeader = document.createElement("div");
    historyHeader.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0;width:100%;box-sizing:border-box;";

    const historyTitle = document.createElement("div");
    historyTitle.textContent = `${t("History")} (${field.history.length}/${field.historyLimit})`;
    historyTitle.style.cssText = "flex:1 1 auto;min-width:0;color:#9ca3af;font-size:11px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = t("Clear History");
    clear.style.cssText = buttonStyle(false);
    clear.addEventListener("pointerdown", stopNodeDrag);
    clear.addEventListener("mousedown", stopNodeDrag);
    clear.addEventListener("click", event => {
        stopNodeDrag(event);
        field.history = [];
        syncField(node, fieldName, widget);
    });

    historyHeader.appendChild(historyTitle);
    historyHeader.appendChild(clear);
    root.appendChild(historyHeader);

    const history = document.createElement("div");
    history.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;min-width:0;width:100%;box-sizing:border-box;";
    field.history.forEach(item => {
        const restore = document.createElement("button");
        restore.type = "button";
        restore.textContent = item.text;
        restore.title = t("Restore Tag");
        restore.style.cssText = `
            max-width: 100%;
            height: 22px;
            border-radius: 6px;
            border: 1px solid rgba(156,163,175,0.18);
            background: rgba(255,255,255,0.035);
            color: #9ca3af;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            cursor: pointer;
            font-size: 11px;
        `;
        restore.addEventListener("pointerdown", stopNodeDrag);
        restore.addEventListener("mousedown", stopNodeDrag);
        restore.addEventListener("click", event => {
            stopNodeDrag(event);
            field.history = field.history.filter(historyItem => historyItem !== item);
            applyIncomingTags(field, [item.text], "append", "history");
            syncField(node, fieldName, widget);
        });
        history.appendChild(restore);
    });
    root.appendChild(history);
}
