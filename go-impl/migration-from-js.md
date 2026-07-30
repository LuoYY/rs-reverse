# JS -> Go 迁移文档：pmos.xj.sgcc.com.cn:20080 瑞数 VMP 纯协议

## 1. 背景与目标

将 Node.js 纯协议 cookie 生成管线（`pmos_xj_client.js`，已实现 100% 通过率）移植为 Go 语言，最终编译为单个二进制文件，无 Node.js 运行时依赖。

## 2. JS 管线总览（移植前）

```
拉 412 挑战页 -> 解析 $_ts.nsd/cd + O cookie
  -> Node.js vm 沙箱执行外层 VM -> 提取 cp[3]（动态代码校验和）
  -> Coder.run() -> 生成代码 + codemap + r2mkaText
  -> parser.init(coder):
      ├─ r2mka.init(r2mkaText) -> 解析任务树
      ├─ tscp.init(coder) -> 初始化 cp 值
      ├─ constData.init() -> 生成 AES S-box (cfgnum) + bignum + decryptKeys
      ├─ tscd.init() -> cd 解密 -> keys（含 offset XOR）
      └─ meta.init() -> meta 数据
  -> Cookie.run():
      ├─ getBasearr(config, gv) -> 244 字节明文指纹数组
      ├─ numarrEncrypt(basearr) -> Huffman 编码
      ├─ xor(numenc, keys[2], 16) -> 前 16 字节异或
      ├─ encryptMode1(xorResult, keys17, flag=0) -> 内层 AES-CBC
      ├─ numarrJoin -> 拼装 nextarr (285 字节)
      ├─ uuid(nextarr) -> CRC32 校验
      ├─ encryptMode1(uuid+nextarr, keys16, flag=1) -> 外层 AES-CBC (含 IV)
      └─ numarr2string(enc16) -> Base64-like 编码 -> cookie 字符串
  -> 带 O+P cookie 重放首页 -> 200
```

## 3. 移植分层与状态

### 3.1 已完成层（纯 Go，逐字节验证一致）

| 模块 | JS 源文件 | Go 文件 | 验证状态 |
|------|-----------|---------|----------|
| HTTP 客户端 | `pmos_xj_client.js` | `main.go` | ✅ 30/30 = 100% |
| Huffman 编码 | `numarrEncrypt.js` | `huffman.go` | ✅ 逐字节一致 |
| AES-CBC 加密/解密 | `modeEncrypt.js` | `crypto.go` | ✅ 逐字节一致 |
| XOR | `tools.js` | `crypto.go` | ✅ 逐字节一致 |
| UUID/CRC32 | `uuid.js` | `crypto.go` | ✅ 逐字节一致 |
| numarrJoin | `numarrJoin.js` | `crypto.go` | ✅ 逐字节一致 |
| numarr2string | `numarr2string.js` | `crypto.go` | ✅ 逐字节一致（含 bug 修复） |
| 外层 VM (cp3) | `extract_dyncode_20080.js` | `keygen_pure.go` (goja) | ✅ cp3 一致 |
| **Coder 代码生成器** | `Coder.js` | `coder.go` | ✅ **逐字节一致** |
| **codeUid 计算** | `Cookie.js` getCodeUid | `coder.go` ComputeCodeUid | ✅ **精确匹配** |
| **fixedValue20** | `fixedValue20.js` | `keygen_pure.go` | ✅ 从 keynames 计算 |
| **seg6 encryptMode2** | `modeEncrypt.js` | `keygen_pure.go` | ✅ AES-CBC decrypt |
| **basearr 生成** | `len243.js` | `keygen_pure.go` | ✅ 纯 Go |
| r2mka 解析 | `r2mka.js` | `taskengine.go` | ✅ UID 匹配 |
| task engine | `runTask.js` | `taskengine.go` | ⚠️ 框架完成（bruteForceOffset 绕过） |

### 3.2 offset 计算突破（bruteForceOffset）

**关键发现**：offset 可从 cdArr + 已知 keys 结构常量直接恢复，无需运行 task engine。

已知常量：
- `keys.length = 45`（站点固定）
- `keys[0] = [54, 52]`（ASCII "64"，站点固定）
- `keys[1] = [54, 52]`（同上）
- `keys[2].length = 48`（站点固定）

恢复公式（`end = cdArr[0]<<8 | cdArr[1] + 2`）：
```
offset[0] = cdArr[end]   ^ 45
offset[1] = cdArr[end+1] ^ 0   (gap0 >> 8)
offset[2] = cdArr[end+2] ^ 2   (gap0 & 255)
offset[3] = cdArr[end+3] ^ 54  (keys[0][0])
offset[4] = cdArr[end+4] ^ 52  (keys[0][1])
offset[5] = cdArr[end+5] ^ 0   (gap1 >> 8)
offset[6] = cdArr[end+6] ^ 2   (gap1 & 255)
offset[7] = cdArr[end+7] ^ 54  (keys[1][0])
```

验证：20/20 会话 offset 完全匹配 pipeline 计算结果。

### 3.3 最终运行架构（100% 纯 Go，无 Node.js）

```
Go 二进制 pmos_go（零外部依赖）
├── Go net/http: 拉挑战页 + 重放 ✅
├── Goja (纯 Go JS 引擎): 外层 VM -> cp3 ✅
├── 纯 Go Coder: globalText -> coder.code -> codeUid ✅
├── 纯 Go cd 解密: decryptCd + parseCdSection ✅
├── 纯 Go offset: bruteForceOffset ✅ (keys 结构常量恢复)
├── 纯 Go genKeys: 从 offset XOR + cdArr -> keys ✅
├── 纯 Go basearr: len243.js 移植 + fixedValue20 + seg6 ✅
├── 纯 Go numarrAddTime: keys16/17 时间增强 ✅
└── 纯 Go cookie 生成: Huffman + AES + XOR + UUID + 编码 ✅
```

