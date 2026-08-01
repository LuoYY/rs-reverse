/**
 * 156_search_basestr_all.js
 *
 * 搜索所有源（外层 JS / dynCode / cp0 / immucfg）中的 64 字符 basestr（含 - 和 _）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function findCandidates(text, label) {
  // 找含 - 和 _ 的 40-100 字符片段（basestr 特征）
  const re = /[-A-Za-z0-9_]{40,100}/g;
  const found = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const s = m[0];
    if (s.includes('-') && s.includes('_') && /[a-z]/.test(s) && /[0-9]/.test(s)) {
      found.push(s);
    }
  }
  if (found.length) {
    console.log(`[${label}] 候选:`);
    found.forEach(s => console.log('  len=' + s.length, JSON.stringify(s)));
  }
  return found;
}

(async () => {
  const outer = fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8');
  findCandidates(outer, '外层JS');

  // dynCode
  try {
    const sync = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-pmos-nx/captures/sync_1785512612887.json')));
    const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
    const r = runOuterVM({ nsd: sync.challenge.nsd, cd: sync.challenge.cd }, outer);
    if (r.dynCode) {
      findCandidates(r.dynCode, 'dynCode');
      fs.writeFileSync('/tmp/nx_dyncode.js', r.dynCode);
    }
  } catch (e) { console.log('dynCode 错误:', e.message.substring(0, 40)); }

  // 浏览器 cookie 作为 basestr 片段（8 字符窗口扫描找模式）
  const sync2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-pmos-nx/captures/sync_1785512612887.json')));
  const bP = (sync2.cookies || []).find(c => c.name.endsWith('P'));
  if (bP) {
    const cookie = bP.value;
    console.log('\n浏览器 cookie 前 100:', JSON.stringify(cookie.substring(0, 100)));
    console.log('cookie 字符集:', [...new Set(cookie)].sort().join(''));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
