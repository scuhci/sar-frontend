import React from "react";
import { Button } from "@mui/material";

const ReloadButton = () => {
  return (
    <Button
      variant="contained"
      onClick={() => window.location.reload()}
      sx={{
        backgroundColor: '#1E88E5',
        color: '#FFFFFF',
        fontSize: '16px',
        width: '115px',
        height: '49px',
        textAlign: 'center',
        textTransform: 'none',
        '&:hover': {
          backgroundColor: '#1565C0',
        },
        marginBottom: '10px'
      }}
    >
      RELOAD
    </Button>
  );
}

export default ReloadButton
