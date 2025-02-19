import React, { createContext, useState, useContext } from "react";

const ScraperContext = createContext();

export const ScraperProvider = ({ children }) => {
    const [selectedScraper, setSelectedScraper] = useState(); // "Play Store" | "App Store"

    // Sync selectedScraper with localStorage on change
    React.useEffect(() => {
        if (selectedScraper) {
            localStorage.setItem(
                "selectedScraper",
                JSON.stringify(selectedScraper)
            );
        }
    }, [selectedScraper]);

    // Initialize selectedScraper from localStorage on component mount
    React.useEffect(() => {
        const storedScraper = localStorage.getItem("selectedScraper");
        if (storedScraper) {
            setSelectedScraper(JSON.parse(storedScraper));
        }
    }, []);

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
