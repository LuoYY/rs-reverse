/**
 * 129_compare_basearr_sessions.js
 *
 * 对比多个浏览器权威 basearr（还原的，非加密），找固定段 vs 会话相关段
 * → 动态生成策略（固定段硬编码 + 会话段用 keys/time 计算）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

(async () => {
  // 读取所有 basearr 还原样本
  const files = fs.readdirSync(OUT).filter(f => f.includes('basearr') && f.endsWith('.json'));
  const samples = [];
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
      const ba = d.basearr;
      if (ba && Array.isArray(ba)) samples.push({ file: f, nsd: d.challenge?.nsd, ba, keys2: d.keys2, cookies: d.cookies });
    } catch (e) {}
  }
  console.log('basearr 样本数:', samples.length);
  samples.forEach(s => console.log(s.file, 'nsd=' + s.nsd, 'len=' + s.ba.length, '前8:', s.ba.slice(0, 8).join(',')));

  // 用 NX_BASEARR_SAMPLE（303B）作为基准（basearr_decoded）
  const base = samples.find(s => s.ba.length === 303);
  if (!base) { console.log('无 303B 基准'); process.exit(0); }
  console.log('\n基准:', base.file, 'len', base.ba.length);

  // 对齐对比（LCS 或直接找相同区段）
  for (const s of samples) {
    if (s === base) continue;
    console.log(`\n=== ${s.file} len=${s.ba.length} vs 基准 ===`);
    // 找公共前缀
    let pre = 0;
    while (pre < Math.min(base.ba.length, s.ba.length) && base.ba[pre] === s.ba[pre]) pre++;
    // 找公共后缀
    let suf = 0;
    while (suf < Math.min(base.ba.length, s.ba.length) - pre && base.ba[base.ba.length - 1 - suf] === s.ba[s.ba.length - 1 - suf]) suf++;
    console.log('公共前缀:', pre, '公共后缀:', suf);
    console.log('基准 前 30:', base.ba.slice(0, 30).join(','));
    console.log('对比 前 30:', s.ba.slice(0, 30).join(','));
    // 差异区域（中间）
    const mid = Math.max(0, base.ba.length - suf);
    console.log('差异区域（基准 ' + pre + '..' + mid + '）:');
    console.log('  基准:', base.ba.slice(pre, Math.min(mid, pre + 80)).join(','));
    console.log('  对比:', s.ba.slice(pre, Math.min(s.ba.length - suf, pre + 80)).join(','));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
