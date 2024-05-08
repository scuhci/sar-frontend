import React, { useState } from 'react';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import { Tooltip } from '@mui/material';
import ReviewsLoading from './ReviewsLoading';


const DownloadReviews = (appId) => {
    const [isLoading, setIsLoading] = useState(false);
    // const [abortController, setAbortController] = useState(null);
    const handleCancel = () => {
        // abortController.abort();
        setIsLoading(false);
    };

    // const downloadAllReviews = async({appId}) => { 
    //     try {
    //         if (abortController) {
    //             abortController.abort();
    //           }
          
    //           const newAbortController = new AbortController();
    //           setAbortController(newAbortController);
              
    //           setIsLoading(true);
    //         const response = await axios.get(`${SAR_BACKEND_URL}/reviews?appId=${appId}`, {
    //             signal: newAbortController.signal,
    //             responseType: 'blob', //handling the binary data
    //             headers: {
    //                 // Include authorization tokens
    //             }
    //         });
            
    //         // Extract the filename from the Content-Disposition header
    //         const contentDisposition = response.headers['content-disposition'];
    //         let filename = 'download.csv';
    //         if (contentDisposition) {
    //         const filenameRegex = /filename\s*=\s*(["'])(.*?)\1/;
    //         const matches = filenameRegex.exec(contentDisposition);
    //         if (matches && matches[2]) { 
    //             filename = matches[2];
    //         }
    //         }
    //         console.log(`Filename from header: ${filename}`);

    //         // Create a URL from the blob
    //         const url = window.URL.createObjectURL(new Blob([response.data]));

    //         // Create a link element, set the href to the blob URL, and trigger a download
    //         const link = document.createElement('a');
    //         link.href = url;
    //         link.setAttribute('download', filename);
    //         document.body.appendChild(link);
    //         link.click();

    //         // Clean up and revoke the URL
    //         document.body.removeChild(link);
    //         window.URL.revokeObjectURL(url);

    //     } catch (error) {
    //         console.error('Error fetching or downloading the reviews file:', error);
    //         setIsLoading(false);
    //     }
    //     setIsLoading(false);
    // };
    //() => downloadAllReviews({params})

    return (
        <div className='Reviews count & button'>
            <Stack alignItems="center" direction="row" gap={2}> 
                <Typography>######</Typography> 
                <Tooltip title = "Scraping reviews for an app may take 1-5 minutes.">
                    <Button variant="outlined" size="small" onClick={setIsLoading}> 
                        <strong>Scrape Reviews</strong>
                    </Button>
                </Tooltip>
            </Stack>
            <ReviewsLoading open={isLoading} onCancel={handleCancel} appId={"appId"}/>
        </div>
    );
}

export default DownloadReviews;