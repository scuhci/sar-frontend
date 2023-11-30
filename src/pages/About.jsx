import React from 'react';
import { Typography, Container } from '@mui/material';

const About = () => {
  return (
    <Container>
      <Typography variant="h4" style={{  "text-align": "center"}}>What is Systematic Mobile Application Review?</Typography>
      <Typography variant="body1">
        A tool for academic researchers to search mobile app store(s) to select a corpus of mobile apps that meet certain criteria (e.g., keywords in description, download count, app store rank). Researchers can then analyze data from this corpus of apps, such as app content (e.g., functionality, accessibility, language support) or metadata (e.g., permissions, user reviews, privacy labels). 
      </Typography>
    </Container>
  );
};

export default About;