import { app } from "../../scripts/app.js";
import { t } from "./i18n.js";
import { createPromoLinks } from "./anima_promo_links.js";
import { addSelectorActionRow, installSelectorExecutionSync } from "./anima_selector_random.js";
import { buildSelectorTagSidebarEntries, createSelectorTagView, createTagGroupSidebarSection, ensureSelectorTagFavorites } from "./anima_selector_tag_library.js";
import { createConfiguredCatalogProvider, resolveSelectorTagCatalog } from "./anima_selector_tag_catalog_config.js";
import { applySelectorTagsToWidget, createSelectorTagManager, createSelectorTagManagerFooter, ensureTagEditor, isTaggedAnimaNode } from "./anima_tag_editor.js";

const PROMPT_TAG_SELECTOR_NODES = new Set([
    "AnimaPromptTagSelector",
    "AnimaPromptTagSelectorPlus",
    "AnimaPromptTagSelectorTagged",
    "AnimaPromptTagSelectorPlusTagged",
    "AnimaPromptPlus",
    "AnimaPromptPlusTagged",
]);

const THEME = {
    accent: "#0ea5e9",
    accentSoft: "rgba(14, 165, 233, 0.15)",
    accentText: "#7dd3fc",
};

app.registerExtension({
    name: "AnimaPromptTagSelector.extension",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!PROMPT_TAG_SELECTOR_NODES.has(nodeData.name)) return;
        nodeType.prototype.__animaNodeClass = nodeData.name;
        installSelectorExecutionSync(nodeType);

        const origOnCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            origOnCreated?.apply(this, arguments);

            const promptTagsWidget = this.widgets.find(w => w.name === "prompt_tags");
            if (!promptTagsWidget) return;
            if (isTaggedAnimaNode(this)) ensureTagEditor(this, promptTagsWidget, { label: t("Prompt Tags") });
            addSelectorActionRow(this, {
                section: "prompt",
                label: t("Open Prompt Tag Selector"),
                accent: THEME.accent,
                accentText: THEME.accentText,
                onOpen: async () => openPromptTagSelectorModal(this, promptTagsWidget),
            });
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = origOnConfigure?.apply(this, arguments);
            const promptTagsWidget = this.widgets?.find(w => w.name === "prompt_tags");
            if (promptTagsWidget && isTaggedAnimaNode(this)) ensureTagEditor(this, promptTagsWidget, { label: t("Prompt Tags") });
            return result;
        };
    }
});

function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.innerText = text;
    return el;
}

