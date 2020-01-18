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
  const lo = cpu.bus.read(cpu.pc - instruction.size);
  const hi = cpu.bus.read(cpu.pc - instruction.size + 1);
  const p16 = (hi << 8) & (lo | 0xFF);
  const peek16 = addr => (cpu.bus.read(addr) | (cpu.bus.read((addr + 1) & 0xFF) << 8)) & 0xFFFF;
  const formattedData = hex(data
    .slice(1)
    .reverse()
    .map(x => x.toString(16).toUpperCase())
    .join(''));
  switch (instruction.addressingMode) {
  case nes.AddrModes.Implied:
    return '';
  case nes.AddrModes.Accumulator:
    return 'A';
  case nes.AddrModes.Absolute:
    if (['JMP', 'JSR'].includes(instruction.mnemonic))
      return `$${formattedData}`;
    return `$${formattedData} = ${hex(cpu.bus.read(p16))}`;
  case nes.AddrModes.ZeroPage:
    return `$${formattedData} = ${hex(cpu.bus.read(hi & 0xFF))}`;
  case nes.AddrModes.Immediate:
    return `#$${formattedData}`;
  case nes.AddrModes.AbsoluteX:
    return `${formattedData}${suffix}`;
  case nes.AddrModes.Relative:
    return `$${hex(cpu.pc - 2 + instruction.size + parseInt(data[1], 16))}`;
  case nes.AddrModes.IndirectX: {
    const addr = (hi + cpu.x) & 0xFF;
    const paddr = hex(peek16(addr), 4);
    const pvalu = hex(cpu.bus.read(peek16(addr)));
    return `($${hex(hi)},X) @ ${hex(addr)} = ${paddr} = ${pvalu}`;
  } case nes.AddrModes.IndirectY: {
    const addr = hi & 0xFF;
    const paddr0 = hex(peek16(addr), 4);
    const paddr1 = hex(peek16(addr+cpu.y), 4);
    const pvalu = hex(cpu.bus.read(peek16(addr+cpu.y)));
    return `($${hex(hi)}),Y = ${paddr0} @ ${paddr1} = ${pvalu}`;
  } default:
    throw new Error(`UNKNOWN ADDR MODE ${instruction.addressingMode}`);
  }
};

const red = s => `\x1b[31m${s}\x1b[0m`;
const green = s => `\x1b[33m${s}\x1b[0m`;

const logLines = fs
  .readFileSync('./nestest.log')
  .toString()
  .split('\n');

function diff(a, b) {
  // Ignore cycles & scanlines for now
  const [aa] = a.split('CYC');
  const [bb] = b.split('CYC');

  if (aa !== bb) {
    console.log(red(a));
    console.log(green(b));
  } else {
    console.log(a);
  }
}

while (remaining-- > 0) {
  const pc = cpu.pc;
  const opcaddr = cpu.pc.toString(16).toUpperCase();
  const opcode = cpu.bus.read(cpu.pc);
  const instruction = nes.getinopc(opcode);
  if (!instruction)
    throw new Error(`UNKNOWN OPCODE: ${hex(opcode)}.`);
  // Read the raw data of the instruction as well
  const data = [];
  for (let i = 0; i < instruction.size; i++)
    data.push(hex(cpu.bus.read(cpu.pc++)));

  const bigEndianData = data
    .map(x => hex(x.toString(16)))
    .join(' ')
    .padEnd(8);

  const address = formatParameter(instruction, data).padEnd(27);
  const logmsg = [
    opcaddr, '',
    bigEndianData, '',
    instruction.mnemonic,
    address,
    `A:${hex(cpu.a)}`,
    `X:${hex(cpu.x)}`,
    `Y:${hex(cpu.y)}`,
    `P:${hex(cpu.p)}`,
    `SP:${hex(cpu.s)}`,
    `CYC:${hex(0, 3, ' ')}`,
    `SL:${0}`
  ].join(' ');

  // Compare and print out the stuff
  diff(logmsg, logLines.shift());

  // Revert the Program Counter to the saved location right before the
  // instructionwe just logged above
  cpu.pc = pc;
  // Run the one instruction on the CPU
  cpu.step();
}
