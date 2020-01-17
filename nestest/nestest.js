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

const formatParameter = (savedState, instruction, data) => {
  let suffix = '';
  switch (instruction.mnemonic) {
  case 'STA': suffix = ` = ${hex(cpu.a)}`; break;
  case 'STX': suffix = ` = ${hex(cpu.x)}`; break;
  case 'STY': suffix = ` = ${hex(cpu.y)}`; break;
  case 'BIT': suffix = ` = ${hex(cpu.a)}`; break;
  }
  const formattedData = hex(data
    .slice(1)
    .reverse()
    .map(x => x.toString(16).toUpperCase())
    .join(''));
  switch (instruction.addressingMode) {
  case nes.AddrModes.Implied:
    return suffix;
  case nes.AddrModes.Accumulator:
    return 'A';
  case nes.AddrModes.Absolute:
  case nes.AddrModes.ZeroPage:
    return `$${formattedData}${suffix}`;
  case nes.AddrModes.Immediate:
    return `#$${formattedData}${suffix}`;
  case nes.AddrModes.AbsoluteX:
    return `${formattedData}${suffix}`;
  case nes.AddrModes.Relative:
    return `$${hex(savedState.pc + instruction.size + parseInt(data[1], 16))}`;
  default:
    console.log(instruction);
    throw new Error(`UNKNOWN ADDR MODE ${instruction.addressingMode}`);
  }
};

const red = s => `\x1b[31m${s}\x1b[0m`;
const green = s => `\x1b[33m${s}\x1b[0m`;

const logLines = fs
  .readFileSync('./nestest.log')
  .toString()
  .split('\n');

function diff(i, a, b) {
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

function clone(obj) {
  const c = Object.create(Object.getPrototypeOf(obj), Object.getOwnPropertyDescriptors(obj));
  // c.bus = obj.bus.slice();
  return c;
}

while (remaining-- > 0) {
  const savedState = clone(cpu);
  const opcaddr = cpu.pc.toString(16).toUpperCase();
  const opcode = cpu.bus.read(cpu.pc);
  const instruction = nes.getinopc(opcode);
  if (!instruction)
    throw new Error(`UNKNOWN OPCODE: ${hex(opcode)}.`);
  // Read the raw data of the instruction as well
  const data = [];
  for (let i = 0; i < instruction.size; i++)
    data.push(hex(cpu.bus.read(cpu.pc++)));
  // Revert the Program Counter to the saved location right before the
  // instructionwe just logged above
  cpu.pc = savedState.pc;
  // Run the one instruction on the CPU
  cpu.step();

  const bigEndianData = data
    .map(x => hex(x.toString(16)))
    .join(' ')
    .padEnd(8);

  const address = formatParameter(savedState, instruction, data).padEnd(27);
  const logmsg = [
    opcaddr, '',
    bigEndianData, '',
    instruction.mnemonic,
    address,
    `A:${hex(savedState.a)}`,
    `X:${hex(savedState.x)}`,
    `Y:${hex(savedState.y)}`,
    `P:${hex(savedState.p)}`,
    `SP:${hex(savedState.s)}`,
    `CYC:${hex(0, 3, ' ')}`,
    `SL:${0}`
  ].join(' ');

  // Compare and print out the stuff
  diff(savedState, logmsg, logLines.shift());
}
