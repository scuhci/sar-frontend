/**
 * ServiceHealthProvider
 *
 * Makes the current service health status available to any component in
 * the tree without prop drilling. Used by SearchBar/TopLists pages to
 * show banners, and by DownloadReviews to disable the Scrape Reviews
 * button when the reviews service is down.
 */

import React, { createContext, useContext } from "react";
import useServiceHealth from "../hooks/useServiceHealth";
import { useScraper } from "./SelectedScraperProvider";

const ServiceHealthContext = createContext({
    loading: true,
    overall: "unknown",
    services: {},
    isSearchDown: false,
    isReviewsDown: false,
    isListDown: false,
    isAppDown: false,
    isUnhealthy: false,
});

export const ServiceHealthProvider = ({ children }) => {
    const { selectedScraper } = useScraper();
    const health = useServiceHealth(selectedScraper);

    return (
        <ServiceHealthContext.Provider value={health}>
            {children}
        </ServiceHealthContext.Provider>
    );
};

export const useServiceHealthContext = () => useContext(ServiceHealthContext);
