import React from 'react';
import { Dialog, DialogContent, DialogContentText, LinearProgress, Button, DialogActions, Backdrop } from '@mui/material';
import { useTheme } from '@mui/material/styles';

function Loading({ open, onCancel, searchQuery }) {
    const theme = useTheme();

    return (
        <Dialog open={open} onClose={onCancel} aria-labelledby="loading-dialog-title" PaperProps={{
            style: {
              backgroundColor: 'white'
            },
          }}>
            <DialogContent>
                <DialogContentText id="loading-dialog-title" style={{ margin: 0, fontWeight: 'bold' }}>
                    Searching{searchQuery ? ` for "${searchQuery}"`: ''}...
                </DialogContentText>
                <DialogContentText style={{ fontSize: '0.8rem' }}>
                    On average, searches take 1-5 minutes
                </DialogContentText>
                <LinearProgress style={{ marginTop: theme.spacing(2), marginBottom: theme.spacing(1) }} />
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel} color="primary" style={{ fontWeight: 'bold' }}>Cancel</Button>
            </DialogActions>
            <Backdrop 
                style={{ zIndex: theme.zIndex.drawer + 1, color: '#fff' }}
                open={open}
            />
        </Dialog>
    );
}

export default Loading;