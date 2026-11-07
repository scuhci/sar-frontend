/**
 * The Notify Me request must carry the email address in the JSON body only. Anything in
 * the URL ends up in nginx access logs, browser history and the backend's request log.
 *
 * Uses the real axios with a stubbed adapter so the assertion is on the request that
 * would actually be sent.
 *
 * Run: CI=true npx react-scripts test --watchAll=false --testPathPattern NotifyMe
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NotifyMe from "../NotifyMe";

// Jest 27 (react-scripts 5) cannot load axios's ESM entry point, so point it at the
// CommonJS browser build instead of mocking axios away.
jest.mock("axios", () => require("axios/dist/browser/axios.cjs"));
import axios from "axios";

const EMAIL = "first.last@example.com";

const requests = [];

beforeEach(() => {
    requests.length = 0;
    axios.defaults.adapter = (config) => {
        requests.push(config);
        return Promise.resolve({ data: { status: "success" }, status: 200, statusText: "OK", headers: {}, config });
    };
});

const notify = async () => {
    render(<NotifyMe country="US" query="fitness" permissions={false} />);
    fireEvent.change(screen.getByPlaceholderText("Email Address"), { target: { value: EMAIL } });
    fireEvent.click(screen.getByText("NOTIFY ME"));
    await waitFor(() => expect(requests).toHaveLength(1));
    return requests[0];
};

test("the email address is sent in the request body, not the URL", async () => {
    const request = await notify();

    expect(request.method).toBe("post");
    expect(axios.getUri(request)).toBe("/api/email");
    expect(JSON.parse(request.data)).toEqual({ email: EMAIL, queryId: "c:US_t:fitness_p:false" });
});

test("a successful request shows the confirmation", async () => {
    await notify();
    await screen.findByText(/Got it!/);
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
});

test("special characters in the email and search term reach the backend unchanged", async () => {
    render(<NotifyMe country="US" query="health & fitness #1" permissions={false} />);
    fireEvent.change(screen.getByPlaceholderText("Email Address"), { target: { value: "first+smar@gmail.com" } });
    fireEvent.click(screen.getByText("NOTIFY ME"));
    await waitFor(() => expect(requests).toHaveLength(1));

    expect(axios.getUri(requests[0])).toBe("/api/email");
    expect(JSON.parse(requests[0].data)).toEqual({
        email: "first+smar@gmail.com",
        queryId: "c:US_t:health & fitness #1_p:false",
    });
});
