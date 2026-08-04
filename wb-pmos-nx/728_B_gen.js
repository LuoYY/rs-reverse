/**
 * 728_B_gen.js
 * nx basearr 生成（部分公式版）
 *
 * 结论（2026-08-03，基于 8 个 nsd 样本 + 固定数据集）：
 *   basearr(138B) = pj(dh)，解码器对 <128 值透传 → basearr == dh（普通会话）
 *   dh ≈ decodeB86(cd)[2:140] 匹配 130/138（94%）
 *   8 个标记位置 (24+16k, k=0..7) 与 b86 不同，来源未定：
 *     - 不是 keys2/keys17/keys段header 的直接函数
 *     - 112832/73823（不同 cd 但 basearr 完全相同）→ markers 非 b86 该位置值
 *     - 可能来自内层 VM 执行状态 / 环境数组
 *
 * 输入：nsd, cd
 * 输出：basearr（138B）
 * 当前状态：可输出 130/138 字节（公式部分），8 markers 待定（用样本表替换可验证）
 */
const fs = require('fs');
const path = require('path');

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

/** base86 解码（4 字符 → 3 字节） */
function decodeB86(str) {
  const idxmap = {};
  for (let i = 0; i < NX_BS.length; i++) idxmap[NX_BS[i]] = i;
  const bytes = [];
  let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]];
    if (c0 === undefined) return null;
    bytes.push((c0 << 2) | (c1 >> 4));
  } else if (rem === 3) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]];
    if (c0 === undefined) return null;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2));
  }
  return bytes;
}

const MARK_POS = [24, 40, 56, 72, 88, 104, 120, 136];

/**
 * 生成 basearr（公式部分）
 * @param {string} cd - 412 挑战页 cd
 * @param {Object} opts
 * @param {number[]} [opts.markers] - 8 个标记位置的真值（未提供则从 b86 近似取 130/138）
 * @returns {{basearr: number[], b86: number[], markers: number[], partial: boolean}}
 */
function genBasearr(cd, opts = {}) {
  const b86 = decodeB86(cd);
  if (!b86) return null;
  const basearr = [];
  for (let i = 0; i < 138; i++) basearr.push(b86[i + 2] !== undefined ? b86[i + 2] : 0);
  const mkSet = opts.markers || [];
  for (let k = 0; k < 8; k++) {
    if (mkSet[k] !== undefined) basearr[MARK_POS[k]] = mkSet[k];
  }
  return { basearr, b86, markers: MARK_POS.map((p) => basearr[p]), partial: !mkSet.length };
}

/** 从样本表读取 markers（用于验证/生成） */
function getMarkersFromSample(nsd, sampleFile = '/tmp/agentB/nx_multi_dataset_v5.json') {
  if (!fs.existsSync(sampleFile)) return null;
  const data = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));
  const s = (data.samples || []).find((x) => x.nsd === nsd);
  if (!s) return null;
  return MARK_POS.map((p) => s.basearr[p]);
}

// 主流程（无参数时自测）
if (require.main === module) {
  const sampleFile = '/tmp/agentB/nx_multi_dataset_v5.json';
  if (fs.existsSync(sampleFile)) {
    const data = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));
    console.log('=== 8 样本公式验证（b86[2:140] 无 markers 替换）===');
    for (const s of data.samples) {
      const r = genBasearr(s.cd);
      if (!r) { console.log(`nsd=${s.nsd}: cd 解码失败`); continue; }
      let match = 0;
      for (let i = 0; i < 138; i++) if (r.basearr[i] === s.basearr[i]) match++;
      const diffs = [];
      for (let i = 0; i < 138; i++) if (r.basearr[i] !== s.basearr[i]) diffs.push(`${i}:${r.basearr[i]}→${s.basearr[i]}`);
      console.log(`nsd=${s.nsd}: 匹配 ${match}/138 差异位置: ${diffs.length ? diffs.join(' ') : '无！'}`);
    }
    console.log('\n=== 带样本 markers 替换后（全 8 标记）===');
    for (const s of data.samples) {
      const mk = getMarkersFromSample(s.nsd, sampleFile);
      const r = genBasearr(s.cd, { markers: mk });
      let match = 0;
      for (let i = 0; i < 138; i++) if (r.basearr[i] === s.basearr[i]) match++;
      console.log(`nsd=${s.nsd}: 匹配 ${match}/138`);
    }
    console.log('\n用法: const {genBasearr, decodeB86} = require("./728_B_gen.js");');
    console.log('const r = genBasearr(cd);           // 公式部分（130/138）');
    console.log('const r2 = genBasearr(cd, {markers:[...8个真值]}); // 完整 138');
  } else {
    console.log('示例 cd 需提供。用法: genBasearr(cd)');
  }
}

module.exports = { genBasearr, decodeB86, MARK_POS };
