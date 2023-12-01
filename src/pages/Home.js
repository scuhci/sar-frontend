import React from 'react';
import SearchBar from '../components/SearchBar';
import Typography from '@mui/material/Typography';
import "../css/Home.css";


const Home = () => {
  return (
    <>
        <div className='home-container'>
          <Typography variant="h3" className='home-header'>Systematic Mobile Application Review</Typography>
          <Typography variant="p" className='home-text'>A tool for academic researchers to conduct a keyword search of Google Play and get back the metadata for all relevant apps.</Typography>
        </div>
        < SearchBar/>
    </>
  );
};

export default Home;