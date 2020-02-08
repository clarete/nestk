import * as React from "react";
import PropTypes from "prop-types";
import styled from 'styled-components';
import { List } from 'react-virtualized';
import Grid from '@material-ui/core/Grid';

import { store } from './store';
import * as nes from '../../nes';

const DbgShell = styled.div`
  /* Sizes & Spacing */
  width: 100%;
  height: 100%;
  font-size: 10px;
  /* Formatting */
  background-color: #fc0;
  font-family: monospace;
`;

const DbgRegWrap = styled.div`
  /* Sizes & Spacing */
  padding: 0 0 0 10px;
  border-bottom: solid 1px #fd0;
`;

const DbgRegList = styled.ul`
  /* Sizes & Spacing */
  margin: 0;
  padding: 5px 0;
  /* Positioning */
  display: flex;
  flex-wrap: wrap;
  /* Formatting */
  list-style: none;
  /* Children */
  & li {
    padding-right: 10px;
  }
`;

const DbgDisWrap = styled.div`
  /* Sizes & Spacing */
  padding: 0 0 10px 10px;
  margin-bottom: 10px;
  /* Formatting of child node */
  & .dbg-lst {
    /* Formatting (Firefox) */
    scrollbar-color: #fe0 #fd0;
    scrollbar-width: thin;
    /* Formatting (Chrome) */
    &::-webkit-scrollbar { width: 6px; background-color: #fd0; }
    &::-webkit-scrollbar-thumb { background-color: #fa0; }
  }
  & .dbg-current {
    font-weight: bold;
    background-color: #fd0;
  }
`;

const DbgDisList = () => {
  const { state } = React.useContext(store);
  const selectedRow = state
    .disassembled
    .findIndex(x => x.address === state.emulator.cpu.pc);
  return (
    <DbgDisWrap>
      <List
        className="dbg-lst"
        width={246}
        height={230}
        rowCount={state.disassembled.length}
        rowHeight={12}
        rowRenderer={({ index, key, style }) => {
          const item = state.disassembled[index];
          const current = item.address === state.emulator.cpu.pc;
          const bindata = item.rawdata.map(x => nes.safehex(x)).join(' ');
          const mnemonic = (item.instruction && !item.instruction.illegal)
            ? item.instruction.mnemonic
            : '.db';
          return (
            <div key={key} style={style} className={current ? 'dbg-current' : null}>
              <div style={{ width: 15, float: 'left', clear: 'left' }}>{current ? '>' : '\u00A0'}</div>
              <div style={{ width: 45, float: 'left' }}>{nes.hex(item.address, 4)}</div>
              <div style={{ width: 70, float: 'left' }}>{bindata}</div>
              <div style={{ width: 40, float: 'left' }}>{mnemonic}</div>
              <div style={{ width: 40, float: 'left' }}>{item.fmtop || ''}</div>
            </div>
          );
        }}
        scrollToIndex={selectedRow}
      />
    </DbgDisWrap>
  );
};

const DbgPalletes = styled.div`
`;

const DbgChr = styled.canvas`
  background-color: #fe0;
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
  let [x, y, width, height] = [0, 0, 128, 128];
  const source = document.createElement('canvas');
  const context = source.getContext('2d');
  const imagepx = context.createImageData(width, height);
  const [begin, end, offset] = addr === 0 ? [0, 0x1000, 0] : [0x1000, 0x2000, 0x1000];
  for (let byte = begin; byte < end; byte += 16) {
    y = Math.floor((byte - offset) / (height * 2)) * 8;
    for (let line = 0; line < 8; line++) {
      for (let bit = 0; bit < 8; bit++) {
        const lo = (emulator.ppu.bus.read(byte + line + 0) >>> (7-bit));
        const hi = (emulator.ppu.bus.read(byte + line + 8) >>> (7-bit));
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

const DbgToolBarShell = styled.div`
  padding: 10px 10px 2px 10px;
