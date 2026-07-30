# JS -> Go 迁移文档：pmos.xj.sgcc.com.cn:20080 瑞数 VMP 纯协议

## 1. 背景与目标

将 Node.js 纯协议 cookie 生成管线（`pmos_xj_client.js`，已实现 100% 通过率）移植为 Go 语言，最终编译为单个二进制文件，无 Node.js 运行时依赖。

## 2. JS 管线总览（移植前）

```
拉 412 挑战页 → 解析 $_ts.nsd/cd + O cookie
  → Node.js vm 沙箱执行外层 VM → 提取 cp[3]（动态代码校验和）
  → Coder.run() → 生成代码 + codemap + r2mkaText
  → parser.init(coder):
      ├─ r2mka.init(r2mkaText) → 解析任务树
      ├─ tscp.init(coder) → 初始化 cp 值
      ├─ constData.init() → 生成 AES S-box (cfgnum) + bignum + decryptKeys
      ├─ tscd.init() → cd 解密 → keys（含 offset XOR）
      └─ meta.init() → meta 数据
  → Cookie.run():
      ├─ getBasearr(config, gv) → 244 字节明文指纹数组
      ├─ numarrEncrypt(basearr) → Huffman 编码
      ├─ xor(numenc, keys[2], 16) → 前 16 字节异或
      ├─ encryptMode1(xorResult, keys17, flag=0) → 内层 AES-CBC
      ├─ numarrJoin → 拼装 nextarr (285 字节)
      ├─ uuid(nextarr) → CRC32 校验
      ├─ encryptMode1(uuid+nextarr, keys16, flag=1) → 外层 AES-CBC (含 IV)
      └─ numarr2string(enc16) → Base64-like 编码 → cookie 字符串
  → 带 O+P cookie 重放首页 → 200
```

## 3. 移植分层与状态

### 3.1 已完成层（纯 Go，逐字节验证一致）

| 模块 | JS 源文件 | Go 文件 | 验证状态 |
|------|-----------|---------|----------|
| HTTP 客户端 | `pmos_xj_client.js` | `main.go` | ✅ 15/15 = 100% |
| Huffman 编码 | `numarrEncrypt.js` | `huffman.go` | ✅ 逐字节一致 |
| AES-CBC 加密 | `modeEncrypt.js` | `crypto.go` | ✅ 逐字节一致 |
| XOR | `tools.js` | `crypto.go` | ✅ 逐字节一致 |
| UUID/CRC32 | `uuid.js` | `crypto.go` | ✅ 逐字节一致 |
| numarrJoin | `numarrJoin.js` | `crypto.go` | ✅ 逐字节一致 |
| numarr2string | `numarr2string.js` | `crypto.go` | ✅ 逐字节一致（含 bug 修复） |
| 外层 VM (cp3) | `extract_dyncode_20080.js` | `keygen_pure.go` (goja) | ✅ cp3 一致 |

### 3.2 已移植但受阻层

| 模块 | JS 源文件 | Go 文件 | 状态 | 阻塞原因 |
|------|-----------|---------|------|----------|
| cd 解密 (decryptCd) | `decrypt.js` | `keygen_pure.go` | ✅ 逻辑完成 | — |
| cd 任务段解析 (parseCdSection) | `tscd.js` | `keygen_pure.go` | ✅ 逻辑完成 | — |
| genKeys | `tscd.js` | `keygen_pure.go` | ✅ 逻辑完成 | — |
| **offset 计算** | `runTask.js` | ❌ | **受阻** | 见 §5 |
| **basearr 生成** | `len243.js` | ❌ | **受阻** | 依赖 keys（需 offset） |

### 3.3 当前运行架构（含 Node.js 回退）

