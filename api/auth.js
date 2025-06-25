const axios = require('axios');
const { account, password, nickname, country, platform } = require('../config');

async function loginToBangBet() {
    const url = 'https://casino-api.bangbet.com/api/center/login';
    const payload = {
        account,
        password,
        nickname,
        country,
        platform,
        device: { udid: account }
    };

    try {
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.data?.success) {
            console.log('Login successful!');
            return {
                token: response.data.data.token,
                secretKey: response.data.data.secretKey
            };
        } else {
            console.error('Login failed:', response.data.info || 'Unknown error');
            return null;
        }
    } catch (error) {
        console.error('Login error:', error.message);
        return null;
    }
}

module.exports = { loginToBangBet };
