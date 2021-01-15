import * as React from "react";
import PropTypes from "prop-types";
import styled from 'styled-components';
import { List } from 'react-virtualized';
import Grid from '@material-ui/core/Grid';

import IconPlay from './imgs/ico-play.png';
import IconPause from './imgs/ico-pause.png';
import IconStep from './imgs/ico-step.png';

import { store, EmulationState } from './store';
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
  & .dbg-lst .dbg-instr-addr {
    cursor: pointer;
  }
  & .dbg-lst .dbg-current {
    font-weight: bold;
    background-color: #fd0;
  }
  & .dbg-lst .dbg-brkpoint div {
    color: #f00;
    height: 20px;
    overflow: hidden;
  }
  & .dbg-lst .dbg-brkpoint div:first-child {
    display: list-item;
    list-style-position: inside;
    list-style-type: disc;
    font-size: 20px;
    color: #f00;
    margin-top: -8.5px;
  }
`;

const DbgDisList = () => {
  const { dispatch, state } = React.useContext(store);
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
        rowHeight={20}
        rowRenderer={({ index, key, style }) => {
          const item = state.disassembled[index];
          const current = item.address === state.emulator.cpu.pc;
          const brkpoint = state.breakpoints.has(item.address);
          const bindata = item.rawdata.map(x => nes.safehex(x)).join(' ');
          const mnemonic = (item.instruction && !item.instruction.illegal)
            ? item.instruction.mnemonic
            : '.db';
          // CSS Classes that might be added to a given single item
          const classNames = [];
          if (current) classNames.push('dbg-current');
          if (brkpoint) classNames.push('dbg-brkpoint');
          return (
            <div
              key={key}
              style={style}
              className={classNames.join(' ')}
            >
              <div style={{ width: 15, float: 'left', clear: 'left' }}>{current ? '>' : '\u00A0'}</div>
              <div style={{ width: 45, float: 'left' }} className="dbg-instr-addr">
                <a onClick={() => dispatch({ type: 'dbg.toggleBreakpoint', address: item.address })}>
                  {nes.hex(item.address, 4)}
                </a>
              </div>
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

const DbgChr = styled.canvas`
  background-color: #fe0;
`;

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
        const color = emulator.ppu.readColor(0, co);

        imagepx.data[red + 0] = color.r;
        imagepx.data[red + 1] = color.g;
        imagepx.data[red + 2] = color.b;
        imagepx.data[red + 3] = 0xFF;
      }
    }
    x = (x + 8) % width;
  }

  /* Draw the image data into the context of the canvas */
  context.putImageData(imagepx, 0, 0);
  const dctx = canvas.getContext('2d');
  dctx.imageSmoothingEnabled = false;
  dctx.drawImage(source, 0, 0, width*2.4, height*1.2);
}

const DbgToolBarShell = styled.div`
  padding: 10px 10px 2px 10px;
  height: 35px;
`;

const DbgBtn = styled.a`
  text-align: center;
  display: block;
  float: left;
  padding: 0;
  margin: 0 4px 0 0;

  & img {
    width: 20px;
    height: 20px;
    padding: 4px;
    border: solid 1px #000;
  }
