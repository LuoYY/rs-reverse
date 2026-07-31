# MEMORY.md — rs-reverse_glm 长期事实

## 项目
rs-reverse（瑞数 VMP 逆向工具）的 fork 工作区，目标适配 pmos.xj.sgcc.com.cn（443 与 :20080 两部署）。

## 用户要求
- **不接受 CDP 代理方案**（pmos_xj_post_client.js），不要在任何回复中提及或推荐
- 目标：纯算法生成 query 参数，不依赖浏览器

## 核心方法论（瑞数 VMP 纯算法）
- cookie 生成链路：拉 412 挑战页解析 $_ts.nsd/cd → 沙箱执行外层 VM 提取动态代码/cp[3] → cp3Override 注入管线 Coder → cd解密→keys→basearr→Cookie 加密 → O+P 重放
- **cp[3] 必须用挑战页真实 nsd**（每次请求变）；沙箱执行外层 VM（纯计算，不依赖浏览器指纹）可提取与浏览器逐字节一致的动态代码
- 管线 Coder 逻辑正确，关键在于"用对 nsd + 沙箱提取真 cp3"
- basearr 适配器在 src/handler/basearr/len*.js，按站点调整
- **getCfg strips time/ele**：numarrAddTime 添加的 time/ele 在 getCfg 内被 reverse strip，加密密钥恒为原始 keys16/keys17

## 100% 通过率（2026-07-29 达成）
- **根因**：`src/handler/parser/common/numarr2string.js` 第 25 行余数编码 bug（用 `numarr[idx+1]` 代替 `numarr[idx]` 取低 2 位）
- **修复**：`numarr[idx + 1]` -> `numarr[idx]`，30/30 = 100%
- 之前 ~25% 通过率 = `b0 & 3 == b1 & 3` 的概率（bug 不可见时通过）
- 所有之前排除的候选（keys/seg0/basearr/加密结构）结论正确，根因确实在编码层
- pmos_xj_client.js maxRetries 已降至 3

## 工具依赖
- Node 18+（sdenv/jsdom 相关需 Node 22，nvm v22.22.0）
- 网络：NODE_OPTIONS=--dns-result-order=ipv4first
- Patchright（反检测 Playwright）：仅分析/验证用，经 NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules 引入
- 兄弟项目 rs-reverse_kimi 有 patchright + 大量 pmos 逆向历史案例（.work/pmos-reverse、pmos-nx-reverse）

## 站点事实
- 443 与 :20080 外层 VM 字节码相同（_$dJ[1] 一致），可复用 443 js
- 412 挑战页内联 $_ts.nsd/cd（每次变）+ 外层 js /kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js
- cookie 名 aoU85Lxl9xxN + O/P（lastWord='P'），flag=1801
- query 参数名 r20SZOQm = keys[7].split(';')[1]（会话相关）

## Query 参数逆向（2026-07-31 完全破解）
- **query 结构**：119 字符 = '0' + numarr2string(88 bytes, basestr)
- **88 字节** = [CRC32(4B 大端)] [1] [0] [48] [session_data 48B] [32] [request_data 32B]
- **前 4 字节是 CRC32 校验和**（非随机 nonce），CRC32(bytes[4..87])，16/16 验证通过
- **session_data = keys[2] 原始 48B**（非加密！），跨 URL/请求固定
- **request_data = encryptMode1(plain24, numarrAddTime(keys17,now,random)[0], flag=0)**
- **plain24 = [keys2[0:8]^PREFIX_MASK 8B][rand×5][rand×3][0xb7,rand×2][rand][CRC32(url.toUpperCase())]**
- **PREFIX_MASK = [0x0b,0x16,0x00,0x10,0x00,0x31,0x00,0x01]**（跨 5 会话恒定，服务器只校验 prefix[0..7]）
- 服务器校验范围：prefix[0..7] + url_crc(20-23) + 88B CRC32；其余字段随机即可
- **纯 Node 端到端 18/18 全 200**（3 会话 × 6 请求）
- 可复用模块：`wb-dsv4flash/query_gen_module.js`（PmosQueryClient：init→get/post）
- 完整文档：`wb-dsv4flash/BREAKTHROUGH.md`
- **query 和 cookie 共享管线**（encryptMode1/2 + basestr + numarrJoin + CRC32）
- **RS send/open/fetch = VM trampoline**（同名函数，伪装 [native code]）
- **Function.prototype.toString.call() 绕过伪装**，获取真实源码
- **CDP Runtime.getProperties 提取 [[Scopes]]**（5 层闭包，1196 个函数）
- **basestr ��提取**：`qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^`
- **常量池含所有加密算法常数**：AES(0x11b, S-Box) + XXTEA(0x9e3779b9) + MD5 + SHA-1 + CRC32
- **VM bytecode 完整反编译**：94 个操作码，query 生成流程完全推导
- **AES encode 函数定位**：`_$jT` = 管线 `encode`（相同的 S-Box 查找逻辑）
- **S-Box 是站点固定的**（不同 nsd/cd 验证一致）→ 管线 cfgnum 通用
- **query 密钥 == keys17**（2026-07-31 完全验证）
- **query 加密 = encryptMode1(plaintext_24B, numarrAddTime(keys17), 0)**
- **session_data = keys[2]**（cd 解密产物，48B XOR 密钥）— 同会话验证 ✅
- **明文 24B**：[random_13B][random_3B][183][0][counter_2B][CRC32(URL.toUpperCase())_4B]
- **bytes[0-12] 和 byte[17] 用随机值/0 填充，RS 不校验**
- **纯算法 POST 已通过 RS 验证**：无 query→412，有 query→非 412（RS 放行）
- **query 生成公式**：`'0' + numarr2string([CRC32_BE, 1, 0, 48, ...keys[2], 32, ...encryptMode1(pt, keys17+time, 0)])`
- **Send hook VM bytecode**：77 元素，115 操作码完整解码
- **可用方案**：GET 纯算法 100%，POST 纯算法 RS 层通过（业务层 400 待解决，可能是 TLS 指纹）
- **分析文档**：wb-qwen38/ANALYSIS.md，纯算法客户端：wb-qwen38/27_pure_post.js

