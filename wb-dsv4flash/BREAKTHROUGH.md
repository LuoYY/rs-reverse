# 🔥 纯算法 query 参数生成 — 完全破解（2026-07-31）

> 本文档供后续工程师复现与理解。除算法本身外，重点记录**每一步探索的初衷**（为什么做这个实验）与**每个结论的证据**（在哪里、怎么验证）。
> 配套文档：`MASK_ORIGIN.md`（PREFIX_MASK 生成代码的完整定位过程）。

---

## 0. 一句话结论

**瑞数 VMP 的 query 参数（本会话名 `r20SZOQm`，随会话变化）已可用纯 Node 算法生成，服务器 100% 接受**——首次在不依赖浏览器/CDP/沙箱的前提下端到端通过服务器校验。

验证结果：3 轮会话 × 6 请求（3 URL × 2 方法）= **18/18 全部 200**；最终综合验证 1 会话 8 请求 = 8/8。返回真实业务数据（如 `{"status":0,"message":"Success","data":{"marketIpMap":...}}`）。

---

## 1. 背景与历史困境（为什么要重新做）

本项目此前已实现"纯算法 cookie"（挑战页 → 管线 Coder → O+P cookie 重放 200），但 **query 参数（业务请求 URL 上的 `r20SZOQm=...`）一直无法纯算法生成**，只能靠浏览器/CDP。历史上所有"用管线 keys 解密 query"的尝试都失败，失败根因有 3 条：

1. **把 session_data 当加密数据**——反复尝试用 keys16/keys17/basearr 解密 query 的 session 段（48B）。真相：它是 `keys[2]` 的**原始明文 48B**，不经过任何加密，解密方向就错了。
2. **用 keys16/keys17 直接解 request_data**——密钥不是裸 keys17，而是 `numarrAddTime(keys17, time, random)` 生成的 **21B 变长密钥**（带 time/ele 混淆）。直接拿 16B keys17 去解密必然失败。
3. **没搞清服务器校验范围**——误以为 13B 会话前缀全部需要精确复现，于是拼命破解 13B 前缀的完整派生逻辑（计数器、时间等），浪费了大量时间。真相：服务器**只校验 prefix[0..7] + URL CRC32 + 88B CRC32**，其余字段全随机即可。

> 教训：**先探明服务器的校验边界（黑盒实验），再决定要破解哪些字段**，比在纯代码层面瞎猜高效得多。这是本任务最关键的策略转变。

---

## 2. 完整算法（纯 Node，可直接复现）

### 2.1 query 总结构（88 字节 → 119 字符）

```
query = '0' + numarr2string(88B, basestr)

88B = [CRC32(4B)] [1] [0] [48] [session_data 48B] [32] [request_data 32B]
       ↑0-3        ↑4  ↑5  ↑6   ↑7-54              ↑55  ↑56-87
```

| 字段 | 内容 | 说明 |
|---|---|---|
| CRC32 | `crc32b(88B[4..87])`，大端 4 字节 | 覆盖整个 body（不含自身），**服务器校验** |
| `1 0 48` | 常量标记 | session_data 的长度头（48 = 0x30），从浏览器捕获的 session 段逐字节确认 |
| session_data | **`keys[2]` 原始 48B** | cd 派生，**会话内固定、跨 URL/请求不变**（非加密！） |
| `32` | 常量标记 | request_data 的长度头（32 = 0x20） |
| request_data | `encryptMode1(plain24, queryKey21, flag=0)` 的 32B 输出 | 每请求变化 |

`numarr2string(bytes, basestr)` 是管线已有函数（base64 风格自定义字母表编码，3 字节→4 字符，余数 2 字符规则见 `src/handler/parser/common/numarr2string.js`）。

### 2.2 queryKey（21 字节，逐请求变化）

```
queryKey = numarrAddTime(keys17, unixTime, random)[0]
         = [ (keys17[i] ^ ele) × 16 ]  ++  [ (time4[j] ^ ele) × 4 ]  ++  [ ele ]
ele = ceil(random * 256)        // 0..255 的随机字节
time4 = unixTime 的大端 4 字节
```

- 前 16 字节 = keys17 每字节 XOR ele；接着 4 字节 = 时间戳 XOR ele；最后 1 字节 = ele 本身。
- **ele 必须与加密时的 ele 一致**；生成时只需自己定一个 ele，写入 key 并用于加密即可，服务器不校验 ele 具体值。
- `numarrAddTime` 见 `src/handler/parser/common/numarrAddTime.js`。

### 2.3 plain24（24 字节明文，重点）

