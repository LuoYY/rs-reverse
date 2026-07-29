# 专项：纯协议 100% 通过率 — 密钥生成算法逆向拆解计划

> 计划 ID：`pure-protocol-100-keygen-reversing`
> 创建日期：2026-07-28
> 目标站点：`https://pmos.xj.sgcc.com.cn:20080/`
> 执行方式：多 agent 并行（团队 `pure-protocol-100`）

---

## 0. 背景与已确证事实（不可推翻的约束）

### 0.1 问题定义
当前管线 `pmos_xj_client.js`（方案B 重试）通过率 **30%**。根因已彻底定位：

- cookie 加密密钥（外层 **keys16** / 内层 **keys17**）由**内层动态代码运行时生成**，不在 cd 静态解密区；
- 管线用 cd 静态 ans keys 近似 → 70% 的 cd 密钥错误 → 30% 通过率（**密钥问题，非指纹问题**）；
- 16 字节滑动窗口枚举反解 keys16/keys17 全部失败（test_enum_keys16.js / test_enum_keys17.js）。

### 0.2 已确证事实清单
| # | 事实 | 证据 |
|---|------|------|
| F1 | 管线加解密往返完全可逆、结构 100% 正确 | test_dump_outer.js uuidOk=true |
| F2 | basearr（含真实 [0] 段指纹）合法 244 字节，已通过服务端校验 | 30% 通过的那部分请求 |
| F3 | 服务端为确定性校验：同 cookie 重放必 200 | test_cookie_replay.js 10/10 |
| F4 | 412 的 cookie 用真实浏览器重放也 412（cookie 本身坏，非环境） | 对照实验 |
| F5 | keys16 跨 cd 恒定（站点常量，如 `[21,144,168,179,...]`）；keys17 随 cd 变前 8 字节、后 8 字节恒定 | genKeys 多样本对比 |
| F6 | jsdom 跑内层动态代码密钥 100% 正确（连续 5 次全 200），但 jsdom [0] 指纹被服务端拒（cookie 279 字符 vs 真实 428） | jsdom 实验 |
| F7 | 指纹与密钥两因素正交 | 管线/jsdom/浏览器三方对照 |
| F8 | 443 与 :20080 外层 VM 字节码相同 | `_$dJ[1]` 一致 |

### 0.3 纯协议 100% 公式
```
管线 basearr（真实 [0] 指纹，已过校验）+ 动态代码生成的正确 keys16/keys17 = 100% 通过率
```

### 0.4 红线
- 最终方案**不依赖真实浏览器**（Patchright/jsdom 仅作分析/对照）；
- 每阶段必须有可独立验证的中间产物，禁止"一口气干到底再验证"。

---

## 1. 双轨技术路径

### 路径 A：算法还原（主路径，治本）
解析内层 VM（JSVMP）的 dispatcher + 操作码语义，追踪 keys16/keys17 的生成指令流，将密钥生成逻辑还原为**纯 JS 算法**，输入 cd/nsd 即可离线算出正确密钥。

方法论（hello_js_reverse_skill 四板斧）：Hook → 插桩 → 日志分析 → 源码级插桩。

### 路径 B：沙箱执行（并行 fallback，治标但快）
内层动态代码在 Node `vm` 沙箱中完整执行，**只 hook 密钥生成点导出 keys**，不取指纹（指纹仍由管线 basearr 提供）。指纹采集与密钥生成分离，绕开 F6 的 jsdom 指纹问题。

### 决策点
- 路径 B 先通则立即接入管线 → 直接冲到 100%（Phase 5）；
- 路径 A 产出纯算法后替换路径 B，去掉沙箱依赖，成为最终形态。

---

## 2. 现有资产清单

| 资产 | 路径 | 用途 |
|------|------|------|
| 外层 VM 沙箱 | `extract_dyncode_20080.js`（runOuterVM） | 提取 cp3/dynCode |
| dispatcher 提取器 | `extract_dispatchers.js` | main dispatcher 操作码 handler 提取 |
| 动态代码解码器 | `decode_dynamic.js` | cp0/cp2 数组替换还原 |
| 内层 VM 样本 | `output/capture-20080/extracted-dyn-code.js`（291KB IIFE） | 逆向主对象 |
| 浏览器动态代码 | `output/capture-20080/browser-dyn-code-net.js`（769KB） | 对照 |
| 外层 js | `example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js` | 对照 |
| 管线核心 | `src/handler/Coder.js`、`Cookie.js`、`parser/tscd.js`（genKeys）、`parser/common/runTask.js`（dynamicExec） | 集成点 |
| 生产客户端 | `pmos_xj_client.js`（30% 基线） | 验收基线 |
| 测试群 | 30+ `test_*.js` | 复用 |

环境：Node 22（nvm v22.22.0）、`NODE_OPTIONS=--dns-result-order=ipv4first`、`NODE_PATH=.../rs-reverse_kimi/node_modules`（jsdom/patchright）、got-scraping（Chrome131 TLS）。

---

## 3. 阶段拆解

### Phase 1：内层 VM 结构解析 【路径A】
**目标**：拿到内层 VM 的完整操作码表与 dispatcher 结构图。

任务：
1. 用 `extract_dispatchers.js` 对 `extracted-dyn-code.js` 提取 main dispatcher（while(1) + `_$xx===N` 分支）；
2. 统计操作码数量、每个 handler 的操作语义（栈操作/算术/对象访问/调用）；
3. 识别常量区（cp0/cp2 类数组）与字符串解密函数；
4. 产出 dispatcher 结构图 + 操作码语义表。

