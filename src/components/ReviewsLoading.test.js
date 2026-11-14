import React from "react";
import { render, screen } from "@testing-library/react";
import ReviewsLoading from "./ReviewsLoading";

test("describes the review scrape cap in the loading dialog", () => {
    render(<ReviewsLoading open onCancel={() => {}} appId="com.x" />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("up to 10,000 on Google Play, 500 on the App Store");
    expect(dialog).not.toHaveTextContent(/all of the user reviews/);
});
