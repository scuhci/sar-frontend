# SMAR Tool for Systematic Mobile Application Reviews

A tool for academic researchers to conduct a keyword search of the Google Play & iOS App Stores and get back the metadata for all relevant apps. 

**This project is ongoing!** You can view our beta site at [smar-tool.org](http://smar-tool.org/). Also, take a look at our [User Guide](https://smar-team.s3.us-west-1.amazonaws.com/user-guide/SMAR+User+Guide.pdf) for an in-depth overview of how to use our application.

Our [backend code](https://github.com/scuhci/SAR-backend/) can be found here.

## Team

This project was made with love at the [Santa Clara University HCI Lab](https://scuhci.com/) by a student-led team of researchers across various disciplines.

**Faculty Advisor** :bulb:
- Professor Kai Lukoff | [Website](https://kailukoff.com/)

**Project Lead** 💬

- Ilona van der Linden | [LinkedIn](https://www.linkedin.com/in/lonavdlin/) | [Email](mailto:lonavdlin@gmail.com)

**Developer Team** 🖥️

- Kyle Zhang | [LinkedIn](https://www.linkedin.com/in/kyle-zhang-3a6551194/) | [Email](kylemzhang@gmail.com)
- Varun Mangla | [LinkedIn](https://www.linkedin.com/in/varunmangla/) | [Email](mailto:varunm57@outlook.com)
- Gaurav Punjabi | [LinkedIn](https://www.linkedin.com/in/gaurav-punjabi-34067315a/)
- Jeshwin Prince | [LinkedIn]( https://www.linkedin.com/in/jeshwinprince/) | [Email](mailto:jprince2@scu.edu)

**Technical Consulting Team** 🗒️

- Soham Phadke | [LinkedIn](https://www.linkedin.com/in/soham-phadke/) | [Email](mailto:smphadke24@gmail.com)

**Literature Review Team** 📖
- Katrina Ying | [LinkedIn](https://www.linkedin.com/in/katrinaying/)
- Maggie Lau | [Email](mailto:mlone2328@gmail.com)
- Crystal Chen | [LinkedIn](https://www.linkedin.com/in/crystal-chen-637757119/)

**Project Alumni** 🤍
- Akaash Trivedi
- Vaishnavi Upadhye
- Rani Rajurkar
- Juilee Katpatal 

## Running SMAR Locally

### **We strongly advise accessing our tool via our [website](http://smar-tool.org/) for the best user experience!** 
*Experienced developers who wish to try the SMAR tool on their local machine: read on.*

1. Clone the `sar-frontend` and [`SAR-backend`](https://github.com/scuhci/SAR-backend/) repositories to your local machine.

2. In this repository, `git checkout production`. The backend repository holds two servers on separate branches, so make two checkouts of it: one on `gplay-production` (Google Play backend, port 5001) and one on `ios-production` (App Store backend, port 5002).

3. Install dependencies with `npm ci` in each checkout. `package-lock.json` is committed so everyone (and the server) gets the same dependency tree. If you add or upgrade a package, commit the `package-lock.json` change together with `package.json`.

4. To start the Google Play backend: run `node index.js` in the `gplay-production` checkout (listens on http://localhost:5001).

5. To start the App Store backend: run `node index.js` in the `ios-production` checkout (listens on http://localhost:5002).

6. To start `sar-frontend`: run `npm start`, then open http://localhost:3000.

The dev server forwards `/api/*` to the Google Play backend and `/ios/*` to the App Store backend, stripping the prefix the same way nginx does (see `src/setupProxy.js`). By default it uses the two local backends above. To use other backends, for example the live ones, set `SMAR_PLAY_API` and/or `SMAR_IOS_API` when starting:

```
SMAR_PLAY_API=https://smar-tool.org/api SMAR_IOS_API=https://smar-tool.org/ios npm start
```

Requests made this way reach the live backends, so keep them to testing.

## Building and Deploying

`npm run build` writes the static site to `build/` (gitignored). With `CI=true` set, Create React App treats ESLint warnings as errors, so keep the code warning-free.

What the repositories show about the live site:

- Releases have gone out by merging `production` into `main` through a pull request; the live site tracks `main`.
- nginx serves the site from `/home/ubuntu/smar/sar-frontend/build`. The deploy workflow on the `cicd-test` branch (`.github/workflows/aws.yml`, not merged into `production`) copies the source to `/home/ubuntu/smar/sar-frontend` on the server and runs `npm ci` and `npm run build` there. `npm ci` requires the committed `package-lock.json`.
- The browser calls relative paths only: `/api/...` for the Google Play backend and `/ios/...` for the App Store backend. `smar.nginx.conf` in `SAR-backend` routes them to `127.0.0.1:5001` and `127.0.0.1:5002` and strips the prefix.
- `public/index.html` holds the Content-Security-Policy. If you add a script, image or API origin, allow it there or the browser will block it.

Not recorded in the repositories (confirm with whoever has server access): the exact deploy steps used today and whether they build from `main` or `production`, the Node.js version on the server, the nginx config actually in use (the copy in `SAR-backend` listens on port 8080), and how TLS and the backend processes are managed.
