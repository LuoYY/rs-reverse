/**
 * 11_full_dispatcher.js
 * 
 * 提取完整的 VM dispatcher 源码 + 构建完整操作码表
 * 然后分析 opcodes 50, 58, 60, 65, 113 的含义
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');

async function evalCDP(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
  return r.result.value;
}

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
  
  // 验证
  const test = await evalCDP(cdp, `(function(){ var x=new XMLHttpRequest(); x.open('GET','/px-gateway/GatewayConfig/security',false); x.send(); return x.status; })()`);
  console.log('[3] 验证:', test);
  
  // [4] 提取完整 dispatcher 源码
  console.log('\n[4] 提取完整 dispatcher 源码...');
  
  // 先获取 send hook 源码中的 dispatcher 函数名
  const hookInfo = await evalCDP(cdp, `(function(){
    var send = XMLHttpRequest.prototype.send;
    var src = Function.prototype.toString.call(send);
    var m = src.match(/([_$\\w]+)\\(([_$\\w]+),0,([_$\\w]+)\\.([_$\\w]+)\\.length,([_$\\w]+)\\)/);
    return JSON.stringify({
      dispatcherName: m ? m[1] : null,
      sendSource: src,
    });
  })()`);
  
  const hi = JSON.parse(hookInfo);
  console.log('  Dispatcher 名:', hi.dispatcherName);
  console.log('  Send 源码:', hi.sendSource);
  
  // 通过 CDP 获取 dispatcher 函数的完整源码
  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  
  let scopesId = null;
  for (const ip of (sendProps.internalProperties || [])) {
    if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId;
  }
  
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  
  let dispatcherSource = null;
  let dispatcherFullName = null;
  
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    
    for (const v of vars.result) {
      if (v.name === hi.dispatcherName && v.value?.type === 'function') {
        // 获取完整源码（不截断）
        const srcResult = await cdp.send('Runtime.callFunctionOn', {
          objectId: v.value.objectId,
          functionDeclaration: 'function() { return Function.prototype.toString.call(this); }',
          returnByValue: true,
        });
        dispatcherSource = srcResult.result.value;
        dispatcherFullName = `${scope.name}/${v.name}`;
        console.log(`  ★ 找到 dispatcher: ${dispatcherFullName} (${dispatcherSource.length} chars)`);
      }
    }
  }
  
  if (!dispatcherSource) {
    console.log('  ❌ 未找到 dispatcher');
    await browser.close();
    return;
  }
  
  // 保存完整源码
  fs.writeFileSync(path.join(OUT, 'dispatcher_full.js'), dispatcherSource);
  console.log('  完整源码已保存');
  
  // [5] 解析操作码表
  console.log('\n[5] 解析操作码表...');
  
  // 从 dispatcher 源码中提取所有操作码处理
  // 格式: _$hV<=N?(...):...
  const opcodePattern = /_\$hV<=(\d+)\?/g;
  const opcodeNums = new Set();
  let match;
  while ((match = opcodePattern.exec(dispatcherSource)) !== null) {
    opcodeNums.add(parseInt(match[1]));
  }
  
  const sortedOpcodes = [...opcodeNums].sort((a, b) => a - b);
  console.log(`  操作码范围: 0-${Math.max(...sortedOpcodes)}`);
  console.log(`  操作码数量: ${sortedOpcodes.length}`);
  console.log(`  操作码列表: [${sortedOpcodes.join(',')}]`);
  
  // [6] 提取每个操作码的处理代码
  console.log('\n[6] 提取操作码处理代码...');
  
  // 分析关键操作码
  const criticalOpcodes = [43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127];
  
  // 提取 bytecode 中使用的操作码
  const captureFiles = fs.readdirSync(OUT).filter(f => f.startsWith('bytecode_'));
  let bytecode = null;
  if (captureFiles.length > 0) {
    const cap = JSON.parse(fs.readFileSync(path.join(OUT, captureFiles[0]), 'utf8'));
    bytecode = cap.bytecode?.data;
  }
  
  if (bytecode) {
    const usedOpcodes = new Set(bytecode.filter(x => typeof x === 'number'));
    console.log(`  Bytecode 使用的操作码: [${[...usedOpcodes].sort((a,b)=>a-b).join(',')}]`);
    
    // 标记未解码的操作码
    const decodedUpTo = 42; // 之前已解码到 op42
    const undecoded = [...usedOpcodes].filter(x => x > decodedUpTo).sort((a,b)=>a-b);
    console.log(`  未解码的操作码: [${undecoded.join(',')}]`);
  }
  
  // [7] 提取关键操作码的处理代码片段
  console.log('\n[7] 关键操作码分析...');
  
  // 从 dispatcher 源码中提取 op50, op58, op60, op65 的处理代码
  // 这些是 bytecode 中使用但未解码的操作码
  
  // 方法：找到 _$hV<=50 和 _$hV<=49 之间的代码
  for (const op of [50, 58, 60, 65, 113]) {
    // 搜索 _$hV<=op 的位置
    const pattern = `_$hV<=${op}`;
    const idx = dispatcherSource.indexOf(pattern);
    if (idx >= 0) {
      // 提取后续 200 字符
      const snippet = dispatcherSource.substring(idx, idx + 300);
      console.log(`\n  op${op}: ...${snippet.substring(0, 200)}...`);
    } else {
      console.log(`\n  op${op}: 未找到 (可能是缓存操作码)`);
    }
  }
  
  // [8] 提取 _$lv 函数（栈解析辅助函数）
  console.log('\n\n[8] 搜索辅助函数...');
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    
    for (const v of vars.result) {
      if (v.value?.type === 'function' && ['_$lv', '_$$v', '_$im', '_$$K'].includes(v.name)) {
        const src = await cdp.send('Runtime.callFunctionOn', {
          objectId: v.value.objectId,
          functionDeclaration: 'function() { return Function.prototype.toString.call(this); }',
          returnByValue: true,
        });
        console.log(`\n  ${v.name}: ${src.result.value.substring(0, 500)}`);
      }
    }
  }
  
  await browser.close();
  console.log('\n=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
