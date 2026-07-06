# pmos.xj.sgcc.com.cn Cookie 逆向工程完整报告

> 生成日期: 2026-07-05
> 目标: 破解 pmos.xj.sgcc.com.cn (v2 格式, index-v2.html) 的瑞数 cookie 加解密过程
> 基于项目: rs-reverse (瑞数 VMP 逆向工具)

---

## 一、项目背景

### 1.1 瑞数(RuiShu)反爬机制

瑞数是一种基于 VMP(虚拟机保护)的反爬虫系统。其核心流程:

1. 服务器返回 HTML，内含 `$_ts.nsd`(种子) 和 `$_ts.cd`(加密配置数据)
2. 外层 VM(`rGTR1U4jJCVr.303c6e9.js`) 解析 `cd`，生成内层 VM 代码
3. 内层 VM 采集浏览器指纹，构建 **basearr**(基础数组)
4. basearr 经多层加密后写入 cookie
5. 服务器解密 cookie，校验指纹和时间戳

### 1.2 rs-reverse 项目

- 已适配多个网站(riversecurity.com, customs.gov.cn 等)
- 每个网站在 `src/handler/basearr/` 下有一个适配器文件
- 适配器实现 `getBasearr()` 函数，构建该网站的 basearr
- 适配一个网站约需 1 天(README 所述)

### 1.3 pmos 特殊性

pmos 使用 **v2 格式**(index-v2.html)，其 basearr 结构与已适配网站不同:
- 新增 `[0]` 段(101/61 字节加密指纹块)
- `[10]` 段结构变化(19 字节，len123 风格)
- `[6]` 段长度可变(取决于 keys[22] 长度)

---

## 二、Cookie 加密链路(已完整还原)

### 2.1 加密流程

```
basearr (204/235/243 字节)
  ↓ numarrEncrypt (霍夫曼编码)
  ↓ xor(keys[2], 16 字节)
  ↓ encryptMode1 (AES-CBC, keys[17] via numarrAddTime, flag=0, 无IV)
  ↓ numarrJoin([2,8,r2mkaTime/startTime,keys2], debugByte, basearrEncrypt)
  ↓ 前置 uuid4(nextarr)
  ↓ encryptMode1 (AES-CBC, keys[16] via numarrAddTime, flag=1, 有IV)
  ↓ numarr2string (自定义 base64, 字母表来自 cp2)
  ↓ 前置 '0'
= cookie 值
```

### 2.2 Cookie 名称

```
cookieName = ascii2string(keys[7]).split(';')[5] + lastWord
           = "aoU85Lxl9xxN" + "P"
           = "aoU85Lxl9xxNP"
```

### 2.3 两个 Cookie

pmos 生成两个 cookie:
- **O cookie** (`aoU85Lxl9xxNO`): TEA 加密的指纹对象
  - 流程: `JSON.stringify(指纹对象_$lv)` → `string2ascii` → `_$eh`(TEA, session key) → prepend → base64
- **P cookie** (`aoU85Lxl9xxNP`): AES 加密的 basearr
  - 流程: 见 2.1

### 2.4 验证工具

`decrypt_cookie.js` 可反解真实 cookie 回到 basearr(外层 uuid 已验证匹配)。

---

## 三、pmos 关键参数(已确定)

| 参数 | 值 | 来源 |
|------|-----|------|
| 正确 ts 文件 | `output/pmos-ts.json` (nsd=49088) | cd 前缀匹配 index-v2.html |
| flag | 1801 (0x0709) | basearr [7] 段 |
| lastWord | 'P' | cookie 名 `aoU85Lxl9xxNP` |
| keynameNum | 909 | cp[1].length; `grenKeys(909, 49088)` 匹配真实 cp[1] |
| 加密 hostname | `SVRWShdBUxdKXlpaF1pWVBdaVw==` | = pmos.xj.sgcc.com.cn |
| hasDebug | 解耦: ts.hasDebug=false(代码生成), adapt.hasDebug=true(debug字节) | 见 3.1 |

