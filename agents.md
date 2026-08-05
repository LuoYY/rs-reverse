# agents.md — 项目规范（Agent 必须遵守）

本文件是 rs-reverse_glm 工作区的 Agent 协作规范，所有 AI Agent（含 Team 成员、子代理、脚本执行）必须遵守。

## 一、临时文件管理规范（硬性要求）

1. **禁止在 `/tmp/` 下创建任何文件**（脚本、数据、日志、中间产物等一律禁止）。
   - 原因：`/tmp` 会被系统清理（重启/清理任务导致文件丢失），历史教训：大量 nx 反编译数据曾存于 `/tmp`，险些丢失。
2. **临时文件必须放在项目文件夹内的 `tmp/` 或 `tmp_<主题>_files/` 目录**：
   - 通用临时产物 → `<工作区>/tmp/`
   - 按主题隔离的临时产物 → `<工作区>/tmp_<主题>_files/`（如 `wb-pmos-nx/anchor_analysis_files/`、`tmp_nx_anchor_files/`）
3. **不得删除临时文件**：分析过程产生的捕获数据、插桩结果、反编译产物、中间 JSON/JS 等都属于资产，**禁止清理/删除**，避免后续会话丢失上下文。
4. **文档引用路径必须指向项目内文件**：所有文档（*.md）中引用的数据文件路径，必须使用项目内相对路径（如 `wb-pmos-nx/anchor_analysis_files/nx_*.json`），禁止写 `/tmp/...` 路径。
5. **已完成文件迁移**：历史遗留于 `/tmp` 的 nx 反编译数据已迁移至 `wb-pmos-nx/anchor_analysis_files/`，后续新增数据一律不再回写 `/tmp`。

## 二、逆向工程规范（用户硬约束）

- **必须纯算法完成 nx 全链路**（cookie + query + basearr 动态段）——不接受非纯算法方案（浏览器辅助采集、CDP、patchright 参与生成链路均不接受）。浏览器仅用于验证/分析，生成必须纯 Node/纯 Go 跑外层 VM。
- 不接受 CDP 代理方案；目标：纯算法生成 query 参数，不依赖浏览器。
- 学习 xj 纯算法路径（fetchChallenge 纯 HTTP + RunCoderFull 纯 Go 跑外层 VM 生成 keys/basearr + generateCookie + GenQuery），不能降低要求。

## 三、代码与文档规范

- 文档优先：重大进展/结论必须写入文档（ANCHOR_ANALYSIS.md、FINDINGS_*.md 等）与 `.codebuddy/memory/YYYY-MM-DD.md`。
- 工作记忆：每次完成任务后须在 `.codebuddy/memory/` 追加记录；长期事实更新至 `MEMORY.md`。
- 临时调试脚本（`/tmp` 历史遗留除外）一律放项目内，用完保留不删（见第一条）。
