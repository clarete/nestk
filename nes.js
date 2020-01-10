/*

 Thanks to http://nesdev.com/6502.txt

 * [-] Address Modes
 * [-] CPU Instructions
 * [ ] Cycles
 * [ ] PPU
 * [ ] Input

 */

const MNEMONICS = [
  'ADC', 'AND', 'ASL', 'BCC', 'BCS', 'BEQ', 'BIT', 'BMI', 'BNE', 'BPL', 'BRK',
  'BVC', 'BVS', 'CLC', 'CLD', 'CLI', 'CLV', 'CMP', 'CPX', 'CPY', 'DEC', 'DEX',
  'DEY', 'EOR', 'INC', 'INX', 'INY', 'JMP', 'JSR', 'LDA', 'LDX', 'LDY', 'LSR',
  'NOP', 'ORA', 'PHA', 'PHP', 'PLA', 'PLP', 'ROL', 'ROR', 'RTI', 'RTS', 'SBC',
  'SEC', 'SED', 'SEI', 'STA', 'STX', 'STY', 'TAX', 'TAY', 'TSX', 'TXA', 'TXS',
  'TYA',
];

const CPU6502States = {
  NotSet: 0,
  Halt: 1,
  Running: 2,
  Step: 3,
};

class CPU6502 {
  constructor(bus) {
    this.a = 0;          // General purpose accumulator
    this.x = 0;          // Index register
    this.y = 0;          // Index register
    this.s = 0;          // Stack pointer
    this.p = 0;          // Status flags
    this.pc = 0;         // Program Counter

    // Memory bus
    this.bus = bus;
    // CPU States
    this.state = CPU6502States.NotSet;
    // Clock
    this.cycles = 0;
  }

  parameter(instr) {
    const read8 = (offset=0) => {
      const pos = this.bus.read(this.pc++) + offset;
      return this.bus.read(pos) & 0x00ff;
    };
    const read16 = (offset=0) => {
      const lo = this.bus.read(this.pc++);
      const hi = this.bus.read(this.pc++);
      const pos = hi << 8 | (lo & 0x00ff);
      return this.bus.read(pos + offset);
    };
    switch (instr.addressingMode) {
    // This impplied mode could either mean no parameters for the
    // instruction (or the instruction operates on the data within the
    // acumulator register, which they can do directly)
    case AddrModes.Implied:
      return undefined;
    // Should return what's right under the Program Counter
    case AddrModes.Immediate:
      return this.bus.read(this.pc++);
    // All the zero-page and indexed zero page reads with both X & Y
    // registers. They're all 8bit numbers
    case AddrModes.ZeroPage:
      return read8();
    case AddrModes.ZeroPageX:
      return read8(this.x);
    case AddrModes.ZeroPageY:
      return read8(this.y);
    // Absolute addresses with and without indexing
    case AddrModes.Absolute:
      return read16();
    case AddrModes.AbsoluteX:
      return read16(this.x);
    case AddrModes.AbsoluteY:
      return read16(this.y);

    case AddrModes.Relative:
      return read8();
    default:
      throw new Error(`Invalid Address Mode ${instr.address}`);
    }
  }

  step() {
    const opcode = this.bus.read(this.pc++);
    const instruction = getinopc(opcode);
    if (!instruction) throw new Error(`Invalid opcode ${opcode}`);
    const parameter = this.parameter(instruction);
    const executor = this[`_instr_${instruction.mnemonic}`];
    if (!executor) throw new Error(`Invalid mnemonic ${instruction.mnemonic}`);
    executor.bind(this)(parameter);
  }

  run() {
    while (this.state !== CPU6502States.Halt) {
      if (this.state === CPU6502States.Step)
        this.repl();
      this.step();
    }
  }

  _instr_LDA(p) {
    this.a = p;
  }

  _instr_STA(p) {
    this.bus.write(p, this.a);
  }

  _instr_LDX(p) {
    this.x = p;
  }

  _instr_STX(p) {
    this.bus.write(p, this.x);
  }

  _instr_DEX(p) {
    this.x--;
  }

  _instr_BRK(p) {
    this.state = CPU6502States.Halt;
  }
}

