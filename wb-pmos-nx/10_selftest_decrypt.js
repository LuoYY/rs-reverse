/**
 * 10_selftest_decrypt.js
 *
 * 自测：用管线生成 cookie → decode → decrypt(keys16) → 应得到 [uuid][nextarr]
 * 验证 decode/decrypt 链路正确性，然后与真实 cookie 对比结构差异
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function decodeStr(s) {
  const payload = s.startsWith('0') ? s.slice(1) : s;
  const idxmap = {};
  for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const bytes = [];
  let qi = 0;
  const groups = Math.floor(payload.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]];
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 2 < payload.length) {
    // 3 字符 → 2 字节
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]];
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2));
  } else if (qi + 1 < payload.length) {
    // 2 字符 → 1 字节
    bytes.push((idxmap[payload[qi]] << 2) | (idxmap[payload[qi + 1]] >> 4));
  }
  return bytes;
}

async function main() {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

  // 用捕获会话 cd 跑管线
  const capFile = fs.readdirSync(OUT).filter(f => f.startsWith('enc_')).sort().pop();
  const cap = JSON.parse(fs.readFileSync(path.join(OUT, capFile)));
  const nsd = cap.challenge.nsd, cd = cap.challenge.cd;
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/nx-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/nx-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const { $_ts: fullTs, codemap } = coder.run();
  fullTs.cp[3] = r.cp3;
  gv.config.codemap = codemap;
  const cookie = new Cookie(coder).run();
  const keys16 = gv.keys[16], keys17 = gv.keys[17], keys2 = gv.keys[2];
  console.log('管线 cookie len:', cookie.length, '名:', gv.utils.ascii2string(gv.keys[7]).split(';')[5] + 'P');
  console.log('keys16:', keys16.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 管线 cookie 解码
  const pBytes = decodeStr(cookie);
  console.log('\n管线 cookie 解码:', pBytes.length, '字节 (', pBytes.length - 16, '有效密文)');

  // 用 keys16 遍历 time/ele 解密（管线 cookie 的 time/ele 未知，遍历）
  const now = Math.floor(Date.now() / 1000);
  let found = null;
  for (let t = now - 120; t <= now + 120; t++) {
    for (let ele = 1; ele <= 256; ele++) {
      try {
        const arr = numarrAddTime([...keys16], t, ele / 256)[0];
        const dec = encryptMode2([...pBytes], arr, 1);
        if (dec.length > 100 && dec[4] === 2 && dec[13] === 48) {
          console.log('★ 管线 cookie 解密成功 t=' + t + ' ele=' + ele + ' decLen=' + dec.length);
          found = { t, ele, dec };
          break;
        }
      } catch (e) {}
    }
    if (found) break;
  }
  if (!found) {
    console.log('✗ 管线 cookie 无法用 keys16 解出（密钥不是 keys16 或结构不同）');
    // 试试 flag=0
    for (let t = now - 120; t <= now + 120; t++) {
      for (let ele = 1; ele <= 256; ele++) {
        try {
          const arr = numarrAddTime([...keys16], t, ele / 256)[0];
          const dec = encryptMode2([...pBytes], arr, 0);
          if (dec.length > 100 && dec[4] === 2 && dec[13] === 48) {
            console.log('★ flag=0 解密成功 t=' + t + ' ele=' + ele);
            found = { t, ele, dec };
            break;
          }
        } catch (e) {}
      }
      if (found) break;
    }
  }
  if (found) {
    console.log('\nnextarr 前 20:', found.dec.slice(0, 20).join(','));
    console.log('uuid4:', found.dec.slice(0, 4).map(b => b.toString(16)).join(''));
  }

  // 真实 cookie 对比
  const realCookie = cap.cookies.find(c => c.name.endsWith('P')).value;
  const rBytes = decodeStr(realCookie);
  console.log('\n真实 cookie 解码:', rBytes.length, '字节');
  console.log('真实 cookie:', realCookie.substring(0, 60) + '...');
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
