import React from "react";
import TopLists from "../components/TopLists";
import MobileScreen from "../components/MobileScreen";
import Typography from "@mui/material/Typography";
import { UserAgent } from "express-useragent";
import "../css/Home.css";
import Citation from "../components/Citation";
import Chip from "@mui/joy/Chip";

const TopCharts = ({ flipState }) => {
  
  const userAgent = new UserAgent().parse(navigator.userAgent);
  const isMobileDevice = userAgent.isMobile;


  // Switch to mobile device screen if user is on a mobile device
  return ! isMobileDevice ? (
    <>
      <div className="home-container">
        <Typography variant="h3" className="home-header">
          Systematic Mobile Application Reviews - Top Lists
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
        Fetch top charts for different countries, collections, and categories.
        </Typography>
      </div>
      <TopLists flipState={flipState}/>
      <Citation />
    </>
  ) : (
    <MobileScreen />
  );
};

export default TopCharts;
