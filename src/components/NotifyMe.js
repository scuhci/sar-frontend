/****************
 * This component has both the "Notify Me" button and the email field as well.
 *
 */
import React, { useState } from "react";
import axios from "axios";

import "../css/NotifyMe.css";

const NotifyMe = ({ country, query, permissions, queryTime }) => {
  //const pushQuery = "c:" + country + "_t:" + query + "_p:" + permissions + "_t:" + time; <-- match this in the backend
  const [email, setEmail] = useState("");
  const [invalidEmail, setInvalidEmail] = useState(false);

  const currentPermissions = permissions !== undefined || permissions === true;
  const pushQuery =
    "c:" +
    country +
    "_t:" +
    query +
    "_p:" +
    currentPermissions +
    "_t:" +
    queryTime;

  const handleEmailInput = (event) => {
    setEmail(event.target.value);
  };

  const onNotifyClicked = async () => {
    try {
      if (email === "" || !email.includes("@")) {
        setInvalidEmail(true);
        return;
      } else {
        setInvalidEmail(false);
        const response = await axios.post(`/email-notify?email=${email}&queryId=${pushQuery}`, {
          email: email,
          queryId: pushQuery, // unique ID for the specific query
        });

        console.log(response);
      }
    } catch (error) {
      console.log("Error trying to send Email to backend: ", error);
    }
  };
  return (
    <div>
      <div class="notificationWrapper">
        <input
          placeholder="Email Address"
          class="emailField"
          onChange={handleEmailInput}
        ></input>
        <button class="NotifyBox" onClick={onNotifyClicked}>
          <span class="NotifyText">NOTIFY ME</span>
        </button>
      </div>
      {invalidEmail && <p>Email is invalid, please try again</p>}
    </div>
  );
};

export default NotifyMe;