```
plain24 = [
  keys2[0]^0x0b, keys2[1]^0x16, keys2[2],    keys2[3]^0x10,
  keys2[4],      keys2[5]^0x31, keys2[6],    keys2[7]^0x01,   // bytes 0-7  ★ 服务器校验
  randByte(), randByte(), randByte(), randByte(), randByte(), // bytes 8-12 任意
  randByte(), randByte(), randByte(),                         // bytes 13-15 任意
  0xb7, randByte(), randByte(),                               // bytes 16-18 任意
  randByte(),                                                 // byte 19 任意
  (crcUrl>>>24)&255, (crcUrl>>>16)&255, (crcUrl>>>8)&255, crcUrl&255,  // bytes 20-23 ★ 服务器校验
]
crcUrl = crc32b(Buffer.from(url.toUpperCase()))   // url 是请求路径，如 '/px-gateway/GatewayConfig/getGatewayConfig'
```

- **bytes 0-7**：`keys2[0..7] XOR PREFIX_MASK`（掩码见 2.4）。其中掩码为 0 的位置（byte 2/4/6）直接等于 keys2 原字节。
- **bytes 8-19**：全部随机即可。真实浏览器里它们是时间编码、会话计数器等，但**服务器完全不校验**（逐字节修改实验证明，见 §5.3）。
- **bytes 20-23**：`CRC32(url.toUpperCase())` 大端。注意必须 **toUpperCase** 且**包含前导 `/`**，缺一不可（4 URL 验证，见 §5.4）。

### 2.4 站点固定掩码（PREFIX_MASK）

```
PREFIX_MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01]
```

- 跨 5 个浏览器会话验证恒定（每个会话独立推导 mask[i] = plain[i] XOR keys2[i]，结果一致）。
- 服务器只校验 prefix[0..7] = keys2[0..7] XOR mask 这 8 字节（`23_prefix_byte_test.js` 逐字节实验，见 §5.3）。
- mask 的**确切生成代码**已在浏览器运行时定位（`global[157]` XOR 函数的输入数组），完整定位过程见 `MASK_ORIGIN.md`。
- ⚠️ 若目标部署切换到 443 或站点更新版本，需按 §6.3 重新验证（10 分钟可完成）。

---

## 3. 关键事实表（结论 + 证据）

| # | 事实 | 证据 | 捕获文件 |
|---|---|---|---|
| 1 | **session_data = keys[2] 原始 48B**，非加密 | 浏览器 `keys30[2]`（48B）与 query session 段逐字节相等（3 会话） | `everything_*.json` |
| 2 | **queryKey = numarrAddTime(keys17)** | [165] 密钥 key21 反推 base16 == keys30[17]（3/3）；用捕获 key21 直接 `encryptMode1` 复现密文 3/3 | `everything_*.json`（encLog） |
| 3 | **request_data = encryptMode1(plain24, key21, 0)** | [165] hook 捕获 `arr[24]→arr[32]`，结果与 query request 段逐字节相等 | `cd_keys_query_*.json` / `query_enc_*.json` |
| 4 | **服务器校验范围**：prefix[0..7] + url_crc(4B) + 88B CRC32 | 逐字节修改重放：prefix[0-7] 任一 XOR 1 → 400；url_crc[0] +1 → 400；其余全部 → 200 | `prefix_test_*.json` |
| 5 | **prefix[8..12] / time(13-15) / const3(16-18) / counter(19) 不校验** | 修改任意 → 200 | 同上 |
| 6 | **url_crc = CRC32(url.toUpperCase())** | 4 个不同 URL，每个字节与 crc32 输出 4/4 匹配 | `plaintext_*.json` + `08_plaintext_analysis.js` |
| 7 | **cookie 与 query 共用管线**（keys2/keys17 + encryptMode1 + basestr + CRC32） | 同一会话可同时生成有效 cookie 与 query | 端到端 18/18 |
| 8 | query 参数名 = `keys[7].split(';')[1]`（会话相关） | 管线直接读取 | — |

### 反重放机制（为什么随机字节可行）

服务器对**相同 request_data 去重**：完全重放同一 query 必 400（`12_replay_modify_test.js` 验证）。因此只要每次请求用新的随机字节（bytes 8-19）重新加密，天然满足"不同 request_data"，无需实现真实计数器。

---

## 4. 端到端流程（纯 Node，10 步）

