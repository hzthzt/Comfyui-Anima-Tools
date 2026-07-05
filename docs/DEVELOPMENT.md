# Development Guide

本文档面向 Anima-Tools 的维护者和功能开发者，说明项目结构、节点注册方式、前后端协作关系，以及在 ComfyUI 中快速测试和调试的常用流程。

## 项目定位

Anima-Tools 是一个 ComfyUI 自定义节点包，核心能力包括：

- 画师、角色、服装、背景、姿势 Tag 视觉选择器。
- 分区式 Prompt 拼接与运行时随机 Prompt 生成。
- 本地 LoRA 列表管理、Civitai 搜索、下载、预览和批量加载。
- 中英文节点描述和前端界面本地化。

开发时可以把它理解为三层：

- Python 节点层：定义 ComfyUI 节点输入、输出和执行逻辑。
- Python API 层：为前端面板提供收藏、角色数据、LoRA 搜索下载等 HTTP 接口。
- JavaScript 前端层：扩展 ComfyUI 节点界面，提供选择器、弹窗、预览、缓存和交互状态。

## 关键文件

```text
Comfyui-Anima-Tools/
├── __init__.py
├── nodes.py
├── anima_lora_api.py
├── js/
│   ├── anima_artist_selector.js
│   ├── anima_character_selector.js
│   ├── anima_clothing_selector.js
│   ├── anima_background_selector.js
│   ├── anima_pose_selector.js
│   ├── anima_prompt_plus.js
│   ├── anima_prompt_composer.js
│   ├── anima_lora_selector.js
│   ├── anima_image_utils.js
│   ├── anima_promo_links.js
│   ├── i18n.js
│   └── *_data.js / *.json
├── locales/
│   ├── en/nodeDefs.json
│   └── zh/nodeDefs.json
└── tools/
    └── generate_character_official_data.py
```

### `__init__.py`

ComfyUI 加载自定义节点包时会读取这里。它导出：

- `NODE_CLASS_MAPPINGS`
- `NODE_DISPLAY_NAME_MAPPINGS`
- `WEB_DIRECTORY = "./js"`

只要新增或删除节点，通常需要确认 `__init__.py` 仍然正确导出这些对象。

### `nodes.py`

这是后端核心文件，包含：

- ComfyUI 节点类。
- 节点注册表 `NODE_CLASS_MAPPINGS`。
- 节点显示名注册表 `NODE_DISPLAY_NAME_MAPPINGS`。
- Prompt 随机与 selector 状态解析逻辑。
- `PromptServer.instance.routes` 注册的 HTTP API。

每个 ComfyUI 节点类一般包含：

- `INPUT_TYPES`: 输入参数定义。
- `RETURN_TYPES` / `RETURN_NAMES`: 输出定义。
- `FUNCTION`: 节点执行时调用的方法名。
- `CATEGORY`: 节点在 ComfyUI 右键菜单中的分类。
- 与 `FUNCTION` 对应的实例方法。

### `anima_lora_api.py`

LoRA 相关的独立后端逻辑，包括：

- 配置读取和保存。
- LoRA 保存目录解析。
- Civitai / Meilisearch 搜索。
- 模型详情获取。
- 下载任务与下载状态管理。

LoRA 功能优先放在这里，`nodes.py` 中的 HTTP 路由只负责参数解析和响应封装。

### `js/`

ComfyUI 前端扩展目录，由 `WEB_DIRECTORY` 暴露给 ComfyUI。常见职责：

- 为指定节点添加自定义按钮、弹窗和面板。
- 从 `*_data.js` 或 JSON 数据中构建选择器。
- 调用 `/anima-tools/...` 后端接口。
- 将用户选择写回节点 widget 值。
- 管理本地筛选、收藏、分页、预览图缓存和 UI 状态。

### `locales/`

节点定义和 tooltip 的本地化文件。新增节点、参数或输出时，应同步更新：

- `locales/zh/nodeDefs.json`
- `locales/en/nodeDefs.json`

这些文件是用户在 ComfyUI 中理解节点用途的主要入口，不应只更新 Python 代码。

## 节点与前端对应关系

