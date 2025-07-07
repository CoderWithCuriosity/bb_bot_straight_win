const { withdrawFromBangBet } = require("../api/withdraw");
const fs = require("fs");
const path = require("path");

const TOKEN_PATH = path.join(__dirname, "../token.json");

// Read stored login credentials
function getLoginData() {
  if (!fs.existsSync(TOKEN_PATH)) {
    fs.writeFileSync(
      TOKEN_PATH,
      JSON.stringify([{ token: "", secretKey: "" }]),
      "utf8"
    );
  }

  const data = fs.readFileSync(TOKEN_PATH, "utf8");
  return JSON.parse(data)[0];
}

// Save new login credentials
function storeLoginData(credentials) {
  if (credentials.token && credentials.secretKey) {
    fs.writeFileSync(
      TOKEN_PATH,
      JSON.stringify([{ token: credentials.token, secretKey: credentials.secretKey }], null, 2),
      "utf8"
    );
  }
}

// Utility function to withdraw a fixed amount
async function withdrawDailyAmount(amount = 100) {
  const credentials = getLoginData();

  if (!credentials || !credentials.token || !credentials.secretKey) {
    console.log("❌ Token not found! Please refresh credentials.");
    return;
  }

  console.log(`💸 Attempting to withdraw ₦${amount}...`);
  const result = await withdrawFromBangBet(
    credentials.token,
    credentials.secretKey,
    storeLoginData,
    amount
  );

  if (result && result.success) {
    console.log("✅ Withdrawal successful:", result.data);
  } else {
    console.log("❌ Withdrawal failed:", result?.info || result);
  }

  return result;
}

module.exports = { withdrawDailyAmount };