### 3.1 hasDebug 解耦

- 外层 js 包含 `push("gger;")` → 自动检测 hasDebug=true
- 但代码生成用 hasDebug=true 会在 tscd 任务 `0>one>20-22` 崩溃
- 解决: `--no-has-debug` (ts.hasDebug=false 用于代码生成)
- cookie 的 nextarr **包含** debug 字节(128) → `adapt.hasDebug=true` 添加
- 即: **ts.hasDebug=false, adapt.hasDebug=true**

### 3.2 keynameNum 正则修复

原始正则 `/_\${2}=_\${2}\(0,(\d+),_\${2}\(/` 在 pmos 上失败(外层 js 格式化有空格)。
修复为空白容忍 + 回退: `gv._ts?.cp?.[1]?.length || 909`

### 3.3 会话模型

- **keys[16]**: 站点常量(跨会话不变，能解密外层 cookie)
- **keys[2], keys[17], keys[21], keys[22]**: 会话相关
- **keys[22]**: v2 会话中为空 → [6] 段 8 字节; 非空时 16 字节
- basearr 长度**非固定**: 随 [0] 段(指纹)和 [6] 段(keys[22])变化

---

## 四、basearr 结构(经 sdenv 实测)

### 4.1 实测 basearr (204 字节, jsdom 指纹)

| 段 | 类型 | 长度 | 内容 |
|----|------|------|------|
| [3] | inner | 73 | 指纹: maxTouchPoints, eval长度, userAgent uuid, platform, execNumberByTime, execRandomByNumber, hexnum, 窗口尺寸, pathname uuid... |
| [10] | timing | 19 | `[flagcheck, 13, time4, keys19_4, random8, flag]` (len123 风格, **有**末尾flag) |
| [7] | site | 12 | `[16777216, 0, flag=1801, codeUid]` |
| **[0]** | **指纹加密块** | **61** | **`[37,133,60,244,70,165,137,110,...]`** |
| [6] | keys22 | 16/8 | `[1,0,0,0,0,hidden, encryptMode2(decrypt(keys22]), decode2]` |
| [2] | calc | 4 | `fixedValue20()` (cp[1]+tasks 计算) |
| [9] | battery | 2 | `[oper, level*100]` |
| [13] | zero | 1 | `[0]` |

### 4.2 [10] 段修正

之前以为是 18 字节(无末尾 flag)，实测为 **19 字节**(len123 风格: const=13, **有**末尾 flag)。`len243.js` 已修正。

---

## 五、[0] 段调查(核心未解问题)

### 5.1 [0] 段性质

- **61 字节**(jsdom 指纹), 真实浏览器 101 字节(如 temp1)
- **跨会话固定**(同一浏览器指纹下不变) — **非会话相关**
- **高熵**(加密/编码后的指纹数据)
- 服务器会校验(拒绝 jsdom 指纹 → sdenv cookie 第二次请求返回 200 但仍是 RS 挑战页)

### 5.2 排除项(均经实测验证)

| 加密类型 | 排除原因 |
|----------|----------|
| AES (encryptMode1/2) | 61 非四的倍数 |
| TEA (_$eh) | `_$eh` 仅 O cookie 使用; 无 `<<4`/`>>5` 模式 |
| 霍夫曼 (numarrEncrypt) | numarrDecrypt 往返失败; cp0 无 total/idx 属性名 |
| XOR (keys[16/17/2/22]) | 异或后非可打印指纹 |
| meta 处理 | bitwiseTwoNumarr(decrypt(meta),keys17) 仅 18 字节 |
| cd 派生 | decrypt(cd)=1594, 各种变换均非 61 |
| O cookie 内 | O cookie=66 字节, 不含 61 字节 [0] 块 |

### 5.3 [0] 段是"浏览器指纹加密块"

