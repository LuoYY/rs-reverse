# pmos.xj.sgcc.com.cn:20080 瑞数 VMP 逆向 — 完成报告

> 目标：纯算法还原 :20080 的瑞数 cookie + query 参数
> 状态：✅ cookie 纯协议方案已打通（含重试机制）；⚠️ query 参数已定位参数名与结构，加密算法待进一步动态逆向

## 一、最终生产方案（纯协议，无浏览器依赖）

```bash
NODE_OPTIONS=--dns-result-order=ipv4first node pmos_xj_client.js
```

```js
const { PmosXjClient } = require('./pmos_xj_client');
const client = new PmosXjClient();
await client.init();                                    // 拉挑战页→沙箱cp3→管线cookie→重试至 200
const r = await client.get('/px-gateway/GatewayConfig/getGatewayConfig');  // 200 业务 JSON
```

**验证结果**：cookie 经重试（约 8 次内）可达 HTTP 200；一旦通过即可稳定用于后续 API（5/5 200，返回真实业务 JSON）。

## 二、纯算法管线（4 步）

```
1. 拉 412 挑战页 → 解析 $_ts.nsd/cd + 服务器下发的 O cookie
2. 沙箱执行外层 VM（Node vm + 最小 window/document 环境 + hook eval）
   → 提取与浏览器逐字节一致的动态代码 → cp[3]（动态代码校验和）
3. cp3Override 注入管线 Coder → cd解密(tscd)→keys→basearr(len243)→Cookie 加密
4. O + P 重放（[0] 指纹校验概率性，需重试）
```

### 关键突破 1：cp[3] 正确性（解决 cookie 412 的主因）

- **根因**：之前用"kimi 案例记录的 nsd=43902"假设值跑管线，与真实挑战页 nsd 不符 → keynames shuffle（LCG 由 nsd 驱动）错乱 → 动态代码/cp3/codeUid 全错 → cookie 412。
- **解法**：`extract_dyncode_20080.js` 在 Node vm 沙箱中执行外层 VM（纯计算：LCG+shuffle+globalText 字符串处理，不依赖浏览器指纹），用**挑战页真实 nsd**，hook eval 捕获动态代码，计算 cp[3]。
- **验证**：沙箱 nsd=12578 提取的动态代码与 kimi 捕获的浏览器真实动态代码**逐字节一致**（cp3=215364 完全吻合）；且与管线 coder 用同 nsd 生成的动态代码也完全一致 → 证明管线 Coder 逻辑正确，cp3 只取决于"用对 nsd"。

### 关键突破 2：定位 200/412 概率性（[0] 指纹块 + 系统性排除诊断）

- 反解 Patchright 真实浏览器 P cookie → 真实 basearr（247 字节），与管线 basearr 逐字节对比：
  - **完全一致**：codeUid、flag（[7,9]=1801）、keys[2]/keys19、fixedValue20、[9] battery、uuid(ua/platform/pathname)
  - **确定性差异（已修）**：len243 `[6]` 段前两组 `numToNumarr2(0)` → `(2)`；`[3]` 段 `numToNumarr4(4)` → `(0)`；**`[0]` 段默认值修正为真实 247 字节 basearr 逐字节提取的 101 字节指纹块**（修复之前字节偏移错位）
  - **随机字段**：[3] execNumberByTime、[10] time/random8（正常，无需匹配）
- **[0] 段与 TLS 指纹的关系（本次新验证）**：
  - 用 got-scraping（Chrome131 TLS/JA3 伪装）替换 HTTP 层，全程 Chrome131 指纹，通过率 **33.3%**，与 Node 原生 TLS（~20-40%）**无显著提升** → **200/412 与 TLS 指纹无关**，排除"指纹匹配"假设。
  - 同 cookie 重放 **10/10 全 200** → 服务端**确定性校验**（非随机/速率限制），200/412 完全由 cookie 明文内容决定。
  - 同 nsd 下既有 200 也有 412 → 排除 nsd/codeUid 白名单。
  - 通过样本间 codeUid/keys16/random8/r2mkaTime 各异 → 服务端不校验这些字段具体值。
  - execNumberByTime 固定 1/0/随机 通过率一致 ~30% → 该字段不决定通过。
- **结论**：管线 cookie 明文已高度接近真实（[0] 段逐字节一致、静态段对齐），加密层（numarrEncrypt+xor+encryptMode1）往返 30/30 完全确定性。200/412 波动是服务端对明文某派生特征的确定性校验，**重试（期望 ~3-7 次）可稳定拿到 200**；一旦 200，该 cookie 可 100% 稳定用于后续 API。

### 追求 100% 通过率（2026-07-28，根因彻底定位 + jsdom 突破）

**最终根因（已确证）**：真实瑞数 cookie 的加密密钥（外层 keys16 / 内层 keys17）由**内层动态代码运行生成**，**不在 cd 静态解密区**。
- 证据：枚举 cd 解密区（ans）所有 16 字节滑动窗口作外层/内层密钥，反解真实 P（浏览器 cookie）**全部失败** → 真实密钥不在 cd 静态区。
- 管线 `pmos_xj_client.js` 用 cd 静态 ans keys 近似 → 对 **70% 的 cd 密钥错误** → 30% 通过率（**密钥问题，非指纹**）。

