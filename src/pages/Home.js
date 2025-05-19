import React from "react";
import SearchBar from "../components/SearchBar";
import MobileScreen from "../components/MobileScreen";
import Typography from "@mui/material/Typography";
import { UAParser } from 'ua-parser-js';
import "../css/Home.css";
import Citation from "../components/Citation";
import Chip from "@mui/joy/Chip";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { Android, Apple } from "@mui/icons-material";
import { useScraper } from "../components/SelectedScraperProvider";

const Home = ({ flipState }) => {
    // State for choosing Play Store / iOS App Store
    // const [selectedScraper, setSelectedScraper] = React.useState("Play Store");
    const { selectedScraper, setSelectedScraper } = useScraper();
    
    // Should be an undefined object if it's on a laptop
    const userAgent = new UAParser().getDevice();
    const isMobileDevice = userAgent.type === 'mobile';

    // Switch to mobile device screen if user is on a mobile device
    return !isMobileDevice ? (
        <>
            {/** Tabs to select Play Store / iOS App Store */}
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
                    A tool for academic researchers to scrape data about mobile
                    apps from the{" "}
                    {selectedScraper === "Play Store"
                        ? "Google Play"
                        : "iOS App"}{" "}
                    store.
                </Typography>
            </div>
            <SearchBar flipState={flipState} />
            <Citation />
        </>
    ) : (
        <MobileScreen />
    );
};

export default Home;
