const readline = require("readline");
const axios = require("axios");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const API_KEY = "4c2430aa-fb86-4abc-b816-f699081b3578";
const BASE_URL = "https://sandbox-api.okto.tech/api/v1/authenticate/email";

function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

(async () => {
  try {
    // Step 1: Ask for email
    const email = await askQuestion("Enter your email: ");
    
    // Step 2: Call API to send OTP
    const response = await axios.post(
      BASE_URL,
      { email },
      { headers: { "Content-Type": "application/json", "X-Api-Key": API_KEY } }
    );

    if (response.data.status !== "success") {
      console.log("Failed to send OTP. Please try again.");
      rl.close();
      return;
    }

    console.log("OTP sent to your email.");
    const token = response.data.data.token;

    // Step 3: Ask for OTP
    const otp = await askQuestion("Enter the OTP: ");
    
    // Step 4: Verify OTP
    const verifyResponse = await axios.post(
      `${BASE_URL}/verify`,
      { email, otp, token },
      { headers: { "Content-Type": "application/json", "X-Api-Key": API_KEY } }
    );

    if (verifyResponse.data.status !== "success") {
      console.log("OTP verification failed. Please try again.");
    } else {
      console.log("Authentication successful!");
      console.log("Auth Token:", verifyResponse.data.data.auth_token);
    }
  } catch (error) {
    console.error("Error:", error.response ? error.response.data : error.message);
  }
  rl.close();
})();