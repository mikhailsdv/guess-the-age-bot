const path = require("path")
require("dotenv").config({path: path.resolve(__dirname, "../.env")})
const {BOT_TOKEN, REQUEST_TIMEOUT, ROUNDS, ROUND_DURATION, TIMER_STEPS} =
	process.env

module.exports = {
	BOT_TOKEN,
	REQUEST_TIMEOUT: Number(REQUEST_TIMEOUT),
	ROUNDS: Number(ROUNDS),
	ROUND_DURATION: Number(ROUND_DURATION),
	TIMER_STEPS: Number(TIMER_STEPS),
}
