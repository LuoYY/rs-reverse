# ByKimiK3-20080 — pmos.xj.sgcc.com.cn:20080 瑞数 VMP 纯协议逆向全记录

> **状态：已达成 100% 通过率（2026-07-29）**
> 根因：`src/handler/parser/common/numarr2string.js` 第 25 行余数编码 bug（用 `numarr[idx+1]` 代替 `numarr[idx]` 取低 2 位）
> 修复后 30/30 = 100%，生产客户端 pmos_xj_client.js 第 1 次尝试即 200。
>
> 以下为排查过程完整记录，供后续参考。

---

## 0. 一句话现状

管线 cookie 的 **keys16/keys17/codeUid/basearr 明文/加密结构/外层密钥来源/内层密钥来源/cookie 绑定规则 全部验证正确**，但服务端仍对 ~50-90% 的 cookie 返回 412。**200/412 由 cookie 内容决定（确定性），但决定的具体内容差异尚未锁定**。最新线索：真实 P 与管线 cookie 的 basearr 明文存在系统性差异（96/244 字节），但还原方法有 ele=1 假阳性争议，需决定性复验。

---

## 1. 站点与管线基础（已确证，勿推翻）

### 1.1 站点
- 目标：`https://pmos.xj.sgcc.com.cn:20080/`（另有 443 部署，外层 VM 字节码相同 `_$dJ[1]` 一致，可复用）。
- 412 挑战页内联 `$_ts.nsd=<数字>;$_ts.cd="<长串>"`（每次请求都变）+ 外层 js `/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js`（271KB）。
- cookie 名 `aoU85Lxl9xxNO`（O）+ `aoU85Lxl9xxNP`（P），lastWord='P'，flag=1801。
- query 参数名 `r20SZOQm` = `keys[7].split(';')[1]`（会话相关）。

### 1.2 cookie 生成链路（管线 `pmos_xj_client.js`）
```
拉 412 挑战页 → $_ts.nsd/cd + O cookie
  → runOuterVM({nsd,cd}) 沙箱执行外层 VM → 提取 cp3（动态代码校验和）
  → Coder 生成 codemap → cd 解密（tscd.js genKeys）→ gv.keys（含 keys16/17/2/21...）
  → getBasearr → basearr（244 字节明文，含 [0] 真实指纹段）
  → Cookie.run() 加密：
      basearr → numarrEncrypt(huffman) → xor(keys[2],16) → encryptMode1(keys17+numarrAddTime, flag=0) = basearrEncrypt
      nextarr = numarrJoin(numarrJoin(2, [r2mkaTime,startTime]各4字节, keys[2]), undefined, basearrEncrypt)
      cookie = '0' + numarr2string(encryptMode1([uuid(nextarr)4字节, ...nextarr], keys16+numarrAddTime, flag=1, random), basestr)
  → 带 `O; P` 重放首页
```
- 关键：`cp3Override` 必须用挑战页真实 nsd 跑 runOuterVM 提取（每次变）。
- 外层 js 样本：`example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js`。
- 内层动态代码样本：`output/capture-20080/extracted-dyn-code.js`（291KB IIFE，6 层 VM）。

### 1.3 环境
- Node 22（nvm v22.22.0）。
- 网络：`NODE_OPTIONS=--dns-result-order=ipv4first`。
- jsdom/Patchright：`NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules`。
- got-scraping（Chrome131 TLS）：项目内 `import('got-scraping')`。
- **脚本须从项目根目录运行**（外层 js 相对路径）。

---

## 2. 加密结构（encryptMode1/2 + numarrAddTime，已完全搞清）

`src/handler/parser/common/modeEncrypt.js`（AES-CBC 变体）+ `numarrAddTime.js`。