结论: [0] 段是内层 VM 采集浏览器指纹后用**站点常量密钥**加密生成的指纹块。
- 跨会话固定(同一浏览器) → 密钥是站点常量(keys[16]?)
- 大小随浏览器指纹变化(jsdom=61, 真实浏览器=101)
- 服务器解密后校验指纹有效性

---

## 六、尝试过的路径与经验

### 6.1 路径 A: 静态分析(dynamic.js 反混淆)

**方法**: 用项目 Coder 生成 dynamic.js(反混淆版)，解码 cp0 使其可读。

**成果**:
- cp0 解码成功: `_$eF`=cp0(字符串), `_$j9`=cp2(数字)
- `decode_dynamic.js` 把 `_$eF[N]`→cp0[N] 后部分可读
- 定位 VM 函数: `_$iD`=encryptMode1, `_$lU`=encryptMode2, `_$dI`=AES+base64, `_$eh`=TEA, `_$aX`=JSON.stringify, `_$$O`=string2ascii, `_$bo`=numarr2string
- 定位 numarrEncrypt init: `_$$i()` 函数构建 huffman 树(`_$bT`=total, `_$$U`=idx, `_$ji`=first/second)
- 定位 P cookie 设置: opcode 572, `_$dI(_$ce[1], _$$m)`
- 定位 O cookie 流程: `_$$1`@120304

**障碍**:
- basearr 由 opcode dispatcher 执行构建(非可读代码)
- 变量名重用(同一名字在不同作用域表示不同对象)
- 间接调用(通过函数表分发)
- 计算常量(加密常量从 cp2 运行时计算，非字面量)
- 外层 js 用 `ā` Unicode 变量混淆(5593 个唯一 token)

**经验**: 静态分析可定位函数和流程，但无法追踪 opcode 级执行。

### 6.2 路径 B: 手动补环境(run_vm.js)

**方法**: 用 Proxy 模拟浏览器环境，在 Node VM 中运行 dynamic.js。

**成果**:
- 发现 VM 通过 `window['$_ts']` 读取 cp(dynamic.js 中 `$_ts` 只出现 3 次)
- 修复 "reading '31'" 错误(需把 `$_ts` 挂到 window)
- VM 成功读取 `$_ts.scj/aebi/cp/jf`

**障碍**:
- VM 陷入浏览器特征检测循环(CollectGarbage/ActiveXObject/indexedDB 等)
- 逐个修复特征检测循环，工作量大且长尾
- 最终放弃，转向 sdenv 框架

**经验**: 手动补环境不可行(特征检测循环太多)，需要专业框架(sdenv)。

### 6.3 路径 C: sdenv 补环境框架

**方法**: 安装 sdenv(npm 包，基于 jsdom)，用 `jsdomFromUrl` 运行 VM。

**安装**:
- sdenv v1.1.3，需 Node 20+(用 nvm 的 v22.22.0)
- `documentAll.node` 原生模块需用 Node22 重编译
- canvas 可选(`--ignore-scripts` 跳过)

**成果**:
- **成功运行 VM 并生成完整 cookie!**
- 捕获 `$_ts.nsd/cd`(需立即抓取，VM 会清空 nsd)
- 用 `decrypt_cookie.js` 反解 cookie → 得到真实 basearr(204 字节)
- 提取真实 [0] 块(61 字节, [37,133,60,244,...])
- 确认 [0] 块跨会话固定(两个 sdenv 会话对比)
- 确认 [0] 块是浏览器指纹加密块(非会话相关)

**障碍**:
- sdenv cookie 被服务器拒(jsdom 指纹不被接受)
- 第二次请求返回 200 但仍是 RS 挑战页

**经验**: sdenv 能跑通 VM 但 jsdom 指纹与真实浏览器不同，服务器拒绝。README 称需配置固定随机数 + sdenv-extend 插件才能匹配浏览器。

### 6.4 路径 D: 项目 runTask 追踪

**方法**: 用项目的 `runTask` 执行 VM 任务，追踪 basearr 构建。

