import React from "react";
import SearchBar from "../components/SearchBar";
import MobileScreen from "../components/MobileScreen";
import Typography from "@mui/material/Typography";
import { UserAgent } from "express-useragent";
import "../css/Home.css";
import Chip from "@mui/joy/Chip";

const Home = () => {
  // Determine if the user is on a mobile device[true] or a PC [false]
  const isMobileDevice = new UserAgent().parse(navigator.userAgent);

  // Switch to mobile device screen if user is on a mobile device
  return isMobileDevice ? (
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
          A tool for academic researchers to conduct a keyword search of Google
          Play and get back the metadata for all relevant apps.
        </Typography>
      </div>
      <SearchBar />
    </>
  ) : (
    <div>
    <MobileScreen />
    </div>
  );
};

export default Home;
