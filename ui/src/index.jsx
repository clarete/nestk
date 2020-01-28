import * as React from "react";
import * as ReactDOM from "react-dom";

import CssBaseline from '@material-ui/core/CssBaseline';
import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';

import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';

import { EmulatorProvider } from './store';
import NES from './nes';

const useStyles = makeStyles(theme => createStyles({
  root: { padding: theme.spacing(2) },
  title: { textAlign: 'center', padding: '20px 0' },
}));

const App = () => {
  const classes = useStyles({});
  return (
    <div className={classes.root}>
      <Grid container>
        <Grid item xs={12}>
          <Typography component="h1" variant="h4" className={classes.title}>
            nes stuff
          </Typography>
        </Grid>
        <Grid item xs={12}>
          <NES />
        </Grid>
      </Grid>
    </div>
  );
};

ReactDOM.render(
  <EmulatorProvider>
    <CssBaseline />
    <App />
  </EmulatorProvider>,
  document.getElementById("mounting-point")
);
