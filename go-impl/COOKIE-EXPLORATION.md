# Cookie 生成链路逆向探索全记录：从外层 JS 到纯 Go 100%

> 目标站点：`https://pmos.xj.sgcc.com.cn:20080/`（瑞数 VMP 保护）
> 最终成果：纯 Go 二进制，零 JS 运行时依赖，30/30 = 100% 通过率

---

## 1. 起点：412 挑战页

访问目标站点，服务器返回 HTTP 412 + 一段内联 JS：

```html
<script>$_ts.nsd=12345;$_ts.cd="...长字符串...";</script>
<script src="/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js"></script>
```

- `nsd`：数字种子（每次请求变化），驱动 LCG 伪随机数
- `cd`：加密的挑战数据（每次请求变化），包含密钥材料
- 外层 JS：271KB 的 JSVMP（JavaScript Virtual Machine Protected），包含自定义字节码解释器

服务器同时下发 O cookie（`aoU85Lxl9xxNO`），客户端必须生成 P cookie（`aoU85Lxl9xxNP`）并携带 O+P 重放才能通过。

---

## 2. 外层 JS 解剖：从 JSVMP 到 Coder

### 2.1 外层 VM 执行（extract_dyncode_20080.js）

外层 JS 是一个 JSVMP：用混淆的 JS 代码实现了一个自定义字节码解释器。执行流程：

1. 读取 `$_ts.nsd` 和 `$_ts.cd`
2. 用 `nsd` 作为 LCG 种子（`scd = 15679*(scd&65535)+2531011`）驱动伪随机
3. 执行字节码，生成动态 JavaScript 代码
4. 调用 `eval()` 执行动态代码

**关键发现**：用 Node.js `vm` 沙箱 + 最小浏览器环境（document/navigator/screen/location）+ hook `eval()`，可以捕获动态代码。动态代码与浏览器执行结果**逐字节一致**——证明外层 VM 是纯计算，不依赖浏览器指纹。

### 2.2 动态代码 → cp3

动态代码是 ~290KB 的 IIFE，包含 6 层嵌套 VM 解释器。从中计算：

```
cp3 = sum of charCodeAt(i) for i in [0, 100, 200, ...] of dynamicCode
```

cp3 是动态代码的校验和，后续 cd 解密必须使用正确的 cp3。

### 2.3 Coder：反混淆代码生成器（关键认知突破）

**初始误判**：以为 `coder.code`（反混淆后的 JS 代码）来自 `@babel/parser` AST 变换，无法在 Go 中重现。

**实际发现**：`Coder.js` 是一个**纯文本生成器**，不涉及任何 AST 解析：

```
outer JS (站点常量)
  ↓ getImmucfg: 提取 4 个最长引号字符串
globalText1, cp0, cp2, globalText2 (站点常量)
  ↓ grenKeys(909, nsd): 生成 909 个 keyname + Fisher-Yates 洗牌
cp[1] keynames (由 nsd 确定性生成)
  ↓ Coder: 游标解析 globalText + keynames 替换 + if-else 树生成
coder.code (反混淆代码, ~290KB)
```

Coder 的核心是 `gren()` 函数：
- 从 `globalText1`（144139 字符的站点常量字符串）中用游标读取数据
- 用 `scd` PRNG 驱动 `arraySwap` 洗牌
- 生成函数定义、if-else 分支树、变量声明
- 输出 `coder.code`（~290KB 的 JavaScript 代码）

**这意味着 Coder 可以完全用 Go 移植**——~500 行纯计算 JS，零外部依赖。

### 2.4 codeUid：函数体校验和

```javascript
codeUid = (uuid(funcCode) ^ uuid(sliceCode)) & 65535
```

- `funcCode`：`functionsNameSort[validIdx].code`（~100 字节函数定义）
- `sliceCode`：`mainFunctionCode[start : start+723]`（主函数体切片）
- `uuid`：CRC32 哈希

**服务器严格校验 codeUid**（设 codeUid=0 测试：10/10 全部 412）。因此 Coder 输出必须逐字节精确。

---

## 3. cd 解密 → keys

### 3.1 cd 解密流程

