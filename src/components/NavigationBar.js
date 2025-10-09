import React from "react";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import { Typography, Button } from "@mui/material";
import { Link , NavLink} from "react-router-dom";

const NavButton = ({ to, label, onClick }) => (
  <NavLink
    to={to}
    style={{ textDecoration: "none" }}
  >
    {({ isActive }) => (
      <Button
        onClick={onClick}
        color="inherit"
        sx={{
          color: "white",
          position: "relative",
          "&::after": {
            content: '""',
            display: "block",
            width: "80%",
            height: "2px",
            background: isActive ? "#FFFFFF" : "transparent", 
            position: "absolute",
            bottom: "-6px",
            left: "10%",
            borderRadius: "5px",
            transition: "all 0.3s ease-in-out",
            boxShadow: isActive ? "0px 0px 10px rgba(255, 255, 255, 0.8)" : "none",
          },
        }}
      >
        {label}
      </Button>
    )}
  </NavLink>
);

const NavigationBar = ({ refresh, refreshTopLists }) => {
  return (
        <AppBar position="fixed">
            <Toolbar>  
                <Typography variant="h6" style={{ flexGrow: 1 }}>
                  <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
                    SMAR
                  </Link>
                </Typography>

                <div>
                  <NavButton to="/" label="Home" onClick={refresh} />
                  <NavButton to="/toplists" label="Top Charts" onClick={refreshTopLists} />
                  <NavButton to="/bulkreviews" label="Bulk Reviews" />
                  <NavButton to="/userguide" label="User Guide" />
                  <NavButton to="/about" label="About" />
              
                  {/* <Button onClick={refresh} color="inherit" component={Link} to="/">Home</Button> */}
                  {/* <Button onClick={refreshTopLists} color="inherit">Top Charts</Button> */}
                  {/* <Button color="inherit" component={Link} to="/userguide">User Guide</Button> */}
                  {/* <Button color="inherit" component={Link} to="/about">About</Button> */}
                </div>
            </Toolbar>
        </AppBar>
    );
};

export default NavigationBar;
