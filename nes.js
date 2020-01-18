/*

 Thanks to http://nesdev.com/6502.txt

 * [-] Address Modes
 * [-] CPU Instructions
 * [ ] Cycles
 * [ ] PPU
 * [ ] Input
 * [ ] Cartridge
 * [-] iNES format

 */

const CARRY_FLAG     = 1 << 0;
const ZERO_FLAG      = 1 << 1;
const INTERRUPT_FLAG = 1 << 2;
const DECIMAL_FLAG   = 1 << 3;
const BREAK_FLAG     = 1 << 4;
const UNUSED_FLAG    = 1 << 5;
const OVERFLOW_FLAG  = 1 << 6;
const SIGN_FLAG      = 1 << 7;

class CPU6502 {
  constructor(bus) {
    this.a = 0;          // General purpose accumulator
    this.x = 0;          // Index register
    this.y = 0;          // Index register
    this.s = 0xFD;       // Stack pointer
    this.p = 0x24;       // Status flags
    this.pc = 0;         // Program Counter

    // Memory bus & clock
    this.bus = bus;
    this.cycles = 0;
  }

  parameter(instr) {
    const addr8 = (offset=0) => {
      return this.bus.read(this.pc++) + offset;
    };
    const addr16 = (offset=0) => {
      const lo = this.bus.read(this.pc++);
      const hi = this.bus.read(this.pc++);
      const pos = (hi << 8) | (lo & 0x00ff);
      return pos + offset;
    };
    switch (instr.addressingMode) {
    // This impplied by the instruction
    case AddrModes.Implied: return undefined;
    // Bip-bop
    case AddrModes.Accumulator: return this.a;
    // Should return what's right under the Program Counter
    case AddrModes.Immediate: return this.pc++;
    // All the zero-page and indexed zero page reads with both X & Y
    // registers. They're all 8bit numbers
    case AddrModes.ZeroPage: return addr8();
    case AddrModes.ZeroPageX: return addr8(this.x) & 0xFF;
    case AddrModes.ZeroPageY: return addr8(this.y) & 0xFF;
    // Absolute addresses with and without indexing
    case AddrModes.Absolute: return addr16();
    case AddrModes.AbsoluteX: return addr16(this.x);
    case AddrModes.AbsoluteY: return addr16(this.y);
    // Indirect address or pointers
    case AddrModes.Indirect: return this.bus.read(addr16());
    case AddrModes.IndirectX:
      const addr = addr8(this.x) & 0xFF;
      return (this.bus.read(addr) | (this.bus.read((addr + 1) & 0xFF) << 8)) & 0xFFFF;
    // For branches. The +1 accounts for the increment made by `addr8()'
    case AddrModes.Relative: return addr8(this.pc+1);
    default:
      throw new Error(`Invalid Address Mode ${instr.addressingMode}: ${instr}`);
    }
  }

  step() {
    const opcode = this.bus.read(this.pc++);
    const instruction = getinopc(opcode);
    if (!instruction) throw new Error(`Invalid opcode ${opcode}`);
    const parameter = this.parameter(instruction);
    const executor = this[`_instr_${instruction.mnemonic}`];
    if (!executor)
      throw new Error(`No executor for ${instruction}`);
    return executor.bind(this)(parameter, instruction);
  }

  run() {
    while (true)
      this.step();
  }

  // -- Stack --

  push(value) {
    this.bus.write(0x0100 + this.s--, value);
  }
  pop() {
    return this.bus.read(0x0100 + ++this.s);
  }

  // -- Flags --

  flagS(value) {
    if ((value & 0x80) === 0x80) this.p |= SIGN_FLAG;
    else this.p &= ~SIGN_FLAG;
  }
  flagV(value) {
    if ((value & 0x40) === 0x40) this.p |= OVERFLOW_FLAG;
    else this.p &= ~OVERFLOW_FLAG;
  }
  flagB(value) {
    if (value) this.p |= BREAK_FLAG;
    else this.p &= ~BREAK_FLAG;
  }
  flagD(value) {
    if (value) this.p |= DECIMAL_FLAG;
    else this.p &= ~DECIMAL_FLAG;
  }
  flagI(value) {
    if (value) this.p |= INTERRUPT_FLAG;
    else this.p &= ~INTERRUPT_FLAG;
  }
  flagZ(value) {
    if (value === 0) this.p |= ZERO_FLAG;
    else this.p &= ~ZERO_FLAG;
  }
  flagC(value) {
    if (value) this.p |= CARRY_FLAG;
    else this.p &= ~CARRY_FLAG;
  }
  flag(flag) {
    return this.p & flag;
  }

  // -- Instructions --

