import * as React from 'react';
import Box from '@mui/material/Box';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import RenderRow from "./RenderRow";

const ListBox = () => {
  return (
    <Box
      sx={{ width: '100%', height: 400, maxWidth: 360, bgcolor: 'background.paper' }}
    >
      <FixedSizeList
        height={400}
        width={360}
        itemSize={46}
        itemCount={200}
        overscanCount={5}
      >
        <RenderRow />
      </FixedSizeList>
    </Box>
  );
}
export default ListBox;