## 4. 移植过程中的关键发现与 Bug 修复

### 4.1 numarr2string 余数编码 bug（原始 JS bug）

**文件**：`src/handler/parser/common/numarr2string.js` 第 25 行

```javascript
// BUG: 用 b1 取低 2 位
keys[(numarr[idx + 1] & 3) << 4 | numarr[idx + 1] >> 4]
// FIX: 用 b0 取低 2 位
keys[(numarr[idx] & 3) << 4 | numarr[idx + 1] >> 4]
```

当加密输出长度非 3 的倍数时（320 字节 -> 余 2 字节），最后 2 个剩余字节 `[b0, b1]` 编码为 3 个字符。第二个字符应为 `(b0 & 3) << 4 | b1 >> 4`，但代码用了 `(b1 & 3) << 4 | b1 >> 4`。约 75% 概率出错 -> 412。Go 版直接使用了修复后的逻辑。

### 4.2 Huffman 编码的 JS int32 语义

**核心难点**：JS 的位运算在 int32 上进行，即使变量是 float64。

```javascript
// JS numarrEncrypt.js
one = one << cfg.val | cfg.key;  // one 是 float64，但 << 先转 int32
```

**Go 解决方案**（`huffman.go`）：

```go
// 用 float64 存储 curKey（匹配 JS），但位运算时转 int32
curKey := float64(0)
// << 操作：先 ToInt32，再移位（JS << 对移位量取 mod 32）
shifted := toInt32(curKey) << uint(c.val&31)
curKey = float64(shifted) + float64(c.key)
// >>> 操作：转 uint32 再右移
u32 := toUint32(curKey) >> uint(curLen)
```

`toInt32` 和 `toUint32` 函数精确模拟了 JS 的 `ToInt32()` / `ToUint32()` 抽象操作。

### 4.3 XOR 只异或前 16 字节

```javascript
// JS tools.js
exports.xor = function (numarr1, numarr2, num) {
  for (let i = 0; i < num; i++) {  // num = 16
    numarr1[i] ^= numarr2[i];
  }
  return numarr1;  // 只改了前 16 字节，其余不变
}
```

Go 版本必须只异或前 16 字节，不是循环异或整个 key。

### 4.4 UUID 缺少最终 XOR

```javascript
// JS uuid.js
return (val ^ -1) >>> 0;  // -1 in int32 = 0xFFFFFFFF
```

Go 版本必须添加 `val ^ 0xFFFFFFFF`。

### 4.5 numarrJoin 第一个数组参数不加长度前缀

```javascript
// JS numarrJoin.js
if (ans.length === 0) return Array.isArray(it) ? it : [it];  // 第一个参数直接展开
// 后续数组: return [...ans, it.length, ...it];  // 加长度前缀
```

### 4.6 hasDebug 运行时为 true

适配器配置 `hasDebug: true`（`len243.js`），即使构造函数传入 `hasDebug: false`。运行时 nextarr = 285 字节（含 1 字节 high byte = `128 | (len >> 8)`），而非 284。

### 4.7 getCfg strips time/ele

`encryptMode1` 内部的 `getCfg(keyarr)` 会调用 `numarrAddTime.reverse(keyarr)` strip 掉 time/ele，实际 AES 密钥恒为原始 keys16/keys17。这意味着 `numarrAddTime` 的 time/ele 参数不影响加密结果。

### 4.8 numarrAddTime 缺失（cookie 生成 bug）

**问题**：Cookie.js 对 keys16/17 做 `numarrAddTime` 变换（追加 4 字节时间戳、全部 XOR 一个随机 `ele` 字节、再追加 `ele`），生成 21 字节的增强密钥。Go 最初直接用原始 16 字节 key -> AES key size 不匹配。

**修复**（`crypto.go`）：
```go
func numarrAddTime(key []byte, runTime int, random float64) []byte {
    ele := int(math.Ceil(random * 256))
    timeBytes := u32bytes(uint32(runTime))
    arr := append(key, timeBytes...)
    for i := range arr { arr[i] ^= byte(ele) }
    arr = append(arr, byte(ele)) // 21 bytes total
    return arr
}
```

`encryptMode1` 收到 21 字节 key 时，先 `reverse strip`（pop ele -> un-XOR 20 bytes -> 取前 16）-> 标准 AES-128。

### 4.9 Coder 逐字节移植的两个致命 bug

这是整个移植过程中最关键的调试，直接决定了能否达到 100% 通过率。

#### 4.9.1 背景：为什么 Coder 必须精确移植

`codeUid = (uuid(funcCode) ^ uuid(sliceCode)) & 65535`

- `funcCode`：`functionsNameSort[validIdx].code`（~100 字节函数定义）
- `sliceCode`：`mainFunctionCode[start : start+723]`（主函数体切片）
- `uuid` 是 CRC32 哈希：**1 字节差异 -> 完全不同的 hash -> 412**

服务器严格校验 codeUid（设 codeUid=0 测试：10/10 全部 412）。因此 Go Coder 生成的 `coder.code` 必须与 JS Coder **逐字节一致**。

#### 4.9.2 调试方法：固定 nsd/cd 逐字节对比

由于每次 HTTP 请求获得不同的 nsd，无法直接对比 Go 和 JS 输出。解决方案：

1. **捕获固定 session**：一次 HTTP 请求获取 nsd/cd，保存到 `/tmp/fixed_session.json`
2. **JS 侧**：`js_dump_coder.js` 用固定 nsd/cd 运行 Coder，输出 `coder.code` 到 `/tmp/js_coder_code.txt`，输出指标到 `/tmp/js_coder_metrics.json`
3. **Go 侧**：`compare_coder.go` 用相同 nsd/cd 运行 Go Coder，逐字节对比
4. **对比逻辑**：找到第一个差异字节，输出上下文，统计差异区域

