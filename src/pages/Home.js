import React from 'react';
import SearchBar from '../components/SearchBar';
import Typography from '@mui/material/Typography';
import "../css/Home.css";
import Chip from '@mui/joy/Chip';


const Home = () => {
  return (
    <>
        <div className='home-container'>
          <Typography variant="h3" className='home-header'>
            Systematic Mobile Application Reviews
            <Chip
              color="success"
              onClick={function(){}}
              size="sm"
              variant="outlined"
            >
              BETA
            </Chip>
          </Typography>
          
          <Typography variant="p" className='home-text'>A tool for academic researchers to conduct a keyword search of Google Play and get back the metadata for all relevant apps.</Typography>
        </div>
        < SearchBar/>
    </>
  );
};

export default Home;