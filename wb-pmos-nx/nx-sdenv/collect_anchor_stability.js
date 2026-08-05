// 采集 nsd=67402 固定 challenge 的多次 base，验证锚点固定性
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = '/tmp/nx_anchor_samples.json';

async function collectOne() {
  return new Promise((resolve) => {
    const dom = null;
    jsdomFromUrl(B + '/', {
      userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() },
    }).then((d) => {
      setTimeout(() => {
        const c = d.cookieJar.getCookieStringSync(B + '/');
        const P = (c.match(/P=([^;]*)/) || [])[1] || '';
        d.window.close();
        resolve(P);
      }, 8000);
    }).catch(e => resolve('ERR:' + e.message));
  });
}

(async () => {
  console.log('[STB] 采集 3 次固定 challenge base');
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const P = await collectOne();
    console.log('[STB] P#' + i + ' len=' + P.length + ' head=' + P.substring(0, 20));
    samples.push({ P });
  }
  fs.writeFileSync(OUT, JSON.stringify(samples, null, 1));
  console.log('[STB] saved', OUT);

  // 尝试从 cookie 解出 base（复用 FINDINGS 方法）
  // 需要 huffman 解码 + XOR keys2，但这里 keys 未知。先对比 P cookie 本身
  console.log('\n=== P cookie 对比 ===');
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const same = samples[i].P === samples[j].P;
      console.log('#' + i + ' vs #' + j + ':', same ? '✅ 完全一致' : '❌ 不同');
      if (!same) {
        let diff = 0;
        for (let k = 0; k < Math.min(samples[i].P.length, samples[j].P.length); k++) {
          if (samples[i].P[k] !== samples[j].P[k]) diff++;
        }
        console.log('  差异字符数:', diff);
      }
    }
  }
  process.exit(0);
})().catch(e => { console.error('[STB] FATAL:', e.message); process.exit(1); });
