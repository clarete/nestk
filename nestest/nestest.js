const fs = require('fs');
const nes = require('../nes');

const cpu = new nes.CPU6502(new nes.ArrayBus(65536));
const crt = nes.Cartridge.fromRomData(fs.readFileSync('./nestest.nes'));

cpu.pc = 0xC000;
cpu.bus.writeBuffer(cpu.pc, crt.prg);

let remaining = crt.prg.length;

const hex = (data, padSize=2, padChr='0') => data
  .toString(16)
  .toUpperCase()
  .padStart(padSize, padChr);

const formatParameter = (instruction, data) => {
  let suffix = '';
  if (['STX'].includes(instruction.mnemonic))
    suffix = ` = ${hex(cpu.x)}`;
  const formattedData = hex(data
    .slice(1)
    .reverse()
    .map(x => x.toString(16).toUpperCase())
    .join(''));
  switch (instruction.addressingMode) {
  case nes.AddrModes.Implied:
    return suffix;
  case nes.AddrModes.Absolute:
  case nes.AddrModes.ZeroPage:
  case nes.AddrModes.Relative:
    return `$${formattedData}${suffix}`;
  case nes.AddrModes.Immediate:
    return `#$${formattedData}${suffix}`;
  default:
    console.log(instruction);
    throw new Error(`Unknown addr mode ${instruction.addressingMode}`);
  }
};

while (remaining-- > 0) {
  const savedpc = cpu.pc;
  const address = cpu.pc.toString(16).toUpperCase();
  const opcode = cpu.bus.read(cpu.pc);
  const instruction = nes.getinopc(opcode);
  const data = [];
  for (let i = 0; i < instruction.size; i++)
    data.push(hex(cpu.bus.read(cpu.pc++)));
  const bigEndianData = data
    .map(x => x.toString(16).toUpperCase())
    .join(' ')
    .padEnd(8);
  const lilEndianData = formatParameter(instruction, data).padEnd(27);
  const logmsg = [
    address, '',
    bigEndianData, '',
    instruction.mnemonic,
    lilEndianData,
    `A:${hex(cpu.a)}`,
    `X:${hex(cpu.x)}`,
    `Y:${hex(cpu.y)}`,
    `P:${hex(cpu.p)}`,
    `SP:${hex(cpu.s)}`,
    `CYC:${hex(0, 3, ' ')}`,
    `SL:${0}`
  ].join(' ');

  // Revert the Program Counter to the saved location right before the
  // instructionwe just logged above
  cpu.pc = savedpc;
  // Run the one instruction on the CPU
  cpu.step();
  // Print out the stuff
  console.log(logmsg);
}
