/**
 * demo.js — nx 纯算法客户端使用示例
 *
 * 运行（Node 22 + NODE_PATH 指向含 sdenv 的 node_modules）：
 *   export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"
 *   NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_glm/node_modules \
 *   NODE_OPTIONS=--dns-result-order=ipv4first \
 *   node wb-pmos-nx/nx-sdenv/demo.js
 */
const nx = require('./nx_client');

(async () => {
  console.log('=== nx 纯算法客户端 demo（无浏览器）===\n');

  // 1. 初始化：sdenv 生成 cookie + 提取 keys（约 10-20s）
  console.log('[1] 初始化（sdenv 生成 cookie + keys）...');
  const t0 = Date.now();
  const ctx = await nx.init({ log: m => console.log('  ', m) });
  console.log(`  cookie: ${ctx.cookie.substring(0, 60)}...`);
  console.log(`  keys2: ${Buffer.from(ctx.keys2).toString('hex').substring(0, 8)}`);
  console.log(`  keys17: ${Buffer.from(ctx.keys17).toString('hex').substring(0, 8)}`);
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  // 2. GET 请求
  console.log('\n[2] GET /px-gateway/GatewayConfig/getGatewayConfig');
  const r1 = await nx.get('/px-gateway/GatewayConfig/getGatewayConfig', ctx, { log: m => console.log('  ', m) });
  console.log(`  status: ${r1.status} body.len: ${r1.body.length}`);
  if (r1.body) console.log(`  body: ${r1.body.substring(0, 80)}`);

  // 3. GET 重放（同 cookie 新 query）
  console.log('\n[3] GET 重放（同 cookie 新 query）');
  const r2 = await nx.get('/px-gateway/GatewayConfig/getGatewayConfig', ctx, { log: m => console.log('  ', m) });
  console.log(`  status: ${r2.status} body.len: ${r2.body.length}`);

  // 4. POST 请求（⚠️ 已知限制：成功率约 10%，WAF 对 POST 的 TLS 指纹检测）
  console.log('\n[4] POST /px-gateway/GatewayConfig/getGatewayConfig（⚠️ POST 成功率约 10%）');
  const r3 = await nx.post('/px-gateway/GatewayConfig/getGatewayConfig', '{"captchaType":"blockPuzzle"}', ctx, { log: m => console.log('  ', m) });
  console.log(`  status: ${r3.status} body.len: ${r3.body.length}`);
  if (r3.body) console.log(`  body: ${r3.body.substring(0, 120)}`);

  console.log('\n=== 结果: r1=' + r1.status + ' r2=' + r2.status + ' r3=' + r3.status);
  console.log((r1.status === 200 && r2.status === 200)
    ? '★★★★★ nx 纯算法客户端（无浏览器）GET 链路验证通过！（POST 受 TLS 指纹限制）'
    : '✗ 部分失败，检查代理/日志');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
