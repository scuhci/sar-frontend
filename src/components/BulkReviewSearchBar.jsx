import { useState, useEffect, useRef } from "react";
import {
    Alert,
    Avatar,
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
import { DataGrid } from "@mui/x-data-grid";
import JSZip from "jszip";

// Data grid columns for the apps found on Step 1
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

// Helper function to combine the per-app review CSVs into one CSV with a leading appId column.
// Each entry is { appId, csvBlob }, so every row is tagged with the app its reviews were fetched for.
async function combineCSVBlobs(reviewResults) {
    let header = null;
    let emptyAppHeader = null;
    const dataRows = [];
    for (const { appId, csvBlob } of reviewResults) {
        const [csvHeader, ...rows] = (await csvBlob.text()).split("\n").filter((row) => row.trim() !== "");
        if (csvHeader === undefined) continue;
        // An app with no reviews comes back header-only ("dateScraped"), so take the header from the
        // first app that has reviews; fall back to the empty one only if no app has any
        if (rows.length === 0) {
            emptyAppHeader = emptyAppHeader ?? `"appId",${csvHeader}`;
            continue;
        }
        if (header === null) {
            header = `"appId",${csvHeader}`;
        }
        for (const row of rows) {
            dataRows.push(`"${appId}",${row}`);
        }
    }
    header = header ?? emptyAppHeader ?? `"appId"`;
    return new Blob(["\ufeff", [header, ...dataRows].join("\n"), "\n"], { type: "text/csv;charset=utf-8" });
}

const BulkReviewSearchBar = ({ flipState, activeStep, setActiveStep }) => {
    const { selectedScraper } = useScraper();
    // Controller for the requests in flight, so Cancel can stop them
    const abortControllerRef = useRef(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchQueryErrorMessage, setSearchQueryErrorMessage] = useState("");
    // Apps the search resolved, in the order they were entered
    const [apps, setApps] = useState([]);
    // App IDs that could not be found, and app IDs whose reviews could not be fetched
    const [notFoundAppIds, setNotFoundAppIds] = useState([]);
    const [failedReviewAppIds, setFailedReviewAppIds] = useState([]);
    const [appIds, setAppIds] = useState([]);
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
        setAppIds(appIds);

        abortControllerRef.current?.abort();
        const newAbortController = new AbortController();
        abortControllerRef.current = newAbortController;

        // Send API request for each app id
        setIsLoading(true);
        const foundApps = [];
        const notFound = [];
        for (let appId of appIds) {
            if (newAbortController.signal.aborted) break;
            setCurrentlySearching(appId);
            try {
                // Get data to display on Step 2
                const displayResponse = await axios.get(
                    selectedScraper === "Play Store"
                        ? `/api/search?query=${appId}&countryCode=${country}`
                        : `/ios/search?query=${appId}&countryCode=${country}`,
                    { signal: newAbortController.signal }
                );
                // If the ID is not an exact match the backends fall back to a keyword search, so only accept
                // the result for the app that was asked for, never just the first result
                const app = displayResponse.data?.results?.find(
                    (result) => result.appId?.toLowerCase() === appId.toLowerCase()
                );
                if (app) {
                    foundApps.push(app);
                } else {
                    notFound.push(appId);
                }
            } catch (error) {
                if (axios.isCancel(error)) {
                    console.log("Request canceled:", error.message);
                } else {
                    console.error("Error fetching search results:", error);
                }
                notFound.push(appId);
            }
        }
        setIsLoading(false);
        // User pressed Cancel: stay on Step 1
        if (newAbortController.signal.aborted) return;
        if (foundApps.length === 0) {
            setSearchQueryErrorMessage(`No app found for: ${notFound.join(", ")}. Please check the app IDs.`);
            return;
        }
        setApps(foundApps);
        setNotFoundAppIds(notFound);
        setFailedReviewAppIds([]);
        setActiveStep(1);
    };

    const rows = apps.map((app) => ({
        icon: app.icon,
        title: app.title,
        appId: app.appId,
        reviewsCount: app.reviews,
        developer: app.developer,
        score: app.score,
        url: app.url,
        category: app.genreId,
    }));

    const handleKeyDown = (event) => {
        if (event.key === "Enter") {
            handleSearchSubmit();
        }
    };

    const handleCancel = (_event, reason) => {
        if (reason && reason === "backdropClick") return;
        abortControllerRef.current?.abort();
        setIsLoading(false);
    };

    // The selected apps belong to one store, so switching store goes back to the search step
    useEffect(() => {
        setApps([]);
        setActiveStep(0);
    }, [selectedScraper, setActiveStep]);

    // Per-app review cap enforced by each backend (Play Store 10,000, App Store 500)
    const maxReviewsPerApp = selectedScraper === "Play Store" ? 10000 : 500;
    const maxReviewsPerAppLabel = maxReviewsPerApp.toLocaleString("en-US");

    // Get total number of reviews to be scraped using the per-app cap for the selected store
    const totalReviewCount = rows.reduce((sum, row) => (sum += Math.min(row.reviewsCount, maxReviewsPerApp)), 0);

    const handleDownloadReviews = async () => {
        const date = new Date();
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const day = date.getDate().toString().padStart(2, "0");
        const year = date.getFullYear();
        const filename = `reviews_${month}${day}${year}`;
        const filename_zip = `${filename}.zip`;
        const zip = new JSZip();
        const filename_csv = `${filename}.csv`;
        const filename_relog = `${filename}_reproducibility_log.txt`;

        abortControllerRef.current?.abort();
        const newAbortController = new AbortController();
        abortControllerRef.current = newAbortController;

        // Send API request for each app found on Step 1
        const selectedAppIds = apps.map((app) => app.appId);
        setAppIds(selectedAppIds);
        setIsLoading(true);
        const reviewSearchResults = [];
        const failed = [];
        const relogs = [];

        for (let appId of selectedAppIds) {
            if (newAbortController.signal.aborted) break;
            setCurrentlySearching(appId);
            try {
                // Get reviews
                const reviewResponse = await axios.get(
                    selectedScraper === "Play Store"
                        ? `/api/reviews?appId=${appId}&countryCode=${country}`
                        : `/ios/reviews?appId=${appId}&countryCode=${country}`,
                    {
                        signal: newAbortController.signal,
                        responseType: "blob", //handling the binary data
                    }
                );
                // Keep the appId with its CSV so the combined file is tagged with the right app
                reviewSearchResults.push({ appId, csvBlob: reviewResponse.data });
            } catch (error) {
                if (axios.isCancel(error)) {
                    console.log("Request canceled:", error.message);
                } else {
                    console.error("Error fetching reviews:", error);
                    failed.push(appId);
                }
                continue;
            }
            try {
                // Reproducibility log for this app; the backend records the review count during the reviews request
                const relogResponse = await axios.get(
                    selectedScraper === "Play Store"
                        ? `/api/download-reviews-relog?appId=${appId}&countryCode=${country}&store=Google Play Store&sorting=RECENT`
                        : `/ios/download-reviews-relog?appId=${appId}&countryCode=${country}&store=iOS App Store&sorting=RECENT`,
                    { signal: newAbortController.signal, responseType: "blob" }
                );
                relogs.push(await relogResponse.data.text());
            } catch (error) {
                // A missing log should not cost the user the reviews
                console.error("Error fetching reproducibility log:", error);
                relogs.push(`appId: ${appId}\nThe reproducibility log for this app could not be generated.`);
            }
        }
        setFailedReviewAppIds(failed);
        // Nothing to download, or the user pressed Cancel (don't hand them a partial file)
        if (reviewSearchResults.length === 0 || newAbortController.signal.aborted) {
            setIsLoading(false);
            return;
        }
        zip.file(filename_csv, await combineCSVBlobs(reviewSearchResults));
        zip.file(filename_relog, relogs.join("\n\n"));
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
                        {/* Change example searches based on selectedScraper */}
                        {selectedScraper === "Play Store" ? (
                            <>
                                <Chip
                                    sx={{ mr: 1 }}
                                    variant="outlined"
                                    label="com.facebook.katana"
                                    onClick={() => setSearchQuery("com.facebook.katana")}
                                />
                                <Chip
                                    sx={{ mr: 1 }}
                                    variant="outlined"
                                    label="cc.forestapp"
                                    onClick={() => setSearchQuery("cc.forestapp")}
                                />
                                <Chip
                                    sx={{ mr: 1 }}
                                    variant="outlined"
                                    label="zank.flash, com.moonshine.sleeplights"
                                    onClick={() => setSearchQuery("zank.flash, com.moonshine.sleeplights")}
                                />
                            </>
                        ) : (
                            <>
                                <Chip
                                    sx={{ mr: 1 }}
                                    variant="outlined"
                                    label="com.facebook.Messenger"
                                    onClick={() => setSearchQuery("com.facebook.Messenger")}
                                />
                                <Chip
                                    sx={{ mr: 1 }}
                                    variant="outlined"
                                    label="com.openai.chat"
                                    onClick={() => setSearchQuery("com.openai.chat")}
                                />
                                <Chip
                                    sx={{ mr: 1 }}
                                    variant="outlined"
                                    label="com.google.ios.youtube, com.google.OPA"
                                    onClick={() => setSearchQuery("com.google.ios.youtube, com.google.OPA")}
                                />
                            </>
                        )}
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
                            per query with a limit of {maxReviewsPerAppLabel} reviews per app. For scraping beyond these
                            limits, please refer to our user guide.
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
                    <DialogContentText sx={{ fontWeight: "bold", pb: 2 }}>
                        Scraping data {searchQuery ? ` for "${searchQuery}"` : ""}...
                    </DialogContentText>
                    <DialogContentText sx={{ pb: 2 }}>
                        Currently scraping data for {currentlySearching}
                    </DialogContentText>
                    {/** Determinate Version */}
                    <LinearProgress
                        variant="determinate"
                        value={((appIds.indexOf(currentlySearching) + 1) / appIds.length) * 100}
                    />
                    {/** Indeterminate Version */}
                    {/* <LinearProgress className="loading-progress-bar" /> */}
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
                    {notFoundAppIds.length > 0 && (
                        <Alert severity="warning" sx={{ mb: 2, textAlign: "left" }}>
                            No app found for {notFoundAppIds.join(", ")}. These IDs are left out of the download.
                        </Alert>
                    )}
                    {failedReviewAppIds.length > 0 && (
                        <Alert severity="error" sx={{ mb: 2, textAlign: "left" }}>
                            Reviews could not be fetched for {failedReviewAppIds.join(", ")}, so they are not in the
                            downloaded file. Please try again.
                        </Alert>
                    )}
                    <div style={{ textAlign: "left", marginBottom: 24 }}>
                        <Typography variant="h5">{rows.length} apps selected</Typography>
                        <Typography variant="body2">
                            Reviews are collected newest first. Click below to download your CSV file.
                        </Typography>
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
                            (Newest first; scraping limited to {maxReviewsPerAppLabel} per app)
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
