import React from "react";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import { Typography, Button } from "@mui/material";
import { Link } from "react-router-dom";

const NavigationBar = ({ refresh, refreshTopLists }) => {
    return (
        <AppBar position="static">
            <Toolbar>
                <Typography style={{ flexGrow: 1 }}>
                    <Button onClick={refresh} color="inherit" component={Link} to="/">
                        <Typography variant="h6">SMAR</Typography>
                    </Button>
                </Typography>

                <div>
                    <Button onClick={refresh} color="inherit" component={Link} to="/">
                        Home
                    </Button>
                    <Button color="inherit" component={Link} to="/bulkreviews">
                        Bulk Reviews
                    </Button>
                    <Button onClick={refreshTopLists} color="inherit">
                        Top Charts
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
