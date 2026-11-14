import { render, screen, fireEvent, within } from "@testing-library/react";
import UserGuide from "./UserGuide";

// Header rows of the CSV files the backends write. The guide's field tables are the only schema
// documentation researchers have, so every name must match a CSV column exactly (including case).
const PLAY_APP_CSV = [
    "appName", "appId", "url", "icon", "developer", "developerId", "currency", "price", "description",
    "avgRating", "country", "scrapedFrom", "approximateInstalls", "totalRatings", "totalReviews",
    "originalPrice", "discountEndDate", "downloadable", "inAppPurchases", "inAppPurchasesPriceRange",
    "androidMinVersion", "developerEmail", "developerWebsite", "developerAddress", "privacyPolicyURL",
    "genreId", "contentRating", "inAppAdvertisements", "originalReleaseDate", "currentAppVersion",
    "currentVersionChanges", "dateScraped",
];
const PLAY_REVIEWS_CSV = [
    "reviewID", "dateReviewed", "rating", "reviewURL", "reviewText", "developerReplyDate",
    "developerReplyText", "versionWhenReviewed", "helpfulVotes", "country", "dateScraped",
];
const APP_STORE_APP_CSV = [
    "id", "appId", "appName", "url", "icon", "genres", "genreIDs", "primaryGenre", "primaryGenreId",
    "contentRating", "supportedLanguages", "appSizeInBytes", "requiredOsVersion", "originalReleaseDate",
    "lastUpdated", "releaseNotes", "currentAppVersion", "price", "currency", "developerId", "developer",
    "developerAppStorePageURL", "developerWebsite", "avgRating", "totalReviews", "currentVersionAvgRating",
    "currentVersionReviews", "appScreenshots", "appIpadScreenshots", "appletvScreenshots",
    "supportedDeviceList", "country", "scrapedFrom", "dateScraped",
];
const APP_STORE_REVIEWS_CSV = [
    "reviewID", "userUrl", "versionWhenReviewed", "rating", "reviewText", "reviewURL", "dateReviewed",
    "country", "dateScraped",
];

// The two field tables on screen (app metadata, then review metadata) as { field: description }.
const fieldTables = () =>
    screen.getAllByRole("table").map((table) =>
        Object.fromEntries(
            within(table)
                .getAllByRole("row")
                .slice(1)
                .map((row) => {
                    const cells = within(row).getAllByRole(/rowheader|cell/);
                    return [cells[0].textContent, cells[1].textContent];
                }),
        ),
    );

const renderGuide = (store) => {
    render(<UserGuide />);
    if (store === "App Store") fireEvent.click(screen.getByRole("button", { name: /App Store/ }));
    return fieldTables();
};

const sorted = (list) => [...list].sort();

describe("User Guide field tables match the CSV columns", () => {
    test("Play Store app and review tables", () => {
        const [apps, reviews] = renderGuide("Play Store");
        expect(sorted(Object.keys(apps))).toEqual(sorted(PLAY_APP_CSV));
        expect(sorted(Object.keys(reviews))).toEqual(sorted(PLAY_REVIEWS_CSV));
    });

    test("App Store app and review tables", () => {
        const [apps, reviews] = renderGuide("App Store");
        expect(sorted(Object.keys(apps))).toEqual(sorted(APP_STORE_APP_CSV));
        expect(sorted(Object.keys(reviews))).toEqual(sorted(APP_STORE_REVIEWS_CSV));
    });

    test("the permission columns are mentioned for the Play Store", () => {
        renderGuide("Play Store");
        expect(screen.getByText(/one column per app permission/)).toBeInTheDocument();
    });
});

