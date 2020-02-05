/*

 Thanks to
 - https://nesdev.com
 - https://problemkaputt.de/everynes.htm
 - https://fms.komkon.org/EMUL8/NES.html

 * [x] Addressing Modes
 * [x] Instructions
 * [ ] Interrupts
 * [-] Cycles
 * [-] PPU
 * [ ] Input
 * [-] Cartridge
 * [-] iNES format

 */

class CPU6502 {  // 2A03
  static Flags = {
    Carry:       1 << 0,
    Zero:        1 << 1,
    Interrupt:   1 << 2,
    Decimal:     1 << 3,
    Break:       1 << 4,
    Unused:      1 << 5,
    Overflow:    1 << 6,
    Sign:        1 << 7,
  };
  static Interrupt = {
    None: -1,
    NMI:   0,
    IRQ:   1,
    Reset: 2,
  };
  static InterruptVectors = {
    [CPU6502.Interrupt.NMI]:   0xFFFA,
    [CPU6502.Interrupt.IRQ]:   0xFFFE,
    [CPU6502.Interrupt.RESET]: 0xFFFC,
  };

  constructor(bus) {
    this.a = 0;          // General purpose accumulator
    this.x = 0;          // Index register
    this.y = 0;          // Index register
    this.s = 0xFD;       // Stack pointer
    this.p = 0x24;       // Status flags
    this.pc = 0;         // Program Counter
    this.int = CPU6502.Interrupt.None;
    // Memory bus & clock
    this.bus = bus;
    this.cycles = 0;
    this.delay = 0;
  }

  resetPC() {
    const addr = CPU6502.InterruptVectors[CPU6502.Interrupt.RESET];
    const lo = this.bus.read(addr + 0);
    const hi = this.bus.read(addr + 1);
    this.pc = (hi << 8) | lo;
  }

  operand(instr) {
    const addr8 = (offset=0) => {
      return (this.bus.read(this.pc++) & 0xFF) + offset;
    };
    const addr16 = (offset=0) => {
      const lo = addr8();
      const hi = addr8();
      const pos = (hi << 8) | lo;
      return (pos + offset) & 0xFFFF;
    };
    const addr16ind = (offset=0) => {
      const oplo = this.bus.read(this.pc++);
      const ophi = this.bus.read(this.pc++);
      const operand = ((ophi << 8) | (oplo & 0xFF) + offset) & 0xFFFF;
      // https://wiki.nesdev.com/w/index.php/Errata
      const value = ((operand & 0xFF) === 0xFF)
        // Reset page to 0
        ? ((this.bus.read(operand - 0xFF) << 8) |
           (this.bus.read(operand) & 0xFF)) & 0xFFFF
        // Read page from the next byte
        : ((this.bus.read(operand + 1) << 8) |
           (this.bus.read(operand) & 0xFF)) & 0xFFFF;
      return value;
    };
    switch (instr.addressingMode) {
    case AddrModes.Implied: return undefined;
    case AddrModes.Accumulator: return this.a;
    case AddrModes.Immediate: return this.pc++;
    case AddrModes.ZeroPage: return addr8();
    case AddrModes.ZeroPageX: return addr8(this.x) & 0xFF;
    case AddrModes.ZeroPageY: return addr8(this.y) & 0xFF;
    case AddrModes.Absolute: return addr16();
    case AddrModes.AbsoluteX: return addr16(this.x);
    case AddrModes.AbsoluteY: return addr16(this.y);
    case AddrModes.Indirect: return addr16ind();
    case AddrModes.IndirectX: {
      const addr = addr8(this.x) & 0xFF;
      return (this.bus.read(addr) | (this.bus.read((addr + 1) & 0xFF) << 8)) & 0xFFFF;
    } case AddrModes.IndirectY: {
      const addr0 = addr8() & 0xFF;
      const addr1 = (this.bus.read(addr0) | (this.bus.read((addr0 + 1) & 0xFF) << 8));
      const addr2 = (addr1 + this.y) & 0xFFFF;
      return addr2;
    } case AddrModes.Relative: {
      const offset = addr8();
      return offset < 0x80 ? offset + this.pc : offset + (this.pc - 0x100);
    } default:
      throw new Error(`Invalid Address Mode ${instr.addressingMode}: ${instr}`);
    }
  }

  instructionCycles(instruction, addr) {
    this.cycles += instruction.cycles;
    if (instruction.checkPageCross) {
      switch (instruction.addressingMode) {
      case AddrModes.AbsoluteX:
        this.cycles += this._crosspage(addr, addr - this.x) ? 1 : 0;
        break;
      case AddrModes.AbsoluteY:
      case AddrModes.IndirectY:
        this.cycles += this._crosspage(addr, addr - this.y) ? 1 : 0;
        break;
      }
    }
  }

