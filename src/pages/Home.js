import React from 'react';
import SearchBar from '../components/SearchBar';
import Typography from '@mui/material/Typography';


const Home = () => {
  return (
    <>
        <div style={{  "text-align": "center"}}>
          <Typography variant="h3" style={{ paddingTop: 20 }}>Systematic Mobile Application Review</Typography>
          <Typography variant="p">A tool for academic researchers to conduct a keyword search of Google Play and get back the metadata for all relevant apps.</Typography>
        </div>
        < SearchBar/>
    </>
  );
};

export default Home;