describe("User Guide describes the data as the backends produce it", () => {
    test("Play Store: 20 keyword results, a 'related to' search, the real scrapedFrom values, short description", () => {
        const [apps] = renderGuide("Play Store");
        expect(apps.scrapedFrom).toMatch(/up to 20 results/);
        expect(apps.scrapedFrom).toMatch(/related to <app title>/);
        expect(apps.scrapedFrom).toMatch(/\(1\) keyword search /);
        expect(apps.scrapedFrom).toMatch(/\(2\) similar app links /);
        expect(apps.scrapedFrom).not.toMatch(/30 results|September 2024/);
        expect(apps.description).toMatch(/Short summary/);
        expect(apps.description).toMatch(/full app description is not included/);
    });

    test("App Store: 50 keyword results, its own text, rating counts, reviewer profile link", () => {
        const [apps, reviews] = renderGuide("App Store");
        expect(apps.scrapedFrom).toMatch(/up to 50 results/);
        expect(apps.scrapedFrom).toMatch(/Apple App Store/);
        expect(apps.scrapedFrom).not.toMatch(/Google Play|30 results|September 2024/);
        expect(apps.totalReviews).toMatch(/ratings/);
        expect(apps.currentVersionReviews).toMatch(/ratings/);
        expect(reviews.userUrl).toMatch(/reviewer's App Store profile/);
    });
});

describe("User Guide walkthrough and references", () => {
    test("every reference has a working https link and the full author, title and venue text", () => {
        const { container } = render(<UserGuide />);
        const refs = [...container.querySelectorAll("p.refs")];
        expect(refs).toHaveLength(9);
        refs.forEach((ref) => {
            expect(ref.textContent).not.toMatch(/hps:\/\//);
            const link = ref.querySelector("a");
            expect(link).not.toBeNull();
            expect(link.getAttribute("href")).toMatch(/^https:\/\/doi\.org\/10\./);
            expect(link.textContent).toBe(link.getAttribute("href"));
        });
        const text = refs.map((ref) => ref.textContent).join("\n");
        expect(text).toMatch(/Akeiylah DeWitt, Julie Kientz, and Kendra Liljenquist/);
        expect(text).toMatch(/make its users feel better, it sure is a joke/);
        expect(text).toMatch(/Proceedings of the ACM on Human-Computer Interaction 6, CSCW2/);
        expect(text).toMatch(/Proceedings of the 2017 ACM Conference on Computer Supported Cooperative Work/);
    });

    test("the walkthrough names the buttons and pages as the site labels them", () => {
        const { container } = render(<UserGuide />);
        const text = container.textContent;
        expect(text).not.toMatch(/Scrape Data/);
        expect(text).not.toMatch(/Top Lists/);
        expect(text).toMatch(/'Scrape Play Store' button/);
        expect(text).toMatch(/'Scrape App Store'/);
        expect(text).toMatch(/'Search' button/);
        expect(text).toMatch(/navigate to the Top Charts page/);
        expect(text).toMatch(/navigate to the Bulk Reviews page/);
    });

    test("the review limits are the backend caps, not the old 100,000 gate", () => {
        const { container } = render(<UserGuide />);
        const text = container.textContent.replace(/\s+/g, " ");
        expect(text).not.toMatch(/100,000/);
        expect(text.match(/up to 10,000 per application on Google Play and 500 on the App Store/g)).toHaveLength(2);
    });

    test("the three usage sections are numbered, linked from the contents and their steps count up", () => {
        const { container } = render(<UserGuide />);
        const headings = [...container.querySelectorAll("h5")].map((heading) => heading.textContent);
        expect(headings).toEqual(
            expect.arrayContaining([
                "I. Conducting a Keyword Search",
                "II. Conducting a Top Charts Search",
                "III. Scraping Reviews in Bulk",
            ]),
        );
        ["Keyword_Search", "TopLists_Search", "Bulk_Reviews"].forEach((id) => {
            expect(container.querySelector(`h5#${id}`)).not.toBeNull();
            expect(container.querySelector(`a[href="#${id}"]`)).not.toBeNull();
        });
        // Step numbers between the "II." heading and the "III." heading
        const steps = [];
        let node = container.querySelector("#TopLists_Search").nextElementSibling;
        while (node && node.id !== "Bulk_Reviews") {
            const number = node.querySelector(":scope > b");
            if (number && /^\d\.$/.test(number.textContent)) steps.push(number.textContent);
            node = node.nextElementSibling;
        }
        expect(steps).toEqual(["1.", "2.", "3.", "4."]);
    });
});
