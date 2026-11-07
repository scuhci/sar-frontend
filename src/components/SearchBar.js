import React, { useEffect, useState } from "react";
import { TextField, Button, Typography, Snackbar, Alert } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import axios from "axios";
import "../css/SearchBar.css";
import Loading from "./Loading";
import ExampleSearches from "./ExampleSearches";
import ExampleTopCharts from "./ExampleTopCharts";
import NoResults from "./NoResults";
import { appStoreColumns, columns, playStoreColumns } from "../constants/columns";
import { permissionColumns } from "../constants/permissionColumns";
import { gplayCountries } from "../constants/countryCodes";
import Link from "@mui/material/Link";
import { useScraper } from "../components/SelectedScraperProvider";

// For the checkbox
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Stack from "@mui/material/Stack";

//Tooltip
import InfoIcon from "@mui/icons-material/Info";
import { Tooltip } from "@mui/material";
import Dropdown from "./Dropdown";

// zip
let JSZip = require("jszip");

// A short reason for a failed search: the backend's own message when it sent one.
const searchErrorReason = (error) => {
    if (!error.response) return "Could not reach the server.";
    if (error.response.status === 504) return "The search took too long.";
    const message = error.response.data && error.response.data.error;
    if (typeof message === "string" && message.trim()) return message.trim();
    return `The server returned status ${error.response.status}.`;
};