#### 4.9.3 Bug #1：while 循环缺少 `]` 字符

**根因**：`Coder.js` 第 204 行的字符串 `"++];"` 在 Go 移植中被误写为 `"++;"`，少了一个 `]`。

```javascript
// JS Coder.js line 204
codeArr.push("while(1){", ..., "[", opmate.getMate('_$ku'), "++];");
//                                                          ^^^ 这个 ] 被遗漏
```

```go
// Go coder.go (BUG)
*codeArr = append(*codeArr, "while(1){", ..., "[", c.opmate.GetMate("_$ku"), "++;")
//                                                                                           ^^ 缺少 ]

// 修复
*codeArr = append(*codeArr, "while(1){", ..., "[", c.opmate.GetMate("_$ku"), "++];")
//                                                                                           ^^^ 修复
```

**影响**：coder.code 从第 149818 字节开始全部偏移 1 字节，导致 uuid 计算结果完全不同 -> codeUid 错误 -> 412。

**调试过程**：
- 首先验证了游标位置完全匹配（88726, 129289, 137121...）✅
- 验证了数据结构完全匹配（_$$k count, _$cS items/elements, _$$w length）✅
- 发现 `codeArrLen` 对比有误：Go 用 `len(slice)` = 元素数，JS 用 `join('').length` = 字节数
- 修正对比方式后，发现 Go=218782 vs JS=217754（~1028 差异）
- 通过 `compare_coder.go` 逐字节对比，定位到第一个差异在字节 149818
- 差异内容：Go=`";if("` JS=`"];if("` -> 缺少 `]`
- 溯源到 `Coder.js` 第 204 行的 `"++];"` 字符串

#### 4.9.4 Bug #2：`$_ts` 字符串被 sed 误替换

**根因**：为了在 Go 中使用 `$_ts` 作为结构体字段名，执行了 `sed -i '' 's/\$_ts/Ts/g' coder.go`。这个命令不仅替换了字段名，还替换了**字符串字面量**中的 `$_ts`。

```go
// 期望
codeArr = append(codeArr, "})(", "$_ts", ".scj,", "$_ts", ".aebi);")

// sed 后（BUG）
codeArr = append(codeArr, "})(", "Ts", ".scj,", "Ts", ".aebi);")
```

**影响**：coder.code 末尾的 `$_ts.scj` 变成 `Ts.scj`，`$_ts.aebi` 变成 `Ts.aebi`。虽然不影响 codeUid（codeUid 的 slice 在主函数体内，不在末尾），但影响后续 parseTs 的 cp3 计算。

**调试过程**：
- Bug #1 修复后，coder.code 前 290848 字节完全一致 ✅
- 但末尾仍有 1023 字节差异
- `compare_coder.go` 显示差异在字节 291851：Go=`"Ts."` JS=`"$_t"`
- 发现是 sed 命令误替换了字符串字面量

#### 4.9.5 jsUnescape 未支持 \uXXXX 转义

**根因**：Go 的 `jsUnescape` 函数最初只处理 `\n \r \t \" \\ \xNN`，未处理 `\uXXXX` Unicode 转义序列。

**影响**：`r2mkaText` 解析后长度为 42201（Go）vs 42222（JS），差 21 字节。这影响 `fixedValue20` 的 taskori 查找和 keycodes 最后一个元素。

**修复**（`coder.go`）：
```go
func jsUnescape(s string) string {
    // 完整实现 JSON 字符串反转义
    // 支持: \n \r \t \b \f \" \\ \/ \uXXXX \xNN
    case 'u':
        // \uXXXX - 4 hex digits
        if i+4 < len(runes) {
            var val int
            for j := 1; j <= 4; j++ {
                // parse hex digit
            }
            result = append(result, rune(val))
            i += 4
        }
}
```

#### 4.9.6 functionsSort keycode 匹配模式错误

**根因**：JS 正则 `/^\([0-9]+\);$/` 匹配以 `);` 结尾的字符串，但 Go 代码检查以 `)` 结尾。

```go
// BUG: 检查 ) 结尾
if len(it) < 4 || it[0] != '(' || it[len(it)-1] != ')' {

// 修复: 检查 ; 结尾（匹配 /^\([0-9]+\);$/）
if len(it) < 4 || it[0] != '(' || it[len(it)-1] != ';' {
```

**影响**：`functionsNameSort` 只有 18 个条目（应该 56 个），导致 `keys33` 索引越界，`codeUid` 回退到错误的默认值。

#### 4.9.7 最终验证结果

修复全部 bug 后：
- `coder.code` 前 290848 字节**逐字节一致** ✅
- `codeUid` **精确匹配** ✅（Go=14028 JS=14028）
- `functionsNameSort` = 56 条目 ✅
- `r2mkaText` = 42222 字符 ✅
- **端到端 30/30 = 100% 通过率** ✅

### 4.10 basearr 各 segment 的移植

| Segment | 长度 | 内容 | 移植方式 |
|---------|------|------|----------|
| seg1 | 73 | 浏览器指纹（UA, platform, screen） | 硬编码站点常量 |
| seg10 | 19 | flagcheck + time + keys19 + random8 + flag | 纯 Go 计算 |
| seg7 | 12 | flag(1801) + codeUid | 纯 Go 从 Coder 计算 |
| seg0 | 101 | 浏览器指纹加密块 | 硬编码站点常量 |
| seg6 | 16 | encryptMode2 + decode | 纯 Go AES-CBC decrypt |
| seg2 | 4 | fixedValue20 | 从 keynames + r2mka taskori 计算 |
| seg9 | 2 | `[8, 0]` | 常量 |
| seg13 | 1 | `[0]` | 常量 |

