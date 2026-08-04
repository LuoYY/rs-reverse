# base 生成捕获方法最终方案（2026-08-04）

## 一、关键结论

**dyn-code.js 是 VM 解释器源码，但常量表（_$eb/_$k2/_$mv 等）是运行时动态生成的**。
- `_$eb` 由 VM 指令 opcode 1685（`_$eb=_$aA(_$dT)`）赋值
- 所有索引表（_$k2/_$mv/_$kH/_$no/_$c2/_$aw/_$ip/_$oN/_$gq/_$eB）都是运行时构建
- **源码无法直接提供表值** → 必须浏览器运行时捕获

## 二、捕获方法（浏览器运行时，2 步）

### 步骤 1：runOuterVM 已捕获的 VM 解释器
- dyn-code.js 完整解释器源码（主循环 + _$fA 操作符表赋值 + huffman 编码器 _$kF）
- 但依赖表需运行时捕获

### 步骤 2：捕获运行时表快照【核心】
在浏览器执行到 VM 主循环时，捕获所有依赖表：

```js
// 在 Chrome DevTools 断点处（VM 主循环触发时）执行：
const tables = {
  _$eb: window._$eb,        // 常量表
  _$k2: window._$k2,        // 字符串表
  _$mv: window._$mv,        // 索引表
  _$kH: window._$kH,        // 索引表2
  _$no: window._$no,        // 索引表3
  _$c2: window._$c2,        // 索引表4
  _$aw: window._$aw,        // 索引表5
  _$ip: window._$ip,        // 索引表6
  _$oN: window._$oN,        // 索引表7
  _$gq: window._$gq,        // 索引表8
  _$eB: window._$eB,        // 执行参数
  _$ae: window._$ae,        // huffman 树
  _$mC: window._$mC,        // pad 值
  _$aW: window._$aW,        // huffman 编码表
  _$pI: window._$pI,        // program 数组
  _$fA: window._$fA,        // 操作符表
};
```

**关键**：这些变量在 VM 闭包内，window 访问不到。需用 `evaluateOnCallFrame` 在 VM 帧作用域内取值（AgentA 已有 A236b 经验）。

### 步骤 3：捕获 base 生成输入输出
- hook `_$kF`（huffman 编码器）：输入明文，输出 base 编码
- hook `_$oU`（base 组装函数 @61254）：内部 `_$bp._$$R({...})` 注册回调

## 三、预判可行性

| 风险 | 等级 | 应对 |
|---|---|---|
| 反调试干扰 | 中 | 用持久化断点 + 单次采集（A236b 已验证） |
| 表快照时序 | 中 | 在 cap 生成后、base 生成前捕获（_$kF 调用时） |
| 闭包变量访问 | 低 | evaluateOnCallFrame 在 VM 帧内取值（A236b 已验证） |
| opcode 表太大 | 低 | 只需捕获 program 用到的操作符 |

## 四、结论

**捕获方法可行**，最佳路径：
1. **hook `_$kF`**（huffman 编码器）→ 捕获明文→base 编码的输入输出
2. **在 `_$kF` 调用帧**捕获全部依赖表快照（_$eb/_$k2/_$mv/_$ae/_$aW/_$mC/_$pI/_$fA）
3. 用捕获的表 + dyn-code.js 执行器 → Node 中模拟 base 生成

**AgentA 执行指令**：
- 用 A236b 的断点框架，追加 hook `_$kF` 调用
- 在 `_$kF` 调用帧 evaluateOnCallFrame 捕获全部依赖表
- 保存：明文输入 + base 输出 + 依赖表快照
- 验证：36 样本 contrast