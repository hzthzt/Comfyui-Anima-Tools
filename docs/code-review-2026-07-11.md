# 当前分支代码审查报告

## 1. 审查摘要

| 项目 | 内容 |
| --- | --- |
| 审查日期 | 2026-07-11（Asia/Shanghai） |
| 当前分支 | `codex/prompt-tag-editor` |
| 对比基线 | `origin/main` (`4e72c30`) |
| 当前提交 | `001cc41` |
| 审查范围 | `origin/main...HEAD`，共 41 个提交、49 个文件 |
| 变更规模 | 约 1,017,158 行新增、1,903 行删除 |
| 工作区状态 | 干净，无未提交修改 |
| 合并建议 | **暂不合并** |

本分支新增 Tagged 节点、统一 Tag 编辑器、通用 Prompt Tag 选择器、Tag 收藏分组、运行时随机同步和六份标签词库。现有自动化测试全部通过，但审查发现多条未被测试覆盖的用户可见回归，其中包括错误 Prompt 输出、标签编辑失效和收藏数据丢失。

### 严重程度统计

| 严重程度 | 数量 | 说明 |
| --- | ---: | --- |
| P1 | 5 | 建议作为合并阻断项处理 |
| P2 | 11 | 应在发布前修复并补回归测试 |
| P3 | 3 | 文档、数据或维护性问题 |

## 修复决策与计划索引

具体实施步骤见：[代码审查问题修复实施计划](./superpowers/plans/2026-07-11-code-review-remediation.md)。计划保持当前 `codex/prompt-tag-editor` 分支，不改写既有提交历史。

