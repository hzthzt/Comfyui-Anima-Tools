const comfyuiAppModuleUrl = `data:text/javascript,${encodeURIComponent(`
export const app = {
  registerExtension() {},
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
  if (specifier === "../../scripts/app.js") {
    return {
      shortCircuit: true,
      url: comfyuiAppModuleUrl,
    };
  }

  return nextResolve(specifier, context);
}