  _instr_NOP(addr) {}
  _instr_CLV(addr) { this.flagV(false); }
  _instr_CLC(addr) { this.flagC(false); }
  _instr_CLI(addr) { this.flagI(false); }
  _instr_CLD(addr) { this.flagD(false); }

  _instr_SEC(addr) { this.flagC(true); }
  _instr_SEI(addr) { this.flagI(true); }
  _instr_SED(addr) { this.flagD(true); }

  _instr_AND(addr) {
    this.a &= this.bus.read(addr);
    this.flagZ(this.a);
    this.flagS(this.a);
  }
  _instr_ORA(addr) {
    this.a |= this.bus.read(addr);
    this.flagZ(this.a);
    this.flagS(this.a);
  }
  _instr_EOR(addr) {
    this.a ^= this.bus.read(addr);
    this.flagZ(this.a);
    this.flagS(this.a);
  }

  _instr_ADC(addr) {
    const value = this.bus.read(addr);
    const res = this.a + value + (+this.flag(CARRY_FLAG));
    const overflow = ~(this.a ^ value) & (this.a ^ res) & 0x80;
    if (overflow) this.p |= OVERFLOW_FLAG;
    else this.p &= ~OVERFLOW_FLAG;
    this.a = res & 0xFF;
    this.flagZ(this.a);
    this.flagS(this.a);
    this.flagC(res > 0xFF);
  }
  _instr_SBC(addr) {
    const value = ~this.bus.read(addr);
    const res = this.a + value + (+this.flag(CARRY_FLAG));
    const overflow = ~(this.a ^ value) & (this.a ^ res) & 0x80;
    if (overflow) this.p |= OVERFLOW_FLAG;
    else this.p &= ~OVERFLOW_FLAG;
    this.a = res & 0xFF;
    this.flagZ(this.a);
    this.flagS(this.a);
    this.flagC(res >= 0);
  }
  _instr_LSR(addr, instruction) {
    this.flagC((addr & 1) === 1);
    const value = addr >> 1;
    this.flagZ(value);
    this.flagS(value);
    if (instruction.addressingMode === AddrModes.Accumulator)
      this.a = value;
    else
      this.bus.write(addr, value);
  }
  _instr_ASL(addr, instruction) {
    this.flagC((addr & 0x80) === 0x80);
    const value = (addr << 1) & 0xFF;
    this.flagZ(value);
    this.flagS(value);
    if (instruction.addressingMode === AddrModes.Accumulator)
      this.a = value;
    else
      this.bus.write(addr, value);
  }
  _instr_ROL(addr, instruction) {
    let value = addr << 1;
    if (this.flag(CARRY_FLAG)) value |= 0x1;
    this.flagC(value > 0xFF);
    value &= 0xFF;
    this.flagZ(value);
    this.flagS(value);
    if (instruction.addressingMode === AddrModes.Accumulator)
      this.a = value;
    else
      this.bus.write(addr, value);
  }
  _instr_ROR(addr, instruction) {
    let value = this.flag(CARRY_FLAG) ? addr | 0x100 : addr;
    this.flagC((value & 0x1) === 0x1);
    value >>= 1;
    this.flagZ(value);
    this.flagS(value);
    if (instruction.addressingMode === AddrModes.Accumulator)
      this.a = value;
    else
      this.bus.write(addr, value);
  }

  _instr_LDA(addr) {
    this.a = this.bus.read(addr);
    this.flagZ(this.a);
    this.flagS(this.a);
  }
  _instr_LDX(addr) {
    this.x = this.bus.read(addr);
    this.flagZ(this.x);
    this.flagS(this.x);
  }
  _instr_LDY(addr) {
    this.y = this.bus.read(addr);
    this.flagZ(this.y);
    this.flagS(this.y);
  }

  _instr_DEC(addr) {
    if (--this.a < 0) this.a = 0xFF;
    this.flagZ(this.a);
    this.flagS(this.a);
  }
  _instr_DEX(addr) {
    if (--this.x < 0) this.x = 0xFF;
    this.flagZ(this.x);
    this.flagS(this.x);
  }
  _instr_DEY(addr) {
    if (--this.y < 0) this.y = 0xFF;
    this.flagZ(this.y);
    this.flagS(this.y);
  }

  _instr_INC(addr) {
    const value = this.bus.read(addr) + 1;
    this.bus.write(addr, value);
    this.flagZ(value);
    this.flagS(value);
  }
  _instr_INX(addr) {
    if (++this.x > 0xFF) this.x = 0;
    this.flagZ(this.x);
    this.flagS(this.x);
  }
  _instr_INY(addr) {
    if (++this.y > 0xFF) this.y = 0;
    this.flagZ(this.y);
    this.flagS(this.y);
  }

