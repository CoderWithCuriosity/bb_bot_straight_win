const axios = require('axios');
const { generateRSignature } = require('../utils/hash');
const { loginToBangBet } = require('./auth');

async function withdrawFromBangBet(token, secretKey, storeCred, amount = 100, retryCount = 0) {
    const MAX_RETRIES = 2;
    const payload = {
        amount,
        platform: "3" // Assuming "3" is OPay
    };

    const { r, time } = generateRSignature(payload, token, secretKey);

    try {
        const res = await axios.post("https://casino-api.bangbet.com/api/payments/opay/withdraw", payload, {
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
                "Accept": "application/json, text/plain, */*",
                "R": r,
                "Time": time,
                "Token": token,
                "Origin": "https://www.bangbet.com",
                "Referer": "https://www.bangbet.com"
            }
        });

        if (res.data.info === 'Invalid operation 105.') {
            if (retryCount < MAX_RETRIES) {
                console.log(`🔄 Token expired. Retrying withdrawal ${retryCount + 1}/${MAX_RETRIES}...`);
                const credentials = await loginToBangBet();
                storeCred(credentials);
                return withdrawFromBangBet(credentials.token, credentials.secretKey, storeCred, amount, retryCount + 1);
            } else {
                console.error("❗ Max retry attempts reached. Withdrawal failed.");
            }
        }

        return res.data.success;
    } catch (err) {
        console.error("❌ Error during withdrawal:", err.response?.data || err.message);
        return null;
    }
}

module.exports = { withdrawFromBangBet };