class Instruction {
  constructor(mnemonic, opcode, am, size, cycles) {
    this.mnemonic = mnemonic;
    this.opcode = opcode;
    this.addressingMode = am;
    this.size = size;
    this.cycles = cycles;
  }
}

const fs = require('fs');

class INES {
  constructor(buffer) {
    this.buffer = buffer;
    this.cursor = 0;
  }

  read8() {
    return this.buffer.readInt8(this.cursor++);
  }

  parseHeader() {
    // 0-3: Constant $4E $45 $53 $1A ("NES" followed by MS-DOS end-of-file)
    this.read8();               // 78: N
    this.read8();               // 69: E
    this.read8();               // 83: S
    this.read8();               // 26: MSDOS EOL
    // 4: Size of PRG ROM in 16 KB units
    this.pgrRomSize = this.read8();
    // 5: Size of CHR ROM in 8 KB units (Value 0 means the board uses CHR RAM)
    this.chrRomSize = this.read8();
    // 6: Flags 6 - Mapper, mirroring, battery, trainer
    this.flags6 = this.read8();
    // 7: Flags 7 - Mapper, VS/Playchoice, NES 2.0
    this.flags7 = this.read8();
    // 8: Flags 8 - PRG-RAM size (rarely used extension)
    this.flags8 = this.read8();
    // 9: Flags 9 - TV system (rarely used extension)
    this.flags9 = this.read8();
    // 10: Flags 10 - TV system, PRG-RAM presence (unofficial, rarely used extension)
    this.flags10 = this.read8();
  }

  parse() {
    // 1: Header (16 bytes)
    this.parseHeader();
    console.log(this.cursor);
    // 2: Trainer, if present (0 or 512 bytes)

    // 3: PRG ROM data (16384 * x bytes)

    // 4: CHR ROM data, if present (8192 * y bytes)

    // 5: PlayChoice INST-ROM, if present (0 or 8192 bytes)

    // 6: PlayChoice PROM, if present (16 bytes Data, 16 bytes
    // CounterOut) (this is often missing, see PC10 ROM-Images for
    // details)
  }
}

class ParsingError extends Error {}

