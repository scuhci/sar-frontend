import React from "react";
import SearchBar from "../components/SearchBar";
import MobileScreen from "../components/MobileScreen";
import Typography from "@mui/material/Typography";
import { UserAgent } from "express-useragent";
import "../css/Home.css";
import Citation from "../components/Citation";
import Chip from "@mui/joy/Chip";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { Android, Apple } from "@mui/icons-material";
import { useScraper } from "../components/SelectedScraperProvider";
import Footer from "../components/Footer";

const Home = ({ flipState }) => {
    // State for choosing Play Store / iOS App Store
    // const [selectedScraper, setSelectedScraper] = React.useState("Play Store");
    const { selectedScraper, setSelectedScraper } = useScraper();

    const userAgent = new UserAgent().parse(navigator.userAgent);
    const isMobileDevice = userAgent.isMobile;

    // Switch to mobile device screen if user is on a mobile device
    return !isMobileDevice ? (
        <>
            <div className="app-container">
                <div className="content">
                    {/** Tabs to select Play Store / iOS App Store */}
                    <Box sx={{ borderBottom: 1, borderColor: "divider", marginTop: 7 }}>
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
                                onClick={function () { }}
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

export default Home;