```javascript
cdArr = decrypt(cd)                    // 字符串解密 → 字节数组
end = (cdArr[0] << 8 | cdArr[1]) + 2   // 任务段结束位置
one = cdArr[2:end]                      // 任务段（含 offset 信息）
ans = cdArr[end:].map((b, i) => b ^ offset[i % 8])  // XOR 解密
keys = genKeys(ans)                     // 解析出 45 个 keys
```

### 3.2 offset 计算：从 task engine 到 bruteForceOffset

**原始方案**：offset 由 task engine（`runTaskByUid('U14124020')`）计算，依赖 codemap + r2mka 任务树 + ES6 Proxy + eval。

**task engine 分析**：
- codemap：115 个 opcode，跨会话结构恒定（变量名混淆但语义不变）
- r2mka：任务树，从 r2mkaText 解析，UID 计算涉及 `hexnum` + `string2ascii`
- 阻塞点：ES6 Proxy 在 Go 中无直接等价物

**bruteForceOffset 突破**：

通过分析 cdArr 的结构（`numKeys + gap + keyBytes` 重复模式），发现 offset 可从 cdArr + 已知 keys 结构常量直接恢复：

```
已知：keys.length=45, keys[0]=[54,52]("64"), keys[1]=[54,52], keys[2].length=48

offset[0] = cdArr[end]   ^ 45   // keys.length
offset[1] = cdArr[end+1] ^ 0    // gap0 >> 8
offset[2] = cdArr[end+2] ^ 2    // gap0 & 255
offset[3] = cdArr[end+3] ^ 54   // keys[0][0]
offset[4] = cdArr[end+4] ^ 52   // keys[0][1]
offset[5] = cdArr[end+5] ^ 0    // gap1 >> 8
offset[6] = cdArr[end+6] ^ 2    // gap1 & 255
offset[7] = cdArr[end+7] ^ 54   // keys[1][0]
```

验证：20/20 会话 offset 完全匹配 task engine 计算结果。

---

## 4. basearr：244 字节明文指纹数组

### 4.1 结构

```
numarrJoin(3, seg1, 10, seg10, 7, seg7, 0, seg0, 6, seg6, 2, seg2, 9, seg9, 13, seg13)
```

| Segment | 长度 | 内容 | 来源 |
|---------|------|------|------|
| seg1 | 73 | 浏览器指纹（UA CRC32, platform, screen） | 硬编码站点常量 |
| seg10 | 19 | flagcheck + time + keys19 + random8 + flag | 纯 Go 计算 |
| seg7 | 12 | flag(1801) + codeUid | Coder 计算 |
| seg0 | 101 | 浏览器指纹加密块 | 硬编码站点常量 |
| seg6 | 16 | encryptMode2 + decode | 纯 Go AES-CBC decrypt |
| seg2 | 4 | fixedValue20 | keynames + r2mka taskori |
| seg9 | 2 | `[8, 0]` | 常量 |
| seg13 | 1 | `[0]` | 常量 |

### 4.2 fixedValue20 逆向

从 r2mka 任务树中 `U250200532` 的 `taskori`（140 字节，20 组 × 7 元素）提取：

1. `taskori[idx*7+6]` → keyname 索引
2. `cp1[keynameIdx]` → keyname 字符串
3. 建立映射 `maps[keyname] = values[idx]`
4. 查 `keys[29..32]` 的 ASCII 字符串在 maps 中的值

values 数组和 taskori 都是站点常量，跨会话不变。

### 4.3 seg6 encryptMode2

```
decrypt(ascii2string(keys[22])) → 32 字节明文
numarrAddTime(keys[16]) → 21 字节增强密钥
AES-CBC decrypt (IV = plaintext[:16]) → 8 字节结果
strip PKCS7 padding → 最终输出
```

---

## 5. Cookie 加密链

```
basearr (244 bytes)
  → numarrEncrypt (Huffman 编码) → numenc (217 bytes)
  → xor(numenc, keys[2], 16) → xorResult (前 16 字节异或)
  → encryptMode1(xorResult, keys17+numarrAddTime, flag=0) → basearrEncrypt (224 bytes)
  → numarrJoin(2, [r2mkaTime, startTime], keys[2], basearrEncrypt) → nextarr (285 bytes)
  → uuid(nextarr) → CRC32 校验 (4 bytes)
  → encryptMode1([uuid, ...nextarr], keys16+numarrAddTime, flag=1) → enc16 (320 bytes)
  → numarr2string(enc16, basestr) → cookie 字符串 (427 chars)
  → '0' + cookie → 最终 P cookie (428 chars)
```

