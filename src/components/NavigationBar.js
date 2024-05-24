import React from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import { Typography, Button } from '@mui/material';
import { Link } from 'react-router-dom';
import { SMAR_USER_GUIDE_URL } from '../constants/externalLinks';
const NavigationBar = () => {
  return (
        <AppBar position="static" style={{ marginBottom: 15}}>
            <Toolbar>  
                <Typography variant="h6" style={{ flexGrow: 1 }}>
                  <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
                    SMAR
                  </Link>
                </Typography>
                <div>
                  <Button color="inherit" component={Link} to="/">Home</Button>
                  <Button color="inherit" component="a" href={SMAR_USER_GUIDE_URL} target="_blank" rel="noopener noreferrer">User Guide</Button>
                  <Button color="inherit" component={Link} to="/citation">Citation</Button>
                  <Button color="inherit" component={Link} to="/about">About</Button>
                </div>
            </Toolbar>
        </AppBar>
  );
};

export default NavigationBar;