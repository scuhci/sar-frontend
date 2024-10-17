import React from "react";
import SearchBar from "../components/SearchBar";
import MobileScreen from "../components/MobileScreen";
import Typography from "@mui/material/Typography";
import { UserAgent } from "express-useragent";
import "../css/Home.css";
import Chip from "@mui/joy/Chip";

const Home = ({ flipState }) => {
  
  const userAgent = new UserAgent().parse(navigator.userAgent);
  const isMobileDevice = userAgent.isMobile;


  // Switch to mobile device screen if user is on a mobile device
  return ! isMobileDevice ? (
    <>
      <div className="home-container">
        <Typography variant="h3" className="home-header">
          Systematic Mobile Application Reviews
          <Chip
            color="success"
            onClick={function () {}}
            size="sm"
            variant="outlined"
          >
            BETA
          </Chip>
        </Typography>

        <Typography variant="p" className="home-text">
        A tool for academic researchers to scrape data about mobile apps from the Google Play store.
        </Typography>
      </div>
      <SearchBar flipState={flipState}/>
    </>
  ) : (
    <MobileScreen />
  );
};

export default Home;
