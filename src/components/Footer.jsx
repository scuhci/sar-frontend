import React from 'react';
import { Typography, Box } from '@mui/material';
import hciLabLogo from "../res/HCI_Logo.png";
import "../css/Footer.css";
import Link from '@mui/material/Link';

const Footer = () => {
  return (
    <Box className="footer-container" component="footer">
      <Typography variant="body2" className="made-with-love">
        Made with love in <img src={hciLabLogo} alt="HCI Lab Logo" className="hci-lab-logo" />
        <Link
          className="hci-lab-text"
          href="http://scuhci.com"
          target="_blank" 
          rel="noopener noreferrer"
          >Human Computer Interaction Lab
        </Link> @Santa Clara University
      </Typography>
    </Box>
  );
};

export default Footer;