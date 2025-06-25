const crypto = require("crypto");

function md5Hash(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

function generateRSignature(payload, token, secretKey) {
    const time = Date.now().toString();
    const body = JSON.stringify(payload);
    const d = md5Hash(body);
    const raw = token + secretKey + time + "" + d;
    const r = md5Hash(raw);
    return { r, time };
}

module.exports = { md5Hash, generateRSignature };
