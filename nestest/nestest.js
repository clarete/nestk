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
  const lo = cpu.bus.read(cpu.pc - instruction.size + 1) & 0xFF;
  const hi = cpu.bus.read(cpu.pc - instruction.size + 2) & 0xFF;
  const p16 = (((hi << 8) & 0xFF00) | lo) & 0xFFFF;
  const pageaddr = addr => (
    (cpu.bus.read(addr + 1) << 8) |
      (cpu.bus.read(addr + 0) & 0xFF)) & 0xFFFF;
  const formattedData = instruction.size === 3 ? hex(p16, 4) : hex(lo);
  switch (instruction.addressingMode) {
  case nes.AddrModes.Implied:
    return '';
  case nes.AddrModes.Accumulator:
    return 'A';
  case nes.AddrModes.Absolute:
    if (['JMP', 'JSR'].includes(instruction.mnemonic))
      return `$${formattedData}`;
    return `$${formattedData} = ${hex(cpu.bus.read(p16) & 0xFF)}`;
  case nes.AddrModes.ZeroPage:
    return `$${formattedData} = ${hex(cpu.bus.read(hi))}`;
  case nes.AddrModes.ZeroPageX:
    return `$${formattedData} = ${hex(cpu.bus.read(hi))},X @ ${hex((hi + cpu.x) & 0xFFFF, 4)} = ${hex(cpu.bus.read((hi + cpu.x) & 0xFFFF) & 0xFF, 2)}`;
  case nes.AddrModes.ZeroPageY:
    return `$${formattedData} = ${hex(cpu.bus.read(hi))},Y @ ${hex((hi + cpu.y) & 0xFFFF, 4)} = ${hex(cpu.bus.read((hi + cpu.y) & 0xFFFF) & 0xFF, 2)}`;
  case nes.AddrModes.Immediate:
    return `#$${formattedData}`;
  case nes.AddrModes.AbsoluteX:
    return `${formattedData}`;
  case nes.AddrModes.AbsoluteY:
    return `$${hex(p16, 4)},Y @ ${hex((p16 + cpu.y) & 0xFFFF, 4)} = ${hex(cpu.bus.read((p16 + cpu.y) & 0xFFFF) & 0xFF, 2)}`;
  case nes.AddrModes.Relative:
    return `$${hex(cpu.pc - 2 + instruction.size + parseInt(data[1], 16))}`;
  case nes.AddrModes.Indirect: {
    return `($${hex(p16, 4)}) = ${hex(pageaddr(p16), 4)}`;
  } case nes.AddrModes.IndirectX: {
    const addr = (lo + cpu.x) & 0xFF;
    const paddr = hex(pageaddr(addr), 4);
    const pvalu = hex(cpu.bus.read(pageaddr(addr)));
    return `($${hex(lo)},X) @ ${hex(addr)} = ${paddr} = ${pvalu}`;
  } case nes.AddrModes.IndirectY: {
    const paddr = hex(pageaddr(lo+cpu.y), 4);
    const pvalu = hex(cpu.bus.read(pageaddr(lo+cpu.y)));
    return `($${hex(lo)}),Y = ${hex(pageaddr(lo), 4)} @ ${paddr} = ${pvalu}`;
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
  const opcaddr = cpu.pc;
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
    hex(opcaddr, 4), '',
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