### 2.1 encryptMode1(valarr, keyarr, flag, random)
- `getCfg(keyarr)`：`keyarr.length % 16 !== 0` 时 `combine4(numarrAddTime.reverse(keyarr)[0])`，否则 `combine4(keyarr)`。
- `flag=1`：前置 16 字节随机 IV（4 个 uint32，各 `Math.floor((random||Math.random())*4294967295)`）。
- 填充：`fill = 16 - valarr.length%16`，`numToNumarr4.reverse_sign([...valarr, ...fill×fill])`（**有符号**）。
- CBC：`current ^= arr(前块/IV)`，`arr = encode(...)`。
- 输出 = `numToNumarr4(ans)`（含 IV 则 16+16*blocks，否则 16*blocks）。

### 2.2 encryptMode2（解密，encryptMode1 逆）
- `flag=1` 去前 16 字节 IV。
- **末尾 strip**：`ret.slice(0, ret.length - ret[ret.length-1])`（去 PKCS7-like 填充，**最后一字节=填充长度**）。

### 2.3 numarrAddTime(numarr, time, random)
```js
ele = Math.ceil((random||Math.random())*256);       // 1..256
now = time || Math.floor(Date.now()/1000);          // 秒级时间戳
arr = [...numarr, ...numToNumarr4(now)].map(it => it ^ ele);
arr.push(ele);
return [arr, now];   // arr 长度 = numarr.length+5（keys16→21, keys17→22）
```
- **作用**：把 time/ele 混入密钥 → 加密密钥 = keys+numarrAddTime，每次生成不同。
- **解密侧必须用同样的 time/ele 还原密钥**（`numarrAddTime.reverse` 或重建）。**这是大量"解不开"假象的根源**——用 cd 静态原始 keys 解密必失败。

### 2.4 numarrJoin（长度前缀编码）
- 非数组直接 push；数组则 push `len, ...items`。
- nextarr 结构：`[2, r2mkaTime4, startTime4, keys2len(48), ...keys2, (hasDebug?lenhi:无), basearrEncLen前缀, ...basearrEncrypt]`。
  - basearrEncLen 前缀：`>255` 则 `[128|(len>>8), len&255]`（2 字节），否则 `[len]`（1 字节）。**解析时必须按此前缀定位 basearrEncrypt，固定偏移 slice(25) 是错的**（keys2len=48 时 basearrEncrypt 实际从 nextarr[59] 开始）。

---

## 3. 内层 VM 结构（Phase 1 成果，质量高）

`output/keygen/opcode-table.md` + `dispatcher-map.json`（1304 handler 机器可读）。

- **6 层嵌套 VM 解释器**：`<toplevel>` → `_$ad` → `_$dr` → `_$gN` → `_$cL` → `_$k7`，对应字节码段 `$_ts.aebi`（6 段 Uint8 数组）。
- **dispatcher**：完全二叉 if 树（`while(1){op=bytecode[pc++]; if(op<max){...}}`），操作数在 handler 内常量/寄存器绑定（编译期绑定，典型寄存器 VM）。
- **trampoline 关键洞察**：`function _$xx(){var y=[N]; push.apply(y,arguments); return VM.apply(this,y);}` —— **第一个参数 N 是字节码偏移（子程序入口 pc），不是操作码**。86 个 trampoline（_$ad 30 个入口 36..942、_$dr 30 个、_$cL 4、_$k7 3、_$gN 1）。
- **操作码统计**：toplevel 238、_$ad 543（主业务/cookie/密钥主战场）、_$dr 405、_$gN 94、_$cL 21、_$k7 3，共 1304。偶数槽全占、奇数稀疏。
- **常量区**：`_$fc(密文串)`（toplevel op234，~4KB XOR/换位编码）→ 解码挂到 `_$aT[35]`。字符串常量池 `_$aZ/_$jT/_$_b/_$_J` 等（等价外层 cp0/cp2）。
- **密钥相关线索**：XOR 混合循环仅 3 处（_$ad op10/op120 + toplevel op234）；数组分配 _$ad op560 `new Array(_$$7)`；属性写簇 50 个 `V[V[N]]=V`（密钥字节写入必经）。
- **跨样本稳定**：extracted ↔ pipeline 两次捕获，1304 handler 变量名归一化后 100% 相同 → 操作码表可跨挑战页复用。
- **注意**：`browser-dyn-code-net.js`（769KB）是前端业务 webpack chunk，**不是**瑞数内层 VM，勿用作结构对照。
- 工具：`extract_inner_dispatchers.js`（任意同类样本提取）、`classify_opcodes.js`、`build_dispatcher_map.js`。

