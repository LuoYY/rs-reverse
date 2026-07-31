# PREFIX_MASK 生成代码完全定位报告

> 日期：2026-07-31 · 方法：VM 断点 + 字节码反汇编 + 运行时 hook
> 配套文档：`BREAKTHROUGH.md`（query 算法总览）。本文档专讲 **mask（以及 plain24 每个字节）的确切生成代码是如何一步一步定位出来的**。

---

## 0. 问题由来（本文档存在的意义）

`BREAKTHROUGH.md` 中我们推导出服务器校验 `prefix[0..7] = keys2[0..7] XOR PREFIX_MASK`，其中 `PREFIX_MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01]` 是"跨 5 会话恒定的站点常量"。

用户提出一个关键质疑：**既然是服务器写死的校验常数，浏览器本地 JS 里必然存在对应的常量或生成代码**——否则浏览器自己怎么生成同样的 prefix？所以必须定位 mask 在浏览器里的确切来源，而不仅仅当作黑盒常量硬编码。

**目标**：找到 PREFIX_MASK 每个字节的生成代码，回答"它从哪来、怎么算出来的"。

---

## 1. 结论先行

```
prefix[0..7] = keys2[0..7] XOR mask[0..7]        ← 由 global[157]（XOR 循环函数）实现
mask 数组      = [11,22,0,16,0,49,0,1,81,184,0,224,0,12,233,144]  ← XOR 调用时的"被变换数组"初始值
                （VM 字节码逐字节构造/写入，运行时生成，不是 JS 源码字面量）
```

- mask 是 **VM 运行到某一步时构造出的数组初始值**，通过 `global[157]` 与 keys2 逐字节异或得到 prefix。
- mask **不存在于任何静态源码/常量池/闭包数组字面量**——这就是为什么所有"搜索字面量"的尝试全部失败。
- 前 8 字节 `0b 16 00 10 00 31 00 01` 恰好是服务器校验的部分，恒定；后 8 字节（`51 b8 00 e0 00 0c e9 90`）中 `51` 跨会话恒定、部分字节随会话变化（我们只关心前 8 字节）。

---

## 2. 否定路径全记录（每步都排除了一个假设）

> 记录这些失败不是为了凑篇幅，而是告诉后来者"哪些路走不通、为什么"，避免重复劳动。所有结论都以真实运行结果为准。

### 2.1 静态字面量搜索（全部失败）

| 搜索目标 | 方法 | 结果 |
|---|---|---|
| 浏览器 send hook 闭包数组（88 个） | `24_search_mask_in_browser.js`：遍历 `[[Scopes]]` 所有数组，搜 `[11,22,0,16,0,49,0,1]` 及宽松版 `[11,22]` 子序列 | ❌ 0 命中 |
| [165] 加密函数局部数组（112 个） | `26_full_vm_dump.js` 断点 dump 所有帧数组，搜完整 10B / 前 6B / `[11,22]` | ❌ 0 命中 |
| 外层 VM JS（`example/.../303c6e9.js`，24 万字符） | 搜 `\x0b` 转义、十进制数组 `[11,22,0,16]`、`0xb,0x16`、`11,22` | ❌ 无；且整个文件数字数组仅 3 个、都不含 |
| keys16/basestr 的 MD5/SHA1/CRC32 哈希 | 8 种哈希变体逐一比对 | ❌ 不匹配 |
| 管线变换函数（numarrEncrypt 等）对 keys16 的输出 | 逐个调用比对 | ❌ 不匹配（仅第 2 字节 0x0b 巧合） |
| 捕获的 VM 帧所有数组 | 断点 dump 全帧，搜 mask 子序列 | ❌ 112 个数组 0 命中 |

**关键佐证**：连 `keys16`（`15 90 a8 b3 54 fd c3 4b...`，同为站点固定常量）**也不在外层 JS 字面量里**。这说明瑞数 VMP 的机制是——**所有关键常量运行时解密**：
- 外层 VM 有 `r2mKa` 加密常量区（外层 JS 第 62922 字符处出现），由解密函数运行时还原；
- 动态代码常量池（`_$_b` 1222 元素等）由 VM 指令逐字节赋值。

**结论**：mask 不是静态字面量，是运行时生成的。静态 grep 注定找不到。

### 2.2 派生公式穷举（全部失败）

