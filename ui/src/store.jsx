import React, { createContext, useReducer } from 'react';

import Buff from './buff';
import * as nes from '../../nes';

const emulator = new nes.NES();
const initialState = { emulator, disassembled: [] };
const store = createContext(initialState);
const { Provider } = store;

const createReducer = () => {
  return (state, action) => {
    switch (action.type) {
    case 'insert':      /* Insert the cartridge into the console */
      state.emulator.insertCartridge(new Buff(action.data));
      const disassembled = state.emulator.disassemble();
      return { ...state, disassembled };
    case 'step':        /* Execute single instruction */
      state.emulator.step();
      return { ...state };
    case 'update':      /* Force re-rendering what depend on the emulator */
      return { ...state };
    default:            /* Not a valid event */
      throw new Error(`No action ${action.type}`);
    };
  };
};

const EmulatorProvider = ({ children }) => {
  const memoizedReducer = React.useCallback(createReducer(), []);
  const [state, dispatch] = useReducer(memoizedReducer, initialState);
  return <Provider value={{ state, dispatch }}>{children}</Provider>;
};

export { store, EmulatorProvider }