  step() {
    // The CPU is handling a DMA request
    if (this.delay > 0) {
      this.delay--;
      return 1;
    }
    // Before each instructio, CPU checks for interrupts and executes
    // its handlers if necessary
    switch (this.int) {
    case CPU6502.Interrupt.Reset:
    case CPU6502.Interrupt.NMI:
      this.interrupt();
      break;
    case CPU6502.Interrupt.IRQ:
      if (this.flag(CPU6502.Flags.Interrupt) === 0)
        this.interrupt();
      break;
    }
    // Instruction execution
    const cycles = this.cycles;
    const opcode = this.bus.read(this.pc++);
    const instruction = getinopc(opcode);
    if (!instruction)
      throw new Error(`Invalid opcode ${opcode}`);
    const executor = this[`_instr_${instruction.mnemonic}`];
    if (!executor)
      throw new Error(`No executor for ${instruction}`);
    const operand = this.operand(instruction);
    this.instructionCycles(instruction, operand);
    executor.bind(this)(operand, instruction);
    return this.cycles - cycles;
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
    if ((value & 0x80) === 0x80) this.p |= CPU6502.Flags.Sign;
    else this.p &= ~CPU6502.Flags.Sign;
  }
  flagV(value) {
    if ((value & 0x40) === 0x40) this.p |= CPU6502.Flags.Overflow;
    else this.p &= ~CPU6502.Flags.Overflow;
  }
  flagB(value) {
    if (value) this.p |= CPU6502.Flags.Break;
    else this.p &= ~CPU6502.Flags.Break;
  }
  flagD(value) {
    if (value) this.p |= CPU6502.Flags.Decimal;
    else this.p &= ~CPU6502.Flags.Decimal;
  }
  flagI(value) {
    if (value) this.p |= CPU6502.Flags.Interrupt;
    else this.p &= ~CPU6502.Flags.Interrupt;
  }
  flagZ(value) {
    if (value === 0) this.p |= CPU6502.Flags.Zero;
    else this.p &= ~CPU6502.Flags.Zero;
  }
  flagC(value) {
    if (value) this.p |= CPU6502.Flags.Carry;
    else this.p &= ~CPU6502.Flags.Carry;
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
    const res = this.a + value + (+this.flag(CPU6502.Flags.Carry));
    const overflow = ~(this.a ^ value) & (this.a ^ res) & 0x80;
    if (overflow) this.p |= CPU6502.Flags.Overflow;
    else this.p &= ~CPU6502.Flags.Overflow;
    this.a = res & 0xFF;
    this.flagZ(this.a);
    this.flagS(this.a);
    this.flagC(res > 0xFF);
  }
  _instr_SBC(addr) {
    const value = ~this.bus.read(addr);
    const res = this.a + value + (+this.flag(CPU6502.Flags.Carry));
    const overflow = ~(this.a ^ value) & (this.a ^ res) & 0x80;
    if (overflow) this.p |= CPU6502.Flags.Overflow;
    else this.p &= ~CPU6502.Flags.Overflow;
    this.a = res & 0xFF;
    this.flagZ(this.a);
    this.flagS(this.a);
    this.flagC(res >= 0);
  }

  _getAddrOrAccum(addr, instruction) {
    return (instruction.addressingMode === AddrModes.Accumulator)
      ? this.a
      : this.bus.read(addr);
  }
  _setAddrOrAccum(addr, instruction, value) {
    if (instruction.addressingMode === AddrModes.Accumulator)
      this.a = value;
    else
      this.bus.write(addr, value);
  }
  _instr_LSR(addr, instruction) {
    const valueIn = this._getAddrOrAccum(addr, instruction);
    const value = valueIn >> 1;
    this.flagC((valueIn & 1) === 1);
    this.flagZ(value);
    this.flagS(value);
    this._setAddrOrAccum(addr, instruction, value);
  }
  _instr_ASL(addr, instruction) {
    const valueIn = this._getAddrOrAccum(addr, instruction);
    const value = (valueIn << 1) & 0xFF;
    this.flagC((valueIn & 0x80) === 0x80);
    this.flagZ(value);
    this.flagS(value);
    this._setAddrOrAccum(addr, instruction, value);
  }
  _instr_ROL(addr, instruction) {
    const valueIn = this._getAddrOrAccum(addr, instruction) << 1;
    const value = (this.flag(CPU6502.Flags.Carry) ? valueIn | 0x1 : valueIn) & 0xFF;
    this.flagC(valueIn > 0xFF);
    this.flagZ(value);
    this.flagS(value);
    this._setAddrOrAccum(addr, instruction, value);
  }
  _instr_ROR(addr, instruction) {
    const valueIn = this._getAddrOrAccum(addr, instruction);
    let value = (this.flag(CPU6502.Flags.Carry) ? valueIn | 0x100 : valueIn) >> 1;
    this.flagC((valueIn & 0x1) === 0x1);
    this.flagZ(value);
    this.flagS(value);
    this._setAddrOrAccum(addr, instruction, value);
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
    const value = (this.bus.read(addr) - 1) & 0xFF;
    this.bus.write(addr, value);
    this.flagZ(value);
    this.flagS(value);
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
    const value = (this.bus.read(addr) + 1) & 0xFF;
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
    this.p = (this.pop() | CPU6502.Flags.Unused) & ~CPU6502.Flags.Break;
  }

  _instr_BRK(p) {
    const num = this.bus.read(0xFFFE) | (this.bus.read(0xFFFF) << 8);
    this.flagB(true);
    this.flagI(true);
    this.pc = num;
  }

