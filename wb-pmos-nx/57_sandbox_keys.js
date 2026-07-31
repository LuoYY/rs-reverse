/**
 * 57_sandbox_keys.js
 *
 * 沙箱执行外层 VM + 动态代码生成 cookie，反解 keys
 * 验证：沙箱 keys == 浏览器 keys（同 cd，keys 与指纹正交）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

async function main() {
  // 读取浏览器同步捕获（同 cd 的 keys）
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const nsd = sync.challenge.nsd, cd = sync.challenge.cd;
  console.log('浏览器 challenge nsd:', nsd);
  console.log('浏览器 keys2:', sync.browserKeys.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 初始化管线（反解需要 parser + keys16）
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 1151 };
  fs.writeFileSync('/tmp/nx-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/nx-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'error', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  // 管线 keys16（站点常量，Coder 重建后可得）
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  try {
    coder.run();
    console.log('管线 keys16:', gv.keys[16].map(b => b.toString(16).padStart(2, '0')).join(' '));
  } catch (e) {
    console.log('Coder.run 失败（不阻塞反解，用浏览器 keys16）:', e.message.substring(0, 60));
  }

  // 沙箱执行（参数化 buildEnv：必须传 nx target/ua，否则 location 不匹配死循环）
  const sandboxKeygen = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const parser = require('@src/handler/parser');
  const r = await sandboxKeygen.genKeysViaSandbox({ nsd, cd }, {
    outerJsCode: fs.readFileSync(OUTER_JS, 'utf8'),
    target: 'https://pmos.nx.sgcc.com.cn:10443/',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    gv, parser,
    timeout: 120000,
  });
  console.log('\n沙箱结果:');
  console.log('  cookie:', r.cookie ? r.cookie.substring(0, 30) + '... len=' + r.cookie.length : 'null');
  console.log('  dynCodeLen:', r.meta.dynCodeLen, 'cp3:', r.meta.cp3);
  console.log('  uuidOk:', r.uuidOk, 'nextarrLen:', r.nextarrLen);
  console.log('  errors:', (r.meta.errors || []).slice(0, 5));

  // 反解 keys：沙箱 cookie → 外层 keys16 → nextarr → keys2 → 内层 → keys17
  if (r.cookie) {
    const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
    const idxmap = {};
    for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
    const payload = r.cookie.split('=')[1].replace(/^./, '');
    const bytes = [];
    let qi = 0;
    const groups = Math.floor(payload.length / 4);
    for (let g = 0; g < groups; g++) {
      const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]];
      qi += 4;
      bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
    }
    if (qi + 2 < payload.length) {
      const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]];
      bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2));
    } else if (qi + 1 < payload.length) {
      bytes.push((idxmap[payload[qi]] << 2) | (idxmap[payload[qi + 1]] >> 4));
    }
    console.log('沙箱 cookie 解码:', bytes.length, 'B');

    // 用 keys16 解密外层（flag=1，带 IV）
    const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
    const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
    const now = Math.floor(Date.now() / 1000);
    const keys16 = gv.keys[16];
    let found = null;
    for (let t = now - 120; t <= now + 120; t++) {
      for (let ele = 1; ele <= 256; ele++) {
        try {
          const arr = numarrAddTime([...keys16], t, ele / 256)[0];
          const dec = encryptMode2([...bytes], arr, 1);
          if (dec.length > 100 && dec[4] === 2 && dec[13] === 48) {
            found = { t, ele, dec };
            break;
          }
        } catch (e) {}
      }
      if (found) break;
    }
    if (found) {
      const dec = found.dec;
      let pos = 4;
      pos += 1; pos += 4; pos += 4;  // [2][t4][start4]
      const k2len = dec[pos++];
      const sandKeys2 = dec.slice(pos, pos + k2len);
      console.log('沙箱 keys2:', sandKeys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('浏览器 keys2:', sync.browserKeys.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('keys2 匹配:', sandKeys2.every((b, i) => b === sync.browserKeys.keys2[i]) ? 'YES ✓' : 'NO ✗');
    } else {
      console.log('沙箱 cookie 外层解密失败');
    }
  }
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
