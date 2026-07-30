# pmos.xj.sgcc.com.cn:20080 瑞数 VMP 纯协议逆向 — 实现路径与使用指南

## 1. 概述

本文档总结对 `https://pmos.xj.sgcc.com.cn:20080/`（国网新疆电力平台）瑞数 VMP 反爬虫的纯协议逆向工作，包括实现路径、核心原理、使用方式及关键文件索引。

**最终成果**：纯 Node.js（无浏览器依赖）生成瑞数 cookie，HTTP 200 通过率 **100%**（30/30 验证）。

---

## 2. 站点信息

| 项目 | 值 |
|------|-----|
| 目标 URL | `https://pmos.xj.sgcc.com.cn:20080/` |
| 反爬类型 | 瑞数 VMP（第 5 代动态代码 + JSVMP） |
| 挑战页 | HTTP 412 响应，内联 `$_ts.nsd` / `$_ts.cd` |
| 外层 JS | `/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js`（271KB） |
| Cookie 名称 | `aoU85Lxl9xxNO`（O cookie）+ `aoU85Lxl9xxNP`（P cookie） |
| Cookie 长度 | 428 字符 |
| 通过判定 | 带 `O; P` 配对重放首页，返回 HTTP 200 即通过 |

---

## 3. 实现路径

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    pmos_xj_client.js                         │
│                    （生产客户端入口）                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. _fetchChallenge()                                        │
│     └─ HTTPS GET 首页 → 解析 $_ts.nsd/cd + Set-Cookie(O)     │
│                                                              │
│  2. _extractCp3(nsd, cd)                                     │
│     └─ extract_dyncode_20080.js → runOuterVM()              │
│        └─ Node vm 沙箱执行外层 VM → 提取 cp[3]（动态代码校验和）│
│                                                              │
│  3. _genCookie(ts, cp3)                                      │
│     └─ 管线 Coder → Cookie.run()                             │
│        ├─ cd 解密 → keys（keys16/17/2/19/21/22/24/33/34...） │
│        ├─ getBasearr() → 244 字节明文指纹数组                  │
│        ├─ numarrEncrypt() → Huffman 编码                     │
│        ├─ xor(keys[2]) → 异或混淆                            │
│        ├─ encryptMode1(keys17) → 内层 AES-CBC 加密           │
│        ├─ numarrJoin() → 拼装 nextarr                        │
│        ├─ encryptMode1(keys16, flag=1) → 外层 AES-CBC 加密   │
│        └─ numarr2string() → Base64-like 字符串编码 → cookie  │
│                                                              │
│  4. 重放：O + P cookie → HTTPS GET 首页 → 200/412            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Cookie 生成链路详解

#### 步骤 1：拉取挑战页

向目标 URL 发送 HTTPS GET 请求，服务端返回 HTTP 412 挑战页，其中包含：
- `$_ts.nsd=<数字>` — 随机种子（每次请求变化）
- `$_ts.cd="<长字符串>"` — 加密数据（每次请求变化）
- `Set-Cookie: aoU85Lxl9xxNO=<值>` — O cookie

#### 步骤 2：沙箱执行外层 VM 提取 cp[3]

**文件**：`extract_dyncode_20080.js` → `runOuterVM(ts, outerJsCode)`

外层 VM 是一段 271KB 的混淆 JavaScript，其核心是纯计算逻辑（LCG 伪随机 + 数组 shuffle + globalText 字符串处理），不依赖浏览器指纹。

在 Node `vm` 模块中构建最小 `window`/`document`/`$_ts` 环境：
- `document.cookie` getter/setter（捕获瑞数生成的 cookie）
- `window.eval` hook（捕获动态代码执行）
- 最小 `navigator`/`screen` 对象

执行后提取 `cp[3]`（动态代码校验和），该值必须使用挑战页的真实 `nsd` 计算（每次请求变化）。

#### 步骤 3：管线生成 cookie

**核心文件**：`src/handler/Cookie.js`

##### 3a. cd 解密 → keys

通过 `src/handler/parser/tscd.js` 解密 `$_ts.cd`，生成 keys 数组：
- `keys[2]`（48 字节）— XOR 混淆密钥
- `keys[16]`（16 字节）— 外层 AES 加密密钥（站点常量，跨 cd 不变）
- `keys[17]`（16 字节）— 内层 AES 加密密钥（前 8 字节随 cd 变化）
- `keys[19]`/`keys[21]`/`keys[22]`/`keys[24]`/`keys[33]`/`keys[34]` — 各种配置值