**jsdom 突破（100% 密钥对）**：用 jsdom 完整浏览器环境跑外层 VM + 内层动态代码（`window.eval` + 等待），让瑞数自己生成真实 cookie（含动态生成的正确密钥）→ **密钥 100% 正确**（连续 5 次全 200）。
- **但 jsdom cookie 给【警告页】（访问行为异常，len~678）**：jsdom 环境采集的 [0] 段指纹与真实浏览器有根本性差异（jsdom cookie 仅 279 字符 vs 真实 428，指纹数据全面缺失），服务器**确定性拒绝 jsdom 指纹**（**指纹问题，非密钥**）。

**两因素正交（最终结论表）**：

| 方案 | 密钥 | [0] 指纹 | 结果 |
|------|------|---------|------|
| 管线（pmos_xj_client） | cd 静态（30% 对） | 真实浏览器样本（过） | 30% 200 + **业务页** ✓可用 |
| jsdom | 动态代码（100% 对） | jsdom 环境（拒） | 100% 200 但**警告页** ✗不可用 |
| 真实浏览器 | 动态代码（100% 对） | 真实（过） | 100% ✓ |

**通往纯协议 100% 的唯一路径**：混合 = jsdom 跑内层 VM 拿正确密钥 + 管线用真实 [0] 段指纹重加密。难点：jsdom 内层 VM 的 keys 在 VM 闭包不暴露，需 hook 动态代码加密点，或注入真实指纹到 jsdom 环境（反检测军备竞赛）。

**实用方案**：
- **方案B（推荐，已验证，纯协议）**：`pmos_xj_client.js` 重试机制（30%→期望 3-7 次），一旦 200 即稳定（同 cookie 重放 10/10 确定），200 后业务页 + API 全 200。
- **方案A2（100%，半协议，需浏览器）**：Patchright 跑内层 VM 生成 cookie → 纯 Node (got-scraping) 重放，**100% 且业务页**（cookie 有效期内无需浏览器）。
- **jsdom 纯协议 100%（后续方向）**：`test_jsdom_full.js` / `pmos_xj_client_jsdom.js` 已打通密钥，剩指纹注入。

### 移植的 kimi 已验证修复

`Cookie.js`（cookiePrefix/basestr 分支）、`config/index.js`（keynameNum/from 回退）、`makeCookie.js`（cp3Override 优先级 + cookie 名 lastWord）、`makeCodeHigh.js`、`globalVarible.js`、`fixedValue20.js`、`Coder.js`（调试导出）。

### gv 缓存污染修复

管线多次调用时 `gv.r2mka`/`keys` 等全局状态残留导致 `isReset` 报错。生产客户端在 `_genCookie` 中清 require 缓存，保证每次会话独立。

## 三、query 参数（已定位，加密待进一步逆向）

| 项 | 结论 |
|----|------|
| 参数名 | `r20SZOQm` = `keys[7].split(';')[1]`（会话相关，nx 为 MurR7rxG） |
| 触发 | RS XHR hook 自动追加到 POST/XHR 请求 |
| 值结构 | `'0'` + basestr64 编码（88 字节 = 22×u32 = 11×8 字节块） |
| 变化/固定 | 同会话：int[2-12]（44 字节）固定，int[0-1] 与 int[13-21] 每请求变化 |
| GET | 无需 query（已验证 200 业务 JSON） |
| 加密 | 与 cookie 的 encryptMode1 不同（88 非 16 倍数但为 8 倍数，疑似 TEA/XXTEA 或自定义），XXTEA+keys[16/2/17] 大小端试解未成明文 |

**query 纯算法还原尚需**：动态 hook 真实浏览器 XHR.open 处的 query 生成函数（camoufox-reverse / CDP），或更大样本差分分析。当前 GET 业务接口无 query 已可用。

## 四、工具清单

| 文件 | 用途 |
|------|------|
| `pmos_xj_client.js` | **生产客户端**（拉挑战页→沙箱cp3→管线cookie→重试→API） |
| `extract_dyncode_20080.js` | 沙箱执行外层 VM 提取动态代码/cp[3]（核心） |
| `verify_e2e_20080.js` | 端到端验证（多次尝试 + codeUid 诊断） |
| `compare_browser_cookie.js` | Patchright 抓真实 cookie + 管线同种子对比 |
| `capture_xj_20080.js` / `capture_sdenv_20080.js` | 浏览器/sdenv 抓取真实产物 |
| `output/capture-20080/real-basearr.json` | 真实浏览器 basearr（244 字节，反解） |
| `output/capture-20080/query-samples.json` | query 参数样本 + 同会话 ts/cookie |

## 五、运行依赖

- Node 18+（sdenv 相关脚本需 Node 22）
- `NODE_OPTIONS=--dns-result-order=ipv4first`（目标站 IPv6 不稳定）
- Patchright（仅分析/验证用，经 `NODE_PATH=...rs-reverse_kimi/node_modules` 引入；生产客户端不依赖）

## 六、后续工作

1. **query 加密算法**：动态 hook 定位 query 生成函数（疑 TEA/自定义），完成纯算法还原
2. **[0] 指纹通过率**：评估 got-scraping/curl_cffi 模拟 Chrome131 TLS 使 [0]（Chrome131 指纹）与 TLS 匹配，提升 200 率至接近 100%
3. **cookie 有效期管理**：检测 cookie 过期自动重新 init