**障碍**:
- 根任务无 parent → `getParentSubTask` 报错
- runTask 环境是 mock 的 cp2 → 指纹采集不正确
- [0] 块需要真实浏览器指纹，mock 环境无法构建

**经验**: runTask 适用于特定任务(密钥推导、fixedValue20)，不适用于 basearr 构建(需要浏览器环境)。

### 6.5 路径 E: Array.prototype 钩子

**方法**: 在 jsdomFromUrl 的 `beforeParse` 中 hook `Array.prototype` 的 `push`/`slice`/`concat`/`splice` 等方法，检测 61/204 字节数组。

**成果**:
- 捕获到 huffman 树(`{"_$bT":1,"_$$U":N}` 对象数组)
- 捕获到 CRC 表(`[0,1996959894,...]` = bignum)
- 捕获到随机浮点数组

**障碍**:
- **[0] 块未被捕获** — [0] 块不被 push/slice/concat，是通过 `[]` + 索引赋值创建

**经验**: Array.prototype 钩子能捕获通过方法调用创建/操作的数组，但不能捕获通过 `[]` 字面量 + 索引赋值创建的数组。

### 6.6 路径 F: Proxy 构造器(全数组)

**方法**: 替换 `window.Array` 为 Proxy 构造器，`=[]`→`=new Array()` 使字面量也走构造器。

**障碍**:
- Proxy 的 set trap 干扰 `Array.prototype.push` 内部的 length 跟踪
- "Invalid array length" 错误(push 在 Proxy 数组上失败)
- 尝试 try/catch、跳过大索引、length 透明处理均未解决
- 全数组 Proxy 导致 OOM 崩溃

**经验**: Proxy on `window.Array` 会破坏 push。`[]` 字面量不调用 Array 构造器(使用 JS 引擎内部 intrinsic)，Proxy 无法拦截。

### 6.7 路径 G: jsdomFromText + 内联 patched js

**方法**: 修改 index-v2.html，将外层 js 内联(patch 后)，用 `jsdomFromText` + `runScripts:'dangerously'` 运行。

**障碍**:
- jsdomFromText 环境**不完整** — 即使运行原样外层 js(无 patch)，VM 也在 `_$iZ` 函数(代码生成 `_$hi.push(...)`)报 "Invalid array length"
- jsdomFromUrl(从服务器加载完整 HTML)才能正常运行

**经验**: jsdomFromText 环境与 jsdomFromUrl 不同(缺少服务器响应的 headers/cookies 等)，VM 无法正常完成代码生成阶段。

### 6.8 路径 H: ResourceLoader 拦截(最终突破)

**方法**: 通过 sdenv 的 ResourceLoader 拦截外层 js 加载，patch 后返回。

**关键发现**:
- `JSDOM.fromURL` 用 `resourceLoader.fetch(url)` 获取 HTML
- `fetch` 返回特殊 **request 对象**(有 `.response`/`.href`/`.getHeader()` + `.then()`)
- 直接 `.then()`/`async` 会丢失这些属性 → `api.js:140` 报错

**解决方案**: 包装 request 对象:
```js
wrapper = {
  get response() { return req.response },  // 延迟访问
  get href() { return req.href },
  getHeader: n => req.getHeader(n),
  then(onF, onR) {
    return req.then(body => {
      // patch body (RS js only)
      body = Buffer.from(patchedCode, 'utf8');
      return onF ? onF(body) : body;
    }, onR);
  }
};
```

**字符串感知替换**:
- 外层 js 有 **8 处 `=[]` 在字符串内**(regex 误伤会导致 VM 崩溃)
- 编写 `replaceOutsideStrings()`: 逐字符扫描，跟踪字符串上下文
- 仅替换字符串外的 `[]`(9 处)

**成果**:
- **成功拦截并 patch 外层 js! VM 正常运行，生成 cookie!**
- 注入 `__pa()` Proxy(set + defineProperty traps) + Array.from/slice/concat/push hooks
- 在**完整 jsdomFromUrl 环境**中运行 patched VM

