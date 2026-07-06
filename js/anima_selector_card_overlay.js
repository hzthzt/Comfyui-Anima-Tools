export const PROMPT_TAG_HEADER_ACTION_LABEL = "Apply All";

export function createPromptTagsHeaderAction({
    promptTags = [],
    displayName = "",
    applyTags,
    triggerSlot,
    showToast,
    t = value => value,
} = {}) {
    return {
        label: PROMPT_TAG_HEADER_ACTION_LABEL,
        run(event) {
            event?.stopPropagation?.();
            const tagText = promptTags.length ? `${promptTags.join(", ")}, ` : "";
            if (!tagText) return false;
            applyTags?.(tagText);
            triggerSlot?.();
            showToast?.(t("Applied: {text}", { text: displayName || tagText }));
            return true;
        },
    };
}
