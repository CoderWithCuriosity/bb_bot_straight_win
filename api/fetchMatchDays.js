const axios = require("axios");

const MATCH_DAYS_URL =
  "https://bet-api.bangbet.com/api/bet/virtual/match/matchDayList";
const HEADERS = { "Content-Type": "application/json" };

async function fetchMatchDays(
  tournamentId,
  country = "ng",
  producer = "6",
  startFromDay = 1
) {
  const payload = { tournamentId, country, producer };

  try {
    const response = await axios.post(MATCH_DAYS_URL, payload, {
      headers: HEADERS
    });

    if (response.data.result !== 1 || !Array.isArray(response.data.data)) {
      console.error("Unexpected response from matchDayList");
      return [];
    }

    // Filter days to those with number >= startFromDay
    const filteredDays = response.data.data.filter(
      day => day.number >= startFromDay
    );
    return filteredDays;
  } catch (err) {
    console.error("Error fetching match days:", err.message);
    return [];
  }
}

async function fetchMatchDaysDifference(
  tournamentId,
  country = "ng",
  producer = "6",
  startFromDay = 1
) {
  const payload = { tournamentId, country, producer };

  try {
    const response = await axios.post(MATCH_DAYS_URL, payload, {
      headers: HEADERS
    });

    if (response.data.result !== 1 || !Array.isArray(response.data.data)) {
      console.error("Unexpected response from matchDayList");
      return [null, null];
    }

    // Get Days Differnce
    const days = response.data.data;
    if(days.length > 1
    ){
      const daysDiff = Math.abs(days[0]?.scheduleDate - days[1]?.scheduleDate);
      return [days[0].scheduleDate, daysDiff];
    }
    return [null, null];
  } catch (err) {
    console.error("Error fetching match days:", err.message);
    return [null, null];
  }
}

module.exports = { fetchMatchDays, fetchMatchDaysDifference };
