const nesjs = require('../nes');

describe('6502 ASM Parser', () => {
  it("should parse comments", () => {
    const parsed = nesjs.parse6502asm(';stuff\nLDX #$ff; blah blah blah\n');
    expect(parsed).toEqual([
      ['instruction', 'LDX', nesjs.AddrModes.Immediate, 0xff],
    ]);
  });

  describe('Address Modes', () => {
    it("should parse immediate address mode", () => {
      const parsed = nesjs.parse6502asm('LDX #$ff\nLDA #$c3\nLDY #stuff\n');
      expect(parsed).toEqual([
        ['instruction', 'LDX', nesjs.AddrModes.Immediate, 0xff],
        ['instruction', 'LDA', nesjs.AddrModes.Immediate, 0xc3],
        ['instruction', 'LDY', nesjs.AddrModes.Immediate, 'stuff'],
      ]);
    });

    it("should parse absolute address mode", () => {
      const parsed = nesjs.parse6502asm('STA $ffff\nSTY $c32d');
      expect(parsed).toEqual([
        ['instruction', 'STA', nesjs.AddrModes.Absolute, 0xffff],
        ['instruction', 'STY', nesjs.AddrModes.Absolute, 0xc32d],
      ]);
    });

    it("should parse zero page address mode", () => {
      const parsed = nesjs.parse6502asm('STA $d3\nSTY $d4');
      expect(parsed).toEqual([
        ['instruction', 'STA', nesjs.AddrModes.ZeroPage, 0xd3],
        ['instruction', 'STY', nesjs.AddrModes.ZeroPage, 0xd4],
      ]);
    });

    it("should parse absolute indexed address mode", () => {
      const parsed = nesjs.parse6502asm('STA $a0fe,X\nSTA $add4,Y');
      expect(parsed).toEqual([
        ['instruction', 'STA', nesjs.AddrModes.AbsoluteX, 0xa0fe],
        ['instruction', 'STA', nesjs.AddrModes.AbsoluteY, 0xadd4],
      ]);
    });

    it("should parse zero-page indexed address mode", () => {
      const parsed = nesjs.parse6502asm('STA $a0,X\nSTA $ad,Y');
      expect(parsed).toEqual([
        ['instruction', 'STA', nesjs.AddrModes.ZeroPageX, 0xa0],
        ['instruction', 'STA', nesjs.AddrModes.ZeroPageY, 0xad],
      ]);
    });

    it("should parse relative address mode", () => {
      const parsed = nesjs.parse6502asm('BNE label\nSTX stuff');
      expect(parsed).toEqual([
        ['instruction', 'BNE', nesjs.AddrModes.Relative, 'label'],
        ['instruction', 'STX', nesjs.AddrModes.Relative, 'stuff'],
      ]);
    });

    it("should parse indirect address mode", () => {
      const parsed = nesjs.parse6502asm(
        'JMP ($2000)  \n' +
        'STA (lb)     \n' +
        'STX ($21,X)  \n' +
        'STY ($22,Y)  \n' +
        'STX ($21),X  \n' +
        'STY ($22),Y  \n' +
        'STX (lb,X)   \n' +
        'STY (lb,Y)   \n' +
        'STX (lb),X   \n' +
        'STY (lb),Y   \n'
      );
      expect(parsed).toEqual([
        ['instruction', 'JMP', nesjs.AddrModes.Indirect, 0x2000],
        ['instruction', 'STA', nesjs.AddrModes.Indirect, 'lb'],
        ['instruction', 'STX', nesjs.AddrModes.IndirectX, 0x21],
        ['instruction', 'STY', nesjs.AddrModes.IndirectY, 0x22],
        ['instruction', 'STX', nesjs.AddrModes.IndirectPostX, 0x21],
        ['instruction', 'STY', nesjs.AddrModes.IndirectPostY, 0x22],
        ['instruction', 'STX', nesjs.AddrModes.IndirectX, 'lb'],
        ['instruction', 'STY', nesjs.AddrModes.IndirectY, 'lb'],
        ['instruction', 'STX', nesjs.AddrModes.IndirectPostX, 'lb'],
        ['instruction', 'STY', nesjs.AddrModes.IndirectPostY, 'lb'],
      ]);
    });
  });
});

