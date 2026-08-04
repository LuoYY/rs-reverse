/**
 * 732_verify_dh_formula.js
 * 验证 basearr = decodeB86(cd)[2:140]（pj 对 <128 透传）
 * 用全部 8 个样本（含 AgentB v5 + 之前 multi_nsd3）
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}

function verify(name, cd, basearr) {
  const b86 = decodeB86(cd);
  if (!b86) { console.log(`${name}: b86 解码失败`); return; }
  // 取 b86[2:2+basearr.length]
  const slice = b86.slice(2, 2 + basearr.length);
  const diffs = [];
  for (let i = 0; i < Math.min(slice.length, basearr.length); i++) {
    if (slice[i] !== basearr[i]) diffs.push(`${i}:${slice[i]}→${basearr[i]}`);
  }
  const ok = diffs.length === 0;
  console.log(`${name}: basearr len=${basearr.length} slice len=${slice.length} ${ok ? '★★★ 完全一致！' : '差异 ' + diffs.length + ' 处 → ' + diffs.slice(0, 10).join(' ')}`);
  return ok;
}

(async () => {
  console.log('=== AgentB v5 样本（8 个）===');
  const v5 = JSON.parse(fs.readFileSync('/tmp/agentB/nx_multi_dataset_v5.json', 'utf8'));
  let okCount = 0;
  for (const s of v5.samples) {
    if (verify('v5 nsd=' + s.nsd, s.cd, s.basearr)) okCount++;
  }
  console.log('v5 匹配数:', okCount, '/', v5.samples.length);

  console.log('\n=== 之前 multi_nsd3 样本（4 个，无 cd 用 v5 匹配 nsd 的 cd）===');
  const m3 = JSON.parse(fs.readFileSync('/tmp/nx_multi_nsd3.json', 'utf8'));
  for (const s of m3) {
    const v5s = v5.samples.find(x => x.nsd === s.nsd);
    const cd = v5s ? v5s.cd : null;
    if (cd) verify('multi_nsd3 nsd=' + s.nsd, cd, s.basearr);
    else console.log('multi_nsd3 nsd=' + s.nsd + ': 无匹配 cd（跳过）');
  }

  // 额外：用固定 nsd=67402（412.raw）验证之前 721 的 mock 样本
  console.log('\n=== 固定 nsd=67402（412.raw cd）===');
  const raw = fs.readFileSync(path.join(ROOT, 'nx-mock/412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const cd67402 = rawBody.match(/cd="([^"]+)"/)[1];
  const mockSample = m3.find(s => s.src === 'mock');
  if (mockSample) verify('mock nsd=67402', cd67402, mockSample.basearr);

  // b86 偏移分析：验证 b86[0]/b86[1] 是什么
  console.log('\n=== b86[0-1] 分析 ===');
  for (const s of v5.samples) {
    const b86 = decodeB86(s.cd);
    console.log(`nsd=${s.nsd}: b86[0]=${b86[0]} b86[1]=${b86[1]} b86[2]=${b86[2]}（dh[0]=${s.basearr[0]}）`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