  _crosspage(a, b) {
    return ((a & 0xFF00) !== (b & 0xFF00));
  }
  _branch(addr) {
    this.cycles += this._crosspage(this.pc, addr) ? 2 : 1;
    this.pc = addr;
  }
  _instr_BCS(addr) {
    if (this.flag(CPU6502.Flags.Carry))
      this._branch(addr);
  }
  _instr_BCC(addr) {
    if (!this.flag(CPU6502.Flags.Carry))
      this._branch(addr);
  }
  _instr_BEQ(addr) {
    if (this.flag(CPU6502.Flags.Zero))
      this._branch(addr);
  }
  _instr_BNE(addr) {
    if (!this.flag(CPU6502.Flags.Zero))
      this._branch(addr);
  }
  _instr_BVS(addr) {
    if (this.flag(CPU6502.Flags.Overflow))
      this._branch(addr);
  }
  _instr_BVC(addr) {
    if (!this.flag(CPU6502.Flags.Overflow))
      this._branch(addr);
  }
  _instr_BMI(addr) {
    if (this.flag(CPU6502.Flags.Sign))
      this._branch(addr);
  }
  _instr_BPL(addr) {
    if (!this.flag(CPU6502.Flags.Sign))
      this._branch(addr);
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

  _instr_LAX(addr) {
    const value = this.bus.read(addr);
    this.x = value;
    this.a = value;
    this.flagZ(value);
    this.flagS(value);
  }
  _instr_SAX(addr) {
    this.bus.write(addr, this.a & this.x);
  }
  _instr_DCP(addr) {
    const value = (this.bus.read(addr) - 1) & 0xFF;
    const comparable = this.a - value;
    this.bus.write(addr, value);
    this.flagC(comparable >= 0);
    this.flagZ(comparable);
    this.flagS(comparable);
  }
  _instr_ISC(addr) {
    this._instr_INC(addr);
    this._instr_SBC(addr);
  }
  _instr_SLO(addr, instruction) {
    this._instr_ASL(addr, instruction);
    this._instr_ORA(addr);
  }
  _instr_RLA(addr, instruction) {
    this._instr_ROL(addr, instruction);
    this._instr_AND(addr);
  }
  _instr_SRE(addr, instruction) {
    this._instr_LSR(addr, instruction);
    this._instr_EOR(addr);
  }
  _instr_RRA(addr, instruction) {
    this._instr_ROR(addr, instruction);
    this._instr_ADC(addr);
  }

  // Interrupts
  interrupt() {
    const vector = CPU6502.InterruptVectors[this.int];
    const lo = this.bus.read(vector + 0);
    const hi = this.bus.read(vector + 1);
    if (this.int === CPU6502.Interrupt.Reset)
      this.s -= 3;
    else {
      this.push((this.pc >> 8) & 0xFF);
      this.push(this.pc & 0xFF);
      this.push(this.p | 0b00110000);
    }
    this.p |= CPU6502.Flags.Interrupt;
    this.pc = (hi << 8) | lo;
    this.int = CPU6502.Flags.Interrupt.None;
  }
  requestInterrupt(interrupt) {
    this.int = interrupt;
  }
}

class MemoryBus {
  constructor() { this.w = []; this.r = []; }
  handleGet(start, end, fn) { this.r.push([v => v >= start && v <= end, fn]); }
  handlePut(start, end, fn) { this.w.push([v => v >= start && v <= end, fn]); }
  read(addr) { return this.findCallback(this.r, addr)(addr); }
  write(addr, val) { return this.findCallback(this.w, addr)(addr, val); }
  findCallback(where, addr) {
    for (const [filter, callback] of where)
      if (filter(addr)) return callback;
    throw new Error(`Invalid address $${hex(addr)}`);
  }
}

class Joypad {
  static Button = {
    A:      1 << 7,
    B:      1 << 6,
    Select: 1 << 5,
    Enter:  1 << 4,
    Up:     1 << 3,
    Dow:    1 << 2,
    Left:   1 << 1,
    Right:  1 << 0,
  };
  constructor(keyMapping) {
    this.keyMapping = keyMapping;
    this.data = 0;
    this.strobing = false;
  }
  pressKey(key) {
    if (!this.keyMapping[key]) return;
    this.data |= this.keyMapping[key];
  }
  releaseKey(key) {
    if (!this.keyMapping[key]) return;
    this.data &= ~this.keyMapping[key];
  }
  strobe(onOff) {
  }
  state() {
  }
}

class NES {
  constructor() {
    this.masterClock = 0;
    this.cpumem = new Int16Array(0x1FFF);
    this.cpubus = new MemoryBus();
    this.ppubus = new MemoryBus();
    this.cpu = new CPU6502(this.cpubus);
    this.ppu = new PPU2c02(this.ppubus);
    this.jports = [];
    this.cartridge = null;

    // CPU Memory Map (16bit buswidth, 0-FFFFh)
    //   $0000h-$07FF   Internal 2K Work RAM (mirrored to 800h-1FFFh)
    //   $2000h-$2007   Internal PPU Registers (mirrored to 2008h-3FFFh)
    //   $4000h-$4017   Internal APU Registers
    //   $4018h-$5FFF   Cartridge Expansion Area almost 8K
    //   $6000h-$7FFF   Cartridge SRAM Area 8K
    //   $8000h-$FFFF   Cartridge PRG-ROM Area 32K

    // Wire CPU to memory
    this.cpubus.handleGet(0x0000, 0x07FF, addr => this.cpumem[addr & 0x07FF]);
    this.cpubus.handlePut(0x0000, 0x07FF, (addr, val) => this.cpumem[addr & 0x07FF] = val);
    // Wire PPU to CPU bus
    this.cpubus.handleGet(0x2000, 0x2007, addr => this.ppu.readRegister(addr & 0x7));
    this.cpubus.handlePut(0x2000, 0x2007, (addr, val) => this.ppu.writeRegister(addr & 0x7, val));
    // Wire CPU to cartridge
    this.cpubus.handleGet(0x6000, 0x7FFF, addr => this.cartridge.chr[(addr & 0x7FFF) - 0x6000]);
    this.cpubus.handleGet(0x8000, 0xFFFF, addr => this.cartridge.readprg(addr));
    // Wire IO Registers to CPU bus.  Just only one Joypad connected for now
    this.cpubus.handleGet(0x4000, 0x4017, addr => (addr === 0x4016) ? this.jports[0].state() & 0x1 : 0x0);
    this.cpubus.handlePut(0x4000, 0x401F, (addr, val) => {
      switch (addr) {
      case 0x4014: this.ppu.dma(val); break; // oam dma
      case 0x4016: this.jports[0].strobe(val === 1); break;
      }
    });

    // PPU Memory Map (14bit buswidth, 0-3FFFh)
    //   $0000-$0FFF   Pattern Table 0 (4K) (256 Tiles)
    //   $1000-$1FFF   Pattern Table 1 (4K) (256 Tiles)
    //   $2000-$23FF   Name Table 0 and Attribute Table 0 (1K) (32x30 BG Map)
    //   $2400-$27FF   Name Table 1 and Attribute Table 1 (1K) (32x30 BG Map)
    //   $2800-$2BFF   Name Table 2 and Attribute Table 2 (1K) (32x30 BG Map)
    //   $2C00-$2FFF   Name Table 3 and Attribute Table 3 (1K) (32x30 BG Map)
    //   $3000-$3EFF   Mirror of 2000h-2EFFh
    //   $3F00-$3F1F   Background and Sprite Palettes (25 entries used)
    //   $3F20-$3FFF   Mirrors of 3F00h-3F1Fh

    // Wire PPU to cartridge (will blow up if insertCartridge hasn't been called)
    this.ppubus.handleGet(0x0000, 0x0FFF, addr => this.cartridge.chr[addr & 0x0FFF]);
    this.ppubus.handleGet(0x1000, 0x1FFF, addr => this.cartridge.chr[addr & 0x1FFF]);
  }
  plugScreen() {
    return this;
  }
  plugController1(joypad) {
    this.jports.push(joypad);
    return this;
  }
  insertCartridge(cartridgeData) {
    this.cartridge = Cartridge.fromRomData(cartridgeData);
    this.cpu.resetPC();
    return this;
  }
  powerUp() {
    return this;
  }