describe('6502 CPU', () => {
  describe('Address Modes', () => {
    it("should read immediate parameters", () => {
      const cpu = new nesjs.CPU6502(new nesjs.ArrayBus(65536));
      cpu.pc = 0x0600;
      cpu.bus.writeBuffer(cpu.pc, nesjs.asm6502code(nesjs.parse6502asm('LDA #$fe')));
      cpu.step();
      expect(cpu.a).toBe(0xfe);
    });

    it("should read zero-page parameters", () => {
      const cpu = new nesjs.CPU6502(new nesjs.ArrayBus(65536));
      cpu.pc = 0x0600;
      cpu.bus.writeBuffer(cpu.pc, nesjs.asm6502code(nesjs.parse6502asm('LDA $fe')));
      cpu.bus.write(0xfe, 0xae);
      cpu.step();
      expect(cpu.a).toBe(0xae);
    });

    it("should read zero-page,X parameters", () => {
      const cpu = new nesjs.CPU6502(new nesjs.ArrayBus(65536));
      cpu.pc = 0x0600;
      cpu.x = 2;
      cpu.bus.writeBuffer(cpu.pc, nesjs.asm6502code(nesjs.parse6502asm('LDA $fe,x')));
      cpu.bus.write(0xfe+cpu.x, 0xae);
      cpu.step();
      expect(cpu.a).toBe(0xae);
    });

    it("should read zero-page,Y parameters", () => {
      const cpu = new nesjs.CPU6502(new nesjs.ArrayBus(65536));
      cpu.pc = 0x0600;
      cpu.y = 3;
      cpu.bus.writeBuffer(cpu.pc, nesjs.asm6502code(nesjs.parse6502asm('LDX $fe,y')));
      cpu.bus.write(0xfe+cpu.y, 0xae);
      cpu.step();
      expect(cpu.x).toBe(0xae);
    });

    it("should read absolute parameters", () => {
      const cpu = new nesjs.CPU6502(new nesjs.ArrayBus(65536));
      cpu.pc = 0x0600;
      cpu.bus.writeBuffer(cpu.pc, nesjs.asm6502code(nesjs.parse6502asm('LDA $fe0f')));
      cpu.bus.write(0xfe0f, 0xdd);
      cpu.step();
      expect(cpu.a).toBe(0xdd);
    });

    it("should read absolute,X parameters", () => {
      const cpu = new nesjs.CPU6502(new nesjs.ArrayBus(65536));
      cpu.pc = 0x0600;
      cpu.x = 25;
      cpu.bus.writeBuffer(cpu.pc, nesjs.asm6502code(nesjs.parse6502asm('LDA $fe0f,X')));
      cpu.bus.write(0xfe0f+cpu.x, 0xdd);
      cpu.step();
      expect(cpu.a).toBe(0xdd);
    });

    it("should read absolute,Y parameters", () => {
      const cpu = new nesjs.CPU6502(new nesjs.ArrayBus(65536));
      cpu.pc = 0x0600;
      cpu.y = 25;
      cpu.bus.writeBuffer(cpu.pc, nesjs.asm6502code(nesjs.parse6502asm('LDA $fe0f,Y')));
      cpu.bus.write(0xfe0f+cpu.y, 0xdd);
      cpu.step();
      expect(cpu.a).toBe(0xdd);
    });

    it("should read absolute indirect parameters", () => {
      const cpu = new nesjs.CPU6502(new nesjs.ArrayBus(65536));
      cpu.pc = 0x0600;
      cpu.bus.writeBuffer(cpu.pc, nesjs.asm6502code(nesjs.parse6502asm('JMP ($f0f1)')));
      cpu.bus.write(0xf0f1, 0xf0f2);
      cpu.step();
      expect(cpu.pc).toBe(0xf0f2);
    });

    it("should work with JMP absolute addressing mode", () => {
      const cpu = new nesjs.CPU6502(new nesjs.ArrayBus(65536));
      cpu.pc = 0x0600;
      cpu.bus.writeBuffer(cpu.pc, nesjs.asm6502code(nesjs.parse6502asm('JMP $f0f1')));
      cpu.step();
      expect(cpu.pc).toBe(0xf0f1);
    });

  });
});
