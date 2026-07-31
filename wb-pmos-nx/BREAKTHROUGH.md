# pmos.nx.sgcc.com.cn:10443 逆向突破报告（2026-07-31）

## 0. 结论摘要

nx 站点（`pmos.nx.sgcc.com.cn:10443`）为瑞数 VMP 新一代部署，与 xj 站点（:20080）相比：
- **cookie/query 算法结构已验证完全正确**（浏览器内构造 cookie 请求 200）
- **密钥派生（keys17/keys2）与 basearr 生成依赖完整 VM 执行**，管线 runTask 对 nx 模拟不完整 → **纯算法 keys 尚未打通**
- **可运行方案：浏览器辅助**（hook 抓 keys/numenc → Node 构造 → 浏览器发请求 200）

## 1. 站点基础信息

| 项 | 值 |
|---|---|
| URL | `https://pmos.nx.sgcc.com.cn:10443/#/outNet` |
| 外层 JS | `/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js`（357KB，已保存 `example/pmos.nx.sgcc.com.cn/`） |
| keynameNum | **1151**（`_$ie=_$kv(0,1151,...)`，xj 为 909） |
| cookie 名 | `3RKyaeh47p90O/P`（keys[7].split(';')[5]+P） |
| query 参数名 | `MurR7rxG`（keys[7].split(';')[1]，在**请求头**传） |
| keys16 | `d7 5a 5c 72 be a1 d2 3b 37 c0 cc 02 d1 5f 11 ad`（站点常量，管线一致） |
| global 数组 | 607 长度（xj 为 909/1151），含函数 |
| 代理 | `http://74940609:aFmWc5Fs@140.249.234.175:2022`（加速） |

## 2. 关键结构（与 xj 的差异）

### 2.1 cookie 结构（P cookie 535 字符 = 400 字节）
```
cookie = 'a' + numarr2string(encryptMode1([uuid4, nextarr], outerKey21, flag=1))
400B = 16B(IV) + 384B
nextarr = [4][8][r2mkaTime(4B)][startTime(4B)][48][keys2(48B)][encLen(1-2B)][innerEnc(304B)]
  ★ 与 xj 差异：头部 [4][8]（xj 为 [2]），两个时间戳（xj 为 [t4][startTime]）
  ★ encLen >255 用 2 字节前缀（0x81|hi, lo）
```

### 2.2 内层加密（basearr → innerEnc）
```
basearr(303B) → numarrEncrypt → numenc(288B) → XOR keys2 前16 → innerInput(288B)
→ encryptMode1(innerInput, numarrAddTime(keys17), flag=0) → innerEnc(304B)
★ numenc 的 getKey（huffman padding 常量）= 0x68（管线默认 0xB8）
★ [185] 输入是 XOR 后的 innerInput（不是 numenc）！加密时直接用它
```

### 2.3 query 结构（119 字符 = 'a' + 88B）
```
88B = [CRC32(4B)][04 00 30][session 48B(=keys2)][55][request 32B]
★ 头部 [04 00 30]（xj 为 [01 00 30]）
★ query 参数在请求头（MurR7rxG header）+ URL query
```

### 2.4 keys 派生（tscd.js genKeys）
```
keys = genKeys(cdArr.slice(end) XOR offset[idx%8])
offset = runTaskByUid('U14124020', [], getTaskarr(one, one[3]))  ← 依赖 VM 执行
keys16 是静态常量（管线正确）；keys17/keys2 依赖 offset（runTask）→ 管线错误
```

## 3. 浏览器关键函数（global 数组索引，跨会话稳定）

| 索引 | 身份 | 源码特征 |
|---|---|---|
| 185 | encryptMode1（trampoline→子程序 592） | `function _$no(){var _$$f=[592];...}` |
| 187 | XOR（前 num 字节） | `for(...)_$jl[_$_X]^=_$_3[_$_X];` |
| 598 | numarrAddTime（16→21） | 564 字符 |
| 599 | numarrAddTime 逆（21→16） | 564 字符 |
| 118 | numarr2string（数组→字符串） | 751 字符 |

## 4. 决定性验证结果

### 4.1 算法正确性（浏览器内构造 cookie 200）
```
浏览器 hook [185]/[187]/[598] 抓 keys2/16/17 + innerInput + outerKey
Node 用浏览器真实 innerKey/outerKey + innerInput 构造：
  innerEnc = encryptMode1(innerInput, innerKey, 0)      ← 直接用 innerInput！
  nextarr = [4,8,t4A,t4B,48,keys2,encLenBytes,innerEnc]
  uuid4 = uuid(nextarr)                                  ← 管线 uuid 算法与浏览器一致 ✓
  outerEnc = encryptMode1([uuid4,...nextarr], outerKey, 1)
  cookie = 'a' + numarr2string(outerEnc)                 ← len=535 与真实一致
→ 清空浏览器 cookie 只设 O+构造P → XHR 请求 → 200 ✓✓✓
```

### 4.2 已验证正确的组件
- keys16（站点常量）✓
- uuid 算法（管线 == 浏览器，同一 nextarr 输入验证）✓
- nextarr 结构（[4][8][t4A][t4B][48][keys2]...）✓
- innerKey/outerKey 的 base == keys17/keys16 ✓
- numenc getKey = 0x68 ✓

### 4.3 Node 重放差异（未完全解决）
- Node 重放（O + 浏览器原始 P）= 200
- Node 重放（O + 构造 P）= 412（浏览器内 200，Node 412——疑为 O 绑定 Node 环境或时间细节）

## 5. 纯算法障碍（关键）