  disassemble() {
    // FIX-TODO: This will break with >16k PRG games
    const offset = (this.cartridge.prg.length === 0x4000)
      ? 0xC000
      : 0x8000;
    return dis6502code(this.cartridge.prg, offset);
  }
  step() {
    const cpuCycles = this.cpu.step();
    for (let i = 0; i < cpuCycles * 3; i++) {
      this.ppu.step();
    }
    if (this.ppu.nmi) {
      this.cpu.requestInterrupt(CPU6502.Interrupt.NMI);
      this.ppu.nmi = false;
    }
  }
}

function dis6502code(code, offset) {
  let cursor = 0;
  const output = [];
  const curraddr = () => offset + cursor;
  const peek = (o=0) => code[cursor+o];
  const read8 = () => code[cursor++] & 0xFF;
  const read16 = () => {
    const lo = read8();
    const hi = read8();
    return (hi << 8) | lo;
  };
  while (cursor < code.length) {
    let operand = null;
    const address = curraddr();
    const opcode = read8();
    const instruction = getinopc(opcode);
    const item = { address, opcode, instruction };
    const rawdata = [opcode];
    if (!instruction || instruction.illegal) {
      output.push({ ...item, operand, rawdata });
      continue;
    }
    switch (instruction.size) {
    case 2:
      rawdata.push(peek());
      operand = read8();
      break;
    case 3:
      rawdata.push(peek(0));
      rawdata.push(peek(1));
      operand = read16();
      break;
    }
    let fmtop;
    const fixrl = rl => rl < 0x80 ? rl + curraddr() : rl + (curraddr() - 0x100);
    switch (instruction.addressingMode) {
    case AddrModes.Implied:     fmtop = '';                            break;
    case AddrModes.Immediate:   fmtop = `#$${hex(operand)}`;           break;
    case AddrModes.Absolute:    fmtop = `$${hex(operand, 4)}`;         break;
    case AddrModes.AbsoluteX:   fmtop = `$${hex(operand, 4)},X`;       break;
    case AddrModes.AbsoluteY:   fmtop = `$${hex(operand, 4)},Y`;       break;
    case AddrModes.ZeroPage:    fmtop = `$${hex(operand)}`;            break;
    case AddrModes.ZeroPageX:   fmtop = `$${hex(operand)},X`;          break;
    case AddrModes.ZeroPageY:   fmtop = `$${hex(operand)},Y`;          break;
    case AddrModes.Indirect:    fmtop = `($${hex(operand, 4)})`;       break;
    case AddrModes.IndirectX:   fmtop = `($${hex(operand, 4)},X)`;     break;
    case AddrModes.IndirectY:   fmtop = `($${hex(operand, 4)}),Y`;     break;
    case AddrModes.Relative:    fmtop = `$${hex(fixrl(operand), 4)}`;  break;
    case AddrModes.Accumulator: fmtop = `A`;                           break;
    }
    output.push({ ...item, operand, rawdata, fmtop });
  }
  return output;
}

const MirroringModes = {
  Vertical: 0,
  Horizontal: 1,
};

class PPU2c02 {
  static CTRLFlags = {
    EnableNMI:       1 << 7,  // Execute NMI on VBlank             (0=Disabled, 1=Enabled)
    Unused:          1 << 6,  // PPU Master/Slave Selection        (0=Master, 1=Slave) (Not used in NES)
    SpriteSize:      1 << 5,  // Sprite Size                       (0=8x8, 1=8x16)
    PatternTable1:   1 << 4,  // Pattern Table Address Background  (0=VRAM 0000h, 1=VRAM 1000h)
    PatternTable2:   1 << 3,  // Pattern Table Address 8x8 Sprites (0=VRAM 0000h, 1=VRAM 1000h)
    VRAMIncrement:   1 << 2,  // Port 2007h VRAM Address Increment (0=Increment by 1, 1=Increment by 32)
    NametableY:      1 << 1,  // Bit1-0 Name Table Scroll Address  (0-3=VRAM 2000h,2400h,2800h,2C00h)
    NametableX:      1 << 0,  // (That is, Bit0=Horizontal Scroll by 256, Bit1=Vertical Scroll by 240)
  };
  static MaskFlags = {
    EmphasisBlue:         1 << 7, // Bit7  Color Emphasis        (0=Normal, 1=Emphasis)
    EmphasisGreen:        1 << 6, // Bit6  Color Emphasis        (0=Normal, 1=Emphasis)
    EmphasisRed:          1 << 5, // Bit5  Color Emphasis        (0=Normal, 1=Emphasis)
    SpriteVisibile:       1 << 4, // Bit4  Sprite Visibility     (0=Not displayed, 1=Displayed)
    BackgroundVisibile:   1 << 3, // Bit3  Background Visibility (0=Not displayed, 1=Displayed)
    SpriteClipping:       1 << 2, // Bit2  Sprite Clipping       (0=Hide in left 8-pixel column, 1=No clipping)
    BackgroundClipping:   1 << 1, // Bit1  Background Clipping   (0=Hide in left 8-pixel column, 1=No clipping)
    MonochromeMode:       1 << 0, // Bit0  Monochrome Mode       (0=Color, 1=Monochrome)  (see Palettes chapter)
  };
  static StatusFlags = {
    VBlank:         1 << 7, // Bit7   VBlank Flag    (1=VBlank)
    SpriteZeroHit:  1 << 6, // Bit6   Sprite 0 Hit   (1=Background-to-Sprite0 collision)
    SpriteOverflow: 1 << 5, // Bit5   Lost Sprites   (1=More than 8 sprites in 1 scanline)
                            // Bit4-0 Not used       (Undefined garbage)
  };
  static Registers = {
    Ctrl:      0x2000,
    Mask:      0x2001,
    Status:    0x2002,
    OAMAddr:   0x2003,
    OAMData:   0x2004,
    Scroll:    0x2005,
    Addr:      0x2006,
    Data:      0x2007,
    OAMDMA:    0x4014,
  };

