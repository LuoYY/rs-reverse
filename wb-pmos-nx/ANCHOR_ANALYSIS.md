# nx 锚点反编译攻坚（ANCHOR_ANALYSIS）

> 目标：纯算法复现 nx basearr 锚点 15B（`[60][65][68][80][95][100][135][150][160]`）= f(会话)。
> 现状：base 纯算法重构链路已 200（见 FINDINGS_BASEARR_A/B），唯一障碍 = 锚点（内层 VM 生成）。
> 策略：**静态反编译内层 VM**（dynCode = JSVMP 解释器源码，492KB 已截获），还原 basearr 生成逻辑。
> **重大进展（2026-08-05）**：dynCode 结构完全解析 + aebi[1] 指令流完整反汇编 + opcode 执行流捕获（2220 条）+
> XOR 核心循环定位（= XOR keys2 实现）+ basearr 构造入口定位。详见「四、反编译成果」。

## 一、内层 VM 架构（dynCode 结构解析）

### 1.1 dynCode 全貌
- 文件：`anchor_analysis_files/nx_dynCode_captured_2.js`（492,707 字节，压缩单行）
- 本质：**IIFE 形式的 JSVMP 解释器**，执行后由外层 `$_ts` 驱动
- 结尾：`(function(_$$5,_$lP){...})($_ts.scj,$_ts.aebi)` — 输入 `scj` + `aebi`

### 1.2 输入数据（`$_ts`）
| 字段 | 值 | 含义 |
|---|---|---|
| `scj` | 对象（网络资源表 `{xmlhttprequest:0,img:2,...}` 等） | 内层 VM 配置/函数池 |
| `aebi` | 6 段程序：`[648, 2553, 2479, 431, 38, 7]` 长度数组 | **字节码程序流** |
| `aebi[1]` | 2553 个 opcode | **主程序流**（`_$bk`） |
| `cd` | base64 字符串 | 挑战页会话数据 |

### 1.3 关键执行组件
```
(function(_$$5,_$lP){        // _$$5=scj, _$lP=aebi
  ...1275 个函数池（_$lB/_$l$/...）→ 全部调 _$c4.apply(this,[ID,...args])
  function _$c4(_$cg,_$ez,_$pL,...){   // ★ 主 dispatcher
    _$pW=_$bk[_$g6++]                  // 取 opcode（_$bk = aebi[1]）
    if(_$pW<256){...} else if...       // 1299 个 opcode 分支
  }
  ...内层操作码 handler（_$$z/_$_y/_$ey/...，操作 _$_i 指令数组 + _$_u 常量取数）
  _$dJ(){_$hh=_$dp.pop(),_$g0=_$dp.pop();}  // ★ basearr 构造入口（栈弹出）
  _$dp=[],_$pH=new _$eQ(),...          // 运行时栈初始化
  if(_$_T)_$n3(...); else while(!_$hP(0))_$er(_$hr);  // ★ 主循环
  return{_$fo:_$pH,_$dE:_$hr,_$cZ:_$ou,_$jd:_$oF};
})($_ts.scj,$_ts.aebi)
```

### 1.4 表（已捕获于 `anchor_analysis_files/nx_vm_tables_init.json`）
| 表 | 长度 | 内容 | 来源 |
|---|---|---|---|
| `_$k0` | 423 | 数字常量池（cp2，含 2654435769/-0.01/4294967295） | cd 派生 |
| `_$oU` | 196 | 字符串常量池（`pop`/`push`/`slice`/... 属性名） | 静态 |
| `_$b1` | 196 | 字符串常量池 2 | 静态 |
| `_$lc` | 196 | 字符串常量池 3 | 静态 |
| `_$mD` | 626 | 环境池（fn:_$aq/floor/12.5/obj...） | 环境+cd |
| `_$bk` | 2553 | **= aebi[1] 主程序流（opcode 序列）** | aebi |
| `_$ez` | 1532 数组/45115 字符串 | 编码数据（`_$mP=_$nP(_$ez)` 生成表） | cd/cp |

