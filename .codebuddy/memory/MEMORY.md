# MEMORY.md — rs-reverse_glm 长期事实

## 项目
rs-reverse（瑞数 VMP 逆向工具）的 fork 工作区，目标适配 pmos.xj.sgcc.com.cn（443 与 :20080 两部署）。

## 核心方法论（瑞数 VMP 纯算法）
- cookie 生成链路：拉 412 挑战页解析 $_ts.nsd/cd → 沙箱执行外层 VM 提取动态代码/cp[3] → cp3Override 注入管线 Coder → cd解密→keys→basearr→Cookie 加密 → O+P 重放
- **cp[3] 必须用挑战页真实 nsd**（每次请求变）；沙箱执行外层 VM（纯计算，不依赖浏览器指纹）可提取与浏览器逐字节一致的动态代码
- 管线 Coder 逻辑正确，关键在于"用对 nsd + 沙箱提取真 cp3"
- basearr 适配器在 src/handler/basearr/len*.js，按站点调整

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

## :20080 的 200/412 概率性（2026-07-28 根因彻底定位）
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

## :20080 的 200/412 概率性（2026-07-28 晚 根因再修正）
- **keys16/keys17 已证明正确**：8 个全新 cd 浏览器权威对照（Patchright 数组陷阱）8/8 == 管线，累计 19/19（含 jsdom 11 个）。**"keys17 经内层 VM 二次变换、70% cd 管线错"的旧结论被推翻**（旧证据 crux.json 系误抓别的 16 字节数组当 keys17）。
- **30% 失败根因不在密钥，需重新定位**：管线 cookie 实测 20 个新 cd 仅 20% 200。密钥对 + 指纹真实 → 根因是会话相关因子，候选 codeUid（getCodeUid 的 keys[33] nx VM 回退）/ basearr 会话段 / cookie 绑定测量假象。
- **cookie 绑定规则已验证（fingerprint-bind，5 轮×7 方式）**：cookie 只认内容——不绑 page 会话/TLS 连接/IP，非一次性（90s 内 9 次重放全 200）。**唯一硬规则：O+P 必须配对**，仅带 P 必 412（与 TLS 指纹无关）。browser-authoritative 的"真实 cookie 重放 5/5 全 412"是测量假象（只带了 P）；**F4"412 cookie 重放也 412 → cookie 坏"证据无效**，需 O+P 配对重放复验。got-scraping + O/P 配对重放是可信测量方式，管线 30% 通过率非测量假象。报告：output/keygen/cookie-bind-report.md。
- 排查方法学：jsdom/Patchright 数组陷阱（hook slice/map/from 抓 16/17 字节数组 + shape 匹配）是提取 keys16/17 的可靠手段（jsdom_trap_child2.js / browser_authoritative.js）。

## 经验沉淀位置
- 完成报告：PMOS_XJ_20080_REPORT.md
- 站点逆向总报告（旧 443/v2）：PMOS_REVERSE_ENGINEERING_REPORT.md
- 日报：.codebuddy/memory/YYYY-MM-DD.md