  constructor(bus) {
    this.cycle = 0;
    this.scanline = 0;
    this.mirroring = MirroringModes.Vertical;
    this.bus = bus;
    this.nmi = false;           // Signal request for CPU

    // Registers
    this.ctrl = 0;
    this.mask = 0;
    this.status = 0;
    this.oamaddr = 0;
    this.oamdata = 0;
    this.scroll = 0;
    this.addr = 0;
    this.data = 0;
    this.dataBuffer = 0;

    // Memory
    this.vram = new Int8Array(0x3FFF);
    this.ntRam = new Int8Array(0x4000);
    this.paletteRam = new Int8Array(0x20);
    this.oamRam = new Int8Array(0x100);

    // Loopy's registers
    this.v = 0;  // VRam Address
    this.t = 0;  // Temporary VRam Address
    this.x = 0;  // Fine X
    this.w = 0;  // Write Latch

    // Stuff
    this.ntByte = 0;
    this.atByte = 0;
  }
  reset() {
    this.cycle = 340;
    this.scanline = 240;
    this.frameCount = 0;
    this.ctrl = 0;
    this.mask = 0;
    this.oamAddr = 0;
  }
  readRegister(index) {
    switch (index) {
    case PPU2c02.Registers.Status:      // $2002 read
      const value = this.status;
      this.w = 0;                       // w:                  = 0
      this.status &= ~PPU2c02.StatusFlags.VBlank;
      return value & 0xE0;

    case PPU2c02.Registers.OAMData:
      return this.oamRam[this.oamAddr];

    case PPU2c02.Registers.Data:
      const buffered = this.dataBuffer;
      this.dataBuffer = this.bus.read(this.v);
      const output = (this.v <= 0x3EFF)
        ? buffered              // Dummy read takes two cycles
        : this.dataBuffer;      // palette memory takes one cycle
      this.v += (this.ctrl & PPU2c02.CTRLFlags.VRAMIncrement) ? 32 : 1;
      return output;
    }

    throw new Error(`Invalid PPU Register '${index}'`);
  }
  writeRegister(index, value) {
    switch (index) {
    case PPU2c02.Registers.Ctrl:          // $2000 write
      this.ctrl = value;
      this.t |= ((this.ctrl & 0x3) << 2); // t: ...BA.. ........ = d: ......BA
      break;

    case PPU2c02.Registers.Mask:
      this.mask = value;
      break;

    case PPU2c02.Registers.OAMAddr:
      this.oamAddr = value;
      break;

    case PPU2c02.Registers.OAMData:
      this.oamRam[this.oamAddr++] = value;
      break;

    case PPU2c02.Registers.Scroll:
      if (this.w === 0) {       // $2005 first write (w is 0)
        this.t |= value & ~0x7; // t: ....... ...HGFED = d: HGFED...
        this.x = value & 0x7;   // x:              CBA = d: .....CBA
        this.w = 1;             // w:                  = 1
      } else {                            // $2005 second write (w is 1)
        this.t |= ((value & 0xC0) <<  2); // t: CBA..HG FED..... = d: HGFEDCBA
        this.t |= ((value & 0x07) << 12); //    ^^^
        this.t |= ((value & 0x38) <<  2); //            ^^^
        this.w = 0;                       // w:                  = 0
      }
      break;

    case PPU2c02.Registers.Addr:
      if (this.w === 0) {                // $2006 first write (w is 0)
        this.t = (this.t & 0x80FF)       // t: X...... ........ = 0
          | ((value & 0x3F) << 8);       // t: .FEDCBA ........ = d: ..FEDCBA
        this.w = 1;                      // w:                  = 1
      } else {                               // $2006 second write (w is 1)
        this.t = (this.t & 0xFF00) | value;  // t: ....... HGFEDCBA = d: HGFEDCBA
        this.v = this.t;                     // v                   = t
        this.w = 0;                          // w:                  = 0
      }
      break;

    case PPU2c02.Registers.Data:
      this.bus.write(this.v, value);
      this.v += (this.ctrl & PPU2c02.CTRLFlags.VRAMIncrement) ? 32 : 1;
      break;
    }
  }

