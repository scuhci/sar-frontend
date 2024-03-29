import React, { useState } from 'react';
import { TextField, Button, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { DataGrid } from '@mui/x-data-grid';
import {SAR_BACKEND_URL} from '../constants/urlConstants';
import axios from 'axios';
import "../css/SearchBar.css"
import Loading from './Loading';
import ExampleSearches from './ExampleSearches';
import {columns} from '../constants/columns'

const SearchBar = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [abortController, setAbortController] = useState(null);

    const sampleSearch = ["Meditation", "Self Care", "Children"];

    const rows = searchResults.map((application) => ({
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
    })).slice(0, 5);


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
  
      axios.get(`${SAR_BACKEND_URL}/search?query=${term}`, {
        signal: newAbortController.signal
      })
      .then((response) => {
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
                <Button className="search-button" onClick={handleSearchSubmit} variant="contained" color="primary" disabled={isLoading}>
                        Search <SearchIcon />
                </Button>
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
                      columns={columns}
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
