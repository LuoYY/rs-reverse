/**
 * 714_reproduce_pj.js
 * Node 复现 _$pj 解码器，验证输出 = basearr
 * 输入：/tmp/nx_pj_tables.json（dh/ks/g/u）
 */
const fs = require('fs');

(async () => {
  const t = JSON.parse(fs.readFileSync('/tmp/nx_pj_tables.json', 'utf8'));
  const dh = JSON.parse(t.dh);
  const ks = JSON.parse(t.ks);
  const g = JSON.parse(t.g);
  const u = t.u; // 63

  // 复现 _$pj（709 提取的源码，_​$hB[_​$ks[4]](_​$ks[7],0) = '?'.charCodeAt(0) = 63）
  function pj(_$dh) {
    let _$dm = [];
    let _$u = String.prototype.charCodeAt.call('?', 0); // = u
    for (let ck = 0; ck < _$dh['length'];) {
      let lh = _$dh[ck];
      let mO;
      if (lh < g[46]) mO = lh;                       // <128 透传
      else if (lh < g[28]) mO = _$u;                  // <192 默认63
      else if (lh < g[2]) { mO = ((lh & g[41]) << g[58]) | (_$dh[ck + 1] & g[41]); ck++; }   // <224 2字节
      else if (lh < g[13]) { mO = ((lh & g[53]) << g[42]) | ((_$dh[ck + 1] & g[41]) << g[58]) | (_$dh[ck + g[54]] & g[41]); ck += g[54]; } // <240 3字节
      else if (lh < g[246]) { mO = ((lh & g[56]) << g[34]) | ((_$dh[ck + 1] & g[41]) << g[42]) | ((_$dh[ck + g[54]] & g[41]) << g[58]) | (_$dh[ck + g[63]] & g[41]); ck += g[63]; } // <248 4字节
      else if (lh < g[296]) { mO = _$u; ck += g[23]; }  // <252 默认+4
      else if (lh < g[278]) { mO = _$u; ck += g[60]; }  // <254 默认+5
      else mO = _$u;                                    // >=254 默认
      ck++;
      if (mO > g[92]) {                                 // >65535 代理对
        _$dm.push((mO >> g[33]) + g[373], (mO % g[107]) + g[340]);
      } else {
        _$dm.push(mO);
      }
    }
    return _$dm;
  }

  // 打印常量（确认索引）
  console.log('g[46]=', g[46], 'g[28]=', g[28], 'g[2]=', g[2], 'g[13]=', g[13], 'g[246]=', g[246], 'g[296]=', g[296], 'g[278]=', g[278], 'g[92]=', g[92]);
  console.log('g[41]=', g[41], 'g[58]=', g[58], 'g[53]=', g[53], 'g[42]=', g[42], 'g[54]=', g[54], 'g[56]=', g[56], 'g[34]=', g[34], 'g[63]=', g[63]);
  console.log('g[23]=', g[23], 'g[60]=', g[60], 'g[33]=', g[33], 'g[373]=', g[373], 'g[107]=', g[107], 'g[340]=', g[340]);
  console.log('ks[0]=', ks[0], 'ks[4]=', ks[4], 'ks[7]=', ks[7], 'ks[35]=', ks[35]);

  const out = pj(dh);
  console.log('\n=== 复现结果 ===');
  console.log('输入 len:', dh.length, '输出 len:', out.length);
  console.log('输出前 60:', out.slice(0, 60).join(','));
  console.log('输出后 20:', out.slice(-20).join(','));

  // 对比 basearr28（前 28）
  const b28 = JSON.parse(t.basearr28);
  const match28 = out.slice(0, 28).every((v, i) => v === b28[i]);
  console.log('\n=== 与 basearr28 对比 ===');
  console.log('前 28 匹配:', match28 ? '★★★ 完全一致！' : '不一致');
  if (!match28) {
    console.log('复现前28:', out.slice(0, 28).join(','));
    console.log('basearr28:', b28.join(','));
  }

  // 转字符串看内容
  const str = out.map(c => String.fromCharCode(c)).join('');
  console.log('\n输出字符串:', JSON.stringify(str.substring(0, 80)), '(len=' + str.length + ')');
  const str2 = b28.map(c => String.fromCharCode(c)).join('');
  console.log('basearr28 字符串:', JSON.stringify(str2));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