**fixedValue20 算法**（`keygen_pure.go`）：
```go
func computeFixedValue20(keys [][]int, cp1 []string) []int {
    // 1. 使用硬编码的 U250200532 taskori（站点常量）
    // 2. 从 taskori[idx*7+6] 获取 keyname 索引
    // 3. 查 cp1[keynameIdx] 获取 keyname 字符串
    // 4. 查 keys[29..32] 的 ASCII 字符串
    // 5. 在 maps 中查找对应值
    // 返回 4 字节 fixedValue20
}
```

**seg6 encryptMode2**（`keygen_pure.go`）：
```go
func goEncryptMode2(valarr, keyarr []int) []int {
    // 1. Strip numarrAddTime suffix (21 bytes -> 16 bytes AES key)
    // 2. IV = valarr[:16] (plaintext first 16 bytes)
    // 3. Ciphertext = valarr[16:]
    // 4. AES-CBC decrypt
    // 5. Strip PKCS7 padding
    // 返回解密后的明文
}
```

## 5. 阻塞点详解：offset 计算

### 5.1 offset 是什么

`tscd.init()` 中：
```javascript
const offset = runTaskByUid('U14124020', [], getTaskarr(one, one[3]));
const ans = cdArr.slice(end).map((item, idx) => item ^ offset[idx % 8]);
gv._setAttr('keys', genKeys(ans));
```

offset 是一个 8 字节数组，用于 XOR cd 解密后的剩余字节，然后才能正确解析出 keys。

### 5.2 Task Engine 分析（未使用但重要的逆向成果）

`U14124020` 是 r2mka 任务树中的一个节点，通过 `runTaskByUid` 执行。任务引擎是一个基于栈的虚拟机：

**架构**：
- **codemap**：将 opcode 编号映射到代码字符串（115 个 opcode）
- **commonFunc 分发器**：根据 type code 设置 `curObj`/`curKey`（7 种 type）
- **loop_res Proxy**：对 U14124020 特殊处理，设 `offsetConst[93]=3, [94]=51, [95]=153`
- **global_res Proxy**：恒返回 cp2（240 元素常量数组）

**codemap 跨会话分析**：
- 采集 3 个不同会话的 codemap
- 变量名每次变化（混淆），但**结构恒定**
- 将所有 `_$xxx` 变量名替换为 `VAR` 后，3 个会话的 codemap **逐字符一致** ✅
- 这证明 opcode 语义是站点常量，只是变量名混淆

**r2mka 解析器移植**（`taskengine.go`）：
- r2mkaText 包含 charCode > 255 的字符（max 1439），必须用 `[]rune` 而非 `[]byte`
- `hexnum` 函数移植：JS `parseInt("1-", 16)` 对非 hex 字符截断返回 1，Go `fmt.Sscanf` 行为不同，需手动实现 `jsParseIntHex`
- UID 计算公式：`string2ascii(hexnum(depth-lens-isReset-taskarrLen-childOneLen-childTwoLen))`
- 验证：UID `U14124020` 精确匹配 ✅

**Task Engine 阻塞点**：
- 115 个 opcode 全部映射到 Go 实现
- 但 opcode 执行时栈操作 panic（commonFunc 调用时序未完全对齐）
- Proxy 的 `get` trap 模拟复杂（JS Proxy 在 Go 中无直接等价物）
- **决策**：不修复 task engine，改用 bruteForceOffset 绕过

### 5.3 offset 不是常量

实测 5 组不同 cd，offset 各不相同：

| nsd | cdArr[1] | offset |
|-----|----------|--------|
| 28966 | 125 | `[9,155,2,3,5,2,7,7]` |
| 55241 | 141 | `[1,159,3,0,5,2,6,4]` |
| 37496 | 148 | `[9,155,2,0,5,5,7,7]` |
| 58803 | 148 | `[9,155,2,0,5,5,7,7]` |
| 19080 | 125 | `[9,155,2,3,5,2,7,7]` |

### 5.4 offset 恢复公式推导

**观察**：cd 解密后 `ans = cdArr[end:]` 的结构为：
```
[numKeys(1B)] [gap0_hi(1B) gap0_lo(1B)] [keys[0](gap0 bytes)] [gap1_hi(1B) gap1_lo(1B)] [keys[1](gap1 bytes)] ...
```

而 `ans[i] = cdArr[end+i] ^ offset[i % 8]`。

已知 `keys.length = 45`、`keys[0] = [54, 52]`（ASCII "64"）、`keys[1] = [54, 52]`、`keys[2].length = 48`。

逐步推导：
```
ans[0] = numKeys = 45              -> offset[0] = cdArr[end]   ^ 45
ans[1] = gap0 >> 8 = 0             -> offset[1] = cdArr[end+1] ^ 0
ans[2] = gap0 & 255 = 2            -> offset[2] = cdArr[end+2] ^ 2
ans[3] = keys[0][0] = 54           -> offset[3] = cdArr[end+3] ^ 54
ans[4] = keys[0][1] = 52           -> offset[4] = cdArr[end+4] ^ 52
ans[5] = gap1 >> 8 = 0             -> offset[5] = cdArr[end+5] ^ 0
ans[6] = gap1 & 255 = 2            -> offset[6] = cdArr[end+6] ^ 2
ans[7] = keys[1][0] = 54           -> offset[7] = cdArr[end+7] ^ 54
```

**验证**：`cdArr[end+8] ^ offset[0]` 应等于 `keys[1][1] = 52`，`cdArr[end+9..10] ^ offset[1..2]` 应等于 `gap2 = 48`。

20/20 会话全部通过验证 ✅。

### 5.5 bruteForceOffset 实现

