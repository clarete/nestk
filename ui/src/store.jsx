import React, { createContext, useReducer } from 'react';

import Buff from './buff';
import * as nes from '../../nes';

export const EmulationState = {
  NoGameLoaded: -1,
  Step: 0,
  Running: 1,
};

const emulator = new nes.NES();
const initialState = {
  emulator,                     // The instance of the emulator
  disassembled: [],             // Disassembled program
  breakpoints: new Set(),       // Set PC addresses for breakpoints
  screen: {                     // Screen Dimensions & Attributes
    width: 256,
    height: 240,
    scaleX: 1,
    scaleY: 1,
  },
  ui: {                         // UI State
    showDebugger: true,
    showGrid: true,
    emulationState: EmulationState.NoGameLoaded,
  },
};
const store = createContext(initialState);
const { Provider } = store;

// So I can debug it
window.emulator = emulator;

const createReducer = () => {
  return (state, action) => {
    switch (action.type) {
    /* Insert the cartridge into the console */
    case 'insert':
      state.emulator.insertCartridge(new Buff(action.data));
      if (state.ui.showDebugger) {
        state.ui.emulationState = EmulationState.Step;
        const disassembled = state.emulator.disassemble();
        return { ...state, disassembled };
      } else {
        state.ui.emulationState = EmulationState.Running;
        return { ...state };
      }

    /* Change emulation state to Running state */
    case 'emu.start':
      state.ui.emulationState = EmulationState.Running;
      return { ...state };

    /* Change emulation state to Step state */
    case 'emu.pause':
      state.ui.emulationState = EmulationState.Step;
      return { ...state };

    /* Execute 3 PPU steps & single CPU instruction */
    case 'emu.step':
      state.emulator.step();
      return { ...state };

    /* Crank the wheel on the running of the emulation */
    case 'emu.runStep':
      for (let i = 0; i < 10000; i++) {
        // We've hit a breakpoint.
        if (state.breakpoints.has(state.emulator.cpu.pc)) {
          state.ui.emulationState = EmulationState.Step;
          break;
        }
        state.emulator.step();
      }
      return { ...state };

    /* Add or Remove a breakpoint */
    case 'dbg.toggleBreakpoint':
      const newState = { ...state };
      if (state.breakpoints.has(action.address))
        state.breakpoints.delete(action.address);
      else
        state.breakpoints.add(action.address);
      return newState;

    /* Toggle visibility of the debugger*/
    case 'ui.toggleShowDebugger': {
      const newState = { ...state };
      newState.ui.showDebugger = !newState.ui.showDebugger;
      return newState;
    }

    /* Toggle showing the grid over the screen */
    case 'ui.toggleShowGrid': {
      const newState = { ...state };
      newState.ui.showGrid = !newState.ui.showGrid;
      return newState;
    }

    /* Handle invalid events */
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
