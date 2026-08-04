/**
 * 797_lead_search.js
 * 精确码长补偿搜索：给定 base 和块模板，搜索前导值使 nxEncrypt 总长精确一致
 * 方法：目标 = 原始 nxEncrypt 长度；暴力搜索前导（值域限定在 0/255/8bit值/9bit值）使总长一致
 */
const path = require('path');
const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData')).init();
const nxEncrypt = require(path.join(ROOT, 'src/handler/parser/common/numarrEncrypt'));
const fs = require('fs');

function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) {
    for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } }
    arr.push(item);
  }
  while (arr.length > 1) {
    const [one, two] = arr.slice(0, 2);
    arr = arr.slice(2);
    parse({ total: one.total + two.total, first: one, second: two });
  }
  return arr[0];
}
function getEncCfg(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncCfg(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncCfg(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else arr[tree.idx] = config;
  return arr;
}
const cfg = getEncCfg(getTree());
const BITS = {};
for (let i = 0; i < 256; i++) BITS[i] = cfg[i] ? cfg[i].val : 0;

// 值集合：0(3bit), 255(6bit), 8bit值, 9bit值
const V3 = [0];
const V6 = [255];
const V8 = []; const V9 = [];
for (let i = 1; i < 255; i++) {
  if (BITS[i] === 8) V8.push(i);
  else if (BITS[i] === 9) V9.push(i);
}

// 核心搜索：给定核心+尾，搜索前导使总长=目标
function searchLead(coreTail, targetLen, leadLen, base, base80len) {
  // 前导用 V3/V6/V8/V9 混合，暴力枚举（限制组合数）
  const vals = [[...V3.slice(0, 1)], [...V6.slice(0, 1)], V8.slice(0, 30), V9.slice(0, 30)].flat();
  const seen = new Set();
  // 迭代加深：逐字节选择
  let best = null, bestDiff = 999;
  function rec(lead, depth) {
    if (depth === leadLen) {
      const nb = [...base];
      const newSeg = [...lead, ...coreTail];
      for (let i = 0; i < base80len && 80 + i < nb.length; i++) nb[80 + i] = newSeg[i];
      // 填充剩余
      for (let i = base80len; i < newSeg.length && 80 + i < nb.length; i++) nb[80 + i] = newSeg[i];
      const len = nxEncrypt(nb).length;
      const diff = len - targetLen;
      if (diff === 0) return { lead };
      if (Math.abs(diff) < Math.abs(bestDiff)) { bestDiff = diff; best = { lead, diff }; }
      return null;
    }
    // 剪枝：用代表性值
    const reps = [0, 255, 1, 2, 3, 47, 128, 129, 254];
    for (const v of reps) {
      const r = rec([...lead, v], depth + 1);
      if (r) return r;
    }
    return null;
  }
  const r = rec([], 0);
  return r || best;
}

// 测试：标准#1（块D）
const TPL_D = { core: [77, 158, 17, 7, 119, 143, 23, 17], tail: [243, 105, 223, 59, 117, 75, 139, 176, 0, 0, 1, 0, 236, 249, 0, 95, 173, 0] };
const d = JSON.parse(fs.readFileSync('/tmp/nx_A236_blocks.json', 'utf8'));
const arr = Array.isArray(d) ? d : (d.samples || d);
const s1 = arr.find(s => s.name.includes('#1'));
const base = s1.base;
const origLen = nxEncrypt(base).length;
console.log('标准#1 原始 huff len:', origLen);
const coreTail = [...TPL_D.core, ...TPL_D.tail];
const origSegLen = Math.min(30, base.length - 80);
const leadLen = origSegLen - coreTail.length;
console.log('核心+尾 len:', coreTail.length, '前导 len:', leadLen, '段 len:', origSegLen);

const result = searchLead(coreTail, origLen, leadLen, base, origSegLen);
if (result) {
  const nb = [...base];
  const newSeg = [...(result.lead || []), ...coreTail];
  for (let i = 0; i < origSegLen && 80 + i < nb.length; i++) nb[80 + i] = newSeg[i];
  const finalLen = nxEncrypt(nb).length;
  console.log('搜索到前导: [' + (result.lead || []).join(',') + '] 总长=' + finalLen + (finalLen === origLen ? ' ✓' : ' 差' + (finalLen - origLen)));
  console.log('替换后 [80:110]=' + newSeg.slice(0, Math.min(30, newSeg.length)).join(','));
} else {
  console.log('未找到精确匹配，最近差:', result ? result.diff : '无');
}
