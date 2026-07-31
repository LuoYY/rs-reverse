/**
 * 25_mask_xor_test.js
 *
 * 在 [165] 断点时，获取 plain24 + keys2，然后对所有可达数组测试：
 *   arr[i..i+7] XOR keys2[0..7] == plain24[0..7]？
 * 如果某数组满足，它就是用 keys2 异或生成 prefix 的掩码来源。
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  console.log('[1] 启动...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  console.log('[2] 加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);

  // 定位 global
  const sendSrcR = await cdp.send('Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
  const dm = sendSrcR.result.value.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dName = dm[1];
  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  let scopesId;
  for (const ip of (sendProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId; }
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  let dId;
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) { if (v.name === dName && v.value?.type === 'function') dId = v.value.objectId; }
  }
  const dSrcR = await cdp.send('Runtime.callFunctionOn', { objectId: dId, functionDeclaration: 'function() { return Function.prototype.toString.call(this); }', returnByValue: true });
  const m32 = dSrcR.result.value.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName = m32 ? m32[1] : null;
  const dispProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dispScopesId;
  for (const ip of (dispProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dispScopesId = ip.value.objectId; }
  const dispScopes = await cdp.send('Runtime.getProperties', { objectId: dispScopesId, ownProperties: true });
  let globalId = null;
  for (const scope of dispScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) { if (v.name === globalName && v.value?.objectId) globalId = v.value.objectId; }
  }

  // [165] 断点
  const f165 = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return this[165]; }' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: f165.result.objectId });
  console.log('[3] 断点设置');

  let hit = 0;
  cdp.on('Debugger.paused', async (params) => {
    hit++;
    const f0 = params.callFrames[0];
    let plain24 = null, key21 = null;
    // frame 0: 参数
    for (const scope of f0.scopeChain) {
      if (!scope.object?.objectId) continue;
      const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
      for (const p of props.result) {
        if (p.name === '_$$g' && p.value?.objectId) {
          const arr = await cdp.send('Runtime.getProperties', { objectId: p.value.objectId, ownProperties: true });
          plain24 = arr.result.filter(x => /^\d+$/.test(x.name)).sort((a, b) => +a.name - +b.name).map(x => x.value?.value);
        }
        if (p.name === '_$dI' && p.value?.objectId) {
          const arr = await cdp.send('Runtime.getProperties', { objectId: p.value.objectId, ownProperties: true });
          key21 = arr.result.filter(x => /^\d+$/.test(x.name)).sort((a, b) => +a.name - +b.name).map(x => x.value?.value);
        }
      }
    }
    if (hit === 1) {
      // 触发 query 加密（第三次 hit 是 query：24→32）
      // 这里先记录，后面统一处理
    }

    // 对第 3 次 hit（query 加密）做分析
    if (plain24 && plain24.length === 24) {
      console.log('\n=== hit ' + hit + ' plain24: ' + plain24.map(b => b.toString(16).padStart(2, '0')).join(' ') + ' ===');
      // keys2: 从 frame 1 的 _$c3（[1,0,48,keys2...]）获取
      const f1 = params.callFrames[1];
      if (f1) {
        for (const scope of f1.scopeChain) {
          if (!scope.object?.objectId) continue;
          const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
          for (const p of props.result) {
            if (p.name === '_$c3' && p.value?.objectId) {
              const arr = await cdp.send('Runtime.getProperties', { objectId: p.value.objectId, ownProperties: true });
              const c3 = arr.result.filter(x => /^\d+$/.test(x.name)).sort((a, b) => +a.name - +b.name).map(x => x.value?.value);
              if (c3.length > 20 && c3[0] === 1 && c3[2] === 48) {
                const keys2 = c3.slice(3, 51);
                console.log('  keys2[0:8]: ' + keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
                const mask = plain24.slice(0, 8).map((b, i) => b ^ keys2[i]);
                console.log('  mask[0:8]: ' + mask.map(b => b.toString(16).padStart(2, '0')).join(' '));

                // 搜索 frame 1 所有数组，测试 arr[i..i+7] == mask（掩码来源）
                for (const p2 of props.result) {
                  if (!p2.value?.objectId) continue;
                  try {
                    const arr2 = await cdp.send('Runtime.getProperties', { objectId: p2.value.objectId, ownProperties: true });
                    const elems = arr2.result.filter(x => /^\d+$/.test(x.name)).sort((a, b) => +a.name - +b.name).map(x => x.value?.value);
                    if (elems.length >= 8 && elems.every(e => typeof e === 'number')) {
                      for (let i = 0; i + 8 <= elems.length; i++) {
                        let m = true;
                        for (let j = 0; j < 8; j++) if (elems[i + j] !== mask[j]) { m = false; break; }
                        if (m) console.log(`  ★★★ 掩码来源: var=${p2.name} @${i} len=${elems.length} 完整10B=${elems.slice(i, i + 12).join(',')}`);
                      }
                    }
                  } catch (e) {}
                }
              }
            }
          }
        }
      }
    }
    if (hit < 4) await cdp.send('Debugger.resume').catch(() => {});
    else await cdp.send('Debugger.resume').catch(() => {});
  });

  // 触发（会 hit 3 次：cookie 内层、cookie 外层、query）
  const trig = await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  console.log('[4] 触发:', trig.result.value);
  await page.waitForTimeout(3000);
  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
