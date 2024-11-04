import React, { useState } from 'react';
import Button from '@mui/material/Button';
import { Tooltip } from '@mui/material';
import ReviewsLoading from './ReviewsLoading';
import axios from 'axios';

const DownloadReviews = (appId) => {
    const [isLoading, setIsLoading] = useState(false);
    const [abortController, setAbortController] = useState(null);

    const handleCancel = () => {
        abortController.abort();
        setIsLoading(false);
    };

    const downloadAllReviews = async(appId) => { 
        try {
            if (abortController) {
                abortController.abort();
              }
          
            const newAbortController = new AbortController();
            setAbortController(newAbortController);
              
            setIsLoading(true);
            const response = await axios.get(`/reviews?appId=${appId}`, {
                signal: newAbortController.signal,
                responseType: 'blob', //handling the binary data
                headers: {
                    // Include authorization tokens
                }
            });
            
            // Extract the filename from the Content-Disposition header
            // const disposition = response.headers['content-disposition'];
            const filename = `${appId}_reviews.csv`;
            // if (disposition) {
            //     console.log(`Disposition gotten`);
            //     var filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
            //     var matches = filenameRegex.exec(disposition);
            //     if (matches != null && matches[1]) { 
            //       filename = matches[1].replace(/['"]/g, '');
            //     }
            // } else {
            //     console.log(`no dispo???`);
            // }

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
            console.error('Error fetching or downloading the reviews file:', error);
            setIsLoading(false);
        }
        setIsLoading(false);
    };

    return (
        <div className='Reviews count & button'>
                <Tooltip title = "Scraping reviews for an app may take 1-5 minutes.">
                    <Button variant="outlined" size="small" onClick={() => downloadAllReviews(appId)}> 
                        <strong>Scrape Reviews</strong>
                    </Button>
                </Tooltip>
            <ReviewsLoading open={isLoading} onCancel={handleCancel} appId={appId}/>
        </div>
    );
}

export default DownloadReviews;