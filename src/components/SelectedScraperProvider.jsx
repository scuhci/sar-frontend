import React, { createContext, useState, useContext } from "react";

const ScraperContext = createContext();

const readStoredScraper = () => {
    try {
        const stored = JSON.parse(localStorage.getItem("selectedScraper"));
        return stored === "App Store" || stored === "Play Store" ? stored : "Play Store";
    } catch (error) {
        return "Play Store";
    }
};

export const ScraperProvider = ({ children }) => {
    const [selectedScraper, setSelectedScraper] = useState(readStoredScraper);

    // Sync selectedScraper with localStorage on change
    React.useEffect(() => {
        try {
            localStorage.setItem(
                "selectedScraper",
                JSON.stringify(selectedScraper)
            );
        } catch (error) {
            // storage blocked: keep the choice in memory
        }
    }, [selectedScraper]);

    return (
        <ScraperContext.Provider
            value={{ selectedScraper, setSelectedScraper }}
        >
            {children}
        </ScraperContext.Provider>
    );
};

export const useScraper = () => {
    const context = useContext(ScraperContext);
    if (!context) {
        throw new Error("useScraper must be used within a ScraperProvider");
    }
    return context;
};
