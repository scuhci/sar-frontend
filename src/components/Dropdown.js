import * as React from 'react';
import PropTypes from 'prop-types';
import { Autocomplete as BaseAutocomplete, TextField } from '@mui/material';
import { styled } from '@mui/system';
import { gplayCountries, iosCountries } from "../constants/countryCodes";

export default function Dropdown({ handler }) {
  const defaultOption = { name: 'United States', code: "US" };
  const [value, setValue] = React.useState(defaultOption);
  const [isEditing, setIsEditing] = React.useState(false);

  React.useEffect(() => {
    if (!isEditing) {
      handler(value?.code || defaultOption.code);
    }
  }, [value, handler, defaultOption.code, isEditing]);

  const handleChange = (event, newValue) => {
    if (!isEditing) {
      setValue(newValue || defaultOption);
    } else {
      setValue(newValue);
    }
  };

  // Handle focus and blur events
  const handleFocus = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
  };

  return (
    <Autocomplete
      options={options}
      getOptionLabel={(option) => option.name} // Specify label to display
      value={value}
      disableClearable
      onChange={handleChange}
      isOptionEqualToValue={(option, value) => option.code === value.code} // Compare by 'Code'
      renderInput={(params) => (
        <TextField
          {...params}
          label="Country"
          onFocus={handleFocus}   // Mark as editing when focused
          onBlur={handleBlur}     // Mark as not editing when blurred
        />
      )}
      sx={{ width: '200px' }}
    />
  );
}

const options = gplayCountries.map((country) => {
  return { name: country.name, code: country.code };
});

const Autocomplete = React.forwardRef(function CustomAutocomplete(props, ref) {
  return <BaseAutocomplete {...props} ref={ref} />;
});

Autocomplete.propTypes = {
  options: PropTypes.array.isRequired,
};

const StyledAutocomplete = styled(BaseAutocomplete)`
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 0.875rem;
  box-sizing: border-box;
  padding: 8px 12px;
  border-radius: 8px;
  text-align: left;
  line-height: 1.5;
  background: #fff;
  border: 1px solid #ccc;
  color: #000;
`;