| 假设 | 方法 | 结果 |
|---|---|---|
| mask 尾部 2 字节 = 会话计数的简单公式 | `19_mask_bruteforce.js` 用 4 会话穷举加减乘除/哈希 | ❌ 无简单公式 |
| counterA/B = 某 keys 数组值的哈希 | `20_counter_analysis.js` 穷举 | ❌ 否 |
| 16B 会话值 = 某 16B 哈希 | `10_crack_session16.js` | ❌ 否 |
| O/P cookie 内部含 prefix | `13_crack_prefix.js` / `22_o_cookie_decrypt.js` 解码 O cookie 各分段 | ❌ 无 |
| mask 来自两个 keys 数组切片的 XOR 组合 | `28_mask_keys_relation.js` 全组合测试 | ❌ 无 |

### 2.3 沙箱路径（弃用）

`21_sandbox_verify.js`：沙箱跑真实动态代码 + 真实 cd 生成 cookie，试图与浏览器 keys 对齐。结果：**沙箱会话结构不同（指纹问题）**，无法直接复用浏览器会话数据。弃用。

### 2.4 这些失败给我们的信息

1. mask 必须在**运行时**观测，静态/公式都无法反推。
2. 必须**在浏览器真实会话中、在 prefix 生成的瞬间**抓取它。
3. 最直接的思路：**找到执行"keys2 XOR 某数组"的那个函数，hook 它，看输入**。

---

## 3. 肯定路径：从 VM 反汇编到 hook 定位

### 3.1 第一步：确认 plain24 由哪个函数构造（VM 反汇编）

**方法**：`41_capture_query_encrypt.js` 在 [165]（加密函数）断点，识别 24B 参数（query 加密特征：`arr[24]→arr[32]`），同时从 frame1（VM dispatcher）dump 出 **206 元素字节码**（send hook 主逻辑，跨会话稳定，`query_enc_*.json`）。

**反汇编**（`42_disassemble_full.js`，操作码表来自 `opcode_semantics_v2/v3.json`）发现关键调用段：

```
PC 131-140:  构造参数 → global[103](arg1, arg2, arg3)   ← 3 参调用（opcode 68 CALL_METHOD_3_VOID）
PC 141-143:  global[165](result, 0)                     ← 2 参调用（opcode 15 CALL_METHOD_2）加密
```

**结论**：`global[103]` 是构造 plain24 的入口（trampoline），`global[165]` 是 encryptMode1。

### 3.2 第二步：确认 global[103]/[157]/[165] 的身份

`43_get_global103.js` 用 `Function.prototype.toString.call()` 拿到真实源码（绕过 `[native code]` 伪装）：

```js
// global[103] = trampoline → 子程序@186
function _$g0() { var _$de = [186]; ... return _$fy.apply(this, _$de); }

// global[157] = XOR 循环函数（prefix 的 XOR 实现！）
function _$bi(_$$M, _$lO, _$bj) { for (...) _$$M[_$kc] ^= _$lO[_$kc]; }

// global[165] = encryptMode1
function _$ik(_$$M, _$lO, _$bj, _$kc) { ... _$_o = _$hX(_$lO, _$kc); return _$_o._$b8(_$$M, _$bj); }
```

- `global[157]` 的签名 `(被变换数组, XOR密钥, 长度)` 与 prefix 构造完全吻合——它就是把 keys2 XOR mask 的函数。
- 其他关键索引：`global[61]` = 209 常量池、`global[65]` = 96 字符串表。

### 3.3 第三步：hook global[157]，抓 XOR 输入（决定性证据）

**方法**（`47_hook_xor_103.js`）：定位 global 数组后，包装 `global[157]`，记录每次调用的 `(arr, key, len)` + 调用栈，然后触发一个 POST 让浏览器生成 query。

**结果**（`captures/xorlog_*.json`，2 次调用）：

```
XOR[0]:
  args[0] = [180,184,215,55,126,234,199,113, 110,235,23,113,182,217,94,58]
  args[1] = [6,233,37,141,200,186,227,81, 27,143,214,110,228,225,99,161]   ← 同一 keys2[0:16]
  len     = 16
  （这是另一处 XOR：cookie/其他数据段的变换）

XOR[1]:
  args[0] = [11,22,0,16,0,49,0,1, 81,184,0,224,0,12,233,144]                ← ★ mask 数组！
  args[1] = [6,233,37,141,200,186,227,81, 27,143,214,110,228,225,99,161]   ← keys2[0:16]
  len     = 16
```