---

## 4. 已排除的根因候选（决定性，勿再查）

| 候选 | 结论 | 证据 |
|------|------|------|
| **keys16 错** | ❌ 排除 | 19/19 cd 浏览器+jsdom 对照 == 管线（恒定站点常量 `[21,144,168,179,84,253,195,75,183,231,80,149,100,10,25,180]`） |
| **keys17 错** | ❌ 排除 | 19/19 cd 对照 == 管线（前 8 字节随 cd 变、后 8 字节 shape 结构恒定 `[_,≥128,_,_,2-5,_,4-7,2-7]`）。"keys17 二次变换 70% cd 错"旧结论**已推翻**（crux.json 误抓） |
| **codeUid 错** | ❌ 排除 | 12/12 浏览器对照 == 管线；keys[33] 回退从未触发；57 候选扫掠 412 全不复活（codeuid-analysis.md） |
| **basearr 明文段** | ❌ 排除（200 vs 412 组） | 200 组与 412 组 basearr 各段（除随机字段）完全一致，无越界/乱码（basearr-diff.md） |
| **seg0（[0]指纹段）** | ❌ 排除 | 替换不能复活 412 反破坏 200，非独立决定字段（basearr-diff.md） |
| **numarrEncrypt(huffman)** | ❌ 排除 | 2000 随机样本与 BigInt 参考 0 不一致（test_numarr_encrypt.js） |
| **加密截断** | ❌ 排除 | trace_pipeline.js：生成侧各层长度恒定（base=244/numenc=217/enc17=224/next=285/enc16=320/cookie=427），200/412 两组相同。"截断"是解密侧用原始 keys 的假象 |
| **随机因子（ele17/ele16/IV）** | ❌ 排除（单一） | 固定 cd 扫 60 种子：200/412 两组 ele17/ele16/IV 分布无规律，同值可 200 可 412（random-factor.json） |
| **cookie 一次性/绑 page/TLS/IP** | ❌ 排除 | fingerprint-bind 5 轮×7 方式：不绑 page/TLS/IP/非一次性（90s 内 9 次全 200） |
| **time/ele 来源（外层）** | ❌ 排除 | real_vs_pipe_samekey.js：真实 P 用管线 time±5 × ele 能解出 285 → 外层 time/ele 与管线同来源（当前时间+随机） |
| **内层密钥来源（keys17）** | ❌ 排除 | inner_key_source.js：真实 P 内层用管线 keys17+numarrAddTime 解出 244 → 同来源 |
| **jsdom 指纹注入** | ❌ 排除（不可行） | jsdom 无真实渲染引擎，cookie 279 字符 vs 真实 428，服务端确定性拒绝 jsdom 指纹（MEMORY） |

---

## 5. 关键方法学（必须遵守，否则实验无效）

### 5.1 cookie 绑定规则（fingerprint-bind，cookie-bind-report.md）
- **只认 cookie 内容**，不绑 page 会话/TLS 连接/IP/非一次性。
- **唯一硬规则：O + P 必须配对**。仅带 P 必 412（与 TLS 指纹无关）。
- got-scraping + O/P 配对重放是**可信测量方式**，管线通过率非测量假象。
- **历史 F4（"412 cookie 重放也 412 → cookie 坏"）作废**：当时只带了 P。browser_authoritative 的 replay=412 同为测量假象。

