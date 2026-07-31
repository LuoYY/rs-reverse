# wb-qwen38 逆向分析文档

> 外部专家视角，2026-07-31 起

## 已确认事实

### 1. Query 结构（CRC32 验证 16/16 ✅，跨两个会话）
```
query_string = '0' + numarr2string(88_bytes, basestr)

88_bytes = [CRC32(4B, big-endian)] [1] [0] [48] [session_data(48B)] [32] [request_data(32B)]
            ↑ CRC32(bytes[4..87])    ↑版本 ↑类型  ↑长度前缀            ↑长度前缀
```

- **前 4 字节不是"随机 nonce"，是 CRC32 校验和**（大端序）
- 与外部文章完全吻合：`arr_4 = _$_f([], _$bo(arr_549))` = CRC32
- session_data (48B) 同会话固定，request_data (32B) 每请求变化
- 固定段 = bytes[4..55] (52B)，变化段 = bytes[0..3] + bytes[56..87]

### 2. 加密密钥排除（确定性证明）
- **PKCS7 padding 验证**：keys16/keys17 对 session_data/request_data 的 AES 解密，padding 全部无效（lastByte > 16）
- 遍历所有 cd keys 的 16B 子串（滑动窗口）：无有效 padding
- **结论：query 加密密钥不在 cd 静态解密结果中，由 JSVMP 运行时生成**

### 3. 管线函数验证
- encryptMode1/2 正确性 ✅（正向加密→反向解密完全匹配）
- keys16 解密 P cookie CRC32 通过 ✅（确认 cd keys 对 cookie 正确）
- numarrAddTime(keys17) 与 keys17 等价 ✅（getCfg 自动 strip）
- RS AES 使用标准 S-Box ✅（constData.js makeCfgnum 确认）

### 4. 排除的加密算法
| 算法 | 结果 | 说明 |
|------|------|------|
| AES-128-CBC/ECB (标准) | ❌ | PKCS7 padding 无效 |
| RS encryptMode2 | ❌ | 空输出或噪声 |
| XXTEA (delta=0x9E3779B9) | ❌ | ASCII < 63% |
| SHA-384/SHA-256 哈希 | ❌ | 无匹配 |
| XOR + 各种 key | ❌ | 噪声 |
| MD5/SHA1 派生 key + AES | ❌ | 噪声 |
| Cookie 派生 key | ❌ | 噪声 |

### 5. Send Hook VM 提取（CDP 实时提取 ✅）

#### 5.1 Trampoline 结构
```javascript
function _$fN() {  // send/open 共用名（不同函数对象）
  if (_$i2._$$4) {  // cache flag = 1
    // 缓存路径：复用 VM 状态
  } else {
    // 新建 VM 上下文
  }
  _$al(_$i2, 0, _$i2._$aA.length, args);  // VM dispatcher
  if (args[4] === 1) return args[5];       // exit code=1 → return value
}
```

#### 5.2 VM 配置
- `_$i2._$kK = 4` (scope size)
- `_$i2._$$4 = 1` (cache flag)
- `_$i2._$aA` = bytecode (77 元素: 74 数字 + 3 字符串)

#### 5.3 Bytecode 反汇编（77 元素）
```
PC  操作码                  说明
0:  VM_CALL(11,11,11,3)    调用子程序（初始化/检查）
5:  LOAD_SCOPE(1)          push arguments
6:  PROP_GET_STR("callee") push arguments.callee
9:  CALL_METHOD_1          调用方法
11: LOAD_THIS(25)          push this[25]
13: PROP_SET               设置属性
16: LOAD_SCOPE(2)          push scope_obj
18: JMP_IF_TRUE(→33)       条件跳转
20: LOAD_CLOSURE_2D(2,2)   push closure[2][2]
23-29: 全局/常量加载 + 方法调用
33: CALL_FUNC_1            调用函数
37: CALL_METHOD_0          调用方法()
40-51: 参数处理 + 属性设置
51: PROP_SET_STR("_$fF")   设置 XHR 实例属性
56: LOAD_SCOPE(0)          push this
57: PROP_GET_STR("_$$W")   push this["_$$W"]
60: JMP_IF_FALSE(→63)      守卫检查
62: EXIT_2                 ★ 中止（如果 _$$W 为 falsy）
63-75: 最终处理（加载全局/常量/this/arguments）
76: RETURN                 ★ 返回值
```

#### 5.4 关键发现
- **PC 56-62 守卫检查**：`this["_$$W"]` 为 falsy 时 EXIT_2（中止）
- **PC 51**：设置 `obj["_$fF"]`（XHR 实例上的 RS 属性）
- **子程序调用**（PC 0）：实际 query 生成逻辑在子程序中
- **SM2 常量**：闭包中发现 `SM2CipherMode.C1C2C3=0, C1C3C2=1`（国密算法）

#### 5.5 闭包数据
| 数组 | 大小 | 内容 |
|------|------|------|
| _$ez/_$cB/_$i3 | 209 | 常量池（含 AES/XXTEA/MD5/SHA1/CRC32 常数）|
| _$f2 | 86 | basestr 编码字符集 |
| _$kQ | 96 | 字符串表（"send","length","readyState"等）|
| _$$F/_$aT/_$jW | 909 | 变量名表 |
| _$lV/_$$m | 489 | 混合常量池（函数+字符串+数字）|
| _$kt | 256 | 字符映射表（base64 解码表）|
| _$dy/_$_8 | 4 | [3,4,19/20,22] 关键常量 |
| _$gL/_$gv/_$c6/_$is/_$_Z | 127 | 全 null（未初始化的查找表）|