```go
func bruteForceOffset(cdArr []int, end int) []int {
    offset := make([]int, 8)
    offset[0] = cdArr[end]   ^ 45  // keys.length
    offset[1] = cdArr[end+1] ^ 0   // gap0 >> 8
    offset[2] = cdArr[end+2] ^ 2   // gap0 & 255
    offset[3] = cdArr[end+3] ^ 54  // keys[0][0]
    offset[4] = cdArr[end+4] ^ 52  // keys[0][1]
    offset[5] = cdArr[end+5] ^ 0   // gap1 >> 8
    offset[6] = cdArr[end+6] ^ 2   // gap1 & 255
    offset[7] = cdArr[end+7] ^ 54  // keys[1][0]
    // 验证: keys[1][1] 应为 52, gap2 应为 48
    if cdArr[end+8] ^ offset[0] != 52 { return nil }
    if (cdArr[end+9]^offset[1])<<8 | (cdArr[end+10]^offset[2]) != 48 { return nil }
    return offset
}
```

## 6. Coder 逆向分析（关键认知突破）

### 6.1 "Babel AST" 误判与推翻

#### 6.1.1 初始误判

项目代码中 `src/handler/Coder.js` 引用了 `@babel/parser` 和 `@babel/traverse`（通过 `getCodemap` 函数）。同时 `utils/getCode.js` 使用 Babel 解析外层 JS 提取 meta 信息。

**错误推理链**：
1. `getCodemap` 使用 Babel -> 以为 `Coder.run()` 也使用 Babel
2. `coder.code` 是"反混淆代码" -> 以为需要 AST 变换才能生成
3. codeUid 依赖 `coder.code` -> 以为无法在 Go 中重现
4. 测试 codeUid=0 -> 10/10 全部 412 -> 以为确认了"必须用 Babel"
5. 尝试 keyname 重命名方案 -> 失败（见 §6.1.3）
6. **结论**："纯 Go 无法计算 codeUid，必须依赖 Node.js"

**这个错误结论导致了约 2 小时的方向偏离**，包括考虑 goja 运行 Babel、嵌入 Bun/Deno 等方案。

#### 6.1.2 推翻误判

仔细阅读 `Coder.js` 源码后发现：

1. `Coder.run()` 的核心是 `parseGlobalText1()` 和 `parseGlobalText2()`
2. 这两个函数使用**游标读取** `globalText1`（一个从外层 JS 提取的字符串常量）
3. 代码生成是通过 `codeArr.push(...)` 拼接字符串，不是 AST 变换
4. `@babel/parser` 只在 `getCodemap` 中使用，用于生成 codemap（已通过 bruteForceOffset 绕过）
5. `coder.code` 是**纯文本生成**的产物，输入是 globalText + keynames + scd PRNG

**关键代码**（`Coder.js` `gren` 函数）：
```javascript
// 游标读取 globalText1
const dataK = optext.getList();        // 读取 keyname 索引数组
const dataH = optext.getList();        // 读取变量声明索引
const dataC = optext.getList();        // 读取函数定义索引对
// arraySwap 洗牌
const wData = arraySwap(arr2two(dataC), scd);
// 生成函数定义
wData.forEach(([key1, key2]) => {
    codeArr.push(`function ${keynames[key1]}(){var ${varName}=[${key2}];...}`);
});
// 生成 if-else 树
grenIfelse(0, opmate.getMateOri('_$bf'), codeArr);
```

全链路零外部依赖，~500 行纯计算 JS，全部可移植到 Go。

#### 6.1.3 keyname 重命名方案（失败但有价值的尝试）

在误判为"需要 Babel"期间，尝试了 keyname 重命名方案：

**思路**：如果 `coder.code` 的结构跨会话恒定（只是变量名变化），可以：
1. 捕获一次 reference session 的 `coder.code` 和 `cp[1]`
2. 对每个新会话，用 `cp1_new[i]` 替换 `cp1_ref[i]`
3. 得到新会话的 `coder.code`

**验证过程**：
- keyname 长度恒为 4 字符 ✅（跨 5 个会话验证）
- `functionsNameSort` 的 NUM 数组跨会话恒定 ✅
- `nameIdx`/`varIdx`/`innerIdx`（cp[1] 索引）跨会话恒定 ✅

**失败原因**：
- 主函数体内的**函数编号**（如 `[721]`、`[736]`）每次会话变化
- 这些编号来自 Babel AST 的函数索引分配，取决于 keyname 排序顺序
- 不同 keynames -> 不同排序 -> 不同编号分配
- 简单的变量名替换无法还原正确的编号

**但有价值的发现**：
- 证明了 keyname 生成是确定性的（`grenKeys(909) + arraySwap(scd(nsd))`）
- 证明了 `functionsNameSort` 结构是站点常量
- 为后续 Coder 直接移植提供了信心

### 6.2 codeUid 服务器校验

设 codeUid=0 测试：10/10 全部 412。服务器解密 basearr 后重新计算 codeUid 并比对，不匹配则拒绝。

### 6.3 codeUid 计算公式

```javascript
// Cookie.js getCodeUid()
const mainFunctionCode = coder.code.slice(...coder.mainFunctionIdx);
const funcIdx = +ascii2string(gv.keys[33]);
const validIdx = (!isNaN(funcIdx) && funcIdx < coder.functionsNameSort.length) ? funcIdx : 20;
const funcEntry = coder.functionsNameSort[validIdx];
const funcCode = funcEntry && funcEntry.code ? funcEntry.code : mainFunctionCode.substring(0, 100);
const len = parseInt(mainFunctionCode.length / 100);
const keys34val = +ascii2string(gv.keys[34]) || 0;
const start = len * keys34val;
const sliceCode = mainFunctionCode.substr(start, len);
const codeUid = (uuid(funcCode) ^ uuid(sliceCode)) & 65535;
```

