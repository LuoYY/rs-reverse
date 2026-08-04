# nx 纯算法攻坚状态报告（2026-08-04）

## 一、已攻克（100% 验证）

| 模块 | 状态 | 证据 |
|---|---|---|
| 拉 412 + 解析 nsd/cd | ✅ | 外网代理 CONNECT + TLS |
| cd 派生 keys | ✅ | keys[2]==keys2（48B 完全一致，743） |
| 明文 basearr 公式 | ✅ 94% | cap = b86[2:2+len]，仅 16k+8 标记位差异（AgentB 验证） |
| base 结构解析 | ✅ | [0-21]固定头 + [22-28]会话段 + [29-67]固定段 + [68:92]加密段 + [92+]固定尾 |
| base[0-67] 纯算法构造 | ✅ | 固定头+固定段硬编码，[22-28]可任意（767/770/771：200） |
| cookie 重构链路 | ✅ | 530/534：当前会话 base + Node 重构 → 200 |
| numarrEncrypt==nxEncrypt | ✅ | 777：同结果 |
| WAF 层绕过 | ✅ | 模板 base → 400（非 412），当前 base → 200 |

## 二、最后障碍（1 个）

**base[22:] 的 cd 绑定加密段**（[68:92] 24B 或 basearrB[24-29] 6B）：
- 内层 VM 一次性加密输出，各部分内部自洽关联
- 不能 b86 切片（778：412）、不能跨 cd（773：400）、不能随机（766：412）
- 同 nsd 换真实会话值 OK（767：200）
- 根源：`execNumberByTime` 等环境检测值编码

## 三、三条攻坚路径评估

### 路径 1：内层 VM 反编译/模拟（AgentA）
- 外层 dispatcher 环境检测 `_$ib` 30+ 处 → 沙箱死循环
- 操作码表（99 handlers）+ VM 程序已捕获
- **难点**：环境检测等价于浏览器模拟
- **潜力**：最高（彻底解决）

### 路径 2：动态段公式推导（AgentB）
- basearrB[24-29] 与 cd/keys 无线性关系
- 已排除 XOR/哈希/时间戳/切片
- **难点**：内层加密无公式
- **潜力**：中

### 路径 3：浏览器采集 + Node 重构（已验证 200）
- 530/534 已证明可行
- **非纯算法**（采集依赖浏览器）
- **可用作**：过渡方案/验证标准

## 四、关键资产

| 资产 | 位置 |
|---|---|
| 3 会话 basearr | /tmp/basearr_dataset.json |
| 10 会话 cd/base | /tmp/nx_cd_base_pairs.json |
| 8 会话 cap/base | /tmp/agentB/nx_triple_dataset.json |
| P cookie | /tmp/nx_browser_P_full.txt |
| VM 状态 | /tmp/nx_browser_cS_state_dump.json |
| 操作码表 | wb-pmos-nx/captures/nx_opcode_table.json |
| 分析文档 | wb-pmos-nx/BASEARR_FINAL_ANALYSIS.md |
