/**
 * 728_A124_base_analysis.js
 * 深入分析 base(179 加密) 与 cap(113 明文) 同会话配对的关系
 * 探索 base = f(cap) 的变换公式
 */
const fs = require('fs');
const path = require('path');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

(async () => {
  const d = JSON.parse(fs.readFileSync('/tmp/nx_747_data.json', 'utf8'));
  const cap = d.cap, base = d.base, b86 = d.b86, keys2 = d.keys2;
  console.log('cap(明文) len:', cap.length, 'base len:', base.length, 'keys2 len:', keys2.length);

  // 1. base 与 cap 长度对比
  console.log('\n=== base vs cap ===');
  console.log('cap[0-31]:', cap.slice(0, 32).join(','));
  console.log('base[0-31]:', base.slice(0, 32).join(','));

  // 2. base 是 cap 的压缩？base[16+] vs cap 的 huffman 加密
  // 先实现 nx huffman 加密（参考 745）
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
  const huffEncCfg = getEncCfg(getTree());
  function nxEncrypt(numarr) {
    const ans = [];
    let one = 0, two = 0;
    for (let i = 0; i < numarr.length; i++) {
      const cfg = huffEncCfg[numarr[i]];
      one = one << cfg.val | cfg.key;
      two += cfg.val;
      while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; }
    }
    if (two > 0) ans.push(one << 8 - two | 0x68 >> two);
    return ans;
  }

  // cap huffman 加密
  const capEnc = nxEncrypt(cap);
  console.log('\ncap huffman 加密 len:', capEnc.length, 'base len:', base.length);
  const encDiff = [];
  for (let i = 0; i < Math.min(capEnc.length, base.length); i++) if (capEnc[i] !== base[i]) encDiff.push(i);
  console.log('capEnc vs base 差异:', encDiff.length, encDiff.slice(0, 30).join(','));

  // 3. base[16+] 是否包含 cap 的 huffman 加密？base[22+] 随 cd
  console.log('\n=== base 固定段 ===');
  console.log('base[0-21]（固定）:', base.slice(0, 22).join(','));
  console.log('base[22-40]:', base.slice(22, 41).join(','));
  console.log('base 尾部 16:', base.slice(-16).join(','));

  // 4. cap vs b86 明文确认（明文 = b86[2:2+len]?）
  const fb = b86.slice(2, 2 + cap.length);
  const diffs1 = [];
  for (let i = 0; i < Math.min(fb.length, cap.length); i++) if (fb[i] !== cap[i]) diffs1.push(i);
  console.log('\ncap vs b86[2:]: 差异', diffs1.length, diffs1.slice(0, 30).join(','));

  // 5. base[16+] vs cap 的关系（尝试各种变换）
  console.log('\n=== base[16:32] vs cap[16:32] vs keys2 ===');
  console.log('cap[16-31]:', cap.slice(16, 32).join(','));
  console.log('base[16-31]:', base.slice(16, 32).join(','));
  // 尝试: base[i] = cap[i] XOR 固定值? cap[0:22] XOR base[0:22]
  const x = [];
  for (let i = 0; i < 32; i++) x.push(cap[i] ^ base[i]);
  console.log('cap^base[0:32]:', x.join(','));
  // cap[i] ^ keys2[i]
  const xk = [];
  for (let i = 0; i < 32; i++) xk.push(cap[i] ^ keys2[i]);
  console.log('cap^keys2[0:32]:', xk.join(','));

  // 6. base 是否与 cookie be 段相同（be = 解密后 cookie 内嵌的加密 basearr）
  // 直接看 be
  console.log('\n=== base vs cookie be ===');
  if (d.be) {
    console.log('be len:', d.be.length, 'be[0-31]:', d.be.slice(0, 32).join(','));
    const bd = [];
    for (let i = 0; i < Math.min(base.length, d.be.length); i++) if (base[i] !== d.be[i]) bd.push(i);
    console.log('base vs be 差异:', bd.length, bd.slice(0, 30).join(','));
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