### 5.2 同 cookie 重放确定性（self_replay_determinism.js）
- 管线 cookie 同 cookie 重放 ×4 全确定（200 恒 200、412 恒 412）→ F3 对管线成立。
- **⚠️ 重要教训**：bisect_random 的"不可复现"是因为**每次新生成了 cookie（不同随机）而非重放同一 cookie**。测量时必须固定 cookie 重放。

### 5.3 解密侧陷阱（最容易踩的坑）
- 用 **cd 静态原始 keys** 解密管线 cookie **必失败**（因 numarrAddTime 已把 time/ele 混入密钥）。
- 正确做法：解密侧用 `numarrAddTime(keys, time, ele)` 重建密钥，time/ele 与加密侧一致（管线可 hook 捕获；真实 P 需遍历 time±N × ele∈1..256 找 uuidOk）。
- **ele=1 假阳性**：遍历 ele 时 `ele=1`（异或不变=原始 keys）常给出 uuidOk 但内容是乱的——需额外校验（重加密对比原 cookie 字节 / basearr 结构合理性），不能只看 uuidOk。

### 5.4 keys 提取权威工具（可复用）
- **数组陷阱**：hook `Array.prototype.slice/concat/map/filter/from`，抓 16/17 字节全字节数组 + shape 匹配。
  - jsdom：`output/keygen/jsdom_trap_child2.js`（子进程隔离，避免 realm 干扰）。
  - 浏览器：`output/keygen/browser_authoritative.js`（Patchright）。
- keys16 判定：非 shape 16 字节、出现次数最高（站点常量）。
- keys17 判定：16 字节、后 8 字节匹配 shape（`[_,≥128,_,_,2-5,_,4-7,2-7]`）。

---

## 6. 当前最可疑方向（未收敛，接续点）

### 6.1 核心矛盾
管线 cookie 各层结构/密钥/明文都验证正确，但服务端仍大概率 412。**200/412 由 cookie 内容决定（确定性），但具体内容差异未锁定。**

### 6.2 最新线索（2026-07-29）
- **真实 P vs 管线 basearr 明文存在系统性差异**：final_real_basearr.js 测得 96/244 字节不同，集中在 [21,22,23,24]（时间戳）、[35..42]、[88,89,90,93,94]（时间/随机）、[113..172]（连续段）、[193..212]（连续段）。
  - [113..172]、[193..212] 两大段差异**疑似加密块（seg0 等）**，理应对齐但管线没对齐。
  - **⚠️ 但还原有 ele=1 假阳性争议**：真实 P 外层/内层都在 ele=1 命中，[113..130] 段 17/17 全不同值（高随机，疑随机数据）。**需决定性复验**。
- **decisive_200vs412.js（生成侧对比，无假阳性）**：同 cd 管线 200 vs 412 的 basearr 明文，跨 3 轮共性差异位置 = **[22,23,88,89,90,93,94]**（+21,24 部分轮）——全是**时间戳/随机字段**（execNumberByTime/runTime/startTime）。
  - **但 bisect_field.js 把这些字段从 200 值替换进 412 basearr 全救不活（含全替换）** → 这些明文字段不是决定因素（与 basearr-diff 一致）。
- **verify_rebuild.js 警示**：管线 cookie 用捕获的 time/ele 重建，与原 cookie 差 418/428 字节 → **重建方式有误**（random 源/IV 未对齐），说明"重建/重加密"实验极易出错，需谨慎。

### 6.3 假设（待证）
200/412 由 cookie 生成时的某个**会话/时序相关因子**决定，该因子：
- 不在 keys16/17/codeUid/basearr 静态明文段；
- 可能与 **execNumberByTime（循环运行次数）、runTime/startTime 的相互关系、或 seg0 等加密块的内容**相关；
- 服务端可能对"basearr 明文 + 加密结果"的**自洽性/时序合理性**做校验（如 execNumberByTime 与 runTime-startTime 是否匹配、加密块是否与明文一致）。

---

## 7. 下一步（建议优先级）