**障碍**:
- **[0] 块仍未被捕获!**
- 9 个 `[]` Proxy(set + defineProperty) + Array.from/slice/concat/push hooks **均未触发**
- 根因: [0] 块的数组变量在 VM dispatcher 内被**重新赋值**为非 proxy 数组(函数返回值)
- 之后的索引赋值不触发任何 proxy trap
- **JS 层 hook 无法拦截非 proxy 数组的索引赋值** — 这是 JS 语言层面的根本限制

**经验**: ResourceLoader 拦截是 patch 外层 js 的正确方法。但 JS 层 Proxy/method hook 无法捕获通过变量重新赋值 + 索引赋值创建的数组。

---

## 七、VM 内部结构(已定位)

### 7.1 外层 js vs dynamic.js

- **外层 js** (`rGTR1U4jJCVr.303c6e9.js`, 241KB): 实际运行的 VM，用 `ā` Unicode 变量混淆
- **dynamic.js** (294KB): 项目的 Coder 从外层 js 反混淆生成的可读版本，用 `_$xx` 变量
- 两者是同一个 VM 的不同表示

### 7.2 VM 函数映射

| dynamic.js 函数 | 作用 | 调用位置 |
|-----------------|------|----------|
| `_$iD` | encryptMode1 (AES, forward) | 仅 `_$dI` 外层调用 |
| `_$lU` | encryptMode2 (AES, inverse) | `_$bZ` wrapper |
| `_$dI(x,key)` | `_$bo(_$iD(x,key))` = AES+base64 | P cookie (opcode 572) |
| `_$eh(x,key)` | TEA (8字节块) | O cookie (`_$$1`@120304) |
| `_$aX` | JSON.stringify (自定义) | O cookie |
| `_$$O` | string2ascii | O cookie |
| `_$bo` | numarr2string (base64) | cookie 输出 |
| `_$$i()` | numarrEncrypt init (huffman 树) | 配置存 `_$lg[53]`/`_$lg[57]` |
| `_$_C` | 代码生成(dispatcher) | outer js:75 |

### 7.3 Huffman 树结构

```
节点: {"_$bT": freq, "_$$U": byteValue, "_$ji": {first, second}}
频率: 1(字节1-254), 6(字节255), 45(字节0)
```

### 7.4 cp0 关键字符串索引

| 字符串 | cp0 索引 |
|--------|----------|
| userAgent | 61 |
| cookie | 54 |
| document | 127 |
| screen | 166 |
| createElement | 56 |
| plugins | 921 |
| battery | 429 |
| connection | 1049 |

### 7.5 外层 js 数组创建方式

- `new Array`: **0 处**(不使用)
- `[]` (空数组, 字符串外): **9 处**
- `[]` (空数组, 字符串内): **8 处**(不可替换，会破坏字符串内容)
- `=[elem]` (非空数组): **11 处**
- `eval` / `Function`: **0 处**(不使用，dispatcher 用 if-else 执行 bytecodes)

---

## 八、工具清单

| 工具文件 | 用途 | 状态 |
|----------|------|------|
| `src/handler/basearr/len243.js` | pmos 适配器([10]已修正, [0]用jsdom 61字节占位) | ✅ 可用 |
| `decrypt_cookie.js` | 反解真实 cookie 为 basearr | ✅ 验证通过 |
| `run_sdenv.js` | sdenv 补环境运行+instrumentation | ✅ 可用 |
| `run_sdenv_intercept.js` | ResourceLoader 拦截+patch 外层 js | ✅ 突破性工具 |
| `decode_dynamic.js` | cp0 解码(dynamic.js 部分可读) | ✅ 可用 |
| `run_vm.js` | 手动补环境(已弃用) | ❌ |
| `run_sdenv_inline.js` | jsdomFromText 内联(环境不完整) | ❌ |
| `run_sdenv_patched.js` | jsdomFromText+Proxy(OOM) | ❌ |
| `run_sdenv_custom_fetch.js` | 自定义 https fetch(格式问题) | ❌ |

