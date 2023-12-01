import React from 'react';
import { Typography, Container, Grid } from '@mui/material';
import TeamMemberCard from '../components/TeamMemberCard';
import {teamMembers} from "../constants/TeamMembers"
import "../css/About.css";
import hciLabLogo from "../res/HCI_Logo.png";

const About = () => {
  return (
    <Container>
      <Typography variant="h4" className="about-header">What is Systematic Mobile Application Review?</Typography>
      <Typography variant="body1" className="about-text">
        A tool for academic researchers to search mobile app store(s) to select a corpus of mobile apps that meet certain criteria (e.g., keywords in description, download count, app store rank). Researchers can then analyze data from this corpus of apps, such as app content (e.g., functionality, accessibility, language support) or metadata (e.g., permissions, user reviews, privacy labels). 
      </Typography>

      <Typography variant="h4" className="about-header">SMAR Team</Typography>
      <Grid container spacing={2} justifyContent="center">
        {teamMembers.map((member, index) => (
          <TeamMemberCard key={index} {...member} />
        ))}
      </Grid>
    </Container>
  );
};

export default About;