/**
 * 728_B_shared_suffix.js
 * 分析 base[68:92] 中的共享模式（跨会话共同子串）
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;
const NORMAL = samples.filter(s => s.base[26] === 233);

// 找所有 base[68:92] 的共同子串
const segs = NORMAL.map(s => s.base.slice(68, 92));
console.log('=== base[68:92] 共同子串 ===');
const s0 = segs[0];
for (let L = 12; L >= 4; L--) {
  for (let off = 0; off + L <= 24; off++) {
    const sub = s0.slice(off, off + L).join(',');
    const allContain = segs.every(seg => seg.join(',').indexOf(sub) !== -1);
    if (allContain) {
      console.log(`共同子串 base[${68 + off}:${68 + off + L}]: ${sub}`);
    }
  }
}

// 两两会话的共同子串
console.log('\n=== 两两最长共同子串 ===');
for (let i = 0; i < NORMAL.length; i++) {
  for (let j = i + 1; j < NORMAL.length; j++) {
    const a = segs[i], b = segs[j];
    let best = { offA: -1, offB: -1, len: 0 };
    for (let oa = 0; oa < 24; oa++) {
      for (let ob = 0; ob < 24; ob++) {
        let L = 0;
        while (oa + L < 24 && ob + L < 24 && a[oa + L] === b[ob + L]) L++;
        if (L > best.len) best = { offA: oa, offB: ob, len: L };
      }
    }
    if (best.len >= 4) {
      console.log(`${NORMAL[i].nsd}@${best.offA} vs ${NORMAL[j].nsd}@${best.offB}: len=${best.len} [${a.slice(best.offA, best.offA + best.len).join(',')}]`);
    }
  }
}
