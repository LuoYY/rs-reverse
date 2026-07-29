/**
 * 测试 cp3 是否依赖 cd：
 * - 拉 2 次挑战页，可能得到同 nsd 不同 cd（nsd 范围有限）
 * - 固定 nsd，分别用真实配对的 cd 和另一个 cd 跑 runOuterVM，比较 cp3
 * - 更直接：取一个 (nsd, cd1)，再构造 (nsd, cd2=不同来源)，看 cp3 是否变
 *
 * 实际上：cd 是长随机串，同 nsd 不同 cd 常见。沙箱 runOuterVM({nsd,cd}) 若 cp3 随 cd 变，
 * 则 cd#2/cd#3（同 nsd 不同 cd）cp3 不同 → codeUid 不同 → 一过一错。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_cp3_cd_dependency.js
 */
const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const https = require('https');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const outerJs = fs.readFileSync(OUTER_JS, 'utf8');

function httpGet(url) {
  return new Promise(r => {
    https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': UA } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ body: b }));
    }).on('error', () => r({ body: '' }));
  });
}

(async () => {
  // 拉多次挑战页，找同 nsd 不同 cd 的两组
  const samples = [];
  for (let i = 0; i < 12; i++) {
    const ch = await httpGet(TARGET);
    const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    if (m) samples.push({ nsd: +m[1], cd: m[2] });
  }
  // 找同 nsd 的两组
  let pair = null;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      if (samples[i].nsd === samples[j].nsd && samples[i].cd !== samples[j].cd) { pair = [samples[i], samples[j]]; break; }
    }
    if (pair) break;
  }
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  if (pair) {
    const r1 = runOuterVM({ nsd: pair[0].nsd, cd: pair[0].cd }, outerJs);
    const r2 = runOuterVM({ nsd: pair[1].nsd, cd: pair[1].cd }, outerJs);
    console.log(`同 nsd=${pair[0].nsd} 不同 cd:`);
    console.log(`  cd1 → cp3=${r1.cp3} dynLen=${r1.dynLen}`);
    console.log(`  cd2 → cp3=${r2.cp3} dynLen=${r2.dynLen}`);
    console.log(`  cp3 ${r1.cp3 === r2.cp3 ? '相同 → cp3 不依赖 cd' : '不同 ✗ → cp3 依赖 cd'}`);
    console.log(`  dynCode ${r1.dynCode === r2.dynCode ? '相同' : '不同'}`);
  } else {
    console.log('未找到同 nsd 对，用交叉测试：固定 nsd，交换 cd');
    const s0 = samples[0], s1 = samples[1];
    console.log(`样本0 nsd=${s0.nsd}, 样本1 nsd=${s1.nsd}`);
    // 固定 s0.nsd，分别用 s0.cd 和 s1.cd
    const ra = runOuterVM({ nsd: s0.nsd, cd: s0.cd }, outerJs);
    const rb = runOuterVM({ nsd: s0.nsd, cd: s1.cd }, outerJs);
    console.log(`nsd=${s0.nsd} + cd0 → cp3=${ra.cp3}`);
    console.log(`nsd=${s0.nsd} + cd1 → cp3=${rb.cp3}`);
    console.log(`cp3 ${ra.cp3 === rb.cp3 ? '相同 → cp3 不依赖 cd（仅 nsd）' : '不同 → cp3 依赖 cd'}`);
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
