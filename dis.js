const fs = require('fs');
const nes = require('./nes');

const filename = './nestest/nestest.nes';
const cpu = new nes.CPU6502(new nes.MemoryBus());
const crt = nes.Cartridge.fromRomData(fs.readFileSync(filename));
const pc = cpu.pc = 0xC000;

for (const line of nes.dis6502code(crt.prg, pc)) {
  const { address, opcode, instruction, fmtop, rawdata } = line;
  const mnemonic = (instruction && !instruction.illegal)
    ? instruction.mnemonic
    : '.db';
  const data = instruction
    ? rawdata.map(x => nes.safehex(x)).join(' ')
    : nes.hex(opcode);
  process.stdout.write(nes.hex(address, 4));
  process.stdout.write('   ');
  process.stdout.write(data.padEnd(8));
  process.stdout.write('   ');
  process.stdout.write(mnemonic);
  process.stdout.write(' ');
  process.stdout.write(fmtop || `$${nes.hex(opcode)}`);
  process.stdout.write('\n');
}
