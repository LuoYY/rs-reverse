/**
 * 13_derive_basestr.js
 *
 * 从浏览器 query + 管线 keys2 推导 nx 站点的 numarr2string 字符集（basestr）
 *
 * 原理：query = numarr2string(88B, basestr)，88B 中 keys2 48B 为已知字节。
 * base64-like 编码：3 字节 → 4 字符，字符 = basestr[6bit 索引]。
 * 用已知字节 → 索引 → 字符 的对应关系反推 basestr[0..63]。
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

async function main() {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';

  // 用 query 捕获的 challenge 跑管线
  const capFile = fs.readdirSync(OUT).filter(f => f.startsWith('query_')).sort().pop();
  const cap = JSON.parse(fs.readFileSync(path.join(OUT, capFile)));
  const nsd = cap.challenge.nsd, cd = cap.challenge.cd;
  console.log('用 challenge nsd=' + nsd);
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/nx-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/nx-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const { $_ts: fullTs, codemap } = coder.run();
  fullTs.cp[3] = r.cp3;
  gv.config.codemap = codemap;
  const Cookie = require('@src/handler/Cookie');
  new Cookie(coder).run();
  const keys2 = gv.keys[2];
  console.log('keys2:', keys2.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 取第一个 query
  const q = cap.queries[0].query;
  console.log('query:', q.substring(0, 60) + '... len=' + q.length);
  console.log('query 前缀:', q[0]);

  // 推导 basestr：query = 'a'(前缀) + numarr2string(88B)
  const payload = q.slice(1);  // 去掉前缀字符
  console.log('payload len:', payload.length, '(88B → 应有 118 字符)');

  function tryOffset(keysOffset) {
    // keys2 从 byte keysOffset 开始。query 字符索引 = keysOffset/3*4
    const charBase = Math.floor(keysOffset / 3) * 4;
    const byteBase = charBase / 4 * 3;  // 组起始字节
    const rem = keysOffset % 3;
    const mapping = {};  // idx -> char
    let conflicts = 0, matches = 0;
    for (let i = 0; i + 3 <= keys2.length; i++) {
      const b0 = keys2[i], b1 = keys2[i + 1], b2 = keys2[i + 2];
      // 计算这 3 字节在 query 中的 4 个字符位置
      const bytePos = keysOffset + i;
      const groupStartChar = Math.floor(bytePos / 3) * 4;
      const inGroup = bytePos % 3;
      const chars = [
        payload[groupStartChar], payload[groupStartChar + 1], payload[groupStartChar + 2], payload[groupStartChar + 3],
      ];
      if (chars.some(c => c === undefined)) break;
      const idxs = [
        b0 >> 2,
        ((b0 & 3) << 4) | (b1 >> 4),
        ((b1 & 15) << 2) | (b2 >> 6),
        b2 & 63,
      ];
      for (let j = 0; j < 4; j++) {
        const idx = idxs[j];
        const ch = chars[j];
        if (mapping[idx] === undefined) { mapping[idx] = ch; matches++; }
        else if (mapping[idx] !== ch) { conflicts++; }
        else matches++;
      }
    }
    return { mapping, conflicts, matches };
  }

  // 尝试 keys2 偏移 7..9（xj 结构 keys2 从 byte7，加上前缀变量）
  for (let off = 4; off <= 12; off++) {
    const res = tryOffset(off);
    if (res.conflicts === 0 && res.matches >= 100) {
      console.log(`\n★ keys2 偏移 ${off}: conflicts=0 matches=${res.matches} → basestr 推导成功!`);
      const basestr = [];
      for (let i = 0; i < 64; i++) basestr[i] = res.mapping[i] || '?';
      console.log('basestr[0..63]:', basestr.join(''));
      // 剩余字符
      const known = new Set(Object.values(res.mapping));
      const payloadChars = [...new Set(payload.split(''))];
      const unknown = payloadChars.filter(c => !known.has(c));
      console.log('query 中出现但不在 basestr[0..63]:', unknown.join(''));
      return basestr;
    } else {
      console.log(`偏移 ${off}: conflicts=${res.conflicts} matches=${res.matches}`);
    }
  }
  console.log('\n所有偏移均冲突 → 结构假设可能不对');
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
