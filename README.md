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

1. Clone down the `sar-frontend` and `SAR-backend` repositories to your local machine.

2. To use our stable, deployed branch: `git checkout production` in the frontend repository.  You will need to open 2 backend terminals, 1 with `git checkout gplay-backend` and 1 with `git checkout ios-backend`. By default, the production frontend connects directly to the live SMAR backend. If you would like to run the backends locally, you will need to modify backend calls to go to your local machine rather than the live backend. A guide for this will be provided soon!

4. To start `sar-backend` : Run `node index.js`
   
5. To start `sar-ios-backend`: Run `node index.js`

6. To start `sar-frontend` : Run `npm-start`
