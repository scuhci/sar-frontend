import React from 'react';
import { Typography, Container, Grid} from '@mui/material';
import TeamMemberCard from '../components/TeamMemberCard';
import {teamMembers} from "../constants/TeamMembers"
import Footer from '../components/Footer';
import "../css/About.css";
import { alumni } from '../constants/alumni';


const About = () => {
  return (
    <Container>
      <Typography variant="h3" className="about-header">About the SMAR project</Typography>
      <Typography variant="body1" fontSize="20px" className="about-text">
        The SMAR Project was developed to assist non-technical researchers in conducting "Systematic App Store Reviews" - a process that often consists of scraping information about applications from an app store to analyse. <br></br> <br></br>
        Systematic App Store Reviews have become a poignant cross-disciplinary research interest over recent years. Important discoveries can be made in the realms of social studies, healthcare, privacy, and digital well-being - among others - through conducting a SMAR. <br></br> <br></br>
      </Typography>
      <br></br>
      <Typography variant="h3" className="about-header">The SMAR team is comprised of...</Typography>
      <Typography variant="body1" fontSize="20px" className="about-text">
            Our <strong>Developer Team</strong>, which works on building out the technical components of our app (such as this site!) <br></br><br></br>
            Our <strong>Technical Consulting Team</strong>, who consult with researchers to assist them in conducting research with our tool. They also gather valuable feedback to improve our application! <br></br><br></br>
            Our <strong>Literature Review Team</strong>, who review existing SMAR research and inform the development of new features to assist researchers. <br></br><br></br>
            Learn more about our lovely team members below.
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
      <br/>
    </Container>
  );
};

export default About;