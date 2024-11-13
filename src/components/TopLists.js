import React, {useState} from 'react';
import '../css/TopList.css';
import { Select, FormControl, MenuItem, InputLabel, Typography, Button } from '@mui/material';
import { DataGrid } from "@mui/x-data-grid";
import { gplayCategories, gplayCollections } from '../constants/topListCategories';
import { countrycode_list } from '../constants/countryCodes';
import axios from "axios";
import { columns } from "../constants/columns";
import { permissionColumns } from "../constants/permissionColumns";
import "../css/SearchBar.css";
import Loading from "./Loading";

const TopLists = ({flipState}) => {  
  const [collection, setCollection] = useState('TOP_FREE');
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('US');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [abortController, setAbortController] = useState(null);
  const [displayPermissions, setDisplayPermissions] = useState(false);
  const [showTable, setShowTable] = useState(false);

  const rows = displayPermissions
    ? searchResults
        .map((application) => ({
          ...application,
          reviewsCount: application.reviews,
          reviews: [application.reviews, application.appId],

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
    : searchResults
        .map((application) => ({
          ...application,
          reviewsCount: application.reviews,
          reviews: [application.reviews, application.appId],
        }))

  const handleCategoryChange = (event) => {
    if (event.target) {
      setCategory(event.target.value);
      console.log(event.target.value);
    }
  };

  const handleCollectionChange = (event) => {
    if (event.target) {
      setCollection(event.target.value);
      console.log(event.target.value);
    }
  };

  const handleCountryChange = (event) => {
    if (event.target) {
      setCountry(event.target.value);
      console.log(event.target.value);
    }
  };

  const handleCancel = () => {
    abortController.abort();
    setShowTable(false);
    setIsLoading(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      handleTopListQuery();
    }
  };

  const getNameByCode = (list, code) => {
    const entry = list.find(item => item.code === code);
    return entry ? entry.name : null;
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
        `/toplists?collection=${collection}&category=${category}&country=${country}`,
        {
          signal: newAbortController.signal,
        }
      )
      .then((response) => {
        flipState()
        setShowTable(true);
        setSearchResults(response.data.results);
        setTotalCount(response.data.totalCount);
        setIsLoading(false);
      })
      .catch((error) => {
        if (axios.isCancel(error)) {
          console.log("Request canceled:", error.message);
          setShowTable(false);
        } else {
          console.error("Error fetching top lists:", error);
          setShowTable(true);
        }
        setSearchResults([]);
        setTotalCount(0);
        setIsLoading(false);
      });
  };

  return (
    <div className='toplist-container'>
      <div className='toplist-search-button-container'>
        <FormControl fullWidth>
          <InputLabel id="country">Country*</InputLabel>
          <Select
          labelId="country-label"
          id="country"
          value={country}
          label="country"
          onChange={handleCountryChange}
          > 
            {countrycode_list.map(({code, name}, index) => (
                <MenuItem key={index} value={code}>
                  {name}
                </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel id="collection">Collection*</InputLabel>
          <Select
          labelId="collection-label"
          id="collection"
          value={collection}
          label="collection"
          onChange={handleCollectionChange}
          >
          <MenuItem value={'TOP_FREE'}>Top Free</MenuItem>
          <MenuItem value={'TOP_PAID'}>Top Paid</MenuItem>
          <MenuItem value={'GROSSING'}>Top Grossing</MenuItem>
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel id="category">Category</InputLabel>
          <Select
          labelId="category-label"
          id="category"
          value={category}
          label="category"
          onChange={handleCategoryChange}
          > 
            {gplayCategories.map(({code, name}, index) => (
                <MenuItem key={index} value={code}>
                  {name}
                </MenuItem>
            ))}
          </Select>
        </FormControl>
        <div className="toplist-search-button-container">
          <Button 
            className="search-button" 
            variant="contained" 
            color="primary"
            onClick={handleTopListQuery}
            onKeyDown={handleKeyDown}>
            Search
          </Button>
        </div>
      </div>
      <Loading open={isLoading} onCancel={handleCancel} searchQuery={"hello"}/>
      { showTable && (
        <>
        <div className="search-result-text">
            {totalCount === 1 ? (<Typography variant="h5">{totalCount} Result for {getNameByCode(gplayCollections, collection)} {getNameByCode(gplayCategories, category)} in {getNameByCode(countrycode_list, country)}</Typography>) :
            (<Typography variant="h5">{totalCount} Results for {getNameByCode(gplayCollections, collection)} {getNameByCode(gplayCategories, category)} in {getNameByCode(countrycode_list, country)}</Typography>)}
        </div>
        <div className="data-grid-container">
            <DataGrid
            rows={rows}
            columns={displayPermissions ? Array.prototype.concat(columns, permissionColumns) : columns}
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
        </div>
        </>
        )
      }
    </div>
  );
}


export default TopLists;