/**
 * 95_nx_proxy_online.js
 *
 * 带 HTTP 代理（CONNECT 隧道）的 nx 完整在线流程：
 *   拉挑战页 → runOuterVM 提取 cp3 → 管线 makeCookie → 重放验证 200
 * 多会话循环，记录每会话 commonFunc 状态（是否 Illegal return / 括号不平衡）
 *
 * 用法：node 95_nx_proxy_online.js [会话数]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');

const ROOT = path.join(__dirname, '..');
const PROXY = 'http://74940609:aFmWc5Fs@119.167.233.189:2018';
const PROXY_URL = new URL(PROXY);
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];

// ★ K16 锚扫描推导 offset（keys16==K16 唯一命中）→ nx keys 纯算法（绕过 runTask）
function getLensGo(numarr, idx) {
  const item = numarr[idx]; idx++;
  let lens;
  if ((item & 128) === 0) lens = item;
  else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; }
  else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; }
  else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; }
  else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; }
  else lens = item;
  return [lens, idx];
}
function genKeysSim(ans, step) {
  const keys = [];
  let op = 1, gap;
  try {
    for (let i = 0; i < ans[0]; i++) {
      if (step === 2) { if (op + 1 >= ans.length) return null; gap = (ans[op] << 8) | ans[op + 1]; op += 2; }
      else { [gap, op] = getLensGo(ans, op); }
      if (gap < 0 || op + gap > ans.length) return null;
      keys.push(ans.slice(op, op + gap));
      op += gap;
    }
  } catch (e) { return null; }
  return keys;
}
function deriveOffset(tail) {
  // ★ 通用推导（step1 布局 + 枚举 keys[0]，keys[1]=keys[0]）：
  //   ans[0]=51, ans[1]=2, ans[4]=2, ans[7]=48（固定）；keys[0] 枚举 → 结构验证唯一
  try {
    const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48;
    for (let k0 = 0; k0 <= 127; k0++) {
      const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0;
      for (let k1 = 0; k1 <= 127; k1++) {
        const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1;
        const offset = [off0, off1, off2, off3, off4, off5, off6, off7];
        const ans = tail.map((b, i) => b ^ offset[i % 8]);
        if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
        const keys = genKeysSim(ans, 1);
        if (keys && [29, 30, 31, 32].every(k => keys[k] && keys[k].length === 4) && keys[2] && keys[2].length === 48) {
          return { offset, keys, numKeys: 51, k0, k1 };
        }
      }
    }
  } catch (e) {}
  return null;
}

// HTTP 代理 CONNECT 隧道的 HTTPS GET
function httpsGetWithProxy(url, cookieH) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({
      host: PROXY_URL.hostname, port: +PROXY_URL.port, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_AUTH, Host: `${u.hostname}:${u.port || 443}` },
      timeout: 25000,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR', error: 'CONNECT ' + res.statusCode }); return; }
      const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        const reqLine = `GET ${u.pathname + u.search} HTTP/1.1\r\n`;
        const head = `Host: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\n${cookieH ? `Cookie: ${cookieH}\r\n` : ''}Connection: close\r\n\r\n`;
        tlsSock.write(reqLine + head);
      });
      let body = '';
      tlsSock.on('data', d => body += d);
      tlsSock.on('end', () => {
        const headEnd = body.indexOf('\r\n\r\n');
        if (headEnd < 0) { resolve({ status: 'ERR', error: 'bad response' }); return; }
        const head = body.substring(0, headEnd);
        const status = parseInt((head.split(' ')[1] || '').trim());
        const setCookies = [];
        head.split('\r\n').forEach(l => { const m = l.match(/^set-cookie:\s*(.+)$/i); if (m) setCookies.push(m[1]); });
        resolve({ status, headers: { 'set-cookie': setCookies }, body: body.substring(headEnd + 4) });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR', error: e.message }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR', error: e.message }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'ERR', error: 'TIMEOUT' }); });
    connectReq.end();
  });
}

async function main() {
  const rounds = parseInt(process.argv[2] || '3');
  let ok = 0;
  for (let i = 1; i <= rounds; i++) {
    console.log(`\n========== 会话 ${i}/${rounds} ==========`);
    try {
      const ch = await httpsGetWithProxy(TARGET);
      if (ch.status === 'ERR' || ch.status !== 412) { console.log('挑战页:', ch.status, ch.error || ''); continue; }
      const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
      if (!m) { console.log('无 $_ts'); continue; }
      const nsd = +m[1], cd = m[2];
      const setCookies = [].concat(ch.headers['set-cookie'] || []);
      const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
      const [oName, oVal] = oCookie.split('=');
      console.log('nsd=' + nsd + ' cdLen=' + cd.length + ' O=' + (oName || '') + ' len=' + (oVal || '').length);

      for (const k of Object.keys(require.cache)) delete require.cache[k];
      require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
      const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
      const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
      const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
      if (!r.cp3) { console.log('cp3 提取失败'); continue; }
      console.log('cp3:', r.cp3, 'dynLen:', r.dynLen);

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

      // ★ K16 锚扫描推导 offset（绕过 runTask——codemap 对 nx 不适配）
      try {
        require('@src/handler/parser/constData').init();
        const decrypt = require('@src/handler/parser/common/decrypt');
        const cdArr = decrypt(cd);
        const end = (cdArr[0] << 8 | cdArr[1]) + 2;
        const d = deriveOffset(cdArr.slice(end));
        if (d && !process.env.NX_NO_OFFSET) {
          gv._setAttr('dynamicTaskOffset', d.offset);
          console.log('  ★ offset 推导:', d.offset.map(b => b.toString(16).padStart(2, '0')).join(' '), 'numKeys:', d.numKeys, 'keys16==K16 确认');
        } else {
          console.log('  offset 推导失败/跳过（NX_NO_OFFSET）');
        }
      } catch (e) {
        console.log('  offset 推导错误:', e.message.substring(0, 60));
        if (process.env.DEBUG_STACK) console.log(e.stack.split('\n').slice(0, 6).join('\n'));
      }

      let cookie;
      try {
        const makeCookie = require('@src/makeCookie');
        cookie = makeCookie(ts, () => path.join(ROOT, 'output'));
      } catch (e) {
        console.log('makeCookie 失败:', e.message.substring(0, 120));
        if (process.env.DEBUG_STACK) console.log(e.stack.split('\n').slice(0, 12).join('\n'));
        try {
          const rb = gv._getAttr('rebuiltCode') || '';
          fs.writeFileSync('/tmp/nx_rebuilt_code.js', rb);
          console.log('  dumped rebuiltCode:', rb.length, '含 _$pk:', rb.includes('_$pk'), '含 _$oE:', rb.includes('_$oE'), '含 _$f0:', rb.includes('_$f0'));
        } catch (e3) {}
        try {
          const ut = gv.r2mka('U14124020');
          console.log('  U14124020:', ut ? ut.length + ' 个' : '不存在');
          if (ut && ut[0]) {
            console.log('  key:', ut[0].key, 'taskarr:', JSON.stringify(ut[0].taskarr || []).substring(0, 120));
            const cm2 = gv.config.codemap;
            const ta2 = ut[0].taskarr || [];
            ta2.slice(0, 15).forEach((idx2, i) => {
              console.log(`  task[${i}]=${idx2}:`, typeof cm2[idx2] === 'string' ? cm2[idx2].substring(0, 150).replace(/\n/g, ' ') : '非字符串');
            });
          }
        } catch (e4) {}
        // 尝试从 codemap 诊断
        try {
          const Coder = require('@src/handler/Coder');
          const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
          const { codemap } = coder.run();
          const cf = String(codemap && codemap.commonFunc || '');
          console.log('  commonFunc 长度:', cf.length);
          const opens = (cf.match(/\{/g) || []).length, closes = (cf.match(/\}/g) || []).length;
          console.log('  括号: {=' + opens + ' }=' + closes + (opens === closes ? '（平衡）' : '（不平衡）'));
        } catch (e2) { console.log('  codemap 诊断失败:', e2.message.substring(0, 80)); }
        continue;
      }
      const pName = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + 'P';
      console.log('cookie:', pName + ' len=' + cookie.length);

      // ★ 同进程反解验证（用实际 gv.keys + config.runTime）
      try {
        const parser2 = require('@src/handler/parser');
        const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
        const numarrAddTime2 = require('@src/handler/parser/common/numarrAddTime');
        const BASESTR2 = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
        const idxmap2 = {}; for (let i = 0; i < BASESTR2.length; i++) idxmap2[BASESTR2[i]] = i;
        const payload2 = cookie.startsWith('0') ? cookie.slice(1) : cookie;
        const bytes2 = []; let qi2 = 0;
        for (let g = 0; g < Math.floor(payload2.length / 4); g++) {
          const c0 = idxmap2[payload2[qi2]], c1 = idxmap2[payload2[qi2 + 1]], c2 = idxmap2[payload2[qi2 + 2]], c3 = idxmap2[payload2[qi2 + 3]]; qi2 += 4;
          bytes2.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
        }
        const rt2 = gv.makecookieRuntimeConfig.runTime;
        let selfFound = null;
        for (let ele = 1; ele <= 256 && !selfFound; ele++) {
          const arr2 = numarrAddTime2([...gv.keys[16]], rt2, ele / 256)[0];
          const dec2 = encryptMode2([...bytes2], arr2, 1);
          if (dec2.length > 20) {
            const calc2 = parser2.numToNumarr4(parser2.uuid(dec2.slice(4)));
            if (calc2.every((b, i) => b === dec2[i])) { selfFound = { ele, dec: dec2 }; break; }
          }
        }
        console.log('  同进程反解:', selfFound ? '★★★ 自洽! ele=' + selfFound.ele + ' nextarr=' + selfFound.dec.slice(4, 24).map(b => b.toString(16).padStart(2, '0')).join(' ') : '✗ 不自洽（runTime=' + rt2 + ' 遍历256仍失败）');
      } catch (e) {
        console.log('  反解验证错误:', e.message.substring(0, 60));
      }

      const resp = await httpsGetWithProxy(TARGET, `${oName}=${oVal}; ${pName}=${cookie}`);
      console.log('重放 →', resp.status, resp.status === 200 ? '★★★ 成功!' : '');
      // 保存会话（即使失败，用于分析 keys/cookie 结构）
      try {
        const session = {
          capturedAt: Date.now(), nsd, cd, oCookie, status: resp.status,
          cookie: pName + '=' + cookie,
          offset: gv._getAttr('dynamicTaskOffset') || null,
          keys: gv.keys || null,
          keys2: (gv.keys || [])[2] || null,
          keys16: (gv.keys || [])[16] || null,
          keys17: (gv.keys || [])[17] || null,
          basearr: gv.makecookieRuntimeConfig ? (() => { try { return require('@src/handler/basearr')({}, gv); } catch (e) { return null; } })() : null,
          runTime: gv.makecookieRuntimeConfig ? gv.makecookieRuntimeConfig.runTime : null,
          random: gv.makecookieRuntimeConfig ? gv.makecookieRuntimeConfig.random : null,
          codeUid: gv.makecookieRuntimeConfig ? gv.makecookieRuntimeConfig.codeUid : null,
        };
        fs.writeFileSync(path.join(__dirname, 'captures', `derived_${resp.status}_${Date.now()}.json`), JSON.stringify(session));
        console.log('  会话已保存 derived_' + resp.status + '_' + Date.now() + '.json');
      } catch (e5) {}
      if (resp.status === 200) {
        ok++;
        const result = { capturedAt: Date.now(), nsd, cd, cookie: pName + '=' + cookie, oCookie };
        fs.writeFileSync(path.join(__dirname, 'captures', `cookie_ok_${Date.now()}.json`), JSON.stringify(result));
      }
    } catch (e) {
      console.log('会话失败:', e.message.substring(0, 120));
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log(`\n===== 汇总: ${ok}/${rounds} 成功 =====`);
  process.exit(0);
}
main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