function parse6502asm(source) {
  // Lexer facilities
  let cursor = 0;
  const errr = m => { throw new ParsingError(m); };
  const curr = () => source[cursor];
  const next = () => cursor++ === source.length ? errr('End of Input') : true;
  const test = c => curr() === c;
  const expect = c => test(c) ? next() && c : errr(`Expected '${c}' got '${curr()}'`);
  const expectStr = s => Array.from(s, expect) && s;
  // Parsing expressions
  const or = (opts) => {
    const saved = cursor;
    for (const f of opts) {
      try { return f(); }
      catch (e) { cursor = saved; }
    }
    errr('No option found');
  };
  const star = f => {
    const output = [];
    while (true) {
      try { output.push(f()); }
      catch (e) { break; }
    };
    return output;
  };
  const ntimes = (n, f) => {
    const output = [];
    for (let i = 0; i < n; i++)
      output.push(f());
    return output;
  };
  const plus = f => [f()].concat(star(f));
  const optional = f => or([f, () => null]);
  // Parsing functions
  const thunkspect = c => () => expect(c);
  const comment = () => {
    expect(';');
    while (cursor < source.length) {
      const c = curr(); next();
      if (c === '\n') break;
    }
  };
  const ws = () => {
    const opts = Array.from(' \t', thunkspect).concat(comment);
    return star(() => or(opts)).join('');
  };
  const nl = () => star(() => or([thunkspect('\n'), comment])).join('');
  const hex = n => parseInt(n, 16);
  const parseHexDigit = () =>
    or(Array.from("0123456789abcdef", thunkspect));
  const parseOneByteHex = () =>
    expect('$') && hex(ntimes(2, parseHexDigit).join(''));
  const parseTwoByteHex = () =>
    expect('$') && hex(ntimes(4, parseHexDigit).join(''));
  const parseImmediate = () =>
    expect('#') && or([parseOneByteHex, parseIdentifier]);
  const parseIndexed = (fn, c) => {
    const value = fn();
    const strs = [`,${c.toUpperCase()}`, `,${c}`];
    or(strs.map(s => () => expectStr(s)));
    return value;
  };
  const parseIndirect = (c) => {
    expect('('); ws();
    const value = or([parseOneByteHex, parseIdentifier]);
    if (c) {
      const strs = [`,${c.toUpperCase()}`, `,${c}`];
      or(strs.map(s => () => expectStr(s)));
    }
    ws(); expect(')');
    return value;
  };
  const parseIndirectPost = (c) => {
    expect('('); ws();
    const value = or([parseOneByteHex, parseIdentifier]);
    const strs = [`),${c.toUpperCase()}`, `,)${c}`];
    or(strs.map(s => () => expectStr(s))); ws();
    return value;
  };
  const parseAddress = () => {
    // We don't have to care about the following modes here:
    // 0. Implied: 0
    // 1. Accumulator: 0
    return or([
      // 2. Immediate mode: reads 8b data
      () => [AddrModes.Immediate, parseImmediate()],
      // 3, 4. Indexed and Zero-page Indexed
      () => [AddrModes.AbsoluteX, parseIndexed(parseTwoByteHex, 'x')],
      () => [AddrModes.AbsoluteY, parseIndexed(parseTwoByteHex, 'y')],
      () => [AddrModes.ZeroPageX, parseIndexed(parseOneByteHex, 'x')],
      () => [AddrModes.ZeroPageY, parseIndexed(parseOneByteHex, 'y')],
      // 5, 6: Absolute & Zero-page Absolute: read 16b & 8b data
      // respectively
      () => [AddrModes.Absolute, parseTwoByteHex()],
      () => [AddrModes.ZeroPage, parseOneByteHex()],
      // 7. Pre-indexed indirect
      () => [AddrModes.IndirectX, parseIndirect('x')],
      () => [AddrModes.IndirectY, parseIndirect('y')],
      // 8. Post-indexed indirect
      () => [AddrModes.IndirectPostX, parseIndirectPost('x')],
      () => [AddrModes.IndirectPostY, parseIndirectPost('y')],
      // 9. Indirect
      () => [AddrModes.Indirect, parseIndirect(null)],
      // 10. Relative
      () => [AddrModes.Relative, parseIdentifier()]]);
  };
  const parseInstruction = () => {
    const mnemonics = MNEMONICS
      .map(m => [m, m.toLowerCase()]).flat()
      .map(x => () => expectStr(x));
    const out = ['instruction', or(mnemonics)]; ws();
    const addr = optional(parseAddress) || [AddrModes.Implied];
    for (const a of addr) out.push(a);
    return out;
  };
  const parseIdentifier = () => {
    const isdigit = () => {
      const c = curr();
      return Number.isInteger(c)
        ? next() && c
        : errr(`Expected digit, got ${c}`);
    };
    const ischar = () => {
      const c = curr();
      return /[\w_]/.test(c)
        ? next() && c
        : errr(`Expected char, got ${c}`);
    };
    return [ischar()]
      .concat(star(() => or([ischar, isdigit])))
      .join('');
  };
  const parseLabel = () => {
    const label = parseIdentifier();
    ws(); expect(':');
    return ['label', label];
  };
  const parseLine = () => {
    ws();
    const instruction = or([parseLabel, parseInstruction]);
    ws(); nl();
    return instruction;
  };
  return star(parseLine);
}

const AddrModes = {
  Implied: 0,
  Immediate: 1,
  Absolute: 2,
  AbsoluteX: 3,
  AbsoluteY: 4,
  ZeroPage: 5,
  ZeroPageX: 6,
  ZeroPageY: 7,
  Indirect: 8,
  IndirectX: 9,
  IndirectY: 10,
  IndirectPostX: 11,
  IndirectPostY: 12,
  Relative: 13,
};

const INSTRUCTIONS_BY_MAM = {};
const INSTRUCTIONS_BY_OPC = {};
const getinopc = (opc) => INSTRUCTIONS_BY_OPC[opc];
const getinstr = (mnemonic, am) => INSTRUCTIONS_BY_MAM[[mnemonic, am]];
const newinstr = (mnemonic, opc, am, size, cycles) =>
  INSTRUCTIONS_BY_OPC[opc] =
  INSTRUCTIONS_BY_MAM[[mnemonic, am]] =
  new Instruction(mnemonic, opc, am, size, cycles);