**Go 移植**（`coder.go`）：
```go
func ComputeCodeUid(c *Coder, keys33, keys34 int) int {
    mainFnCode := c.code[c.mainFunctionIdx[0]:c.mainFunctionIdx[1]]
    validIdx := keys33
    if validIdx >= len(c.FunctionsNameSort) { validIdx = 20 }
    funcCode := c.FunctionsNameSort[validIdx].Code
    sliceLen := len(mainFnCode) / 100  // 723
    sliceStart := sliceLen * keys34
    sliceCode := mainFnCode[sliceStart : sliceStart+sliceLen]
    return int((uuidString(funcCode) ^ uuidString(sliceCode)) & 65535)
}
```

### 6.4 functionsNameSort 站点常量

- NUM 数组（56 个函数编号）：跨会话恒定 ✅
- nameIdx/varIdx/innerIdx（cp[1] 索引）：跨会话恒定 ✅
- keyname 长度：恒为 4 字符 ✅
- keynames 由 `grenKeys(909) + arraySwap(scd(nsd))` 确定性生成 ✅

### 6.5 scd PRNG 验证

**JS scd 实现**（`getScd.js`）：
```javascript
module.exports = function (num) {
    var scd = num;
    return function () {
        scd = 15679 * (scd & 65535) + 2531011;
        return scd;
    };
};
```

**Go 移植**（`coder.go`）：
```go
type Scd struct { scd int }
func (s *Scd) Next() int {
    s.scd = 15679*(s.scd&65535) + 2531011
    return s.scd
}
```

**验证**：
- `scd` 最大值 = 15679 × 65535 + 2531011 = 1,032,139,176 < 2³¹
- JS `& 65535` 先转 int32 再掩码，Go int 直接掩码，结果一致 ✅
- `arraySwap` 消耗 `len-1` 次 scd 调用，JS 和 Go 一致 ✅

### 6.6 GlobalText rune-based reader

**问题**：`globalText1` 包含 Unicode 字符（max charCode 50415）和 null byte（charCode 0）。Go 的 `string[i]` 返回字节（0-255），无法正确索引。

**修复**：使用 `[]rune` 代替 `string` 进行游标操作：
```go
type GlobalText struct {
    runes  []rune
    cursor int
}
func (g *GlobalText) GetCode() int {
    c := int(g.runes[g.cursor])
    g.cursor++
    return c
}
```

**验证**：BMP 字符（< 65536）的 `charCodeAt` 和 `rune` 值一致 ✅

### 6.7 getImmucfg 字符串提取

**JS 实现**（`utils/getImmucfg.js`）：
1. 遍历外层 JS，找到所有 `"` 引号对（跳过 `\"` 转义）
2. `unescape` 每个引号内容
3. 按长度降序排序，取前 4 个
4. 分别对应 `globalText1`（最长）、`cp0`、`cp2`、`globalText2`

**Go 实现**（`coder.go` `getImmucfg`）：
```go
func getImmucfg(jscode string) (*ImmuCfgRaw, error) {
    var quotes [][2]int
    inQuote := false
    for i := 0; i < len(jscode); i++ {
        if jscode[i] == '"' && (i == 0 || jscode[i-1] != '\\') {
            // toggle inQuote, record positions
        }
    }
    // sort by rune length descending, take top 4
}
```

**优化**：预提取到 JSON 文件（`globaltext1.json` 等），运行时直接加载，避免每次解析外层 JS。

## 7. basearr 逐 segment 逆向过程

### 7.1 basearr 结构发现

通过 Hook JS 管线的 `getBasearr` 函数，捕获 244 字节明文 basearr。分析 `numarrJoin` 的拼接逻辑：

```
numarrJoin(3, seg1, 10, seg10, 7, seg7, 0, seg0, 6, seg6, 2, seg2, 9, seg9, 13, seg13)
```

**关键发现**：`numarrJoin` 对**所有数组参数**都加长度前缀（因为第一个参数是标量 3，使 `ans.length > 0`）。

结构布局：
```
[3] [len(seg1)] [seg1...] [10] [len(seg10)] [seg10...] [7] [len(seg7)] [seg7...] ...
```

### 7.2 seg1（浏览器指纹，73 字节）

通过对比 5 个会话的 seg1，定位变化位置：
- pos 21-23：`execRandomByNumber` 输出（随机值）
- pos 24：`execNumberByTime`（计时值）
- 其余位置恒定（UA CRC32、platform ASCII、screen 尺寸等）

**关键值**：
- `innerHeight = 937` -> `[3, 170]`（0x03AA）
- `innerWidth = 1680` -> `[6, 144]`（0x0690）
- `outerHeight = 1025`（availHeight）-> `[4, 1]`（0x0401）
- `uuid("/")` = `[121, 211, 210, 212]`

### 7.3 seg6（encryptMode2，16 字节）

**结构**：`[1, 0, 2, 0, 2, 1, enc2(8B), numToNumarr2(decoded)(2B)]`

**enc2 计算**：
1. `decrypt(ascii2string(keys[22]))` -> 32 字节明文
2. `numarrAddTime(keys[16])` -> 21 字节增强密钥
3. `encryptMode2(plaintext, key)` -> AES-CBC decrypt（IV = plaintext[:16]）
4. Strip PKCS7 padding -> 8 字节结果

**ECB vs CBC 调查**：
- 初始实现使用 AES-ECB per block（错误）
- 通过 Node.js `crypto.createDecipheriv("aes-128-cbc")` 验证：标准 AES-CBC decrypt
- IV = plaintext 的前 16 字节（自加密模式）
- 修复后 enc2 输出与 JS 一致 ✅

**decode 结果**：
- `decode(decrypt(keys[22]))` 返回 `NaN`（因为解密后的字符串不是数字）
- `numToNumarr2(NaN)` 在 JS 中 = `[NaN >> 8 & 255, NaN & 255]` = `[0, 0]`
- Go 中返回 0，`numToNumarr2(0)` = `[0, 0]` ✅