### 运行命令

```bash
# 生成 cookie (项目自身)
NODE_OPTIONS=--dns-result-order=ipv4first node main.js makecookie \
  -f output/pmos-ts.json \
  -j example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js \
  --no-has-debug -l info

# sdenv 运行 (生成真实 cookie)
export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH
NODE_OPTIONS=--dns-result-order=ipv4first node run_sdenv.js

# ResourceLoader 拦截 (patch 外层 js + instrumentation)
export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH
NODE_OPTIONS=--dns-result-order=ipv4first node run_sdenv_intercept.js

# 反解 cookie
node decrypt_cookie.js /tmp/pmos_session_ts.json \
  example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js \
  "aoU85Lxl9xxNP=..."
```

---

## 九、代码修改清单

| 文件 | 修改 |
|------|------|
| `src/config/index.js` | keynameNum 正则改为空白容忍 + 回退 `cp[1].length \|\| 909` |
| `src/makeCookie.js` | `'T'` → `(gv.config.adapt?.lastWord \|\| 'T')` |
| `src/handler/basearr/len243.js` | 新建 pmos 适配器: [10]=19字节(len123风格), [0]=jsdom 61字节占位, hasDebug=true, lastWord='P', flag=1801 |

---

## 十、剩余工作与建议

### 10.1 [0] 生成器隔离(路径 1 的最终障碍)

**根本限制**: JS 层 Proxy/method hook 无法拦截非 proxy 数组的索引赋值。[0] 块的数组变量在 VM dispatcher 内被重新赋值为非 proxy 数组(函数返回值)，之后的索引赋值不触发任何 trap。

**可能的突破方向**:

1. **Proxy ALL arrays + 修复 push**: 找到一种不干扰 push 的 Proxy 实现(可能需要完整的 `get`/`set`/`defineProperty`/`deleteProperty` trap 实现)
2. **VM 字节码级追踪**: patch 外层 js 的 dispatcher if-else 链(需先反混淆 `ā` Unicode 变量)
3. **找到 numarrJoin**: [0] 块作为参数传递给 numarrJoin(basearr 组装器)，hook numarrJoin 可捕获
4. **对比分析**: 用 sdenv 生成多个不同指纹的 cookie，对比 [0] 块变化，逆推生成器

### 10.2 替代方案(不需逆向 [0] 生成器)

1. **配置 sdenv 匹配浏览器**: README 称固定随机数 + sdenv-extend 插件可使 cookie 与浏览器一致。需调查 sdenv 配置 API。
2. **硬编码真实浏览器 [0] 块**: 用 temp1 的 101 字节(真实浏览器指纹)。需保证 [3] inner 的 UA 一致。但 [0] 块与 UA 的关联关系未确认。
3. **直接用 sdenv 生成 cookie**: 不逆向 [0] 生成器，直接用 sdenv 的 cookie(但 jsdom 指纹被服务器拒)。

### 10.3 验证现状

- 项目 makecookie: 生成 364 字节 cookie，结构正确，但 [0] 块是 jsdom 指纹(61 字节占位) → 服务器返回 412
- sdenv cookie: 生成完整 cookie(含真实 [0] 块)，但 jsdom 指纹被服务器拒 → 第二次请求返回 200 但仍是 RS 挑战页
- 真实浏览器 cookie: 用户提供的 temp1 + cookie(来自真实浏览器，已过期)

---

## 十一、经验总结

### 11.1 技术经验