### 5.1 numarrAddTime

```javascript
ele = Math.ceil(random * 256)           // 1..256
arr = [...keys, ...numToNumarr4(time)].map(b => b ^ ele)
arr.push(ele)                           // 21 bytes total
```

加密侧混入 time/ele，解密侧 `getCfg` 自动 strip（`numarrAddTime.reverse`）。

### 5.2 numarr2string 编码 bug（原始 JS bug）

```javascript
// BUG: 用 b1 取低 2 位
keys[(numarr[idx + 1] & 3) << 4 | numarr[idx + 1] >> 4]
// FIX: 用 b0 取低 2 位
keys[(numarr[idx] & 3) << 4 | numarr[idx + 1] >> 4]
```

当加密输出长度非 3 的倍数时（320 bytes → 余 2 bytes），最后 2 个剩余字节编码错误。约 75% 概率出错 → 412。Go 版直接使用修复后的逻辑。

---

## 6. 探索过程中的关键排除

### 6.1 已排除的根因候选

| 候选 | 结论 | 证据 |
|------|------|------|
| keys16 错 | ❌ 排除 | 19/19 cd 浏览器对照 == 管线（站点常量） |
| keys17 错 | ❌ 排除 | 19/19 cd 对照 == 管线 |
| codeUid 错 | ❌ 排除 | 12/12 浏览器对照 == 管线 |
| basearr 明文段 | ❌ 排除 | 200 组与 412 组各段完全一致 |
| seg0 指纹段 | ❌ 排除 | 替换不能复活 412 |
| numarrEncrypt | ❌ 排除 | 2000 随机样本与参考 0 不一致 |
| 加密截断 | ❌ 排除 | 各层长度恒定 |
| 随机因子 | ❌ 排除 | 同值可 200 可 412 |
| cookie 绑定 | ❌ 排除 | 不绑 page/TLS/IP，非一次性 |
| TLS 指纹 | ❌ 排除 | got-scraping Chrome131 无提升 |

### 6.2 200/412 概率性的根因

**numarr2string 余数编码 bug**：约 75% 概率最后一个编码字符错误 → 412。修复后 100%。

### 6.3 "Babel AST" 误判

初始以为 Coder 依赖 `@babel/parser` AST 变换，导致 2 小时方向偏离（考虑 goja+Babel、嵌入 Bun/Deno 等）。实际 Coder 是纯文本生成器，~500 行纯计算 JS。

---

## 7. Go 移植：从 Node.js 到纯 Go

### 7.1 移植分层

| 层 | JS 源 | Go 文件 | 状态 |
|----|-------|---------|------|
| HTTP 客户端 | pmos_xj_client.js | main.go | ✅ |
| Huffman 编码 | numarrEncrypt.js | huffman.go | ✅ |
| AES-CBC | modeEncrypt.js | crypto.go | ✅ |
| XOR/UUID/numarrJoin/numarr2string | tools.js/uuid.js | crypto.go | ✅ |
| 外层 VM (cp3) | extract_dyncode_20080.js | coder.go (Coder 内部计算) | ✅ |
| Coder 代码生成 | Coder.js | coder.go | ✅ 逐字节一致 |
| codeUid | Cookie.js | coder.go | ✅ 精确匹配 |
| cd 解密 | decrypt.js/tscd.js | keygen_pure.go | ✅ |
| offset | tscd.js (task engine) | keygen_pure.go (bruteForceOffset) | ✅ |
| basearr | len243.js | keygen_pure.go | ✅ |
| fixedValue20 | fixedValue20.js | keygen_pure.go | ✅ |
| seg6 encryptMode2 | modeEncrypt.js | keygen_pure.go | ✅ |

### 7.2 关键 Bug 修复

#### Bug #1：Coder while 循环缺少 `]`

```javascript
// JS Coder.js line 204
codeArr.push("while(1){", ..., "[", opmate.getMate('_$ku'), "++];");
//                                                          ^^^ 这个 ] 被遗漏
```

Go 移植时写成 `"++;"`，导致 coder.code 从字节 149818 开始全部偏移 → codeUid 完全错误。

#### Bug #2：`$_ts` 被 sed 误替换

