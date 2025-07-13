var { SendMailClient } = require("zeptomail");

async function sendEmail(url, token, email, name, subject, messageBody) {
  try {
    new SendMailClient({ url, token }).sendMail({
      from: {
        address: "noreply@clonemytrips.com",
        name: "noreply",
      },
      to: [
        {
          email_address: {
            address: email,
            name: name,
          },
        },
      ],
      subject: subject,
      htmlbody: messageBody,
    });
  } catch (error) {
    console.error(error);
  }
}

module.exports = {
  sendEmail,
};