`;

const DbgToolBar = () => {
  const { dispatch, state } = React.useContext(store);
  return (
    <DbgToolBarShell>
      {state.ui.emulationState === EmulationState.Step &&
       <DbgBtn alt="Start" onClick={e => dispatch({ type: 'emu.start' })}>
         <img src={IconPlay} />
       </DbgBtn>}

      {state.ui.emulationState === EmulationState.Running &&
       <DbgBtn alt="Pause" onClick={e => dispatch({ type: 'emu.pause' })}>
         <img src={IconPause} />
       </DbgBtn>}

      <DbgBtn alt="Step" onClick={e => dispatch({ type: 'emu.step' })}>
        <img src={IconStep} />
      </DbgBtn>
    </DbgToolBarShell>
  );
};

const DbgPalettes = () => {
  const { state: { emulator } } = React.useContext(store);
  const [palettes, setPalettes] = React.useState([]);

  React.useEffect(() => {
  }, []);

  return (
    <div>
      
    </div>
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
  });
  return (
    <DbgShell>
      {emulator.cartridge &&
       <div>
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
         <DbgPalettes />
         <div>
           <DbgChr ref={canvas0Ref} width={128} height={128}></DbgChr>
           <DbgChr ref={canvas1Ref} width={128} height={128}></DbgChr>
         </div>
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

function drawScreenFrame(canvas, emulator) {
  const [width, height] = [256, 240];
  const source = document.createElement('canvas');
  const context = source.getContext('2d'); context.imageSmoothingEnabled = false;
  const imagepx = context.createImageData(width, height);

  for (const pixel of emulator.ppu.framebuffer) {
    // console.log(pixel.y, pixel.x);
    const red = pixel.y * (width * 4) + (pixel.x * 4);
    imagepx.data[red + 0] = pixel.color.r;
    imagepx.data[red + 1] = pixel.color.g;
    imagepx.data[red + 2] = pixel.color.b;
    imagepx.data[red + 3] = 0xFF;
  }

  context.putImageData(imagepx, 0, 0);
  const dctx = canvas.getContext('2d');
  dctx.imageSmoothingEnabled = false;
  dctx.drawImage(source, 0, 0, width, height);
}

function drawScreenGrid(canvas) {
  const [width, height, tile, block] = [256, 240, 8, 16];
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;

  for (let y = 0; y <= height; y += tile) {
    context.moveTo(0, y);
    context.lineTo(width, y);
  }
  for (let x = 0; x <= width; x += tile) {
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }

  context.strokeStyle = "green";
  context.stroke();
}

const Screen = () => {
  const { state: { emulator, ui } } = React.useContext(store);
  const canvasRef = React.useRef();
  React.useLayoutEffect(() => {
    if (emulator.cartridge && emulator.cartridge.chr && canvasRef.current) {
      if (emulator.ppu.framebuffer.length > 0) {
        drawScreenFrame(canvasRef.current, emulator);
        if (ui.showGrid) {
          drawScreenGrid(canvasRef.current);
        }
      }
    } /* else
       * drawScreenGrid(canvasRef.current); */
  }, [canvasRef.current, emulator.ppu.framebuffer]);
  return (
    <ScreenCanvasShell>
      <canvas
        width={256}
        height={240}
        ref={canvasRef}
      >
      </canvas>
    </ScreenCanvasShell>
  );
};

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
            type="checkbox" checked={state.ui.showGrid}
            onChange={() => dispatch({ type: 'ui.toggleShowGrid' })} />
          Show Grid
        </label>
      </li>
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
  margin: 0;
  padding: 0;
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
  const { dispatch, state: { emulator, ui } } = React.useContext(store);
  const joypad0 = createJoypad0();
  /* Input Event Mapping */
  React.useEffect(() => {
    window.addEventListener('keyup', ({ keyCode }) => joypad0.releaseKey(keyCode));
    window.addEventListener('keydown', (event) => {
      if (!emulator.cartridge) return;
      switch (event.keyCode) {
        case 'N'.charCodeAt(0): dispatch({ type: 'emu.step' }); break;
        default: joypad0.pressKey(event.keyCode); break;
      }
    });
  }, []);

  React.useEffect(() => {
    const draw = () => {
      if (ui.emulationState === EmulationState.Running) {
        dispatch({ type: 'emu.runStep' });
        window.requestAnimationFrame(draw);
      }
    };
    window.requestAnimationFrame(draw);
  }, [ui.emulationState]);

  /* Finish setting up emulator  */
  emulator.plugScreen();
  emulator.plugController1(joypad0);
  return <Emulator />;
}
