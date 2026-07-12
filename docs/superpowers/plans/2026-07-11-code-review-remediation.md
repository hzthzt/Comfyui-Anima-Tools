# 代码审查问题修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复审查报告 F-02 至 F-19，避免 Prompt 输出错误、收藏丢失、Tag 状态错乱和前端交互回归；F-01 明确延期到随机系统重做。

**Architecture:** 收藏配置改为七个 section 的独立文件、接口、锁和 revision，并由前端 singleton Store 管理并发。Tag 编辑器继续作为 Tagged 节点的状态源，但补齐初始化、历史和生命周期不变量。角色官方标签使用带 SHA-256 元数据的 IndexedDB 最后有效缓存，卡片仅在标签数据可用时渲染，图片继续按视口懒加载。

**Tech Stack:** Python 3.9+、aiohttp/ComfyUI PromptServer、JavaScript ES modules、Node test runner、jsdom、IndexedDB、PowerShell 7。

**问题来源:** [code-review-2026-07-11.md](../../code-review-2026-07-11.md)

**实施分支:** 保持 `codex/prompt-tag-editor`，不新建或切换分支，不改写既有提交历史。

---

## 范围与已确认决策

<a id="deferred-f01"></a>

### F-01 延期

F-01 不在本计划中修改。当前 Prompt Random Draw 的入队随机语义保持不变，问题标记为“后续随机系统重做”。后续设计需要统一 Prompt Random Draw 与各 selector 的随机核心，并支持自动随机、手动随机和更复杂的规则；本轮不得为绕过 F-01 添加临时模式或状态字段。

### 行为决策

| 主题 | 已确认处理方式 |
| --- | --- |
| F-02 Tag 分组编辑 | checkbox 只更新草稿；点击 popover 外部一次提交；`Escape` 取消；失败回滚 |
| F-03 画师自定义卡片 | `customContent` 始终按原文 Prompt 处理，每个 token 使用 `_raw_:` 编码 |
| F-04 画师卡片 | 保持点击即应用；取消和清空通过完整选择集合投影到 widget；关闭不回滚 |
| F-05 角色官方标签 | IndexedDB 持久缓存；允许回退到完整且校验通过的旧缓存；无缓存且加载失败时不显示卡片；单项缺官方 Tag 时只应用 trigger |
| F-09 收藏持久化 | 前后端、文件、锁和 revision 全部按 section 拆分；冲突时使用服务端最新数据，不允许强制覆盖 |
| F-09 旧数据 | 在实施时对当前机器执行一次手动迁移；不提交迁移脚本；运行时不兼容旧文件或旧聚合 API |
| F-12 Selector 输出 | 删除六类基础 selector 的 `override/mode`；始终把选择 Tag 放在上游 Prompt 前；Selector+ 保持不变 |
| F-17 上游缓存 | 以 upstream tree SHA 隔离缓存，下载固定版本内容，成功后清理旧版本 |
| F-18 等价 Tag | 保留空格版和下划线版，统一中文翻译，并对每份 catalog 增加归一化翻译冲突检查 |

## 问题覆盖索引

