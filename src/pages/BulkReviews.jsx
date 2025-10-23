import React, { useState } from "react";
import MobileScreen from "../components/MobileScreen";
import { UAParser } from "ua-parser-js";
import "../css/Home.css";
import Citation from "../components/Citation";
import Footer from "../components/Footer";

import { Typography, Box, Tabs, Tab } from "@mui/material";
import { Chip } from "@mui/material";
import { Android, Apple } from "@mui/icons-material";

import { useScraper } from "../components/SelectedScraperProvider";
import BulkReviewStepper from "../components/BulkReviewStepper";
import BulkReviewSearchBar from "../components/BulkReviewSearchBar";

const BulkReviews = ({ flipState }) => {
    const { selectedScraper, setSelectedScraper } = useScraper();
    // State for step the user is on, the search step (0) or the download step (1)
    const [activeStep, setActiveStep] = useState(0);

    // Should be an undefined object if it's on a laptop
    const userAgent = new UAParser().getDevice();
    const isMobileDevice = userAgent.type === "mobile";

    // Switch to mobile device screen if user is on a mobile device
    return !isMobileDevice ? (
        <>
            <div className="app-container">
                <div className="content">
                    {/** Tabs to select Play Store / iOS App Store */}
                    <Box sx={{ borderBottom: 1, borderColor: "divider", marginTop: 7 }}>
                        <Tabs
                            value={selectedScraper ?? "Play Store"}
                            onChange={(_event, newValue) => setSelectedScraper(newValue)}
                            aria-label="basic tabs example"
                        >
                            <Tab icon={<Android />} iconPosition="start" label="PLAY STORE" value={"Play Store"} />
                            <Tab icon={<Apple />} iconPosition="start" label="APP STORE" value={"App Store"} />
                        </Tabs>
                    </Box>
                    <div className="home-container">
                        <BulkReviewStepper activeStep={activeStep} />
                        <Typography variant="h3" className="home-header">
                            Bulk Review Scraper
                            <Chip
                                color="success"
                                onClick={function () {}}
                                size="small"
                                variant="outlined"
                                sx={{ ml: 1 }}
                                label="BETA"
                            />
                        </Typography>
                        <Typography variant="p" className="home-text">
                            Scrape reviews from multiple apps simultaneously from the{" "}
                            {selectedScraper === "Play Store" ? "Google Play" : "iOS App"} store with ease.
                        </Typography>
                        <BulkReviewSearchBar
                            flipState={flipState}
                            activeStep={activeStep}
                            setActiveStep={setActiveStep}
                        />
                    </div>
                </div>
                <Citation />
                <Footer />
                <br />
            </div>
        </>
    ) : (
        <MobileScreen />
    );
};

export default BulkReviews;
