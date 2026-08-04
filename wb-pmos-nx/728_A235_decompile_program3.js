const fs = require('fs');
const prog3 = [11, 63, 1, 2, 56, 14, 2, 11, 63, 1, 2, 56, 14, 3, 37, 1, 4, 7, 14, 3, 49, 1, 0, 41, 76, 57, 33, 12, 37, 1, 4, 36, 3, 21, 39, 56, 14, 4, 36, 3, 56, 63, 1, 4, 36, 4, 0];
const prog2 = [49, 1, 0, 63, 1, 4, 86, 12, 0];
function decompile(prog) {
  const log = [];
  let hy = 0, guard = 0;
  while (hy < prog.length && guard++ < 500) {
    const op = prog[hy];
    if (op === 0) { log.push('@' + hy + ' RET'); break; }
    if (op === 57) { log.push('@' + hy + ' push_imm ' + prog[hy + 1]); hy += 2; }
    else if (op === 56) { log.push('@' + hy + ' pop_to_reg h0=' + prog[hy + 1]); hy += 2; }
    else if (op === 14) { log.push('@' + hy + ' reg=lQ'); hy += 1; }
    else if (op === 63) { log.push('@' + hy + ' CHECK<=' + prog[hy + 1]); hy += 2; }
    else if (op === 37) { log.push('@' + hy + ' push_gS[' + prog[hy + 1] + '][' + prog[hy + 2] + ']'); hy += 3; }
    else if (op === 49) { log.push('@' + hy + ' push_dx[' + prog[hy + 1] + '][' + prog[hy + 2] + ']'); hy += 3; }
    else if (op === 36) { log.push('@' + hy + ' push_lQ[' + prog[hy + 1] + ']'); hy += 2; }
    else if (op === 1) { log.push('@' + hy + ' call2(' + prog[hy + 1] + ',' + prog[hy + 2] + ')'); hy += 3; }
    else if (op === 41) { log.push('@' + hy + ' OP41 ' + prog.slice(hy, hy + 3).join(',')); hy += 2; }
    else if (op === 76) { log.push('@' + hy + ' OP76 ' + prog.slice(hy, hy + 2).join(',')); hy += 2; }
    else if (op === 33) { log.push('@' + hy + ' OP33 ' + prog.slice(hy, hy + 2).join(',')); hy += 2; }
    else if (op === 12) { log.push('@' + hy + ' OP12 ' + prog.slice(hy, hy + 3).join(',')); hy += 2; }
    else if (op === 21) { log.push('@' + hy + ' OP21 ' + prog.slice(hy, hy + 3).join(',')); hy += 3; }
    else if (op === 39) { log.push('@' + hy + ' OP39'); hy += 1; }
    else { log.push('@' + hy + ' OP' + op + '?'); hy += 1; }
  }
  return log;
}
console.log('=== program2 (9B) ===');
decompile(prog2).forEach(l => console.log(' ', l));
console.log('\\n=== program3 (47B) ===');
decompile(prog3).forEach(l => console.log(' ', l));
