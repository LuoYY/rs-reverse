# base 生成 program 捕获方法分析（2026-08-04）

## 一、核心问题

需捕获**base 生成 program**（明文 basearr → base 的 VM 变换），供执行器模拟。

## 二、已确认的事实

1. **明文 basearr（113 开头，160B）**：由 VM program0/1 生成（已捕获 bytecode）
2. **base（179 开头，162-170B）**：由 huffman 编码（`_$kF`）+ 外层变换生成
3. **dyn-code.js 含完整 VM 解释器**：主循环（`_$jm`/`_$i6`/`_$p1`）+ 操作符表 `_$fA`（1500+ opcode）+ huffman 编码器 `_$kF`
4. **明文→base 变换**：base 固定头 179 不在源码常量中（动态生成）→ 是 VM 特定 program 的输出

## 三、捕获方法分析（3 方案）

### 方案 A：hook `_$kF`（huffman 编码器）【推荐】
- `_$kF` 是 huffman 编码函数（dyn-code.js @56399），base 必须经过它
- 在浏览器中 hook `_$kF` 调用：捕获输入（明文）+ 输出（base 编码）
- **优点**：直接捕获明文→base 的输入输出对，不依赖 VM program
- **缺点**：huffman 编码不是"明文→base"的完整变换（base 还有固定头/配对/块区）

### 方案 B：hook `_$oU`（base 组装函数）【最直接】
- `_$oU`（dyn-code.js @61254）是 15KB 的大函数，含 base 组装逻辑
- 在浏览器中 hook `_$oU` 调用：捕获 base 构造时刻的完整状态
- **优点**：直接捕获 base 生成
- **缺点**：`_$oU` 可能不是 base 专用（需确认）

### 方案 C：VM 断点捕获 program【技术最深】
- 在 VM 主循环断点（`_$p1` 分发处），记录 cap 构造后、base 构造前的 program
- **优点**：完整捕获 base 生成 program
- **缺点**：VM 执行复杂，断点干扰反调试

## 四、推荐方案（A+B 组合）

1. **hook `_$kF`**：捕获 base 的 huffman 编码输入输出（明文→base 编码）
2. **hook `_$oU`**：捕获 base 组装函数的输入（明文 + 其他参数）
3. 组合：确认"明文 + huffman(_$kF) + 组装(_$oU) → base"的完整链路

## 五、关键验证

- 用已捕获的 program0/1 验证 VM 解释器（执行器）
- 用 36 样本数据集的 cap/base 验证捕获的明文→base 变换
- 若明文→base 是纯外层变换（非 VM program），则跳过 VM 模拟

## 六、结论

**捕获方法可行**：hook `_$kF` + `_$oU` 比 VM 断点更简单可靠。AgentA 可先用 A236b 的断点框架（Array.push 断点）扩展为 hook 这两个函数，捕获 base 生成输入输出。