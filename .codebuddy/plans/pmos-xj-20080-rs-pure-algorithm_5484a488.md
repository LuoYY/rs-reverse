---
name: pmos-xj-20080-rs-pure-algorithm
overview: 适配 pmos.xj.sgcc.com.cn:20080，修复 rs-reverse 管线 Coder 缺失的浏览器 VM 多轮代码生成循环（21 轮 vs 当前单轮），使动态代码/cp[3]/codeUid 与浏览器一致，实现 cookie 纯算法生成通过 412 校验；并一并纯算法还原瑞数 XHR query 参数后缀。技术路线：先用浏览器/插桩抓 :20080 真实 cp[3]/codeUid/basearr/query 样本注入管线快速验证全链路其他环节，再回头攻 Coder 多轮循环这一根本卡点。
---

## 需求理解

**目标**：适配 `https://pmos.xj.sgcc.com.cn:20080/`，实现**纯算法**（无浏览器依赖的 Node.js 协议脚本）生成瑞数（RS VMP）的：
1. **cookie**（`aoU85Lxl9xxNP`，过 412 挑战使第二次请求返回 HTTP 200）
2. **query 参数**（瑞数 XHR hook 自动追加的签名后缀，nx 站为 `MurR7rxG=...`）

**验收标准**：纯算法管线端到端跑通 —— 拉取 412 挑战页解析 `$_ts(nsd/cd)` → 生成 cookie + query → 带 cookie 重放返回 HTTP 200 → query 参数纯算法生成且服务端接受。

**技术路线**（用户已选定）：**先抓真实值快速验证**，再攻 Coder 多轮循环。即先用浏览器/插桩抓 :20080 浏览器真实的动态代码 / cp[3] / codeUid / basearr / query 样本，注入管线隔离验证「cd解密→keys→basearr→cookie加密」与「query 生成」两段逻辑是否正确；再回头修复 Coder 使其自己生成与浏览器一致的动态代码。

**参考**：
- 微信文章《瑞数vmp算法还原流程分析》：瑞数 VMP 纯算法还原全套流程（外层 js 生成 dynamic code 的 9 步 + cookie 21 步）。核心思想 = 精确复现动态代码生成，正是修复 Coder 所需。
- nx 历史案例 `/Users/luoyy/work/github/GitHub/rs-reverse_kimi/.work/pmos-nx-reverse`：同版本 RS 的 cookie/query 结构、纯算法卡点（basestr）。
- **xj 最直接案例** `/Users/luoyy/work/github/GitHub/rs-reverse_kimi/.work/pmos-reverse/ByQwen38max-pmos逆向适配探索记录.md`：443 已适配（cp3Override=213200），:20080 卡在 Coder 缺 21 轮代码生成循环，cp[3] 随 nsd 变化无法硬编码。

**红线**：最终交付纯协议 Node.js 脚本；浏览器仅用于分析/验证/抓真实值，不得作为运行时依赖；不得硬编码浏览器抓的 cookie 进最终代码。


## 技术方案

### 现状与核心矛盾

| 部署 | VM 版本 | 管线状态 |
|------|---------|---------|
| 443 | 外层 js 271227 字节（工作区 example 内） | ✅ 已通（cp3Override=213200 硬编码绕过，443 的 cp[3] 恰好固定） |
| **:20080（本次目标）** | 外层 js **241655 字节**（md5 `24209684...`，已拉到 `/tmp/xj_20080_live.js`） | ❌ cookie 412 |

**:20080 未通根因**（kimi 案例已确证）：管线 `Coder.parseGlobalText1()` 只做 **1 轮** 代码生成（`for(i<G_code_num=6) gren(i)`），而浏览器 VM 的 `_$_C(0,909,lcg)` 通过 opcode64/93/92/44 做 **21 轮**循环（keynames 重生成 + 代码段）。导致动态代码变量名分配顺序不同 → cp[3]（动态代码校验和，随 nsd 变化）+ codeUid 全错 → cookie 必被拒。这是 Coder 架构级缺陷。

**query 参数**：当前 repo 只有 cookie 生成，无 query 生成逻辑，需新建。query 与 cookie 同链路（同为瑞数动态代码生成的加密串，复用 Coder/keys/cp 体系）。

### 两阶段策略（对应用户选定路线）

**Phase A — 抓真实值 + 隔离验证（快速打通验证环）**
用 Playwright/CDP + `page.route` 本地 fulfill（规避网络）+ `addInitScript` hook eval/$_ts/XHR，在 :20080 抓浏览器真实产物：
- 动态代码全文 + 校验和（=cp[3] 真值）
- 完整 `$_ts`（cp[0]/cp[2]/codemap）、codeUid 真值
- basearr 真值（反解浏览器 P cookie）
- query 参数样本（XHR hook 拦截处抓 `?MurR7rxG-like` 参数名+值，定位其生成函数在动态代码中的位置）

将真值注入管线，隔离 Coder 变量，验证下游链路：
- A1: `tscd` cd解密（用真 cp[3]）→ keys → basearr 适配器 → Cookie 加密 → 生成 cookie 与浏览器真实 cookie 逐段比对/反解 uuid 校验
- A2: query 生成逻辑还原（复用 keys/cp/numarr2string/encryptMode），离线 `verify_signer_offline` 用真实 query 样本验证

**Phase B — 修复 Coder 多轮循环（纯算法终极攻关）**
在 `src/handler/Coder.js` 复现浏览器 VM 的 `_$_C(0,909,lcg)` 21 轮循环：
- B1: 实现 opcode 40 等价（每轮重新生成 keynames）
- B2: 对齐 globalText1 读取时序（管线在循环外读 G_code_num，浏览器在循环内读；按 `_$dJ[1]` 114 元素字节码重排 optext 读取顺序）
- B3: 模拟条件跳转 opcode 64(`_$ge=_$dO<_$dw`, `_$dw=909`) / 93(`_$_w+=-64` 无条件跳回) / 92/44
- B4: 验证标准 = 同 nsd 下管线生成的动态代码与浏览器**逐字节一致** → cp[3] 一致 → codeUid 一致 → cookie 回放 200

### 关键算法事实（复用，无需重逆）
- cookie 加密链：basearr → numarrEncrypt(霍夫曼) → xor(keys[2]) → encryptMode1(AES-CBC,keys[17]) → numarrJoin → 前置uuid4 → encryptMode1(keys[16]) → numarr2string(自定义base64,basestr) → 前置 '0'
- LCG(`_$eT`/`getScd`): `15679*(x&65535)+2531011`（管线与浏览器一致）
- basestr（86字符 xj 专用，来自 cp2）：`qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^`
- query 值前缀 'a' + base64url；参数名站点固定（nx=MurR7rxG）；GET 无需 query，POST/XHR 由 RS hook 自动追加

