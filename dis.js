const fs = require('fs');
const nes = require('./nes');

const filename = './nestest/nestest.nes';
const cpu = new nes.CPU6502(new nes.MemoryBus());
const crt = nes.Cartridge.fromRomData(fs.readFileSync(filename));
const pc = cpu.pc = 0x0C00;

for (const line of nes.dis6502code(crt.prg, pc, pc)) {
  const { address, opcode, instruction, fmtop, rawdata } = line;
  const mnemonic = instruction ? instruction.mnemonic : '???';
  const data = instruction
    ? rawdata.map(x => nes.hex(x)).join(' ')
    : nes.hex(opcode);

  process.stdout.write(nes.hex(address, 4));
  process.stdout.write('   ');
  process.stdout.write(data.padEnd(8));
  process.stdout.write('   ');
  process.stdout.write(mnemonic);
  if (fmtop) {
    process.stdout.write(' ');
    process.stdout.write(fmtop);
  }
  process.stdout.write('\n');
}