### 5.1 keys17/keys2 派生（runTask VM 模拟不完整）
- 管线 tscd.js: `offset = runTaskByUid(...)` 执行 cd 解密任务
- nx 任务代码引用**动态代码函数**（`_$d$`、`_$aL` 等），codemap 不完整
- 尝试修复（getCodemap 注入函数/varible、runTask 注入重建代码）→ 部分 cd 成功但 keys 仍错
- **根因**：nx cd 解密任务依赖完整 VM 环境（闭包函数），管线 codemap 模拟不完整

### 5.2 basearr 生成（全会话变化）
- basearr 跨会话仅 1.3% 字节相同（几乎全随机/加密块）
- 生成逻辑在 VM 内部，无法静态还原

### 5.3 沙箱方案超时
- 复用 xj 的 sandbox_keygen 执行 nx 外层 VM → 120s 超时（nx 反检测环境不同）

## 6. 可运行方案（浏览器辅助）

```bash
# 浏览器辅助 cookie 生成（算法已验证 200）
node wb-pmos-nx/58_browser_assisted.js
# 流程：浏览器打开 nx 站点 → hook [185]/[187]/[598] 抓 keys/numenc
#       → Node 构造 cookie → 清空 cookie 只设 O+构造P → 浏览器请求 200
```

## 7. 探索路径记录

| 脚本 | 目的 | 结果 |
|---|---|---|
| 01_probe_challenge | 挑战页结构 + 沙箱 cp3 | nsd/cd/O 正常，cp3 可提取 |
| 02_gen_cookie | 管线 cookie 重放 | 428（xj 结构）412 |
| 03-07 | global 数组定位 | nx global = 607（[165] 不是加密） |
| 08-12 | 加密函数定位 | [185] 是 encryptMode1 |
| 13-17 | 反解真实 cookie | 结构 [4][8][t4][t4][48][keys2]... |
| 18-19 | 抓 basearr | basearr 全随机（加密块） |
| 20-21 | hook 加密调用 | [185]=加密 [187]=XOR [598]=addTime |
| 22-27 | 同会话 keys 对比 | **管线 keys17/keys2 ≠ 浏览器**（runTask 问题） |
| 28-31 | huffman 解码 | numenc getKey=0x68（管线 0xB8） |
| 32-34 | 重放测试 | Node 412（后确认旧 cookie/O 过期） |
| 35-36 | 浏览器内请求 | 5/5 200，新 context 页面 200 |
| 37-38 | TLS/HTTP2 测试 | 非 TLS 指纹问题 |
| 40 | 最新 cookie Node 重放 | **仅 cookie 200**（Node 可行） |
| 41-45 | 精确解码 | basearr303 还原（getKey=0x68） |
| 46-52 | 管线修复 | runTask codemap 深坑 |
| 53-57 | 构造 cookie | 结构正确但 keys 错 |
| 58 | 浏览器辅助 | **构造 cookie 浏览器内 200**（算法验证） |
| 59-65 | 深度对比 | nextarr 全字段一致，Node 412 疑 O 绑定 |

## 8. 遗留

1. **纯算法 keys**：需完整 VM 模拟（runTask 环境）或从浏览器提取 keys 派生算法
2. **纯算法 basearr**：需还原 VM 内部生成逻辑（含时间戳/会话字段）
3. **Node 重放 412**：构造 P 浏览器内 200 但 Node 412——需进一步排查 O 绑定/时间窗口
4. **query 纯算法**：结构已确认，需提取 nx prefix mask（类似 xj 的 PREFIX_MASK）

## 9. 沙箱调试（2026-08-01 补充：为什么沙箱对 nx 死循环 + 定位方法）

### 9.1 沙箱死循环定位结论
- **nx 动态代码是递归式 VM**：`_$ml(_$mB,...)` 7 参数递归 dispatcher，含 **293 个 debugger 语句** + 数百 trampoline（`function _$ct(){var _$kb=[853];...return _$kE.apply(this,_$kb);}`），与 xj 的迭代式 dispatcher（`_$lx` 3 参数 if 树）完全不同
- **死循环点**：`_$ml` 递归调用链 0→9→6→1144，子程序 1144 的 opcode 522（`return{_$dH:_$_D,...}` 返回对象）后、**递归返回处理**卡住（wh=38 全局迭代停止）
- **环境补丁无效**（TextEncoder/BigInt/SharedArrayBuffer 等缺失 API 补充后仍死循环，missing=0）——**死循环是 VM 逻辑性的**，非缺 API

### 9.2 定位方法论（可复用）
1. **inspector 中断**：`inspector.Session` + `Debugger.enable` + 6s 后 `process._debugProcess(process.pid)`（SIGUSR1 强制中断）抓堆栈——但注意 **debugger 语句也会触发 paused**（293 个），需区分
2. **代码插桩**（patchDyn 选项，`output/keygen/sandbox_keygen.js` 内置）：
   - `_$ml` 函数体开头：`window.__tr.push(_$mB)`（子程序追踪）
   - 主 while：`window.__tk.push("k"+_$kK+"@"+(_$bj-1))`（opcode/PC 追踪）
   - trampoline：`window.__ke.push(_$kb[0])`（_$kE 子程序追踪）
   - 812 分支：`window.__ret812`（递归返回标记）
3. **关键发现**：`_$kK` 是 opcode，`_$bj` 是 PC（`_$eO[_$bj++]` 取指令），`_$eO=_$fW[1]` 是字节码数组（长度 2553）

### 9.3 教训
- **buildEnv 必须参数化站点**（location/UA/domain 曾写死 xj，nx 直接死循环——这是 57 首轮沙箱超时的真正根因）
- **nx 沙箱需要深度 VM 语义还原**（递归 dispatcher 的返回处理依赖环境值），工程量大于 jsdom/浏览器辅助方案——**纯算法 keys 的沙箱路径暂缓**
