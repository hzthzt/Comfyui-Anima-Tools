const comfyuiAppModuleUrl = `data:text/javascript,${encodeURIComponent(`
export const app = {
  ui: {
    settings: {
      getSettingValue() {
        return "";
      },
    },
  },
};
`)}`;

export async function resolve(specifier, context, nextResolve) {
  const parentPath = context.parentURL ? new URL(context.parentURL).pathname : "";
  const isI18nImport = parentPath.replace(/\\/g, "/").endsWith("/js/i18n.js");

  if (specifier === "../../scripts/app.js" && isI18nImport) {
    return {
      shortCircuit: true,
      url: comfyuiAppModuleUrl,
    };
  }

  return nextResolve(specifier, context);
}
