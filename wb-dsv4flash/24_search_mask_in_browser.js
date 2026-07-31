/**
 * 24_search_mask_in_browser.js
 *
 * 在浏览器 send hook 的闭包数组中搜索 PREFIX_MASK 序列 [11,22,0,16,0,49,0,1,...]
 * 目的：定位掩码在本地 JS 中的存储位置/生成来源
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

// 目标掩码（前 10 字节恒定 + 2 变化 + 1 尾）
const MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01, 0x51, 0xb7];

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  console.log('[1] 启动浏览器...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');

  console.log('[2] 加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);

  // 定位 send hook 闭包
  const sendSrcR = await cdp.send('Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
  const sendSrc = sendSrcR.result.value;
  const dm = sendSrc.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
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
  const dSrc = dSrcR.result.value;
  const m32 = dSrc.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName = m32 ? m32[1] : null;

  // 遍历 send hook 的所有闭包变量
  const sendObj2 = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps2 = await cdp.send('Runtime.getProperties', { objectId: sendObj2.result.objectId, ownProperties: true });
  let scopesId2;
  for (const ip of (sendProps2.internalProperties || [])) { if (ip.name === '[[Scopes]]') scopesId2 = ip.value.objectId; }
  const scopes2 = await cdp.send('Runtime.getProperties', { objectId: scopesId2, ownProperties: true });

  console.log('[3] 遍历闭包数组搜索掩码...');
  const found = [];
  let arrayCount = 0;

  async function scanArray(objId, varName, depth) {
    try {
      const props = await cdp.send('Runtime.getProperties', { objectId: objId, ownProperties: true });
      if (!props.result || !props.result.length) return;
      const numericIndices = props.result.filter(p => /^\d+$/.test(p.name));
      const isArr = numericIndices.length > 2;
      if (isArr) {
        arrayCount++;
        const elems = numericIndices.map(p => p.value?.value);
        if (elems.length > 5) {
          // 宽松搜索：前 2 字节 [11,22] 连续
          for (let i = 0; i + 2 <= elems.length; i++) {
            if (elems[i] === MASK[0] && elems[i + 1] === MASK[1]) {
              found.push({ varName, len: elems.length, offset: i, sample: elems.slice(Math.max(0, i - 3), i + 15) });
              console.log(`  ★ 找到 [11,22]! var=${varName} len=${elems.length} @offset=${i} 前后: ${elems.slice(Math.max(0,i-3), i+15).join(',')}`);
            }
          }
          // 也搜完整的 10 字节
          for (let i = 0; i + 10 <= elems.length; i++) {
            let match = true;
            for (let j = 0; j < 10; j++) if (elems[i + j] !== MASK[j]) { match = false; break; }
            if (match) { console.log(`  ★★★ 完整掩码 10B! var=${varName} @${i}`); }
          }
        }
      } else if (depth < 2) {
        for (const p of props.result.slice(0, 50)) {
          if (p.value?.objectId) await scanArray(p.value.objectId, varName + '.' + p.name, depth + 1);
        }
      }
    } catch (e) {}
  }

  // 收集所有闭包 scope 的变量
  const allScopes = [];
  for (const scope of scopes2.result) {
    if (scope.value?.objectId) allScopes.push(scope.value.objectId);
  }
  const dProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dScopesId;
  for (const ip of (dProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dScopesId = ip.value.objectId; }
  if (dScopesId) {
    const dScopes = await cdp.send('Runtime.getProperties', { objectId: dScopesId, ownProperties: true });
    for (const scope of dScopes.result) {
      if (scope.value?.objectId) allScopes.push(scope.value.objectId);
    }
  }

  // 也扫描 global 数组
  const gObj = await cdp.send('Runtime.evaluate', { expression: 'document.documentElement' });
  for (const scopeId of allScopes) {
    const vars = await cdp.send('Runtime.getProperties', { objectId: scopeId, ownProperties: true });
    for (const v of vars.result) {
      if (v.value?.objectId) await scanArray(v.value.objectId, v.name, 0);
    }
  }

  console.log('\n[4] 扫描完成: ' + arrayCount + ' 个数组');
  if (!found.length) {
    console.log('  ❌ 未找到掩码字面量 → 掩码可能是运行时生成的（非字面常量）');
  }
  const out = path.join(OUT, 'mask_search_' + Date.now() + '.json');
  fs.writeFileSync(out, JSON.stringify({ found, arrayCount }, null, 2));
  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
