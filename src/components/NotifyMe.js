/****************
 * This component has both the "Notify Me" button and the email field as well.
 *
 */
import React, { useState } from "react";

import "../css/NotifyMe.css";

const NotifyMe = () => {
  const [email, setEmail] = useState("");
  const [invalidEmail, setInvalidEmail] = useState(false);

  const handleEmailInput = (event) => {
    setEmail(event.target.value);
  };

  const onNotifyClicked = () => {
    if (email === "" || !email.includes("@")) {
      setInvalidEmail(true);
      return;
    }
    else
    {
      setInvalidEmail(false);
    }
  };
  return (
    <div>
      <div class="notificationWrapper">
        <input placeholder="Email Address" class="emailField" onChange={handleEmailInput}></input>
        <button class="NotifyBox" onClick={onNotifyClicked}>
          <span class="NotifyText">NOTIFY ME</span>
        </button>
      </div>
      {invalidEmail && <p>Email is invalid, please try again</p>}
    </div>
  );
};

export default NotifyMe;