### 1.5 栈语义
- `_$dp` = **运行时栈**（不是函数池！）：`_$oU[18]`="push"，`_$oU[103]`="pop"
- `_$dJ(){_$hh=_$dp.pop(),_$g0=_$dp.pop();}` — 从栈弹两个值赋给 VM 工作对象 `_$hh`/`_$g0`
- `_$fc(){_$dp.push(_$hh),_$hh=new _$eQ(_$hh);}` — 压栈 + 拷贝
- `_$_z(){_$dp.push(_$g0),_$dp.push(_$hh),_$g0=new _$eQ(_$g0),_$hh=_$g0;}`
- `_$eQ` = VM 值对象：`{_$ky:{},_$ph:{},_$hq:[],_$eE:父,_$nr:根}`（属性表+子对象+父链+根）

## 二、反编译路线图

### 2.1 已完成的侦察
- ✅ dynCode 截获（vm.runInContext hook）
- ✅ 输入数据结构（scj/aebi/cd/tsKeys）
- ✅ 主 dispatcher 定位（`_$c4` @266824，1299 opcode 分支）
- ✅ basearr 构造入口定位（`_$dJ`，栈弹出）
- ✅ 常量池表捕获（tables_init.json）
- ⚠️ opcode 语义逐个还原（进行中，1299 分支）
- ⚠️ aebi[1] 程序流反汇编（进行中）
- ❌ 锚点字段写入指令定位（未开始）

### 2.2 反编译流程
1. **opcode 语义表**：逐个分析 `_$c4` 的 `_$pW===N` 分支体，提取每个 opcode 的语义（压栈/弹栈/跳转/属性读写/函数调用/环境读取）
2. **程序流反汇编**：`_$bk`(aebi[1]) 2553 条指令 → 伪代码（含 `_$g6` PC 跳转）
3. **basearr 生成还原**：识别 `_$dJ` 入口到输出 `_$fo` 之间的指令，定位锚点字段（[60][65][68][80][95][100][135][150][160]）的写入点
4. **锚点算法提取**：f(O/cd/keys/环境) → Go 纯算法实现

### 2.3 验证手段
- 对比真实 base（59 头 sdenv / 179 头浏览器）与反编译推演输出
- 修改锚点字节 → 412（内容校验）证明锚点是 f(会话) 非随机
- 反编译出算法后用 Node 复现 → 与真实锚点逐字节比对

## 三、已有工具/数据

| 资源 | 路径 |
|---|---|
| dynCode（内层 VM 源码） | `anchor_analysis_files/nx_dynCode_captured_2.js`（等价 `anchor_analysis_files/nx_vm_body.js`） |
| VM 输入（scj/aebi/cd） | `anchor_analysis_files/nx_vm_inputs2.json`、`anchor_analysis_files/nx_vm_inputs.json`（含 evalCode） |
| VM 常量表 | `anchor_analysis_files/nx_vm_tables_init.json`（_$k0/_$oU/_$b1/_$lc/_$mD/_$bk/_$ez） |
| op6 状态 | `anchor_analysis_files/nx_op6_state.json`（_$ez=45115 字符串） |
| 分析脚本 | `analyze_c4_opcodes.js`（opcode 分支提取）、`analyze_dp_pool.js`（栈分析）、`analyze_er_loop.js`（主循环） |
| 基线数据 | `anchor_analysis_files/nx_o_base_pairs.json`、`anchor_analysis_files/nx_base_segments.json` |

## 四、反编译成果（2026-08-05 重大突破）

### 4.1 多层 VM 架构完全解析
```
dynCode = (function(_$$5,_$lP){...})($_ts.scj,$_ts.aebi)   // scj=配置表, aebi=6段字节码
  ├── _$c4: 主 dispatcher（1299 opcode 分支，0-1731 值域）
  │         _$pW=_$bk[_$g6++] 取指令, _$bk=aebi[1] (2553条), _$g6=PC
  │         - opcode 语义树完整提取（anchor_analysis_files/nx_op_semantics.json）
  │         - aebi[1] 完整反汇编（anchor_analysis_files/nx_aebi_disasm.txt 2553 行）
  │         - 实际执行流捕获（anchor_analysis_files/nx_stream_trace.json 2220 条）
  ├── _$hF: 嵌套 dispatcher（子程序池，75 个 ID 36-2551）
  ├── _$$l: 更深层 dispatcher
  ├── _$c1: 小 VM（执行 aebi[4] 38 条）
  ├── _$jx: 最内层 VM（执行 aebi[5] 7 条）
  └── tail handlers: _$b2/_$dX/_$fp/_$_y/_$ey/_$$z（内层指令操作 _$_i 数组）
```