```
Go 二进制 pmos_go
├── Go net/http: 拉挑战页 + 重放 ✅
├── Goja (纯 Go JS 引擎): 外层 VM → cp3 ✅
├── 纯 Go cd 解密: decryptCd + parseCdSection ✅
├── 纯 Go offset 计算: ❌ 失败 → 回退
├── Node.js helper: ���整管线 (Coder + tscd + basearr) ⚠️ 回退
└── 纯 Go cookie 生成: Huffman + AES + XOR + UUID + 编码 ✅ (100%)
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

当加密输出长度非 3 的倍数时（320 字节 → 余 2 字节），最后 2 个剩余字节 `[b0, b1]` 编码为 3 个字符。第二个字符应为 `(b0 & 3) << 4 | b1 >> 4`，但代码用了 `(b1 & 3) << 4 | b1 >> 4`。约 75% 概率出错 → 412。Go 版直接使用了修复后的逻辑。

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
  return numarr1;  // 只改了前 16 字节，其余不���
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

### 4.6 hasDebug 运行时��� true

适配器配置 `hasDebug: true`（`len243.js`），即使构造函数传入 `hasDebug: false`。运行时 nextarr = 285 字节（含 1 字节 high byte = `128 | (len >> 8)`），而非 284。

### 4.7 getCfg strips time/ele

`encryptMode1` 内部的 `getCfg(keyarr)` 会调用 `numarrAddTime.reverse(keyarr)` strip 掉 time/ele，实际 AES 密���恒为原始 keys16/keys17。这意味着 `numarrAddTime` 的 time/ele 参数不影响加密结果。

## 5. 阻塞点详解：offset 计算

### 5.1 offset 是什么

`tscd.init()` 中：
```javascript
const offset = runTaskByUid('U14124020', [], getTaskarr(one, one[3]));
const ans = cdArr.slice(end).map((item, idx) => item ^ offset[idx % 8]);
gv._setAttr('keys', genKeys(ans));
```

offset 是一个 8 字节数组，用于 XOR cd 解密后的剩余字节，然后才能正确解析出 keys。

### 5.2 offset 不是常量

实测 5 组不同 cd，offset 各不相同：

| nsd | cdArr[1] | offset |
|-----|----------|--------|
| 28966 | 125 | `[9,155,2,3,5,2,7,7]` |
| 55241 | 141 | `[1,159,3,0,5,2,6,4]` |
| 37496 | 148 | `[9,155,2,0,5,5,7,7]` |
| 58803 | 148 | `[9,155,2,0,5,5,7,7]` |
| 19080 | 125 | `[9,155,2,3,5,2,7,7]` |

offset 与 cdArr[1]（task section 长度）相关，但不是简单映射。

### 5.3 offset 的计算依赖链

```
offset
  ← runTaskByUid('U14124020', [], taskarr)
    ← dynamicExec(taskItem, ...)
      ← gv.config.codemap（从 Coder 生成的代码 AST 提取）
        ← getCodemap(code)
          ← sdenv-extract AST 变换器（if/else → switch）
      ← gv.r2mka()（任务树，从 r2mkaText 解析）
        ← Coder.parseR2mka()（从生成的代码中提取）
      ← ES6 Proxy（loop_res / global_res 代理）
      ← eval()（动态执行 codemap 中的代码片段）
