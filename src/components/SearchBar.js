import React, { useState } from 'react';
import { TextField, Button, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { DataGrid} from '@mui/x-data-grid';
import {SAR_BACKEND_URL} from '../constants/urlConstants';
import axios from 'axios';
import "../css/SearchBar.css"
import Loading from './Loading';
import ExampleSearches from './ExampleSearches';
import {columns} from '../constants/columns';
import { permissionColumns } from '../constants/permissionColumns';

// For the checkbox 
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Stack from '@mui/material/Stack';


const SearchBar = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [abortController, setAbortController] = useState(null);
    const [checked, setChecked] = React.useState(false);
    const sampleSearch = ["Meditation", "Self Care", "Children"];
    const [displayPermissions, setDisplayPermissions] = React.useState(false);

    const rows = displayPermissions ? (searchResults.map((application) => ({
      title: application.title,
      appId: application.appId,
      icon: application.icon,
      developer: application.developer,
      currency: application.currency,
      price: application.price,
      free: application.free,
      summary: application.summary,
      url: application.url,
      scoreText: application.scoreText,
      score: application.score,
      source: application.source,
      installs: application.installs,
      maxInstalls: application.maxInstalls,
      ratings: application.ratings,
      originalPrice: application.originalPrice,
      discountEndDate: application.discountEndDate,
      available: application.available,
      offersIAP: application.offersIAP,
      IAPRange: application.IAPRange,
      androidVersion: application.androidVersion,
      androidMaxVersion: application.androidMaxVersion,
      developerId: application.developerId,
      developerEmail: application.developerEmail,
      developerWebsite: application.developerWebsite,
      developerAddress: application.developerAddress,
      privacyPolicy: application.privacyPolicy,
      genre: application.genre,
      genreId: application.genreId,
      previewVideo: application.previewVideo,
      contentRating: application.contentRating,
      adSupported: application.adSupported,
      released: application.released,
      version: application.version,
      recentChanges: application.recentChanges,

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

    })).slice(0, 5)) : (searchResults.map((application) => ({

      title: application.title,
      appId: application.appId,
      icon: application.icon,
      developer: application.developer,
      currency: application.currency,
      price: application.price,
      free: application.free,
      summary: application.summary,
      url: application.url,
      scoreText: application.scoreText,
      score: application.score,
      source: application.source,
      installs: application.installs,
      maxInstalls: application.maxInstalls,
      ratings: application.ratings,
      originalPrice: application.originalPrice,
      discountEndDate: application.discountEndDate,
      available: application.available,
      offersIAP: application.offersIAP,
      IAPRange: application.IAPRange,
      androidVersion: application.androidVersion,
      androidMaxVersion: application.androidMaxVersion,
      developerId: application.developerId,
      developerEmail: application.developerEmail,
      developerWebsite: application.developerWebsite,
      developerAddress: application.developerAddress,
      privacyPolicy: application.privacyPolicy,
      genre: application.genre,
      genreId: application.genreId,
      previewVideo: application.previewVideo,
      contentRating: application.contentRating,
      adSupported: application.adSupported,
      released: application.released,
      version: application.version,
      recentChanges: application.recentChanges,})).slice(0, 5));

    const handleSearchChange = (event) => {
        setSearchQuery(event.target.value);
    };

    const handleSearchSubmit = (term = searchQuery) => {
      // If there is an existing search, cancel it before starting a new one
      if (abortController) {
        abortController.abort();
      }
  
      const newAbortController = new AbortController();
      setAbortController(newAbortController);
      
      setIsLoading(true);

      axios.get(`${SAR_BACKEND_URL}/search?query=${term}&includePermissions=${checked}`, {
        signal: newAbortController.signal
      })
      .then((response) => {
          if (checked) {
            setDisplayPermissions(true);
          }
          else {
            setDisplayPermissions(false);
          }
          setSearchResults(response.data.results);
          setTotalCount(response.data.totalCount);
          setIsLoading(false);
      })
      .catch((error) => {
          if (axios.isCancel(error)) {
            console.log('Request canceled:', error.message);
          } else {
            console.error('Error fetching search results:', error);
          }
          setIsLoading(false);
      });
    };

    const handleCancel = () => {
      abortController.abort();
      setIsLoading(false);
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
          handleSearchSubmit();
        }
    };

    const handleChange = () => {
      setChecked(!checked);
    }

    const handleDownloadAllResults = async () => {
        try {
            const response = await axios.get(`${SAR_BACKEND_URL}/download-csv`, {
                responseType: 'blob', //handling the binary data
                headers: {
                    // Include authorization tokens
                }
            });
            
            // Extract the filename from the Content-Disposition header
            const contentDisposition = response.headers['content-disposition'];
            let filename = 'download.csv';
            if (contentDisposition) {
              const filenameRegex = /filename\s*=\s*(["'])(.*?)\1/;
              const matches = filenameRegex.exec(contentDisposition);
              if (matches && matches[2]) { 
                  filename = matches[2];
              }
            }
            console.log(`Filename from header: ${filename}`);
    
            // Create a URL from the blob
            const url = window.URL.createObjectURL(new Blob([response.data]));
    
            // Create a link element, set the href to the blob URL, and trigger a download
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
    
            // Clean up and revoke the URL
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
    
        } catch (error) {
            console.error('Error fetching or downloading the file:', error);
        }
    };  

    const handleExampleSearchClick = (term) => {
      setSearchQuery(term);
      handleSearchSubmit(term);
    };

    //Making column header bold // this does not work
    /* const modifiedColumns = columns.map(column => ({
      ...column,
      renderHeader: (params) => (
        <span className="centeredHeader">
          <strong>{params.colDef.headerName || ''}</strong>
        </span>
      ),
      headerAlign: 'center'
    })); */

    return (
        <div className="search-bar-container">
            <div className="search-and-button-container">
                <TextField
                    label="Search App"
                    variant="outlined"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    onKeyDown={handleKeyDown}
                    
                    className="search-input"
                />
                <Button className="search-button" onClick={() => {handleSearchSubmit(searchQuery)}} variant="contained" color="primary" disabled={isLoading}>
                        Search <SearchIcon />
                </Button>
            </div>
            <div className='permissions-checkbox'>
              <Stack 
                direction="row" 
                justifyContent="flex-start"
                spacing={2}>
                  <FormGroup>
                    <FormControlLabel 
                    control={
                      <Checkbox
                      size="small"
                      checked={checked}
                      onChange={handleChange}
                      />} 
                    label="Show permissions" />
                  </FormGroup>
              </Stack>
            </div>
            <Loading open={isLoading} onCancel={handleCancel} searchQuery={searchQuery}/>
            {searchResults.length > 0 ? (
              <>
                <div className="search-result-text">
                  <Typography variant="h5">Results for "{searchQuery}"</Typography>
                  <Typography >Preview of first 5 out of {totalCount} results</Typography>
                </div>
                <div className="data-grid-container" style={{width: "100%"}}>
                  <div className="datagrid-left">
                    <DataGrid
                      rows={rows}
                      columns={displayPermissions ? permissionColumns : columns}
                      pageSize={5}
                      getRowId={(row) => row.appId}
                      disableRowSelectionOnClick
                      hideFooter
                    />
                    <div className="download-button-container">
                      <Button 
                        variant="contained" 
                        color="primary"
                        onClick={handleDownloadAllResults}
                        className="download-button"
                      >
                        Download All Results
                      </Button>
                    </div>
                  </div>
                  <div className="datagrid-right"></div>
                </div>
              </> 
              ) : (
                !isLoading && 
                ( <div className="example-searches-container">
                    <div style={{ textAlign: 'left' }}> 
                      <ExampleSearches 
                        sampleSearch={sampleSearch} 
                        onExampleSearch={handleExampleSearchClick}
                      />
                      <Typography variant="h5" className="no-search-message">Past research: </Typography>
                      <Typography variant="body1" className="no-search-message">
                        User searched for the keywords “Meditation”  and analyzed which apps require risky permissions
                      </Typography>
                      <Typography variant="body1" className="no-search-message">
                        User searched for the keywords “Self Care”  and analyzed which apps require risky permissions
                      </Typography>  
                    </div>
                  </div>  
                )
              )
            }
        </div>
    );
};

export default SearchBar;