  _instr_TAX(addr) {
    this.x = this.a;
    this.flagZ(this.x);
    this.flagS(this.x);
  }
  _instr_TAY(addr) {
    this.y = this.a;
    this.flagZ(this.y);
    this.flagS(this.y);
  }
  _instr_TYA(addr) {
    this.a = this.y;
    this.flagZ(this.a);
    this.flagS(this.a);
  }
  _instr_TXA(addr) {
    this.a = this.x;
    this.flagZ(this.a);
    this.flagS(this.a);
  }
  _instr_TSX(addr) {
    this.x = this.s;
    this.flagZ(this.x);
    this.flagS(this.x);
  }
  _instr_TXS(addr) {
    this.s = this.x;
  }

  _instr_STA(addr) {
    this.bus.write(addr, this.a);
  }
  _instr_STX(addr) {
    this.bus.write(addr, this.x);
  }
  _instr_STY(addr) {
    this.bus.write(addr, this.y);
  }

  _instr_JMP(addr) {
    this.pc = addr;
  }

  _instr_JSR(addr) {
    this.pc--;
    this.push((this.pc >> 8) & 0xFF);
    this.push(this.pc & 0xFF);
    this.pc = addr;
  }

  _instr_RTS(addr) {
    const [lo, hi] = [this.pop(), this.pop()];
    const pc = ((hi & 0xFF) << 8) | (lo & 0xFF);
    this.pc = pc + 1;
  }
  _instr_RTI(addr) {
    this._instr_PLP();
    const [lo, hi] = [this.pop(), this.pop()];
    const pc = ((hi & 0xFF) << 8) | (lo & 0xFF);
    this.pc = pc;
  }

  _instr_PHA(addr) {
    this.push(this.a);
  }
  _instr_PHP(addr) {
    this.push(this.p | 0b00110000);
  }

  _instr_PLA(addr) {
    this.a = this.pop();
    this.flagZ(this.a);
    this.flagS(this.a);
  }
  _instr_PLP(addr) {
    this.p = (this.pop() | UNUSED_FLAG) & ~BREAK_FLAG;
  }

  _instr_BRK(p) {
    const num = this.bus.read(0xFFFE) | (this.bus.read(0xFFFF) << 8);
    this.flagB(true);
    this.flagI(true);
    this.pc = num;
  }

  _instr_BCS(addr) {
    if (this.flag(CARRY_FLAG))
      this.pc = addr;
  }
  _instr_BCC(addr) {
    if (!this.flag(CARRY_FLAG))
      this.pc = addr;
  }
  _instr_BEQ(addr) {
    if (this.flag(ZERO_FLAG))
      this.pc = addr;
  }
  _instr_BNE(addr) {
    if (!this.flag(ZERO_FLAG))
      this.pc = addr;
  }
  _instr_BVS(addr) {
    if (this.flag(OVERFLOW_FLAG))
      this.pc = addr;
  }
  _instr_BVC(addr) {
    if (!this.flag(OVERFLOW_FLAG))
      this.pc = addr;
  }
  _instr_BMI(addr) {
    if (this.flag(SIGN_FLAG))
      this.pc = addr;
  }
  _instr_BPL(addr) {
    if (!this.flag(SIGN_FLAG))
      this.pc = addr;
  }
  _instr_BIT(addr) {
    const value = this.bus.read(addr);
    this.flagS(value);
    this.flagV(value);
    this.flagZ(value & this.a);
  }

  _compare(register, addr) {
    const value = register - this.bus.read(addr);
    this.flagC(value >= 0);
    this.flagZ(value);
    this.flagS(value);
  }