newinstr('ADC', 0x69, AddrModes.Immediate,   2, 2);
newinstr('ADC', 0x65, AddrModes.ZeroPage,    2, 3);
newinstr('ADC', 0x75, AddrModes.ZeroPageX,   2, 4);
newinstr('ADC', 0x60, AddrModes.Absolute,    3, 4);
newinstr('ADC', 0x70, AddrModes.AbsoluteX,   3, 4);
newinstr('ADC', 0x79, AddrModes.AbsoluteY,   3, 4);
newinstr('ADC', 0x61, AddrModes.IndirectX,   2, 6);
newinstr('ADC', 0x71, AddrModes.IndirectY,   2, 5);
newinstr('AND', 0x29, AddrModes.Immediate,   2, 2);
newinstr('AND', 0x25, AddrModes.ZeroPage,    2, 3);
newinstr('AND', 0x35, AddrModes.ZeroPageX,   2, 4);
newinstr('AND', 0x2D, AddrModes.Absolute,    3, 4);
newinstr('AND', 0x3D, AddrModes.AbsoluteX,   3, 4);
newinstr('AND', 0x39, AddrModes.AbsoluteY,   3, 4);
newinstr('AND', 0x21, AddrModes.IndirectX,   2, 6);
newinstr('AND', 0x31, AddrModes.IndirectY,   2, 5);
newinstr('ASL', 0x0A, AddrModes.Accumulator, 1, 2);
newinstr('ASL', 0x06, AddrModes.ZeroPage,    2, 5);
newinstr('ASL', 0x16, AddrModes.ZeroPageX,   2, 6);
newinstr('ASL', 0x0E, AddrModes.Absolute,    3, 6);
newinstr('ASL', 0x1E, AddrModes.AbsoluteX,   3, 7);
newinstr('BCC', 0x90, AddrModes.Relative,    2, 2);
newinstr('BCS', 0xB0, AddrModes.Relative,    2, 2);
newinstr('BEQ', 0xF0, AddrModes.Relative,    2, 2);
newinstr('BIT', 0x24, AddrModes.ZeroPage,    2, 3);
newinstr('BIT', 0x2C, AddrModes.Absolute,    3, 4);
newinstr('BMI', 0x30, AddrModes.Relative,    2, 2);
newinstr('BMI', 0xD0, AddrModes.Relative,    2, 2);
newinstr('BPL', 0x10, AddrModes.Relative,    2, 2);
newinstr('BRK', 0x00, AddrModes.Implied,     1, 7);
newinstr('BVC', 0x50, AddrModes.Relative,    2, 2);
newinstr('BVS', 0x70, AddrModes.Relative,    2, 2);
newinstr('CLC', 0x18, AddrModes.Implied,     1, 2);
newinstr('CLD', 0xD8, AddrModes.Implied,     1, 2);
newinstr('CLI', 0x58, AddrModes.Implied,     1, 2);
newinstr('CLV', 0xB8, AddrModes.Implied,     1, 2);
newinstr('CMP', 0xC9, AddrModes.Immediate,   2, 2);
newinstr('CMP', 0xC5, AddrModes.ZeroPage,    2, 3);
newinstr('CMP', 0xD5, AddrModes.ZeroPageX,   2, 4);
newinstr('CMP', 0xCD, AddrModes.Absolute,    3, 4);
newinstr('CMP', 0xDD, AddrModes.AbsoluteX,   3, 4);
newinstr('CMP', 0xD9, AddrModes.AbsoluteY,   3, 4);
newinstr('CMP', 0xC1, AddrModes.IndirectX,   2, 6);
newinstr('CMP', 0xD1, AddrModes.IndirectY,   2, 5);
newinstr('CPX', 0xE0, AddrModes.Immediate,   2, 2);
newinstr('CPX', 0xE4, AddrModes.ZeroPage,    2, 3);
newinstr('CPX', 0xEC, AddrModes.Absolute,    3, 4);
newinstr('CPY', 0xC0, AddrModes.Immediate,   2, 2);
newinstr('CPY', 0xC4, AddrModes.ZeroPage,    2, 3);
newinstr('CPY', 0xCC, AddrModes.Absolute,    3, 4);
newinstr('DEC', 0xC6, AddrModes.ZeroPage,    2, 5);
newinstr('DEC', 0xD6, AddrModes.ZeroPageX,   2, 6);
newinstr('DEC', 0xCE, AddrModes.Absolute,    3, 6);
newinstr('DEC', 0xDE, AddrModes.AbsoluteX,   3, 7);
newinstr('DEX', 0xCA, AddrModes.Implied,     1, 2);
newinstr('DEY', 0x88, AddrModes.Implied,     1, 2);
newinstr('EOR', 0x49, AddrModes.Immediate,   2, 2);
newinstr('EOR', 0x45, AddrModes.ZeroPage,    2, 3);
newinstr('EOR', 0x55, AddrModes.ZeroPageX,   2, 4);
newinstr('EOR', 0x40, AddrModes.Absolute,    3, 4);
newinstr('EOR', 0x50, AddrModes.AbsoluteX,   3, 4);
newinstr('EOR', 0x59, AddrModes.AbsoluteY,   3, 4);
newinstr('EOR', 0x41, AddrModes.IndirectX,   2, 6);
newinstr('EOR', 0x51, AddrModes.IndirectY,   2, 5);
newinstr('INC', 0xE6, AddrModes.ZeroPage,    2, 5);
newinstr('INC', 0xF6, AddrModes.ZeroPageX,   2, 6);
newinstr('INC', 0xEE, AddrModes.Absolute,    3, 6);
newinstr('INC', 0xFE, AddrModes.AbsoluteX,   3, 7);
newinstr('INX', 0xE8, AddrModes.Implied,     1, 2);
newinstr('INY', 0xC8, AddrModes.Implied,     1, 2);
newinstr('JMP', 0x4C, AddrModes.Absolute,    3, 3);
newinstr('JMP', 0x6C, AddrModes.Indirect,    3, 5);
newinstr('JSR', 0x20, AddrModes.Absolute,    3, 6);
newinstr('LDA', 0xA9, AddrModes.Immediate,   2, 2);
newinstr('LDA', 0xA5, AddrModes.ZeroPage,    2, 3);
newinstr('LDA', 0xB5, AddrModes.ZeroPageX,   2, 4);
newinstr('LDA', 0xAD, AddrModes.Absolute,    3, 4);
newinstr('LDA', 0xBD, AddrModes.AbsoluteX,   3, 4);
newinstr('LDA', 0xB9, AddrModes.AbsoluteY,   3, 4);
newinstr('LDA', 0xA1, AddrModes.IndirectX,   2, 6);
newinstr('LDA', 0xB1, AddrModes.IndirectY,   2, 5);
newinstr('LDX', 0xA2, AddrModes.Immediate,   2, 2);
newinstr('LDX', 0xA6, AddrModes.ZeroPage,    2, 3);
newinstr('LDX', 0xB6, AddrModes.ZeroPageY,   2, 4);
newinstr('LDX', 0xAE, AddrModes.Absolute,    3, 4);
newinstr('LDX', 0xBE, AddrModes.AbsoluteY,   3, 4);
newinstr('LDY', 0xA0, AddrModes.Immediate,   2, 2);
newinstr('LDY', 0xA4, AddrModes.ZeroPage,    2, 3);
newinstr('LDY', 0xB4, AddrModes.ZeroPageX,   2, 4);
newinstr('LDY', 0xAC, AddrModes.Absolute,    3, 4);
newinstr('LDY', 0xBC, AddrModes.AbsoluteX,   3, 4);
newinstr('LSR', 0x4A, AddrModes.Accumulator, 1, 2);
newinstr('LSR', 0x46, AddrModes.ZeroPage,    2, 5);
newinstr('LSR', 0x56, AddrModes.ZeroPageX,   2, 6);
newinstr('LSR', 0x4E, AddrModes.Absolute,    3, 6);
newinstr('LSR', 0x5E, AddrModes.AbsoluteX,   3, 7);
newinstr('NOP', 0xEA, AddrModes.Implied,     1, 2);
newinstr('ORA', 0x09, AddrModes.Immediate,   2, 2);
newinstr('ORA', 0x05, AddrModes.ZeroPage,    2, 3);
newinstr('ORA', 0x15, AddrModes.ZeroPageX,   2, 4);
newinstr('ORA', 0x0D, AddrModes.Absolute,    3, 4);
newinstr('ORA', 0x1D, AddrModes.AbsoluteX,   3, 4);
newinstr('ORA', 0x19, AddrModes.AbsoluteY,   3, 4);
newinstr('ORA', 0x01, AddrModes.IndirectX,   2, 6);
newinstr('ORA', 0x11, AddrModes.IndirectY,   2, 5);
newinstr('PHA', 0x48, AddrModes.Implied,     1, 3);
newinstr('PHP', 0x08, AddrModes.Implied,     1, 3);
newinstr('PLA', 0x68, AddrModes.Implied,     1, 4);
newinstr('PLP', 0x28, AddrModes.Implied,     1, 4);
newinstr('ROL', 0x2A, AddrModes.Accumulator, 1, 2);
newinstr('ROL', 0x26, AddrModes.ZeroPage,    2, 5);
newinstr('ROL', 0x36, AddrModes.ZeroPageX,   2, 6);
newinstr('ROL', 0x2E, AddrModes.Absolute,    3, 6);
newinstr('ROL', 0x3E, AddrModes.AbsoluteX,   3, 7);
newinstr('ROR', 0x6A, AddrModes.Accumulator, 1, 2);
newinstr('ROR', 0x66, AddrModes.ZeroPage,    2, 5);
newinstr('ROR', 0x76, AddrModes.ZeroPageX,   2, 6);
newinstr('ROR', 0x6E, AddrModes.Absolute,    3, 6);
newinstr('ROR', 0x7E, AddrModes.AbsoluteX,   3, 7);
newinstr('RTI', 0x4D, AddrModes.Implied,     1, 6);
newinstr('RTS', 0x60, AddrModes.Implied,     1, 6);
newinstr('SBC', 0xE9, AddrModes.Immediate,   2, 2);
newinstr('SBC', 0xE5, AddrModes.ZeroPage,    2, 3);
newinstr('SBC', 0xF5, AddrModes.ZeroPageX,   2, 4);
newinstr('SBC', 0xED, AddrModes.Absolute,    3, 4);
newinstr('SBC', 0xFD, AddrModes.AbsoluteX,   3, 4);
newinstr('SBC', 0xF9, AddrModes.AbsoluteY,   3, 4);
newinstr('SBC', 0xE1, AddrModes.IndirectX,   2, 6);
newinstr('SBC', 0xF1, AddrModes.IndirectY,   2, 5);
newinstr('SEC', 0x38, AddrModes.Implied,     1, 2);
newinstr('SED', 0xF8, AddrModes.Implied,     1, 2);
newinstr('SEI', 0x78, AddrModes.Implied,     1, 2);
newinstr('STA', 0x85, AddrModes.ZeroPage,    2, 3);
newinstr('STA', 0x95, AddrModes.ZeroPageX,   2, 4);
newinstr('STA', 0x80, AddrModes.Absolute,    3, 4);
newinstr('STA', 0x90, AddrModes.AbsoluteX,   3, 5);
newinstr('STA', 0x99, AddrModes.AbsoluteY,   3, 5);
newinstr('STA', 0x81, AddrModes.IndirectX,   2, 6);
newinstr('STA', 0x91, AddrModes.IndirectY,   2, 6);
newinstr('STX', 0x86, AddrModes.ZeroPage,    2, 3);
newinstr('STX', 0x96, AddrModes.ZeroPageY,   2, 4);
newinstr('STX', 0x8E, AddrModes.Absolute,    3, 4);
newinstr('STY', 0x84, AddrModes.ZeroPage,    2, 3);
newinstr('STY', 0x94, AddrModes.ZeroPageX,   2, 4);
newinstr('STY', 0x8C, AddrModes.Absolute,    3, 4);
newinstr('TAX', 0xAA, AddrModes.Implied,     1, 2);
newinstr('TAY', 0xA8, AddrModes.Implied,     1, 2);
newinstr('TSX', 0xBA, AddrModes.Implied,     1, 2);
newinstr('TXA', 0x8A, AddrModes.Implied,     1, 2);
newinstr('TXS', 0x9A, AddrModes.Implied,     1, 2);
newinstr('TYA', 0x98, AddrModes.Implied,     1, 2);

