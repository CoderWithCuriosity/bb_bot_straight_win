const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://bet-api.bangbet.com/api/bet/virtual/match/finished/list';
const HEADERS = {
  'Content-Type': 'application/json'
};

const payloadTemplate = {
  country: 'ng',
  tournamentId: 'vf:tournament:31867',
  producer: "6",
  sportId: 'sr:sport:1',
  betradarId: 91071,
  seasonId: 'vf:season:2961081'
};

// Starting values based on your day 1 example
let scheduleDate = 1748649772000;
let number = 1;

// How many days you want to fetch
const MAX_DAYS = 50;

const outputFilePath = path.join(__dirname, 'matches.json');
const allMatches = [];

async function fetchDays() {
  for (let day = 1; day <= MAX_DAYS; day++) {
    const payload = {
      ...payloadTemplate,
      number,
      scheduleDate
    };

    try {
      const response = await axios.post(BASE_URL, payload, { headers: HEADERS });
      const matches = response.data.data;

      if (!matches || matches.length === 0) {
        console.log(`No matches found for number ${number}, stopping.`);
        break;
      }

      console.log(`Fetched day ${day} with number ${number}. Matches: ${matches.length}`);
      allMatches.push({ day, number, scheduleDate, matches });

      // Increment for next day
      scheduleDate += 220000; // 3 minutes and 40 seconds
      number += 1;

      await new Promise(res => setTimeout(res, 300)); // polite delay
    } catch (err) {
      console.error(`Error fetching day ${day}:`, err.message);
      break;
    }
  }

  fs.writeFileSync(outputFilePath, JSON.stringify(allMatches, null, 2));
  console.log(`Saved data for ${allMatches.length} days to ${outputFilePath}`);
}

fetchDays();
