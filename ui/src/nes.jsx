import * as React from "react";
import PropTypes from "prop-types";
import styled from 'styled-components';

import { store } from './store';
import * as nes from '../../nes';

const DbgShell = styled.div`
  /* Sizes & Spacing */
  width: 256px;
  height: 340px;
  font-size: 10px;
  /* Positioning */
  float: right;
  /* Formatting */
  background-color: #fc0;
  font-family: monospace;
`;

const DbgRegWrap = styled.div`
  /* Sizes & Spacing */
  height: 20px;
  padding: 10px 0px 20px 10px;
`;

const DbgRegList = styled.ul`
  /* Sizes & Spacing */
  margin: 0;
  padding: 0;
  /* Positioning */
  display: flex;
  /* Formatting */
  list-style: none;
  /* Children */
  & li {
    padding-right: 5px;
  }
`;

const DbgDisWrap = styled.ol`
  /* Sizes & Spacing */
  height: 140px;
  margin-bottom: 10px;
  padding: 0 10px 10px 10px;
  /* Formatting */
  overflow-y: scroll;
  list-style: none;
  /* Formatting (Firefox) */
  scrollbar-color: #fe0 #fd0;
  scrollbar-width: thin;
  /* Formatting (Chrome) */
  &::-webkit-scrollbar { width: 6px; background-color: #fd0; }
  &::-webkit-scrollbar-thumb { background-color: #fa0; }
`;

const DbgDisItem = ({ item }) => {
  const { state: { emulator } } = React.useContext(store);
  const current = item.address === emulator.cpu.pc;
  const bindata = item.rawdata.map(x => nes.safehex(x)).join(' ');
  const mnemonic = (item.instruction && !item.instruction.illegal)
    ? item.instruction.mnemonic
    : '.db';
  const itemRef = React.useRef();
  React.useLayoutEffect(() => {
    if (itemRef.current && current) {
      (itemRef
        .current
        .parentElement
        .scrollTo(0, itemRef.current.scrollHeight - 25));
    }
  });
  return (
    <li ref={itemRef}>
      <div style={{ width: 15, float: 'left', clear: 'left' }}>{current ? '>' : '\u00A0'}</div>
      <div style={{ width: 45, float: 'left' }}>{nes.hex(item.address, 4)}</div>
      <div style={{ width: 70, float: 'left' }}>{bindata}</div>
      <div style={{ width: 40, float: 'left' }}>{mnemonic}</div>
      <div style={{ width: 40, float: 'left' }}>{item.fmtop || ''}</div>
    </li>
  );
};

const DbgDisList = () => {
  const { state, dispatch } = React.useContext(store);
  const [disassembled, setDisassembled] = React.useState([]);
  React.useEffect(
    () => { setDisassembled(state.emulator.disassemble()); },
    // Dependency list. Won't ever re-disassembly it unless the
    // cartridge data itself changes
    [state.emulator.cartridge],
  );
  return (
    <div>
      <button onClick={e => dispatch({ type: 'step' })}>
        ↪
      </button>
      <DbgDisWrap>
        {disassembled.map(i =>
          <DbgDisItem
            id={`dbg-dist-item-${i.address}`}
            key={`key-${i.address}`}
            item={i}
          />)}
      </DbgDisWrap>
    </div>
  );
};

const DbgPalletes = styled.div`

`;

const DbgChr = styled.canvas`
  background-color: #fe0;
  /* width: 256px;
  * height: 384px; */
  width: 128px;
  height: 128px;
`;

const PATTERN_TABLE_COLORS = {
  0: { r: 0x00, g: 0x00, b: 0x00 },
  1: { r: 0x14, g: 0x12, b: 0xA7 },
  2: { r: 0xFE, g: 0xCC, b: 0xC5 },
  3: { r: 0xB5, g: 0x31, b: 0x20 },
};

