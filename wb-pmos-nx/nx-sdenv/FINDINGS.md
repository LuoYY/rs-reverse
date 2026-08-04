# nx 站点纯算法发现（基于 sdenv 环境验证）

## 核心结论

**sdenv 能解决环境问题的根本原因**：它提供了完整、正确的浏览器环境，让瑞数外层 JS
的**逻辑分支**正确执行。但环境检测值本身（`_$mD` 环境池）**大部分可硬编码**——
因为服务器校验的是 cookie 的**结构/加密/校验和**，而非环境检测的**具体值**。

这已被 **xj 站点的纯 Go 实现证明**（`go-impl/` 30/30 = 100% 通过率、零 JS 运行时依赖）：
`buildBasearrGoPure` 用**硬编码的浏览器指纹常量**（maxTouchPoints=0、UA uuid、
屏幕尺寸、seg0 加密块 101 字节）就能生成合法 cookie。

## "真正的算法" = f(nsd, cd) + 硬编码环境常量

```
Cookie 生成全链路（纯算法，无环境依赖）：
1. fetch 412 挑战页 → 提取 nsd + cd（HTTP，纯数据）
2. keys = parseCdToKeys(cd, cp3)   # cd 解密 → keys[0..44]（纯计算）
   - cp3 = Coder 输出（PRNG 文本生成器，纯 Go 可算）
   - keys2 = 48B（session_data），keys16/17 = 16B（加密密钥）
3. basearr = buildBasearr(keys, 硬编码指纹常量, 随机填充)
   - 稳定段：指纹块（UA uuid、平台、屏幕、seg0 加密块）= 硬编码
   - cd 派生段：keys 相关
   - 随机段：时间戳、nonce（服务器不校验）
4. Cookie = encrypt(basearr, keys16/keys17)
   - huffman encode(basearr) → XOR keys2 → AES-CBC(keys17) → 
     numarrJoin + uuid → AES-CBC(keys16) → numarr2string → 'a' 前缀
```

## nx 站点实测结构（sdenv 验证）

### cookie 格式
```
3RKyaeh47p90O=... ; 3RKyaeh47p90P=...
P 首字符 'a'（前缀标记，类似 xj 的 '0'）→ strip 后 256 字节（16 倍数）
P 解码 → AES-CBC(keys16, flag=1) → [uuid 4B][nextarr]
```

### nextarr 结构
```
[tag=4][len=8][arr8(时间戳8B)][keys2len=48][keys2(48B)][debug/hasDebug][basearrEncrypt(160B)]
```

### basearr（解密后）
```
len ≈ 112 字节（huffman 解码，可能有尾部噪声）
开头 16 字节稳定：181,117,83,176,203,101,0,137,204,196,71,39,0,172,32,19
  = 指纹段（跨 cookie 相同）
其余 = 随机段（时间戳/nonce）
```

### keys
```
keys2  = 48 字节（session_data，纯 f(nsd,cd)）
keys16 = 16 字节（外层 AES 密钥）
keys17 = 16 字节（内层 AES 密钥）
```

## 与 xj 的差异（Go 适配点）

| 项目 | xj (20080) | nx (10443) |
|---|---|---|
| cookie 名 | aoU85Lxl9xxNO/NP | 3RKyaeh47p90O/P |
| cookie 前缀 | '0' | 'a' |
| nextarr tag | 2 | 4 |
| keys2 长度 | 48 | 48 |
| keynameNum | 909 | 待测 |
| flag | 1801 | 待测 |
| 外层 JS | kmOJZ0KVxJ0R/... | c9qYRt1w5yKr/... |
| basearr 指纹段 | 硬编码（xj 特定） | 需重新提取 |

## Go 实现路径（边缘节点可行）

纯 Go 二进制（8.6MB，xj 已验证）可裁剪到极小内存：
1. `coder.go`：Coder（PRNG + 文本生成）→ cp3 + aebi + keys
2. `keygen_pure.go`：parseCdToKeys（cd → keys）
3. `taskengine.go`：TaskEngine（offset）
4. `crypto.go`：AES-CBC + huffman + numarr2string
5. `main.go`：fetchChallenge + generateCookie + replay

**无 JS 引擎、无 DOM、无浏览器**——完全适合边缘物联网节点（纯 Go + 极小内存）。

## ★★★ nx 纯 Go 适配进展（08-04 晚）★★★

### 已验证 ✅
1. **nx immucfg 提取**：globalText1=217172B, globalText2=542B, cp0=45115（与 `_$ez` 完全一致）, cp2=1954
2. **nx Coder 纯 Go 跑通**（`go-impl/pmos_go_nx nx <nsd> <cd>`）：cp3 正确、codeLen≈49 万、**aebi=[648,2553,2479,431,38,7]**（与手写沙箱 6 层 VM 完全一致！）
3. **nx codemap/r2mka 提取**：codemap 136 opcode、r2mkaText 62772、**r2mka 树含 U14124020**（offset 任务，与 xj 同 UID）
4. **nx cd 结构**：tasklen 前 2 字节、keys[0]=[54,52]（与 xj 同）、keys2=48B、keys16/17=16B

### 剩余卡点 ❌
**cd→keys 的 offset 计算**：TaskEngine 对 nx 的 U14124020 执行返回 nil（xj 特定的 opcode 语义/栈假设），bruteForceOffset 的 keys[1] 假设（[54,52]）不匹配 nx（实测 keys[1][1]=197 或 205）
- **需要**：分析 nx 的 U14124020 taskarr 结构与 xj 的差异，或反推 nx 的 offset 恢复常量

### 站点常量（Go 适配用）
| 常量 | xj | nx |
|---|---|---|
| keynameNum | 909 | 1151 |
| cookie 前缀 | '0' | 'a' |
| nextarr tag | 2 | 4 |
| cookie 名 | aoU85Lxl9xxN | 3RKyaeh47p90 |
| aebi | 6 程序 | [648,2553,2479,431,38,7]（相同） |
| codemap | 115 opcode | 136 opcode |
| r2mka UID | U14124020 | U14124020（相同） |
| immucfg | globaltext1/2, cp0, cp2 | 已提取（cp0=45115 一致） |
