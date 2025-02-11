import React, { useEffect } from "react";
import TopLists from "../components/TopLists";
import MobileScreen from "../components/MobileScreen";
import { UserAgent } from "express-useragent";
import "../css/Home.css";
import Citation from "../components/Citation";

import { Typography, Box, Tabs, Tab, Link } from "@mui/material";
import { Chip } from "@mui/joy";
import { Android, Apple } from "@mui/icons-material";

// import { useLocation, useNavigate } from "react-router-dom";
import { useScraper } from "../components/SelectedScraperProvider";

const TopCharts = ({ flipState }) => {
    // const [selectedScraper, setSelectedScraper] = React.useState("Play Store");
    const { selectedScraper, setSelectedScraper } = useScraper();

    const userAgent = new UserAgent().parse(navigator.userAgent);
    const isMobileDevice = userAgent.isMobile;
    // const location = useLocation();
    // const navigate = useNavigate();

    // useEffect(() => {
    //     if (location.state && location.state.selectedScraper) {
    //         setSelectedScraper(location.state.selectedScraper);
    //         //console.log(selectedScraper);
    //     }
    // }, [location.state]);

    // Switch to mobile device screen if user is on a mobile device
    return !isMobileDevice ? (
        <>
            <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
                <Tabs
                    value={selectedScraper ?? "Play Store"}
                    onChange={(_event, newValue) =>
                        setSelectedScraper(newValue)
                    }
                    aria-label="basic tabs example"
                >
                    <Tab
                        icon={<Android />}
                        iconPosition="start"
                        label="PLAY STORE"
                        value={"Play Store"}
                    />
                    <Tab
                        icon={<Apple />}
                        iconPosition="start"
                        label="APP STORE"
                        value={"App Store"}
                    />
                </Tabs>
            </Box>
            <div className="home-container">
                <Typography variant="h3" className="home-header">
                    Systematic Mobile Application Reviews - Top Charts
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
                    Fetch top charts for different countries, collections, and
                    categories for the{" "}
                    {selectedScraper === "Play Store"
                        ? "Google Play"
                        : "iOS App"}{" "}
                    store.
                </Typography>
            </div>
            <TopLists flipState={flipState} selectedScraper={selectedScraper} />
            <Citation />
        </>
    ) : (
        <MobileScreen />
    );
};

export default TopCharts;
