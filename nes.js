// Address Modes
// Instructions
// Cycles

const MNEMONICS = [
  'ADC', 'AND', 'ASL', 'BCC', 'BCS', 'BEQ', 'BIT', 'BMI', 'BNE', 'BPL', 'BRK',
  'BVC', 'BVS', 'CLC', 'CLD', 'CLI', 'CLV', 'CMP', 'CPX', 'CPY', 'DEC', 'DEX',
  'DEY', 'EOR', 'INC', 'INX', 'INY', 'JMP', 'JSR', 'LDA', 'LDX', 'LDY', 'LSR',
  'NOP', 'ORA', 'PHA', 'PHP', 'PLA', 'PLP', 'ROL', 'ROR', 'RTI', 'RTS', 'SBC',
  'SEC', 'SED', 'SEI', 'STA', 'STX', 'STY', 'TAX', 'TAY', 'TSX', 'TXA', 'TXS',
  'TYA',
];

const uint8 =
  s => new Uint8Array(s);

class CPU6502 {
  constructor(bus, program) {
    // Stuff
    this.bus = bus;
    this.program = program;
    // CPU State
    this.a = uint8(1);          // General purpose accumulator
    this.x = uint8(1);          // Index register
    this.y = uint8(1);          // Index register
    this.s = uint8(1);          // Stack pointer
    this.p = uint8(1);          // Status flags
    this.pc = uint8(2);         // Program Counter
  }
}

class PPU {
}

class Memory {
}

class Instruction {
  constructor(mnemonic, index, am, cycles=1) {
    this.mnemonic = mnemonic;
    this.index = index;
    this.addressingMode = am;
    this.cycles = cycles;
  }
}

class NES {
  constructor() {
    this.memory = new Memory();
    this.ppu = new PPU();
    this.cpu = new CPU6502();
  }

  init() {
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
  const plus = f => [f()].concat(star(f));
  const optional = f => or([f, () => null]);
  // Parsing functions
  const thunkspect = c => () => expect(c);
  const ws = () => star(() => or(Array.from(' \t', thunkspect))).join('');
  const nl = () => star(thunkspect('\n')).join('');
  const parseHexDigit = () => {
    return or(Array.from("0123456789abcdef", thunkspect));
  };
  const parseHexNumber = () => {
    expect('$');
    return parseInt(star(parseHexDigit).join(''), 16);
  };
  const parseImmediate = () => {
    expect('#');
    return parseHexNumber();
  };
  const parseAddress = () => {
    return or([parseImmediate, parseHexNumber, parseIdentifier]);
  };
  const parseInstruction = () => {
    const mnemonics = MNEMONICS
      .map(m => [m, m.toLowerCase()]).flat()
      .map(x => () => expectStr(x));
    const mn = or(mnemonics); ws();
    const val = optional(parseAddress);
    const out = ['instruction', mn];
    if (val) out.push(val);
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

function testParse6502asm() {
  const asm = (f) => fs.readFileSync(f).toString();
  console.log(asm('./prog00.nesS'));
  console.log(parse6502asm(asm('./prog00.nesS')));
  console.log(parse6502asm(asm('./prog01.nesS')));
}

function testParseINESFile() {
  const file = './nestest.nes';
  const ines = new INES(fs.readFileSync(file));
  ines.parse();
}

function test() {
  testParse6502asm();
}

if (!module.parent) test();