  // ---- Address Methods ----

  addrNametable() {
    return 0x2000 | (this.v & 0x0FFF);
  }
  addrAttributte() {
  }
  addrBackground() {
  }
  addrSprite() {
  }

  // ---- Action Methods ----

  actionVBlankStart() {
    this.status |= PPU2c02.StatusFlags.VBlank;
    if (this.ctrl & PPU2c02.CTRLFlags.EnableNMI)
      this.nmi = true;
  }
  actionVBlankEnd() {
    this.status &= ~PPU2c02.StatusFlags.VBlank;
    this.status &= ~PPU2c02.StatusFlags.SpriteZeroHit;
    this.status &= ~PPU2c02.StatusFlags.SpriteOverflow;
  }
  actionReadVRAM() {
    let nt, at, bgLo, bgHi;
    switch (this.cycle % 8) {
    case 1: this.addrBuffer = this.addrNametable(); break;
    case 2: nt = this.bus.read(this.addrBuffer); break;
    case 3: this.addrBuffer = this.addrAttributte(); break;
    case 4: at = this.bus.read(this.addrBuffer); break;
    case 5: this.addrBuffer = this.addrBackground(); break;
    case 6: bgLo = this.bus.read(this.addrBuffer); break;
    case 7: this.addrBuffer += 8; break;
    case 0: bgHi = this.bus.read(this.addrBuffer); break;
    }
    console.log('read-vram', (this.cycle%8), nt, at, bgLo, bgHi);
  }

  // ---- Scanline Methods ----

