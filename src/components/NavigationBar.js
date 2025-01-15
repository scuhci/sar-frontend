import React from "react";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import { Typography, Button } from "@mui/material";
import { Link } from "react-router-dom";

const NavigationBar = ({ refresh }) => {
  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" style={{ flexGrow: 1 }}>
          <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
            SMAR
          </Link>
        </Typography>
        <div>
          <Button onClick={refresh} color="inherit" component={Link} to="/">
            Home
          </Button>
          <Button color="inherit" component={Link} to="/userguide">
            User Guide
          </Button>
          <Button color="inherit" component={Link} to="/about">
            About
          </Button>
        </div>
      </Toolbar>
    </AppBar>
  );
};

export default NavigationBar;
