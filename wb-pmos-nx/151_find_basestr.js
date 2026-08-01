/**
 * 151_find_basestr.js
 *
 * 搜索 nx 外层 JS + 动态代码里的 basestr（64-86 字符字符串，含 - 或 0-9A-Z_a-z）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function findBasestr(code, label) {
  // 找 50-100 字符的字符串字面量（含 - 或 base64 风格）
  const matches = code.match(/"([^"\\]{40,100})"/g);
  if (!matches) return;
  for (const m of matches) {
    const s = m.slice(1, -1);
    // basestr 特征：含字母数字 + 特殊字符，或 0-9A-Z_a-z
    const b64 = /^[-A-Za-z0-9_\.\{\}\|\~\!\#\$\%\(\)\*\+,;=\?@\[\]\^]+$/.test(s);
    const hasDash = s.includes('-') && s.includes('_');
    const len = s.length;
    if ((len === 64 || (len >= 60 && len <= 90)) && (b64 || hasDash)) {
      console.log(`[${label}] 候选 basestr len=${len}:`, JSON.stringify(s));
    }
  }
}

(async () => {
  // 外层 JS
  const outer = fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8');
  findBasestr(outer, '外层JS');

  // 动态代码（runOuterVM 提取）
  const sync = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-pmos-nx/captures/sync_1785512612887.json')));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const r = runOuterVM({ nsd: sync.challenge.nsd, cd: sync.challenge.cd }, outer);
  if (r.dynCode) {
    findBasestr(r.dynCode, '动态代码');
    fs.writeFileSync('/tmp/nx_dyncode.js', r.dynCode);
  }

  // 从浏览器 cookie 反推 basestr 字符集（已知字符）
  const sync2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-pmos-nx/captures/sync_1785512612887.json')));
  const bP = (sync2.cookies || []).find(c => c.name.endsWith('P'));
  if (bP) {
    const chars = [...new Set(bP.value.split(''))].sort();
    console.log('\n浏览器 cookie 字符集:', chars.join(''), '(', chars.length, ')');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
