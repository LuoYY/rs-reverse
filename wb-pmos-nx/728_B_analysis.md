# 728_B basearr 反推分析（2026-08-03）

## 核心结论

**basearr(138B) ≈ decodeB86(cd)[2:140]**，匹配 130/138（94%），7 个普通会话全部命中同 8 个差异位置。

```
basearr[i] = decodeB86(cd)[i+2]        （130/138 字节）
basearr[24+16k] = f(未确定)  k=0..7    （8 个标记位置）
```

### 证据
- 8 个样本（/tmp/agentB/nx_multi_dataset_v5.json，nsd=88247/119196/83540/81707/130825/112832/73823/98066，全部带 cd）
- 公式匹配：7/7 普通会话 130/138；差异位置恒为 `[24,40,56,72,88,104,120,136]`
- nsd=88247 是"多字节 UTF-8 解码路径"（basearr 含 58 个 >=128 值），公式不适用（它的 dh 输入含多字节序列）

### 生成链路确认
```
nsd/cd → 挑战 js(83bw0aTvAW7K) → scj/aebi → 应用 js(Dl5ApMEho6Yq)
       → eval dynCode(386788字符,内层VM) → dh(解码器输入) → pj解码器 → basearr
```
- 解码器 pj 已 Node 复现（714_reproduce_pj.js）：对 <128 值透传 → **普通会话 basearr == dh**
- basearr 值域 0-113（普通会话），0-255（多字节会话）

## 逐字节来源分析

| 位置 | 来源 | 说明 |
|------|------|------|
| [0] | b86[2] | 固定 113='q'（普通会话） |
| [1] | b86[3] | 4/5/7 随会话变 |
| [2],[3] | b86[4],[5] | 32,4 固定 |
| [4..23] | b86[6..25] | 随会话变（与 cd 相关） |
| **24+16k (k=0..7)** | **f(未定)** | 与 b86 该位置不同，**来源不是 keys2/keys17/keys段header/keys[i]** |
| 其他 | b86[26..140] | 与 cd 强相关 |

### 标记位置 (24+16k) 排除项
- ❌ 不是 b86 该位置值（112832/73823 两会话 b86 在这些位置不同但 basearr 完全相同）
- ❌ 不是派生 keys[i]（112832 vs 73823 keys 几乎全不同但 basearr 相同）
- ❌ 不是简单校验和（sum/xor/crc8 前16B 均 0% 命中）
- ❌ 不是 MD5/SHA1/SHA256/CRC32 对前缀/全段的哈希
- ✅ 与 cd 前缀 b86[2:26]（cd 前 35 字符）正相关：112832/73823 前缀相同 → markers 相同 [57,36,57,57,57,39,0,57]；6 组不同前缀 → 6 组不同 markers
- ✅ keys段 header 相同（[54,153,53,55,7,51,50,52]）→ 与 markers 正相关（碰撞对）
- **推论**：markers 可能是 cd 前缀/keys段结构的编码（需更多同前缀样本验证）

### 关键异常：basearr 碰撞
**nsd=112832 与 nsd=73823**：cd 不同（仅前 35 字符相同）但 basearr 138B 完全相同。
- 两者 keys段 header 8 字节相同，keys 内容不同
- 说明 basearr 不是 cd 的完整函数；标记位置可能来自 keys 段结构/环境指纹

## 卡点

1. **应用 js 内层 VM 在 Node 沙箱/jsdom 无法跑通**：`_$lf[40] is undefined`（内层 VM 环境表 `_$lf` 需从浏览器环境对象构建，opcode 214 push 533 元素前即崩溃）。错误 `_$lc is not a function` / `Cannot read properties of undefined (reading '3')`
2. 标记位置 (24+16k) 的生成公式未定——需跑通内层 VM 或从更多样本推公式
3. 736 测试（b86[2:140] 直接做 cookie basearr）服务器 412 —— 注意 736 测的是 **cookie basearr(166B)**，与本任务 app-js basearr(138B) 是不同数组；需用 138B 公式 + 正确 markers 重新验证

## 可复用交付
- `wb-pmos-nx/728_B_gen.js`：genBasearr(cd) 输出公式部分（130/138），传 markers 数组可补齐 138
- 8 样本数据集：/tmp/agentB/nx_multi_dataset_v5.json（nsd+cd+basearr+dh）

## 下一步建议
1. **补环境跑内层 VM**：jsdom + Request/PointerEvent/execScript 已补，还差 `_$lf` 表构建所需环境对象。可从浏览器捕获 `_$lf` 完整内容注入沙箱
2. **标记公式**：采集更多样本（含同 keys 段 header 不同 cd 的组合），研究 markers = f(keys段结构/varint长度列表)
3. **纯算法替代**：既然 basearr ≈ b86[2:140]，且 736 已证 cd 直接解码含 basearr 数据，可研究 cd 内部结构（b86[0:2] 长度头 → 第一段 = basearr 相关数据 + keys段），也许 markers 可从 keys 段长度结构推导
