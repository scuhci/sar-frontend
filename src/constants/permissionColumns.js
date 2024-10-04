import React from 'react';
import Avatar from '@mui/material/Avatar';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import Button from '@mui/material/Button';
import { Tooltip } from '@mui/material';
import DownloadReviews from '../components/DownloadReviews';

const renderPermissionsCell = (params) => params.value ? <CheckIcon color="success"/> : <CloseIcon color="error"/>;

export const permissionColumns = [
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

    { field: 'approximateLocation', renderHeader: () =>  <Tooltip title ="approximate location (network based)"><strong>Approximate location (network based)</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'preciseLocation', renderHeader: () => <Tooltip title = "precise location (GPS and network-based)"><strong>Precise location (GPS and network-based)</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'retrieveRunning', renderHeader: () => <Tooltip title = "retrieve running apps"><strong>Retrieve running apps</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'findAccounts', renderHeader: () => <Tooltip title = "find accounts on the device"><strong>Find accounts on the device</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'addRemoveAccounts', renderHeader: () => <Tooltip title = "add or remove accounts"><strong>Add or Remove Accounts</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'readContact', renderHeader: () => <Tooltip title = "read your own contact card" ><strong>Read your own Contact Card</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'readCalendar', renderHeader: () => <Tooltip title = 'read calendar events plus confidential information' ><strong>Read calendar events plus confidential information</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'addModCalendar', renderHeader: () => <Tooltip title = 'add or modify calendar events and send email to guests without owners knowledge'><strong> Add or modify calendar events and send email to guests without owners knowledge</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'readContacts', renderHeader: () => <Tooltip title = "read your contacts" ><strong>Read Your Contacts</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'modifyContacts', renderHeader: () => <Tooltip title = 'modify your contacts' ><strong>Modify Your Contacts</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'readCallLog', renderHeader: () => <Tooltip title = 'read call log' ><strong>Read call log</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'directCall', renderHeader: () => <Tooltip title = 'directly call phone numbers' ><strong>Directly call phone numbers</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'readPhoneStatus', renderHeader: () => <Tooltip title = 'Read phone status and identity' ><strong>Read phone status and identity</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'readUSB', renderHeader: () => <Tooltip title = 'Read the contents of your USB storage' ><strong>Read the contents of your USB storage</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'modUSB', renderHeader: () => <Tooltip title = 'modify or delete the contents of your USB storage' ><strong>Modify or delete the contents of your USB storage</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'takePics', renderHeader: () => <Tooltip title = 'take pictures and videos' ><strong>Take pictures and videos</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'recordAudio', renderHeader: () => <Tooltip title = 'Record audio' ><strong>Record Audio</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'viewWifi', renderHeader: () => <Tooltip title = 'view Wi-Fi connections' ><strong>View Wi-Fi connections</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'viewNetwork', renderHeader: () => <Tooltip title = 'view network connections' ><strong>View network connections</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'createAccounts', renderHeader: () => <Tooltip title = 'create accounts and set passwords' ><strong>Create accounts and set passwords</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'readBattery', renderHeader: () => <Tooltip title = 'read battery statistics' ><strong>Read battery statistics</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'pairBluetooth', renderHeader: () => <Tooltip title = 'pair with Bluetooth devices' ><strong>Pair with Bluetooth devices</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'accessBluetooth', renderHeader: () => <Tooltip title = 'access Bluetooth settings' ><strong>Access Bluetooth settings</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'sendStickyBroadcast', renderHeader: () => <Tooltip title = 'send sticky broadcast' ><strong>Send sticky broadcast</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'changeNetwork', renderHeader: () => <Tooltip title = 'change network connectivity' ><strong>Change network connectivity</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'connectWifi', renderHeader: () => <Tooltip title = 'connect and disconnect from Wi-Fi' ><strong>Connect and disconnect from Wi-Fi</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'fullNetworkAccess', renderHeader: () => <Tooltip title = 'full network access' ><strong>Full network access</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'changeAudio', renderHeader: () => <Tooltip title = 'change your audio settings' ><strong>Change your audio settings</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'controlNFC', renderHeader: () => <Tooltip title = 'control Near Field Communication' ><strong>Control Near Field Communication</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'readSync', renderHeader: () => <Tooltip title = 'read sync settings' ><strong>Read sync settings</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'runAtStart', renderHeader: () => <Tooltip title = 'run at startup'><strong>Run at startup</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'reorderRunnning', renderHeader: () => <Tooltip title = 'reorder running apps'><strong>Reorder running apps</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'drawOver', renderHeader: () => <Tooltip title = 'draw over other apps'><strong>Draw over other apps</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'controlVibration', renderHeader: () => <Tooltip title = 'control vibration'><strong>Control vibration</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'preventSleep', renderHeader: () => <Tooltip title = 'prevent device from sleeping'><strong>Prevent device from sleeping</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'toggleSync', renderHeader: () => <Tooltip title = 'toggle sync on and off'><strong>Toggle sync on and off</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'installShortcuts', renderHeader: () => <Tooltip title = 'install shortcuts'><strong>Install shortcuts</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},
    { field: 'readGoogleConfig', renderHeader: () => <Tooltip title = 'read Google service configuration'><strong>Read Google service configuration</strong></Tooltip>,minWidth: 200, renderCell: renderPermissionsCell},

];