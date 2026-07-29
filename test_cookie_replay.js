/**
 * 验证「同 cookie 重放确定性」：取已通过的 cookie，原样重放 N 次 → 应全部 200
 * 若重放也概率 412，则 200/412 是服务端随机/速率限制，与 cookie 内容无关
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_cookie_replay.js [N]
 */
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let _got = null;
async function gotScraping() {
  if (!_got) {
    const { gotScraping } = await import('got-scraping');
    _got = gotScraping.extend({
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 131, maxVersion: 131 }],
        devices: ['desktop'],
        operatingSystems: ['macos'],
      },
      https: { rejectUnauthorized: false },
      timeout: { request: 15000 },
      retry: { limit: 0 },
      throwHttpErrors: false,
    });
  }
  return _got;
}

async function main() {
  const passed = JSON.parse(fs.readFileSync('/tmp/passed_cookies.json', 'utf8'));
  if (!passed.length || !passed[0].cookieHeader) { console.error('无通过样本 cookieHeader'); process.exit(1); }
  const N = parseInt(process.argv[2] || '10', 10);
  // 用第一个通过 cookie 重放 N 次
  const header = passed[0].cookieHeader;
  console.log('用通过 cookie 重放', N, '次...');
  let ok = 0;
  const codes = {};
  for (let i = 0; i < N; i++) {
    const g = await gotScraping();
    const res = await g.get(TARGET, { headers: { 'User-Agent': UA, 'Cookie': header } });
    codes[res.statusCode] = (codes[res.statusCode] || 0) + 1;
    if (res.statusCode === 200) ok++;
    console.log(`#${i + 1}: ${res.statusCode}`);
  }
  console.log(`\n===== 同 cookie 重放: ${ok}/${N} 200, 状态码分布 ${JSON.stringify(codes)} =====`);
  console.log(ok === N ? '✓ 确定性（同 cookie 必 200）→ 200/412 由 cookie 内容决定' : '✗ 非确定性（同 cookie 也 412）→ 服务端随机/速率限制');
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