| Finding | 状态 | 计划任务 |
| --- | --- | --- |
| F-01 | **延期**：纳入后续随机系统重做，本轮不修改现有随机语义 | [延期说明](./superpowers/plans/2026-07-11-code-review-remediation.md#deferred-f01) |
| F-02 | 计划修复 | [Task 4](./superpowers/plans/2026-07-11-code-review-remediation.md#task-04) |
| F-03 | 计划修复，自定义画师内容按原文处理 | [Task 7](./superpowers/plans/2026-07-11-code-review-remediation.md#task-07) |
| F-04 | 计划修复，保持点击即应用 | [Task 7](./superpowers/plans/2026-07-11-code-review-remediation.md#task-07) |
| F-05 | 计划修复，使用 IndexedDB 最后有效缓存 | [Task 8](./superpowers/plans/2026-07-11-code-review-remediation.md#task-08) |
| F-06 | 计划修复 | [Task 9](./superpowers/plans/2026-07-11-code-review-remediation.md#task-09) |
| F-07 | 计划修复 | [Task 4](./superpowers/plans/2026-07-11-code-review-remediation.md#task-04) |
| F-08 | 计划修复 | [Task 5](./superpowers/plans/2026-07-11-code-review-remediation.md#task-05) |
| F-09 | **扩大处理**：前后端与持久化全部按 section 拆分 | [Task 1](./superpowers/plans/2026-07-11-code-review-remediation.md#task-01)、[Task 2](./superpowers/plans/2026-07-11-code-review-remediation.md#task-02)、[Task 3](./superpowers/plans/2026-07-11-code-review-remediation.md#task-03) |
| F-10 | 计划修复 | [Task 9](./superpowers/plans/2026-07-11-code-review-remediation.md#task-09) |
| F-11 | 计划修复 | [Task 11](./superpowers/plans/2026-07-11-code-review-remediation.md#task-11) |
| F-12 | **调整处理**：删除六类基础 selector 的 override/mode，统一固定追加 | [Task 10](./superpowers/plans/2026-07-11-code-review-remediation.md#task-10) |
| F-13 | 计划修复 | [Task 5](./superpowers/plans/2026-07-11-code-review-remediation.md#task-05) |
| F-14 | 计划修复 | [Task 5](./superpowers/plans/2026-07-11-code-review-remediation.md#task-05) |
| F-15 | 计划修复 | [Task 6](./superpowers/plans/2026-07-11-code-review-remediation.md#task-06) |
| F-16 | 计划修复 | [Task 4](./superpowers/plans/2026-07-11-code-review-remediation.md#task-04) |
| F-17 | 计划修复，使用 upstream tree SHA 版本缓存 | [Task 12](./superpowers/plans/2026-07-11-code-review-remediation.md#task-12) |
| F-18 | 计划修复，保留等价拼写并统一翻译 | [Task 13](./superpowers/plans/2026-07-11-code-review-remediation.md#task-13) |
| F-19 | 计划修复 | [Task 14](./superpowers/plans/2026-07-11-code-review-remediation.md#task-14) |

## 2. 主要发现

### F-01 [P1] Tagged 随机节点的标签编辑不会进入最终输出

> **处理状态：延期。** 本轮保持现有随机语义，后续在随机系统重做中统一处理。详见[计划中的延期说明](./superpowers/plans/2026-07-11-code-review-remediation.md#deferred-f01)。

位置：[nodes.py:1768](../nodes.py#L1768)、[nodes.py:1778](../nodes.py#L1778)

入队钩子同时处理普通和 Tagged Composer，并在每次入队时无条件调用 `_resolve_prompt_data()`，随后覆盖 `inputs["resolved_prompt"]`。因此用户在 `Anima Prompt Random Draw (Tagged)` 中禁用、删除或新增的标签无法参与最终输出。

最小复现中，入队前的 `manual_tag, ` 被改写为 `fresh_random, `；Tag state 中 `manual_tag` 也被转为禁用。该行为与 README 中“禁用标签不会参与最终输出”的说明冲突。

建议区分“重新随机”和“执行当前编辑结果”，或在随机结果生成后应用 Tagged state 中的启用/禁用状态，并增加入队处理器集成测试。

### F-02 [P1] 将 Tag 收藏从唯一分组移到另一分组会删除收藏

位置：[anima_selector_tag_library.js:358](../js/anima_selector_tag_library.js#L358)、[anima_selector_tag_library.js:907](../js/anima_selector_tag_library.js#L907)

分组弹窗逐个提交 checkbox 变化。用户先取消唯一的 A 组时，`setSelectorTagFavoriteGroups()` 因 `groupIds` 为空而从 `tagItems` 删除条目；随后勾选 B 只修改弹窗持有的失效对象，无法重新插入收藏。

复现结果为 checkbox 显示 B 已选，但 `tagItems=[]`。如果条目是自定义 Tag，其文本会永久丢失。应原子提交整个 checkbox 集合，或允许非空分组选择重新插入条目。

### F-03 [P1] 画师自定义卡片内容被错误解释为画师名

位置：[anima_artist_selector.js:2419](../js/anima_artist_selector.js#L2419)、[nodes.py:81](../nodes.py#L81)

当前卡片点击路径直接把 `customContent` 写入 `artist_tags`，没有保留基线实现使用的 `_raw_:` 编码。后端会为所有非 raw token 添加 `@` 前缀。

复现：自定义内容 `masterpiece, red hair` 最终输出 `@masterpiece, @red hair, `；使用 `_raw_:masterpiece, _raw_:red hair` 才能得到预期结果。该问题同时影响普通和 Tagged 画师节点，以及 Prompt Plus 中的画师分区。

### F-04 [P1] 取消画师卡片只改变视觉状态，不会删除输出标签

位置：[anima_artist_selector.js:1176](../js/anima_artist_selector.js#L1176)、[anima_artist_selector.js:2420](../js/anima_artist_selector.js#L2420)

卡片点击处理器在判断 `selectedArtists` 前无条件调用 `applySelectorTagsToWidget()`，之后才切换视觉选中状态。再次点击已选卡片时，卡片显示为未选，但 widget 仍保留或重新应用该画师。“Clear Selected”同样只清理本地 Set。

基线中的 `Confirm & Apply` 同步路径已被删除，当前没有后续步骤把取消状态写回 widget。应统一以 widget/Tag state 为真实状态源，并为选择、取消和全部清除增加交互测试。

### F-05 [P1] 角色卡片输出依赖官方数据是否完成异步加载

位置：[anima_character_selector.js:2706](../js/anima_character_selector.js#L2706)、[anima_character_selector.js:3098](../js/anima_character_selector.js#L3098)

官方角色数据仅在 `mouseenter` 时异步附加到 item，但点击处理器同步计算并立即应用当前标签。首次快速点击、触摸操作或异步请求较慢时会使用粗略的 gender/hair/eye 回退值；加载完成后再次点击会生成不同结果。

以 Hatsune Miku 为例，加载前只有 `1girl, blue hair, blue eyes` 等粗略标签，加载后才包含 `aqua eyes, very long hair, twintails, detached sleeves` 等官方标签。点击路径应等待或直接读取本地官方数据，不能把 hover 作为正确输出的前置条件。

### F-06 [P2] 三个选择器的语言下拉会抛出 `ReferenceError`

位置：[anima_clothing_selector.js:919](../js/anima_clothing_selector.js#L919)、[anima_background_selector.js:917](../js/anima_background_selector.js#L917)、[anima_pose_selector.js:921](../js/anima_pose_selector.js#L921)

三处 handler 都给未声明的 `tagCatalog` 赋值。ES module 使用严格模式，切换“中英双语/仅英文”时会在此中断，后续 `renderSidebar()` 和 `renderCurrentPage()` 不会执行。

当前实现已经改用 `tagCatalogProvider`，残留的 `tagCatalog = null` 应移除或改为正确的 provider 更新逻辑，并覆盖三个下拉控件的运行时测试。

### F-07 [P2] 分组内搜索会隐藏所有自定义收藏 Tag

位置：[anima_selector_tag_library.js:492](../js/anima_selector_tag_library.js#L492)

只有查询为空时，过滤逻辑才通过 `getSelectorTagFavoriteGroupItems()` 合并自定义 Tag；输入查询后数据源退回纯 catalog。

复现：自定义收藏 `sparkle aura` 在默认组空查询时可见，搜索 `sparkle` 后结果为空。搜索源应同时包含当前组的自定义条目和 catalog 条目。

### F-08 [P2] 非 Tagged 节点的新建自定义项会预填过期内容

位置：[anima_tag_editor.js:806](../js/anima_tag_editor.js#L806)、[anima_artist_selector.js:1928](../js/anima_artist_selector.js#L1928)

五个选择器都无条件使用 `getActiveSelectorTagText()` 生成自定义项预填值。该函数读取并缓存 Tag field，但普通节点不会安装文本同步监听器，后续 widget 编辑或卡片应用不会更新缓存。

复现：首次值为 `alpha`，随后手动改成 `beta` 并追加 `gamma`，widget 已变为 `beta, gamma`，再次预填仍返回 `alpha`。普通节点应直接读取当前 widget 文本，或在初始化缓存后保持双向同步。

### F-09 [P2] Prompt 收藏保存可能覆盖其他选择器的新收藏

位置：[anima_prompt_tag_selector.js:96](../js/anima_prompt_tag_selector.js#L96)、[nodes.py:1909](../nodes.py#L1909)

Prompt 弹窗 POST 的是首次 GET 得到的整个 `favoritesConfig`，后端又覆盖请求中出现的每个 section。两个标签页或两个长时间打开的弹窗交错保存时，后保存的旧快照会覆盖其他选择器已经成功保存的新收藏。

前端应只提交当前拥有的 section，例如 `{ "prompt": favoritesConfig.prompt }`；后端也应考虑 revision、锁或更细粒度的更新语义。

### F-10 [P2] 新 Tag 视图主体缺少中文翻译

位置：[anima_selector_tag_library.js:383](../js/anima_selector_tag_library.js#L383)、[i18n.js:211](../js/i18n.js#L211)

新 UI 使用的 `Cards`、`Tag Categories`、`All Tags`、`Tag Groups`、`Search tags...`、`Create Favorite Tag`、`Add to Tag Group`、空态和分页统计等约 25 个键没有加入翻译表。

`translateForLanguage("zh", key)` 对这些键全部原样返回英文，导致 Tags 视图大面积中英混排。应增加静态测试，确保所有字面量 `t("...")` 键均存在于中英文表中。

### F-11 [P2] 目录首次加载失败后无法自动恢复

位置：[anima_selector_tag_catalog_config.js:18](../js/anima_selector_tag_catalog_config.js#L18)

实现缓存整个 Promise，HTTP 非成功状态、网络异常或 JSON 解析错误最终都解析为 `null`，但缓存不会被驱逐。服务恢复后再次打开同一 section 仍返回空目录，只能刷新页面。

复现中第一次请求失败、第二次请求可成功时，`fetchImpl` 总调用次数仍为 1。应只缓存成功结果，或在失败时删除与当前 Promise 对应的缓存项。

### F-12 [P2] 通用 Prompt 选择器的空 `override` 行为与其他选择器相反

位置：[nodes.py:627](../nodes.py#L627)

当 `prompt_tags` 为空且存在 `opt_prompt` 时，通用 Prompt 选择器的 `override` 模式仍返回上游 `opt_prompt`。画师、角色、服装、背景和姿势选择器在相同条件下都返回空字符串。

最小复现结果为前五个节点输出 `""`，通用 Prompt 节点输出 `"upstream"`。这与“完全覆盖”的 tooltip 不一致，应统一语义并补充空选择测试。

### F-13 [P2] 空值 replace 操作无法清除已有标签

位置：[anima_tag_editor.js:98](../js/anima_tag_editor.js#L98)、[anima_tag_editor.js:400](../js/anima_tag_editor.js#L400)

`applySelectorTagsToWidget(..., "", { mode: "replace" })` 先把 `field.tags` 置空，随后同步时 `getTagFieldState()` 又从尚未清空的 widget 文本水合旧标签。

复现：对 `alpha, ` 执行空 replace 后 widget 仍为 `alpha, `。应记录 field 已初始化状态，或先清空 widget 再进行同步。

### F-14 [P2] 手动重新添加已删除标签后仍保留同名历史项

位置：[anima_tag_editor.js:304](../js/anima_tag_editor.js#L304)、[anima_tag_editor.js:326](../js/anima_tag_editor.js#L326)、[anima_tag_editor.js:394](../js/anima_tag_editor.js#L394)

Selector 点击路径会清理匹配 history，但手动输入和文本框同步路径不会。删除 `alpha` 后在输入框重新添加 `alpha`，该标签会同时出现在启用区和历史区，并继续显示“恢复”操作。

所有激活 incoming tag 的路径应通过同一个入口移除匹配历史项。

### F-15 [P2] 反复开关 Tagged 选择器会保留 detached manager DOM

位置：[anima_tag_editor.js:858](../js/anima_tag_editor.js#L858)、[anima_artist_selector.js:2487](../js/anima_artist_selector.js#L2487)

每次打开 Tagged 弹窗都会创建新的 selector manager 并压入节点注册表；关闭弹窗只删除 overlay，没有注销 manager。只有后续标签同步时才会过滤断开的元素。

连续开关三次且不编辑标签时，节点仍保留 3 个 `isConnected=false` 的 manager、DOM 子树和事件处理器。manager 应提供显式 `dispose()`，并在所有 modal close 路径调用。

### F-16 [P2] 删除分组保存期间可把已删除 group id 写回

位置：[anima_selector_tag_library.js:472](../js/anima_selector_tag_library.js#L472)、[anima_selector_tag_library.js:713](../js/anima_selector_tag_library.js#L713)

删除分组后，代码等待异步保存完成才切换过滤器。保存未完成期间旧分组视图仍可操作，标签行会使用陈旧的 `targetGroupId()` 再次收藏到已删除组，形成不可见的孤儿记录。

应在等待保存前立即切换/禁用旧视图，并在写入时验证目标 group id 仍存在。

### F-17 [P3] Danbooru 同步缓存不会随上游内容更新

位置：[sync_danbooru_tag_translations.py:170](../tools/sync_danbooru_tag_translations.py#L170)

脚本每次都会读取上游当前文件列表，但只要本地缓存文件存在就永久复用其内容，没有 commit、ETag、TTL 或 `--refresh` 机制。上游同路径 YAML 更新后，再次同步仍会使用旧翻译。

建议按上游 tree SHA 隔离缓存，或增加显式刷新选项。

### F-18 [P3] `shallow_water` 的中文标签明显错误

位置：[background.json:49258](../js/config/selector_tag_catalog/background.json#L49258)

`shallow_water` 的 `label.zh` 和 `meaning.zh` 被写为“模糊的前景”，与英文标签及相邻的 `shallow water` 条目不符。应修正数据并增加归一化重复标签的冲突检查，避免空格版和下划线版出现不同翻译。

### F-19 [P3] README 对 Prompt Plus 的 Tag 字段数量描述过期

位置：[README.md:185](../README.md#L185)

代码已经加入 `prompt_tags`，Tagged Prompt Plus 实际管理通用 Prompt、画师、角色、服装、姿势和背景共六个 Tag 分区；README 仍写为“五个 tag 字段”。

## 3. Git 与格式规范

> **处理决定：** 按当前任务要求保持 `codex/prompt-tag-editor` 分支，不重写提交 `2771432`，也不强推历史；仅修复尾随空格，后续新增提交遵循 `<type>: <简短描述>`。

1. 当前分支名 `codex/prompt-tag-editor` 不符合项目要求的 `feat/...`、`fix/...`、`refactor/...` 等类型前缀格式。
2. 提交 `2771432 选择器增加tag大类别模式` 缺少 `<type>:` 前缀。
3. `git diff --check origin/main...HEAD` 失败：[custom-item-active-tags-design.md:26](superpowers/specs/2026-07-06-custom-item-active-tags-design.md#L26) 存在尾随空格。

## 4. 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm test` | 通过，60/60 |
| 便携包 Python 3.12 `py_compile` | 通过 |
| `tests/check_danbooru_tag_translation_sync.py` | 通过 |
| `tests/check_favorites_tag_metadata.py` | 通过 |
| `tests/check_prompt_tag_selector.py` | 通过 |
| 所有根目录 JS 文件 `node --check` | 通过 |
| 六份 catalog JSON 解析 | 通过 |
| 中英文 `nodeDefs.json` 键结构一致性 | 通过 |
| `git diff --check origin/main...HEAD` | 失败，1 处尾随空格 |

现有测试主要覆盖纯函数、Tag 编辑器局部行为和源码一致性，没有覆盖 ComfyUI 入队 handler、真实 selector modal 生命周期、语言下拉、快速/触摸角色点击和跨弹窗收藏保存。

## 5. 建议处理顺序

1. F-01 延期到后续随机系统重做，本轮不修改现有随机语义。
2. 先完成 F-09 的 section 后端、前端 Store 和当前机器一次性迁移，建立后续收藏修复依赖的保存契约。
3. 按共享根因修复 F-02、F-07、F-08、F-13、F-14、F-15、F-16，再处理 F-03、F-04、F-05、F-06、F-10、F-12。
4. 独立修复 F-11、F-17、F-18、F-19 和格式问题，确保 `git diff --check` 通过。
5. 在真实 ComfyUI 中验证普通/Tagged 节点的创建、保存、重载、选择、取消、清空、历史恢复、收藏冲突、角色缓存和中英文界面。
6. 完成上述验证后再考虑合并。

## 6. 审查限制

本次审查未启动真实 ComfyUI 浏览器界面，交互问题通过源码数据流、jsdom/Node 测试工具和最小复现脚本验证。最终发布前仍需进行真实 ComfyUI 端到端验证。