  _instr_CMP(addr) {
    this._compare(this.a, addr);
  }
  _instr_CPX(addr) {
    this._compare(this.x, addr);
  }
  _instr_CPY(addr) {
    this._compare(this.y, addr);
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

function inesparser(buffer) {
  let cursor = 0;
  const read8 = () => buffer.readInt8(cursor++);
  // Magic Constant $4E$45$53$1A ("NES" followed by MS-DOS EOF)
  if (buffer.readUInt32LE() !== 0x1A53454E)
    throw new Error('Invalid iNES header');
  // Skip the length of the magic number
  cursor += 4;
  // Size of PRG ROM in 16 KB units
  const prgsize = read8() * 0x4000;
  // Size of CHR ROM in 8 KB units (Value 0 means the board uses CHR RAM)
  const chrsize = read8() * 0x2000;

  /*
    76543210
    ||||||||
    |||||||+- Mirroring: 0: horizontal (vertical arrangement) (CIRAM A10 = PPU A11)
    |||||||              1: vertical (horizontal arrangement) (CIRAM A10 = PPU A10)
    ||||||+-- 1: Cartridge contains battery-backed PRG RAM ($6000-7FFF) or other persistent memory
    |||||+--- 1: 512-byte trainer at $7000-$71FF (stored before PRG data)
    ||||+---- 1: Ignore mirroring control or above mirroring bit; instead provide four-screen VRAM
    ++++----- Lower nybble of mapper number
  */
  const flags6 = read8();
  const trainingEnd = (flags6 & 4) == 4 ? 512 : 0;

  // Read the program data by resetting the cursor to skip over the firstfew
  // bytes to get it right the program starts. We're finishin off the parsing
  // without reading all the flags and without reading possible program RAM
  // that some cartridges used.
  cursor = 16 + trainingEnd;
  const prg = buffer.slice(cursor, prgsize); cursor += prgsize;
  const chr = buffer.slice(cursor, chrsize);
  return { prg, chr };
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
    expect('#') && or([parseTwoByteHex, parseOneByteHex, parseIdentifier]);
  const parseIndexed = (fn, c) => {
    const value = fn();
    const strs = [`,${c.toUpperCase()}`, `,${c}`];
    or(strs.map(s => () => expectStr(s)));
    return value;
  };
  const parseJMPIndirect = () => {
    expect('('); ws();
    const value = or([parseTwoByteHex, parseIdentifier]);
    expect(')'); ws();
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
      // 7. Post-indexed indirect
      () => [AddrModes.IndirectPostX, parseIndirectPost('x')],
      () => [AddrModes.IndirectPostY, parseIndirectPost('y')],
      // 8. Pre-indexed indirect
      () => [AddrModes.IndirectX, parseIndirect('x')],
      () => [AddrModes.IndirectY, parseIndirect('y')],
      // 9. Indirect
      () => [AddrModes.Indirect, parseJMPIndirect()],
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
  Accumulator: 14,
};

const AddrModeNames = {
  0: 'Implied',
  1: 'Immediate',
  2: 'Absolute',
  3: 'AbsoluteX',
  4: 'AbsoluteY',
  5: 'ZeroPage',
  6: 'ZeroPageX',
  7: 'ZeroPageY',
  8: 'Indirect',
  9: 'IndirectX',
  10: 'IndirectY',
  11: 'IndirectPostX',
  12: 'IndirectPostY',
  13: 'Relative',
};

const addrmodename = am => AddrModeNames[am];

const INSTRUCTIONS_BY_MAM = {};
const INSTRUCTIONS_BY_OPC = {};
const MNEMONICS = [
  'ADC', 'AND', 'ASL', 'BCC', 'BCS', 'BEQ', 'BIT', 'BMI', 'BNE', 'BPL', 'BRK',
  'BVC', 'BVS', 'CLC', 'CLD', 'CLI', 'CLV', 'CMP', 'CPX', 'CPY', 'DEC', 'DEX',
  'DEY', 'EOR', 'INC', 'INX', 'INY', 'JMP', 'JSR', 'LDA', 'LDX', 'LDY', 'LSR',
  'NOP', 'ORA', 'PHA', 'PHP', 'PLA', 'PLP', 'ROL', 'ROR', 'RTI', 'RTS', 'SBC',
  'SEC', 'SED', 'SEI', 'STA', 'STX', 'STY', 'TAX', 'TAY', 'TSX', 'TXA', 'TXS',
  'TYA',
];

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
newinstr('BNE', 0xD0, AddrModes.Relative,    2, 2);
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
//newinstr('EOR', 0x40, AddrModes.Absolute,    3, 4);
//newinstr('EOR', 0x50, AddrModes.AbsoluteX,   3, 4);
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
newinstr('RTI', 0x40, AddrModes.Implied,     1, 6);
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
newinstr('STA', 0x8D, AddrModes.Absolute,    3, 4);
newinstr('STA', 0x9D, AddrModes.AbsoluteX,   3, 5);
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
      if (!instr) throw new Error(
        `No instr for ${name} ${addrmodename(addrmode)}`);
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

class Cartridge {
  constructor({ prg, chr }) {
    this.prg = prg;
    this.chr = chr;
  }
  static fromRomData(romData) {
    return new Cartridge(inesparser(romData));
  }
}

class ArrayBus extends Array {
  constructor(s) {
    super(s).fill(0);
  }
  read(addr) {
    return this[addr];
  }
  write(addr, data) {
    this[addr] = data;
  }
  writeBuffer(addr, buffer) {
    for (const b of buffer)
      this.write(addr++, b);
  }
}

module.exports = {
  AddrModeNames,
  AddrModes,
  ArrayBus,
  Instruction,
  CPU6502,
  Cartridge,
  addrmodename,
  asm6502code,
  parse6502asm,
  getinopc,
  getinstr,
  inesparser,
};