**产出物**：`output/keygen/opcode-table.md` + `output/keygen/dispatcher-map.json`
**验收标准**：操作码覆盖 dispatcher 全部分支；每个操作码有语义注解；能手工单步推演任意短指令序列。
**预估**：中

### Phase 2：密钥生成点定位 【路径A】
**目标**：在内层 VM 指令流中定位 keys16/keys17 的生成位置与输入依赖。

任务：
1. 在 jsdom/浏览器中 Hook：在动态代码作用域内插桩，监控 16 字节与 17 字节数组的写入（Proxy/Object.defineProperty/数组写监控）；
2. 记录密钥写入时的 VM 指令偏移（pc）与操作数栈快照；
3. 从写入点反向数据流追踪：密钥字节 ← 哪些常量/输入（cd？nsd？时间戳？指纹字段？）；
4. 确认 keys16 恒定的原因（纯常量 or 由不变输入派生）与 keys17 前 8 字节随 cd 变化的派生关系。

**产出物**：`output/keygen/keygen-trace.md`（含指令偏移、栈快照、数据流图）
**验收标准**：明确回答"keys16/keys17 的每个字节由什么输入、经过什么运算得到"；给出从 cd/nsd 到密钥的完整依赖链。
**预估**：大（本专项核心难点）

### Phase 3：密钥算法纯 JS 还原 【路径A】
**目标**：把 Phase 2 的数据流还原为独立 JS 函数 `genRealKeys(cd, nsd) → {keys16, keys17}`。

任务：
1. 按数据流图逐段翻译 VM 指令为 JS；
2. 多样本验证：≥10 组不同 cd/nsd，还原算法输出与 jsdom 实跑密钥逐字节一致；
3. 边界验证：同一 cd 重复、跨时间、跨挑战页。

**产出物**：`src/handler/parser/genRealKeys.js` + `test_genrealkeys.js`
**验收标准**：10/10 样本逐字节一致。
**预估**：中（依赖 Phase 2 质量）

### Phase 4：沙箱执行导出密钥 【路径B，与 Phase 1-3 并行】
**目标**：内层动态代码在 Node vm 沙箱完整执行，hook 密钥生成点导出正确 keys。

任务：
1. 分析 `extracted-dyn-code.js` 的环境依赖清单（window/document/navigator 等被访问的字段）；
2. 构建最小 vm 沙箱 + 按需打环境补丁（只补到"密钥能算出来"即可，**不追求指纹真实**）；
3. hook 密钥导出点，输出 `{keys16, keys17}`；
4. 与 jsdom/浏览器实跑密钥对比验证。

**产出物**：`sandbox_keygen.js` + `test_sandbox_keygen.js`
**验收标准**：沙箱导出密钥与浏览器实跑密钥逐字节一致（≥5 样本）。
**预估**：中

### Phase 5：端到端集成（管线接入正确密钥）
**目标**：管线用真实密钥替换 cd 静态 ans keys。

任务：
1. 在 `runTask.js`/管线中接入 Phase 3 算法（优先）或 Phase 4 沙箱导出（fallback）；
2. basearr 保持现状（真实 [0] 指纹已合法）；
3. 全链路：拉 412 挑战页 → 提取 cp3 → 生成真实密钥 → basearr → Cookie 加密 → O+P 重放。

**产出物**：`pmos_xj_client_v2.js`
**验收标准**：连续 20 次请求 20× 200（无重试）。
**预估**：小

### Phase 6：100% 通过率验收
任务：
1. 连续 50 次全新会话（新 412 页 → 新 cookie）请求业务页 + API，统计通过率；
2. 稳定性：跨时段（早/晚）、跨网络重测；
3. 性能：单次 cookie 生成耗时评估。

**验收标准**：50/50 业务页+API 全 200，零重试。
**预估**：小

### Phase 7：固化与文档
任务：更新 `PMOS_XJ_20080_REPORT.md`、`MEMORY.md`；清理临时脚本；产出最终使用文档。

---

## 4. 多 agent 并行分工（团队 `pure-protocol-100`）

| Agent | 负责 | 阶段 |
|-------|------|------|
| `vm-struct-analyst` | 内层 VM dispatcher/操作码解析 | Phase 1 |
| `keygen-tracer` | 密钥生成点插桩定位 + 数据流追踪 | Phase 2 |
| `sandbox-executor` | 路径B 沙箱执行导出密钥 | Phase 4 |

主线（main）负责：计划维护、各 agent 成果整合、Phase 3/5/6/7 执行。

并行策略：
- 三个 agent 同时启动；Phase 1/2 成果互为补充（结构解析 ↔ 插桩定位交叉验证）；
- 路径B（sandbox-executor）若先通 → 主线立即做 Phase 5 集成冲 100%；
- 路径A 完成后替换路径B 为最终纯算法形态。

---

## 5. 风险与预案

| 风险 | 预案 |
|------|------|
| 内层 VM 操作码极多、还原工作量大 | 只还原密钥生成相关指令子集，不做全 VM 反编译 |
| 密钥依赖真实指纹字段（路径B 沙箱算不出） | 已从 F6 排除（jsdom 指纹不同但密钥 100% 对 → 密钥不依赖 [0!]![]!] 指纹） |
| 沙箱环境补丁陷进反检测死循环 | 按需最小补丁；卡顿时退而用插桩日志推导（路径A 反哺） |
| 动态代码每次挑战页不同（结构变） | 验证操作码表/算法跨样本稳定性；若结构随 cd 变则需参数化 |

---

*执行记录：各阶段完成后在此文档勾选并链接产出物。*
