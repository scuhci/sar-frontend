import React from 'react';
import { Typography, Box } from '@mui/material';
import hciLabLogo from "../res/HCI_Logo.png";
import "../css/Footer.css";

const Footer = () => {
  return (
    <Box className="footer-container" component="footer">
      <Typography variant="body2" className="made-with-love">
        Made with love in <img src={hciLabLogo} alt="HCI Lab Logo" className="hci-lab-logo" />
        <span className="hci-lab-text">Human Computer Interaction Lab</span> @Santa Clara University
      </Typography>
    </Box>
  );
};

export default Footer;