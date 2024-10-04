import React from 'react';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import { Tooltip } from '@mui/material';
import DownloadReviews from '../components/DownloadReviews';

export const columns = [
    { field: 'title', renderHeader: () => <strong>App Name</strong>, minWidth: 250 },
    { field: 'appId', renderHeader: () => <strong>App ID</strong>, minWidth: 250 },
    { field: 'reviewsCount', renderHeader: () => <strong>Total Reviews</strong>, minWidth: 120, renderCell: (params) => params.value},
    { field: 'reviews', renderHeader: () => <strong> </strong>, minWidth: 200, renderCell: (params) => {
        if (params.value[0] < 100000) {
            return (
                DownloadReviews(params.value[1])
            );
        }
        else {
            return (
                <div className='Reviews count & button'>
                    <Tooltip title = "Unable to scrape reviews for this app due to review count being greater than max 100000 reviews.">
                    <span>
                        <Button disabled variant="outlined" size="small"> 
                            <strong>Scrape Reviews</strong>
                        </Button>
                    </span>
                    </Tooltip>
                </div>
            );
        }
    }},
    { field: 'icon', renderHeader: () => <strong>Icon</strong>, minWidth: 100, renderCell: (params) => <Avatar src={params.value} alt="Icon" /> },
    { field: 'developer', renderHeader: () => <strong>Developer</strong>, minWidth: 150 },
    { field: 'currency', renderHeader: () => <strong>Currency</strong>, minWidth: 100 },
    { field: 'price', renderHeader: () => <strong>Price</strong>, minWidth: 50 },
    { field: 'summary', renderHeader: () => <strong>Description</strong>, minWidth: 200 },
    { field: 'url', renderHeader: () => <strong>URL</strong>, minWidth: 200 },
    { field: 'score', renderHeader: () => <strong>Average Rating</strong>, minWidth: 130 },
    { field: 'source', renderHeader: () => <strong>Scraped From</strong>, minWidth: 130 },
    { field: 'maxInstalls', renderHeader: () => <strong>Approximate Installs</strong>, minWidth: 100 },
    { field: 'ratings', renderHeader: () => <strong>Total Ratings</strong>, minWidth: 100 },
    { field: 'originalPrice', renderHeader: () => <strong>Original Price</strong>, minWidth: 120, renderCell: (params) => params.value ?? "-"},
    { field: 'discountEndDate', renderHeader: () => <strong>Discount End Date</strong>, minWidth: 150, renderCell: (params) => params.value ?? "-"},
    { field: 'available', renderHeader: () => <strong>Downloadable</strong>, minWidth: 120 },
    { field: 'offersIAP', renderHeader: () => <strong>In App Purchases</strong>, minWidth: 130 },
    { field: 'IAPRange', renderHeader: () => <strong>In App Purchases Price Range</strong>, minWidth: 220 },
    { field: 'androidVersion', renderHeader: () => <strong>Android Minimum Version</strong>, minWidth: 200 },
    { field: 'developerId', renderHeader: () => <strong>Developer Id</strong>, minWidth: 200 },
    { field: 'developerEmail', renderHeader: () => <strong>Developer Email</strong>, minWidth: 200 },
    { field: 'developerWebsite', renderHeader: () => <strong>Developer Website</strong>, minWidth: 200 },
    { field: 'developerAddress', renderHeader: () => <strong>Developer Address</strong>, minWidth: 200 },
    { field: 'privacyPolicy', renderHeader: () => <strong>Privacy Policy URL</strong>, minWidth: 200 },
    { field: 'genreId', renderHeader: () => <strong>Genre ID</strong>, minWidth: 200 },
    { field: 'contentRating', renderHeader: () => <strong>Content Rating</strong>, minWidth: 120 },
    { field: 'adSupported', renderHeader: () => <strong>In App Advertisements</strong>, minWidth: 170 },
    { field: 'released', renderHeader: () => <strong>Original Release Date</strong>, minWidth: 160 },
    { field: 'version', renderHeader: () => <strong>Current App Version</strong>, minWidth: 160 },
    { field: 'recentChanges', renderHeader: () => <strong>Current Version Changes</strong>, minWidth: 200 },
];