**闭环验证**（逐字节）：

```
args[0] XOR args[1] = prefix:
  11^6  22^233 0^37  16^141 0^200 49^186 0^227 1^81
= 13   255    37    149    200   139    227    80
= [13,255,37,149,200,139,227,80]   ← 与浏览器实际 prefix 一致 ✓
```

**调用栈**（定位 mask 数组构造位置）：

```
_$b5 (@1:16019) → _$$I (@1:11842) → _$b5 (@1:16594) → _$$I (@1:11842)
→ _$b5 (@1:14968 / @1:16737)
```

- 这些偏移是**当前会话动态代码**（`eval at _$_C`）内的偏移，跨会话行号不同，但**函数名与结构稳定**（`_$b5` 是 VM 字节码执行函数，`_$$I` 是 dispatcher）。
- 同一时刻的 24B 明文（`plain24_script_*.json`）证实构造链：`_$_k`(as `_$db`)@37578 执行 slice → `_$gg`@38664 → VM dispatcher `_$hE`/`_$gN`。

**结论**：mask 是 XOR 调用**之前就已存在于数组中的初始值**——它由 VM 字节码在执行到 XOR 前逐字节构造/写入。前 8 字节即服务器校验的 PREFIX_MASK。

---

## 4. plain24 每块生成机制汇总

| 块 | 生成方式 | 定位证据 |
|---|---|---|
| prefix[0:8] | `keys2[0:8] XOR mask[0:8]`（global[157]） | XOR hook 实证（§3.3） |
| bytes[8:12] | 随机 | 服务器不校验（`prefix_test_*.json`） |
| bytes[13:15] | 时间编码/随机 | 不校验 |
| bytes[16:18] | `0xb7` + 随机 | 不校验（byte16 恒 0xb7 由明文列对比确认） |
| byte[19] | 会话计数器（随机即可） | 不校验（真实浏览器里 ×2 递增，服务器不查） |
| bytes[20:23] | `CRC32(url.toUpperCase())` 大端 | 4 URL × 4/4（`08_plaintext_analysis.js`） |
| request_data | `encryptMode1(plain24, numarrAddTime(keys17,now,random)[0], 0)` | [165] hook + `06_verify_query_chain.js` 3/3 复现 |

---

## 5. 完整调用链（反汇编实证）

```
send() → VM dispatcher 执行主逻辑（206 元素字节码，跨会话稳定，本会话变量名 _$ht/_$fy/_$jN）
  → PC 131-140: 构造参数 → global[103](arg1,arg2,arg3)   ← plain24 构造
         │        global[103] = trampoline → 子程序 @186（在 VM 字节码池中）
         │        子程序 @186 内：构造 mask 数组 → 调 global[157](mask_arr, keys2, 16) 逐字节 XOR
         ↓
  → PC 141-143: global[165](plain24, 0)                  ← encryptMode1 加密
         │        global[165] = _$ik → _$hX(...)._$b8（AES 类算法，帧内含 S-Box 256 元素 + 常量池 209）
         ↓
  → request_data（32B）
```

关键 global 索引（**跨会话稳定**，可直接用于 hook）：

| 索引 | 身份 | 源码特征 |
|---|---|---|
| 103 | plain24 构造 trampoline | `function _$g0(){var _$de=[186];...return _$fy.apply(this,_$de);}` |
| 157 | XOR 循环 | `function _$bi(_$$M,_$lO,_$bj){for(...)_$$M[_$kc]^=_$lO[_$kc];}` |
| 165 | encryptMode1 | `function _$ik(_$$M,_$lO,_$bj,_$kc){...return _$_o._$b8(_$$M,_$bj);}` |
| 61 | 209 常量池（AES/XXTEA/MD5/SHA1/CRC32 常数） | — |
| 65 | 96 字符串表 | — |

---

## 6. 方法论沉淀（可复用技巧）

### 6.1 定位 global 数组（一切浏览器 hook 的起点）

```
Function.prototype.toString.call(XMLHttpRequest.prototype.send)   // 绕过 [native code] 伪装
→ 正则提取 dispatcher 函数名 → 沿 [[Scopes]] 找到它
→ 再取 dispatcher 源码，正则 /<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/ 提取 global 名
→ 沿 [[Scopes]] 找到 global 数组 objectId
```

### 6.2 识别 query 加密的 [165] 调用