##### 3b. 生成 basearr（244 字节明文指纹数组）

**文件**：`src/handler/basearr/len243.js`

basearr 是包含浏览器环境信息的字节数组，由 `numarrJoin` 拼装多个段：

| 段 | 标记 | 内容 | 长度 |
|----|------|------|------|
| 外层 | 3 | 外层标记 + 内段长度前缀 | 2 |
| seg1 | 1 | maxTouchPoints/evalLen/UA-uuid/platform/execNumberByTime/execRandomByNumber/window 尺寸等 | 73 |
| seg10 | 10 | 时间戳(r2mkaTime+runTime-startTime)/keys[19]/随机数/flag | 19 |
| seg7 | 7 | 常量/flag/codeUid | 12 |
| seg0 | 0 | 浏览器指纹加密块（硬编码，跨会话固定） | 101 |
| seg6 | 6 | keys[22] 加密数据 | 16 |
| seg2 | 2 | fixedValue20（从 keys 派生） | 4 |
| seg9 | 9 | 固定值 [8, 0] | 2 |
| seg13 | 13 | 固定值 [0] | 1 |
| **合计** | | | **244** |

浏览器环境配置在 `src/config/makecookieRuntimeConfig.js` 中（UA/platform/window 尺寸等）。

##### 3c. 加密链路

```
basearr(244B)
  → numarrEncrypt (Huffman 编码) → numenc(217B)
  → xor(keys[2], 16) → xorResult(217B)
  → encryptMode1(keys17, flag=0) → basearrEncrypt(224B)     [内层加密]

nextarr(285B) = numarrJoin(
  numarrJoin(2, [r2mkaTime4, startTime4], keys[2]),
  undefined,    // hasDebug 运行时为 false
  basearrEncrypt
)

enc16(320B) = encryptMode1(
  [uuid4, ...nextarr],
  keys16, flag=1  [外层加密，含 16 字节随机 IV]
)

cookie = '0' + numarr2string(enc16)  [Base64-like 编码 → 428 字符]
```

##### 3d. 关键发现：getCfg strips time/ele

`numarrAddTime(keys, time, random)` 在密钥末尾追加 time（4 字节）和 ele（1 字节），但 `getCfg()` 内部通过 `numarrAddTime.reverse()` 将它们 strip 掉，实际加密密钥恒为原始 `keys16`/`keys17`。这意味着 `time` 和 `ele` 参数不影响加密结果。

#### 步骤 4：重放验证

将 `O cookie; P cookie=生成值` 作为 Cookie 头发送 HTTPS GET 请求：
- HTTP 200 → cookie 有效，可用于后续所有 API
- HTTP 412 → cookie 无效

### 3.3 根因定位与修复

#### 问题现象

管线生成的 cookie 通过率仅 ~25%（波动 10-50%），而真实浏览器生成的 cookie 100% 通过。同一 cookie 重放结果确定（200 恒 200，412 恒 412），非随机/速率限制。

#### 排查过程

1. **排除密钥问题**：keys16/keys17 经 19 组 cd 浏览器权威对照（Patchright 数组陷阱），逐字节 == 管线
2. **排除 basearr 问题**：200 组 vs 412 组 basearr 仅时间/随机字段不同，字段替换不影响结果
3. **排除加密结构问题**：各层长度恒定（244/217/224/285/320/427），200/412 相同
4. **排除 cookie 绑定**：cookie 只认内容，不绑 page/TLS/IP，非一次性，O+P 配对即可
5. **发现 getCfg strips time/ele**：加密密钥恒为 keys16，time/ele 从不影响加密
6. **真实 P 可用 keys16 直接解密**：之前"解不开"是 `0 || Math.random()` 的 falsy 陷阱
7. **basearrEncrypt 完全一致**：管线 vs 浏览器内层加密逐字节相同
8. **同 nextarr 重加密仍 412**：用浏览器完整 nextarr + 管线 encryptMode1 重加密，通过率仍 ~20%，证明问题在编码层
9. **定位编码差异**：浏览器 cookie 解码后重新编码，位置 425 字符不同

#### 根因

**文件**：`src/handler/parser/common/numarr2string.js` 第 25 行

