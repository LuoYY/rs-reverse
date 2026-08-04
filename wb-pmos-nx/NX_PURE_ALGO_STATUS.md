# nx 纯算法攻坚状态报告（2026-08-04 凌晨）

## 一、已完成（100% 验证）

| 模块 | 状态 | 证据 |
|---|---|---|
| keys 全 cd 派生 | ✅ | keys[2]==keys2（48B 一致） |
| cap 公式化 | ✅ 94% | cap = b86[2:2+len] + 标记位 |
| base[0:22] 固定头 | ✅ | 179,0,127,12,...（route 拦截） |
| base[29:68] 固定段 | ✅ | 跨会话恒定 |
| **base[68:72] 固定前缀** | ✅ | = f(cd)，同 cd 完全一致 |
| **块核心模板** | ✅ | 6 种（B/A/A2/C/D/E），跨样本固定 |
| [22:29] 会话段可任意 | ✅ | 同 nsd 交换 200（767） |
| cookie 重构链路 | ✅ | 530/534/777/786/789 T0 多次 200 |
| 测试方法 | ✅ | 独立会话 + curl POST + huffman 长度保持 |

## 二、最后障碍

**base[68:92] 的 VM 生成算法**：
- base 不是 cd 纯函数，**每次生成含时间/随机成分**
- [22:29] 会话段、块类型、[92:] 尾部每次不同
- [68:72] 固定（cd 派生）+ 块核心模板（6 种）+ [0:22]/[29:68] 固定
- 块类型选择逻辑（cd 约束 + 时间/随机）需 VM 反编译

## 三、关键数据

| 资产 | 位置 |
|---|---|
| 16 样本 IO 对 | /tmp/nx_io_pairs.json |
| 同 nsd 6 样本 | /tmp/nx_A236_blocks.json |
| VM 状态 dump | /tmp/nx_browser_cS_state_dump.json |
| VM 程序 | /tmp/nx_gx_program.json / nx_frame7_gx.json |
| cap 输入 | /tmp/nx_ax_input.json |
| 26 样本数据集 | /tmp/nx_cd_base_pairs.json + nx_triple_dataset.json + 728_B_all_forms.json |

## 四、攻坚路径（AgentA 主导）

**反编译内层 VM base 构造主程序**：
1. 操作码表（99 handlers）+ program2/3 反编译已完成
2. 需捕获 base 构造主程序（含时间/随机逻辑）
3. 输出"cap + cd + 时间/随机 → base[68:92]"生成算法

**AgentB 配合**：用 22 样本验证反编译产出的算法

## 五、重大里程碑回顾

1. **WAF 层绕过**：模板 base → 400（非 412）
2. **块核心固定**：base[80:92] = 前导+固定块+尾
3. **整段替换 400**：[68:92] 换其他样本 → cookie 层通过
4. **[68:72] cd 固定**：同 cd 6 样本一致
5. **base 含时间/随机**：非 cd 纯函数
