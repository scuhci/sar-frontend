import React, { useState } from 'react';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import SearchIcon from '@mui/icons-material/Search';
import axios from 'axios';

import Avatar from '@mui/material/Avatar';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';

import "../css/SearchBar.css"
import { SAR_BACKEND_URL } from '../constants/urlConstants';

const SearchBar = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [expandedId, setExpandedId] = useState(null)

    const handleSearchChange = (event) => {
        setSearchQuery(event.target.value);
    };

    const handleSearchSubmit = () => {
        setIsLoading(true);
        axios
        .get(`${SAR_BACKEND_URL}/search?query=${searchQuery}`)
        .then((response) => {
            setSearchResults(response.data.results);
            console.log(response.data.results);
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

    const handleExpandClick = (applicationId) => {
        setExpandedId(expandedId === applicationId ? null : applicationId);
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
            <List>
            {searchResults.map((application) => (
            <React.Fragment>    
                <ListItem key={application.appId}>
                    <ListItemAvatar>
                        <Avatar src={application.icon} alt={application.title} />
                    </ListItemAvatar>
                    <ListItemText primary={application.title} secondary={application.developer} />
                    <ListItemSecondaryAction>
                        <IconButton
                            edge="end"
                            aria-label="expand"
                            onClick={() => handleExpandClick(application.appId)}
                        >
                            <ExpandMoreIcon
                                rotate={expandedId === application.appId ? 180 : 0}
                                color="primary"
                            />
                        </IconButton>
                    </ListItemSecondaryAction>
                </ListItem>
                <Collapse in={expandedId === application.appId} timeout="auto" unmountOnExit>
                    <Typography variant="body2" color="textSecondary" component="div">
                        {/* Additional details to display when expanded */}
                        <div>{application.currentVersionScore}</div>
                        <div>{application.currency}</div>
                        {/* Add more details as needed */}
                    </Typography>
                </Collapse>
            </React.Fragment>
            ))}
            </List>
        </div>
    );
};

export default SearchBar;