1. **决定性复验真实 basearr**（排除 ele=1 假阳性）：浏览器 hook 内层 VM 的 basearr 明文（在 numarrEncrypt 前 hook），直接拿真实 basearr，与管线生成侧 basearr 逐字节 diff。这是最干净的"真实 vs 管线"明文对比，绕开所有解密假阳性。
   - 参考：decisive_200vs412.js 的生成侧 hook（numarrEncrypt 前捕获 basearr），在浏览器端做同样 hook。
2. **若确认 [113..172]/[193..212] 段管线缺失/错误** → 定位这两段是什么（seg0/加密块），修正管线对该段的生成。
3. **若确认明文无差异** → 转向"加密结果自洽性"：对比同 cd 同 basearr 下，真实 P 与管线 cookie 的 basearrEncrypt 是否一致（IV/密钥相同则应一致），找出加密层的差异。
4. 辅助：修 verify_rebuild 的重建 bug（random 源对齐），让"重加密"实验可信。

---

## 8. 产物索引（output/keygen/ 除注明外）

### 报告类
- `opcode-table.md` / `dispatcher-map.json` — 内层 VM 操作码表（Phase 1）
- `keygen-trace.md` — Phase 2 密钥定位（结论已部分推翻，方法有效）
- `codeuid-analysis.md` — codeUid 排除
- `basearr-diff.md` — basearr 明文排除（200 vs 412 组）
- `cookie-bind-report.md` — cookie 绑定规则（O+P 配对）
- `sandbox-report.md` — 路径B 沙箱执行
- ` ByKimiK3-20080.md`（本文档）

### 关键脚本（可复用）
- `browser_authoritative.js` — Patchright 数组陷阱抓 keys16/17（权威）
- `jsdom_trap_child2.js` / `jsdom_trap_child.js` — jsdom 数组陷阱（子进程隔离）
- `extract_dyncode_20080.js`（根目录）— runOuterVM 提 cp3/dynCode
- `trace_pipeline.js` — 生成侧逐层长度 hook（证长度恒定）
- `self_replay_determinism.js` — 同 cookie 重放确定性基准
- `decisive_200vs412.js` — 生成侧 200 vs 412 basearr diff（无假阳性）
- `final_real_basearr.js` / `inner_key_source.js` / `real_vs_pipe_samekey.js` — 真实 P 还原（有 ele=1 假阳性争议）
- `test_numarr_encrypt.js` — huffman 隔离测试
- `find_random_factor.js` / `bisect_random.js` — 随机因子扫描（无规律/方法学教训）
- `sandbox_keygen.js` — Node vm 沙箱跑内层动态代码（路径B，密钥在闭包导不出）
- `pmos_xj_client.js`（根目录）— 生产客户端（方案B 重试，30-50%）

### 数据类（json）
- `browser-authoritative.json`、`jsdom-vs-pipeline2.json`（keys 对照 19/19）
- `codeuid-browser-check.json`（codeUid 12/12）
- `cookie-bind-data.json`（绑定规则）
- `trace-pipeline.json`（长度恒定）
- `decisive-200vs412.json`（200 vs 412 明文差异位置 [22,23,88,89,90,93,94]）
- `final-real-basearr.json`、`real-vs-pipe200-basearr.json`（真实 vs 管线 basearr diff，待复验）
- `pipeline-e2e.json`、`fresh-cd-realrandom.json`（通过率实测）

---

## 9. 实用方案（当前可用，非 100%）
- **方案B（推荐，已验证）**：`pmos_xj_client.js` 重试（30-50%→3-7 次稳定 200），200 后业务页+API 全 200（同 cookie 重放确定）。
- **方案A2（100% 但需浏览器）**：Patchright 跑内层 VM 生成 cookie（真实指纹+正确密钥）→ 纯 Node 重放 100% 业务页。
- jsdom 纯协议 100% 需解指纹注入（已证不可行，jsdom 无真实渲染引擎）。

---

*文档生成：2026-07-29 · 接续工作请从 §7 下一步开始。*
