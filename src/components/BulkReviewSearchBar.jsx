import { useState, useEffect } from "react";
import {
    Avatar,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    FormControl,
    InputLabel,
    LinearProgress,
    MenuItem,
    Select,
    TextField,
    Typography,
} from "@mui/material";
import Dropdown from "./Dropdown";
import { useScraper } from "./SelectedScraperProvider";
import axios from "axios";
import { DataGrid } from "@mui/x-data-grid";
import JSZip from "jszip";

// Data grid columns from displaySearchResults
const columns = [
    {
        field: "icon",
        renderHeader: () => <strong>Icon</strong>,
        renderCell: (params) => <Avatar src={params.value} alt="Icon" />,
        minWidth: 50,
    },
    {
        field: "title",
        renderHeader: () => <strong>App Name</strong>,
        renderCell: (params) => params.value ?? "-",
        minWidth: 250,
    },
    {
        field: "appId",
        renderHeader: () => <strong>App Id</strong>,
        renderCell: (params) => params.value ?? "-",
        minWidth: 250,
    },
    {
        field: "reviewsCount",
        renderHeader: () => <strong>Reviews</strong>,
        renderCell: (params) => params.value ?? "-",
        minWidth: 100,
    },
    {
        field: "developer",
        renderHeader: () => <strong>Developer</strong>,
        renderCell: (params) => params.value ?? "-",
        minWidth: 200,
    },
    {
        field: "score",
        renderHeader: () => <strong>Score</strong>,
        renderCell: (params) => params.value ?? "-",
        minWidth: 100,
    },
    {
        field: "url",
        renderHeader: () => <strong>URL</strong>,
        renderCell: (params) => params.value ?? "-",
        minWidth: 250,
    },
    {
        field: "category",
        renderHeader: () => <strong>Category</strong>,
        renderCell: (params) => params.value ?? "-",
        minWidth: 200,
    },
];

// Helper function to add appId column to review CSV
// Removes header row, since that is handled in combineCSVBlobs()
async function addAppIdColumnToCSV(csvBlob, appId) {
    // Step 1: Convert Blob to text
    const csvText = await csvBlob.text();

    // Step 2: Parse the CSV text into rows
    const rows = csvText.split("\n");

    // Step 4: Add the appId value to front of each data row
    for (let i = 1; i < rows.length; i++) {
        if (rows[i].trim() === "") continue; // Skip empty rows
        let rowData = rows[i].split(",");
        rowData.unshift(`"${appId}"`);
        rows[i - 1] = rowData.join(",");
    }
    rows.pop(); // Remove last row

    // Step 5: Join the rows back into a single string
    const newCsvText = rows.join("\n");

    console.log(newCsvText);

    // Step 6: Create a new Blob with the updated CSV
    const newCsvBlob = new Blob([newCsvText, "\n"], { type: "text/csv;charset=utf-8" });

    return newCsvBlob;
}

// Helper function to combine array of CSVs into one CSV
async function combineCSVBlobs(displaySearchResults, reviewSearchResults) {
    let allRows = [];
    let headers = null;
    for (let i = 0; i < displaySearchResults.length; i++) {
        const csvBlob = reviewSearchResults[i];
        // Convert Blob to text
        const csvText = await csvBlob.text();

        // Parse the CSV text into rows
        const rows = csvText.split("\n");

        // Process the header row (only from the first Blob)
        if (headers === null) {
            // Add appId to the front of headers
            let headerData = rows[0].split(",");
            headerData.unshift(`"appId"`);
            headers = headerData.join(",") + "\n";
        }

        allRows.push(await addAppIdColumnToCSV(csvBlob, displaySearchResults[i].results[0].appId));
    }
    return new Blob(["\ufeff", headers, ...allRows], { type: "text/csv;charset=utf-8" });
}

// Options for sorting reviews
const sortOptions = ["Recency", "Rating", "Helpfulness"];