### 7.4 seg2（fixedValue20，4 字节）

**fixedValue20.js 分析**：
1. 获取 r2mka 任务树中 `U250200532` 的 `taskori`（原始 taskarr）
2. `taskori` 结构：20 组 × 7 元素 = 140 元素
3. 每组第 7 个元素（`taskori[idx*7+6]`）是 keyname 索引
4. 查 `cp1[keynameIdx]` 得到 keyname 字符串
5. 建立映射 `maps[keyname] = values[idx]`
6. 查 `keys[29..32]` 的 ASCII 字符串在 `maps` 中的值

**values 数组**（站点常量）：
```
[103, 0, 102, 203, 224, 181, 108, 240, 101, 126,
 103, 11, 102, 203, 225, 181, 208, 180, 100, 127]
```

**taskori 硬编码**（从 JS dump 获取，站点常量）：
```
[1,0,2,0,10,46,6, 1,0,2,1,10,46,3, 1,0,2,2,10,46,32, ...]
```

**验证**：跨 5 个会话，`functionsNameSort` 的 NUM 数组和 nameIdx 恒定 ✅

### 7.5 seg10（time + keys19 + random，19 字节）

**结构**：`[flagcheck, 13, time4, keys19_4, random8, flag]`

- `flagcheck`：`keys[24] > 0 && < 8 ? 1 : 0`
- `time4`：`numToNumarr4(r2mkaTime + runTime - startTime)`
- `keys19_4`：`numToNumarr4(+ascii2string(keys[19]))`
- `random8`：`numToNumarr8(Math.floor(random * 1048575) * 4294967296 + (currentTime & 4294967295))`
- `flag`：`+ascii2string(keys[24])`

### 7.6 seg7（flag + codeUid，12 字节）

**结构**：`[numToNumarr4(16777216), numToNumarr4(0), numToNumarr2(1801), numToNumarr2(codeUid)]`

- `16777216` = `0x01000000` -> `[1, 0, 0, 0]`
- `flag = 1801` = `0x0709` -> `[7, 9]`
- `codeUid` 从 Coder 计算

### 7.7 seg0（加密指纹块，101 字节）

站点常量，从 JS dump 硬编码。跨 5 个会话完全一致 ✅。

## 8. 中间结果时间线

以下是移植过程中的关键里程碑和对应通过率：

| 时间 | 通过率 | 关键变化 | 剩余问题 |
|------|--------|----------|----------|
| 早期 | 0%（407 字符） | 加密层完成，basearr 未实现 | basearr 全部缺失 |
| 中期 | 15/15=100% | Node.js helper 生成 basearr + Go cookie | 依赖 Node.js |
| Coder 移植后 | 3/15=20% | 纯 Go basearr（codeUid=0, seg2/6 错误） | codeUid + basearr 内容 |
| jsUnescape 修复 | 0/15=0% | r2mkaText 正确（42222）但 codeUid 仍错 | codeUid 错误 |
| functionsSort 修复 | 2/15=13% | functionsNameSort=56，codeUid 非零 | codeUid 不精确 |
| 逐字节对比 | 定位 bug | compare_coder.go 发现 `]` 缺失 | 修复中 |
| `]` 修复 | 3/15=20% | codeUid 偶尔正确 | `$_ts` 误替换 |
| `$_ts` 修复 | codeUid 精确匹配 | coder.code 逐字节一致 | 调试清理 |
| 调试清理修复 | **30/30=100%** | 恢复误删的 SetMate 调用 | **无** ✅ |

## 9. 调试工具与过程文件（归档）

以下文件记录了调试过程中的关键步骤，保留作为过程证明：

| 文件 | 用途 | 关键发现 |
|------|------|----------|
| `compare_coder.go` | Go Coder 与 JS 逐字节对比 | 定位到 `]` 缺失和 `$_ts` 误替换 |
| `js_dump_coder.js` | JS Coder 输出 dump（固定 nsd/cd） | 提供 JS 基准对比数据 |
| `debug_gren_js.js` | JS gren 函数状态 dump | 验证游标位置和数据结构匹配 |
| `keygen_helper.js` | Node.js 完整管线 helper（回退方案） | 早期 100% 验证 basearr + cookie 生成 |
| `globaltext1.json` | 预提取的 globalText1（站点常量） | 避免运行时从 outer JS 提取 |
| `globaltext2.json` | 预提取的 globalText2（站点常量） | 同上 |
| `cp0.json` | 预提取的 cp0（站点常量） | 同上 |
| `cp2.json` | 预提取的 cp2（站点常量，240 元素） | 同上 |
| `codemap_full.json` | 一次性 codemap dump（task engine WIP） | task engine 调试用 |
| `r2mka_codes.json` | r2mkaText char code 数组 | r2mka 解析调试用 |
| `child_one_info.json` | r2mka 任务树结构信息 | UID 匹配验证 |
| `cp2_dump.json` | cp2 常量数组（旧格式） | 早期调试用 |

## 10. Go 代码结构