function asm6502code(code) {
  // Writing machinery
  let buffer = Buffer.alloc(8, 0, 'binary');
  let bufferOffset = 0;
  // Ensure buffer size
  const offset = step => {
    const nextSize = bufferOffset += step;
    if (nextSize > buffer.byteLength)
      buffer = Buffer.concat([buffer, Buffer.alloc(step)], nextSize);
    return nextSize - step;
  };
  // Because the `buffer' variable is reassigned in this scope
  const write = (length, fn) => { const of = offset(length); fn(buffer, of); };
  const wByte = v => write(1, (b, o) => b.writeUInt8(v, o));
  // Traverse the input
  const cache = {};             // label: location
  const patchlist = {};         // label: [locations]

  function wAddr(value) {
    if (cache[value] !== undefined) {
      wByte(cache[value]);
    } else if (value < 0xff) {
      wByte(value);
    } else if (value < 0xffff) {
      wByte(value & 0xff);
      wByte(value >> 8);
    } else {
      throw new Error(`Value too big ${value}`);
    }
  }

  for (const [type, name, addrmode, value] of code) {
    switch (type) {
    case 'instruction': {
      const instr = getinstr(name, addrmode);
      if (!instr) throw new Error(`No instr for ${name}`);
      wByte(instr.opcode);
      if (value) wAddr(value);
    } break;
    case 'label':
      // Should locations be 16bit addresses here?
      cache[name] = offset(0);
      for (const location of patchlist[name] || [])
        buffer.writeInt8(location, cache[name]);
      break;
    }
  }
  return buffer;
}

