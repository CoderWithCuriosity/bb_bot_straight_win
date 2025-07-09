const fs = require("fs");
const path = require("path");
const { getMatchOdds } = require("../api/matches");

const DATA_FILE = path.join(__dirname, "../data.json");
const STRICT_ORDER = false;

// === UTILITY FUNCTIONS ===

function parseStat(val) {
  return parseFloat(parseFloat(val).toFixed(2));
}

function statsMatch(a, b) {
  return (
    parseStat(a.attack) === parseStat(b.attack) &&
    parseStat(a.defense) === parseStat(b.defense) &&
    parseStat(a.strength) === parseStat(b.strength) &&
    parseStat(a.chaos) === parseStat(b.chaos)
  );
}

function matchExists(data, teamA, teamB) {
  return data.some(entry => {
    const a1 = entry.teamA;
    const b1 = entry.teamB;
    const direct = statsMatch(a1, teamA) && statsMatch(b1, teamB);
    const reverse = statsMatch(a1, teamB) && statsMatch(b1, teamA);
    return STRICT_ORDER ? direct : direct || reverse;
  });
}

// === MAIN OPERATIONS ===

async function updateMatchOutcomes() {
  if (!fs.existsSync(DATA_FILE)) return;

  const rawData = fs.readFileSync(DATA_FILE, "utf-8");
  const matches = JSON.parse(rawData);

  for (let match of matches) {
    if (match.outcome !== "") continue;

    const oddsData = await getMatchOdds(match.matchId);
    if (!oddsData || oddsData.matchStatus !== "ended") continue;

    const homeScore = oddsData.homeScore;
    const awayScore = oddsData.awayScore;

    let outcome = 2;
    if (homeScore > awayScore) outcome = 1;
    else if (homeScore < awayScore) outcome = 3;

    const correctScore = `${homeScore}:${awayScore}`;

    match.outcome = outcome;
    match.correct_score = correctScore;

    if ("winner" in match) {
      delete match.winner;
    }
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(matches, null, 2), "utf-8");
}

function findMatchingOutcome(teamA, teamB) {
  if (!fs.existsSync(DATA_FILE)) return null;

  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));

  for (const match of data) {
    const a1 = match.teamA;
    const b1 = match.teamB;

    const directMatch = statsMatch(a1, teamA) && statsMatch(b1, teamB);
    const reverseMatch = statsMatch(a1, teamB) && statsMatch(b1, teamA);
    const isMatch = STRICT_ORDER ? directMatch : directMatch || reverseMatch;

    if (isMatch && match.outcome && match.correct_score) {
      return {
        outcome: match.outcome,
        correct_score: match.correct_score
      };
    }
  }

  return null;
}

/**
 * Adds a new match entry to data.json using match data + team stats
 * @param {Object} matchObj - match object from Betradar or API
 * @param {Object} teamAStats - { name, attack, defense, strength, chaos }
 * @param {Object} teamBStats - { name, attack, defense, strength, chaos }
 * @param {Number} week
 */

function addMatchEntry(
  matchObj,
  teamAStats,
  teamBStats,
  week = 1,
) {
  const data = fs.existsSync(DATA_FILE)
    ? JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"))
    : [];

  if (matchExists(data, teamAStats, teamBStats)) {
    return;
  }

  const newEntry = {
    matchId: matchObj.id,
    teamA: teamAStats,
    teamB: teamBStats,
    tournament: matchObj.tournamentName || "",
    week: week,
    predictedPick: "",
    odds: "",
    outcome: "",
    correct_score: ""
  };

  data.push(newEntry);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

module.exports = {
  updateMatchOutcomes,
  findMatchingOutcome,
  addMatchEntry
};
