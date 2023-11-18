import React from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";

const Header = () => {
  return (
    <>
        <AppBar position="static">
            <Toolbar>
                <IconButton
                    size="large"
                    edge="start"
                    color="inherit"
                    aria-label="menu"
                    sx={{ mr: 2 }}
                >
                    <MenuIcon />
                </IconButton>
              </Toolbar>
        </AppBar>
        <Typography variant="h3">Systematic Mobile Application Review</Typography>
        <Typography variant="p">A tool for academic researchers to conduct a keyword search of Google Play and get back the metadata for all relevant apps.</Typography>
    </>
  );
};

export default Header;