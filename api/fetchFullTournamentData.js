const axios = require("axios");
const { fetchMatchDays } = require("./fetchMatchDays");

const MATCHES_URL =
  "https://bet-api.bangbet.com/api/bet/virtual/match/finished/list";
const HEADERS = { "Content-Type": "application/json" };

/**
 * Fetch and return ONLY the latest week matches
 */
async function fetchFullTournamentData(
  tournamentId,
  country = "ng",
  producer = "6"
) {
  const allDays = await fetchMatchDays(tournamentId, country, producer);

  if (allDays.length === 0) {
    console.log("No match days found from API.");
    return [];
  }

  const matchesByWeek = [];
  let seasonId = allDays.length > 0 ? allDays[0].seasonId: undefined;

  for (const day of allDays) {
    const payload = {
      country,
      tournamentId,
      producer,
      sportId: "sr:sport:1",
      betradarId: day.betradarId,
      seasonId: day.seasonId,
      number: day.number,
      scheduleDate: day.scheduleDate
    };

    try {
      const response = await axios.post(MATCHES_URL, payload, {
        headers: HEADERS
      });
      const matches = response.data.data;

      if (matches && matches.length > 0) {
        matchesByWeek.push({
          number: day.number,
          scheduleDate: day.scheduleDate,
          matches
        });
      }
    } catch (err) {
      console.error(
        `❌ Error fetching matches for Week ${day.number}:`,
        err.message
      );
    }
  }

  // this is how it will return[seasonId, [
  // { number: 1, scheduleDate: "2025-06-01", matches: [ ... ] },
  // { number: 2, scheduleDate: "2025-06-03", matches: [ ... ] },
  // ...
  // ]]

  return [seasonId, matchesByWeek]; // Array of weeks, each with number + matches[]
}

module.exports = { fetchFullTournamentData };
