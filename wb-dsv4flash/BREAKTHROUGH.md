# 🔥 纯算法 query 参数生成 — 完全破解（2026-07-31）

## 一句话结论

**瑞数 VMP 的 query 参数（`r20SZOQm`）已可用纯 Node 算法生成，服务器 100% 接受**。
这是自项目启动以来首次在不依赖浏览器/CDP/沙箱的前提下，端到端生成通过服务器校验的 query。

验证结果：3 轮会话 × 6 请求（3 URL × 2 方法）= **18/18 全部 200**。

## 完整算法

### query 结构（88 字节 → 119 字符）

```
query = '0' + numarr2string(88B, basestr)

88B = [CRC32(4B)] [1] [0] [48] [session_data 48B] [32] [request_data 32B]

CRC32        = crc32b(88B[4..88])    // 大端 4 字节
session_data = keys[2]（48B，cd 派生，原始明文，非加密！）
request_data = encryptMode1(plain24, queryKey21, flag=0)
```

### queryKey（21 字节，逐请求变化）

```
queryKey = numarrAddTime(keys17, unixTime, random)[0]
         = [keys17^ele × 16][time4^ele][ele]
ele = ceil(random*256)  // 任意随机
```

### plain24（24 字节明文）

```
plain24 = [
  keys2[0]^0x0b, keys2[1]^0x16, keys2[2],   keys2[3]^0x10,
  keys2[4],      keys2[5]^0x31, keys2[6],   keys2[7]^0x01,   // ★ 8B 服务器校验
  rand × 5,                    // bytes 8-12 不校验（任意）
  rand × 3,                    // bytes 13-15 time 不校验
  0xb7, rand × 2,              // bytes 16-18 不校验
  rand,                        // byte 19 counter 不校验
  CRC32(url.toUpperCase())     // bytes 20-23 服务器校验！
]
```

### 站点固定掩码（服务器校验 prefix[0..7]）

`PREFIX_MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01]`

跨 5 个会话验证恒定。掩码为 0 的位置（2/4/6）即 keys2 原字节。

## 关键事实（本次逆向确认）

| # | 事实 | 证据 |
|---|---|---|
| 1 | **session_data = keys[2] 原始 48B**，非加密 | 浏览器 keys30[2] == query session 段逐字节相等（3 会话） |
| 2 | **queryKey = numarrAddTime(keys17)** | [165] 密钥反推 base16 == keys30[17]；encryptMode1 复现密文 3/3 |
| 3 | **request_data = encryptMode1(plain24, key, 0)** | [165] 断点/挂钩捕获 `arr[24]→arr[32]`，结果 == query request 段 |
| 4 | **服务器校验范围**：prefix[0..7] + url_crc(4B) + 88B CRC32 | 逐字节修改测试：prefix[0-7]/url_crc 改→400，其余→200 |
| 5 | **prefix[8..12] / time / counter / const3 不校验** | 修改任意→200（反重放靠相同 request_data 去重，随机字节天然防重放） |
| 6 | **url_crc = CRC32(url.toUpperCase())** | 4 URL × 4/4 匹配 |
| 7 | **cookie 与 query 共用管线**（keys2/keys17 + encryptMode1 + basestr + CRC32） | 同一会话可同时生成有效 cookie 与 query |
| 8 | query 参数名 = keys[7].split(';')[1]（会话相关，本会话 r20SZOQm） | 管线直接获取 |

## 为什么之前失败

历史上所有"用管线 keys 解密 query"的尝试都失败了，因为：
1. **把 session_data 当加密数据**——它其实是 keys[2] 原始明文
2. **用 keys16/keys17 直接解 request_data**——密钥其实是 `numarrAddTime(keys17)`（21B 带 time/ele）
3. **没搞清服务器校验范围**——误以为全部 13B 前缀都要精确复现

## 端到端流程（纯 Node）

```
1. GET / → 412 挑战页 → $_ts.nsd/cd + O cookie
2. runOuterVM(nsd, cd) → cp3
3. 管线 Coder + Cookie → keys2/keys17 + P cookie（100% 有效，重放 200）
4. session_data = keys2（48B 原样）
5. queryKey = numarrAddTime(keys17, now, random)[0]
6. plain24 = [keys2^mask 8B][随机 5B][随机 3B][0xb7+随机 2B][随机 1B][CRC32(url.toUpperCase())]
7. request_data = encryptMode1(plain24, queryKey, 0)
8. 88B = [CRC32][1][0][48][keys2][32][request_data]
9. query = '0' + numarr2string(88B, basestr)
10. POST/GET: url?<paramName>=<query>，带 O+P cookie → 200
```

## 产物

- `pure_query_gen.js` — 单会话端到端生成器（挑战→cookie→query→请求）
- `stress_test.js` — 同会话多请求压力测试
- `captures/` — 所有分析数据（断点 dump、加密日志、明文结构）

## 遗留/注意事项

- `PREFIX_MASK` 为站点常量，跨 5 会话恒定；若目标部署（443）或未来版本变更需重新验证
- 管线 cd→keys 对浏览器捕获的 cd 不匹配（管线用自己拉取的挑战 cd，100% 有效）——已通过"管线自建会话"规避，不影响本方案
- 同会话内连续请求需重新生成 query（每次随机字节 + 新 key），服务器按"相同 request_data"去重