```javascript
// BUG（修复前）:
keys[(numarr[idx + 1] & 3) << 4 | numarr[idx + 1] >> 4]
//           ^^^^^^^^^^^^^^                ^^^^^^^^^^^^^^
//           两处都用 b1（第二个字节），应为 b0（第一个字节）

// 修复后:
keys[(numarr[idx] & 3) << 4 | numarr[idx + 1] >> 4]
//           ^^^^^^^^    低 2 位取自 b0，高 4 位取自 b1（标准 base64）
```

**原理**：当加密输出长度非 3 的倍数时（320 字节 → 106 组余 2 字节），最后 2 个剩余字节 `[b0, b1]` 编码为 3 个字符。第二个字符应为 `(b0 & 3) << 4 | b1 >> 4`（b0 低 2 位 + b1 高 4 位），但代码错误地用了 `(b1 & 3) << 4 | b1 >> 4`（b1 低 2 位 + b1 高 4 位）。

当 `b0 & 3 == b1 & 3`（概率约 25%），bug 不可见，cookie 正确 → 200；当不等（约 75%），最后一个编码字符错误，服务端解码失败 → 412。这完美解释了之前的 ~25% 通过率。

#### 修复

将 `numarr[idx + 1]` 改为 `numarr[idx]`，修复后 30/30 = 100%。

---

## 4. 使用方式

### 4.1 环境要求

- **Node.js** >= 18（推荐 22.x）
- **网络**：需设置 `NODE_OPTIONS=--dns-result-order=ipv4first`（强制 IPv4 DNS 解析）
- **依赖**：`npm install`（依赖 lodash/module-alias/got-scraping 等）

### 4.2 命令行直接运行

```bash
NODE_OPTIONS=--dns-result-order=ipv4first node pmos_xj_client.js
```

输出示例：
```
[PmosXj] 初始化，获取有效 cookie（最多重试 3 次）...
[PmosXj] ✓ 第 1 次尝试成功，cookie 有效（aoU85Lxl9xxNP, 428 chars）

[demo] 访问 / ...
  / -> 200 len= 8994

[demo] 访问 API /px-gateway/GatewayConfig/getGatewayConfig ...
  API -> 200 body 前 150: {"status":0,"message":"Success","data":{...}}
```

### 4.3 编程调用

```javascript
const { PmosXjClient } = require('./pmos_xj_client');

async function main() {
  const client = new PmosXjClient();

  // 自动获取有效 cookie（100% 成功，通常第 1 次即通过）
  await client.init();

  // GET 请求
  const page = await client.get('/');
  console.log(page.status, page.body.length);

  // API 请求
  const api = await client.get('/px-gateway/GatewayConfig/getGatewayConfig');
  console.log(api.status, JSON.parse(api.body));

  // POST 请求
  const result = await client.post('/px-gateway/someApi', { key: 'value' });
  console.log(result.status, result.body);
}

main();
```

### 4.4 构造函数选项

```javascript
const client = new PmosXjClient({
  baseUrl: 'https://pmos.xj.sgcc.com.cn:20080/',  // 目标 URL（默认值）
  ua: 'Mozilla/5.0 ...',                           // User-Agent
  maxRetries: 3,                                    // 最大重试次数（默认 3）
});
```

### 4.5 关键注意事项

1. **脚本须从项目根目录运行**：外层 JS 使用相对路径 `example/pmos.xj.sgcc.com.cn/...`
2. **O + P cookie 必须配对**：仅带 P cookie 必返回 412
3. **cookie 有效期**：cookie 非一次性，可多次重放（90 秒内 9 次全 200），但建议定期刷新
4. **TLS 证书**：目标站点使用自签名证书，代码已设置 `rejectUnauthorized: false`

---

## 5. 关键文件索引

### 5.1 生产文件