```

### 5.4 goja 为何无法计算 offset

1. **ES6 Proxy**：`runTask.js` 使用 `new Proxy({}, {...})` 代理 loop_res 和 global_res，goja 不支持 Proxy
2. **eval**：`dynamicExec` 使用 `eval()` 动态执行 codemap 中的代码片段
3. **getCodemap**：依赖 `sdenv-extract`（Babel AST 变换器），goja 无法运行
4. **codemap**：需要 `Coder.run()` 生成代码 + `getCodemap()` AST 变换，整个链路依赖 Proxy/eval

### 5.5 Node.js 管线中 offset 确实被计算

通过逆向验证（从已知 keys 反推 offset），确认 Node.js 管线中 `runTaskByUid('U14124020')` 成功返回了 8 字节 offset。但在独立调用时报错（"任务未找到"），说明 offset 计算依赖 parser.init 的完整上下文（r2mka 状态 + codemap）。

## 6. 已移植的 Go 代码结构

```
go-impl/
├── go.mod              # Go module 定义（依赖 goja）
├── main.go             # 主程序：HTTP + cookie 生成 + 重放测试
├── crypto.go           # AES-CBC + XOR + UUID + numarrJoin + numarr2string
├── huffman.go          # Huffman 编码（float64 curKey 模拟 JS int32）
├── keygen_pure.go      # 纯 Go cd 解密 + goja 外层 VM + offset（TODO）
├── tls.go              # TLS 跳过证书验证
├── util.go             # 工具函数
├── test_keygen.go      # cd 解密对比测试
├── keygen_helper.js    # Node.js 回退：完整管线 → JSON 输出 keys + basearr
├── check_offset3.js    # offset 逆向分析脚本
├── check_offset4.js    # offset 跨 cd 稳定性验证
└── pmos_go             # 编译后的 Go 二进制
```

## 7. 完全移除 Node.js 的三条路径

### 路径 A：移植 task engine（推荐，工作量最大但最彻底）

将 `runTask.js` 的 Proxy + eval 逻辑移植为 Go：

1. **r2mka 解析**（`r2mka.js`）：解析 r2mkaText → 任务树。纯算法，无 Proxy/eval 依赖，可直接移植。
2. **codemap 生成**（`getCodemap.js` + `sdenv-extract`）：将 if/else 链转为 switch 查找表。需要移植 AST 变换器或用正则替代。
3. **dynamicExec**（`runTask.js`）：用 Go 实现 codemap 查找 + 变量绑定 + 循环执行，替代 Proxy + eval。
4. **U14124020 任务**：该任务的 codemap 代码片段只做简单的数组操作（读取 cp2 + 返回 3 个值），可硬编码。

**预估工作量**：3-5 天

### 路径 B：用 V8 引擎替代 goja

用 [v8go](https://github.com/rogchap/v8go) 或 [cgo-v8](https://github.com/ngered/v8go) 嵌入 V8 引擎：

- V8 支持 Proxy/eval/全部 ES6
- 可直接运行 JS 管线（几乎不需修改）
- **缺点**：CGO 编译复杂、二进制体积大（~40MB）、交叉编译困难

**预估工作量**：1-2 天

### 路径 C：逆向 offset 数学公式

从 task 结构直接推导 offset，不经过 Proxy/eval/codemap：

1. 分析 `U14124020` 任务的 codemap 代码片段
2. 理解它如何从 cp2 + taskarr 计算 8 字节 offset
3. 用 Go 直接实现该公式

**优点**：工作量最小、性能最高
**风险**：如果瑞数更新 task 结构，需要重新逆向

**预估工作量**：1-2 天（需要深入分析 codemap）

## 8. 关键参数与常量

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

## 9. Go 移植验证方法

### 9.1 逐层对比

在 `keygen_helper.js` 中输出每层中间产物（pipeNumenc, pipeXor, pipeBasearrEncrypt, pipeNextarr, pipeUuid），Go 侧逐字节对比：

```go
fmt.Fprintf(os.Stderr, "  numenc match: %v\n", bytesEqual(numenc, pipeNumenc))
fmt.Fprintf(os.Stderr, "  xor match:    %v\n", bytesEqual(xorResult, pipeXor))
fmt.Fprintf(os.Stderr, "  baseEnc match: %v\n", bytesEqual(basearrEncrypt, pipeBae))
fmt.Fprintf(os.Stderr, "  nextarr match: %v\n", bytesEqual(nextarr, pipeNext))
fmt.Fprintf(os.Stderr, "  uuid: go=%d pipe=%d match=%v\n", uuidVal, data.PipeUuid, uuidVal == uint32(data.PipeUuid))
```

### 9.2 端到端验证

```bash
cd /Users/luoyy/work/github/GitHub/rs-reverse_glm
go-impl/pmos_go          # 运行 15 次测试
go-impl/pmos_go test     # cd 解密对比测试
```

## 10. 编���与运行

```bash
# 编译
cd go-impl && go build -o pmos_go .

# 运行（需在项目根目录，外层 JS 使用相对路径）
cd .. && go-impl/pmos_go

# 输出示例
# === Go Result: 200=15 412=0 (100%) ===
```

**依赖**：
- Go 1.24+
- goja（纯 Go JS 引擎，`go get github.com/dop251/goja`）
- Node.js（仅回退时需要，用于 keygen_helper.js）

---

*文档更新：2026-07-30*
