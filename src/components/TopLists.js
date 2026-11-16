import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import "../css/TopList.css";
import "../css/SearchBar.css";
import { Select, FormControl, MenuItem, InputLabel, Typography, Button, Alert } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import {
    gplayCategories,
    gplayCollections,
    iosCategories,
    iosCollections,
    iosDevices,
    iosCategories_topmacapps,
    iosCategories_topfreemacapps,
    iosCategories_topgrossingmacapps,
    iosCategories_toppaidmacapps,
    iosCategories_newapplications,
    iosCategories_newfreeapplications,
    iosCategories_newpaidapplications,
    iosCategories_topfreeapplications,
    iosCategories_toppaidapplications,
    iosCategories_topgrossingapplications,
    iosCategories_topfreeipadapplications,
    iosCategories_toppaidipadapplications,
    iosCategories_topgrossingipadapplications,
} from "../constants/topListCategories";
// eslint-disable-next-line no-unused-vars
import { gplayCountries, iosCountries } from "../constants/countryCodes";
import axios from "axios";
import { columns, playStoreColumns, appStoreColumns } from "../constants/columns";
import { permissionColumns } from "../constants/permissionColumns";
import LoadingTopLists from "./LoadingTopLists";
import NoResults from "./NoResults";
import { useScraper } from "../components/SelectedScraperProvider";

// For the checkbox
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Stack from "@mui/material/Stack";

//Tooltip
import InfoIcon from "@mui/icons-material/Info";
import { Tooltip } from "@mui/material";

const iosCategoriesByCollection = {
    topmacapps: iosCategories_topmacapps,
    topfreemacapps: iosCategories_topfreemacapps,
    topgrossingmacapps: iosCategories_topgrossingmacapps,
    toppaidmacapps: iosCategories_toppaidmacapps,
    newapplications: iosCategories_newapplications,
    newfreeapplications: iosCategories_newfreeapplications,
    newpaidapplications: iosCategories_newpaidapplications,
    topfreeapplications: iosCategories_topfreeapplications,
    toppaidapplications: iosCategories_toppaidapplications,
    topgrossingapplications: iosCategories_topgrossingapplications,
    topfreeipadapplications: iosCategories_topfreeipadapplications,
    toppaidipadapplications: iosCategories_toppaidipadapplications,
    topgrossingipadapplications: iosCategories_topgrossingipadapplications,
};

// Device ("MAC" | "IOS" | "IPAD") an App Store collection belongs to, or undefined for Play collections.
const getIosDeviceForCollection = (collectionCode) =>
    iosCollections.find((item) => item.collections.some(({ code }) => code === collectionCode))?.device;

// "Top Free Social Apps" on the Play Store. App Store collection names already end in "Apps"
// ("Top Free iOS Apps"), so fold the category in ("Top Free iOS Games Apps") instead of repeating it.
const describeApps = (collectionName, categoryName) =>
    [(collectionName ?? "").trim().replace(/ Apps$/, ""), categoryName, "Apps"].filter(Boolean).join(" ");

// Top Mac Apps, Top Paid Mac Apps and Top Grossing Mac Apps have no "No Category" chart, so those
// collections start on their first category instead of an empty one the store cannot serve.
const defaultCategoryFor = (collectionCode) => {
    const categories = iosCategoriesByCollection[collectionCode] ?? iosCategories;
    return categories.some(({ code }) => code === "") ? "" : categories[0].code;
};

const defaultIosCollectionByDevice = {
    MAC: "topmacapps",
    IOS: "topfreeapplications",
    IPAD: "topfreeipadapplications",
};

// A short reason for a failed request: the backend's own message when it sent one.
const requestErrorReason = (status, message) => {
    if (!status) return "Could not reach the server.";
    if (status === 504) return "The request took too long.";
    if (typeof message === "string" && message.trim()) return message.trim();
    return `The server returned status ${status}.`;
};

// zip
let JSZip = require("jszip");

