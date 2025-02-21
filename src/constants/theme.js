import { createTheme } from "@mui/material";

const themeOptions = {
    palette: {
        mode: "light",
        primary: {
            main: "#ef7c9d",
            light: "#fce2e6",
        },
        secondary: {
            main: "#fed622",
        },
    },
};

export const theme = createTheme(themeOptions);
