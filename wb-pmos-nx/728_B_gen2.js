/**
 * 728_B_gen2.js
 * basearr(base) 生成脚本 v2（基于权威 pairs 数据集）
 *
 * base 完整结构（服务器接受的 basearr，179 开头）：
 *   [0:22]   固定头 22B（跨 nsd 恒定，可硬编码）
 *   [22:29]  会话段 7B（[26:29]=233,88,0 或 250,0,163 两种模式）
 *   [29:68]  固定段 39B（跨 nsd 恒定，可硬编码）
 *   [68:92]  随 cd 变（其中 [70:82] 可任意 200；[68:69]+[83:89] 校验）
 *   [92:165] 编码敏感区（跨样本变但 +1 破坏结构 → huffman 边界）
 *   [尾 12B] 两组变体（A:26,99,146,68,120,0,221,0,202,244,70,10 / B:0,26,...）
 *
 * 卡点：base[68:69]+[83:89]+[92:165] 与 cd 绑定，是内层 VM 加密产物
 * 纯算法需：内层 VM 生成 或 从 cd 推导 [68:92]
 */
const fs = require('fs');

// 权威固定段（pairs 数据集，跨 10 nsd 恒定）
const FIXED_HEAD = [179, 0, 127, 12, 181, 215, 238, 205, 190, 124, 137, 242, 104, 101, 0, 202, 211, 238, 166, 172, 241, 181];
const FIXED_MID = [0, 119, 255, 0, 229, 252, 14, 118, 66, 25, 116, 234, 37, 231, 167, 198, 199, 224, 142, 104, 91, 15, 140, 202, 156, 115, 244, 0, 111, 243, 230, 165, 189, 0, 237, 40, 162, 0, 189];

// 尾部变体（A 组为主）
const TAIL_A = [26, 99, 146, 68, 120, 0, 221, 0, 202, 244, 70, 10];

/**
 * 从 pairs 样本加载完整 base 模板（含 [68:92] + 编码敏感区 + 尾）
 * @returns {Array|null}
 */
function loadTemplate() {
  try {
    const d = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
    if (d.samples && d.samples[0] && d.samples[0].base) return d.samples[0].base;
  } catch (e) {}
  try {
    const d = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
    const s = d.samples.find(x => x.base && x.base[26] === 233);
    if (s) return s.base;
  } catch (e) {}
  return null;
}

/**
 * 构造 base
 * @param {Array|null} session68_92 当前会话的 [68:92] 24 字节（纯算法需从 cd 推导）
 * @param {Array|null} sessionSeg [22:29] 会话段（可选，默认用 [233,88,0] 模式）
 * @param {boolean} useTemplate 若无法提供 [68:92]，从样本加载完整模板（用于结构验证）
 * @returns {Object}
 */
function buildBase(session68_92 = null, sessionSeg = null, useTemplate = false) {
  // 兜底：直接用样本完整 base 模板
  const tpl = loadTemplate();
  if (useTemplate && !session68_92 && tpl) {
    const base = [...tpl];
    if (sessionSeg) for (let i = 0; i < 7; i++) base[22 + i] = sessionSeg[i];
    return { basearr: base, length: base.length, structure: 'template', source: 'pairs-sample' };
  }

  const head = [...FIXED_HEAD];
  const seg = sessionSeg || [185, 11, 214, 151, 233, 88, 0]; // 模式 A
  const mid = [...FIXED_MID];
  const tailVar = session68_92 ? [...session68_92] : null;

  // 中间编码段（[92:len-12]）—— 需要从样本获取或内层 VM 生成
  let midTail = null;
  if (tpl) midTail = tpl.slice(92, tpl.length - 12);

  const base = [...head, ...seg, ...mid];
  if (tailVar) base.push(...tailVar);
  if (midTail) base.push(...midTail);
  base.push(...TAIL_A);

  return {
    basearr: base,
    length: base.length,
    structure: {
      head: [0, 22],
      session: [22, 29],
      fixedMid: [29, 68],
      varSeg: [68, 92],
      encodedTail: [92, base.length - 12],
      tail: [base.length - 12, base.length],
    },
  };
}

function dump() {
  console.log('=== base 固定段（权威 pairs 数据）===');
  console.log('head[0:22]:', JSON.stringify(FIXED_HEAD));
  console.log('mid[29:68]:', JSON.stringify(FIXED_MID));
  console.log('尾部A:', JSON.stringify(TAIL_A));
}

if (require.main === module) {
  dump();
  const r = buildBase();
  console.log('\n示例 base len:', r.length);
  console.log('base[0:68]:', r.basearr.slice(0, 68).join(','));
}

module.exports = { buildBase, dump, FIXED_HEAD, FIXED_MID, TAIL_A };
