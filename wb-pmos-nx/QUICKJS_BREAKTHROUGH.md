# quickjs 引擎突破记录（nx 纯算法 keys 攻坚）

> 时间：2026-08-01 深夜
> 目标：用 quickjs-emscripten（非 V8 引擎）跑通 nx 外层 VM + 动态代码，生成 cookie keys
> 状态：**V8 的 `_$ml` return 卡已解决（确认是 V8 特定），环境检测链基本攻破（winMiss 空），剩余早期 `_$ne` 跳转连锁**

---

## 1. 背景：为什么换引擎

### V8 沙箱的死结
- nx 外层 VM 在 V8（Node vm）沙箱中能完整执行（eval 动态代码 492908）
- 但动态代码的 `_$ml`（225KB 大函数）**return 卡死**（wh 停 38，return 语句执行但函数不返回）
- 系统性排除：return 1 也卡 / 827KB while 大函数递归正常 / Proxy 返回正常 / `--stack-size` / `--no-opt` / `--jitless` / Node 18/22 / debugger 替换 / break 绕过——**全部无效**
- 结论：**V8 对 225KB 特殊函数（32 层 try/finally + 深层 if 树 + 递归）的 return 有未知边缘行为**

### quickjs 的价值
- quickjs-emscripten 是不同 JS 引擎（QuickJS）——**`_$ml` return 正常**（38 次迭代后正常返回）
- 验证了"`_$ml` return 卡 = V8 特定"的核心假设

---

## 2. quickjs 环境搭建（有效步骤）

### 2.1 安装
```bash
npm install quickjs-emscripten --no-save
```

### 2.2 核心 API
```js
const { getQuickJS } = require('quickjs-emscripten');
const QJ = await getQuickJS();
const vm = QJ.newContext();
vm.evalCode(code, 'file.js');        // 执行 JS（返回 {value, error}）
vm.runtime.executePendingJobs();     // 执行 Promise 微任务
vm.runtime.setInterruptHandler(fn);  // 执行超时中断（fn 返回 true 中断）
vm.dump(handle);                     // 取 JS 值
```

### 2.3 三层环境构建（按顺序）
1. **宿主 handle 层**（`sp()` 自动转换）——document/navigator/location/screen/performance/XHR/fetch/setTimeout 等
2. **vm 内 evalCode 层**——`window = globalThis`、Z8XHJJY、chrome、自动化特征 undefined、history/storage/标准 API
3. **环境值对齐层**——对照 V8 buildEnv（已验证 `_$g7` 通过）逐项对齐 navigator/document/screen 的具体值

---

## 3. 关键工程技巧（踩坑后沉淀）

### 3.1 ★ setProp 传原始值 = 全变 0（最大坑）
```js
// ❌ 错误：原始 JS 值被当 handle 解析失败 → 全变 0
vm.setProp(obj, 'readyState', 'complete');   // → 0
vm.setProp(obj, 'nsd', 129339);              // → 0
vm.setProp(obj, 'cd', cd);                   // → 空（导致外层 JS if($_ts.cd) 为 false！）

// ✅ 正确：必须传 handle
vm.setProp(obj, 'readyState', vm.newString('complete'));
vm.setProp(obj, 'nsd', vm.newNumber(129339));

// ✅ 封装 sp() 自动转换
const sp = (obj, name, val) => {
  let h;
  if (typeof val === 'string') h = vm.newString(val);
  else if (typeof val === 'number') h = vm.newNumber(val);
  else if (typeof val === 'boolean') { const r = vm.evalCode(val ? 'true' : 'false'); h = r.value; }
  else h = val;
  vm['setProp'](obj, name, h);
  return h;
};
```
**影响**：这导致初次运行时 `$_ts.cd` 为空 → 外层 JS `if($_ts.cd)` 直接返回 → 什么都执行。修好后外层 JS 完整执行。

### 3.2 ★ window 必须 = globalThis
- 瑞数检测 `var x` 与 `window.x` 一致性
- quickjs 里 window（独立对象）≠ 全局作用域 → 检测失败 → 外层 JS 直接返回
- 修复：`vm.evalCode('window = globalThis; self = globalThis; ...')` + 把环境属性复制到 vm.global

