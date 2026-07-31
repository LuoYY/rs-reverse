/**
 * 55_node_compare_keys.js
 *
 * Node 侧：用浏览器捕获的 challenge（同 cd）跑管线，对比 keys
 * 然后构造 cookie 通过浏览器重放（浏览器保持打开）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

async function main() {
  // 等浏览器 ready
  for (let i = 0; i < 30; i++) {
    if (fs.existsSync(path.join(OUT, 'browser_ready.json'))) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!fs.existsSync(path.join(OUT, 'browser_ready.json'))) { console.log('浏览器未就绪'); return; }

  const ready = JSON.parse(fs.readFileSync(path.join(OUT, 'browser_ready.json')));
  const syncFile = path.isAbsolute(ready.file) ? ready.file : path.join(OUT, ready.file);
  const sync = JSON.parse(fs.readFileSync(syncFile));
  const { challenge, browserKeys } = sync;
  console.log('浏览器 challenge nsd:', challenge.nsd);
  console.log('浏览器 keys16:', browserKeys.keys16.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('浏览器 keys2 前8:', browserKeys.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 管线同 cd
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
  const r = runOuterVM({ nsd: challenge.nsd, cd: challenge.cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd: challenge.nsd, cd: challenge.cd, from: TARGET, hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/nx-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/nx-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'error', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  try {
    const makeCookie = require('@src/makeCookie');
    const pipeCookie = makeCookie(ts, () => path.join(ROOT, 'output'));
    console.log('管线 cookie:', pipeCookie.length);

    console.log('\n管线 keys16:', gv.keys[16].map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('管线 keys17:', gv.keys[17].map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('管线 keys2 :', gv.keys[2].map(b => b.toString(16).padStart(2, '0')).join(' '));

    console.log('\n=== keys 对比 ===');
    console.log('keys16 匹配:', gv.keys[16].every((b, i) => b === browserKeys.keys16[i]) ? 'YES ✓' : 'NO ✗');
    console.log('keys17 匹配:', gv.keys[17].every((b, i) => b === browserKeys.keys17[i]) ? 'YES ✓' : 'NO ✗');
    console.log('keys2  匹配:', gv.keys[2].every((b, i) => b === browserKeys.keys2[i]) ? 'YES ✓' : 'NO ✗');

    // 构造 nx cookie（用浏览器 numenc 或 basearr303）
    const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
    const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
    const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
    const tools = require('@src/handler/parser/common/tools');
    const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
    function encodeStr(bytes) {
      let out = '';
      let i = 0;
      while (i + 3 <= bytes.length) {
        const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
        out += BASESTR[b0 >> 2] + BASESTR[((b0 & 3) << 4) | (b1 >> 4)] + BASESTR[((b1 & 15) << 2) | (b2 >> 6)] + BASESTR[b2 & 63];
        i += 3;
      }
      if (i + 2 === bytes.length) {
        out += BASESTR[bytes[i] >> 2] + BASESTR[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)] + BASESTR[(bytes[i + 1] & 15) << 2];
      } else if (i + 1 === bytes.length) {
        out += BASESTR[bytes[i] >> 2] + BASESTR[(bytes[i] & 3) << 4];
      }
      return out;
    }

    // 用浏览器 numenc（精确）
    gv.config.adapt.getKey = 0x68;
    const browserKeys2 = browserKeys.keys2;
    const innerInput = sync.browserKeys.innerInput;
    const numenc = innerInput.map((b, i) => i < 16 ? b ^ browserKeys2[i] : b);
    const xorRed = tools.xor([...numenc], [...gv.keys[2]], 16);
    const now = Math.floor(Date.now() / 1000);
    const innerEnc = encryptMode1([...xorRed], numarrAddTime([...gv.keys[17]], now, Math.random())[0], 0);
    const t4 = [(now >>> 24) & 255, (now >>> 16) & 255, (now >>> 8) & 255, now & 255];
    const encLenBytes = innerEnc.length > 255 ? [0x80 | (innerEnc.length >> 8), innerEnc.length & 255] : [innerEnc.length];
    const nextarr = [4, 8, ...t4, ...t4, 48, ...gv.keys[2], ...encLenBytes, ...innerEnc];
    const outerEnc = encryptMode1([183, 202, 150, 131, ...nextarr], numarrAddTime([...gv.keys[16]], now, Math.random())[0], 1);
    const cookie = 'a' + encodeStr(outerEnc);
    const pName = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + 'P';
    console.log('\n构造 cookie:', pName, 'len=' + cookie.length);

    // 写结果供浏览器重放
    fs.writeFileSync(path.join(OUT, 'node_result.json'), JSON.stringify({ cookie, pName, ok: true }));
  } catch (e) {
    console.log('管线失败:', e.message.substring(0, 80));
    fs.writeFileSync(path.join(OUT, 'node_result.json'), JSON.stringify({ ok: false, err: e.message.substring(0, 100) }));
  }
  fs.writeFileSync(path.join(OUT, 'node_done.json'), JSON.stringify({ done: true }));
  console.log('\n完成');
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
