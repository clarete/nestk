import * as React from "react";
import * as ReactDOM from "react-dom";

import CssBaseline from '@material-ui/core/CssBaseline';
import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';

import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';

import { EmulatorProvider } from './store';
import NES from './nes';

ReactDOM.render(
  <EmulatorProvider>
    <CssBaseline />
    <NES />
  </EmulatorProvider>,
  document.getElementById("mounting-point")
);