### 3.3 Promise 微任务需手动执行
- quickjs 的 Promise resolve 后，then 回调在 microtask——`vm.evalCode` 同步返回不执行
- 必须：`vm.runtime.executePendingJobs()`（检查 `vm.runtime.hasPendingJob()`）
- 影响：fetch stub 返回 Promise 后，外层 JS 的异步链（fetch→then→eval 动态代码）依赖此

### 3.4 执行超时用 setInterruptHandler
```js
vm.runtime.setInterruptHandler(() => Date.now() - execStart > 12000 ? true : false);
```
- 不用 `vm.evalCode` 的 timeout（vm 内 eval 无超时）
- interrupted 错误：`{name:'InternalError', message:'interrupted', stack}`

### 3.5 handle 泄漏 Aborted
- quickjs-emscripten 的 `vm.dispose()` 若 handle 未释放 → `Aborted(Assertion failed: list_empty(&rt->gc_obj_list))`
- 规避：不 dispose，直接 `process.exit(0)`

### 3.6 其它 API 坑
- 无 `vm.newBool`（用 `vm.evalCode('true').value`）
- 无 `vm.executePendingJobs`（在 `vm.runtime` 上）
- fetch 不要用 `vm.newPromise` 不 resolve（泄漏）

---

## 4. 环境检测链攻破过程

### 4.1 外层 JS 触发动态代码（三层障碍）
1. `$_ts.cd` 必须非空（setProp handle 修复）
2. window 与全局一致性（globalThis 修复）
3. Promise 微任务（executePendingJobs 修复）

### 4.2 动态代码环境检测（`_$g7` 体系）
- `_$g7` 由 dispatcher #3 的几十个 opcode 累积设置（环境检测结果）
- 方法：插桩 `_$e$=window` → `__mkWin()` Proxy（记录 window 缺失属性）
- **winMiss 从 10+ 项缩到 1 项**：
  - 补齐 indexedDB/BroadcastChannel/caches/PerformanceObserver/WebSocket 到 globalThis
  - 显式声明标准内建：`window.Date = Date; window.Error = Error; ...`（避免 Proxy 假象）
  - 最终只剩 globalStorage（IE 专属，浏览器也 undefined，正常）

### 4.3 dispatcher #3 死循环定位（21-opcode 循环）
- 插桩 `while(1){_$k7=_$pb[_$ne++];` 记录 opcode 序列 → 发现循环周期：
  `126,158,333,92,295,216,58,243,307,176,298,127,33,148,47,160,134,99,305,155,52`
- 反汇编跳转 opcode：
  - op126: `!_$g7?_$ne+=-51`（g7 false → 回跳 51 → 循环）
  - op33: `!_$g7?_$ne+=-103`（g7 false → 回跳 103）
- **循环退出条件 = op52 的 g7**：`_$g7=(_$l5[47]||(_$mM&&_$l5[7]))&& !_$ak`
- quickjs 里 `_$l5[47]=false`（op334 未执行）、`_$mM=false`（未设）、`_$ak=true` → g7=false → 死循环
- **根因**：早期 `_$ne` 跳转连锁——某早期 opcode 环境差异 → `_$ne` 跳走 → 后续 op334/op281 从未执行 → `_$l5[47]`/`_$mM` 未设

### 4.4 插桩污染警告
- window 自定义属性（`window.__wN`）被瑞数检测 → 触发反检测（w3 死循环）
- console.log 插桩也被检测
- **插桩必须用 IIFE 局部变量**（不污染 window），或诊断时接受污染（已死循环状态）
- **插桩本身改变执行路径**（死循环位置漂移 254142→257652→258754→170813）

---

## 5. 踩坑经验汇总

| # | 坑 | 现象 | 解决 |
|---|---|---|---|
| 1 | setProp 传原始值 | 所有环境值变 0/空（`$_ts.cd` 空） | sp() 自动转 handle |
| 2 | window ≠ globalThis | 外层 JS 直接返回 | window=globalThis |
| 3 | Promise 微任务不执行 | 外层 JS 异步链断裂 | executePendingJobs() |
| 4 | handle 泄漏 | vm.dispose() Aborted | 不 dispose 直接退出 |
| 5 | 插桩污染 window | 瑞数检测 → 反检测死循环 | IIFE 局部变量插桩 |
| 6 | console.log 插桩 | 同样触发检测 | 避免 |
| 7 | 插桩改执行路径 | 死循环位置漂移 | 诊断时接受，定位用 |
| 8 | CZ_LONG 误判 | `_$cz` 处理 45115 字符字符串是正常解码 | 非卡点，移除检测 |
| 9 | for 单语句插桩 | 加 `{` 破坏语法 | 只插桩函数头 |
| 10 | 插桩替换带多余 `}` | `else` 语法错误 | 替换文本不带结尾 `}`（原 `}` 保留） |

