import React, { createContext, useReducer } from 'react';

import Buff from './buff';
import * as nes from '../../nes';

const emulator = new nes.NES();
const initialState = { emulator };
const store = createContext(initialState);
const { Provider } = store;

const createReducer = () => {
  return (state, action) => {
    switch (action.type) {
    /* Insert the cartridge into the  */
    case 'insert':
      state.emulator.insertCartridge(new Buff(action.data));
      return { ...state };
    /* Execute single instruction */
    case 'step':
      state.emulator.step();
      return { ...state };
    /* Just force re-rendering of components depending on the emulator */
    case 'update':
      return { ...state };
    /* Not a valid event */
    default:
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