`;

const DbgToolBar = () => {
  const { dispatch } = React.useContext(store);
  return (
    <DbgToolBarShell>
      <button onClick={e => dispatch({ type: 'step' })}>
        ▶
      </button>
      <button onClick={e => dispatch({ type: 'step' })}>
        ↪
      </button>
    </DbgToolBarShell>
  );
};

const Debugger = () =>  {
  const { state: { emulator } } = React.useContext(store);
  const canvas0Ref = React.useRef();
  const canvas1Ref = React.useRef();
  React.useLayoutEffect(() => {
    if (emulator.cartridge && emulator.cartridge.chr && canvas0Ref.current && canvas1Ref.current) {
      drawPatternTablePixels(canvas0Ref.current, emulator, 0);
      drawPatternTablePixels(canvas1Ref.current, emulator, 1);
    }
  }, [canvas0Ref.current, canvas1Ref.current]);
  return (
    <DbgShell>
      {emulator.cartridge && <div>
        <DbgToolBar />
        <DbgRegWrap>
          <DbgRegList>
            <li><b>A:</b>${nes.hex(emulator.cpu.a)}</li>
            <li><b>X:</b>${nes.hex(emulator.cpu.x)}</li>
            <li><b>Y:</b>${nes.hex(emulator.cpu.y)}</li>
            <li><b>P:</b>${nes.hex(emulator.cpu.p)}</li>
            <li><b>PC:</b>${nes.hex(emulator.cpu.pc)}</li>
            <li><b>CL:</b>${nes.hex(emulator.cpu.cycles)}</li>
            <li><b>DT:</b>${nes.hex(emulator.ppu.cycle)}</li>
            <li><b>SL:</b>${nes.hex(emulator.ppu.scanline)}</li>
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

const ScreenCanvasShell = styled.div`
  /* Size & Spacing */
  width: 100%;
  height: 350px;
  padding: 0;
  margin: 0;
  /* Positioning */
  display: flex;
  align-items: center;
  justify-content: center;
  /* Formatting */
  background-color: #000000;
`;

const Screen = () => (
  <ScreenCanvasShell>
    <canvas
      style={{
        width: 260,
        height: 240,
        border: 'solid 1px red',
      }}>
    </canvas>
  </ScreenCanvasShell>
);

const CartridgeSlotShell = styled.div`
  /* Size & Spacing */
  padding: 10px;
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

const ToolbarShell = styled.ul`
  padding: 0;
  margin: 0;
  list-style: none;
  height: 40px;
  background-color: #222;
  & li {
    padding: 8px;
    float: left;
    display: block;
  }
`;

const Toolbar = () => {
  const { state, dispatch } = React.useContext(store);
  return (
    <ToolbarShell>
      <li>
        <label>
          <input
            type="checkbox" checked={state.ui.showDebugger}
            onChange={() => dispatch({ type: 'ui.toggleShowDebugger' })} />
          Show Debugger
        </label>
      </li>
    </ToolbarShell>
  );
};

const EmulatorShell = styled.div`
  /* Size & Spacing */
  width: 768px;
  margin: auto;
  padding: 0px;
`;

const Emulator = () => {
  const { state } = React.useContext(store);
  return (
    <EmulatorShell>
      <Grid container>
        <Grid item xs={state.ui.showDebugger ? 8 : 12}>
          <Screen />
          <CartridgeSlot />
          <Toolbar />
        </Grid>
        {state.ui.showDebugger &&
         <Grid item xs={4}>
           <Debugger />
         </Grid>}
      </Grid>
    </EmulatorShell>
  );
};

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

  React.useEffect(() => {
    const draw = () => {
      if (emulator.cartridge)
        dispatch({ type: 'step' });
      window.requestAnimationFrame(draw);
    };
    window.requestAnimationFrame(draw);
  }, []);

  /* Finish setting up emulator  */
  emulator.plugScreen();
  emulator.plugController1(joypad0);
  return <Emulator />;
}
