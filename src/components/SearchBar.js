import React, { useState } from 'react';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import SearchIcon from '@mui/icons-material/Search';
import axios from 'axios';
import "../css/SearchBar.css"

const SearchBar = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const handleSearchChange = (event) => {
        setSearchQuery(event.target.value);
    };

    const handleSearchSubmit = () => {
        setIsLoading(true);
        axios
        .get(`https://sar-backend-url/search?query=${searchQuery}`)
        .then((response) => {
            setSearchResults(response.data);
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

    return (
        <div className="search-bar-container">
            <TextField
                label="Search App"
                variant="outlined"
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleKeyDown}
                fullWidth
                className="search-input"
            />
            <IconButton onClick={handleSearchSubmit} color="primary" disabled={isLoading}>
                <SearchIcon />
            </IconButton>
            {isLoading && <span className="loading-text">Loading...</span>}
            <ul className="search-results">
                {searchResults.map((result) => (
                    <li key={result.id} className="search-result-item">
                        {result.title}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default SearchBar;