### 6. 同会话 Query 样本（9 个）
- 所有 query 长度 119 字符
- 共同中间段：`lqWrjKjZSEPVCreKlxCYliW6OMXqbkfdN8ssledhd3LOKr3WWGi6.UXo8iDxu6K7nmBn`
- CRC32 验证 9/9 ✅

### 7. 完整操作码表（115 个，0-114）
- 完整 dispatcher 源码 8852 字符已提取（`captures/dispatcher_full.js`）
- 115 个操作码全部解码（`12_full_decode.js`）
- 含 11 个 _$cR 辅助操作码（嵌套目标解析）
- 关键操作码：VM_CALL(13), RETURN(34), EXIT_2(16), CALL_2_PUSH2(58), RESOLVE_STACK(60)

### 8. Send Hook 程序完整语义
```
[初始化] PC 0-13:  VM_CALL 子程序 + 设置闭包属性
[条件]   PC 14-30: 检查 scope[2]，条件初始化
[核心]   PC 33:    ★ CALL_FUNC_1 → 调用加密函数
[处理]   PC 34-54: 状态更新 + XHR body 处理 + 设置 _$fF
[守卫]   PC 55-62: 检查 this["_$$W"]，falsy 则 ABORT
[生成]   PC 63-74: ★ 加载 global[21] + global[65][5]，调用生成 query
[返回]   PC 76:    RETURN query 值
```

### 9. SM4/SM2 排除
- RS 闭包中**未找到 SM4 S-Box**（256 元素数组是字符映射表，非 S-Box）
- SM2CipherMode 常量来自**业务 app**（webpack 模块），非 RS
- 动态代码中不含 SM4 fk/ck 常量

## 核心突破（2026-07-31 完成）

### Query 加密算法完全破解
- **算法**: `encryptMode1(plaintext_24B, numarrAddTime(keys17), 0)` — 与 cookie 相同的 RS AES
- **密钥**: keys17（cd 解密获得），经 numarrAddTime 包装为 21B
- **验证**: encryptMode1 重新加密 3/3 完全匹配，encryptMode2 解密 3/3 完全正确
- **之前失败原因**: 跨会话测试（不同 nsd/cd 的 keys17 不同）

### 24 字节明文结构
```
[0-12]  会话标识 (13B)     — 同会话固定，来源待确认
[13-15] 请求随机数 (3B)    — 每请求变化（nonce）
[16]    常量 183 (1B)      — 跨会话固定
[17]    会话常量 (1B)      — 同会话固定，来源待确认
[18-19] 16位计数器 (2B)    — 每请求 +2，大端序
[20-23] CRC32(URL.toUpperCase()) (4B) — 大端序，7/7 验证 ✅
```

### Query 完整结构
```
query = '0' + numarr2string([CRC32(4B)] [1] [0] [48] [session_data(48B)] [32] [request_data(32B)])
request_data = encryptMode1(plaintext_24B, numarrAddTime(keys17), 0)
CRC32 = crc32(bytes[4..87]) 大端序
```

### 每次请求生成新 Cookie
- 3 次 encryptMode1 调用：cookie 内层(keys17) + cookie 外层(keys16) + query(keys17)
- 旧 cookie 仍有效（非一次性）

### 待解决
1. **session_data (48B)**: 同会话固定，keys16/keys17 均无法解密，生成机制未知
2. **bytes[0-12] 会话标识 (13B)**: 来源未知（可能是 cookie/session 的哈希）
3. **bytes[13-15] 请求随机数 (3B)**: 可能是随机 nonce
4. **byte[17] 会话常量**: 来源未知

### 纯算法 POST 可行路径
1. 从 412 页面获取 nsd/cd → 解密得到 keys17 ✅
2. 生成 cookie ✅（已 100%）
3. 获取 session_data + 会话标识（需从浏览器捕获或逆向生成逻辑）
4. 构造 24B 明文 → encryptMode1 → request_data ✅
5. 组装 88B query → numarr2string ✅

## 脚本索引
| 脚本 | 功能 | 结果 |
|------|------|------|
| 01_verify_structure.js | CRC32 + 结构验证 | **CRC32 7/7 ✅** |
| 02_rs_aes_decrypt.js | RS AES 解密（未初始化） | gv 初始化失败 |
| 03_rs_decrypt_v2.js | RS AES 解密（正确初始化） | 全部失败 |
| 04_hash_hypothesis.js | SHA/XXTEA/熵分析 | 全部失败 |
| 05_pipeline_reverse.js | 管线反向 + PKCS7 验证 | **padding 全部无效** |
| 06_cdp_live_extract.js | CDP 闭包提取 | **36 数组 + 1196 函数** |
| 07_extract_bytecode.js | Bytecode + dispatcher 提取 | **77 元素 bytecode ✅** |
| 08_disassemble.js | Bytecode 反汇编 | **完整反汇编 + CRC32 9/9 ✅** |
| 09_sm4_decrypt.js | SM4 国密解密测试 | SM4 验证通过，cd keys 解密失败 |
| 10_cdp_sm4_hunt.js | CDP SM4 常量搜索 | **SM4 S-Box 未在 RS 闭包中找到** |
| 11_full_dispatcher.js | 完整 dispatcher 提取 | **8852 字符 dispatcher ✅** |
| 12_full_decode.js | 完整操作码表 + 反汇编 | **115 操作码全部解码 ✅** |

## 捕获数据
- `captures/bytecode_1785482589363.json` — 完整 bytecode + dispatcher + 9 个 query
