// 分析中间段 [70:len-40] 的共享结构
// 同批次 #0/#2 共享前缀 218,38,0,223 + 共享尾 172,87,113,140,214...
// 找：哪些是模板（组内恒定），哪些是会话（组内变）
const samples = require('./nx_env_samples.json');
const a = samples[0].base, b = samples[2].base; // 同批次 0/140

// 中间段对齐（len 167 vs 166，尾部对齐）
const la = a.length, lb = b.length;
console.log('#0 len=' + la + ' #2 len=' + lb);

// 从头部对齐 [70:la-40] vs [70:lb-40]
const midA = a.slice(70, la - 40);
const midB = b.slice(70, lb - 40);
console.log('midA len=' + midA.length + ' midB len=' + midB.length);

// 找 midA/midB 最长公共子串
function lcs(x, y) {
  const n = x.length, m = y.length;
  let best = { len: 0, xi: 0, yi: 0 };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      let l = 0;
      while (i + l < n && j + l < m && x[i + l] === y[j + l]) l++;
      if (l > best.len) best = { len: l, xi: i, yi: j };
    }
  }
  return best;
}
const l = lcs(midA, midB);
console.log('LCS len=' + l.len + ' @A[' + l.xi + '] B[' + l.yi + ']');
console.log('共享串:', midA.slice(l.xi, l.xi + l.len).join(','));

// 会话前缀 = mid 中共享串之前的部分
console.log('\nmidA 会话部分 (共享串前):', midA.slice(0, l.xi).join(','));
console.log('midB 会话部分 (共享串前):', midB.slice(0, l.yi).join(','));

// 共享串后
console.log('\nmidA 共享串后:', midA.slice(l.xi + l.len).join(','));
console.log('midB 共享串后:', midB.slice(l.yi + l.len).join(','));

// 完整结构
console.log('\n=== 完整 base 结构（#0） ===');
console.log('[0:22] 头:', a.slice(0, 22).join(','));
console.log('[22:25] 会话:', a.slice(22, 25).join(','));
console.log('[25:68] 指纹:', a.slice(25, 68).join(','));
console.log('[68:70]:', a.slice(68, 70).join(','));
console.log('[70:' + (la - 40) + '] 中间:', a.slice(70, la - 40).join(','));
console.log('[' + (la - 40) + ':] 尾:', a.slice(la - 40).join(','));