### 4.2 basearr 构造入口（aebi[1] 反汇编关键段）
```
pc=0   : _$kB=window['$_ts']                    // 读全局 $_ts
pc=1   : _$iH=_$kB.cp                           // cp 数据
pc=2-4 : _$c4(9,cp[0]), _$c4(6,cp[2]), bJ=nP(cp[6])  // 生成常量表
pc=6   : _$k0=_$nP(_$ez)                        // ★ 常量池 k0 生成（cp 派生）
pc=7   : for(kB=0;kB<k0.length;kB++)k0[kB]=Number(k0[kB])
pc=9-31: _$mP=nP(ez) → 分块196 → oU/b1/lC/$$M/f$/ll/_$L/$$q/_3/mV/eZ/da/j1/fR/po/$$C 赋值
pc=38  : _$kB=[0,1,k0[15],k0[38],k0[6],k0[11],k0[47],k0[51]]  // =[0,1,2,3,4,5,6,7] huffman长度表!
pc=39-44: b2(kB), dX(kB), fp(kB), _y(kB), ey(kB)   // 5 个 handler 处理
```

### 4.3 ★ XOR 核心循环（op610 else = XOR keys2 实现）
```js
// opcode 610 的 else 分支：
else{ for(_$$A=0;_$$A<_$k0[50];_$$A++ ,_$kB++ ){ _$ez[_$kB]^=_$pL[_$$A]; } }
// _$k0[50]=8 → for(A=0;A<8;A++,kB++){ ez[kB]^=pL[A] }  ← XOR 8 字节
// _$pL = keys2（48B）, _$ez = 待解密数据
// 执行流 pc=1583-1586 循环 192 次：op737(初始化)→op405(kB<iH)→op1493(条件跳)→op378(g6-4)
```

### 4.4 常量池 ↔ base 头字节对应
```
_$k0[0]=59  → sdenv base[0]=59 ✓
_$k0[43]=120 → base[3]=120 ✓（实际索引待核对）
pc38 数组 [0,1,2,3,4,5,6,7] = huffman 长度/索引表
```

### 4.5 已确认的插桩/捕获能力
- **jsdom 环境可运行 dynCode 并插桩**（Proxy eval / vm.runInContext hook）
- `_$kZ`（hex 解码器）被调 561 次 = 环境检测字符串解码（"class"/"form"/"maxT"）
- 主循环 opcode 流可实时捕获（2220 条，含 PC）
- tail handlers 输入已捕获（_$b2=[12,1,2,3,2,5,6,7] 等）
- **陷阱**：`_$dp=[]` 初始化在 `_$nq`（JS 解析器）函数内，主路径不经过
  （basearr 不走 `_$nq`/`_$er`/`_$dJ`，由 `_$c4` dispatcher 直接构造）

### 4.6 ★ 环境检测编码段定位（锚点硬编码关键）
- `_$kZ` 561 次调用全部为**环境检测字符串解码**：
  `class`(465次)/`form`/`maxT`/`eFlash.ShockwaveFlash`/`Crosswalk`/`WebXMLog`/
  `OffscreenCanvas`/`getFrameLocation`/`CefSharp`/`Gamepad`/`_sd`/`//html` 等
  → 浏览器指纹特征检测（自动化工具/headless/UA 特征）