| 文件 | 说明 |
|------|------|
| `pmos_xj_client.js` | 生产客户端（PmosXjClient 类，init/get/post） |
| `extract_dyncode_20080.js` | 外层 VM 沙箱执行，提取 cp[3]（runOuterVM） |
| `src/handler/Cookie.js` | Cookie 生成主逻辑（basearr → 加密 → 编码） |
| `src/handler/Coder.js` | 代码生成器（解析外层 VM 代码结构，生成 codemap） |
| `src/handler/basearr/len243.js` | pmos.xj 站点 basearr 适配器（244 字节） |
| `src/handler/basearr/index.js` | basearr 适配器选择器（按 hostname 匹配） |
| `src/handler/parser/common/numarr2string.js` | **Bug 修复文件** — cookie 字符串编码 |
| `src/handler/parser/common/modeEncrypt.js` | AES-CBC 加密/解密（encryptMode1/encryptMode2） |
| `src/handler/parser/common/numarrAddTime.js` | 密钥时间戳混合（getCfg 会 strip 掉） |
| `src/handler/parser/common/numarrEncrypt.js` | Huffman 编码（basearr → 压缩字节数组） |
| `src/handler/parser/common/numarrJoin.js` | 数组拼接（带长度前缀编码） |
| `src/config/makecookieRuntimeConfig.js` | 浏览器环境配置（UA/平台/窗口尺寸等） |
| `src/config/index.js` | 站点配置初始化（hostname → adapter 匹配） |
| `example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js` | 外层 VM 源码（271KB） |

### 5.2 加密参数

| 参数 | 值 | 说明 |
|------|-----|------|
| keys16 | `[21,144,168,179,84,253,195,75,183,231,80,149,100,10,25,180]` | 外层 AES 密钥（站点常量） |
| keys17 | 前 8 字节随 cd 变，后 8 字节 shape 恒定 | 内层 AES 密钥 |
| flag | 1801 | 站点标识（写入 seg7） |
| lastWord | 'P' | P cookie 名后缀 |
| basestr | `qrcklmDoExthWJiHA...` (86 字符) | cd 解码字符集（cookie 编码用前 64 字符） |
| cookiePrefix | '0' | cookie 字符串前缀 |

### 5.3 调试/验证脚本（output/keygen/）

| 脚本 | 说明 |
|------|------|
| `exp_fixed_verify.js` | 修复后 30 样本通过率验证（100%） |
| `exp_precise_diag.js` | 管线内部逐层 hook 诊断 |
| `exp_enc_compare.js` | 管线 vs 浏览器 basearrEncrypt 逐字节对比 |
| `exp_encoding_check.js` | cookie 编码差异定位（发现 numarr2string bug） |
| `exp_key_strip.js` | 验证 getCfg strips time/ele + 真实 P 解密 |
| `exp_definitive_diff.js` | 真实 basearr vs 管线 basearr 逐段对比 |
| `browser_authoritative.js` | Patchright 数组陷阱提取 keys16/17（权威） |
| `trace_pipeline.js` | 生成侧各层长度追踪 |

---

## 6. 技术要点总结

### 6.1 为什么纯协议可行

1. **外层 VM 是纯计算**：不依赖浏览器指纹（canvas/webgl/字体），可在 Node vm 沙箱中执行
2. **keys 从 cd 解密**：cd 是服务端下发的加密数据，解密后得到所有密钥，不需要运行内层 VM
3. **basearr 指纹可硬编码**：seg0（浏览器指纹块）跨会话固定，可从真实浏览器提取后硬编码
4. **加密算法标准**：AES-CBC + Huffman + XOR，均为确定性算法

### 6.2 关键避坑

1. **cp[3] 必须用真实 nsd**：每次请求 nsd 变化，cp[3] 依赖 nsd 计算
2. **getCfg strips time/ele**：`numarrAddTime` 的 time/ele 参数不影响加密，解密时无需匹配
3. **`0 || Math.random()` falsy 陷阱**：当 `random=0` 时，`0 || Math.random()` 返回 `Math.random()` 而非 0
4. **numarr2string 余数编码**：base64-like 编码的余数部分必须正确处理 `b0` 和 `b1` 的位分配
5. **O+P 配对**：重放时必须同时携带 O 和 P cookie，仅 P 必返回 412
6. **require.cache 清除**：每次生成 cookie 前需清除 require 缓存，避免 gv 全局变量污染

---

## 7. 扩展：适配其他瑞数站点

如需适配其他瑞数 VMP 站点，主要修改：

1. **basearr 适配器**：在 `src/handler/basearr/` 新增 `lenXXX.js`，实现该站点的 basearr 结构
2. **站点配置**：在适配器中设置 `hasDebug`/`lastWord`/`flag`/`cookiePrefix` 等参数
3. **makecookieRuntimeConfig**：调整 UA/平台/窗口尺寸等浏览器环境参数
4. **外层 JS**：保存目标站点的外层 VM JavaScript 文件到 `example/` 目录
5. **basestr**：如果站点使用不同的 cd 解码字符集，需在适配器中配置 `basestr`

---

*文档更新：2026-07-30*
