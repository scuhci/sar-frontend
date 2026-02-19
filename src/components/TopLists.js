import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../css/TopList.css";
import "../css/SearchBar.css";
import { Select, FormControl, MenuItem, InputLabel, Typography, Button } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import {
    gplayCategories,
    gplayCollections,
    gplayCategories_topfree,
    gplayCategories_toppaid,
    gplayCategories_topgrossing,
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

const gplayCategoriesByCollection = {
    TOP_FREE: gplayCategories_topfree,
    TOP_PAID: gplayCategories_toppaid,
    GROSSING: gplayCategories_topgrossing,
}

// zip
let JSZip = require("jszip");

const TopLists = ({ flipState }) => {
    const { selectedScraper } = useScraper();
    const [collection, setCollection] = useState("TOP_FREE");
    const [device, setDevice] = useState("MAC");
    const [category, setCategory] = useState("");
    const [country, setCountry] = useState("US");
    const [searchResults, setSearchResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [abortController, setAbortController] = useState(null);
    const [displayPermissions, setDisplayPermissions] = useState(false);
    const [showTable, setShowTable] = useState(false);
    const [includePermissions, setIncludePermissions] = useState(false);
    const [downloadQuery, setDownloadQuery] = useState("TOP_FREEUS");
    const [fullQuery, setFullQuery] = useState(["Top Free"]);

    const location = useLocation();
    //const navigate = useNavigate();

    useEffect(() => {
        console.log(selectedScraper);
        if (selectedScraper === "Play Store") {
            setCollection("TOP_FREE");
            setCategory("");
            setCountry("US");
        } else if (selectedScraper === "App Store") {
            setCollection("topmacapps");
            setCategory("");
            setCountry("US");
            setDevice("MAC");
        }
        setShowTable(false);
    }, [selectedScraper]);

    useEffect(() => {
        if (selectedScraper === "App Store") {
            if (device === "MAC") {
                setCollection("topmacapps");
            } else if (device === "IOS") {
                setCollection("newapplications");
            } else if (device === "IPAD") {
                setCollection("topfreeipadapplications");
            }
        }
    }, [device, selectedScraper]);

    useEffect(() => {
        if (location.state && location.state.collectionState) {
            setCollection(location.state.collectionState);
        }
    }, [location.state]);

    const rows =
        displayPermissions && selectedScraper === "Play Store"
            ? searchResults.map((application) => ({
                  ...application,
                  reviewsCount: application.reviews,
                  reviews: [application.reviews, application.appId, country],

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
                  reviews: [application.reviews, application.appId, country],
              }));

    const handleCategoryChange = (event) => {
        if (event.target) {
            setCategory(event.target.value);
        }
    };

    const handleCollectionChange = (event) => {
        if (event.target) {
            setCollection(event.target.value);
            setCategory("");
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
        }
    };

    const handleCancel = (_event, reason) => {
        if (reason && reason === "backdropClick") return;
        abortController.abort();
        setShowTable(false);
        setIsLoading(false);
    };

    const handlePermissionChange = () => {
        setIncludePermissions(!includePermissions);
    };

    const handleKeyDown = (event) => {
        if (event.key === "Enter") {
            handleTopListQuery();
        }
    };

    const getNameByCode = (list, code) => {
        const entry = list.find((item) => item.code === code);
        return entry ? (entry.code === "" ? "" : entry.name) : null;
    };

    const getIosCategoryByCode = (category, code) => {
        const entry = category.find((item) => item.code === code);
        return entry ? (entry.code === "" ? "" : entry.csvName) : null;
    };

    const handleTopListQuery = () => {
        if (abortController) {
            abortController.abort();
        }
        const newAbortController = new AbortController();
        setAbortController(newAbortController);

        setIsLoading(true);

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
                setDisplayPermissions(includePermissions);
                setShowTable(true);
                setSearchResults(response.data.results);
                setTotalCount(response.data.totalCount);
                setIsLoading(false);
            })
            .catch((error) => {
                if (axios.isCancel(error)) {
                    setShowTable(false);
                    console.log("Request canceled:", error.message);
                } else {
                    flipState();
                    setShowTable(true);
                    console.error("Error fetching top lists:", error);
                }
                setSearchResults([]);
                setTotalCount(0);
                setIsLoading(false);
                console.log(downloadQuery);
            });
        if (selectedScraper === "Play Store") {
                setFullQuery([
                    getNameByCode(gplayCollections, collection),
                    getNameByCode(gplayCategoriesByCollection[collection] ?? gplayCategories, category),  // ✅ Use filtered
                    getNameByCode(gplayCountries, country),
                ]);
            setDownloadQuery(collection.concat(category, country));
        } else {
            setFullQuery([
                getNameByCode(
                    iosCollections.filter((item) => item.device === device).flatMap((item) => item.collections),
                    collection,
                ),
                getNameByCode(iosCategoriesByCollection[collection] ?? iosCategories, category),
                getNameByCode(gplayCountries, country),
            ]);
            setDownloadQuery(
                collection.concat(
                    getIosCategoryByCode(iosCategoriesByCollection[collection] ?? iosCategories, category),
                    country,
                ),
            );
        }
    };

    const handleDownloadAllResults = async () => {
        try {
            const response = await axios.get(
                selectedScraper === "Play Store"
                    ? `/api/download-top-csv?query=${downloadQuery}&includePermissions=${includePermissions}`
                    : `/ios/download-top-csv?query=${downloadQuery}&includePermissions=${includePermissions}`,
                {
                    responseType: "blob", //handling the binary data
                    headers: {
                        // Include authorization tokens
                    },
                },
            );

            const relog_response = await axios.get(
                selectedScraper === "Play Store"
                    ? `/api/download-top-relog?collection=${fullQuery[0]}&category=${fullQuery[1]}&country=${fullQuery[2]}&includePermissions=${includePermissions}&totalCount=${totalCount}`
                    : `/ios/download-top-relog?collection=${fullQuery[0]}&category=${fullQuery[1]}&country=${
                          fullQuery[2]
                      }&device=${getNameByCode(
                          iosDevices,
                          device,
                      )}&includePermissions=${includePermissions}&totalCount=${totalCount}`,
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
            console.error("Error fetching or downloading the file:", error);
        }
    };

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
                        {(selectedScraper === "Play Store" ? gplayCountries : gplayCountries).map(
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
                            ? (gplayCategoriesByCollection[collection] ?? gplayCategories)
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
                    onKeyDown={handleKeyDown}
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
                country={getNameByCode(gplayCountries, country)}
                collection={getNameByCode(gplayCollections, collection)}
                category={getNameByCode(gplayCategoriesByCollection[collection] ?? gplayCategories, category)}
            />
            {showTable &&
                (totalCount > 0 ? (
                    <>
                        <div className="search-result-text">
                            {totalCount === 1 ? (
                                <Typography variant="h5">
                                    {totalCount} Result for {fullQuery[0]} {fullQuery[1]} Apps in {fullQuery[2]}
                                </Typography>
                            ) : (
                                <Typography variant="h5">
                                    {totalCount} Results for {fullQuery[0]} {fullQuery[1]} Apps in {fullQuery[2]}
                                </Typography>
                            )}
                        </div>
                        <div className="data-grid-container">
                            {/** Automaticaly sort by review count */}
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
                        </div>
                    </>
                ) : (
                    <NoResults />
                ))}
        </div>
    );
};

export default TopLists;
