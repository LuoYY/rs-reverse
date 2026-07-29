// Parse temp3/temp4 basearr, extract [0] and [6] segments, analyze 20-byte session part.
const temp3 = [3,73,1,0,33,128,139,136,236,232,8,77,97,99,73,110,116,101,108,0,0,10,186,48,8,0,0,1,0,0,0,0,0,0,0,3,191,4,147,4,56,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,121,211,210,212,0,0,0,0,0,0,0,0,0,0,0,0,10,19,1,2,106,74,63,54,81,134,162,244,0,10,144,6,50,7,7,167,4,7,12,1,0,0,0,0,0,0,0,7,9,238,191,0,1,0,6,16,1,0,0,0,0,1,65,176,22,79,72,103,1,0,0,8,2,4,203,101,103,203,9,5,11,100,0,0,0,13,1,0];
const temp4 = [3,73,1,0,33,128,139,136,236,232,8,77,97,99,73,110,116,101,108,0,0,10,186,48,8,0,0,1,0,0,0,0,0,0,0,3,191,4,147,4,56,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,121,211,210,212,0,0,0,0,0,0,0,0,0,0,0,0,10,19,1,13,106,74,63,115,81,134,162,244,0,15,88,112,50,7,7,168,4,7,12,1,0,0,0,0,0,0,0,7,9,238,191,0,101,47,119,54,154,195,77,48,41,123,55,111,49,253,235,248,167,151,183,140,71,11,230,161,113,127,26,145,122,108,163,109,13,107,166,163,152,211,15,217,5,133,85,184,207,114,162,21,75,16,65,58,91,178,2,173,195,245,45,25,149,136,73,25,83,50,107,38,161,202,142,65,38,53,39,24,78,71,203,94,5,215,32,55,87,232,118,203,110,6,197,241,238,21,86,99,95,134,61,190,155,164,6,16,1,2,104,2,104,1,65,176,22,79,72,103,1,0,0,8,2,4,203,101,103,203,9,5,11,100,0,0,0,13,1,0];

// temp1 [0] full 101 bytes (from task)
const temp1_seg0 = [47,119,54,154,195,77,48,41,123,55,111,49,253,235,248,167,151,183,140,71,11,230,161,113,127,26,145,122,108,163,109,13,107,166,163,152,211,15,217,5,133,85,184,207,114,162,21,75,16,65,58,91,178,2,173,195,245,45,25,149,136,73,25,83,50,107,38,161,202,142,65,38,53,39,24,78,71,203,94,5,215,0,47,4,204,64,197,121,162,245,251,216,20,120,113,45,36,175,188,59,229];

function parseSegments(basearr) {
  const divarr = [3, 10, 7, 0, 6, 2, 9, 13, 4, 16, 1, 15];
  let oper = 0;
  const segs = {};
  while (oper < basearr.length) {
    const div = basearr[oper++];
    if (!divarr.includes(div)) { console.log('  STOP unknown div', div, 'at', oper-1); break; }
    const len = basearr[oper];
    const data = basearr.slice(oper+1, oper+1+len);
    segs[div] = { id: div, len, data, start: oper-1 };
    oper += 1 + len;
  }
  return segs;
}

console.log('===== TEMP3 (首P cookie) segments =====');
const s3 = parseSegments(temp3);
for (const id of Object.keys(s3)) {
  console.log(`[${id}] len=${s3[id].len} data=${JSON.stringify(s3[id].data)}`);
}

console.log('\n===== TEMP4 (次P cookie) segments =====');
const s4 = parseSegments(temp4);
for (const id of Object.keys(s4)) {
  console.log(`[${id}] len=${s4[id].len} data=${JSON.stringify(s4[id].data)}`);
}

// [0] segment comparison
console.log('\n===== [0] SEGMENT ANALYSIS =====');
console.log('temp3 [0] (stub):', JSON.stringify(s3[0]?.data), 'len', s3[0]?.len);
console.log('temp4 [0] len:', s4[0]?.len);
const t4_0 = s4[0].data;
console.log('temp1 [0] (101B):', temp1_seg0.length, 'bytes');
console.log('temp4 [0] (101B):', t4_0.length, 'bytes');

// Compare first 81 bytes of temp1 vs temp4
const t1_first81 = temp1_seg0.slice(0, 81);
const t4_first81 = t4_0.slice(0, 81);
console.log('\ntemp1[0..80] == temp4[0..80]?', JSON.stringify(t1_first81) === JSON.stringify(t4_first81));
if (JSON.stringify(t1_first81) !== JSON.stringify(t4_first81)) {
  const diffs = [];
  for (let i = 0; i < 81; i++) if (t1_first81[i] !== t4_first81[i]) diffs.push(i);
  console.log('  diffs in first 81:', diffs);
}