const TopLists = ({ flipState }) => {
    const { selectedScraper } = useScraper();
    // Apple has a storefront in only some of the countries Google Play serves
    const countries = selectedScraper === "Play Store" ? gplayCountries : iosCountries;
    const [collection, setCollection] = useState("TOP_FREE");
    const [device, setDevice] = useState("IOS");
    const [category, setCategory] = useState("");
    const [country, setCountry] = useState("US");
    const [searchResults, setSearchResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [abortController, setAbortController] = useState(null);
    const [showTable, setShowTable] = useState(false);
    const [chartError, setChartError] = useState("");
    const [downloadError, setDownloadError] = useState("");
    const [includePermissions, setIncludePermissions] = useState(false);
    // The search the chart on screen came from; the heading, download, relog and row actions read this, not the live form.
    const [shownQuery, setShownQuery] = useState({
        labels: ["Top Free"],
        downloadQuery: "TOP_FREEUS",
        country: "US",
        deviceName: "",
        includePermissions: false,
    });

    const location = useLocation();
    //const navigate = useNavigate();

    useEffect(() => {
        console.log(selectedScraper);
        if (selectedScraper === "Play Store") {
            setCollection("TOP_FREE");
            setCategory("");
            setCountry("US");
        } else if (selectedScraper === "App Store") {
            setCollection("topfreeapplications");
            setCategory("");
            setCountry("US");
            setDevice("IOS");
        }
        setIncludePermissions(false);
        setShowTable(false);
        setChartError("");
        setDownloadError("");
    }, [selectedScraper]);

    useEffect(() => {
        const handedIn = location.state && location.state.collectionState;
        if (!handedIn) return;
        // Router state outlives a store switch (Back/Forward), so only take a collection the selected store has
        if (selectedScraper === "Play Store") {
            if (gplayCollections.some(({ code }) => code === handedIn)) {
                setCollection(handedIn);
            }
        } else if (selectedScraper === "App Store") {
            // Keep the device in step with an App Store collection handed in from Home
            const collectionDevice = getIosDeviceForCollection(handedIn);
            if (collectionDevice) {
                setCollection(handedIn);
                setDevice(collectionDevice);
                setCategory(defaultCategoryFor(handedIn));
            }
        }
    }, [location.state, selectedScraper]);

    const rows =
        shownQuery.includePermissions && selectedScraper === "Play Store"
            ? searchResults.map((application) => ({
                  ...application,
                  reviewsCount: application.reviews,
                  reviews: [application.reviews, application.appId, shownQuery.country],

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
                  reviews: [application.reviews, application.appId, shownQuery.country],
              }));

    const handleCategoryChange = (event) => {
        if (event.target) {
            setCategory(event.target.value);
        }
    };

    const handleCollectionChange = (event) => {
        if (event.target) {
            setCollection(event.target.value);
            setCategory(defaultCategoryFor(event.target.value));
        }
    };

    const handleCountryChange = (event) => {
        if (event.target) {
            setCountry(event.target.value);
        }
    };

    const handleDeviceChange = (event) => {
        if (event.target) {
            setDevice(event.target.value);
            setCollection(defaultIosCollectionByDevice[event.target.value]);
            setCategory(defaultCategoryFor(defaultIosCollectionByDevice[event.target.value]));
        }
    };

    const handleCancel = (_event, reason) => {
        if (reason && reason === "backdropClick") return;
        // Only the pending request is dropped; a chart already on screen stays
        abortController.abort();
        setIsLoading(false);
    };

    const handlePermissionChange = () => {
        setIncludePermissions(!includePermissions);
    };

    const getNameByCode = (list, code) => {
        const entry = list.find((item) => item.code === code);
        return entry ? (entry.code === "" ? "" : entry.name) : null;
    };

    const getIosCategoryByCode = (category, code) => {
        const entry = category.find((item) => item.code === code);
        return entry ? (entry.code === "" ? "" : entry.csvName) : null;
    };

    const currentQuery = () => {
        if (selectedScraper === "Play Store") {
            return {
                labels: [
                    getNameByCode(gplayCollections, collection),
                    getNameByCode(gplayCategories, category),
                    getNameByCode(countries, country),
                ],
                downloadQuery: collection.concat(category, country),
                country,
                deviceName: getNameByCode(iosDevices, device),
                includePermissions,
            };
        }
        return {
            labels: [
                getNameByCode(
                    iosCollections.filter((item) => item.device === device).flatMap((item) => item.collections),
                    collection,
                ),
                getNameByCode(iosCategoriesByCollection[collection] ?? iosCategories, category),
                getNameByCode(countries, country),
            ],
            downloadQuery: collection.concat(
                getIosCategoryByCode(iosCategoriesByCollection[collection] ?? iosCategories, category),
                country,
            ),
            country,
            deviceName: getNameByCode(iosDevices, device),
            includePermissions,
        };
    };

    const handleTopListQuery = () => {
        const sent = currentQuery();
        if (abortController) {
            abortController.abort();
        }
        const newAbortController = new AbortController();
        setAbortController(newAbortController);

        setIsLoading(true);
        setChartError("");

        axios
            .get(
                selectedScraper === "Play Store"
                    ? `/api/toplists?collection=${collection}&category=${category}&country=${country}&includePermissions=${includePermissions}`
                    : `/ios/toplists?collection=${collection}&category=${category}&categoryName=${getIosCategoryByCode(
                          iosCategoriesByCollection[collection] ?? iosCategories,
                          category,
                      )}&country=${country}&includePermissions=${includePermissions}`,
                {
                    signal: newAbortController.signal,
                },
            )
            .then((response) => {
                flipState();
                setDownloadError("");
                setShownQuery(sent);
                setShowTable(true);
                setSearchResults(response.data.results);
                setTotalCount(response.data.totalCount);
                setIsLoading(false);
            })
            .catch((error) => {
                if (axios.isCancel(error)) {
                    console.log("Request canceled:", error.message);
                } else {
                    flipState();
                    setShowTable(false);
                    setSearchResults([]);
                    setTotalCount(0);
                    setChartError(
                        `Top Charts request failed: ${requestErrorReason(
                            error.response?.status,
                            error.response?.data?.error,
                        )} No chart was returned, so this is not an empty chart. Please try again.`,
                    );
                    console.error("Error fetching top lists:", error);
                }
                setIsLoading(false);
            });
    };

    const handleDownloadAllResults = async () => {
        setDownloadError("");
        try {
            const response = await axios.get(
                selectedScraper === "Play Store"
                    ? `/api/download-top-csv?query=${shownQuery.downloadQuery}&includePermissions=${shownQuery.includePermissions}`
                    : `/ios/download-top-csv?query=${shownQuery.downloadQuery}&includePermissions=${shownQuery.includePermissions}`,
                {
                    responseType: "blob", //handling the binary data
                    headers: {
                        // Include authorization tokens
                    },
                },
            );

            const relog_response = await axios.get(
                selectedScraper === "Play Store"
                    ? `/api/download-top-relog?collection=${shownQuery.labels[0]}&category=${shownQuery.labels[1]}&country=${shownQuery.labels[2]}&includePermissions=${shownQuery.includePermissions}&totalCount=${totalCount}`
                    : `/ios/download-top-relog?collection=${shownQuery.labels[0]}&category=${shownQuery.labels[1]}&country=${
                          shownQuery.labels[2]
                      }&device=${shownQuery.deviceName}&includePermissions=${shownQuery.includePermissions}&totalCount=${totalCount}`,
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
            console.log(`Filename from header: ${filename}`);
            const filename_relog = filename.slice(0, -4) + "_relog.txt";
            const filename_zip = filename.slice(0, -4) + ".zip";
            console.log(`Relog filename from header: ${filename_relog}`);
            // Create a URL from the blob
            const csv_file = new Blob([response.data]);
            const relog_file = new Blob([relog_response.data]);
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
            let message = "";
            try {
                const data = error.response?.data;
                const text = data && typeof data.text === "function" ? await data.text() : null;
                message = (text ? JSON.parse(text) : data)?.error ?? "";
            } catch {
                message = "";
            }
            setDownloadError(
                `Download failed: ${requestErrorReason(
                    error.response?.status,
                    message,
                )} Search this chart again, then download.`,
            );
            console.error("Error fetching or downloading the file:", error);
        }
    };

    const pending = currentQuery();

    return (
        <div className="toplist-container">
            <div className="toplist-search-button-container">
                <FormControl fullWidth>
                    <InputLabel id="country">Country*</InputLabel>
                    <Select
                        labelId="country-label"
                        id="country"
                        value={country}
                        label="country"
                        onChange={handleCountryChange}
                    >
                        {countries.map(
                            ({ code, name }, index) => (
                                <MenuItem key={index} value={code}>
                                    {name}
                                </MenuItem>
                            ),
                        )}
                    </Select>
                </FormControl>
                {selectedScraper === "App Store" && (
                    <>
                        <FormControl
                            fullWidth
                            sx={{
                                width: "50%",
                            }}
                        >
                            <InputLabel id="device">Device*</InputLabel>
                            <Select
                                labelId="device-label"
                                id="device"
                                value={device}
                                label="device"
                                onChange={handleDeviceChange}
                            >
                                {iosDevices.map(({ code, name }, index) => (
                                    <MenuItem key={index} value={code}>
                                        {name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </>
                )}
                <FormControl fullWidth>
                    <InputLabel id="collection">Collection*</InputLabel>
                    <Select
                        labelId="collection-label"
                        id="collection"
                        value={collection}
                        label="collection"
                        onChange={handleCollectionChange}
                    >
                        {(selectedScraper === "Play Store"
                            ? gplayCollections
                            : iosCollections
                                  .filter((item) => item.device === device)
                                  .flatMap((item) => item.collections)
                        ).map(({ code, name }, index) => (
                            <MenuItem key={index} value={code}>
                                {name}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <FormControl fullWidth>
                    <InputLabel id="category">Category*</InputLabel>
                    <Select
                        labelId="category-label"
                        id="category"
                        value={category}
                        label="category"
                        onChange={handleCategoryChange}
                    >
                        {(selectedScraper === "Play Store"
                            ? gplayCategories
                            : (iosCategoriesByCollection[collection] ?? iosCategories)
                        ).map(({ code, name }, index) => (
                            <MenuItem key={index} value={code}>
                                {name}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <Button
                    className="toplist-search-button"
                    variant="contained"
                    color="primary"
                    onClick={handleTopListQuery}
                >
                    Search
                </Button>
            </div>
            {selectedScraper === "Play Store" && (
                <div className="permissions-checkbox">
                    <Stack direction="row" justifyContent="flex-start" alignItems="center" spacing={0.1}>
                        <FormGroup>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        size="small"
                                        checked={includePermissions}
                                        onChange={handlePermissionChange}
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
            <LoadingTopLists
                open={isLoading}
                onCancel={handleCancel}
                country={pending.labels[2]}
                apps={describeApps(pending.labels[0], pending.labels[1])}
            />
            {chartError && (
                <Alert severity="error" onClose={() => setChartError("")}>
                    {chartError}
                </Alert>
            )}
            {showTable &&
                (totalCount > 0 ? (
                    <>
                        <div className="search-result-text">
                            {totalCount === 1 ? (
                                <Typography variant="h5">
                                    {totalCount} Result for {describeApps(shownQuery.labels[0], shownQuery.labels[1])} in {shownQuery.labels[2]}
                                </Typography>
                            ) : (
                                <Typography variant="h5">
                                    {totalCount} Results for {describeApps(shownQuery.labels[0], shownQuery.labels[1])} in {shownQuery.labels[2]}
                                </Typography>
                            )}
                        </div>
                        <div className="data-grid-container">
                            {/** Automaticaly sort by review count */}
                            <DataGrid
                                rows={rows}
                                columns={
                                    selectedScraper === "Play Store"
                                        ? shownQuery.includePermissions
                                            ? Array.prototype.concat(columns, permissionColumns)
                                            : playStoreColumns
                                        : appStoreColumns
                                }
                                initialState={{
                                    pagination: {
                                        paginationModel: { pageSize: 5 },
                                    },
                                    sorting: {
                                        sortModel: [{ field: "reviewsCount", sort: "desc" }],
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
                            {downloadError && (
                                <Alert severity="error" onClose={() => setDownloadError("")}>
                                    {downloadError}
                                </Alert>
                            )}
                        </div>
                    </>
                ) : (
                    <NoResults />
                ))}
        </div>
    );
};

export default TopLists;
