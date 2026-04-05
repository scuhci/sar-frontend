import React from "react";
import "../../css/EndpointError.css";
import { Typography, Box, Button } from "@mui/material";
import ServiceError from "../../res/SMAR_Service_Error.png";
import ReloadButton from "./ReloadButton";

const EndpointError = (endpointType, selectedScraper) => {
  return (
    <Box className="error-container">
      <img src={ServiceError} alt="Service Error" />
      {endpointType === "GooglePlay" && (
        <Box>
          <Typography>Unable to reach Google Play Store</Typography>
          <Box sx={{ display: "flex", flexDirection: "row" }}>
            <Button
              className="search-button"
              // onClick={}
              variant="contained"
              color="primary"
            >
              {selectedScraper !== "Play Store"
                ? "Scrape Play Store"
                : "Scrape App Store"}
            </Button>
            <ReloadButton />
          </Box>
        </Box>
      )}
      {endpointType === "AppStore" && (
        <Box>
          <Typography>Unable to reach App Store</Typography>
          <Box sx={{ display: "flex", flexDirection: "row" }}>
            <Button
              className="search-button"
              // onClick={}
              variant="contained"
              color="primary"
            >
              {selectedScraper !== "Play Store"
                ? "Scrape Play Store"
                : "Scrape App Store"}
            </Button>
            <ReloadButton />
          </Box>
        </Box>
      )}
      {endpointType === "TopCharts" && (
        <Box>
          <Typography>Unable to reach Top Charts</Typography>
          <ReloadButton />
        </Box>
      )}
      {endpointType === "BulkReviews" && (
        <Box>
          <Typography>Unable to reach Top Charts</Typography>
          <ReloadButton />
        </Box>
      )}
    </Box>
  );
};

export default EndpointError;
