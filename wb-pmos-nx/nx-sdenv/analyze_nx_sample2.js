// 用管线 numarrJoin 的逆逻辑分析 317B 样本结构
const fs = require('fs');
const path = require('path');
require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/handler/basearr/len243-nx.js'), 'utf8');
  const m = src.match(/const NX_BASEARR_SAMPLE = \[([\s\S]*?)\];/);
  const s = m.group(1).split(',').map(x => parseInt(x.trim()));
  console.log('样本 len:', s.length);
  // numarrJoin: [tag, len, data] 但瑞数实际用 [tag, len1, seg1, tag, len2, seg2]
  // 看管线 numarrJoin 实现
  const parser = require('@src/handler/parser/');
  const nj = parser.numarrJoin.toString();
  console.log('numarrJoin 源码:', nj.substring(0, 500));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
