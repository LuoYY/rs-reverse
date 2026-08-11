// JSVMP 反编译器 v2：完整模拟 _$h7 解释器（tokenizer）解析 gS
// 输出 token 序列（类型 + 值）
const fs = require('fs');
const states = require('./nx_md_states.json');
const t = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
const k0 = t._$k0.val || t._$k0;
const oU = t._$oU.val || t._$oU;
const b1 = t._$b1.val || t._$b1;
const lc = t._$lc.val || t._$lc;

// 字符分类
const _og = (v) => v >= k0[21] && v <= k0[22];
const _lO = (v) => (v >= k0[14] && v <= k0[75]) || (v >= k0[94] && v <= k0[88]) || v >= k0[216];
const c8 = [160, 6158, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8203, 8239, 8287, 12288];
const _i0 = (v) => c8.includes(v);

// 解释器状态
function createInterp(gS) {
  const s = {
    gS: gS,  // 数字数组
    hZ: 0, nD: 0, oA: true, jM: 0,
    calls: 0,
  };
  const ie = (k6, i) => k6[i];  // charCodeAt 等价（数字数组索引）
  const charAt = (k6, i) => String.fromCharCode(k6[i]);
  // _$dt：读下一个字符（推进）
  const dt = () => { const v = s.gS[s.hZ++]; if (v === k0[59]) s.oA = true; return v; };
  const pE = () => s.gS[s.hZ];
  // 处理器（tokenizer）
  const handlers = {
    33: () => { dt(); const v = pE(); if (v === 61) { dt(); const v2 = pE(); if (v2 === 61) { dt(); return [3, '!==']; } return [3, '!=']; } return [4, b1[169]]; },  // _$T
    37: () => { dt(); const v = pE(); if (v === k0[24]) { dt(); return [7, '%=']; } return [3, oU[146]]; },  // _$hr
    38: () => { dt(); const v = pE(); if (v === 38) { dt(); return [3, '&&']; } if (v === 61) { dt(); return [7, '&=']; } return [3, oU[21]]; },  // _$kx
    42: () => { dt(); const v = pE(); if (v === 61) { dt(); return [7, '*=']; } if (v === 42) { dt(); return [3, '**']; } return [107, '']; },  // _$hi
    43: () => { dt(); const v = pE(); if (v === 43) { dt(); return [6, '++']; } if (v === 61) { dt(); return [7, oU[20]]; } return [17, b1[144]]; },  // _$ms
    45: () => { dt(); const v = pE(); if (v === 45) { dt(); return [6, '--']; } if (v === 61) { dt(); return [7, '-=']; } return [17, oU[178]]; },  // _$fZ
    60: () => { dt(); const v = pE(); if (v === 60) { dt(); const v2 = pE(); if (v2 === 61) { dt(); return [7, '<<=']; } return [3, '<<']; } if (v === 61) { dt(); return [3, '<=']; } return [3, b1[14]]; },  // _$p2
    61: () => { dt(); const v = pE(); if (v === 61) { dt(); const v2 = pE(); if (v2 === 61) { dt(); return [7, lc[92]]; } return [3, '>>>']; } if (v === 62) { dt(); return [7, '>>=']; } if (v === 61) { dt(); return [7, '>=']; } return [3, '>']; },  // _$6
    63: () => { s.hZ++; if (pE() === 46 && !_og(s.gS[s.hZ + 1])) { dt(); return [89, '?.']; } if (pE() === k0[41]) { dt(); return [0, '??']; } return [113, oU[10]]; },  // _$op
    94: () => { dt(); const v = pE(); if (v === 61) { dt(); return [7, '^=']; } return [3, '^']; },  // _$mX
    124: () => { dt(); const v = pE(); if (v === 61) { dt(); return [7, '|=']; } if (v === 124) { dt(); return [3, '||']; } return [3, oU[90]]; },  // _$oH
    41: () => { dt(); return [51, oU[29]]; },  // _$lZ
    44: () => { dt(); return [45, ',']; },  // _$kc
    58: () => { dt(); return [48, ':']; },  // _$_q
    59: () => { dt(); return [47, oU[120]]; },  // _$fU
    91: () => { dt(); return [42, oU[73]]; },  // _$aa
    93: () => { dt(); return [49, ']']; },  // _$_E
    123: () => { dt(); return [64, oU[112]]; },  // _$_m
    125: () => { dt(); return [29, oU[109]]; },  // _$hk
    126: () => { dt(); return [6, '']; },  // _$$u
    40: () => { dt(); return [58, oU[34]]; },  // _$_8
    96: () => { /* 字符串解析 */ return [116, 'STR']; },  // _$_c
    46: () => { s.hZ += 1; const v = pE(); if (s.gS[s.hZ + 1] === 61) { dt(); dt(); return [7, '/=']; } return [3, oU[100]]; },  // _$gx
  };
  // _$pC 主循环（单步）
  const pC = () => {
    s.calls++;
    let v = s.gS[s.hZ];
    // 跳过空白/操作数
    while (v === k0[18] || (k0[33] <= v && v <= k0[37]) || (v > k0[5] && _i0(v))) {
      if (v === k0[59]) s.oA = true;
      s.hZ++;
      v = s.gS[s.hZ];
    }
    s.nD = s.hZ;
    const handler = handlers[v];
    if (handler) return handler();
    if (v > k0[216]) return [1, 'NESTED'];
    if (!v) return [0, 'RETURN'];
    return ['UNKNOWN_' + v, v];
  };
  return { pC, s };
}

// 解析 3 个 gS
const gs92 = states.find(s => s.gS && s.gS.length === 92);
const gs36 = states.find(s => s.gS && s.gS.length === 36);
const gs13 = states.find(s => s.gS && s.gS.length === 13);

for (const [name, st] of [['gS13', gs13], ['gS36', gs36], ['gS92', gs92]]) {
  console.log('\n=== ' + name + ' ===');
  const { pC, s } = createInterp(st.gS);
  const tokens = [];
  let guard = 0;
  while (s.hZ < st.gS.length && guard++ < 200) {
    const tok = pC();
    tokens.push(tok);
    if (tok[0] === 0) break;  // RETURN
    if (tok[0] === 'UNKNOWN') break;
  }
  console.log('tokens (' + tokens.length + '):');
  tokens.forEach((tk, i) => console.log('  #' + i + ': 类型=' + tk[0] + ' 值=' + JSON.stringify(tk[1]).slice(0, 30)));
}
