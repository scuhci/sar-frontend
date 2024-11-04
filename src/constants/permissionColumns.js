import React from "react";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { Tooltip } from "@mui/material";

// Helper function for creating renderHeader attribute for permissions columns
const renderPermissionHeader = (headerText) => {
  return () => (
    <Tooltip title={headerText}>
      <strong>{headerText}</strong>
    </Tooltip>
  );
};

// Helper function to render permissions as checks (true) or crosses (false)
const renderPermissionsCell = (params) =>
  params.value ? <CheckIcon color="success" /> : <CloseIcon color="error" />;

// Map of permission field names to corresponding header names
// Used in renderPermissionHeader to generate renderHeader function
const fieldNames = {
  approximateLocation: "Approximate location (network based)",
  preciseLocation: "Precise location (GPS and network-based)",
  retrieveRunning: "Retrieve running apps",
  findAccounts: "Find accounts on the device",
  addRemoveAccounts: "Add or Remove Accounts",
  readContact: "Read your own Contact Card",
  readCalendar: "Read calendar events plus confidential information",
  addModCalendar: "Add or modify calendar events and send email to guests without owners knowledge",
  readContacts: "Read Your Contacts",
  modifyContacts: "Modify Your Contacts",
  readCallLog: "Read call log",
  directCall: "Directly call phone numbers",
  readPhoneStatus: "Read phone status and identity",
  readUSB: "Read the contents of your USB storage",
  modUSB: "Modify or delete the contents of your USB storage",
  takePics: "Take pictures and videos",
  recordAudio: "Record Audio",
  viewWifi: "View Wi-Fi connections",
  viewNetwork: "View network connections",
  createAccounts: "Create accounts and set passwords",
  readBattery: "Read battery statistics",
  pairBluetooth: "Pair with Bluetooth devices",
  accessBluetooth: "Access Bluetooth settings",
  sendStickyBroadcast: "Send sticky broadcast",
  changeNetwork: "Change network connectivity",
  connectWifi: "Connect and disconnect from Wi-Fi",
  fullNetworkAccess: "Full network access",
  changeAudio: "Change your audio settings",
  controlNFC: "Control Near Field Communication",
  readSync: "Read sync settings",
  runAtStart: "Run at startup",
  reorderRunnning: "Reorder running apps",
  drawOver: "Draw over other apps",
  controlVibration: "Control vibration",
  preventSleep: "Prevent device from sleeping",
  toggleSync: "Toggle sync on and off",
  installShortcuts: "Install shortcuts",
  readGoogleConfig: "Read Google service configuration",
}

export const permissionColumns = Object.keys(fieldNames).map((fieldName) => ({
  field: fieldName,
  renderHeader: renderPermissionHeader(fieldNames[fieldName]),
  renderCell: renderPermissionsCell,
  minWidth: 200,
}))
