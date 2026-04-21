/**
 * useServiceHealth
 *
 * Polls the backend health endpoint and returns the status of each scraper
 * service (search, reviews, list, etc.). Pages use this to decide whether
 * to show the <EndpointError /> full-screen state, the <ReviewsError />
 * banner, or the normal UI.
 *
 * NOTE: the endpoint URLs below are placeholders — confirm with Vedant
 * before merging. Swap the constants in `urlConstants.js` if needed.
 */

import { useState, useEffect } from "react";
import axios from "axios";
import {
    GPLAY_HEALTH_ENDPOINT,
    IOS_HEALTH_ENDPOINT,
} from "../constants/urlConstants";

const useServiceHealth = (selectedScraper) => {
    const [health, setHealth] = useState({
        loading: true,
        overall: "unknown", // "healthy" | "degraded" | "unhealthy" | "unknown"
        services: {}, // { search: {status: "up"}, reviews: {status: "down"}, ... }
        error: null,
    });

    useEffect(() => {
        const endpoint =
            selectedScraper === "Play Store"
                ? GPLAY_HEALTH_ENDPOINT
                : IOS_HEALTH_ENDPOINT;

        let cancelled = false;

        const checkHealth = async () => {
            setHealth((prev) => ({ ...prev, loading: true }));
            try {
                const response = await axios.get(endpoint);
                if (cancelled) return;

                setHealth({
                    loading: false,
                    overall: response.data.overall ?? "unknown",
                    services: response.data.services ?? {},
                    error: null,
                });
            } catch (error) {
                if (cancelled) return;

                // Backend returns 503 when overall is "unhealthy". Axios treats
                // that as an error but still attaches the response body, so we
                // can pull the per-service statuses out of it when available.
                const body = error.response?.data;
                setHealth({
                    loading: false,
                    overall: body?.overall ?? "unhealthy",
                    services: body?.services ?? {},
                    error: error.message,
                });
            }
        };

        checkHealth();

        return () => {
            cancelled = true;
        };
    }, [selectedScraper]);

    // Convenience flags for each service
    const isSearchDown = health.services.search?.status === "down";
    const isReviewsDown = health.services.reviews?.status === "down";
    const isListDown = health.services.list?.status === "down";
    const isAppDown = health.services.app?.status === "down";

    // Overall "the whole thing is down" flag — used to show EndpointError
    const isUnhealthy = health.overall === "unhealthy";

    return {
        ...health,
        isSearchDown,
        isReviewsDown,
        isListDown,
        isAppDown,
        isUnhealthy,
    };
};

export default useServiceHealth;
