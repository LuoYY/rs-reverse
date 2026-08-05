# nx basearr 方向 A 报告 v2（2026-08-05 深夜）

> 目标：纯算法生成 nx basearr（IoT 边缘设备 <64MB，不能跑 JS）。
> v2 重大突破：**base 纯算法重构链路 200 闭环 + 精确定位 WAF 校验段**。

## 一、base 纯算法重构链路（已验证 200）

```
解出 sdenv base → huffman(numarrEncrypt) → XOR keys2[0:16] → encryptMode1(keys17+r2mka)
→ 组装 nextarr → uuid(CRC32) → encryptMode1(keys16+r2mka) → O+P 配对 → API 200
```

### 两个隐藏 bug（412 根因，必须修复）
1. **nx nextarr 头是 `[4,8]`**，不是项目 Cookie.js `numarrJoin(2,...)` 的 `[2,8]`。
   正确组装：`[4, 8, ...r2mka4, ...start4, 48, ...keys2, lenHi|128, lenLo, ...be]`
2. **lenFlag 是 2 字节** `[128|(len>>8), len&255]`（项目只有 1 字节 hi）

### 外层规则
- 外层 runTime 用 **r2mka**（从 na[2:6] 解出）
- 外层密钥经 numarrAddTime reverse 后**恒为 keys16**（random 无关）
- **瑞数 uuid = CRC32(nextarr)**（与项目 uuid 一致）
- **cookie 头必须 O+P 配对 + 动态名**：`3RKyaeh47p90O=...; 3RKyaeh47p90P=<重构值>`
  （cookie 名动态如 `3RKyaeh47p90O/P`，P 值以 'a' 开头 + b86）

## 二、base 段性质（WAF 校验精确映射）

| 段 | 跨会话 | 改(+1)测试 | 保持huff长度 | 结论 |
|---|---|---|---|---|
| [0:23] | 恒定 | - | - | **固定头模板**（59 头 sdenv / 179 头浏览器） |
| [23:25] | 变 | 200 | - | **自由** |
| [25:68] | 恒定 | - | - | **环境编码模板**（43B 恒定） |
| [68:73] | 变 | 200 | - | **自由** |
| [73:78] | 变 | 200 | - | **自由** |
| **[78:90]** | 变 | 412 | **412** | **★ WAF 内容校验**（12B，必须精确生成） |
| [90:140] | 变 | 200(部分) | 长度敏感 | **自由**（保持 huffman 长度） |
| [140:146] | 变 | 200 | - | **自由** |
| **[146:152]** | 变 | 412 | **412** | **★ WAF 内容校验**（~6B，必须精确生成） |
| [152:] | 变 | 200(部分) | - | **自由** |

- **校验段 [78:90]+[146:152]**：跨会话内容不同但都 200（sdenv 生成），改任意字节 412
  → **服务器用 keys+环境重算比对**，内容必须精确匹配
- **其余段**：可模板（恒定段）+ 自由（变化段，保持 huffman 长度）
- base 长度动态（158-166B），huffman 输出 ~153B

## 三、纯算法剩余障碍（唯一）

**[78:90]+[146:152] = f(keys, 环境指纹) 生成公式**：
- 服务器用 cd 派生 keys + 环境编码重算这 18B，与 cookie 比对
- 跨会话变但精确校验 → 必须复现 f
- f 在内层 VM（dynCode 492KB，JSVMP 深度混淆）里
- 尝试反编译：dynCode 截获 ✓，`_$kZ`/`_$pg` 是环境检测字符串解码（非 basearr），
  base 用索引赋值构造（外部 hook 抓不到），变量名每次会话随机

## 四、反编译侦察记录（v1 结论）

- dynCode 经 `vm.runInContext` 执行（sdenv-jsdom），hook Node 全局 vm 可截获
- 外层 304KB（=静态外层 js `83bw0aTvAW7K.js`）+ 内层 VM 492KB
- huffman 不在内层 VM（无 total:1 树特征），在外层 js（混淆）
- cap(113头) 用 Array.push 构造可抓；base(59头) 用索引赋值构造（JSVMP 内部）
- **本地固定 challenge（127.0.0.1:8080, nsd=67402）+ sdenv 生成 179 头 base**
  （真实浏览器格式！[0:23] 恒定 + [44:72] 稳定段 + 动态段）
- 动态段含时间/随机/计数器因子（execNumberByTime 千万级）

## 五、结构二次解析（v2.1 决定性）

**base 几乎全部可模板化！**

| 段 | 位置 | 性质 |
|---|---|---|
| 固定头 | [0:23] | 恒定模板（59 头 sdenv / 179 头浏览器） |
| **动态段** | **[23:25]** | **仅 2B 变化**，改→200（自由！） |
| 环境编码 | [25:45] | 20B 恒定（#1/#2 共享） |
| 环境编码 | [45:70] | 25B 恒定 |
| 中间段 | [70:len-40] | **长度动态**（49-51B），段编码结构 |
| 固定尾 | [len-40:len] | 40B 恒定（#0/#1 完全一致） |

- 尾部 40B + [45:70] + [25:45] + [0:23] 跨会话恒定 → **可整体模板化**
- **[23:25] 动态且自由**（改→200）→ 可随机
- **中间段 [70:len-40] 是段编码（TLV）**：改 [78:90]→412 因破坏段边界/长度编码
  （跨会话 [78:90] 值不同但各自自洽 200，非内容校验）
- 长度动态（158-166B）来自中间段可变长字段

**纯算法 base = 固定模板 + [23:25]随机 + 中间段 TLV 编码**（需理解段结构）

## 六、数据与脚本

- 样本：`/tmp/nx_base_segments.json`（3 会话：nsd/base/r2mka/keys）
- 测试脚本：test_nx_base_segment_freedom.js（重构链路）、test_nx_bind_precise.js（段敏感性）、
  test_nx_bind_len.js（保持长度）、test_nx_orig_rebuild.js（原 be 重构）、
  test_nx_full_compare.js（na 对比）、test_nx_uuid_check.js（uuid=CRC32 验证）、
  collect_nx_base_segments.js（样本采集）
- 反编译：analyze_nx_dyn_vmhook.js（dynCode 截获）、analyze_nx_dyn_capture.js（多入口）
