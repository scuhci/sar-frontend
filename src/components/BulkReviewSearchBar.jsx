import { useState, useEffect } from "react";
import {
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    LinearProgress,
    TextField,
    Typography,
} from "@mui/material";
import Dropdown from "./Dropdown";
import { useScraper } from "./SelectedScraperProvider";
import axios from "axios";

const BulkReviewSearchBar = ({ flipState }) => {
    const { selectedScraper } = useScraper();
    const [abortController, setAbortController] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchQueryErrorMessage, setSearchQueryErrorMessage] = useState("");
    const [displaySearchResults, setDisplaySearchResults] = useState([]);
    const [reviewSearchResults, setReviewSearchResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentlySearching, setCurrentlySearching] = useState("");
    const [country, setCountry] = useState("US");

    const handleCountryChange = (newCountry) => {
        setCountry(newCountry);
    };

    const handleSearchChange = (event) => {
        setSearchQuery(event.target.value);
    };

    const handleSearchSubmit = async () => {
        // Validate search query
        console.log(searchQuery);
        // Split the query into individual app IDs
        const appIds = searchQuery.split(",").map((id) => id.trim());
        // Check if there are any app IDs
        if (appIds.length === 0) {
            setSearchQueryErrorMessage(searchQuery);
            return;
        }
        // Validate each app ID
        const appIdRegex = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/;
        for (let appId of appIds) {
            if (!appIdRegex.test(appId)) {
                setSearchQueryErrorMessage(`Invalid package name provided. Following package were invalid: ${appId}`);
                return;
            }
        }
        // Check if number of app IDs exceeds 20
        if (appIds.length > 20) {
            setSearchQueryErrorMessage("Too many app ids specified. Please limit your query to at most 20 app ids.");
            return;
        }
        setSearchQueryErrorMessage("");
        console.dir(appIds);

        if (abortController) {
            abortController.abort();
        }
        const newAbortController = new AbortController();
        setAbortController(newAbortController);

        // Send API request for each app id
        setIsLoading(true);
        for (let appId of appIds) {
            setCurrentlySearching(appId);
            try {
                // Get data to display on Step 2
                const displayResponse = await axios.get(
                    selectedScraper === "Play Store"
                        ? `/search?query=${appId}&countryCode=${country}`
                        : `/ios/search?query=${appId}&countryCode=${country}`
                );
                setDisplaySearchResults((prev) => [...prev, displayResponse.data]);
                // Get reviews
                const reviewResponse = await axios.get(
                    selectedScraper === "Play Store"
                        ? `/reviews?appId=${appId}&countryCode=${country}`
                        : `/ios/reviews?appId=${appId}&countryCode=${country}`, // Change to URL for app store scraper
                    {
                        signal: newAbortController.signal,
                        responseType: "blob", //handling the binary data
                    }
                );
                console.dir(reviewResponse);
                console.log(reviewResponse.data);
                setReviewSearchResults((prev) => [...prev, reviewResponse.data]);
            } catch (error) {
                if (axios.isCancel(error)) {
                    console.log("Request canceled:", error.message);
                } else {
                    console.error("Error fetching search results:", error);
                }
                setIsLoading(false);
            }
        }
        setIsLoading(false);
    };

    useEffect(() => {
        console.log(reviewSearchResults);
    }, [reviewSearchResults]);

    const handleKeyDown = (event) => {
        if (event.key === "Enter") {
            handleSearchSubmit();
        }
    };

    const handleCancel = () => {
        abortController.abort();
        setIsLoading(false);
    };

    useEffect(() => {
        setDisplaySearchResults([]);
    }, [selectedScraper]);

    return (
        <div className="search-bar-container">
            <div
                style={{
                    alignItems: "start",
                    display: "flex",
                    justifyContent: "flex-start",
                    width: "100%",
                    marginBottom: 10,
                    gap: 10,
                }}
            >
                <Dropdown handler={handleCountryChange} />
                <TextField
                    label="Enter app IDs, separated by commas (e.g., com.example.app1, com.example.app2)"
                    variant="outlined"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    onKeyDown={handleKeyDown}
                    className="search-input"
                    error={searchQueryErrorMessage.length > 0}
                    helperText={searchQueryErrorMessage}
                />
                <Button
                    className="search-button"
                    onClick={handleSearchSubmit}
                    variant="contained"
                    color="primary"
                    disabled={isLoading}
                >
                    {selectedScraper === "Play Store" ? "Scrape Play Store" : "Scrape App Store"}
                </Button>
            </div>

            {/** Loading Dialog */}
            <Dialog
                open={isLoading}
                onClose={handleCancel}
                aria-labelledby="loading-dialog-title"
                PaperProps={{
                    style: {
                        backgroundColor: "white",
                        position: "relative",
                    },
                }}
            >
                <div className="loading-backdrop" open={isLoading}></div>
                <DialogContent>
                    <DialogContentText id="loading-dialog-title" className="loading-dialog-content">
                        <strong>Scraping data {searchQuery ? ` for "${searchQuery}"` : ""}...</strong>
                    </DialogContentText>
                    <DialogContentText className="loading-dialog-subtext">
                        Currently scraping reviews for {currentlySearching}
                    </DialogContentText>
                    <LinearProgress className="loading-progress-bar" />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCancel} color="primary" className="loading-dialog-actions">
                        Cancel
                    </Button>
                </DialogActions>
            </Dialog>

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
                <Chip
                    sx={{ mr: 1 }}
                    variant="outlined"
                    label="com.example.one"
                    onClick={() => setSearchQuery("com.example.one")}
                />
                <Chip
                    sx={{ mr: 1 }}
                    variant="outlined"
                    label="com.example.two"
                    onClick={() => setSearchQuery("com.example.two")}
                />
                <Chip
                    sx={{ mr: 1 }}
                    variant="outlined"
                    label="com.example.three, com.example.four"
                    onClick={() => setSearchQuery("com.example.three, com.example.four")}
                />
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
                <div style={{ textAlign: "left" }}>
                    <span style={{ fontWeight: "bold" }}>Please note:</span> You can scrape for up to 20 apps per query
                    with a limit of 10,000 reviews per app. For scraping beyond these limits, please refer to our user
                    guide.
                </div>
            </div>
        </div>
    );
};

export default BulkReviewSearchBar;
