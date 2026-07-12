import { app } from "../../scripts/app.js";
import { t } from "./i18n.js";

export const LAYOUTS_BY_COUNT = Object.freeze({
    2: ["two_side_by_side", "two_facing", "two_depth"],
    3: ["three_row", "three_triangle", "three_center_focus"],
    4: ["four_row", "four_two_rows", "four_cluster"],
});

const BOXES_BY_LAYOUT = Object.freeze({
    two_side_by_side: [{ x: 12, y: 22, width: 30, height: 64 }, { x: 58, y: 22, width: 30, height: 64 }],
    two_facing: [{ x: 14, y: 22, width: 30, height: 64 }, { x: 56, y: 22, width: 30, height: 64 }],
    two_depth: [{ x: 13, y: 30, width: 38, height: 62 }, { x: 61, y: 10, width: 25, height: 46 }],
    three_row: [{ x: 5, y: 28, width: 26, height: 58 }, { x: 37, y: 20, width: 26, height: 66 }, { x: 69, y: 28, width: 26, height: 58 }],
    three_triangle: [{ x: 9, y: 8, width: 26, height: 50 }, { x: 37, y: 38, width: 26, height: 56 }, { x: 65, y: 8, width: 26, height: 50 }],
    three_center_focus: [{ x: 5, y: 32, width: 25, height: 54 }, { x: 34, y: 10, width: 32, height: 78 }, { x: 70, y: 32, width: 25, height: 54 }],
    four_row: [{ x: 3, y: 30, width: 21, height: 56 }, { x: 27, y: 22, width: 21, height: 64 }, { x: 52, y: 22, width: 21, height: 64 }, { x: 76, y: 30, width: 21, height: 56 }],
    four_two_rows: [{ x: 16, y: 42, width: 28, height: 52 }, { x: 56, y: 42, width: 28, height: 52 }, { x: 8, y: 5, width: 24, height: 44 }, { x: 68, y: 5, width: 24, height: 44 }],
    four_cluster: [{ x: 4, y: 34, width: 25, height: 54 }, { x: 26, y: 14, width: 27, height: 68 }, { x: 47, y: 14, width: 27, height: 68 }, { x: 71, y: 34, width: 25, height: 54 }],
});

export function getLayoutsForCount(count) {
    return [...(LAYOUTS_BY_COUNT[Number(count)] || LAYOUTS_BY_COUNT[2])];
}

export function normalizeLayoutForCount(count, layout) {
    const layouts = getLayoutsForCount(count);
    return layouts.includes(layout) ? layout : layouts[0];
}

export function getVisibleSlotNumbers(count) {
    const safeCount = Math.min(4, Math.max(2, Number(count) || 2));
    return Array.from({ length: safeCount }, (_, index) => index + 1);
}

export function getLayoutBoxes(layout) {
    return (BOXES_BY_LAYOUT[layout] || BOXES_BY_LAYOUT.two_side_by_side).map(box => ({ ...box }));
}

app.registerExtension({
    name: "AnimaMultiCharacterComposer.extension",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "AnimaMultiCharacterComposer") return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            originalCreated?.apply(this, arguments);
            setupMultiCharacterNode(this);
        };

        const originalConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = originalConfigure?.apply(this, arguments);
            setupMultiCharacterNode(this);
            return result;
        };
    },
});

function setupMultiCharacterNode(node) {
    if (!node?.widgets) return;
    ensurePreviewWidget(node);
    bindWidgetCallbacks(node);
    updateMultiCharacterNode(node);
}

function bindWidgetCallbacks(node) {
    if (node.__animaMultiCharacterCallbacksBound) return;
    node.__animaMultiCharacterCallbacksBound = true;
    ["character_count", "layout"].forEach(name => {
        const widget = getWidget(node, name);
        if (!widget) return;
        const originalCallback = widget.callback;
        widget.callback = function () {
            const result = originalCallback?.apply(this, arguments);
            updateMultiCharacterNode(node);
            return result;
        };
    });
}

