import { Container, Typography } from "@mui/material";
import Link from "@mui/material/Link";
import { Link as RouterLink } from "react-router-dom";
import Footer from "../components/Footer";
import "../css/About.css";

const NotFound = () => (
  <Container sx={{ marginTop: 7 }}>
    <div className="app-container">
      <div className="content">
        <Typography variant="h3" className="about-header">
          Page not found
        </Typography>
        <Typography variant="body1" fontSize="18px" className="about-text">
          There is no page at this address. Check the link, or go to the{" "}
          <Link component={RouterLink} to="/">
            search page
          </Link>
          ,{" "}
          <Link component={RouterLink} to="/toplists">
            Top Charts
          </Link>{" "}
          or the{" "}
          <Link component={RouterLink} to="/userguide">
            User Guide
          </Link>
          .
        </Typography>
      </div>
      <Footer />
    </div>
  </Container>
);

export default NotFound;