  scanlineNMI() {
    if (this.cycle === 1) {
      this.status |= PPU2c02.StatusFlags.VBlank;
      if (this.ctrl & PPU2c02.CTRLFlags.EnableNMI)
        this.nmi = true;
    }
  }
  scanlinePost() {
    if (this.cycle === 0) {
      // new frame
      // this.frameCount++;
    }
  }
  scanlineStep(pre=false) {
    if (pre && this.cycle === 1) {
      this.actionVBlankEnd();
    }
    if (this.cycle > 0) {
      // this.actionReadVRAM();
    }
  }
  step() {
    switch (this.scanline) {
    case between(this.scanline, 0, 239): this.scanlineStep(); break;
    case 240: this.scanlinePost(); break;
    case 241: this.scanlineNMI(); break;
    case 261: this.scanlineStep(true); break;
    }

    if (++this.cycle > 340) {
      this.cycle = 0;
      if (++this.scanline > 260) {
        this.scanline = -1;
      }
    }
  }
}

const between = (v, a, b) => v >= a && v <= b;

class Instruction {
  constructor(mnemonic, opcode, am, size, cycles, checkPageCross, illegal) {
    this.mnemonic = mnemonic;
    this.opcode = opcode;
    this.addressingMode = am;
    this.size = size;
    this.cycles = cycles;
    this.checkPageCross = checkPageCross;
    this.illegal = illegal;
  }
  toString() {
    return `${this.mnemonic}(${this.opcode.toString(16)})`;
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
  const prg = new Uint8Array(buffer.slice(cursor, cursor+prgsize)); cursor += prgsize;
  const chr = new Uint8Array(buffer.slice(cursor, cursor+chrsize));
  return { prg, chr };
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
  Relative: 11,
  Accumulator: 12,
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
  11: 'Relative',
  12: 'Accumulator',
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
const newinstr = (mnemonic, opc, am, size, cycles, checkPageCross=false, illegal=false) =>
  INSTRUCTIONS_BY_OPC[opc] =
  INSTRUCTIONS_BY_MAM[[mnemonic, am]] =
  new Instruction(mnemonic, opc, am, size, cycles, checkPageCross, illegal);

newinstr('ADC', 0x69, AddrModes.Immediate,   2, 2);
newinstr('ADC', 0x65, AddrModes.ZeroPage,    2, 3);
newinstr('ADC', 0x75, AddrModes.ZeroPageX,   2, 4);
newinstr('ADC', 0x6D, AddrModes.Absolute,    3, 4);
newinstr('ADC', 0x7D, AddrModes.AbsoluteX,   3, 4, true);
newinstr('ADC', 0x79, AddrModes.AbsoluteY,   3, 4, true);
newinstr('ADC', 0x61, AddrModes.IndirectX,   2, 6);
newinstr('ADC', 0x71, AddrModes.IndirectY,   2, 5, true);
newinstr('AND', 0x29, AddrModes.Immediate,   2, 2);
newinstr('AND', 0x25, AddrModes.ZeroPage,    2, 3);
newinstr('AND', 0x35, AddrModes.ZeroPageX,   2, 4);
newinstr('AND', 0x2D, AddrModes.Absolute,    3, 4);
newinstr('AND', 0x3D, AddrModes.AbsoluteX,   3, 4, true);
newinstr('AND', 0x39, AddrModes.AbsoluteY,   3, 4, true);
newinstr('AND', 0x21, AddrModes.IndirectX,   2, 6);
newinstr('AND', 0x31, AddrModes.IndirectY,   2, 5, true);
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
newinstr('CMP', 0xDD, AddrModes.AbsoluteX,   3, 4, true);
newinstr('CMP', 0xD9, AddrModes.AbsoluteY,   3, 4, true);
newinstr('CMP', 0xC1, AddrModes.IndirectX,   2, 6);
newinstr('CMP', 0xD1, AddrModes.IndirectY,   2, 5, true);
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
newinstr('EOR', 0x4D, AddrModes.Absolute,    3, 4);
newinstr('EOR', 0x5D, AddrModes.AbsoluteX,   3, 4, true);
newinstr('EOR', 0x59, AddrModes.AbsoluteY,   3, 4, true);
newinstr('EOR', 0x41, AddrModes.IndirectX,   2, 6);
newinstr('EOR', 0x51, AddrModes.IndirectY,   2, 5, true);
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
newinstr('LDA', 0xBD, AddrModes.AbsoluteX,   3, 4, true);
newinstr('LDA', 0xB9, AddrModes.AbsoluteY,   3, 4, true);
newinstr('LDA', 0xA1, AddrModes.IndirectX,   2, 6);
newinstr('LDA', 0xB1, AddrModes.IndirectY,   2, 5, true);
newinstr('LDX', 0xA2, AddrModes.Immediate,   2, 2);
newinstr('LDX', 0xA6, AddrModes.ZeroPage,    2, 3);
newinstr('LDX', 0xB6, AddrModes.ZeroPageY,   2, 4);
newinstr('LDX', 0xAE, AddrModes.Absolute,    3, 4);
newinstr('LDX', 0xBE, AddrModes.AbsoluteY,   3, 4, true);
newinstr('LDY', 0xA0, AddrModes.Immediate,   2, 2);
newinstr('LDY', 0xA4, AddrModes.ZeroPage,    2, 3);
newinstr('LDY', 0xB4, AddrModes.ZeroPageX,   2, 4);
newinstr('LDY', 0xAC, AddrModes.Absolute,    3, 4);
newinstr('LDY', 0xBC, AddrModes.AbsoluteX,   3, 4, true);
newinstr('LSR', 0x4A, AddrModes.Accumulator, 1, 2);
newinstr('LSR', 0x46, AddrModes.ZeroPage,    2, 5);
newinstr('LSR', 0x56, AddrModes.ZeroPageX,   2, 6);
newinstr('LSR', 0x4E, AddrModes.Absolute,    3, 6);
newinstr('LSR', 0x5E, AddrModes.AbsoluteX,   3, 7);

newinstr('NOP', 0x1A, AddrModes.Implied,     1, 2);
newinstr('NOP', 0x3A, AddrModes.Implied,     1, 2);
newinstr('NOP', 0x5A, AddrModes.Implied,     1, 2);
newinstr('NOP', 0x7A, AddrModes.Implied,     1, 2);
newinstr('NOP', 0xDA, AddrModes.Implied,     1, 2);
newinstr('NOP', 0xFA, AddrModes.Implied,     1, 2);
newinstr('NOP', 0xEA, AddrModes.Implied,     1, 2);
newinstr('NOP', 0x04, AddrModes.ZeroPage,    2, 2);
newinstr('NOP', 0x44, AddrModes.ZeroPage,    2, 2);
newinstr('NOP', 0x64, AddrModes.ZeroPage,    2, 2);
newinstr('NOP', 0x80, AddrModes.ZeroPage,    2, 2);
newinstr('NOP', 0x0C, AddrModes.AbsoluteX,   3, 2);
newinstr('NOP', 0x1C, AddrModes.AbsoluteX,   3, 2);
newinstr('NOP', 0x3C, AddrModes.AbsoluteX,   3, 2);
newinstr('NOP', 0x5C, AddrModes.AbsoluteX,   3, 2);
newinstr('NOP', 0x7C, AddrModes.AbsoluteX,   3, 2);
newinstr('NOP', 0xDC, AddrModes.AbsoluteX,   3, 2);
newinstr('NOP', 0xFC, AddrModes.AbsoluteX,   3, 2);

newinstr('NOP', 0x14, AddrModes.IndirectX,   2, 2);
newinstr('NOP', 0x34, AddrModes.IndirectX,   2, 2);
newinstr('NOP', 0x54, AddrModes.IndirectX,   2, 2);
newinstr('NOP', 0x74, AddrModes.IndirectX,   2, 2);
newinstr('NOP', 0xD4, AddrModes.IndirectX,   2, 2);
newinstr('NOP', 0xF4, AddrModes.IndirectX,   2, 2);

newinstr('ORA', 0x09, AddrModes.Immediate,   2, 2);
newinstr('ORA', 0x05, AddrModes.ZeroPage,    2, 3);
newinstr('ORA', 0x15, AddrModes.ZeroPageX,   2, 4);
newinstr('ORA', 0x0D, AddrModes.Absolute,    3, 4);
newinstr('ORA', 0x1D, AddrModes.AbsoluteX,   3, 4, true);
newinstr('ORA', 0x19, AddrModes.AbsoluteY,   3, 4, true);
newinstr('ORA', 0x01, AddrModes.IndirectX,   2, 6);
newinstr('ORA', 0x11, AddrModes.IndirectY,   2, 5, true);
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
newinstr('SBC', 0xEB, AddrModes.Immediate,   2, 2);
newinstr('SBC', 0xE9, AddrModes.Immediate,   2, 2);
newinstr('SBC', 0xE5, AddrModes.ZeroPage,    2, 3);
newinstr('SBC', 0xF5, AddrModes.ZeroPageX,   2, 4);
newinstr('SBC', 0xED, AddrModes.Absolute,    3, 4);
newinstr('SBC', 0xFD, AddrModes.AbsoluteX,   3, 4, true);
newinstr('SBC', 0xF9, AddrModes.AbsoluteY,   3, 4, true);
newinstr('SBC', 0xE1, AddrModes.IndirectX,   2, 6);
newinstr('SBC', 0xF1, AddrModes.IndirectY,   2, 5, true);
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

// Non-official opcodes
// http://wiki.nesdev.com/w/index.php/Programming_with_unofficial_opcodes
newinstr('LAX', 0xA3, AddrModes.IndirectX,   2, 6, false, true);
newinstr('LAX', 0xA7, AddrModes.ZeroPage,    2, 3, false, true);
newinstr('LAX', 0xAF, AddrModes.Absolute,    3, 4, false, true);
newinstr('LAX', 0xB3, AddrModes.IndirectY,   2, 5, false, true);
newinstr('LAX', 0xB7, AddrModes.ZeroPageY,   2, 4, false, true);

newinstr('LAX', 0xBF, AddrModes.AbsoluteY,   3, 4, false, true);
newinstr('SAX', 0x83, AddrModes.IndirectX,   2, 6, false, true);
newinstr('SAX', 0x87, AddrModes.ZeroPage,    2, 3, false, true);
newinstr('SAX', 0x8F, AddrModes.Absolute,    3, 4, false, true);
newinstr('SAX', 0x97, AddrModes.ZeroPageY,   2, 4, false, true);

newinstr('DCP', 0xC3, AddrModes.IndirectX,   2, 8, false, true);
newinstr('DCP', 0xC7, AddrModes.ZeroPage,    2, 5, false, true);
newinstr('DCP', 0xCF, AddrModes.Absolute,    3, 6, false, true);
newinstr('DCP', 0xD3, AddrModes.IndirectY,   2, 8, false, true);
newinstr('DCP', 0xD7, AddrModes.ZeroPageX,   2, 6, false, true);
newinstr('DCP', 0xDB, AddrModes.AbsoluteY,   3, 7, false, true);
newinstr('DCP', 0xDF, AddrModes.AbsoluteX,   3, 7, false, true);

newinstr('ISC', 0xE3, AddrModes.IndirectX,   2, 8, false, true);
newinstr('ISC', 0xE7, AddrModes.ZeroPage,    2, 5, false, true);
newinstr('ISC', 0xEF, AddrModes.Absolute,    3, 6, false, true);
newinstr('ISC', 0xF3, AddrModes.IndirectY,   2, 8, false, true);
newinstr('ISC', 0xF7, AddrModes.ZeroPageX,   2, 6, false, true);
newinstr('ISC', 0xFB, AddrModes.AbsoluteY,   3, 7, false, true);
newinstr('ISC', 0xFF, AddrModes.AbsoluteX,   3, 7, false, true);

newinstr('SLO', 0x03, AddrModes.IndirectX,   2, 8, false, true);
newinstr('SLO', 0x07, AddrModes.ZeroPage,    2, 5, false, true);
newinstr('SLO', 0x0F, AddrModes.Absolute,    3, 6, false, true);
newinstr('SLO', 0x13, AddrModes.IndirectY,   2, 8, false, true);
newinstr('SLO', 0x17, AddrModes.ZeroPageX,   2, 6, false, true);
newinstr('SLO', 0x1B, AddrModes.AbsoluteY,   3, 7, false, true);
newinstr('SLO', 0x1F, AddrModes.AbsoluteX,   3, 7, false, true);

newinstr('RLA', 0x23, AddrModes.IndirectX,   2, 8, false, true);
newinstr('RLA', 0x27, AddrModes.ZeroPage,    2, 5, false, true);
newinstr('RLA', 0x2F, AddrModes.Absolute,    3, 6, false, true);
newinstr('RLA', 0x33, AddrModes.IndirectY,   2, 8, false, true);
newinstr('RLA', 0x37, AddrModes.ZeroPageX,   2, 6, false, true);
newinstr('RLA', 0x3B, AddrModes.AbsoluteY,   3, 7, false, true);
newinstr('RLA', 0x3F, AddrModes.AbsoluteX,   3, 7, false, true);

newinstr('SRE', 0x43, AddrModes.IndirectX,   2, 8, false, true);
newinstr('SRE', 0x47, AddrModes.ZeroPage,    2, 5, false, true);
newinstr('SRE', 0x4F, AddrModes.Absolute,    3, 6, false, true);
newinstr('SRE', 0x53, AddrModes.IndirectY,   2, 8, false, true);
newinstr('SRE', 0x57, AddrModes.ZeroPageX,   2, 6, false, true);
newinstr('SRE', 0x5B, AddrModes.AbsoluteY,   3, 7, false, true);
newinstr('SRE', 0x5F, AddrModes.AbsoluteX,   3, 7, false, true);

newinstr('RRA', 0x63, AddrModes.IndirectX,   2, 8, false, true);
newinstr('RRA', 0x67, AddrModes.ZeroPage,    2, 5, false, true);
newinstr('RRA', 0x6F, AddrModes.Absolute,    3, 6, false, true);
newinstr('RRA', 0x73, AddrModes.IndirectY,   2, 8, false, true);
newinstr('RRA', 0x77, AddrModes.ZeroPageX,   2, 6, false, true);
newinstr('RRA', 0x7B, AddrModes.AbsoluteY,   3, 7, false, true);
newinstr('RRA', 0x7F, AddrModes.AbsoluteX,   3, 7, false, true);

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
  readprg(addr) {
    // FIX-TODO: Should work for banks >16K
    return this.prg[addr > 0xC000 ? addr & 0x3FFF : addr];
  }
  static fromRomData(romData) {
    return new Cartridge(inesparser(romData));
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

const hex = (data, padSize=2, padChr='0') => data
  .toString(16)
  .toUpperCase()
  .padStart(padSize, padChr);

const safehex = (data, padSize=2, padChr='0') =>
  data !== undefined
    ? hex(data, padSize, padChr)
    : '?'.padStart(padSize, padChr='?');

try {
  // The browser didn't like the `module.exports' thing.
  module.exports = {
    AddrModeNames,
    AddrModes,
    ArrayBus,
    CPU6502,
    Cartridge,
    Instruction,
    Joypad,
    NES,
    MemoryBus,
    PPU2c02,
    addrmodename,
    asm6502code,
    dis6502code,
    getinopc,
    getinstr,
    hex,
    inesparser,
    parse6502asm,
    safehex,
  };
} catch (e) {
}