---

## 6. 当前状态与下一步

### 已确认
- ✅ quickjs 完整执行外层 JS + eval 动态代码 492908
- ✅ `_$ml` return 卡是 V8 特定（quickjs 正常）
- ✅ 环境检测链基本攻破（winMiss 空）
- ❌ dispatcher #3 早期 `_$ne` 跳转连锁（`_$l5[47]`/`_$mM` 未设）

### 下一步
1. **插桩读取 `_$pb` 字节码数组**（dispatcher #3 的 444+ opcode）——保存到宿主
2. **静态反汇编**：追踪 `_$ne` 从 PC 0 到循环的完整路径
3. 定位**第一个跳转差异点**（早期环境值）——一次性修正环境（不是 patch 循环）
4. g7 链全通过 → 动态代码完整执行 → cookie 生成 → 纯算法 keys

### 可复用文件
- `wb-pmos-nx/93_quickjs_sandbox.js`：quickjs 沙箱主脚本（三层环境 + 插桩）
- `output/keygen/sandbox_keygen.js`：V8 沙箱（Proxy eval 解决 eval 检测）

---

## ★★★★★ 重大转折：`_$ml` 执行不是必需的（08-01 深夜11）

### 决定性发现：cp3 = checksum(dynCode)（不需要执行 `_$ml`）
- `extract_dyncode_20080.js` 的 `runOuterVM`：`cp3: dynCode ? checksum(dynCode) : null`
- **cp3（cfgnum）只需 eval 捕获动态代码字符串后计算 checksum**——**完全不需要执行内层 VM（`_$ml`）**
- nx 实测：`runOuterVM` → `cp3=364306, dynLen=492908`（eval 捕获成功，不执行）
- **这意味着：沙箱执行 `_$ml`（V8 return 卡 / quickjs eval 问题）不是 cookie 纯算法的必需**——之前大量沙箱攻坚是"过度攻坚"

### cookie 纯算法管线已存在（query_gen_module.js）
- `wb-dsv4flash/query_gen_module.js`：`PmosQueryClient.init()` = 拉挑战 + runOuterVM 提取 cp3 + 管线 Coder/Cookie 生成 cookie + 200 验证
- **xj 站点（:20080）已验证 18/18 全 200**（query + cookie 纯算法）
- nx 需改 TARGET/OUTER_JS + 管线适配

### nx cookie 剩余障碍（2 个）
1. **管线适配**：`runTask.js:147` eval `codemap.commonFunc`（nx 的 commonFunc 775KB 含顶层 return → `Illegal return statement`）——xj 无此问题，nx 特有
2. **网络受限**：当前环境访问 `pmos.nx.sgcc.com.cn:10443` TIMEOUT——无法在线验证 cookie

### `_$ml` return 卡最终定位（V8 lazy 编译 bug）
- `--no-lazy` 下外层 VM 39-44ms 完成（不卡）——但纯净 Proxy eval 仍卡（55s）——插桩敏感
- `_$ml` 拆分（if 树 → 子函数，28KB 级）后仍卡在 812 递归（82469）——**与函数大小无关**——V8 对特定结构的深层 bug
- **quickjs 正常**（38 次迭代返回）——确认 V8 特定
- 结论：**V8/quickjs 执行 `_$ml` 均不必要**（cp3 不需执行）

### 可复用结论
- nx cookie 纯算法路径：`runOuterVM(nsd,cd) → cp3=checksum(dynCode)` → 管线 Cookie 生成——**不依赖沙箱执行动态代码**
- 剩余：管线 nx 适配（commonFunc 顶层 return）+ 网络验证
- 沙箱攻坚（V8 return 卡/quickjs eval）已无必要，成果（Proxy eval 技巧、插桩约束、quickjs 环境补全）留档
