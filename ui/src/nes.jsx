import * as React from "react";
import PropTypes from "prop-types";
import styled from 'styled-components';

import { store } from './store';
import * as nes from '../../nes';

const DbgShell = styled.div`
  /* Sizes & Spacing */
  width: 256px;
  height: 240px;
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

const DbgDisWrap = styled.div`
  /* Sizes & Spacing */
  height: 135px;
  margin-bottom: 10px;
  padding: 0 10px 10px 10px;
  /* Formatting */
  overflow-y: scroll;
  /* Formatting (Firefox) */
  scrollbar-color: #fe0 #fd0;
  scrollbar-width: thin;
  /* Formatting (Chrome) */
  &::-webkit-scrollbar { width: 6px; background-color: #fd0; }
  &::-webkit-scrollbar-thumb { background-color: #fa0; }

  /* -- Settings for direct child 'ol'. Didn't want to put it
        here, but didn't want to create two nested wrappers -- */

  & ol {
    /* Spacing */
    padding: 0;
    margin: 0;
    /* Formatting */
    list-style: none;
  }
`;

const DbgPalletes = styled.div`
  padding-left: 25px;
`;

const DbgChr = styled.canvas`
  background-color: #fe0;
  width: 100px;
`;

const DbgDisItem = ({ item }) => {
  const { state: { emulator } } = React.useContext(store);
  const current = item.address === emulator.cpu.pc ? '>' : '\u00A0';
  const bindata = item.rawdata.map(x => nes.safehex(x)).join(' ');
  const mnemonic = (item.instruction && !item.instruction.illegal)
    ? item.instruction.mnemonic
    : '.db';
  return (
    <li>
      <div style={{ width: 15, float: 'left', clear: 'left' }}>{current}</div>
      <div style={{ width: 45, float: 'left' }}>{nes.hex(item.address, 4)}</div>
      <div style={{ width: 70, float: 'left' }}>{bindata}</div>
      <div style={{ width: 40, float: 'left' }}>{mnemonic}</div>
      <div style={{ width: 40, float: 'left' }}>{item.fmtop || ''}</div>
    </li>
  );
};

const DbgDisList = (/* { emulator } */) => {
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
      <ol>
        {disassembled.map(i =>
          <DbgDisItem
            id={`dbg-dist-item-${i.address}`}
            key={`key-${i.address}`}
            item={i}
          />)}
      </ol>
    </div>
  );
};

const Debugger = () =>  {
  const { state: { emulator } } = React.useContext(store);
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
        <DbgDisWrap id="dbg-dis-wrap">
          <DbgDisList />
        </DbgDisWrap>
        <DbgPalletes>
          <DbgChr style={{ marginRight: 2 }}></DbgChr>
          <DbgChr style={{ marginLeft:  2 }}></DbgChr>
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
  /* Alignment */
  text-align: center;
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
  window.addEventListener('keyup', ({ keyCode }) => joypad0.releaseKey(keyCode));
  window.addEventListener('keydown', (event) => {
    event.stopImmediatePropagation();
    if (!emulator.cartridge) return;
    switch (event.keyCode) {
    case 'N'.charCodeAt(0): dispatch({ type: 'step' }); break;
    default: joypad0.pressKey(event.keyCode); break;
    }
  });
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