```
1.  GET /                        → 412 挑战页，正则提取 $_ts.nsd / $_ts.cd，抓 set-cookie 里的 O cookie
2.  runOuterVM({nsd, cd}, outerJs) → cp[3]（外层 VM 纯计算，不依赖浏览器指纹）
3.  管线 Coder + Cookie           → keys2/keys17 + P cookie（重放 / 必须 200）
    - keys[2] = session_data；keys[17] = queryKey 的 base
    - 参数名 paramName = keys[7].split(';')[1]
    - 细节：ts.keynameNum=909；fullTs.cp[3]=cp3Override；gv.config.codemap=codemap（缺了会报 params 错）
4.  session_data = keys2（48B 原样）
5.  queryKey = numarrAddTime(keys17, floor(Date.now()/1000), Math.random())[0]
6.  plain24 = [keys2[0:8]^PREFIX_MASK] ++ [随机5B] ++ [随机3B] ++ [0xb7,随机,随机] ++ [随机1B] ++ [CRC32(url.toUpperCase()) 4B]
7.  request_data = encryptMode1(plain24, queryKey, 0)
8.  88B = [CRC32(4B)] ++ [1,0,48] ++ keys2 ++ [32] ++ request_data
9.  query = '0' + numarr2string(88B, basestr.split(''))
10. 请求: <base><url>?<paramName>=<query>，header 带 O+P cookie + 正常 UA → 200
```

运行环境要求：Node 18+；`NODE_OPTIONS=--dns-result-order=ipv4first`；`NODE_TLS_REJECT_UNAUTHORIZED=0`、`OPENSSL_LEGACY_RENEGOTIATION=1`（自签名证书/旧 TLS）。

---

## 5. 探索路径全记录（每步的初衷、做法、结论）

> 本节是全文最值得读的部分：它解释了"为什么当时要做那个实验"，方便后人复用方法论，也防止走回死胡同。

### Phase 1：同会话捕获（01-05 号脚本）

**初衷**：跨会话比较 keys 没有意义——每个会话 keys 不同。必须**在同一浏览器会话内**同时拿到：query 原文、keys30 数组、[165] 加密调用入参（明文/密钥）、挑战页 nsd/cd。这样才能把 query 的每个字段与 keys 关联起来。

**做法**：Patchright 启动浏览器 → reload（触发 RS 初始化）→ 通过 `XMLHttpRequest.prototype.send` 的闭包链定位 `global` 数组 → hook `global[165]` 记录每次加密调用的 `(明文, 密钥, flag, 密文)` → 触发业务请求捕获 URL 上的 query → 导出 keys30。