const t1_last20 = temp1_seg0.slice(81);
const t4_last20 = t4_0.slice(81);
console.log('\ntemp1 last20:', JSON.stringify(t1_last20));
console.log('temp4 last20:', JSON.stringify(t4_last20));

// [6] segment analysis
console.log('\n===== [6] SEGMENT ANALYSIS =====');
console.log('temp3 [6]:', JSON.stringify(s3[6]?.data), 'len', s3[6]?.len);
console.log('temp4 [6]:', JSON.stringify(s4[6]?.data), 'len', s4[6]?.len);
if (s4[6]) {
  const b = s4[6].data;
  console.log('temp4 [6] bytes[1..4]:', b.slice(1,5), '= as num:', ((b[1]<<24)|(b[2]<<16)|(b[3]<<8)|b[4])>>>0);
  console.log('temp4 [6] bytes[1..2]:', b.slice(1,3), 'numToNumarr2?', ((b[1]<<8)|b[2])>>>0);
  console.log('temp4 [6] bytes[3..4]:', b.slice(3,5), 'numToNumarr2?', ((b[3]<<8)|b[4])>>>0);
}

// 20-byte structure hypotheses
console.log('\n===== 20-BYTE STRUCTURE HYPOTHESES =====');
function analyze(arr, label) {
  console.log(`\n${label}: ${JSON.stringify(arr)}`);
  // 16+4
  console.log('  16+4 split:', JSON.stringify(arr.slice(0,16)), '|', JSON.stringify(arr.slice(16)));
  // 4+16
  console.log('  4+16 split:', JSON.stringify(arr.slice(0,4)), '|', JSON.stringify(arr.slice(4)));
  // 8+12
  console.log('  8+12 split:', JSON.stringify(arr.slice(0,8)), '|', JSON.stringify(arr.slice(8)));
  // 12+8
  console.log('  12+8 split:', JSON.stringify(arr.slice(0,12)), '|', JSON.stringify(arr.slice(12)));
  // as 4x uint32 BE
  const u32 = [];
  for (let i = 0; i < 20; i += 4) {
    if (i+4 <= 20) u32.push(((arr[i]<<24)|(arr[i+1]<<16)|(arr[i+2]<<8)|arr[i+3])>>>0);
  }
  console.log('  as uint32 BE:', u32.map(n => n + ' (0x'+n.toString(16)+')'));
  // entropy / byte distribution
  const set = new Set(arr);
  console.log('  unique bytes:', set.size, 'range:', Math.min(...arr), '-', Math.max(...arr));
  // check for repeats between temp1/temp4 last20
}
analyze(t1_last20, 'temp1 last20');
analyze(t4_last20, 'temp4 last20');

// XOR temp1_last20 ^ temp4_last20
console.log('\n===== temp1_last20 XOR temp4_last20 =====');
const xored = t1_last20.map((b, i) => b ^ t4_last20[i]);
console.log('XOR:', JSON.stringify(xored));
console.log('  as uint32 BE:', (() => { const u=[]; for(let i=0;i<20;i+=4) u.push(((xored[i]<<24)|(xored[i+1]<<16)|(xored[i+2]<<8)|xored[i+3])>>>0); return u; })());

// Is 20 bytes = 16-byte AES block + 4-byte something? Check if last 4 looks like a counter/IV
console.log('\n===== AES alignment check =====');
console.log('  20 % 16 =', 20 % 16, '(not multiple of 16 → not pure AES-CBC ciphertext)');
console.log('  20 = 16 + 4 (one AES block + 4-byte tail) OR 4 + 16 (4-byte prefix + one AES block)');

// Check: is the [0] segment (101 bytes) a multiple of anything?
console.log('\n  [0] total len 101: 101 % 16 =', 101 % 16, ', 101 % 4 =', 101 % 4);
console.log('  81 % 16 =', 81 % 16, ', 81 % 4 =', 81 % 4);
console.log('  20 % 4 =', 20 % 4);

// Compare byte-by-byte diff positions in last 20
console.log('\n===== diff positions in last 20 (temp1 vs temp4) =====');
const last20diffs = [];
for (let i = 0; i < 20; i++) if (t1_last20[i] !== t4_last20[i]) last20diffs.push(i);
console.log('  diff positions:', last20diffs, `(${last20diffs.length}/20 differ)`);
