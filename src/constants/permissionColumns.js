import React from 'react';
import Avatar from '@mui/material/Avatar';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { Tooltip } from '@mui/material';
import DownloadReviews from '../components/DownloadReviews';

export const permissionColumns = [
    { field: 'title', renderHeader: () => <strong>Title</strong>, width: 200 },
    { field: 'appId', renderHeader: () => <strong>App ID</strong>, width: 150 },
    { field: 'reviewsCount', renderHeader: () => <strong>Reviews</strong>, width: 150, renderCell: (params) => <Typography>{params.value}</Typography>},
    { field: 'reviews',renderHeader: () => <strong> </strong>, width: 260, renderCell: (params) => {
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
    { field: 'icon', renderHeader: () => <strong>Icon</strong>, width: 100, renderCell: (params) => <Avatar src={params.value} alt="Icon" /> },
    { field: 'developer', renderHeader: () => <strong>Developer</strong>, width: 150 },
    { field: 'currency', renderHeader: () => <strong>Currency</strong>, width: 100 },
    { field: 'price', renderHeader: () => <strong>Price</strong>, width: 50 },
    { field: 'free', renderHeader: () => <strong>Free</strong>, width: 50 },
    { field: 'summary', renderHeader: () => <strong>Summary</strong>, width: 200 },
    { field: 'url', renderHeader: () => <strong>URL</strong>, width: 200 },
    { field: 'scoreText', renderHeader: () => <strong>Score Text</strong>, width: 100 },
    { field: 'score', renderHeader: () => <strong>Score</strong>, width: 100 },
    { field: 'source', renderHeader: () => <strong>Source</strong>, width: 100 },
    { field: 'installs', renderHeader: () => <strong>Installs</strong>, width: 100 },
    { field: 'maxInstalls', renderHeader: () => <strong>Max Installs</strong>, width: 100 },
    { field: 'ratings', renderHeader: () => <strong>Ratings</strong>, width: 100 },
    { field: 'originalPrice', renderHeader: () => <strong>Original Price</strong>, width: 100, renderCell: (params) => params.value ? params.value : "-"},
    { field: 'discountEndDate', renderHeader: () => <strong>Discount End Date</strong>, width: 150, renderCell: (params) => params.value ? params.value : "-"},
    { field: 'available', renderHeader: () => <strong>Available</strong>, width: 70 },
    { field: 'offersIAP', renderHeader: () => <strong>Offers IAP</strong>, width: 80 },
    { field: 'IAPRange', renderHeader: () => <strong>IAP Range</strong>, width: 200 },
    { field: 'androidVersion', renderHeader: () => <strong>Android Version</strong>, width: 120 },
    { field: 'androidMaxVersion', renderHeader: () => <strong>Android Max Version</strong>, width: 150 },
    { field: 'developerId', renderHeader: () => <strong>Developer Id</strong>, width: 200 },
    { field: 'developerEmail', renderHeader: () => <strong>Developer Email</strong>, width: 200 },
    { field: 'developerWebsite', renderHeader: () => <strong>Developer Website</strong>, width: 200 },
    { field: 'developerAddress', renderHeader: () => <strong>Developer Address</strong>, width: 200 },
    { field: 'privacyPolicy', renderHeader: () => <strong>Privacy Policy</strong>, width: 200 },
    { field: 'genre', renderHeader: () => <strong>Genre</strong>, width: 150 },
    { field: 'genreId', renderHeader: () => <strong>Genre Id</strong>, width: 200 },
    { field: 'previewVideo', renderHeader: () => <strong>Preview Video</strong>, width: 100, renderCell: (params) => params.value ? params.value : "-"},
    { field: 'contentRating', renderHeader: () => <strong>Content Rating</strong>, width: 120 },
    { field: 'adSupported', renderHeader: () => <strong>Ad Supported</strong>, width: 100 },
    { field: 'released', renderHeader: () => <strong>Released</strong>, width: 100 },
    { field: 'version', renderHeader: () => <strong>Version</strong>, width: 100 },
    { field: 'recentChanges', renderHeader: () => <strong>Recent Changes</strong>, width: 200 },

    { field: 'approximateLocation', renderHeader: () =>  <Tooltip title ="approximate location (network based)"><strong>Approximate location (network based)</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'preciseLocation', renderHeader: () => <Tooltip title = "precise location (GPS and network-based)"><strong>Precise location (GPS and network-based)</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'retrieveRunning', renderHeader: () => <Tooltip title = "retrieve running apps"><strong>Retrieve running apps</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'findAccounts', renderHeader: () => <Tooltip title = "find accounts on the device"><strong>Find accounts on the device</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'addRemoveAccounts', renderHeader: () => <Tooltip title = "add or remove accounts"><strong>Add or Remove Accounts</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'readContact', renderHeader: () => <Tooltip title = "read your own contact card" ><strong>Read your own Contact Card</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'readCalendar', renderHeader: () => <Tooltip title = 'read calendar events plus confidential information' ><strong>Read calendar events plus confidential information</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'addModCalendar', renderHeader: () => <Tooltip title = 'add or modify calendar events and send email to guests without owners knowledge'><strong> Add or modify calendar events and send email to guests without owners knowledge</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'readContacts', renderHeader: () => <Tooltip title = "read your contacts" ><strong>Read Your Contacts</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'modifyContacts', renderHeader: () => <Tooltip title = 'modify your contacts' ><strong>Modify Your Contacts</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'readCallLog', renderHeader: () => <Tooltip title = 'read call log' ><strong>Read call log</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'directCall', renderHeader: () => <Tooltip title = 'directly call phone numbers' ><strong>Directly call phone numbers</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'readPhoneStatus', renderHeader: () => <Tooltip title = 'Read phone status and identity' ><strong>Read phone status and identity</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'readUSB', renderHeader: () => <Tooltip title = 'Read the contents of your USB storage' ><strong>Read the contents of your USB storage</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'modUSB', renderHeader: () => <Tooltip title = 'modify or delete the contents of your USB storage' ><strong>Modify or delete the contents of your USB storage</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'takePics', renderHeader: () => <Tooltip title = 'take pictures and videos' ><strong>Take pictures and videos</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'recordAudio', renderHeader: () => <Tooltip title = 'Record audio' ><strong>Record Audio</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'viewWifi', renderHeader: () => <Tooltip title = 'view Wi-Fi connections' ><strong>View Wi-Fi connections</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'viewNetwork', renderHeader: () => <Tooltip title = 'view network connections' ><strong>View network connections</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'createAccounts', renderHeader: () => <Tooltip title = 'create accounts and set passwords' ><strong>Create accounts and set passwords</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'readBattery', renderHeader: () => <Tooltip title = 'read battery statistics' ><strong>Read battery statistics</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'pairBluetooth', renderHeader: () => <Tooltip title = 'pair with Bluetooth devices' ><strong>Pair with Bluetooth devices</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'accessBluetooth', renderHeader: () => <Tooltip title = 'access Bluetooth settings' ><strong>Access Bluetooth settings</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'sendStickyBroadcast', renderHeader: () => <Tooltip title = 'send sticky broadcast' ><strong>Send sticky broadcast</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'changeNetwork', renderHeader: () => <Tooltip title = 'change network connectivity' ><strong>Change network connectivity</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'connectWifi', renderHeader: () => <Tooltip title = 'connect and disconnect from Wi-Fi' ><strong>Connect and disconnect from Wi-Fi</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'fullNetworkAccess', renderHeader: () => <Tooltip title = 'full network access' ><strong>Full network access</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'changeAudio', renderHeader: () => <Tooltip title = 'change your audio settings' ><strong>Change your audio settings</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'controlNFC', renderHeader: () => <Tooltip title = 'control Near Field Communication' ><strong>Control Near Field Communication</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'readSync', renderHeader: () => <Tooltip title = 'read sync settings' ><strong>Read sync settings</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'runAtStart', renderHeader: () => <Tooltip title = 'run at startup'><strong>Run at startup</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'reorderRunnning', renderHeader: () => <Tooltip title = 'reorder running apps'><strong>Reorder running apps</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'drawOver', renderHeader: () => <Tooltip title = 'draw over other apps'><strong>Draw over other apps</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'controlVibration', renderHeader: () => <Tooltip title = 'control vibration'><strong>Control vibration</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'preventSleep', renderHeader: () => <Tooltip title = 'prevent device from sleeping'><strong>Prevent device from sleeping</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'toggleSync', renderHeader: () => <Tooltip title = 'toggle sync on and off'><strong>Toggle sync on and off</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'installShortcuts', renderHeader: () => <Tooltip title = 'install shortcuts'><strong>Install shortcuts</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},
    { field: 'readGoogleConfig', renderHeader: () => <Tooltip title = 'read Google service configuration'><strong>Read Google service configuration</strong></Tooltip>,width: 200, renderCell: (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>},

];