function testParse6502asm() {
  const asm = (f) => fs.readFileSync(f).toString();
  console.log(parse6502asm(asm('./prog00.nesS')));
  console.log(parse6502asm(asm('./prog01.nesS')));
}

function testASM() {
  const asm = (f) => asm6502code(parse6502asm(
    fs.readFileSync(f).toString()));
  // a9 01 8d 00 02 a9 05 8d 01 02 a9 08 8d 02 02
  console.log(asm('./prog00.nesS'));
  // a2 08 ca 8e 00 02 e0 03 d0 f8 8e 01 02 00
  console.log(asm('./prog01.nesS'));
}

function testParseINESFile() {
  const file = './nestest.nes';
  const ines = new INES(fs.readFileSync(file));
  ines.parse();
}

class ArrayBus extends Array {
  read(addr) {
    return this[addr];
  }
  write(addr, data) {
    this[addr] = data;
  }
  writeBuffer(addr, buffer) {
    let cursor = 0x0600;
    for (const b of buffer)
      this.write(cursor++, b);
  }
}

const asm = (f) => asm6502code(parse6502asm(fs.readFileSync(f).toString()));


function testCPU6502_0() {
  const mem = new ArrayBus(65536);
  const cpu = new CPU6502(mem);
  let cursor = cpu.pc = 0x0600;
  for (const b of asm('./prog00.nesS'))
    mem.write(cursor++, b);

  cpu.step();
  console.log(cpu.a);               // cpu.a === 1
  console.log(cpu.pc.toString(16)); // 0x0602
  cpu.step();
  console.log(cpu.pc.toString(16)); // 0x0605
  console.log(mem[0x0200]);         // 1

  cpu.step();
  console.log(cpu.a);               // cpu.a === 5
  console.log(cpu.pc.toString(16)); // 0x0607
  cpu.step();
  console.log(cpu.pc.toString(16)); // 0x060a
  console.log(mem[0x0201]);         // 5

  cpu.step();
  console.log(cpu.a);
  console.log(cpu.pc.toString(16));
  cpu.step();
  console.log(cpu.pc.toString(16));
  console.log(mem[0x0202]);
}

function testCPU6502() {
  testCPU6502_0();
}

function test() {
  testParse6502asm();
  testASM();
  testCPU6502();
}

if (!module.parent) test();

module.exports = {
  asm6502code,
  ArrayBus,
  AddrModes,
  Instruction,
  INES,
  CPU6502States,
  CPU6502,
  parse6502asm,
};
