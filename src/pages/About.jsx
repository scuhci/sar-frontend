import React from 'react';
import { Typography, Container, Grid } from '@mui/material';
import TeamMemberCard from '../components/TeamMemberCard';
import {teamMembers} from "../constants/TeamMembers"
import Footer from '../components/Footer';
import "../css/About.css";
import { alumni } from '../constants/alumni';


const About = () => {
  return (
    <Container>
      <Typography variant="h4" className="about-header">About the SMAR project</Typography>
      <Typography variant="body1" className="about-text">
        A tool for academic researchers to search mobile app store(s) to select a corpus of mobile apps that meet certain criteria (e.g., keywords in description, download count, app store rank). Researchers can then analyze data from this corpus of apps, such as app content (e.g., functionality, accessibility, language support) or metadata (e.g., permissions, user reviews, privacy labels). 
      </Typography>

      <Typography variant="h5" className="about-header">SMAR Team</Typography>
      <Grid container spacing={2} justifyContent="center">
        {teamMembers.map((member, index) => (
          <TeamMemberCard key={index} {...member} />
        ))}
      </Grid>
      <Typography variant="h5" className="about-header">Project Alumni</Typography>
      <Grid container spacing={2} justifyContent="center">
        {alumni.map((member, index) => (
          <TeamMemberCard key={index} {...member} />
        ))}
      </Grid>
      <Footer />
    </Container>
  );
};

export default About;