- **同环境（sdenv 固定 127.0.0.1:8080）跨 cd 对比**（样本 #0 nsd=80110 vs #2 nsd=76898）：
  - ✅ **固定段 [27:67]（41B，含锚点 [60][65]）= 环境检测编码 → 可硬编码模板**
  - ✅ [0:22] 固定头 + [69:71] + [85] + [114] 固定
  - ❌ [22:29] 会话段 + [68:73] env73 = **f(cd)**（跨 cd 变，需内层 VM）
  - ⚠️ [110:137] 变体区：内容环境固定但**长度前缀偏移 2B**（#2 多 `22,125`）
- **锚点归属**：`[60][65]` 环境固定可模板；`[68][80][95][100][135][150][160]` f(cd)/f(环境)

### 4.7 XOR 核心循环状态（jsdom 插桩实捕）
```
pc=1582 op737: kB=0, iH=ez.len - ez.len%8     // ez 是数组/数字字符串（1528 长）
pc=1583 op405: oJ = (kB < iH)                  // 外层循环条件
pc=1584 op1493: if(!oJ) g6+=2                  // 跳出
pc=1585 op611: for(A=0;A<8;A++,kB++){ ez[kB]^=pL[A] }  // XOR 8 字节
pc=1586 op378: g6+=-4                          // 回跳
// 实测: ez 初始 [51,54,53,52,7,51,51,55,74,219,103,9,...]（iH=1528）
//       pL 恒定 [0,52,3,0,5,5,7,7]（8B 密钥，非 keys2/keys17）
//       XOR 后: [51,2,54,52,2,54,52,48,74,239,100,9,...]
//       → 前 8 字节是 ASCII 数字字符串（"36547..."），XOR 后仍数字字符
// 结论: XOR 循环 = numarrEncrypt（nextarr 数据段）的字符级加解密，
//       basearr [22:29] f(cd) 段在 dispatcher 其他指令中由 _$k0（cd 派生）生成
```

### 4.8 ★ f(cd) 段链路（base[22:29] 来源确认）
- **base[22:29] = [201,142,142,179,16,0,213] 全部能在 `_$k0` 精确定位**：
  `201=k0[144], 142=k0[126], 179=k0[68], 16=k0[2], 0=k0[203], 213=k0[278]`
- `_$k0` 由 cd 派生（aebi pc=6: `k0=nP(ez)`，ez 来自 cd 解码）
- 链路：`cd → 解码(1717B) → ez → nP → _$k0(423元素) → dispatcher 选索引 → base[22:29]`
- **待解**：dispatcher 如何从 cd/cp 选择 k0 索引序列（aebi[1] 指令流中）
- `_$mD`(626元素) = 环境函数池（`fn:floor`/`obj:Array`/`obj:Window` 等标记）→ base[27:67] 环境段来源

### 4.9 ★★★ sdenv 真实代理决定性验证（17+ 会话跨 cd）★★★
- **完整采集链路打通**（collect_final_working.js / collect_many.js）：sdenv 真实代理 →
  poll 捕获 `$_ts`(nsd/cd) → deriveKeys(cd) 纯计算（deriveOffsetNx+genKeysSim 移植自 Go）→
  P cookie 解 base（dB64 用 NX_BS 前 64 字符，P 字符集是其子集）→ 成功
- **环境模板 4+ 组**（10 样本实测）：`247,164`(3个) / `163,137`(4个) / `108,214` / `125,176`
  → 环境检测含随机/时间因子（execNumberByTime），多套合法模板任选
- **huffman 总 bits = 1217 恒定**（所有样本长度 159-165 均 1217！）= WAF 硬约束
- **段自由性（实测 buildCookie + API 逐段替换）**：
  - 原样重构 → **200** ✓
  - 改[22]/[26]/[68] 单字节 → **200**（自由）
  - 改[22]+[23] → **200**（自由）
  - 模板([0:22]+[25]+[28:71]+[73]+[108]) + 其他样本自由段值 → **200** ✓✓✓
    （**证明 base 不需要内层 VM！= 模板 + 结构化自由段**）
  - 替换[68:73] → 200（自由）；替换[60][65] → 412（环境配对校验）
  - 改[22:26]全 / 换完整 base → 412/400（段边界/业务绑定）
  - 全随机自由段 → 400/412（长度/bits 变化）
