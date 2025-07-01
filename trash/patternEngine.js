// 📁 strategy/patternEngine.js
const fs = require("fs");
const path = require("path");
const { getMatchOdds } = require("../api/matches");

// Files to persist data
const shortOddsFile = path.join(__dirname, "../storage/shortOddsLosses.json");
const bttsFile = path.join(__dirname, "../storage/bttsTracker.json");
const drawFile = path.join(__dirname, "../storage/draws.json");
const resultPendingFile = path.join(__dirname, "../storage/pendingResults.json");

// Initialize files if not exist
function initFile(file, defaultValue = []) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultValue));
  }
}

initFile(shortOddsFile);
initFile(bttsFile);
initFile(drawFile);
initFile(resultPendingFile);

function logShortOdds(matchId, odds, result) {
  const data = JSON.parse(fs.readFileSync(shortOddsFile, "utf8"));
  data.push({ matchId, odds, result });
  if (data.length > 10) data.shift();
  fs.writeFileSync(shortOddsFile, JSON.stringify(data));
}

function last3ShortOddsLosses() {
  const data = JSON.parse(fs.readFileSync(shortOddsFile, "utf8"));
  const last3 = data.slice(-3);
  return last3.length === 3 && last3.every(d => d.result === "L");
}

function logBTTSResult(matchId, result) {
  const data = JSON.parse(fs.readFileSync(bttsFile, "utf8"));
  data.push({ matchId, result });
  if (data.length > 10) data.shift();
  fs.writeFileSync(bttsFile, JSON.stringify(data));
}

function shouldTriggerBTTSYes() {
  const data = JSON.parse(fs.readFileSync(bttsFile, "utf8"));
  const last2 = data.slice(-2);
  return last2.length === 2 && last2.every(r => r.result === "NO");
}

function logDraw(matchId, score) {
  if (score === "0-0") {
    const data = JSON.parse(fs.readFileSync(drawFile, "utf8"));
    data.push(matchId);
    if (data.length > 5) data.shift();
    fs.writeFileSync(drawFile, JSON.stringify(data));
  }
}

function avoidNextZeroZero() {
  const data = JSON.parse(fs.readFileSync(drawFile, "utf8"));
  return data.length > 0;
}

function storeMatchForResultCheck(match) {
  const data = fs.existsSync(resultPendingFile)
    ? JSON.parse(fs.readFileSync(resultPendingFile, "utf8"))
    : [];

  data.push({ matchId: match.id, addedAt: Date.now() });
  fs.writeFileSync(resultPendingFile, JSON.stringify(data));
}

async function updateAllPendingResults() {
  if (!fs.existsSync(resultPendingFile)) return;

  const pending = JSON.parse(fs.readFileSync(resultPendingFile, "utf8"));
  const now = Date.now();
  const stillPending = [];

  for (const entry of pending) {
    if (now - entry.addedAt < 2 * 60 * 1000) {
      stillPending.push(entry);
      continue;
    }

    const match = await getMatchOdds(entry.matchId);

    if (!match || match.matchStatus !== "ended") {
      stillPending.push(entry);
      continue;
    }

    const homeGoals = match.homeScore;
    const awayGoals = match.awayScore;
    const scoreStr = `${homeGoals}-${awayGoals}`;

    if (homeGoals > awayGoals) logShortOdds(match.id, 1.3, "W");
    else if (homeGoals < awayGoals) logShortOdds(match.id, 1.3, "L");
    else logShortOdds(match.id, 1.3, "D");

    const btts = homeGoals > 0 && awayGoals > 0 ? "YES" : "NO";
    logBTTSResult(match.id, btts);

    if (scoreStr === "0-0") logDraw(match.id, scoreStr);
  }

  fs.writeFileSync(resultPendingFile, JSON.stringify(stillPending));
}

module.exports = {
  logShortOdds,
  last3ShortOddsLosses,
  logBTTSResult,
  shouldTriggerBTTSYes,
  logDraw,
  avoidNextZeroZero,
  storeMatchForResultCheck,
  updateAllPendingResults
};
