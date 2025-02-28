import { useState } from "react";
import { Button, Chip, TextField, Typography } from "@mui/material";
import Dropdown from "./Dropdown";
import { useScraper } from "./SelectedScraperProvider";

const BulkReviewSearchBar = () => {
    const { selectedScraper } = useScraper();
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [country, setCountry] = useState("US");

    const handleCountryChange = (newCountry) => {
        setCountry(newCountry);
    };

    const handleSearchChange = (event) => {
        setSearchQuery(event.target.value);
    };

    const handleSearchSubmit = (term = searchQuery) => {};

    const handleKeyDown = (event) => {
        if (event.key === "Enter") {
            handleSearchSubmit();
        }
    };

    return (
        <div className="search-bar-container">
            <div className="search-and-button-container">
                <Dropdown handler={handleCountryChange} />
                <TextField
                    label="Enter app IDs, separated by commas (e.g., com.example.app1, com.example.app2)"
                    variant="outlined"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    onKeyDown={handleKeyDown}
                    className="search-input"
                />
                <Button
                    className="search-button"
                    onClick={() => {
                        handleSearchSubmit(searchQuery);
                    }}
                    variant="contained"
                    color="primary"
                    disabled={isLoading}
                >
                    {selectedScraper === "Play Store" ? "Scrape Play Store" : "Scrape App Store"}
                </Button>
            </div>
            <div
                style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "start",
                    justifyContent: "flex-start",
                    marginTop: 16,
                }}
            >
                <Typography sx={{ mr: 1 }} variant="h6">
                    Example Searches:
                </Typography>
                <Chip sx={{ mr: 1 }} variant="outlined" label="com.example.one" />
                <Chip sx={{ mr: 1 }} variant="outlined" label="com.example.two" />
                <Chip sx={{ mr: 1 }} variant="outlined" label="com.example.three, com.example.four" />
            </div>
            <div
                style={{
                    width: "100%",

                    display: "flex",
                    flexDirection: "column",
                    alignItems: "start",
                    marginTop: 16,
                }}
            >
                <div style={{ justifyContent: "left", whiteSpace: "nowrap" }}>
                    <span style={{ fontWeight: "bold" }}>Please note:</span> You can scrape for up to 20 apps per query
                    with a limit of 10,000 reviews per app.
                </div>
                <div style={{ justifyContent: "left", whiteSpace: "nowrap" }}>
                    For scraping beyond these limits, please refer to our user guide.
                </div>
            </div>
        </div>
    );
};

export default BulkReviewSearchBar;