```
go-impl/
├── go.mod              # Go module 定义（依赖 goja）
├── main.go             # 主程序：HTTP + cookie 生成 + 重放测试
├── crypto.go           # AES-CBC + XOR + UUID + numarrJoin + numarr2string + numarrAddTime
├── huffman.go          # Huffman 编码（float64 curKey 模拟 JS int32）
├── coder.go            # Coder 移植：globalText 解析 + 代码生成 + codeUid 计算
├── keygen_pure.go      # 纯 Go cd 解密 + goja 外层 VM + offset + basearr + fixedValue20 + seg6
├── taskengine.go       # task engine 框架（r2mka 解析 + opcode 映射，WIP）
├── tls.go              # TLS 跳过证书验证
├── util.go             # 工具函数
├── compare_coder.go    # 调试工具：Go vs JS coder.code 逐字节对比
├── globaltext1.json    # 预提取站点常量
├── globaltext2.json    # 预提取站点常量
├── cp0.json            # 预提取站点常量
├── cp2.json            # 预提取站点常量
├── js_dump_coder.js    # 调试工具：JS Coder 输出 dump
├── debug_gren_js.js    # 调试工具：JS gren 状态 dump
├── keygen_helper.js    # Node.js 回退方案（已不需要，保留作为参考）
└── pmos_go             # 编译后的 Go 二进制
```

## 11. 关键参数与常量

| 参数 | 值 | 说明 |
|------|-----|------|
| keys16 | `[21,144,168,179,84,253,195,75,183,231,80,149,100,10,25,180]` | 外层 AES 密钥（站点常量） |
| basestr | `qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^` | 86 字符编码表（cookie 用前 64） |
| flag | 1801 | 站点标识 |
| cookiePrefix | `'0'` | cookie 字符串前缀 |
| cookieName | `aoU85Lxl9xxNP` | P cookie 名称 |
| keynameNum | 909 | keyname 数量 |
| basearr 长度 | 244 字节 | 明文指纹数组 |
| nextarr 长度 | 285 字节 | 含 high byte (hasDebug=true) |
| enc16 长度 | 320 字节 | 外层加密输出（含 16 字节 IV） |
| cookie 长度 | 428 字符 | 最终 cookie 字符串 |
| coder.code 长度 | ~290KB | Coder 生成的反混淆代码 |
| functionsNameSort | 56 条目 | 函数名排序表（站点常量） |
| codeUid 范围 | 0-65535 | 16 位函数体校验和 |
| scd 公式 | `15679*(scd&65535)+2531011` | LCG 伪随机数生成器 |
| globalText1 长度 | 144139 字符 | 站点常量（从外层 JS 提取） |
| r2mkaText 长度 | 42222 字符 | 解析后的 r2mka 文本 |
| cp2 长度 | 240 元素 | 常量数组（站点常量） |

## 12. 编译与运行

```bash
# 编译
cd go-impl && go build -o pmos_go .

# 运行（需在项目根目录，外层 JS 使用相对路径）
cd .. && go-impl/pmos_go

# 输出示例
# === Go Result: 200=30 412=0 (100%) ===

# Coder 逐字节对比（调试用）
go-impl/pmos_go compare
# 需要 /tmp/fixed_session.json 和 /tmp/js_coder_code.txt
# 先运行 node go-impl/js_dump_coder.js 生成对比基准

# 测试 cd 解密（验证 keys 正确性）
go-impl/pmos_go test
```

**依赖**：
- Go 1.24+
- goja（纯 Go JS 引擎，`go get github.com/dop251/goja`）
- 无 Node.js 依赖（仅调试对比时使用）

## 13. 调试方法论总结

### 11.1 逐层对比法

从 HTTP 层开始，逐层验证每个中间产物的正确性：
1. HTTP 挑战页解析 → nsd/cd 提取 ✅
2. 外层 VM → cp3 一致 ✅
3. cd 解密 → cdArr 一致 ✅
4. offset → bruteForceOffset 验证 ✅
5. keys → keys16/17/2 逐字节一致 ✅
6. basearr → 长度 244 一致 ✅
7. Huffman → numenc 逐字节一致 ✅
8. AES → enc16 逐字节一致 ✅
9. cookie → 428 字符一致 ✅
10. HTTP 重放 → 200 ✅

### 11.2 固定 session 对比法

当中间产物依赖随机参数（nsd）时，固定一个 session 做逐字节对比：
1. 捕获 nsd/cd 到文件
2. JS 侧用固定 nsd/cd 运行，输出结果到文件
3. Go 侧用相同 nsd/cd 运行，逐字节对比
4. 定位第一个差异字节，分析上下文

### 11.3 根因分析法

当发现差异时，溯源到 JS 源码的具体行：
1. 找到差异字节位置和内容
2. 在 JS 源码中搜索对应的字符串字面量
3. 对比 Go 移植代码中的对应字符串
4. 修复并重新验证

### 13.4 Python 交叉验证法

当 Go 和 JS 的行为不一致时，用 Python 作为中立第三方验证：
1. 用 Python 加载相同输入数据
2. 用 Python 模拟 JS 的 `charCodeAt` / `substr` / `split` 行为
3. 对比 Python 和 Go 的中间结果
4. 应用例：验证 keycodes split 结果、globalText 内容、basearr segment 对比

### 13.5 关键教训

1. **sed 命令的危险性**：`sed 's/\$_ts/Ts/g'` 会替换所有匹配，包括字符串字面量
2. **单字符差异的致命性**：CRC32 哈希对 1 字节差异完全敏感，必须逐字节精确
3. **游标 vs 字节数**：Go `len(slice)` 是元素数，JS `join('').length` 是字节数，不能直接对比
4. **JS 语义差异**：`charCodeAt` 返回 UTF-16 码元，Go `[]rune` 返回 Unicode 码点，BMP 字符一致但需注意
5. **调试输出清理要谨慎**：用 Python 脚本批量删除 Fprintf 调试行时，可能误删相邻的非调试代码（如 `SetMate` 调用）
6. **错误结论的危害**："Coder 需要 Babel"的错误判断导致 2 小时方向偏离，应该先完整阅读源码再下结论
7. **codeArrLen 对比陷阱**：Go `len(codeArr)` = 字符串元素数（如 41622），JS `codeArr.join('').length` = 总字节数（如 217754），两者差 5 倍但代码可能是正确的

---

*文档更新：2026-07-30，纯 Go 100% 通过率达成*
