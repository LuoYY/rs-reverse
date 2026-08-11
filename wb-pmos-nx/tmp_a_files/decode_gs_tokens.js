// 用真实解释器逻辑解码 gS → token 流（模拟 _$pC tokenizer）
const states = require('./nx_md_states.json');
const t = JSON.parse(require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
const k0 = t._$k0.val || t._$k0;
const oU = t._$oU.val || t._$oU;

const gs92 = states[0].gS;
const gs36 = states[1].gS;
const gs13 = states[2].gS;

function decode(gs, name) {
  // 模拟 tokenizer：读字符，按 _$f1 表分派
  const s = { hZ: 0, gS: gs };
  const char = () => s.gS[s.hZ];
  const tokens = [];
  let guard = 0;
  while (s.hZ < gs.length && guard++ < 300) {
    const c = char();
    if (c === undefined || c === 0) { tokens.push(['END', '']); break; }
    // 空白跳过（k0[18]=32, 33-37, >5 的 _i0）
    if (c === 32 || (33 <= c && c <= 37)) { s.hZ++; continue; }
    // 运算符（对照 _$f1 表）
    const handlers = {
      33: ['!=', () => { s.hZ++; if (char() === 61) { s.hZ++; return '!=' + (char() === 61 ? (s.hZ++, '=') : ''); } return '!'; }],
      37: ['%', () => { s.hZ++; if (char() === 61) { s.hZ++; return '%='; } return '%'; }],
      38: ['&', () => { s.hZ++; if (char() === 38) { s.hZ++; return '&&'; } if (char() === 61) { s.hZ++; return '&='; } return '&'; }],
      42: ['*', () => { s.hZ++; if (char() === 61) { s.hZ++; return '*='; } if (char() === 42) { s.hZ++; return '**'; } return '*'; }],
      43: ['+', () => { s.hZ++; if (char() === 43) { s.hZ++; return '++'; } if (char() === 61) { s.hZ++; return '+='; } return '+'; }],
      45: ['-', () => { s.hZ++; if (char() === 45) { s.hZ++; return '--'; } if (char() === 61) { s.hZ++; return '-='; } return '-'; }],
      60: ['<', () => { s.hZ++; if (char() === 60) { s.hZ++; if (char() === 61) { s.hZ++; return '<<='; } return '<<'; } if (char() === 61) { s.hZ++; return '<='; } return '<'; }],
      61: ['=', () => { s.hZ++; if (char() === 61) { s.hZ++; if (char() === 61) { s.hZ++; return '==='; } return '=='; } if (char() === 62) { s.hZ++; return '=>'; } return '='; }],
      62: ['>', () => { s.hZ++; if (char() === 61) { s.hZ++; return '>='; } if (char() === 62) { s.hZ++; if (char() === 61) { s.hZ++; return '>>>='; } if (char() === 62) { s.hZ++; return '>>>'; } return '>>'; } return '>'; }],
      63: ['?', () => { s.hZ++; if (char() === 46) { s.hZ++; return '?.'; } if (char() === 63) { s.hZ++; return '??'; } return '?'; }],
      94: ['^', () => { s.hZ++; if (char() === 61) { s.hZ++; return '^='; } return '^'; }],
      124: ['|', () => { s.hZ++; if (char() === 61) { s.hZ++; return '|='; } if (char() === 124) { s.hZ++; return '||'; } return '|'; }],
      41: [')', () => { s.hZ++; return ')'; }],
      44: [',', () => { s.hZ++; return ','; }],
      58: [':', () => { s.hZ++; return ':'; }],
      59: [';', () => { s.hZ++; return ';'; }],
      91: ['[', () => { s.hZ++; return '['; }],
      93: [']', () => { s.hZ++; return ']'; }],
      123: ['{', () => { s.hZ++; return '{'; }],
      125: ['}', () => { s.hZ++; return '}'; }],
      40: ['(', () => { s.hZ++; return '('; }],
      126: ['~', () => { s.hZ++; return '~'; }],
    };
    const h = handlers[c];
    if (h) { tokens.push([h[0], h[1]()]); continue; }
    // 数字/标识符（_$gB：读连续非特殊字符）
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36) {
      let start = s.hZ;
      while (s.hZ < gs.length) {
        const cc = char();
        if ((cc >= 48 && cc <= 57) || (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || cc === 95 || cc === 36) s.hZ++;
        else break;
      }
      const id = String.fromCharCode(...gs.slice(start, s.hZ));
      tokens.push(['ID', id]);
      continue;
    }
    // 字符串（_$_c）
    if (c === 96) { // 反引号
      s.hZ++;
      let start = s.hZ;
      while (s.hZ < gs.length && char() !== 96) s.hZ++;
      tokens.push(['STR', String.fromCharCode(...gs.slice(start, s.hZ))]);
      s.hZ++;
      continue;
    }
    if (c === 34 || c === 39) { // 引号
      const q = c;
      s.hZ++;
      let start = s.hZ;
      while (s.hZ < gs.length && char() !== q) s.hZ++;
      tokens.push(['STR', String.fromCharCode(...gs.slice(start, s.hZ))]);
      s.hZ++;
      continue;
    }
    tokens.push(['RAW_' + c, String.fromCharCode(c)]);
    s.hZ++;
  }
  console.log('\n=== ' + name + ' (len=' + gs.length + ') ===');
  console.log('原始:', gs.join(','));
  console.log('tokens:');
  tokens.forEach((tk, i) => console.log('  #' + i + ': ' + JSON.stringify(tk[0]) + ' ' + JSON.stringify(tk[1]).slice(0, 60)));
}

decode(gs13, 'gS13');
decode(gs36, 'gS36');
decode(gs92, 'gS92');
