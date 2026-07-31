/**
 * 51_compare_final.js
 *
 * 同 cd 对比浏览器动态代码 vs 沙箱动态代码
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

async function main() {
  const meta = JSON.parse(fs.readFileSync(path.join(OUT, 'browser_dyn_meta.json')));
  const browserDyn = fs.readFileSync(path.join(OUT, 'browser_dyn.js'), 'utf8');
  const nsd = meta.challenge.nsd, cd = meta.challenge.cd;
  console.log('nsd=' + nsd + ' 浏览器 dyn len=' + browserDyn.length);

  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  console.log('沙箱 dyn len=' + r.dynLen + ' cp3=' + r.cp3);

  if (r.dynCode && r.dynCode === browserDyn) {
    console.log('★★★ 完全一致! cp3 正确');
    return;
  }
  console.log('不一致。浏览器=' + browserDyn.length + ' 沙箱=' + r.dynCode.length);
  // 找差异
  let diffAt = -1;
  for (let i = 0; i < Math.min(browserDyn.length, r.dynCode.length); i++) {
    if (browserDyn[i] !== r.dynCode[i]) { diffAt = i; break; }
  }
  console.log('首个差异 @', diffAt);
  if (diffAt >= 0) {
    console.log('浏览器:', JSON.stringify(browserDyn.substring(diffAt - 50, diffAt + 50)));
    console.log('沙箱  :', JSON.stringify(r.dynCode.substring(diffAt - 50, diffAt + 50)));
  }
  // 尾部对比
  if (browserDyn.length !== r.dynCode.length) {
    console.log('\n浏览器尾部:', JSON.stringify(browserDyn.slice(-60)));
    console.log('沙箱尾部  :', JSON.stringify(r.dynCode.slice(-60)));
  }
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