| Finding | 实施任务 |
| --- | --- |
| F-01 | 延期到随机系统重做，不改代码 |
| F-02、F-07、F-16 | [Task 4](#task-04) |
| F-03、F-04 | [Task 7](#task-07) |
| F-05 | [Task 8](#task-08) |
| F-06、F-10 | [Task 9](#task-09) |
| F-08、F-13、F-14 | [Task 5](#task-05) |
| F-09 | [Task 1](#task-01)、[Task 2](#task-02)、[Task 3](#task-03) |
| F-11 | [Task 11](#task-11) |
| F-12 | [Task 10](#task-10) |
| F-15 | [Task 6](#task-06) |
| F-17 | [Task 12](#task-12) |
| F-18 | [Task 13](#task-13) |
| F-19、格式项 | [Task 14](#task-14) |

## 目标文件结构

```text
ComfyUI/
├── custom_nodes/Comfyui-Anima-Tools/
│   ├── favorites_store.py                          # 新增：section 持久化、revision、锁和原子写
│   ├── nodes.py                                    # section API；selector append-only 契约
│   ├── js/
│   │   ├── anima_favorites_store.js                # 新增：每 section singleton Store
│   │   ├── anima_character_official_cache.js       # 新增：IndexedDB 最后有效缓存
│   │   ├── character_official_data.meta.json       # 新增：schema、SHA-256、条目数
│   │   ├── anima_selector_tag_library.js           # 分组事务、搜索和失效 group 防护
│   │   ├── anima_tag_editor.js                     # 初始化、历史、manager 生命周期
│   │   ├── anima_*_selector.js                     # Store 接线和各 selector 修复
│   │   ├── anima_prompt_tag_selector.js            # Prompt section Store
│   │   ├── anima_lora_selector.js                  # LoRA section Store
│   │   ├── anima_selector_tag_catalog_config.js    # 失败缓存驱逐
│   │   └── i18n.js                                 # 完整 Tag 视图翻译
│   └── tests/
│       ├── check_favorites_section_storage.py      # 新增
│       ├── anima_favorites_store.test.mjs          # 新增
│       ├── anima_artist_selector.test.mjs          # 新增
│       ├── anima_character_official_cache.test.mjs # 新增
│       ├── check_character_official_data_metadata.py # 新增
│       ├── anima_i18n.test.mjs                     # 新增
│       └── check_selector_tag_catalog_consistency.py # 新增
└── user/anima_tools/favorites/                     # 仓库外运行时数据
    ├── artist.json
    ├── character.json
    ├── clothing.json
    ├── background.json
    ├── pose.json
    ├── prompt.json
    └── lora.json
```

<a id="task-01"></a>

### Task 1: 按 section 拆分收藏后端与持久化

**Findings:** F-09

**Files:**

- Create: `favorites_store.py`
- Create: `tests/check_favorites_section_storage.py`
- Modify: `nodes.py:1794`
- Modify: `tests/check_favorites_tag_metadata.py`

- [ ] **Step 1: 写 section 存储失败测试**

测试必须覆盖七个 allowlist section、默认结构、独立文件、revision 递增、陈旧 revision 冲突、不同 section 互不修改，以及写入失败时原文件仍可解析。目标文件 envelope 固定为：

```json
{
  "schemaVersion": 1,
  "section": "artist",
  "revision": 1,
  "favorites": {
    "groups": [],
    "items": [],
    "tagGroups": [],
    "tagItems": []
  }
}
```

测试使用 `tempfile.TemporaryDirectory()` 创建隔离目录，不写真实 ComfyUI `user/`。

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```powershell
..\..\..\python\python.exe tests\check_favorites_section_storage.py
```

Expected: FAIL，原因是 `favorites_store.py` 或 `FavoritesSectionStore` 尚不存在。

- [ ] **Step 3: 实现 section 存储**

`favorites_store.py` 提供以下稳定接口：

- `FAVORITE_SECTIONS = ("artist", "character", "clothing", "background", "pose", "prompt", "lora")`
- `FavoritesRevisionConflict.current` 保存冲突时的完整当前 envelope。
- `FavoritesSectionStore(root_directory)` 接收 `user/anima_tools/favorites` 目录。
- `FavoritesSectionStore.load(section)` 返回规范化 envelope。
- `FavoritesSectionStore.save(section, expected_revision, favorites)` 返回 revision 已递增的新 envelope，或抛出 `FavoritesRevisionConflict`。

实现约束：

- section 必须先通过 allowlist，不能直接拼接未经验证的路径参数。
- 每个 section 使用独立 `threading.Lock`。
- 锁内重新读取当前 revision，比较 `expected_revision`，再规范化四个数组。
- 写入同目录临时文件，flush 后使用 `os.replace()` 原子替换。
- 新文件从 revision `1` 开始，成功保存后递增；失败不增加 revision。
- 不读取 `anima_tools_favorites.json`，不实现运行时迁移或聚合兼容。

- [ ] **Step 4: 将 API 改为 section 路由**

删除聚合 `GET/POST /anima-tools/favorites`，新增：

```text
GET  /anima-tools/favorites/{section}
POST /anima-tools/favorites/{section}
```

POST 请求包含 `revision` 和 `favorites`。成功返回完整 envelope；revision 过期返回 `409`，并携带当前完整 envelope，前端无需再发第二次 GET：

```json
{
  "success": false,
  "error": "revision_conflict",
  "current": {
    "schemaVersion": 1,
    "section": "artist",
    "revision": 4,
    "favorites": {}
  }
}
```

- [ ] **Step 5: 运行 Python 测试并确认 GREEN**

```powershell
..\..\..\python\python.exe tests\check_favorites_section_storage.py
..\..\..\python\python.exe tests\check_favorites_tag_metadata.py
```

Expected: 两条命令均 exit `0`。

- [ ] **Step 6: 提交后端拆分**

```powershell
git add favorites_store.py nodes.py tests/check_favorites_section_storage.py tests/check_favorites_tag_metadata.py
git commit -m "refactor: 拆分收藏分区持久化"
```

<a id="task-02"></a>

### Task 2: 引入前端 section Store 并迁移七个选择器

**Findings:** F-09

**Files:**

- Create: `js/anima_favorites_store.js`
- Create: `tests/anima_favorites_store.test.mjs`
- Modify: `js/anima_artist_selector.js`
- Modify: `js/anima_character_selector.js`
- Modify: `js/anima_clothing_selector.js`
- Modify: `js/anima_background_selector.js`
- Modify: `js/anima_pose_selector.js`
- Modify: `js/anima_prompt_tag_selector.js`
- Modify: `js/anima_lora_selector.js`

- [ ] **Step 1: 写 singleton、隔离和冲突失败测试**

固定前端接口为：

```js
const store = getFavoritesStore("artist", { fetchImpl });
await store.load();
const snapshot = store.getSnapshot();
await store.mutate(draft => {
  draft.items.push(newItem);
});
const unsubscribe = store.subscribe(nextSnapshot => render(nextSnapshot));
```

测试断言：同一 section 返回同一 Store；不同 section URL 和状态隔离；成功保存接收新 revision；普通失败恢复保存前快照；`409` 使用响应中的 `current` 替换本地状态、通知订阅者并抛出 `FavoritesConflictError`；不会发送全量 favorites 配置。

- [ ] **Step 2: 运行测试并确认 RED**

```powershell
node --import ./tests/register-comfyui-loader.mjs --test tests/anima_favorites_store.test.mjs
```

Expected: FAIL，原因是 Store 模块不存在。

- [ ] **Step 3: 实现 Store**

模块级 `Map` 以 section 为键保存 singleton。`mutate()` 先深拷贝服务端快照，再应用 mutation；成功才更新 revision。发生 `409` 时使用服务端最新 envelope，保持 modal 打开并由订阅回调重新构建 Map/Set 和视图；不提供 force overwrite。网络或 5xx 错误恢复保存前快照。

- [ ] **Step 4: 接入七个选择器**

所有选择器删除局部全量 `favoritesConfig` 的 GET/POST。每个 modal 订阅自己的 section Store：

| 文件 | section |
| --- | --- |
| `anima_artist_selector.js` | `artist` |
| `anima_character_selector.js` | `character` |
| `anima_clothing_selector.js` | `clothing` |
| `anima_background_selector.js` | `background` |
| `anima_pose_selector.js` | `pose` |
| `anima_prompt_tag_selector.js` | `prompt` |
| `anima_lora_selector.js` | `lora` |

LoRA 删除保存前重新 GET 聚合配置的逻辑。冲突提示后保留 modal，显示服务端最新收藏并要求用户重新执行刚才的操作。

- [ ] **Step 5: 运行目标测试和全量前端测试**

```powershell
node --import ./tests/register-comfyui-loader.mjs --test tests/anima_favorites_store.test.mjs
npm test
```

Expected: 全部 PASS，且源码中不再出现 `/anima-tools/favorites"` 聚合 URL。

- [ ] **Step 6: 提交前端 Store**

```powershell
git add js/anima_favorites_store.js js/anima_*_selector.js js/anima_prompt_tag_selector.js tests/anima_favorites_store.test.mjs
git commit -m "refactor: 统一选择器收藏状态仓库"
```

<a id="task-03"></a>

### Task 3: 对当前机器执行一次性收藏迁移

**Findings:** F-09

**Runtime files only:**

- Source: `E:\AiDraw\ComfyUI-aki-v2\ComfyUI\user\anima_tools_favorites.json`
- Target: `E:\AiDraw\ComfyUI-aki-v2\ComfyUI\user\anima_tools\favorites\*.json`
- Backup: `E:\AiDraw\ComfyUI-aki-v2\ComfyUI\user\anima_tools_favorites.pre-section-20260711.json`

- [ ] **Step 1: 停止 ComfyUI 并记录源文件摘要**

使用 PowerShell 7 记录 SHA-256 和每个 section 的四类数组数量。计划编写时源文件为 7,721 bytes，包含七个 section；实施时必须重新读取，不能硬编码当前统计值。

- [ ] **Step 2: 在临时目录生成七个 envelope**

执行一次性 PowerShell 7 命令；不在仓库创建迁移脚本：

```powershell
$userDir = 'E:\AiDraw\ComfyUI-aki-v2\ComfyUI\user'
$source = Join-Path $userDir 'anima_tools_favorites.json'
$backup = Join-Path $userDir 'anima_tools_favorites.pre-section-20260711.json'
$target = Join-Path $userDir 'anima_tools\favorites'
$staging = Join-Path $userDir 'anima_tools\favorites.migrating-20260711'
$sections = @('artist','character','clothing','background','pose','prompt','lora')

if (!(Test-Path -LiteralPath $source)) { throw "Missing source favorites file: $source" }
if (Test-Path -LiteralPath $target) { throw "Target favorites directory already exists: $target" }
if (Test-Path -LiteralPath $backup) { throw "Backup already exists: $backup" }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

$all = Get-Content -Raw -LiteralPath $source | ConvertFrom-Json -AsHashtable
$utf8 = [System.Text.UTF8Encoding]::new($false)
foreach ($section in $sections) {
    if (!$all.ContainsKey($section)) { throw "Missing section: $section" }
    $envelope = [ordered]@{
        schemaVersion = 1
        section = $section
        revision = 1
        favorites = $all[$section]
    }
    $path = Join-Path $staging "$section.json"
    [System.IO.File]::WriteAllText($path, (($envelope | ConvertTo-Json -Depth 100) + "`n"), $utf8)
}

foreach ($section in $sections) {
    $migrated = Get-Content -Raw -LiteralPath (Join-Path $staging "$section.json") | ConvertFrom-Json -AsHashtable
    $expected = $all[$section] | ConvertTo-Json -Depth 100 -Compress
    $actual = $migrated.favorites | ConvertTo-Json -Depth 100 -Compress
    if ($expected -cne $actual) { throw "Migration mismatch: $section" }
}

Move-Item -LiteralPath $staging -Destination $target
Move-Item -LiteralPath $source -Destination $backup
```

- [ ] **Step 3: 验证七个文件并启动 ComfyUI**

逐文件解析 JSON；确认 section、revision 和四类数组与备份一致。启动 `8190` 测试实例后调用七个 GET endpoint，并用相同 revision 连续 POST 两次同一 section，第二次必须返回 `409`。

- [ ] **Step 4: 验证跨 section 隔离**

保存 `prompt` 前后计算 `artist.json` SHA-256，值必须不变。检查 UI 中七个 section 的收藏数量与迁移前一致。

- [ ] **Step 5: 保留备份但不提交运行时数据**

`user/` 下的新文件和备份均不得加入 Git。本任务没有 Git commit。

<a id="task-04"></a>

### Task 4: 修复 Tag 收藏分组事务、搜索和删除竞态

**Findings:** F-02、F-07、F-16

**Files:**

- Modify: `js/anima_selector_tag_library.js`
- Modify: `tests/anima_selector_tag_library.test.mjs`

- [ ] **Step 1: 写五个失败测试**

新增测试：

```text
group popover commits draft once when clicking outside
group popover cancels draft on Escape
group popover rolls back when save fails
group search includes matching custom favorites while preserving unassigned catalog results
deleting an active group switches filter before save resolves and never writes a deleted group id
```

移动用例从唯一 A 组开始，依次取消 A、勾选 B；外部点击前持久状态必须仍为 A，外部点击后必须仅为 B，并保留 `isCustom` 和自定义文本。

- [ ] **Step 2: 运行目标测试并确认 RED**

```powershell
node --import ./tests/register-comfyui-loader.mjs --test --test-name-pattern="group popover|group search|deleted group" tests/anima_selector_tag_library.test.mjs
```

- [ ] **Step 3: 实现 popover 草稿事务**

创建 `originalGroupIds` 和 `draftGroupIds`；checkbox 事件只改草稿。外部 `pointerdown` 关闭时只调用一次 Store mutation；`Escape` 清理监听并丢弃草稿。提交异常恢复原条目并重新渲染。

- [ ] **Step 4: 修复搜索数据源**

分组搜索使用“完整 catalog + 当前组自定义收藏”的归一化去重并集，再应用 query。保留现有行为：查询可以发现尚未分入当前组的 catalog Tag，以支持分类。

- [ ] **Step 5: 修复删除竞态和 group ID 不变量**

删除 active group 后，在第一个 `await` 前立即切换到 All、禁用旧视图并更新 filter。`targetGroupId()` 和收藏写入边界都必须根据当前 `tagGroups` 验证 ID；不存在的 group ID 不得写入 `tagItems`。

- [ ] **Step 6: 运行测试并提交**

```powershell
node --import ./tests/register-comfyui-loader.mjs --test tests/anima_selector_tag_library.test.mjs
npm test
git add js/anima_selector_tag_library.js tests/anima_selector_tag_library.test.mjs
git commit -m "fix: 修复 Tag 收藏分组状态"
```

<a id="task-05"></a>

### Task 5: 修复 Tag 编辑器初始化、空替换和历史不变量

**Findings:** F-08、F-13、F-14

**Files:**

- Modify: `js/anima_tag_editor.js`
- Modify: `tests/anima_tag_editor.test.mjs`

- [ ] **Step 1: 写四个失败测试**

```text
getActiveSelectorTagText reads the current widget value for non Tagged nodes
applySelectorTagsToWidget clears existing tags with an empty replace
manual re-add removes the matching history item
widget text sync removes a re-added tag from history
```

普通节点用例必须先读 `alpha`，再把 widget 改为 `beta, gamma, `，第二次读取必须返回新值。空 replace 用例从 `alpha, ` 开始，结束时 widget 和 field tags 都为空。

- [ ] **Step 2: 运行目标测试并确认 RED**

```powershell
node --import ./tests/register-comfyui-loader.mjs --test --test-name-pattern="current widget|empty replace|re-add" tests/anima_tag_editor.test.mjs
```

- [ ] **Step 3: 增加显式初始化状态**

field 增加 `initialized`。仅当它不是 `true` 时允许从 widget 一次性水合，之后即使 tags/history 都为空也不得复活旧文本。已有非空 field 在首次读取时直接标记 initialized。

- [ ] **Step 4: 统一 incoming Tag 不变量**

把“激活 incoming Tag 时删除同 key history”下沉到 `applyIncomingTags()`，覆盖 selector、手动 Add/Enter 和 widget input/change；删除调用方重复清理。`getActiveSelectorTagText()` 对非 Tagged 节点直接读取当前 widget，对 Tagged 节点读取 field enabled tags。

- [ ] **Step 5: 运行测试并提交**

```powershell
node --import ./tests/register-comfyui-loader.mjs --test tests/anima_tag_editor.test.mjs
npm test
git add js/anima_tag_editor.js tests/anima_tag_editor.test.mjs
git commit -m "fix: 修复 Tag 编辑器状态同步"
```

<a id="task-06"></a>

### Task 6: 为 selector Tag manager 建立显式生命周期

**Findings:** F-15

**Files:**

- Modify: `js/anima_tag_editor.js`
- Modify: `js/anima_artist_selector.js`
- Modify: `js/anima_character_selector.js`
- Modify: `js/anima_clothing_selector.js`
- Modify: `js/anima_background_selector.js`
- Modify: `js/anima_pose_selector.js`
- Modify: `js/anima_prompt_tag_selector.js`
- Modify: `tests/anima_tag_editor.test.mjs`
- Modify: `tests/anima_selector_consistency.test.mjs`

- [ ] **Step 1: 写 dispose 失败测试**

测试 manager `dispose()` 精确注销自身、保留同字段其他 manager、移除 element，并且重复调用无副作用。源码契约测试覆盖六个 modal 的 `closeModal()` 都调用保存的 manager 引用。

- [ ] **Step 2: 运行目标测试并确认 RED**

```powershell
node --import ./tests/register-comfyui-loader.mjs --test --test-name-pattern="dispose" tests/anima_tag_editor.test.mjs tests/anima_selector_consistency.test.mjs
```

- [ ] **Step 3: 实现并接入幂等 dispose**

manager 保存 `disposed`，从 `node._animaSelectorTagManagers[fieldName]` 精确过滤自身并移除 DOM。六个 modal 保存 manager 对象而不只保存 `.element`；遮罩、X、Cancel 和其他关闭路径最终统一调用 `closeModal()`，由它先 dispose 再删除 overlay。

- [ ] **Step 4: 运行测试并提交**

```powershell
npm test
git add js/anima_tag_editor.js js/anima_artist_selector.js js/anima_character_selector.js js/anima_clothing_selector.js js/anima_background_selector.js js/anima_pose_selector.js js/anima_prompt_tag_selector.js tests/anima_tag_editor.test.mjs tests/anima_selector_consistency.test.mjs
git commit -m "fix: 释放弹窗 Tag 管理器"
```

<a id="task-07"></a>

### Task 7: 修复画师自定义内容和完整选择投影

**Findings:** F-03、F-04

**Files:**

- Modify: `js/anima_artist_selector.js`
- Modify: `nodes.py`
- Create: `tests/anima_artist_selector.test.mjs`
- Modify: `tests/check_prompt_tag_selector.py`

- [ ] **Step 1: 写 raw 和取消失败测试**

测试覆盖：官方画师变为 `@name`；自定义 `masterpiece, red hair` 变为 `_raw_:masterpiece, _raw_:red hair`；再次点击移除对应输出；Clear Selected 清空 selector-owned Tag；Tagged 手动 Tag 保留；Prompt Plus 接收 raw 画师 token 后输出原文而非 `@masterpiece`。

- [ ] **Step 2: 运行目标测试并确认 RED**

```powershell
node --import ./tests/register-comfyui-loader.mjs --test tests/anima_artist_selector.test.mjs
..\..\..\python\python.exe tests\check_prompt_tag_selector.py
```

- [ ] **Step 3: 提取完整选择序列化**

在 `anima_artist_selector.js` 导出纯函数 `buildArtistSelectionText(selectedArtists, favoriteItems)`。自定义 token 已有 `_raw_:` 时不重复编码；官方项添加 `@`。卡片点击先更新 Set，再使用 `writeSelectorTagsToWidget(node, tagsWidget, selectionText, {mode: "replace", source: "selector"})` 写完整投影；Clear Selected 使用同一路径写空投影。

- [ ] **Step 4: 修正 Prompt Plus raw 解析顺序**

`AnimaPromptPlus` 的 artist 分区必须在剥离 `_raw_:` 前识别 raw token；其他分区保持现有解析。自定义收藏数据本身不迁移，只在写 widget 时编码。

- [ ] **Step 5: 运行测试并提交**

```powershell
node --import ./tests/register-comfyui-loader.mjs --test tests/anima_artist_selector.test.mjs
..\..\..\python\python.exe tests\check_prompt_tag_selector.py
npm test
git add js/anima_artist_selector.js nodes.py tests/anima_artist_selector.test.mjs tests/check_prompt_tag_selector.py
git commit -m "fix: 修复画师卡片选择输出"
```

<a id="task-08"></a>

### Task 8: 持久缓存角色官方标签并在数据可用后渲染卡片

**Findings:** F-05

**Files:**

- Create: `js/anima_character_official_cache.js`
- Create: `js/character_official_data.meta.json`
- Modify: `js/anima_character_selector.js`
- Modify: `tools/generate_character_official_data.py`
- Create: `tests/anima_character_official_cache.test.mjs`
- Create: `tests/check_character_official_data_metadata.py`
- Modify: `tests/anima_character_selector.test.mjs`
- Modify: `js/i18n.js`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 安装固定版本的 IndexedDB 测试实现**

```powershell
npm install --save-dev fake-indexeddb@6.2.5
```

只把 `fake-indexeddb` 用于 Node 测试；浏览器生产代码继续使用原生 `globalThis.indexedDB`。

- [ ] **Step 2: 写缓存状态机失败测试**

使用 `fake-indexeddb` 测试：匹配 hash 时不请求大 JSON；新数据通过 SHA-256 和 entry count 后原子替换；hash/count/JSON 任一无效时不覆盖旧缓存；刷新失败回退最后有效旧缓存并标记 stale；无缓存失败返回 unavailable；失败 Promise 被驱逐后 Retry 可以成功。

- [ ] **Step 3: 写 selector 渲染失败测试**

测试卡片在数据 ready/stale 前不渲染；unavailable 时只显示错误和 Retry；Retry 成功后渲染；单项无官方 Tag 时只应用 trigger；不得生成 gender/hair/eye 简略 Tag；图片仍由 `IntersectionObserver` 进入视口后加载。

- [ ] **Step 4: 运行测试并确认 RED**

```powershell
node --import ./tests/register-comfyui-loader.mjs --test tests/anima_character_official_cache.test.mjs tests/anima_character_selector.test.mjs
..\..\..\python\python.exe tests\check_character_official_data_metadata.py
```

Expected: JS 测试因缓存 loader 和数据 gate 尚未实现而 FAIL；Python 检查因 meta 文件尚不存在而 FAIL。

- [ ] **Step 5: 生成并校验小型元数据**

`character_official_data.meta.json` 固定结构：

```json
{
  "schemaVersion": 1,
  "sha256": "c16033f576cb58b436a1b8c4ead92f9eb8f6e58c1d2c1eec5baa0f79e0a76606",
  "entries": 7999
}
```

生成工具每次写完大 JSON 后，读取最终 bytes 计算 SHA-256 并写 meta。Python 检查重新计算 hash 和 `Object.keys` 等价条目数，确保生成物不能漂移。

- [ ] **Step 6: 实现 IndexedDB 最后有效缓存**

数据库使用固定 store/key 保存 `{schemaVersion, sha256, entries, data, savedAt}`。每次打开先以 `cache: "no-cache"` 读取小 meta；相同 hash 从 IndexedDB 恢复结构化对象，避免下载和 `JSON.parse` 大文件。版本变化时先校验新文本，再在一个事务中替换。新版本失败允许使用完整且曾校验通过的旧缓存。

- [ ] **Step 7: 将角色 modal 改为数据 gate**

打开时先渲染 loading shell；ready 或 stale 后才渲染卡片。unavailable 时卡片容器为空，只显示 Retry。删除 hover 触发正确数据加载的依赖。单项无官方记录或 tags 为空时，卡片仍显示并只写 trigger。保留图片 IntersectionObserver 懒加载。

- [ ] **Step 8: 运行测试并提交**

```powershell
node --import ./tests/register-comfyui-loader.mjs --test tests/anima_character_official_cache.test.mjs tests/anima_character_selector.test.mjs
..\..\..\python\python.exe tests\check_character_official_data_metadata.py
npm test
git add js/anima_character_official_cache.js js/character_official_data.meta.json js/anima_character_selector.js js/i18n.js tools/generate_character_official_data.py tests/anima_character_official_cache.test.mjs tests/anima_character_selector.test.mjs tests/check_character_official_data_metadata.py package.json package-lock.json
git commit -m "perf: 缓存角色官方标签数据"
```

<a id="task-09"></a>

### Task 9: 修复语言切换并补齐 Tag 视图翻译

**Findings:** F-06、F-10

**Files:**

- Modify: `js/anima_card_filter_helpers.js`
- Modify: `js/anima_clothing_selector.js`
- Modify: `js/anima_background_selector.js`
- Modify: `js/anima_pose_selector.js`
- Modify: `js/i18n.js`
- Modify: `tests/anima_card_filter_helpers.test.mjs`
- Create: `tests/anima_i18n.test.mjs`

- [ ] **Step 1: 写语言 handler 失败测试**

共享 handler 必须保存现有 `bilingual/en` 值并调用 sidebar/page render。clothing、background、pose 三个下拉触发 `change` 时不得抛出 `ReferenceError`，也不得给未声明的 `tagCatalog` 赋值。

- [ ] **Step 2: 写 literal 翻译覆盖失败测试**

导出 `hasTranslationForLanguage(language, key)`。测试扫描 `anima_selector_tag_library.js` 和六个 selector 文件中的字面量翻译调用，断言 en/zh 表都显式包含 key。至少补齐审查确认的 16 个键：

```text
+ Tag
Add to Tag Group
All Tags
Are you sure you want to delete this tag group? Tags inside won't be deleted.
Cards
Create Favorite Tag
Create Tag Group
Delete
Enter favorite tag...
Manage Tag Groups
No matching tags found
Rename
Search tags...
Tag Categories
Tag Groups
Total {total} tags | Showing {start}-{end}
```

- [ ] **Step 3: 运行测试并确认 RED**

```powershell
node --import ./tests/register-comfyui-loader.mjs --test tests/anima_card_filter_helpers.test.mjs tests/anima_i18n.test.mjs
```

- [ ] **Step 4: 接入共享 handler 并补翻译**

三处语言下拉删除 `tagCatalog = null`；catalog provider 保持不变，因为数据已同时包含中英文。补齐 en/zh 显式键及 Task 8 新增 loading/stale/unavailable/retry 文案。

- [ ] **Step 5: 运行测试并提交**

```powershell
npm test
git add js/anima_card_filter_helpers.js js/anima_clothing_selector.js js/anima_background_selector.js js/anima_pose_selector.js js/i18n.js tests/anima_card_filter_helpers.test.mjs tests/anima_i18n.test.mjs
git commit -m "fix: 修复选择器语言切换与翻译"
```

<a id="task-10"></a>

### Task 10: 删除基础 selector 的 override 模式

**Findings:** F-12，按确认决策扩大为六类基础 selector 的统一行为变更

**Files:**

- Modify: `nodes.py:60`
- Modify: `locales/en/nodeDefs.json`
- Modify: `locales/zh/nodeDefs.json`
- Modify: `README.md`
- Modify: `tests/check_prompt_tag_selector.py`

- [ ] **Step 1: 写 append-only 契约失败测试**

覆盖 Artist、Character、Clothing、Background、Pose、Prompt 六个基础类及其 Tagged 子类：`INPUT_TYPES` 不再暴露 `mode`；非空选择始终输出“selected, upstream”；空选择保留 upstream；无 upstream 时只输出 selected。断言所有 Selector+ 的 `extra_text/separator` 契约不变，Tag manager 内的 Replace/Append 仍存在。

- [ ] **Step 2: 运行测试并确认 RED**

```powershell
..\..\..\python\python.exe tests\check_prompt_tag_selector.py
```

- [ ] **Step 3: 收敛后端签名和 widget order**

六个基础 `process_tags(tags, opt_prompt="")` 复用一个 append helper。删除 required `mode`，并从普通/Tagged `SELECTOR_WIDGET_ORDERS` 移除 mode。旧 workflow prompt 中的额外 `mode` 会被当前 ComfyUI `get_input_data()` 忽略；仍需在 Task 15 用真实旧工作流验证加载和入队。

- [ ] **Step 4: 更新中英文节点定义和 README**

删除 mode 名称与 tooltip，把基础 selector 描述改为固定追加；不要修改 Selector+ 或 Tag manager 的 Replace/Append 文案。

- [ ] **Step 5: 运行测试并提交**

```powershell
..\..\..\python\python.exe tests\check_prompt_tag_selector.py
..\..\..\python\python.exe -m py_compile nodes.py
npm test
git add nodes.py locales/en/nodeDefs.json locales/zh/nodeDefs.json README.md tests/check_prompt_tag_selector.py
git commit -m "refactor: 统一选择器追加模式"
```

<a id="task-11"></a>

### Task 11: 允许 catalog 首次失败后自动重试

**Findings:** F-11

**Files:**

- Modify: `js/anima_selector_tag_catalog_config.js`
- Modify: `tests/anima_selector_tag_catalog_config.test.mjs`

- [ ] **Step 1: 写失败后成功和并发缓存测试**

测试第一次 `503`、第二次成功时 fetch 次数为 2；第一次 `response.json()` 抛错后可重试；两个并发成功调用只发一次请求且后续复用成功缓存。

- [ ] **Step 2: 运行测试并确认 RED**

```powershell
node --import ./tests/register-comfyui-loader.mjs --test tests/anima_selector_tag_catalog_config.test.mjs
```

- [ ] **Step 3: 只缓存成功 Promise**

HTTP 非成功、网络异常、JSON 异常或非 object 结果都返回 null，并且仅当 Map 中仍是本次 Promise 时删除缓存项，避免失败请求误删后来成功的 Promise。

- [ ] **Step 4: 运行测试并提交**

```powershell
node --import ./tests/register-comfyui-loader.mjs --test tests/anima_selector_tag_catalog_config.test.mjs
npm test
git add js/anima_selector_tag_catalog_config.js tests/anima_selector_tag_catalog_config.test.mjs
git commit -m "fix: 恢复标签目录加载重试"
```

<a id="task-12"></a>

### Task 12: 按 upstream tree SHA 缓存 Danbooru 翻译源

**Findings:** F-17

**Files:**

- Modify: `tools/sync_danbooru_tag_translations.py`
- Modify: `tests/check_danbooru_tag_translation_sync.py`

- [ ] **Step 1: 写版本切换和清理失败测试**

测试同一路径 tree SHA 改变后重新下载；相同 SHA 二次运行只读缓存；raw URL 固定到本次 SHA；全部成功后只保留当前 SHA；任一下载失败时旧缓存不清理。

- [ ] **Step 2: 运行测试并确认 RED**

```powershell
..\..\..\python\python.exe tests\check_danbooru_tag_translation_sync.py
```

- [ ] **Step 3: 实现版本化缓存**

稳定函数边界：

- `load_upstream_tree()` 返回 `(tree_sha, source_paths)`。
- `cache_path_for(source_path, cache_dir, tree_sha)` 返回当前 SHA 下的缓存路径。
- `raw_url_for(tree_sha, source_path)` 返回固定到当前 upstream revision 的下载 URL。
- `prune_cache_versions(cache_dir, keep_tree_sha)` 只删除经过路径校验的旧版本目录。

目录为 `.tmp-user/danbooru-tag-supermarket-cache/<tree_sha>/data/tags/...`。源文件下载固定到相同 upstream revision，避免 tree 与 master 混版。仅在所有源文件和六份 catalog 处理成功后清理其他 SHA 目录和旧无版本 `data/` 缓存；递归删除前验证 resolved candidate 仍是 cache_dir 的直接子目录。

- [ ] **Step 4: 运行测试、dry-run 并提交**

```powershell
..\..\..\python\python.exe tests\check_danbooru_tag_translation_sync.py
..\..\..\python\python.exe tools\sync_danbooru_tag_translations.py --dry-run
git add tools/sync_danbooru_tag_translations.py tests/check_danbooru_tag_translation_sync.py
git commit -m "fix: 按上游版本刷新翻译缓存"
```

<a id="task-13"></a>

### Task 13: 统一空格/下划线等价 Tag 的翻译

**Findings:** F-18

**Files:**

- Modify: `js/config/selector_tag_catalog/background.json`
- Create: `tests/check_selector_tag_catalog_consistency.py`

- [ ] **Step 1: 写 catalog 一致性失败检查**

逐份扫描六个 catalog。归一化规则为 trim、lowercase、下划线转空格、连续空白折叠；只在同一 catalog 内对“归一化键相同、原始拼写不同”的组要求 `label.zh` 和 `meaning.zh` 一致，不强制跨 section 的同名 Tag 使用相同翻译。

- [ ] **Step 2: 运行检查并确认 RED**

```powershell
..\..\..\python\python.exe tests\check_selector_tag_catalog_consistency.py
```

Expected: 报告 `shallow water` 和 `motion lines` 两组冲突。

- [ ] **Step 3: 修正两组翻译**

在 `background.json` 中统一：

```text
shallow water / shallow_water -> label.zh=浅水, meaning.zh=浅水
motion lines / motion_lines   -> label.zh=动态线条, meaning.zh=动态线条
```

保留两种原始 tag、分类、别名和来源，不做去重删除。

- [ ] **Step 4: 运行检查并提交**

```powershell
..\..\..\python\python.exe tests\check_selector_tag_catalog_consistency.py
git add js/config/selector_tag_catalog/background.json tests/check_selector_tag_catalog_consistency.py
git commit -m "res: 统一等价标签翻译"
```

<a id="task-14"></a>

### Task 14: 更新文档并清理格式问题

**Findings:** F-19、Git 与格式规范第 3 项

**Files:**

- Modify: `README.md:185`
- Modify: `docs/DEVELOPMENT.md`
- Modify: `docs/superpowers/specs/2026-07-06-custom-item-active-tags-design.md:26`

- [ ] **Step 1: 更新 Prompt Plus 字段数量**

README 把“五个 tag 字段”改为“六个 Tag 分区”，明确列出 `prompt_tags`、`artist_tags`、`character_tags`、`clothing_tags`、`pose_tags`、`background_tags`。

- [ ] **Step 2: 更新收藏和角色缓存开发文档**

`docs/DEVELOPMENT.md` 记录七个 section API、`user/anima_tools/favorites/` envelope、revision/409 契约、无旧格式兼容、角色 meta 生成与 IndexedDB fallback。

- [ ] **Step 3: 删除尾随空格**

修复 `2026-07-06-custom-item-active-tags-design.md` 示例行 `alpha, beta, ` 的尾随空格，同时保持示例语义，可用 fenced code 中无尾随空格的等价展示。

- [ ] **Step 4: 运行格式检查并分开提交**

```powershell
git diff --check
git add README.md docs/DEVELOPMENT.md docs/superpowers/specs/2026-07-06-custom-item-active-tags-design.md
git diff --cached --check
git commit -m "doc: 更新标签分区与收藏文档"
git diff --check origin/main...HEAD
```

不改写历史提交 `2771432`。后续所有新提交继续遵循 `<type>: <简短描述>`。

<a id="task-15"></a>

### Task 15: 全量自动化和真实 ComfyUI 验证

**Files:**

- Verify only; 发现回归时回到对应任务新增 RED 测试，不在本任务堆叠临时修复。

- [ ] **Step 1: 运行完整自动化测试**

```powershell
npm test
..\..\..\python\python.exe -m py_compile nodes.py favorites_store.py anima_lora_api.py
..\..\..\python\python.exe tests\check_favorites_section_storage.py
..\..\..\python\python.exe tests\check_favorites_tag_metadata.py
..\..\..\python\python.exe tests\check_prompt_tag_selector.py
..\..\..\python\python.exe tests\check_danbooru_tag_translation_sync.py
..\..\..\python\python.exe tests\check_character_official_data_metadata.py
..\..\..\python\python.exe tests\check_selector_tag_catalog_consistency.py
```

Expected: 所有命令 exit `0`，Node test 输出零失败。

- [ ] **Step 2: 运行语法、JSON、locale 和格式检查**

```powershell
Get-ChildItem js -File -Filter *.js | ForEach-Object { node --check $_.FullName }
Get-ChildItem js/config/selector_tag_catalog -File -Filter *.json | ForEach-Object { Get-Content -Raw $_.FullName | ConvertFrom-Json | Out-Null }
Get-Content -Raw js/character_official_data.meta.json | ConvertFrom-Json | Out-Null
node --input-type=module -e 'import fs from "node:fs"; const flatten=(value,prefix="",out=[])=>{if(value&&typeof value==="object"&&!Array.isArray(value)){for(const key of Object.keys(value).sort()) flatten(value[key],prefix?`${prefix}.${key}`:key,out)}else out.push(prefix); return out}; const en=JSON.parse(fs.readFileSync("locales/en/nodeDefs.json","utf8")); const zh=JSON.parse(fs.readFileSync("locales/zh/nodeDefs.json","utf8")); const a=flatten(en),b=flatten(zh); if(JSON.stringify(a)!==JSON.stringify(b)){console.error("nodeDefs key structure mismatch"); process.exit(1)} console.log(`nodeDefs keys: ${a.length}`);'
git diff --check origin/main...HEAD
```

- [ ] **Step 3: 启动隔离 ComfyUI**

```powershell
Set-Location E:\AiDraw\ComfyUI-aki-v2\ComfyUI
..\python\python.exe main.py --listen 127.0.0.1 --port 8190 --disable-all-custom-nodes --whitelist-custom-nodes Comfyui-Anima-Tools --disable-auto-launch
```

访问 `http://127.0.0.1:8190`，保持服务器运行到所有浏览器验证结束。

- [ ] **Step 4: 验证收藏与并发**

检查七个 section 的迁移数量；跨 selector 交错保存不会互相覆盖；两个页面基于同一旧 revision 保存时，后一个收到冲突、回滚并刷新最新数据；Tag 从 A 移到 B 只在 popover 外部点击时提交；删除 group 保存期间不能写回旧 ID。

- [ ] **Step 5: 验证 selector 和 Tag 编辑**

覆盖普通/Tagged 节点的创建、工作流保存重载、手动 widget 编辑、自定义项预填、空 replace、历史恢复、重复开关 modal、画师选择/取消/清空、画师自定义 raw、基础 selector 固定追加，以及旧 `mode=override` 工作流加载后按 append 执行。

- [ ] **Step 6: 验证角色缓存**

首次无 IndexedDB 时等待本地数据校验后再显示卡片；刷新页面后命中 IndexedDB 且不读取大 JSON；模拟新版本加载失败时使用旧有效缓存；清空缓存并模拟失败时不显示卡片且 Retry 可恢复；单项无官方 tags 时只输出 trigger；滚动前图片不加载。

- [ ] **Step 7: 验证中英文和 catalog retry**

三个语言下拉切换无 Console 异常，Tag 视图无缺失中文；首次 catalog 请求失败后再次打开可恢复。最终检查浏览器 Console 无新增错误或未处理 Promise rejection。

- [ ] **Step 8: 最终工作区审计**

```powershell
Set-Location E:\AiDraw\ComfyUI-aki-v2\ComfyUI\custom_nodes\Comfyui-Anima-Tools
git status --short
git log --oneline origin/main..HEAD
git diff --check origin/main...HEAD
```

确认没有提交 `user/` 数据、IndexedDB 导出、缓存目录、临时迁移文件或日志。只有全部验证通过后才进入合并评估。