const BulkReviewSearchBar = ({ flipState, activeStep, setActiveStep }) => {
    const { selectedScraper } = useScraper();
    const [abortController, setAbortController] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchQueryErrorMessage, setSearchQueryErrorMessage] = useState("");
    const [displaySearchResults, setDisplaySearchResults] = useState([]);
    const [appIds, setAppIds] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentlySearching, setCurrentlySearching] = useState("");
    const [country, setCountry] = useState("US");
    const [rows, setRows] = useState([]);
    const [sortValue, setSortValue] = useState(sortOptions[0]);

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
        setAppIds(appIds);

        if (abortController) {
            abortController.abort();
        }
        const newAbortController = new AbortController();
        setAbortController(newAbortController);

        // Send API request for each app id
        setIsLoading(true);
        const newDisplaySearchResults = [];
        for (let appId of appIds) {
            setCurrentlySearching(appId);
            try {
                // Get data to display on Step 2
                const displayResponse = await axios.get(
                    selectedScraper === "Play Store"
                        ? `/search?query=${appId}&countryCode=${country}`
                        : `/ios/search?query=${appId}&countryCode=${country}`
                );
                newDisplaySearchResults.push(displayResponse.data);
            } catch (error) {
                if (axios.isCancel(error)) {
                    console.log("Request canceled:", error.message);
                } else {
                    console.error("Error fetching search results:", error);
                }
                setIsLoading(false);
            }
        }
        setDisplaySearchResults(newDisplaySearchResults);
        setIsLoading(false);
        setActiveStep(1);
    };

    useEffect(() => {
        console.log(displaySearchResults);
        console.log("SETTING ROWS");
        setRows(
            displaySearchResults.map((app) => ({
                icon: app.results[0].icon,
                title: app.results[0].title,
                appId: app.results[0].appId,
                reviewsCount: app.results[0].reviews,
                developer: app.results[0].developer,
                score: app.results[0].score,
                url: app.results[0].url,
                category: app.results[0].genreId,
            }))
        );
    }, [displaySearchResults]);

    useEffect(() => {
        console.log("PRINTING ROWS");
        console.dir(rows);
    }, [rows]);

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

    // Get total number of reviews to be scraped using limit of 10,000 reviews per app
    const totalReviewCount = rows.reduce((sum, row) => (sum += Math.min(row.reviewsCount, 10000)), 0);

    const handleDownloadReviews = async () => {
        const date = new Date();
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const day = date.getDate().toString().padStart(2, "0");
        const year = date.getFullYear();
        const filename = `reviews_${month}${day}${year}`;
        const filename_zip = `${filename}.zip`;
        const zip = new JSZip();
        const filename_csv = `${filename}.csv`;

        if (abortController) {
            abortController.abort();
        }
        const newAbortController = new AbortController();
        setAbortController(newAbortController);

        // Send API request for each app id
        setIsLoading(true);
        const reviewSearchResults = [];

        for (let appId of appIds) {
            setCurrentlySearching(appId);
            try {
                // Get reviews
                const reviewResponse = await axios.get(
                    selectedScraper === "Play Store"
                        ? `/reviews?appId=${appId}&countryCode=${country}&sortBy=${sortValue}`
                        : `/ios/reviews?appId=${appId}&countryCode=${country}&sortBy=${sortValue}`, // Change to URL for app store scraper
                    {
                        signal: newAbortController.signal,
                        responseType: "blob", //handling the binary data
                    }
                );
                console.log("REVIEW RESPONSE");
                console.dir(reviewResponse);
                console.log(await reviewResponse.data.text());
                reviewSearchResults.push(reviewResponse.data);
            } catch (error) {
                if (axios.isCancel(error)) {
                    console.log("Request canceled:", error.message);
                } else {
                    console.error("Error fetching search results:", error);
                }
                setIsLoading(false);
            }
        }
        zip.file(filename_csv, await combineCSVBlobs(displaySearchResults, reviewSearchResults));
        zip.generateAsync({ type: "blob" }).then(function (zipFile) {
            // Create a link element, set the href to the blob URL, and trigger a download
            const url = window.URL.createObjectURL(zipFile);
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", filename_zip);
            document.body.appendChild(link);
            link.click();
            // Clean up and revoke the URL
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        });
        setIsLoading(false);
    };

    return (
        <div className="search-bar-container">
            {activeStep === 0 && (
                <>
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

                    <div
                        style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "start",
                            justifyContent: "flex-start",
                            marginTop: 16,
                        }}
                    >
                        <Typography sx={{ mr: 1 }} variant="h5">
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
                            <span style={{ fontWeight: "bold" }}>Please note:</span> You can scrape for up to 20 apps
                            per query with a limit of 10,000 reviews per app. For scraping beyond these limits, please
                            refer to our user guide.
                        </div>
                    </div>
                </>
            )}

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

            {activeStep === 1 && (
                <div
                    style={{
                        width: "100%",
                        maxWidth: 1000,
                        flexDirection: "column" /* Flex height to fit selected number of rows */,
                        margin: "auto",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 24,
                        }}
                    >
                        <div style={{ textAlign: "left" }}>
                            <Typography variant="h5">{rows.length} apps selected</Typography>
                            <Typography variant="body2">
                                Select how you'd like the reviews sorted (by rating, newest, or grossing), then click
                                below to download your CSV file.
                            </Typography>
                        </div>

                        <Box sx={{ minWidth: 120 }}>
                            <FormControl fullWidth>
                                <InputLabel id="sort-reviews-label">Sort Reviews By</InputLabel>
                                <Select
                                    labelId="sort-reviews-label"
                                    id="sort-reviews"
                                    value={sortValue}
                                    onChange={(event) => {
                                        setSortValue(event.target.value);
                                    }}
                                    label="Sort Reviews By"
                                >
                                    {sortOptions.map((option, id) => (
                                        <MenuItem key={id} value={option}>
                                            {option}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Box>
                    </div>
                    <DataGrid
                        rows={rows}
                        columns={columns}
                        initialState={{
                            pagination: {
                                paginationModel: { pageSize: 5 },
                            },
                        }}
                        pageSizeOptions={[5, 10, 20]}
                        disableColumnSelector
                        getRowId={(row) => row.appId}
                        disableRowSelectionOnClick
                    />
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginTop: 24,
                            marginBottom: 24,
                        }}
                    >
                        <div>
                            <span style={{ fontWeight: "bold" }}>Total {totalReviewCount} Reviews: </span>
                            (Sort by {sortValue}; Scraping limited to 10,000 per app)
                        </div>
                        <div>
                            <Button onClick={() => setActiveStep((prevActiveStep) => prevActiveStep - 1)}>Back</Button>
                            <Button onClick={handleDownloadReviews} variant="contained">
                                Scrape and Download Reviews
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BulkReviewSearchBar;