| 节点 | Python 类 | 主要前端文件 |
| --- | --- | --- |
| Anima Artist Tag Selector | `AnimaArtistTagSelector` | `js/anima_artist_selector.js` |
| Anima Artist Tag Selector+ | `AnimaArtistTagSelectorPlus` | `js/anima_artist_selector.js` |
| Anima Character Tag Selector | `AnimaCharacterTagSelector` | `js/anima_character_selector.js` |
| Anima Character Tag Selector+ | `AnimaCharacterTagSelectorPlus` | `js/anima_character_selector.js` |
| Anima Clothing Tag Selector | `AnimaClothingTagSelector` | `js/anima_clothing_selector.js` |
| Anima Clothing Tag Selector+ | `AnimaClothingTagSelectorPlus` | `js/anima_clothing_selector.js` |
| Anima Background Tag Selector | `AnimaBackgroundTagSelector` | `js/anima_background_selector.js` |
| Anima Background Tag Selector+ | `AnimaBackgroundTagSelectorPlus` | `js/anima_background_selector.js` |
| Anima Pose Tag Selector | `AnimaPoseTagSelector` | `js/anima_pose_selector.js` |
| Anima Pose Tag Selector+ | `AnimaPoseTagSelectorPlus` | `js/anima_pose_selector.js` |
| Anima Prompt Plus | `AnimaPromptPlus` | `js/anima_prompt_plus.js` |
| Anima Prompt Random Draw | `AnimaPromptComposer` | `js/anima_prompt_composer.js` |
| Anima Multi LoRA Loader | `AnimaMultiLoraLoader` | `js/anima_lora_selector.js` |

新增功能时，先判断是后端节点能力、前端交互能力，还是两者都要改。不要只改前端而忘记 Python 执行逻辑，也不要只改 Python 而忘记 ComfyUI 节点上的交互体验。

## 后端 API 路由

后端路由注册在 `nodes.py`，路径统一以 `/anima-tools/` 开头。现有主要接口包括：

- `GET /anima-tools/favorites`
- `POST /anima-tools/favorites`
- `GET /anima-tools/character/official`
- `GET /anima-tools/lora/local`
- `GET /anima-tools/lora/manifest`
- `GET /anima-tools/lora/search`
- `GET /anima-tools/lora/model-detail`
- `POST /anima-tools/lora/download`
- `GET /anima-tools/lora/local-metadata`
- `GET /anima-tools/lora/remote-preview`
- `GET /anima-tools/lora/local-preview`
- `POST /anima-tools/lora/clear-cache`
- `GET /anima-tools/lora/download-status`
- `GET /anima-tools/lora/config`
- `POST /anima-tools/lora/config`
- `POST /anima-tools/lora/delete-local`

新增路由时建议遵循：

- 路径继续放在 `/anima-tools/<domain>/<action>` 下。
- GET 用于读取，POST 用于修改、下载、删除或保存配置。
- 路由函数只做请求参数解析、调用业务函数和返回 JSON。
- 文件路径、下载、删除等操作必须做存在性检查和错误响应。

## 快速启动与调试

以下命令基于 Aki 便携包目录结构。如果你的 ComfyUI 安装路径不同，请替换路径。

### 语法检查

每次改完 Python 文件后，先跑：

```powershell
cd E:\AiDraw\ComfyUI-aki-v2\ComfyUI
..\python\python.exe -m py_compile custom_nodes\Comfyui-Anima-Tools\nodes.py custom_nodes\Comfyui-Anima-Tools\anima_lora_api.py
```

这能快速发现缩进、括号、导入语法等基础问题。

### 只加载本插件启动 ComfyUI

开发时建议用独立端口，并只白名单加载当前插件：

```powershell
cd E:\AiDraw\ComfyUI-aki-v2\ComfyUI
..\python\python.exe main.py --listen 127.0.0.1 --port 8190 --disable-all-custom-nodes --whitelist-custom-nodes Comfyui-Anima-Tools --disable-auto-launch
```

然后打开：

```text
http://127.0.0.1:8190
```

这样可以减少其他 custom nodes 对调试的干扰。

### 查看日志

```powershell
Get-Content -Wait E:\AiDraw\ComfyUI-aki-v2\ComfyUI\user\comfyui.log
```

Python 后端的 `print`、异常栈、节点加载失败信息通常会出现在启动终端或 `user/comfyui.log` 中。

### 前端调试

修改 `js/` 文件后：

- 通常刷新浏览器页面即可看到变化。
- 如果资源被缓存，打开浏览器 DevTools，勾选 Disable cache 后刷新。
- 查看 Console 中的 JavaScript 错误。
- 查看 Network 中 `/anima-tools/...` 请求的状态码和响应体。

修改 `nodes.py`、`anima_lora_api.py` 或节点注册表后：

- 需要重启 ComfyUI。
- 如果新增或删除节点，已有工作流可能需要重新添加节点或刷新节点定义。

## 新增节点检查清单

新增一个 ComfyUI 节点时，按这个顺序检查：

