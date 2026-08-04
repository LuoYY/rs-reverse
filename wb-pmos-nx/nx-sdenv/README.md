# nx-sdenv — nx 站点纯算法客户端（无浏览器）

## 概述

**纯 Node、无浏览器**的 nx（pmos.nx.sgcc.com.cn:10443）反爬绕过方案，全链路已验证：

```
GET 请求 5/5 稳定 200 ✅（本工作区实测）
POST 请求约 10% 成功率（受 WAF TLS 指纹检测限制，与 query 无关）
```

核心：用 **sdenv**（瑞数 VMP 专用补环境框架）在纯 Node 中执行瑞数外层 JS，
生成与浏览器等价的合法 O+P cookie；再用已攻克的纯算法生成 `MurR7rxG` query。

## 目录结构

```
nx-sdenv/
├── nx_client.js          # 主模块（init / get / post）
├── jsdom_keys_child.js   # 子进程：jsdom 数组陷阱提取 keys（隔离环境）
├── proxy_http.js         # 带超时的代理 helper（代理可环境变量覆盖）
├── demo.js               # 使用示例
├── verify.js             # 稳定性验证（5 轮 GET）
└── README.md             # 本文档
```

## 依赖

- **Node 22**（v22.22.0，sdenv/jsdom 需要）：
  ```bash
  export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"
  ```
- **sdenv**（本工作区已装 `/Users/luoyy/work/github/GitHub/rs-reverse_glm/node_modules/sdenv`）
- **HTTP 代理**（默认 `120.220.64.185:2018`，可用环境变量覆盖）

## 运行

```bash
cd /Users/luoyy/work/github/GitHub/rs-reverse_glm
export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"
NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_glm/node_modules \
NODE_OPTIONS=--dns-result-order=ipv4first \
node wb-pmos-nx/nx-sdenv/demo.js
```

输出（实测）：
```
[1] 初始化（sdenv 生成 cookie + keys）...
  cookie: 3RKyaeh47p90O=qawCodQMVscEGnkVTCE4N-9r7s...
  keys2: a1fb06f9   keys17: c7c2dd0b
[2] GET getGatewayConfig: 200 body.len=4360（真实业务数据）
[3] GET 重放: 200
[4] POST（⚠️ 成功率约 10%）
★★★ 结果: r1=200 r2=200
★★★★★ nx 纯算法客户端（无浏览器）GET 链路验证通过！
```

## API

```js
const nx = require('./nx_client');

// 一次性初始化：sdenv 生成 cookie + 提取 keys（约 10-20s，需代理）
const ctx = await nx.init({ log: console.log });
// ctx = { cookie, cookieO, cookieP, keys2, keys17, nsd }

// GET（复用 cookie，每次生成新 query，自动重试）
const r = await nx.get('/px-gateway/GatewayConfig/getGatewayConfig', ctx, {
  retries: 3,           // 默认 3 次重试
  timeout: 20000,
  log: console.log,
});

// POST（⚠️ 约 10% 成功率，TLS 指纹限制）
const r2 = await nx.post('/px-gateway/...', '{"key":"val"}', ctx, { retries: 3 });
```

## 代理配置

代理可用环境变量覆盖：

| 环境变量 | 默认值 |
|---|---|
| `NX_PROXY_HOST` | `120.220.64.185` |
| `NX_PROXY_PORT` | `2018` |
| `NX_PROXY_USER` | `ericshi` |
| `NX_PROXY_PASS` | `583315` |
| `NX_SDENV_PROXY` | `http://ericshi:583315@120.220.64.185:2018`（sdenv 加载页面用） |
| `NX_OUTER_JS` | 主工作区 `example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js` |

## 技术原理

### 1. Cookie 生成（sdenv 补环境）

手写沙箱跑瑞数内层 VM 卡在**环境检测分支**（`_$mD` 环境池构建依赖浏览器环境，如
`document.appendChild` 等）。sdenv 提供：
- **sdenv-jsdom**（针对瑞数检测修改的 jsdom）
- `browser(window, 'chrome')` 补全 Canvas/RTCPeerConnection/Worker/indexedDB 等检测点
- 固定随机数

→ 外层 JS 在 sdenv 中**自然执行**，生成合法 O+P cookie（过 WAF）。

### 2. Keys 提取（jsdom 数组陷阱）

`jsdom_keys_child.js` 用子进程（隔离环境）执行外层 JS，hook `Array.prototype.slice/map` 等
抓 16/48 字节全字节数组，按 shape 识别：
- **keys16**：出现次数最多的 16B（外层 cookie 密钥）
- **keys17**：后 8 字节 shape（t8[1]>=128, t8[4]∈2-7, t8[6]>=4, t8[7]>=2）
- **keys2**：出现次数最多的 48B（session_data）

### 3. Query 生成（纯算法）

```js
query = 'a' + numarr2string([
  CRC32(payload) 4B, ...payload
])
payload = [4, 0, 48, ...keys2, 32, ...requestData]
requestData = encryptMode1(plain24, numarrAddTime(keys17), 0)
plain24 = [keys2[0:8]^PREFIX_MASK, rand×5, rand×3, 183, rand×2, CRC32(URL.upper)]
```

## 已知限制

| 项目 | 状态 |
|---|---|
| GET 请求 | ✅ 5/5 稳定 200 |
| Cookie 复用 | ✅ 同 cookie 多次 GET |
| POST 请求 | ⚠️ 约 10%（WAF TLS 指纹检测，非 query 问题） |
| 每次请求 | 需代理（20-30s 一次 init） |

## 历史背景

- 手写沙箱跑内层 VM 已推进到：L0 死循环修复 → `_$k0` 纯函数验证 → 6 层 VM 架构映射
- 卡点：`_$iR` 递归编译产生错误操作符表（环境检测分支）
- sdenv 方案绕过该卡点（完整环境补丁），直接生成合法 cookie