function updateMultiCharacterNode(node) {
    const countWidget = getWidget(node, "character_count");
    const layoutWidget = getWidget(node, "layout");
    const count = Math.min(4, Math.max(2, Number(countWidget?.value) || 2));
    const layouts = getLayoutsForCount(count);

    if (layoutWidget) {
        layoutWidget.options = { ...(layoutWidget.options || {}), values: layouts };
        layoutWidget.value = normalizeLayoutForCount(count, layoutWidget.value);
    }

    const visibleSlots = new Set(getVisibleSlotNumbers(count));
    for (let index = 1; index <= 4; index += 1) {
        ["gender", "prompt", "clothing", "pose"].forEach(field => {
            setWidgetVisible(getWidget(node, `character_${index}_${field}`), visibleSlots.has(index));
        });
    }

    renderPreview(node, layoutWidget?.value || layouts[0]);
    resizeNode(node);
}

function ensurePreviewWidget(node) {
    if (node.__animaMultiCharacterPreview || typeof node.addDOMWidget !== "function") return;

    const root = document.createElement("div");
    root.style.cssText = "width:100%;box-sizing:border-box;padding:8px 10px 10px;";
    const label = document.createElement("div");
    label.textContent = t("Composition Preview");
    label.style.cssText = "margin-bottom:6px;color:#cbd5e1;font:600 12px system-ui;letter-spacing:0;";
    const stage = document.createElement("div");
    stage.style.cssText = "position:relative;width:100%;height:118px;overflow:hidden;border:1px solid #475569;background:#111827;box-sizing:border-box;";
    root.append(label, stage);

    const widget = node.addDOMWidget("anima_multi_character_preview", "div", root, { serialize: false, hideOnZoom: false });
    widget.computeSize = width => [width, 152];
    widget.__animaMultiCharacterPreview = true;
    node.__animaMultiCharacterPreview = { root, stage, widget };

    const currentIndex = node.widgets.indexOf(widget);
    const layoutIndex = node.widgets.findIndex(item => item?.name === "layout");
    if (currentIndex >= 0 && layoutIndex >= 0) {
        node.widgets.splice(currentIndex, 1);
        node.widgets.splice(layoutIndex + 1, 0, widget);
    }
}

function renderPreview(node, layout) {
    const stage = node.__animaMultiCharacterPreview?.stage;
    if (!stage) return;
    stage.replaceChildren();

    getLayoutBoxes(layout).forEach((box, index) => {
        const person = document.createElement("div");
        person.textContent = String(index + 1);
        person.title = `${t("Character")} ${index + 1}`;
        person.style.cssText = [
            "position:absolute", `left:${box.x}%`, `top:${box.y}%`, `width:${box.width}%`, `height:${box.height}%`,
            "display:flex", "align-items:center", "justify-content:center", "box-sizing:border-box",
            "border:1px solid #f8fafc", `background:${slotColor(index)}`, "color:#fff",
            "font:700 15px system-ui", "letter-spacing:0",
        ].join(";");
        stage.append(person);
    });
}

function slotColor(index) {
    return ["#2563eb", "#db2777", "#16a34a", "#d97706"][index] || "#64748b";
}

export function setWidgetVisible(widget, visible) {
    if (!widget) return;
    if (!widget.__animaMultiCharacterOriginal) {
        widget.__animaMultiCharacterOriginal = {
            type: widget.type,
            computeSize: widget.computeSize,
            draw: widget.draw,
            hidden: widget.hidden,
            disabled: widget.disabled,
        };
    }
    const original = widget.__animaMultiCharacterOriginal;

    if (visible) {
        Object.assign(widget, original);
    } else {
        widget.type = "hidden";
        widget.hidden = true;
        widget.disabled = true;
        widget.serialize = true;
        widget.draw = () => {};
        widget.computeSize = () => [0, 0];
    }
    [widget.element, widget.inputEl, widget.el, widget.container].forEach(element => {
        if (element?.style) element.style.display = visible ? "" : "none";
    });
}

function resizeNode(node) {
    const width = Math.max(360, Number(node.size?.[0]) || 360);
    const computed = node.computeSize?.() || node.size || [width, 300];
    node.setSize?.([width, Math.max(260, Number(computed[1]) || 300)]);
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
}

function getWidget(node, name) {
    return node?.widgets?.find(widget => widget?.name === name);
}