在断点/getProperties 中找 **24 长度的数值数组**参数（`arr[24]→arr[32]`）。cookie 加密是 `arr[215]→arr[224]`，两者不同，按长度区分。

### 6.3 hook global 函数记录参数 = 最直接的运行时观测

包装 `global[157]/[103]/[165]`，记录 `(入参, 返回值, 调用栈)`。XOR 的入参直接暴露 mask 与 keys2。**比断点 dump 更快更准**（断点只能看到"当前状态"，hook 能看到"函数边界"）。

### 6.4 `Debugger.evaluateOnCallFrame` 可用

Patchright CDP 直接 `cdp.send('Debugger.evaluateOnCallFrame', {callFrameId, expression})` 可在断点时于**任意帧**执行 JS（用真实闭包环境）。注意：
- `arguments` 在该上下文**不可用**（指向 evaluate 的包装函数），需用**变量名**引用；
- 返回值层级是 `r.result.value`（不是 `r.result.result.value`）；
- 表达式里避免 `JSON.stringify` 遇 Window 循环引用，用循环安全序列化或只取基本类型。

### 6.5 数组"出生追踪"（定位数组由谁构造）

hook `Array.prototype.slice/push/concat/from`，当结果长度为 24 时记录内容 + 调用栈。注意：
- hook 内不能再调用被 hook 的方法（`content.slice()` 递归），用**原始引用 + 循环拷贝**；
- hook 注入**越晚越好**（reload 完成后注入），避免拖慢 RS 初始化导致超时。

### 6.6 识别 plain24 的特征字节

`content[16] === 183 (0xb7)` 或 `content[20..23]` 等于已知 URL 的 CRC32 值是判断"这是不是 plain24"的可靠指纹。

---

## 7. 复现步骤（重新定位 mask 全流程）

```bash
# 环境（patchright 在兄弟项目）
NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules \
NODE_OPTIONS=--dns-result-order=ipv4first

# 1) 决定性实验：hook global[157] 直接看 XOR 输入（最快拿到 mask）
node wb-dsv4flash/47_hook_xor_103.js
# → captures/xorlog_*.json，XOR[1].args[0] 前 8 字节 = PREFIX_MASK

# 2) 拿同会话 plain24（确认 XOR 结果 == prefix）
node wb-dsv4flash/31_plain24_with_script.js   # 或 41_capture_query_encrypt.js

# 3) 反汇编 206 字节码，确认调用链 global[103]→[157]→[165]
node wb-dsv4flash/42_disassemble_full.js

# 4) 取 global[103]/[157]/[165] 真实源码（Function.prototype.toString）
node wb-dsv4flash/43_get_global103.js
```

替换验证：把 `PREFIX_MASK` 改后运行 `pure_query_gen.js` 确认 200（改错则 400），可确认掩码仍有效。

---

## 8. 产物与证据文件

| 文件 | 内容 |
|---|---|
| `47_hook_xor_103.js` | hook global[157]，决定性实验 |
| `captures/xorlog_1785502230763.json` | XOR 调用原始证据（mask 数组 + keys2 + 调用栈） |
| `42_disassemble_full.js` | 206 字节码反汇编器（含操作码表） |
| `41_capture_query_encrypt.js` | query 加密断点捕获（plain24 + key21 + 206 字节码） |
| `43_get_global103.js` | global[103]/[157]/[165] 真实源码提取 |
| `captures/query_enc_*.json` | query 加密完整状态（字节码/明文/VM 上下文） |
| `captures/vmfull_*.json` / `vmstack_*.json` | 各断点帧 dump |
| `captures/plain24_script_*.json` | plain24 出生追踪（含当前会话动态代码） |
| `opcode_semantics_v2/v3.json` | 94 个操作码语义（从 dispatcher 二叉 if 树提取） |

---

## 9. 遗留

- mask 数组**后半部分**（`51 b8 00 e0 00 0c e9 90`）的生成逻辑未逐字节还原（只确认前 8 字节恒定且被服务器校验）。如需完整还原子程序 @186 的字节码逐条推演，可沿 `_$b5`/`_$$I` 调用栈继续插桩——但**对生成方案无增益**（服务器不校验后半段）。
- 各会话动态代码文件名的哈希段（`GCMFGiVcXYnc.303c6e9.js`）随会话变化，但函数结构（`_$b5`/`_$$I` 等）与 206 字节码跨会话稳定。
