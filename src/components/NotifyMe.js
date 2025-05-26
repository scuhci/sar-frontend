/****************
 * This component has both the "Notify Me" button and the email field as well.
 * 
 */

import "../css/NotifyMe.css"

const NotifyMe = () => {
  return (
    <div class="notificationWrapper">
      <input placeholder="Email Address" class="emailField"></input>
      <button class="NotifyBox">
        <span class="NotifyText">NOTIFY ME</span>
      </button>
    </div>
  );
};

export default NotifyMe;
