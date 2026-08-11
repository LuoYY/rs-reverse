# nx_gen_server.js — nx 本地生成服务（目标环境无 JS 能力）

## 背景
目标环境**完全无 JS 运行能力**，且 sdenv 生成的 cookie **~90s 过期**（实测 120s 失效）。
本服务在本地（Node 22 + sdenv）持续运行，每 60s 自动刷新会话（新 cookie + 新 keys），
目标环境（任意语言）通过 HTTP 获取该 URL 的完整请求参数后自行发请求。

## 架构
```
目标环境(无JS) ──HTTP──> 本地 nx_gen_server.js ──sdenv──> pmos.nx 挑战页
     │                          (每60s自动刷新)
     │<── { cookie, query, headers } ──┘
     └──用参数发请求──> pmos.nx API (GET)
```

## 启动
```bash
# Node 22 + sdenv（本工作区 node_modules 已装）
source ~/.nvm/nvm.sh && nvm use 22.22.0
NODE_TLS_REJECT_UNAUTHORIZED=0 NODE_OPTIONS=--dns-result-order=ipv4first \
  node nx_gen_server.js 9178
```

## 接口
| 接口 | 说明 |
|------|------|
| `GET /gen?url=/px-gateway/...` | 返回该 URL 的完整请求参数（见下） |
| `GET /gen?url=...&fresh=1` | **POST 专用**：强制新会话（P cookie 一次性） |
| `GET /status` | 会话状态（nsd/年龄/刷新失败数） |
| `GET /refresh` | 强制刷新会话 |

## GET vs POST 关键区别
- **GET**：cookie 可复用（同会话多次），每次 `/gen` 用当前会话生成新 query
- **POST**：**P cookie 一次性**（服务端消费，实测同 cookie 第 2 次 POST 412）。
  **必须 `fresh=1`**（每次强制新会话），实测 5/5 = 100%

`/gen` 返回：
```json
{
  "url": "https://pmos.nx.sgcc.com.cn:10443/px-gateway/...?<query>",
  "cookie": "<O=...; P=...>",
  "query": "<query 参数值>",
  "queryHeader": { "name": "MurR7rxG", "value": "<第二个 query>" },
  "headers": { "User-Agent": "...", "Accept": "...", "ClientTag": "...", ... },
  "session": { "nsd": 123, "ageMs": 5000 }
}
```

## 目标环境请求模板（GET）
```
GET <url> HTTP/1.1
Host: pmos.nx.sgcc.com.cn:10443
User-Agent: <headers.User-Agent>
Accept: application/json, text/plain, */*
Cookie: <cookie>
MurR7rxG: <queryHeader.value>
ClientTag: OUTNET_BROWSE
CurrentRoute: /outNet
Origin: https://pmos.nx.sgcc.com.cn:10443
Referer: https://pmos.nx.sgcc.com.cn:10443/
X-Ticket: undefined
X-Token: null
```

## 注意事项
- **GET 每次请求都调 `/gen`**（query 绑定请求，重复使用可能 412）
- **POST 必须 `fresh=1`**（P cookie 一次性）
- cookie 由服务自动刷新，目标环境无需关心有效期
- 代理：`nx_client.js` 用 `NX_SDENV_PROXY`（默认 http://ericshi:583315@120.221.249.98:2018），
  目标环境直连 pmos 被墙时需走代理

## 验证记录（2026-08-06）
- GET 复用会话 5/5 稳定 200（含 3 次自动刷新跨 140s）
- POST fresh 5/5 = 100%（每次新会话）
- cookie 时效：90s 有效 / 120s 失效
- **P cookie 一次性**：同会话第 1 次 POST 100%，第 2 次起 ~12% 失败（被服务端消费）
- init 耗时：~940ms（5/5 成功）
- keys2/keys17 每会话变化 → query 必须同会话 keys