## :20080 的 200/412 概率性（2026-07-29 已解决 - numarr2string 编码 bug）
- **根因已定位并修复**：numarr2string.js 第 25 行余数编码用错变量（b1 代替 b0），导致 ~75% cookie 最后一个编码字符错误
- **修复后 30/30 = 100%**，pmos_xj_client.js maxRetries 已降至 3
- 以下为历史排查记录（结论正确但根因在编码层而非密钥/指纹/basearr）

### 历史排查（2026-07-28 根因彻底定位 - 已推翻）
- **最终根因**：真实 cookie 加密密钥（外层 keys16/内层 keys17）由**内层动态代码运行生成**，不在 cd 静态解密区（ans 滑动窗口枚举全失败）。管线用 cd 静态 ans keys 近似 → 70% 的 cd 密钥错 → 30% 通过率（**密钥问题，非指纹**）。
- **jsdom 突破**：jsdom 完整环境跑外层 VM + 内层动态代码，瑞数自生成 cookie → **密钥 100% 对**（连续 5 次全 200）。但 jsdom cookie 给警告页（jsdom [0] 指纹与真实根本性差异，cookie 279 字符 vs 真实 428，服务器确定性拒绝 jsdom 指纹，**指纹问题**）。
- **两因素正交**：管线=密钥30%对+真实指纹(过)→30%业务页；jsdom=密钥100%对+jsdom指纹(拒)→警告页；浏览器=100%对+真实指纹→100%。
- **服务端确定性校验**：同 cookie 重放必 200，由 cookie 内容决定（非随机/速率限制）。
- **实用结论**：方案B（pmos_xj_client.js 重试，30%→3-7次稳定200）已可用且业务页+API 全 200；方案A2（Patchright 跑内层 VM 生成 cookie → Node 重放）100% 且业务页；jsdom 纯协议 100% 需解指纹注入（后续）。

## Phase 4 突破（2026-07-28）：Node vm 沙箱跑内层动态代码（不依赖 jsdom）
- **可跑通**：Node `vm` + 最小环境补丁可完整执行外层 VM + 内层动态代码，自生成 P cookie，结构完整（外层 keys16 解密 nextarr 头 `2,8` + uuid 自洽）。接口 `output/keygen/sandbox_keygen.js`（genKeysViaSandbox/runSandbox/buildEnv）。
- **跑通的关键补丁**：反检测全局必须显式 undefined——`chrome` 真实对象 + 20 个自动化工具特征（callPhantom/_phantom/__webdriver_* 等）+ `Z8XHJJY` 万能容错 Proxy。缺任一触发内层 VM `Invalid array length` 死循环。
- **密钥结论**：同 cd 下沙箱密钥与 jsdom 一致（明文共同前缀 9 字节 + 结构可读），密钥 f(nsd,cd) 纯计算、与环境指纹正交。
- **卡点**：密钥在 JSVMP 闭包（dispatcher while(1) switch），执行后 window.$_ts 仅剩 l__ 函数，深度扫描得 0 候选字节数组 → 纯沙箱无法导出 keys16/17 原始字节数组。需路径A（操作码还原）或 dispatcher 插桩截获。
- **坑**：脚本须从项目根目录运行（外层 js 相对路径）；jsdom 与 Node vm 沙箱同进程偶发 realm 干扰（Invalid array length），用 gen_jsdom_child.js 子进程隔离。

### 历史排查（2026-07-28 晚 根因再修正 - 已推翻）
- **keys16/keys17 已证明正确**：8 个全新 cd 浏览器权威对照（Patchright 数组陷阱）8/8 == 管线，累计 19/19（含 jsdom 11 个）。**"keys17 经内层 VM 二次变换、70% cd 管线错"的旧结论被推翻**（旧证据 crux.json 系误抓别的 16 字节数组当 keys17）。
- **30% 失败根因不在密钥，需重新定位**：管线 cookie 实测 20 个新 cd 仅 20% 200。密钥对 + 指纹真实 → 根因是会话相关因子，候选 codeUid（getCodeUid 的 keys[33] nx VM 回退）/ basearr 会话段 / cookie 绑定测量假象。
- **cookie 绑定规则已验证（fingerprint-bind，5 轮×7 方式）**：cookie 只认内容——不绑 page 会话/TLS 连接/IP，非一次性（90s 内 9 次重放全 200）。**唯一硬规则：O+P 必须配对**，仅带 P 必 412（与 TLS 指纹无关）。browser-authoritative 的"真实 cookie 重放 5/5 全 412"是测量假象（只带了 P）；**F4"412 cookie 重放也 412 → cookie 坏"证据无效**，需 O+P 配对重放复验。got-scraping + O/P 配对重放是可信测量方式，管线 30% 通过率非测量假象。报告：output/keygen/cookie-bind-report.md。
- 排查方法学：jsdom/Patchright 数组陷阱（hook slice/map/from 抓 16/17 字节数组 + shape 匹配）是提取 keys16/17 的可靠手段（jsdom_trap_child2.js / browser_authoritative.js）。

## 经验沉淀位置
- 完成报告：PMOS_XJ_20080_REPORT.md
- 站点逆向总报告（旧 443/v2）：PMOS_REVERSE_ENGINEERING_REPORT.md
- 日报：.codebuddy/memory/YYYY-MM-DD.md