async function openPromptTagSelectorModal(node, tagsWidget) {
    let favoritesConfig = {
        prompt: {
            groups: [{ id: "default", name: t("My Favorites"), isSystem: true }],
            items: [],
        }
    };

    try {
        const response = await fetch("/anima-tools/favorites");
        if (response.ok) favoritesConfig = await response.json();
    } catch (e) {
        console.error("[Anima Tools] Failed to load prompt tag favorites", e);
    }

    if (!favoritesConfig.prompt) {
        favoritesConfig.prompt = {
            groups: [{ id: "default", name: t("My Favorites"), isSystem: true }],
            items: [],
        };
    }
    const tagFavorites = ensureSelectorTagFavorites(favoritesConfig.prompt, t("Favorite Tags"));

    async function saveFavorites() {
        favoritesConfig.prompt.tagGroups = tagFavorites.tagGroups;
        favoritesConfig.prompt.tagItems = tagFavorites.tagItems;

        try {
            const response = await fetch("/anima-tools/favorites", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(favoritesConfig),
            });
            if (!response.ok) throw new Error(await response.text());
            return true;
        } catch (e) {
            console.error("[Anima Tools] Failed to save prompt tag favorites", e);
            alert(t("Failed to save favorites"));
            return false;
        }
    }

    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
        @keyframes animaPromptTagFadeIn {
            from { opacity: 0; transform: scale(0.97) translateY(8px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .anima-prompt-tag-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .anima-prompt-tag-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .anima-prompt-tag-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius: 999px; }
        .anima-prompt-tag-btn {
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 10px;
            background: rgba(255,255,255,0.06);
            color: #e5e7eb;
            min-height: 34px;
            padding: 0 12px;
            cursor: pointer;
            font-weight: 800;
        }
        .anima-prompt-tag-btn:hover {
            border-color: rgba(125,211,252,0.42);
            background: ${THEME.accentSoft};
            color: #fff;
        }
        .anima-prompt-tag-input {
            background: rgba(15,23,42,0.82);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 10px;
            color: #e5e7eb;
            min-height: 38px;
            padding: 0 12px;
            outline: none;
            box-sizing: border-box;
        }
        .anima-prompt-tag-sidebar .sidebar-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 9px 10px;
            border-radius: 10px;
            color: #cbd5e1;
            cursor: pointer;
            font-size: 12px;
            font-weight: 700;
        }
        .anima-prompt-tag-sidebar .sidebar-item:hover,
        .anima-prompt-tag-sidebar .sidebar-item.active {
            background: rgba(14,165,233,0.16);
            color: #fff;
        }
    `;
    document.head.appendChild(styleSheet);

    const overlay = createEl("div");
    overlay.id = "anima-prompt-tag-selector-overlay";
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(10, 10, 15, 0.74);
        backdrop-filter: blur(15px);
        -webkit-backdrop-filter: blur(15px);
        color: #f3f4f6;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    `;

    const container = createEl("div");
    container.style.cssText = `
        width: 92vw;
        max-width: 1180px;
        height: 88vh;
        background: #171718;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 25px 60px rgba(0,0,0,0.58);
        display: flex;
        flex-direction: column;
        animation: animaPromptTagFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    `;

    function closeModal() {
        overlay.remove();
        styleSheet.remove();
    }

    overlay.onclick = event => {
        if (event.target === overlay) closeModal();
    };

    const header = createEl("div");
    header.style.cssText = `
        padding: 18px 22px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        background: linear-gradient(180deg, rgba(14,165,233,0.08), rgba(23,23,24,0));
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
    `;

    const titleWrap = createEl("div");
    titleWrap.style.cssText = "min-width: 240px;";
    const title = createEl("div", null, t("Anima Prompt Tag Selector"));
    title.style.cssText = "font-size: 20px; font-weight: 850; color: #fff; line-height: 1.2;";
    const subtitle = createEl("div", null, t("Browse composition, camera, color, quality, style, and restricted prompt tags."));
    subtitle.style.cssText = "font-size: 12.5px; color: #a1a1aa; margin-top: 5px;";
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const searchInput = createEl("input", "anima-prompt-tag-input");
    searchInput.type = "search";
    searchInput.placeholder = t("Search prompt tags...");
    searchInput.style.cssText += "flex: 1; min-width: 260px;";

    const closeBtn = createEl("button", "anima-prompt-tag-btn", t("Cancel"));
    closeBtn.onclick = () => closeModal();

    const headerActions = createEl("div");
    headerActions.style.cssText = "display:flex;align-items:center;justify-content:flex-end;gap:10px;flex:0 0 auto;";
    headerActions.appendChild(createPromoLinks({ accentColor: THEME.accentText }));
    headerActions.appendChild(closeBtn);

    header.appendChild(titleWrap);
    header.appendChild(searchInput);
    header.appendChild(headerActions);
    container.appendChild(header);

    const body = createEl("div");
    body.style.cssText = "display:grid;grid-template-columns:240px 1fr;flex:1;min-height:0;";

    const sidebar = createEl("div", "anima-prompt-tag-sidebar anima-prompt-tag-scrollbar");
    sidebar.style.cssText = `
        border-right: 1px solid rgba(255,255,255,0.06);
        background: rgba(10,10,14,0.34);
        overflow: auto;
        padding: 12px 10px;
        box-sizing: border-box;
    `;

    const main = createEl("div");
    main.style.cssText = "min-width:0;min-height:0;display:flex;flex-direction:column;";

    const catalogProvider = createConfiguredCatalogProvider(await resolveSelectorTagCatalog("prompt"));
    let activeTagFilter = { type: "group", groupId: "all" };

    function getTagCatalog() {
        return catalogProvider.get();
    }

    function openTextInputModal(titleText, placeholder, defaultValue, onSubmit) {
        const dialog = createEl("div");
        dialog.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 100000;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const content = createEl("div");
        content.style.cssText = `
            width: 90%;
            max-width: 400px;
            background: #1c1c1e;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            gap: 16px;
        `;

        const titleNode = createEl("div", null, titleText);
        titleNode.style.cssText = "font-size:16px;font-weight:700;color:#fff;";

        const input = createEl("input");
        input.type = "text";
        input.value = defaultValue || "";
        input.placeholder = placeholder || "";
        input.style.cssText = `
            background: #2c2c2e;
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 8px;
            padding: 10px 12px;
            color: #fff;
            font-size: 14px;
            outline: none;
            box-sizing: border-box;
        `;

        const buttons = createEl("div");
        buttons.style.cssText = "display:flex;justify-content:flex-end;gap:12px;margin-top:8px;";

        const cancel = createEl("button", null, t("Cancel"));
        cancel.type = "button";
        cancel.style.cssText = "background:transparent;border:none;color:#9ca3af;padding:8px 16px;cursor:pointer;font-size:14px;";
        cancel.onclick = () => dialog.remove();

        const confirm = createEl("button", null, t("OK"));
        confirm.type = "button";
        confirm.style.cssText = `background:${THEME.accent};border:none;color:#fff;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;`;
        confirm.onclick = async () => {
            const value = input.value.trim();
            if (!value) return;
            confirm.disabled = true;
            const prevText = confirm.innerText;
            confirm.innerText = t("Saving...");
            const shouldClose = await onSubmit?.(value);
            confirm.disabled = false;
            confirm.innerText = prevText;
            if (shouldClose !== false) dialog.remove();
        };

        input.onkeydown = event => {
            if (event.key === "Enter") confirm.click();
            if (event.key === "Escape") dialog.remove();
        };

        buttons.appendChild(cancel);
        buttons.appendChild(confirm);
        content.appendChild(titleNode);
        content.appendChild(input);
        content.appendChild(buttons);
        dialog.appendChild(content);
        document.body.appendChild(dialog);
        input.focus();
        input.select();
    }

    function showToast(text) {
        const toast = createEl("div", null, text);
        toast.style.cssText = `
            position: fixed;
            left: 50%;
            bottom: 32px;
            transform: translateX(-50%);
            z-index: 100000;
            background: rgba(15,23,42,0.92);
            color: #f8fafc;
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 999px;
            padding: 10px 14px;
            font-size: 12px;
            font-weight: 800;
            box-shadow: 0 14px 36px rgba(0,0,0,0.4);
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1300);
    }

    const selectorTagView = createSelectorTagView({
        section: "prompt",
        tagFavorites,
        catalogProvider: getTagCatalog,
        saveTagFavorites: async () => {
            await saveFavorites();
            renderSidebar();
        },
        applyTag: tag => {
            applySelectorTagsToWidget(node, tagsWidget, tag, { source: "selector", mode: "append" });
            node.triggerSlot?.(0);
            showToast(t("Applied: {text}", { text: tag }));
        },
        requestTextInput: ({ title, placeholder, defaultValue, onSubmit }) => {
            openTextInputModal(title, placeholder, defaultValue || "", onSubmit);
        },
        onTagFilterChange: filter => {
            activeTagFilter = filter;
            renderSidebar();
        },
        t,
    });
    selectorTagView.element.style.display = "flex";
    selectorTagView.element.style.padding = "20px 22px";
    selectorTagView.element.style.boxSizing = "border-box";

    main.appendChild(selectorTagView.element);
    body.appendChild(sidebar);
    body.appendChild(main);
    container.appendChild(body);

    const footerBtns = createSelectorTagManagerFooter(10);
    if (isTaggedAnimaNode(node)) {
        const footer = createEl("div");
        footer.style.cssText = `
            padding: 14px 22px;
            border-top: 1px solid rgba(255,255,255,0.06);
            background: rgba(18,18,24,0.68);
        `;
        footerBtns.appendChild(createSelectorTagManager(node, tagsWidget, { label: t("Selected Tags") }).element);
        footer.appendChild(footerBtns);
        container.appendChild(footer);
    }

    overlay.appendChild(container);
    document.body.appendChild(overlay);

    function renderSidebar() {
        sidebar.innerHTML = "";
        sidebar.appendChild(createTagGroupSidebarSection({
            tagFavorites,
            activeGroupId: activeTagFilter.type === "group" ? activeTagFilter.groupId : "all",
            onSave: saveFavorites,
            onFilterChange: filter => {
                activeTagFilter = filter;
                selectorTagView.setFilter(filter);
                renderSidebar();
            },
            requestTextInput: ({ title, placeholder, defaultValue, onSubmit }) => {
                openTextInputModal(title, placeholder, defaultValue || "", onSubmit);
            },
            t,
        }));

        const entries = buildSelectorTagSidebarEntries(getTagCatalog(), tagFavorites, { t });
        entries
            .filter(entry => entry.type === "category")
            .forEach(entry => {
                const item = createEl("div", "sidebar-item", entry.displayLabel || entry.label);
                item.classList.toggle("active", activeTagFilter.type === "category" && activeTagFilter.categoryId === entry.categoryId);
                item.onclick = () => {
                    activeTagFilter = { type: "category", categoryId: entry.categoryId };
                    selectorTagView.setFilter(activeTagFilter);
                    renderSidebar();
                };
                sidebar.appendChild(item);
            });
    }

    searchInput.addEventListener("input", () => selectorTagView.setQuery(searchInput.value));
    renderSidebar();
    selectorTagView.setFilter(activeTagFilter);
    selectorTagView.setVisible(true);
    searchInput.focus();
}
