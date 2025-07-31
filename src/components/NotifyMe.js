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
  const [emailNotifySuccess, setEmailNotifySuccess] = useState(false);
  const emailRegex =
    /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

  // in case perms is undefined
  const currentPermissions = permissions === true;
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
      if (email === "" || !emailRegex.test(email)) {
        setInvalidEmail(true);
        return;
      } else {
        setInvalidEmail(false);
        const response = await axios.post(
          `/email-notify?email=${email}&queryId=${pushQuery}`,
          {
            email: email,
            queryId: pushQuery, // unique ID for the specific query
          }
        );
        setEmailNotifySuccess(true);
        // console.log(response);
      }
    } catch (error) {
      console.log("Error trying to send Email to backend: ", error);
    }
  };
  return (
    <div>
      {!emailNotifySuccess && (
        <div className="notificationWrapper">
          <input
            placeholder="Email Address"
            className="emailField"
            value={email}
            onChange={handleEmailInput}
          ></input>
          <button className="NotifyBox" onClick={onNotifyClicked}>
            <span className="NotifyText">NOTIFY ME</span>
          </button>
        </div>
      )}
      {!invalidEmail && emailNotifySuccess && (
        <div className="notificationWrapper">
          <p className="notificationSuccess">
            Got it! We'll email you at{" "}
            <span className="notificationSuccessEmail">{email}</span> as soon as
            the results are ready.
          </p>
        </div>
      )}
      {invalidEmail && !emailNotifySuccess && (
        <p>Email is invalid, please try again</p>
      )}
    </div>
  );
};

export default NotifyMe;
