// 从 nx cd 解析 keys 结构：尝试不同 numKeys，找 keys[2]=48/keys[16]=16/keys[17]=16 的解
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const { fork } = require('child_process');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

function forkKeys(nsd, cd) {
  return new Promise((resolve) => {
    const child = fork(path.join(__dirname, 'jsdom_keys_child.js'), [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 25000);
    child.on('message', (m) => { clearTimeout(timer); resolve(m); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.send({ nsd, cd, outerJsPath: OUTER_JS });
  });
}

function decryptCd(str) {
  const bs = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
  const idxmap = {};
  bs.split('').forEach((k, i) => { idxmap[k] = i; });
  const ans = [];
  for (let i = 0; i < str.length; i += 4) {
    const one = str[i], two = str[i + 1], three = str[i + 2], four = str[i + 3];
    if (two) ans.push((idxmap[one] << 2) | (idxmap[two] >> 4));
    if (three) ans.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2));
    if (four) ans.push(((idxmap[three] & 3) << 6) | idxmap[four]);
  }
  return ans;
}

// 解析 keys（xj 的 genKeysFromCd step=2 逻辑）
function parseKeysStructure(ans, numKeysGuess) {
  // ans[0]=numKeys, ans[1..2]=gap0, keys[0]=ans[3..3+gap0]...
  let op = 1;
  const keys = [];
  for (let i = 0; i < numKeysGuess; i++) {
    const gap = ans[op] << 8 | ans[op + 1];
    op += 2;
    if (op + gap > ans.length) return null;
    keys.push(ans.slice(op, op + gap));
    op += gap;
  }
  return keys;
}

(async () => {
  console.log('=== nx cd → keys 结构解析 ===');
  const dom0 = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom0.window.$_ts.nsd;
  const cd = String(dom0.window.$_ts.cd);
  dom0.window.close();

  // sdenv 提取的 keys 用于对照
  const m = await forkKeys(nsd, cd);
  if (m && m.keys2) console.log('sdenv keys2:', Buffer.from(m.keys2).toString('hex'));
  if (m && m.keys16) console.log('sdenv keys16:', Buffer.from(m.keys16).toString('hex'));
  if (m && m.keys17) console.log('sdenv keys17:', Buffer.from(m.keys17).toString('hex'));

  const cdArr = decryptCd(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  console.log('\ncdArr 结构: [0..1]=tasklen end=' + end);
  console.log('cdArr[end..end+10]:', cdArr.slice(end, end + 10).join(','));
  const ans = cdArr.slice(end);

  // 尝试不同 numKeys
  console.log('\n=== 尝试不同 numKeys ===');
  for (let nk = 20; nk <= 200; nk++) {
    const keys = parseKeysStructure(ans, nk);
    if (!keys) continue;
    // 检查 keys[2]=48, keys[16]=16, keys[17]=16
    const k2 = keys[2] ? keys[2].length : -1;
    const k16 = keys[16] ? keys[16].length : -1;
    const k17 = keys[17] ? keys[17].length : -1;
    const k0 = keys[0] ? keys[0].join(',') : '';
    if (k2 === 48 && k16 === 16 && k17 === 16) {
      console.log(`\n✅ numKeys=${nk}: keys[0]=[${k0}] keys[2].len=48 keys[16].len=16 keys[17].len=16`);
      console.log('  keys[0]:', keys[0].join(','));
      console.log('  keys[1]:', keys[1] ? keys[1].join(',') : '');
      console.log('  keys[2] 前8:', keys[2].slice(0, 8).join(','));
      console.log('  keys[16]:', keys[16].join(','));
      console.log('  keys[17]:', keys[17].join(','));
      if (m) {
        console.log('\n  对照 sdenv keys16:', m.keys16.join(','));
        console.log('  对照 sdenv keys17:', m.keys17.join(','));
        console.log('  对照 sdenv keys2 前8:', m.keys2.slice(0, 8).join(','));
      }
    }
  }
  console.log('\n（若无数值打印，则 numKeys 假设都失败）');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