- **400 vs 412 判定**：400 = WAF 通过+业务绑定失败；412 = WAF 校验失败
- **最终结论（纯算法达成路径）**：
  - **base = 固定模板段（[0:22]+[25]+[28:71]+[73]+[108]）+ 结构化自由段**
  - 自由段 = [22:27]+[68]+[72]+[74:107]+[109:160]（保持 huffman bits=1217 + 段边界）
  - 锚点 [22:29] **非 f(cd) 内容校验**（逐字节改 200），是**段编码结构**（保持 bits 即可）
  - **无需内层 VM 反编译即可生成合法 base**（模板+采样自由段）
- **跨会话 400（业务绑定）**：同会话改自由段→200，跨会话复用 base→400（业务层）。
  绑定字段在"看似恒定的模板段"或 keys2 派生段（非 WAF 校验）。
  遗留：精确定位业务绑定字段（链路交付阶段事项，非锚点反编译范围）
- **数据**：anchor_analysis_files/nx_anchor_fw.json（4）、anchor_analysis_files/nx_k0_base.json（3）、anchor_analysis_files/nx_many_samples.json（10）

## 五、关键理解（防误入歧途）

1. **`_$dp` 是栈不是函数池**（`_$oU[18]`=push、`_$oU[103]`=pop），`_$dJ` 从栈弹出 basearr 对象
2. **`_$c4` 是主 dispatcher**：`_$pW=_$bk[_$g6++]`，`_$bk`=aebi[1]，`_$g6` 是 PC（可跳转 ±）
3. **内层 VM 实际执行 `scj`+`aebi`**，basearr 是执行产物（非 scj 静态数据）
4. **1299 个 opcode 分支**（0-1730 范围），已全部提取语义 + aebi[1] 反汇编
5. **aebi[1] 是函数 ID 调用流**（非纯数据流），每个 opcode 对应 `_$c4` 内一个 JS 动作
6. **dynCode 文本固定**（本地固定 challenge nsd=67402 逐字节一致）→ 可静态插桩反编译
7. **XOR 循环 = numarrEncrypt 加解密**（k0[50]=8，8 字节块，pL=[0,52,3,0,5,5,7,7]）
8. 瑞数 uuid=CRC32、lenFlag 2 字节、nextarr 头 [4,8] —— 已在前置链路解决（不属本文件）

## 六、反编译状态与下一步

### 已完成
- ✅ dynCode 多层 VM 架构（_$c4→_$hF→_$$l→_$c1→_$jx，aebi 6 段对应）
- ✅ aebi[1] 2553 条指令完整反汇编（`anchor_analysis_files/nx_aebi_disasm_full.txt`）
- ✅ opcode 语义树 1732 全覆盖（`anchor_analysis_files/nx_op_semantics_full.json`）
- ✅ opcode 执行流捕获（2220 条，`anchor_analysis_files/nx_stream_trace.json`）
- ✅ XOR 循环状态实捕（ez 数字字符串 + pL 8B 密钥）
- ✅ 环境检测字符串全集（`_$kZ` 561 次：class/form/maxT/Crosswalk/...）
- ✅ 锚点归属：[27:67] 环境固定可模板、[22:29]+[68:73] f(cd)
- ✅ f(cd) 链路：cd→解码→ez→nP→_$k0→base[22:29]（索引已定位）

### 待解（锚点最后一层）
1. **`_$k0` 索引选择算法**：dispatcher 如何从 cd/cp 选出 base[22:29] 对应的 k0 索引序列
   （[144,126,126,68,2,203,278]）→ 需符号执行 aebi[1] 前段指令
2. **[68:73] env73 = f(cd)**：同环境跨 cd 变，19 种模式 → 需 VM 反编译或模板+校验
3. **符号执行器**：用 opcode 语义树 + aebi[1] 指令流 + 常量表重建 `_$c4` 执行
   → 输出 base[22:29] 生成公式（纯算法目标）
4. 验证：反编译出的公式 → Node 复现 → 与真实 base 锚点逐字节比对