**关键技术：定位 global 数组**（复用链，后续所有脚本的骨架）：
```js
// 1. send 源码（Function.prototype.toString 绕过 [native code] 伪装）
const src = await cdp.evaluate('Function.prototype.toString.call(XMLHttpRequest.prototype.send)');
// 2. 正则提取 dispatcher 名 dName（send 内部调用 dispatch 函数）
const m = src.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
// 3. 沿 [[Scopes]] 找 dName 函数
// 4. 在 dName 源码中找 global 名：m32 正则 `<=32?...=[_$\w]+[` 提取
// 5. 沿 [[Scopes]] 找 global 数组 objectId → 之后一切 hook 都挂在它上面
```

**产物**：`same_session_*.json`、`cd_query_*.json`、`cd_keys_query_*.json`、`enc_calls_*.json`。

### Phase 2：验证加密链（06_verify_query_chain.js）

**初衷**：拿到浏览器密钥 key21（21B）后，验证它是否来自 keys17——若成立，则 query 加密的密钥问题就闭环了。

**做法**：对每个捕获调用：
1. 从 key21 反推：`ele = key21[20]`；`base16[i] = key21[i] ^ ele`；`time = 大端(key21[16..19] ^ ele)`。
2. 检查 `base16 == keys30[17]` → 3/3 全部 YES。
3. 用管线 `encryptMode1(明文, key21, 0)` 复现密文 → 与浏览器密文逐字节一致 3/3。

**结论**：`queryKey = numarrAddTime(keys17, time, random)`，加密 = `encryptMode1(plain, key21, 0)`。密钥问题**完全解决**。

### Phase 3：明文结构（07_capture_plaintext_structure.js）

**初衷**：密钥解决了，剩下明文 24B 怎么来。需要区分"会话固定"与"请求变化"的字节。

**做法**：同会话交替触发 8 个请求（4 个不同 URL 组合），记录每个请求的明文，按列对比。

**发现**（`plaintext_*.json`）：
- bytes 0-12（13B 前缀）会话内固定；
- bytes 16-18 常量 `b7 66 51`（另一会话为 `b7 71 d7`，即 byte16 恒 0xb7）；
- **byte19 = 计数器 × 2**（e8→ea→ec… 会话级单调递增）；
- **bytes 20-23 = URL 派生 nonce**（同一 URL 三次请求完全相同：getGatewayConfig → `7f 33 94 9d`）。

### Phase 4：URL nonce 破解（08_plaintext_analysis.js）

**初衷**：bytes 20-23 对 URL 确定性派生，最可能是哈希。逐个测试 CRC32/MD5/SHA-1 及大小写/去斜杠变体。

**结果**：`crc32(url.toUpperCase())` **4/4 匹配**（getGatewayConfig→`7f33949d`、security→`574cf152`、captcha→`fdb26993`、verifyType→`eaf415b2`）。

> 细节：`08` 脚本最初按触发顺序对齐 URL 失败（后台有干扰请求），靠 nonce 唯一性反查 URL 对齐——先猜后验，对不上再换对齐方式。

### Phase 5：服务器校验边界（决定性实验，12 + 23 号脚本）

**初衷**：与其继续破解 13B 前缀（推测含会话哈希/计数器/时间，非常难），不如**先用黑盒实验问服务器：你到底校验哪些字节**。这决定了纯算法必须复现的最小集合。

**做法**（`12_replay_modify_test.js`）：浏览器捕获合法 query + 明文 + 密钥 → Node 里修改明文某字段 → 用捕获 key21 重新加密 → 重放，观察 200/400。第一批测试：
- 原样重放（浏览器最新 query）→ 400（**去重**）
- 修改 time3 为 `12 34 56` → 200
- 修改 counter +2 → 200
- 修改 prefix[0] XOR 1 → 400
- 修改 const3[0] XOR 1 → 200
- 修改 url_crc[0] XOR 1 → 400

**做法**（`23_prefix_byte_test.js`，更精细）：对 prefix 13 个字节**逐一** XOR 1 重放。结果（`prefix_test_*.json`）：

| 修改 | 状态 |
|---|---|
| 基线（重构，不改明文） | 400（仍是同 request_data 去重，或反重放命中） |
| prefix[0..7] 任一 XOR 1 | **400** |
| prefix[8..12] 任一 XOR 1 | 200 |
| counter(19)+2 | 200 |
| time(13)=0x11 | 200 |
| url_crc[0]+1 | **400** |

**最终结论（决定性）**：服务器校验 = **prefix[0..7]（8B）+ url_crc（4B）+ 88B CRC32（4B）**，其余 12B 全随机。纯算法只需破解 8B prefix！

### Phase 6：破解 prefix 的失败尝试（10-22 号脚本）

**初衷**：既然只要 8B prefix，就集中攻它。尝试顺序（每步都排除了一个假设）：

| 脚本 | 假设 | 结果 |
|---|---|---|
| 10_crack_session16 | prefix13+const3 = 某 16B 会话值的哈希 | 简单哈希穷举失败 |
| 11_capture_everything | 从同会话抓所有来源（O/P cookie、VM 子程序、keys30）对比 | 无匹配 |
| 12/23（见 Phase 5） | —— | **确立校验边界，砍掉 5B** |
| 13_crack_prefix | O/P cookie 内部含 prefix | O cookie 解码后无 |
| 14_pipeline_validate | 管线 cd→keys 能否对浏览器捕获的 cd 还原 | 管线自建会话 OK；对浏览器 cd 不匹配（浏览器多轮 412 重载，捕获的 cd 非最终）——**绕开，不用解决** |
| 15_mask_analysis | mask = keys2[i]^prefix[i]，跨会话是否恒定 | **发现前 8B 恒定** → PREFIX_MASK 诞生 |
| 16/18/25/26 | VM 栈/global 里搜 mask 字面量 | 无（掩码运行时生成） |
| 19_mask_bruteforce | mask 尾部字节的公式 | 无简单公式 |
| 20_counter_analysis | 计数器 = 某哈希 | 否 |
| 21_sandbox_verify | 沙箱跑真实动态代码 | 沙箱会话结构不同（指纹），弃用 |
| 22_o_cookie_decrypt | O cookie 用 keys16/17 解密 | 解密失败 |

**转折点**：`15_mask_analysis.js` 用 5 个会话推导出 `mask[0..7]` 恒定 → 直接**用 `PREFIX_MASK` 硬编码进生成器**，不再追问 mask 怎么来的 → **18/18 全部 200**，任务达成。

### Phase 7：mask 生成代码定位（24-47 号脚本，见 MASK_ORIGIN.md）

**初衷**：用户追问"掩码既然在本地 JS 必然存在，定位它的确切生成代码"。这是后续独立任务，完整过程见 `MASK_ORIGIN.md`。

---

## 6. 复现指南

### 6.1 环境

- Node 18+（管线需 `module-alias`）；Patchright 用于浏览器捕获（仅分析用，生成方案零浏览器依赖）
- 依赖：项目管线 `src/handler`、`extract_dyncode_20080.js`、外层 JS `example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js`（443 与 :20080 外层 VM 字节码相同，可复用）
- 运行命令统一加：`NODE_OPTIONS=--dns-result-order=ipv4first`
- 浏览器捕获脚本需 `NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules`（patchright 所在）

### 6.2 快速验证（推荐顺序）

```bash
# 1) 单会话端到端（最快闭环）
NODE_OPTIONS=--dns-result-order=ipv4first node wb-dsv4flash/pure_query_gen.js "/px-gateway/GatewayConfig/security" GET

# 2) 同会话压力测试（6 请求）
NODE_OPTIONS=--dns-result-order=ipv4first node wb-dsv4flash/stress_test.js

# 3) 可复用模块（代码集成入口）
NODE_OPTIONS=--dns-result-order=ipv4first node -e "
const { PmosQueryClient } = require('./wb-dsv4flash/query_gen_module.js');
(async()=>{
  const c = new PmosQueryClient(); await c.init();
  console.log('param=' + c.paramName);
  console.log((await c.get('/px-gateway/GatewayConfig/security')).status);
  console.log((await c.post('/px-gateway/GatewayConfig/getGatewayConfig', {a:1})).status);
})();"
```

### 6.3 掩码失效时如何重新提取（部署/版本变更时必做）

1. 浏览器会话 hook `global[165]`（参考 `18_capture_global_at_encrypt.js` / `47_hook_xor_103.js`），触发 query，拿 24B 明文。
2. 同会话取 `keys30[2]`（keys2）。
3. `mask[i] = plain24[i] XOR keys2[i]`（i=0..7）。
4. 至少 2 个会话验证恒定，更新 `PREFIX_MASK` 常量。

### 6.4 常见坑

- **管线报 `params` undefined**：`gv.config.codemap = codemap`（`coder.run()` 返回）必须设置，否则 `runTask.js` 取不到 codemap。
- **module-alias 失效**：`require('module-alias')(path.dirname(require(path.join(ROOT,'utils/paths.js')).package))`——从 `wb-dsv4flash/` 子目录运行必须这样定位根目录，不能写死 `require('module-alias')('.')`。
- **浏览器 hook 卡死/超时**：hook 注入越晚越好（reload 完成后注入，只影响 query 阶段）；hook 内禁止再调被 hook 的方法（`content.slice()` 会递归），用原始引用 + 循环拷贝（见 `31_plain24_with_script.js` 修复注释）。
- **重放必 400**：服务器按相同 request_data 去重，不要用同一个 query 打两次。
- **URL CRC32**：必须 `toUpperCase()` 且含前导 `/`。

---

## 7. 产物清单

| 文件 | 用途 |
|---|---|
| `pure_query_gen.js` | 单会话端到端生成器（挑战→cookie→query→请求） |
| `stress_test.js` | 同会话 6 请求压力测试 |
| `query_gen_module.js` | **可复用模块**（`PmosQueryClient`：init→get/post） |
| `captures/*.json` | 全部证据数据（断点 dump、加密日志、明文结构、前缀测试、XOR 日志） |
| `MASK_ORIGIN.md` | PREFIX_MASK 生成代码定位全记录 |
| `BREAKTHROUGH.md` | 本文档 |

脚本族谱（按探索顺序）：
- 01-05 同会话捕获与 query 结构 → 06 加密链验证 → 07 明文结构 → 08 URL nonce → 09/16/18/26 断点与 VM dump → 10/11/13/15/19/20/22 前缀破解尝试 → 12/23 服务器校验边界（**决定性**）→ 14/17/21 管线/沙箱验证 → 24-47 mask 定位（见 MASK_ORIGIN.md）。

---

## 8. 遗留与注意事项

- `PREFIX_MASK` 为站点常量，跨 5 会话恒定；**443 部署或版本更新需重新验证**（§6.3）。
- 管线对"浏览器捕获 cd"的 keys 推导与浏览器不一致（浏览器经历多次 412→重载循环），但管线**自己拉取挑战 cd 时 100% 有效**——本方案用管线自建会话，规避了该问题，无需解决。
- 同会话内连续请求：每次调用 `genQuery` 重新生成（随机字节 + 新 key），不要复用。
