/**
 * 719_debug_custom_nsd.js
 * 调试：加载自定义 nsd 的 html，观察请求序列/dynCode/暂停/页面状态
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PROXY = 'http://127.0.0.1:9000';
const nxRaw = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock/412.raw', 'utf8');
const nxHtml = nxRaw.substring(nxRaw.indexOf('\r\n\r\n') + 4); // 提取纯 body
// 从真实站点拉一份不同 nsd 的 html（用 reqable 抓不了，直接读保存的样本——用 nx-mock 的 html 改 nsd/cd）
// 用 nx-mock 的 html 作为基础，替换 nsd/cd 为不同值
const customNsd = 54321;
const customCd = 'qhwSr1qlEk9ciqgkiAq0rs9oiqgliAV0rs9MiqgmHqqyrO7XEAaqmqAjEGV0ckaqiAWyqkGviA30ccQqiAAyrsGviAW0ckaqiAlPrOGviAAyrALqmAAjiAl0oO9liqgmHqq4hf3yrOAEHr7yrk9micQZqk7XmuaqiAEPquGviAlqmGA3Hqqyqk9rEnQyrkGirsaqiAEyquGvip7qmaAFiA3gkGWyrsGiqO9MiqgmHqqyrO9oicQwrqquJOV0ruWuJ0-MRav2leNlw4S_5mr9OFkgfKmk02Go43I0slFApgpUuQY7UdsulGWC2akNYbTVxGlmqaljr33u8KwiYoSfsCZ48URnYuxTI0QHs0za1lrwsvLgJ0mv3K2-YuW4WkRcUKyO3YE5J2YW8YYbFklnwugakCqywmSYQumkJv2iwuSI1GV4WvmHIvlSVD94HsR2QkrYY6RlVOrWhG36WuEZHO3XUvq4AK9npvrypbfjWTyChG36WuEZHO3XUvq4A6WdAmwCW2NYQDyhhG36WuEZHO3XUvq43TZTFDYFM0mZA2mch2yaiuVZROV6q0VSJvJPVkz9JmmQsVYuYoRfJ9G5Vuyar2Y9YlyIpOp4iDSrVKpq1qT9FlwvFc9nqkq6HkaCtKNoikfnQvrf3TzliVzEs19nqkq6HkaCtKNoikfb1DyKwVJPWlyzwc9nqkq6HkaCtKNoimmlJDJpQarB3OrDYuaasbpPYC9SRmp4KTEmrkQDW1x-womTwk0ursVgWkW5HuVmislTWsW0rG36WuEZHGASqOltJkVaWuQJWuATJAgSWA3aJuQSHuQAgT2Qw4XbTs7kaZaoTmGK-1pFKWnYpF02haW0rGVcqGQuE09JYZRgy-oBo3zWkO5l1eIA2Ogz1alUux1OgJE6M28ZckQ6HOqnqkLnrkAJJOQWJOQCWuA0JkAkqsllJa36z_Q6In2btCmY3cS9FoV-3VpLhDp6tCRuK1efQCa-RKmUhCx9RbSnQrff3KgNRKR0DDmNFn22Fvq33UL6tKA-3TYfhDR9RDe2DDrPIn293bE33DYvI1z9RVR6hDROFPzOKKx-3c29FDR1RbVNRbfjhmw7MbWNRDfXVbNvtKR6wnSUQUANRvp0hmwawP2fRvW7VDl73Kr2tCppRKmaFUW-RmfBhDmL3cz9KCq73KN9InSAMoAN3De6hmmXMc2GFUl7VKS0tKrutCYWRPSOFK3-R2fP3n2OFCA7VbeCtKJLF1S1MDyStKmLwrf9RDQN3DeBDDpN3n2GMvA3RD2SMDrNM0RbhDxdtCr_UUW7MK26tCflQnSzQKR93TmaQn2zQCA7UowaRoR0QDA3FbJjtKyj3YJbhDS-RczNKbr7QDmPtC2FR1S7FCg-FYNahDSTRPzNpCa7MCpTtCNYwKlNM6wPRSfNQDENMUA7UvrBFn273v93MC2vtKzL3TZBMDNPtCzTY1e7ICfbtC0q3PSLRD2XR2mawc2LRvQ7KKQ7FDlntCTA31SLMDW-MYTXhDfXQ1zzKCQ7FDNStCTlWcSLwsW-MVpPhDfT3bq7KUJvtKf6wnSRQD9NFoy0QYGBMbSNtC2TKKm2w63-FDx8hCebI1zLRlABMCmCtCf9AceB3bE-FDSKhCeN31zLMmlBM6mOtCfTAceBQCA-wCmsRvWNwKR0hlpPQ6Rn3nzaYCxatUYO31SlRb0NwKrjhlp9Q6pNt6wNYneaF126FC93QCS7wvW-QmN9hoYjFPzapDg7wUY0t6rlwnSTwUJdhlpSM6YGwUJNVUq7wUROt6rr31STQbW-Ql0BQoSbt6ROK6AntUpX31Smw6GNwC3-Q2YXhow9w1znYPen3DE-wKYoh6xLtUYjw23BQvYLt6Y0VPenQKf6t6JKMnSC36Z-QTaBQCT9t6pLYsE7wbL-wom3h6J0FKyuRpfaQK27QCEuDorSFKSu3bpKh6Ju3Pz0wTVBQ6xOt6p6pceuIo3-QCmDh6p9InzuRY2uhomPI1z0UKV7QKSf31SqMvqNQKfTQ2mzwc2SwC77AorCtUmu31Sq86ANQCV-w9wvhoJCwczCp6A7Q6TOt6wYQ1SnRol-wTmfM12n3bYaDopNFc2aFbl3wDTutUrLR2EBwCNO3sV7A6JutUT2FPSWM6WNIKz08rf4MK9NI6wzDozuF12dI1SJ3bTNtUyjMrfyhoe7waQlFnwbwAm3ECfIrTZf3ogkUSrLQq36WuqcqsWrJqACraq0qaVuJsQ6WklTJulTJAQrrAEarAanJsllWO9eWuVoqAAcWA';
const customHtml = nxHtml
  .replace(/nsd=\d+/, 'nsd=' + customNsd)
  .replace(/cd="[^"]+"/, 'cd="' + customCd + '"');

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    proxy: { server: PROXY },
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  page.on('request', req => {
    if (['document', 'script'].includes(req.resourceType())) console.log(`[REQ] ${req.resourceType()} ${req.url().replace(TARGET, '/')}`);
  });
  page.on('response', res => {
    if (['document', 'script'].includes(res.request().resourceType())) console.log(`[RES] ${res.status()} ${res.request().url().replace(TARGET, '/')}`);
  });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().substring(0, 100)); });

  const bigScripts = [];
  cdp.on('Debugger.scriptParsed', (p) => {
    if (p.length > 100000) bigScripts.push({ len: p.length, url: (p.url || '(eval)').substring(0, 60) });
  });

  await page.route('**/*', (route) => {
    if (route.request().resourceType() === 'document') {
      route.fulfill({
        status: 412, contentType: 'text/html',
        headers: { 'Set-Cookie': '3RKyaeh47p90O=test; Path=/; Secure; HttpOnly' },
        body: customHtml,
      }).catch(() => {});
    } else route.continue().catch(() => {});
  });

  let pauses = 0, pjHits = 0;
  cdp.on('Debugger.paused', (params) => {
    pauses++;
    for (const f of params.callFrames || []) {
      if ((f.functionName || '') === '_$pj') { pjHits++; break; }
    }
  });

  console.log('[1] 加载自定义 nsd=' + customNsd + ' html...');
  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 15000));
  console.log('[2] 暂停:', pauses, '_$pj 帧命中:', pjHits);
  console.log('[3] 大脚本:', bigScripts.length, bigScripts.map(s => s.url).join(' | '));
  console.log('[4] 页面 URL:', page.url().substring(0, 60));
  console.log('[5] console 错误:', errs.length ? errs.slice(0, 3).join(' || ') : '无');
  const cookies = await context.cookies();
  console.log('[6] cookies:', cookies.map(c => c.name).join(','));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
