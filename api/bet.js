const axios = require('axios');
const { generateRSignature } = require('../utils/hash');
const { deviceId } = require('../config');
const { loginToBangBet } = require('./auth');

async function placeBet(token, secretKey, selections, storeCred, amount = 100, retryCount = 0) {
    const MAX_RETRIES = 2;

    const payload = {
        betType: 1,
        couponId: 0,
        items: selections.map(item => ({ ...item, amount: 0 })),
        amount,
        payAmount: amount,
        exciseTax: 0,
        channel: "H5",
        shareBy: null,
        bets: [{
            outcomeNum: selections.length,
            num: 1,
            amount
        }],
        accept: 1,
        device: deviceId
    };

    const { r, time } = generateRSignature(payload, token, secretKey);

    try {
        const res = await axios.post("https://bet-api.bangbet.com/api/bet/order/bet", payload, {
            headers: {
                "Content-Type": "application/json",
                "R": r,
                "Token": token,
                "Time": time
            }
        });

            console.log("✅ Bet Result:", res.data);

        if (res.data.info == 'illegal token') {
            if (retryCount < MAX_RETRIES) {
                console.log(`🔄 Token expired. Retrying attempt ${retryCount + 1}/${MAX_RETRIES}...`);
                const credentials = await loginToBangBet();
                storeCred(credentials);
                console.log(`New Credentials Retrieved`)
                return placeBet(credentials.token, credentials.secretKey, selections, storeCred, amount, retryCount + 1);
            } else {
                console.error("❗ Max retry attempts reached. Bet failed.");
            }
        } 
    } catch (err) {
        console.error("❌ Error placing bet:", err.response?.data || err.message);
    }
}

module.exports = { placeBet };
