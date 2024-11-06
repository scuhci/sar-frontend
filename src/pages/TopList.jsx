import React, {useState} from 'react';
import { Select, FormControl, MenuItem, InputLabel, Box, Typography, Button } from '@mui/material';
import { gplayCategories } from '../constants/topListCategories';
import axios from "axios";

const TopList = () => {  
  const [collection, setCollection] = useState('TOP_FREE');
  const [category, setCategory] = useState('APPLICATION');
  const [fullDetail, setFullDetail] = useState(false);
  const [abortController, setAbortController] = useState(null);

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

  const handleToggleFullDetail = () => {
    setFullDetail(!fullDetail);
  };

  const handleTopListQuery = async () => {
    try {
      if (abortController) {
        abortController.abort();
      }
      const newAbortController = new AbortController();
      setAbortController(newAbortController);
      
      console.log("top lists query")
      const response = await axios
        .get(
          `/toplists?collection=${collection}&category=${category}`,
          {
            signal: newAbortController.signal,
          }
        )
      console.log(response.data.totalCount);
      console.log(response.data.results);
    } catch (error) {
      console.error('Error fetching top lists', error);
    }
  };

  return (
    <Box sx={{ minWidth: 120, maxWidth: 500}}>
    <FormControl fullWidth>
      <InputLabel id="collection">Collection</InputLabel>
      <Select
      labelId="collection-label"
      id="collection"
      value={collection}
      label="collection"
      onChange={handleCollectionChange}
      >
      <MenuItem value={'TOP_FREE'}>TOP FREE</MenuItem>
      <MenuItem value={'TOP_PAID'}>TOP PAID</MenuItem>
      <MenuItem value={'GROSSING'}>GROSSING</MenuItem>
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
    <Typography variant="h5">
          Query Top Lists:
    </Typography>
    <Button 
        className="example-search-button" 
        onClick={handleTopListQuery}>
        Search
    </Button>
    </Box>
  );
}


export default TopList;