# VM 执行器组装状态（2026-08-04）

## 技术判断（逆向工程专家）

**VM 环境模拟在 Node 中可行，但需要逐步补全环境**。当前进展与卡点：

## 已完成的执行器迭代（8 代）

| 代 | 方法 | 结果 |
|---|---|---|
| 828 | eval 注入 | _$a2 未定义 |
| 834 | vm context + 表 | _\$a2 闭包问题 |
| 838 | 全局 eval | _\$a2 作用域问题 |
| 839 | IIFE 注入全局 | _\$a2 undefined |
| 846 | IIFE 注入 _$a2=globalThis | _\$oU undefined |
| 886 | _$c4 参数默认值 | _$fN charCodeAt 错误 |
| 890 | _$ez 字符串转换 | _\$oU undefined |
| 894 | IIFE 注入所有全局表 | _\$oU undefined |
| 899 | opcode 227 前锚定 _\$oU | 前进到 reading '176' |

## 卡点（迭代式）

**每个错误修复后，VM 前进到下一个环境依赖**：
1. `_$a2` undefined → 注入 `_$a2 = globalThis`
2. `_$oU` undefined（opcode 725 覆盖）→ opcode 227 前锚定
3. `reading '176'`（新表 _\$oP/_\$b1 等）→ 需补全更多表

## 关键洞察

**VM 是"环境检测 + 多表"的迭代系统**：
- 每个 opcode 依赖环境表（_$mD/_$oU/_$b1/_$lc/_$oP/_$f$/_$ll/_$$M 等）
- 环境不匹配 → 表未初始化 → 崩溃
- **修复一个错误，暴露下一个**（迭代式环境补全）

## 需要补全的表（OP 索引）

- _\$oP：opcode 182/148/96 等使用
- _\$f$：opcode 96 等使用
- _\$ll：_\$oX 解码用
- _\$$M：_\$fx 用
- _\$lC：_\$aq 用
- _\$jR：_\$oP 相关
- _\$d5：document 相关
- _\$av：元素相关
- _\$ah：_\$k0 相关
- _\$mg：Function
- _\$ma：_\$oU 相关

## 资产清单

- VM IIFE：/tmp/nx_vm_body.js（492KB）
- 注入版：/tmp/nx_vm_body_fixed2.js（899 最新）
- 捕获表：/tmp/nx_vm_tables_init.json（24 表）
- 输入：/tmp/nx_vm_inputs2.json（6 程序 + scj）
- 执行器：/tmp/nx_vm_executor_injected.js

## 下一步

1. 补全 _\$oP/_\$f$/_\$ll/_\$lC/_\$jR 等表（浏览器捕获）
2. 迭代修复环境依赖
3. 直到 VM 执行完整输出 base