function drawPatternTablePixels(canvas, emulator, addr) {
  let [x, y, width, height] = [0, 0, 128, 256];
  const { chr } = emulator.cartridge;
  const source = document.createElement('canvas');
  const context = source.getContext('2d');
  const imagepx = context.createImageData(width, height);
  const [begin, end, offset] = addr === 0 ? [0, 0x1000, 0] : [0x1000, 0x2000, 0x1000];
  for (let byte = begin; byte < end; byte += 16) {
    y = Math.floor((byte - offset) / height) * 4;
    for (let line = 0; line < 8; line++) {
      for (let bit = 0; bit < 8; bit++) {
        const lo = (chr[byte + line + 0] >>> (7-bit));
        const hi = (chr[byte + line + 8] >>> (7-bit));
        const co = (lo & 0x1) + ((hi & 0x1) << 1);
        const [px, py] = [x + bit, y + line];
        const red = py * (width * 4) + (px * 4);
        imagepx.data[red + 0] = PATTERN_TABLE_COLORS[co].r;
        imagepx.data[red + 1] = PATTERN_TABLE_COLORS[co].g;
        imagepx.data[red + 2] = PATTERN_TABLE_COLORS[co].b;
        imagepx.data[red + 3] = 0xFF;
      }
    }
    x = (x + 8) % width;
  }

  /* Draw the image data into the context of the canvas */
  context.putImageData(imagepx, 0, 0);
  const dctx = canvas.getContext('2d');
  dctx.imageSmoothingEnabled = false;
  dctx.drawImage(source, 0, 0, width*5.5, height*1.3);
}
const Debugger = () =>  {
  const { state: { emulator } } = React.useContext(store);

  const canvas0Ref = React.useRef();
  const canvas1Ref = React.useRef();

  React.useLayoutEffect(() => {
    if (emulator.cartridge && emulator.cartridge.chr && canvas0Ref.current && canvas1Ref.current) {
      drawPatternTablePixels(canvas0Ref.current, emulator, 0);
      drawPatternTablePixels(canvas1Ref.current, emulator, 1);
    }
  });
  return (
    <DbgShell>
      {emulator.cartridge && <div>
        <DbgRegWrap>
          <DbgRegList>
            <li><b>A: </b> ${nes.hex(emulator.cpu.a)}</li>
            <li><b>X: </b> ${nes.hex(emulator.cpu.x)}</li>
            <li><b>Y: </b> ${nes.hex(emulator.cpu.y)}</li>
            <li><b>P: </b> ${nes.hex(emulator.cpu.p)}</li>
            <li><b>PC:</b> ${nes.hex(emulator.cpu.pc)}</li>
          </DbgRegList>
        </DbgRegWrap>
        <DbgDisList />
        <DbgPalletes>
          <DbgChr ref={canvas0Ref}></DbgChr>
          <DbgChr ref={canvas1Ref}></DbgChr>
        </DbgPalletes>
      </div>}
    </DbgShell>
  );
}

const ScreenCanvas = styled.canvas`
  /* Size & Spacing */
  width: 256px;
  height: 240px;
  padding: 0;
  margin: 0;
  /* Positioning */
  display: block;
  /* Formatting */
  background-color: #000000;
`;

const Screen = () => (
  <ScreenCanvas>
    <canvas></canvas>
  </ScreenCanvas>
);

const CartridgeSlotShell = styled.div`
  /* Size & Spacing */
  padding: 10px;
  width: 256px;
  height: 100px;
  /* Alignment */
  text-align: center;
  /* Formatting */
  background-color: #222;
`;

const CartridgeSlot = () => {
  const { dispatch } = React.useContext(store);
  return (
    <CartridgeSlotShell>
      <input
        type="file"
        onChange={e => {
          const [file] = e.target.files;

          if (!file)  /* User cancelled file picking */
            return;

          file.arrayBuffer().then(data => {
            dispatch({ type: 'insert', data });
          });
        }} />
    </CartridgeSlotShell>
  );
};

const EmulatorShell = styled.div`
  /* Size & Spacing */
  width: 512px;
  margin: auto;
  padding: 0px;
`;

const createJoypad0 = () => new nes.Joypad({
  65: nes.Joypad.Button.A,        /* 65 = 'a' */
  66: nes.Joypad.Button.B,        /* 66 = 'b' */
  32: nes.Joypad.Button.Select,   /* 32 = ' ' (space) */
  13: nes.Joypad.Button.Enter,    /* 13 = Enter */
  38: nes.Joypad.Button.Up,       /* 38 = Arrow Up */
  40: nes.Joypad.Button.Down,     /* 40 = Arrow Down */
  37: nes.Joypad.Button.Left,     /* 37 = Arrow Left */
  39: nes.Joypad.Button.Right,    /* 39 = Arrow Right */
});

export default function() {
  const { dispatch, state: { emulator } } = React.useContext(store);
  const joypad0 = createJoypad0();
  /* Input Event Mapping */
  React.useEffect(() => {
    window.addEventListener('keyup', ({ keyCode }) => joypad0.releaseKey(keyCode));
    window.addEventListener('keydown', (event) => {
      if (!emulator.cartridge) return;
      switch (event.keyCode) {
        case 'N'.charCodeAt(0): dispatch({ type: 'step' }); break;
        default: joypad0.pressKey(event.keyCode); break;
      }
    });
  }, []);
  /* Finish setting up emulator  */
  emulator.plugScreen();
  emulator.plugController1(joypad0);
  return (
    <EmulatorShell>
      <Debugger />
      <Screen />
      <CartridgeSlot />
    </EmulatorShell>
  );
}
