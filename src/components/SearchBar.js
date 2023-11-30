import React, { useState } from 'react';
import { TextField, IconButton, Button, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { DataGrid } from '@mui/x-data-grid';
import Avatar from '@mui/material/Avatar';
import {SAR_BACKEND_URL} from '../constants/urlConstants';
import axios from 'axios';
import "../css/SearchBar.css"
import Loading from './Loading';

const SearchBar = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [totalCount, setTotalCount] = useState(0);

    const columns = [
      { field: 'id', headerName: 'ID', width: 100 },
      { field: 'icon', headerName: 'Icon', width: 100, renderCell: (params) => <Avatar src={params.value} alt="Icon" /> },
      { field: 'title', headerName: 'Title', width: 200 },
      { field: 'developer', headerName: 'Developer', width: 200 },
      { field: 'summary', headerName: 'Summary', width: 200 },
      { field: 'score', headerName: 'Score', width: 200 },
      { field: 'category', headerName: 'Category', width: 200 },
      { field: 'installs', headerName: 'Installs', width: 200 }
    ];

    const rows = searchResults.map((application) => ({
      id: application.appId,
      icon: application.icon,
      title: application.title,
      developer: application.developer,
      summary: application.summary,
      score: application.score,
      currency: application.currency,
      category: application.category,
      installs: application.installs
    })).slice(0, 5);

    const handleSearchChange = (event) => {
        setSearchQuery(event.target.value);
    };

    const handleSearchSubmit = () => {
        setIsLoading(true);
        axios
        .get(`${SAR_BACKEND_URL}/search?query=${searchQuery}`)
        .then((response) => {
            setSearchResults(response.data.results);
            setTotalCount(response.data.totalCount)
            setIsLoading(false);
        })
        .catch((error) => {
            console.error('Error fetching search results:', error);
            setIsLoading(false);
        });
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
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(contentDisposition);
                if (matches != null && matches[1]) { 
                  filename = matches[1].replace(/['"]/g, '');
                }
            }
    
            // Create a URL from the blob
            const url = window.URL.createObjectURL(new Blob([response.data]));
    
            // Create a link element, set the href to the blob URL, and trigger a download
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
    
            // Clean up and revoke the URL
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);
    
        } catch (error) {
            console.error('Error fetching or downloading the file:', error);
        }
    };    
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
            {isLoading && <Loading open={isLoading} searchQuery={searchQuery}/>}
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
                      getRowId={(row) => row.id}
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
                      <Typography variant="h5" className="no-search-message">
                          Example Searches:
                      </Typography>
                      <Typography variant="body1" className="no-search-message">
                          Meditation, Self care, Children
                      </Typography>
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