const SearchBar = ({ flipState }) => {
    const { selectedScraper } = useScraper();
    const [searchQuery, setSearchQuery] = useState("");
    const [resultsText, setResultsText] = useState("");
    // The exact parameters of the search whose results are on screen; the download uses these
    // (not the live dropdown/checkbox values) so the ZIP matches the table.
    const [lastSearch, setLastSearch] = useState(null);
    const [downloadError, setDownloadError] = useState(false);
    const [searchError, setSearchError] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [abortController, setAbortController] = useState(null);
    const [includePermissions, setIncludePermissions] = useState(false);
    const [queryTime, setQueryTime] = useState("");
    const [country, setCountry] = useState("US");
    const sampleSearch = ["medication reminders", "self-care", "smartphone addiction"];

    const [displayPermissions, setDisplayPermissions] = useState(false);

    const rows =
        displayPermissions && selectedScraper === "Play Store"
            ? searchResults.map((application) => ({
                  ...application,
                  reviewsCount: application.reviews,
                  reviews: [application.reviews, application.appId, application.country],

                  // PERMISSIONS
                  // All truncated to two(ish) most relevant words.'
                  approximateLocation: application.permissions[0].isPermissionRequired,
                  preciseLocation: application.permissions[1].isPermissionRequired,
                  retrieveRunning: application.permissions[2].isPermissionRequired,
                  findAccounts: application.permissions[3].isPermissionRequired,
                  addRemoveAccounts: application.permissions[4].isPermissionRequired,
                  readContact: application.permissions[5].isPermissionRequired,
                  readCalendar: application.permissions[6].isPermissionRequired,
                  addModCalendar: application.permissions[7].isPermissionRequired,
                  readContacts: application.permissions[8].isPermissionRequired,
                  modifyContacts: application.permissions[9].isPermissionRequired,
                  directCall: application.permissions[10].isPermissionRequired,
                  readCallLog: application.permissions[11].isPermissionRequired,
                  readPhoneStatus: application.permissions[12].isPermissionRequired,
                  readUSB: application.permissions[13].isPermissionRequired,
                  modUSB: application.permissions[14].isPermissionRequired,
                  takePics: application.permissions[15].isPermissionRequired,
                  recordAudio: application.permissions[16].isPermissionRequired,
                  viewWifi: application.permissions[17].isPermissionRequired,
                  viewNetwork: application.permissions[18].isPermissionRequired,
                  createAccounts: application.permissions[19].isPermissionRequired,
                  readBattery: application.permissions[20].isPermissionRequired,
                  pairBluetooth: application.permissions[21].isPermissionRequired,
                  accessBluetooth: application.permissions[22].isPermissionRequired,
                  sendStickyBroadcast: application.permissions[23].isPermissionRequired,
                  changeNetwork: application.permissions[24].isPermissionRequired,
                  connectWifi: application.permissions[25].isPermissionRequired,
                  fullNetworkAccess: application.permissions[26].isPermissionRequired,
                  changeAudio: application.permissions[27].isPermissionRequired,
                  controlNFC: application.permissions[28].isPermissionRequired,
                  readSync: application.permissions[29].isPermissionRequired,
                  runAtStart: application.permissions[30].isPermissionRequired,
                  reorderRunnning: application.permissions[31].isPermissionRequired,
                  drawOver: application.permissions[32].isPermissionRequired,
                  controlVibration: application.permissions[33].isPermissionRequired,
                  preventSleep: application.permissions[34].isPermissionRequired,
                  toggleSync: application.permissions[35].isPermissionRequired,
                  installShortcuts: application.permissions[36].isPermissionRequired,
                  readGoogleConfig: application.permissions[37].isPermissionRequired,
              }))
            : searchResults.map((application) => ({
                  ...application,
                  reviewsCount: application.reviews,
                  reviews: [application.reviews, application.appId, application.country],
              }));

    const handleCountryChange = (newCountry) => {
        setCountry(newCountry);
    };

    const handleSearchChange = (event) => {
        setSearchQuery(event.target.value);
    };

    const handleSearchSubmit = (term = searchQuery) => {
        // If there is an existing search, cancel it before starting a new one
        if (abortController) {
            abortController.abort();
        }
        const newAbortController = new AbortController();
        const newTime = new Date();
        const timeISOString = newTime.toISOString();
        setAbortController(newAbortController);
        setIsLoading(true);
        setSearchError("");
        setQueryTime(timeISOString);
        axios
            .get(
                selectedScraper === "Play Store"
                    ? `/api/search?query=${encodeURIComponent(term)}&includePermissions=${includePermissions}&countryCode=${country}&time=${timeISOString}`
                    : `/ios/search?query=${encodeURIComponent(term)}&countryCode=${country}&time=${timeISOString}`, // Change to URL for app store scraper
                {
                    signal: newAbortController.signal,
                },
            )
            .then((response) => {
                flipState();
                // A new result set replaces whatever the previous download complained about.
                setDownloadError(false);
                setDisplayPermissions(includePermissions);
                setLastSearch({ term, country, includePermissions });
                setSearchResults(response.data.results);
                // Only set results text after getting search results
                setResultsText(term);
                setTotalCount(response.data.totalCount);
                setIsLoading(false);
            })
            .catch((error) => {
                if (axios.isCancel(error)) {
                    console.log("Request canceled:", error.message);
                } else {
                    console.error("Error fetching search results:", error);
                    setSearchError(
                        `Search for "${term}" failed: ${searchErrorReason(error)} ` +
                            "No apps may match this term, or the store may be busy. Try another term or try again later.",
                    );
                }
                setIsLoading(false);
            });
    };

    const handleCancel = (_event, reason) => {
        if (reason && reason === "backdropClick") return;
        abortController.abort();
        setIsLoading(false);
    };

    const handleKeyDown = (event) => {
        if (event.key === "Enter") {
            handleSearchSubmit();
        }
    };

    const handleChange = (event) => {
        setIncludePermissions(event.target.checked);
    };

    const handleDownloadAllResults = async () => {
        if (!lastSearch) return;
        // Clear any stale "download failed" alert before this attempt starts.
        setDownloadError(false);
        const { term, country: searchCountry, includePermissions: searchPermissions } = lastSearch;
        try {
            const response = await axios.get(
                selectedScraper === "Play Store"
                    ? `/api/download-csv?query=${encodeURIComponent(term)}&includePermissions=${searchPermissions}&countryCode=${searchCountry}`
                    : `/ios/download-csv?query=${encodeURIComponent(term)}&countryCode=${searchCountry}`, // Change to URL for app store scraper
                {
                    responseType: "blob", //handling the binary data
                    headers: {
                        // Include authorization tokens
                    },
                },
            );

            const relog_response = await axios.get(
                selectedScraper === "Play Store"
                    ? `/api/download-relog?query=${encodeURIComponent(term)}&includePermissions=${searchPermissions}&totalCount=${totalCount}&countryCode=${searchCountry}&store=${"Google Play Store"}`
                    : `/ios/download-relog?query=${encodeURIComponent(term)}&totalCount=${totalCount}&countryCode=${searchCountry}&store=${"iOS App Store"}`, // Change to URL for app store scraper
                {
                    responseType: "blob", //handling the binary data
                    headers: {
                        // Include authorization tokens
                    },
                },
            );

            // Extract the filename from the Content-Disposition header
            const contentDisposition = response.headers["content-disposition"];
            let filename = "download.csv";
            if (contentDisposition) {
                const filenameRegex = /filename\s*=\s*(["'])(.*?)\1/;
                const matches = filenameRegex.exec(contentDisposition);
                if (matches && matches[2]) {
                    filename = matches[2];
                }
            }
            console.log(`Filename from header: ${decodeURI(filename)}`);
            filename = decodeURI(filename);
            const filename_relog = filename.slice(0, -4) + "_relog.txt";
            const filename_zip = filename.slice(0, -4) + ".zip";
            console.log(`Relog filename from header: ${filename_relog}`);
            // Create a URL from the blob
            const csv_file = new Blob(["\ufeff", response.data], {
                type: "text/csv;charset=utf-8",
            });
            const relog_file = new Blob(["\ufeff", relog_response.data], {
                type: "text/plain;charset=utf-8",
            });
            const zip = new JSZip();
            zip.file(filename, csv_file);
            zip.file(filename_relog, relog_file);
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
        } catch (error) {
            console.error("Error fetching or downloading the file:", error);
            setDownloadError(true);
        }
    };

    const handleExampleSearchClick = (term) => {
        setSearchQuery(term);
        handleSearchSubmit(term);
    };

    useEffect(() => {
        setSearchResults([]);
        setDownloadError(false);
        setResultsText("");
        setSearchError("");
    }, [selectedScraper]);

    return (
        <div className="search-bar-container">
            <div className="search-and-button-container">
                <Dropdown handler={handleCountryChange} />
                <TextField
                    label="Scrape by keyword (e.g., puzzle games) or package name (e.g., com.facebook.katana)"
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
            <div className="search-bar-params">
                <Stack direction="row" justifyContent="flex-start" alignItems="center" spacing={3}>
                    {selectedScraper === "Play Store" && (
                        <div className="permissions-checkbox">
                            <Stack direction="row" justifyContent="flex-start" alignItems="center" spacing={0.1}>
                                <FormGroup>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                size="small"
                                                checked={includePermissions}
                                                onChange={handleChange}
                                            />
                                        }
                                        label={
                                            <React.Fragment>
                                                <Stack alignItems="center" direction="row" gap={0.3}>
                                                    Include permissions in scrape
                                                    <Tooltip title="It takes an additional 1-5 minutes to scrape the permissions that apps access (e.g, “read your contacts” and “take pictures and videos”)">
                                                        <InfoIcon fontSize="small" />
                                                    </Tooltip>
                                                </Stack>
                                            </React.Fragment>
                                        }
                                    />
                                </FormGroup>
                            </Stack>
                        </div>
                    )}
                </Stack>
            </div>

            <Loading
                open={isLoading}
                onCancel={handleCancel}
                searchQuery={searchQuery}
                country={country}
                permissions={includePermissions}
                time={queryTime} // this + other combos will be used as a unique identifier for queries
                selectedScraper={selectedScraper}
            />
            {searchError && (
                <Alert severity="error" className="search-error" onClose={() => setSearchError("")}>
                    {searchError}
                </Alert>
            )}
            {searchResults.length > 0 ? (
                <>
                    <div className="search-result-text">
                        <Typography variant="h5">Results for "{resultsText}"</Typography>
                    </div>
                    <div className="data-grid-container">
                        <DataGrid
                            rows={rows}
                            columns={
                                selectedScraper === "Play Store"
                                    ? displayPermissions
                                        ? Array.prototype.concat(columns, permissionColumns)
                                        : playStoreColumns
                                    : appStoreColumns
                            }
                            initialState={{
                                pagination: {
                                    paginationModel: { pageSize: 5 },
                                },
                            }}
                            pageSizeOptions={[5, 10, 25]}
                            disableColumnSelector
                            getRowId={(row) => row.appId}
                            disableRowSelectionOnClick
                        />
                        <div className="download-button-container">
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={handleDownloadAllResults}
                                className="download-button"
                            >
                                Download ({totalCount} Results + Reproducibility Log as ZIP)
                            </Button>
                        </div>
                        <Snackbar
                            open={downloadError}
                            autoHideDuration={6000}
                            onClose={() => setDownloadError(false)}
                            anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                        >
                            <Alert severity="error" onClose={() => setDownloadError(false)}>
                                The download failed. Please try the search again, then download.
                            </Alert>
                        </Snackbar>
                    </div>
                </>
            ) : resultsText ? (
                !isLoading && <NoResults />
            ) : (
                !isLoading && (
                    <div className="example-searches-container">
                        <div style={{ textAlign: "left" }}>
                            <ExampleSearches sampleSearch={sampleSearch} onExampleSearch={handleExampleSearchClick} />
                            <ExampleTopCharts selectedScraper={selectedScraper} />
                            <Typography variant="h5" className="no-search-message">
                                Example Research:{" "}
                            </Typography>
                            <Typography variant="body1" className="no-search-message">
                                <Link
                                    href="https://dl.acm.org/doi/10.1145/2556288.2557079"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Stawarz et al.
                                </Link>{" "}
                                (2014) reviewed the functionality and user reviews for 229 medication reminder apps
                            </Typography>
                            <Typography variant="body1" className="no-search-message">
                                <Link
                                    href="https://dl.acm.org/doi/10.1145/3290605.3300361"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Lyngs et al.
                                </Link>{" "}
                                (2019) coded the features in 96 digital self-control apps
                            </Typography>
                            <Typography variant="body1" className="no-search-message">
                                <Link
                                    href="https://dl.acm.org/doi/10.1145/3411764.3445500"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Spors et al.
                                </Link>{" "}
                                (2021) employed feminist content analysis to review the descriptions of 69 self-care
                                apps
                            </Typography>
                        </div>
                    </div>
                )
            )}
        </div>
    );
};

export default SearchBar;