1. **sdenv ResourceLoader 拦截**: fetch 返回 request 对象(非 Buffer)，需用 getter 包装器保留 `.response`/`.href`/`.getHeader()`
2. **字符串感知替换**: regex 替换 JS 源码必须考虑字符串上下文，否则会破坏字符串内的 `=[]` 等模式
3. **Proxy 局限性**: `[]` 字面量不调用 Array 构造器(使用 JS 引擎 intrinsic)；Proxy on arrays 会破坏 push(length 跟踪问题)
4. **jsdomFromText vs jsdomFromUrl**: 前者环境不完整(VM 在代码生成阶段崩溃)，后者从服务器加载完整 HTML(VM 正常运行)
5. **Node 版本**: sdenv 的 jsdom 需要 Node 20+(`ArrayBuffer.resizable`)；原生模块需用对应 Node 版本编译
6. **IPv6**: pmos 服务器 IPv6 不可达，需 `NODE_OPTIONS=--dns-result-order=ipv4first`
7. **hasDebug 解耦**: ts.hasDebug(代码生成) 和 adapt.hasDebug(cookie debug 字节) 是独立的

### 11.2 逆向经验

1. **cp0 解码**: `_$eF`=cp0, `_$j9`=cp2。解码后 dynamic.js 部分可读(属性访问变为字符串)
2. **变量名重用**: RS VM 中同一变量名(如 `_$lZ`, `_$ce`)在不同作用域表示不同对象，静态分析极易误判
3. **计算常量**: 加密常量(TEA delta, huffman freq)从 cp2 运行时计算，非字面量，无法 grep
4. **[0] 块性质**: 浏览器指纹加密块，跨会话固定(站点常量密钥)，大小随浏览器变化
5. **basearr 长度可变**: [0] 段(指纹)和 [6] 段(keys[22] 长度)都会影响 basearr 总长度

### 11.3 工具链经验

1. **sdenv**: 基于 jsdom 的补环境框架，能真实模拟浏览器执行环境。`jsdomFromUrl` + `beforeParse` 是核心 API
2. **decrypt_cookie.js**: 自写的 cookie 反解工具(numarr2stringDecode + encryptMode2 + numarrDecrypt)，验证 uuid 匹配
3. **ResourceLoader wrapper**: 拦截 jsdom 资源加载的正确方法(非 eval/Function hook)
4. **`replaceOutsideStrings`**: 字符串感知的源码替换器，避免破坏字符串内容

---

## 附录: 关键数据

### A.1 真实 [0] 块 (jsdom, 61 字节, 跨会话固定)

```
[37,133,60,244,70,165,137,110,191,227,5,13,139,94,168,149,41,30,157,8,184,218,57,163,238,94,107,75,13,50,85,191,239,149,96,24,144,175,216,7,9,235,225,60,202,103,41,161,108,154,187,18,233,116,17,12,197,94,98,117,8]
```

### A.2 temp1 [0] 块 (真实浏览器, 101 字节)

```
[47,119,54,154,195,77,48,41,123,55,111,49,253,235,248,167,151,183,140,71,11,230,161,113,127,26,145,122,108,163,109,13,107,166,163,152,211,15,217,5,133,85,184,207,114,162,21,75,16,65,58,91,178,2,173,195,245,45,25,149,136,73,25,83,50,107,38,161,202,142,65,38,53,39,24,78,71,203,94,5,215,0,47,4,204,64,197,121,162,245,251,216,20,120,113,45,36,175,188,59,229]
```

### A.3 sdenv basearr (204 字节, jsdom)

```
[3,73,1,0,33,128,159,173,0,238,8,77,97,99,73,110,116,101,108,0,0,16,62,52,8,0,0,1,0,0,0,0,0,0,0,3,0,4,0,3,0,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,121,211,210,212,0,0,0,0,0,0,0,0,0,0,0,0,10,19,1,13,106,73,98,242,81,134,13,167,0,2,220,69,46,170,144,57,4,7,12,1,0,0,0,0,0,0,0,7,9,244,70,0,61,37,133,60,244,70,165,137,110,191,227,5,13,139,94,168,149,41,30,157,8,184,218,57,163,238,94,107,75,13,50,85,191,239,149,96,24,144,175,216,7,9,235,225,60,202,103,41,161,108,154,187,18,233,116,17,12,197,94,98,117,8,6,16,1,0,2,0,2,1,100,195,22,79,72,103,1,0,0,0,2,4,103,203,101,203,9,2,8,0,13,1,0]
```