1. 在 `nodes.py` 中新增节点类。
2. 定义 `INPUT_TYPES`、`RETURN_TYPES`、`RETURN_NAMES`、`FUNCTION`、`CATEGORY`。
3. 实现 `FUNCTION` 指向的实例方法，并确保返回值是 tuple。
4. 加入 `NODE_CLASS_MAPPINGS`。
5. 加入 `NODE_DISPLAY_NAME_MAPPINGS`。
6. 如需自定义 UI，在 `js/` 中添加或扩展对应前端逻辑。
7. 在 `locales/zh/nodeDefs.json` 和 `locales/en/nodeDefs.json` 中补充显示名、描述、输入 tooltip、输出名。
8. 更新 `README.md` 或相关文档中的节点说明。
9. 重启 ComfyUI，确认右键菜单中能找到节点。
10. 在真实工作流中执行一次，确认输出类型和 ComfyUI 连接规则匹配。

## 新增前端选择器检查清单

新增或扩展视觉选择器时，按这个顺序检查：

1. 明确选择器写回哪个 widget 字段。
2. 确认 Python 节点的 `INPUT_TYPES` 中存在对应字段。
3. 准备数据源，优先放在 `js/*_data.js` 或 JSON 文件中。
4. 复用已有选择器的搜索、分页、收藏、复制、应用逻辑。
5. 如需后端数据，新增 `/anima-tools/...` API。
6. 检查刷新页面后状态是否能恢复。
7. 检查保存工作流、重新打开工作流后 widget 值是否正确。
8. 在中英文 ComfyUI 语言环境下检查按钮、tooltip 和弹窗文案。

## 修改 LoRA 功能检查清单

LoRA 功能横跨前端、后端 API 和 ComfyUI 模型加载，改动前先确认影响面：

1. 搜索、详情、下载、配置等业务逻辑优先放在 `anima_lora_api.py`。
2. HTTP 参数解析和 JSON 响应放在 `nodes.py` 路由函数中。
3. 前端面板改动放在 `js/anima_lora_selector.js`。
4. 实际模型应用逻辑在 `AnimaMultiLoraLoader.load_loras`。
5. 下载和删除文件时检查路径是否在预期 LoRA 目录内。
6. 异步下载任务要检查状态查询、失败提示和重复下载行为。
7. 改完后至少测试本地 LoRA、远程搜索、下载、删除、加载强度这几个路径。

## 数据与持久化

项目会读取或写入 ComfyUI 的 `user/` 目录，例如：

- `user/anima_lora_config.json`
- `user/anima_tools_favorites.json`
- `user/anima_tools/`

开发时注意：

- 不要把本机生成的用户配置提交到仓库。
- 修改收藏、配置、下载逻辑时，考虑旧数据结构的兼容。
- 写入 JSON 时尽量保持可读格式，便于用户排查问题。
- 删除模型或缓存文件时，先确认路径来自受控目录。

## 测试建议

当前项目没有独立测试套件时，至少做以下手动验证：

### Python 基础验证

```powershell
cd E:\AiDraw\ComfyUI-aki-v2\ComfyUI
..\python\python.exe -m py_compile custom_nodes\Comfyui-Anima-Tools\nodes.py custom_nodes\Comfyui-Anima-Tools\anima_lora_api.py
```

### 节点加载验证

使用白名单启动命令，确认日志中没有当前插件的导入错误，并确认 `AnimaArt` 分类下节点可见。

### 节点执行验证

至少执行以下场景：

- 基础 Selector 的 `append` 和 `override`。
- Selector+ 的 `extra_text` 和 `separator`。
- `AnimaPromptPlus` 的多分区拼接。
- `AnimaPromptComposer` 的固定 seed 和 `-1` 随机 seed。
- `AnimaMultiLoraLoader` 的空列表、禁用项、缺失文件、正常加载。

### API 验证

可以用浏览器或 PowerShell 调用 GET 接口，例如：

```powershell
Invoke-RestMethod http://127.0.0.1:8190/anima-tools/favorites
Invoke-RestMethod http://127.0.0.1:8190/anima-tools/lora/config
Invoke-RestMethod http://127.0.0.1:8190/anima-tools/lora/local
```

POST 接口要谨慎测试，尤其是下载、删除、清缓存相关接口。

## 代码风格约定

- 保持节点类的输入输出定义清晰，不把大量业务逻辑塞进 `INPUT_TYPES`。
- 复杂逻辑优先拆到小函数，便于单独检查。
- 后端错误信息用 `[Anima Tools]` 前缀打印，方便日志检索。
- 前端尽量复用已有 UI 模式和工具函数，避免每个 selector 重写一套行为。
- 新增用户可见字段时同步更新中英文 `nodeDefs.json`。
- 文档面向用户时写在 `README.md`，面向维护者时写在 `docs/`。

## 发布前检查

发布或提交前建议确认：

- Python 文件通过 `py_compile`。
- ComfyUI 能在只加载当前插件时正常启动。
- 新增或修改的节点能在真实工作流中执行。
- 前端 Console 没有新增错误。
- 中英文节点定义完整。
- README 或开发文档已同步更新。
- 没有提交本机 `user/` 配置、下载模型、缓存图片或临时日志。