```bash
sed -i '' 's/\$_ts/Ts/g' coder.go  # 替换了字符串字面量！
```

`"$_ts"` 变成 `"Ts"`，coder.code 末尾变量名错误。

#### Bug #3：jsUnescape 未支持 `\uXXXX`

r2mkaText 包含 Unicode 转义序列，Go 的 jsUnescape 只处理 `\n \r \t \" \\ \xNN`，未处理 `\uXXXX`。r2mkaText 长度差 21 字符 → fixedValue20 错误。

#### Bug #4：functionsSort keycode 匹配模式

JS 正则 `/^\([0-9]+\);$/` 匹配以 `);` 结尾，Go 检查以 `)` 结尾。functionsNameSort 只有 18 条目（应 56）→ codeUid 回退到错误默认值。

#### Bug #5：UTF-8 字节索引 vs UTF-16 码元索引（最终突破）

Go `len(string)` 返回 UTF-8 字节数，JS `string.length` 返回 UTF-16 码元数。coder.code 包含 r2mkaText（max charCode 50415），大量字符 > 127 在 UTF-8 中占 2-3 字节但在 UTF-16 中只占 1 码元。

```go
// 错误：字节索引
for i := 0; i < len(c.code); i += 100 { flag += int(c.code[i]) }

// 正确：rune 索引（匹配 JS charCodeAt）
codeRunes := []rune(c.code)
for i := 0; i < len(codeRunes); i += 100 { flag += int(codeRunes[i]) }
```

同理，`mainFunctionIdx` 计算也必须用 `len([]rune(s))` 而非 `len(s)`。

修复后：
- `mainFnIdx`：Go=[217760,290070] == JS=[217760,290070] ✅
- `codeUid`：Go=14028 == JS=14028 ✅
- `coder.code`：逐字节一致 ✅
- **端到端 30/30 = 100%** ✅

### 7.3 goja 移除

最初用 goja（纯 Go JS 引擎）执行外层 VM 获取 cp3。发现 Coder 的 cp3 == 外层 VM 的 cp3 后，直接用 Coder 内部计算的 cp3，完全移除 goja。

最终 `go.mod` 零外部依赖，编译产物为纯 Go 二进制。

---

## 8. 调试方法论

### 8.1 逐层对比法

从 HTTP 层开始，逐层验证每个中间产物：
1. HTTP 挑战页解析 → nsd/cd 提取
2. 外层 VM → cp3
3. cd 解密 → cdArr
4. offset → bruteForceOffset
5. keys → keys16/17/2 逐字节
6. basearr → 长度 244
7. Huffman → numenc 逐字节
8. AES → enc16 逐字节
9. cookie → 428 字符
10. HTTP 重放 → 200

### 8.2 固定 session 对比法

当中间产物依赖随机参数（nsd）时：
1. 捕获 nsd/cd 到文件
2. JS 侧用固定 nsd/cd 运行，输出结果到文件
3. Go 侧用相同 nsd/cd 运行，逐字节对比
4. 定位第一个差异字节，分析上下文

### 8.3 关键教训

1. **sed 命令的危险性**：全局替换会破坏字符串字面量
2. **单字符差异的致命性**：CRC32 对 1 字节差异完全敏感
3. **字节 vs 码元**：Go `len(string)` ≠ JS `string.length`（多字节字符）
4. **错误结论的危害**："Coder 需要 Babel" 导致 2 小时方向偏离
5. **codeArrLen 陷阱**：Go 元素数 vs JS 字节数，差 5 倍但代码可能正确

---

## 9. 最终架构

```
Go 二进制 pmos_go（零外部依赖）
├── Go net/http: 拉挑战页 + 重放
├── 纯 Go Coder: globalText 解析 + 代码生成 + cp3 + codeUid
├── 纯 Go cd 解密: decryptCd + parseCdSection
├── 纯 Go offset: bruteForceOffset（keys 结构常量恢复）
├── 纯 Go genKeys: 从 offset XOR + cdArr → keys
├── 纯 Go basearr: len243 移植 + fixedValue20 + seg6
├── 纯 Go numarrAddTime: keys16/17 时间增强
└── 纯 Go cookie 生成: Huffman + AES + XOR + UUID + 编码
```

**30/30 = 100% 通过率，零 JS 运行时依赖。**

---

*文档更新：2026-07-31*
