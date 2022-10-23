const {InlineKeyboard} = require("grammy")

const arrayRandom = arr => {
	return arr[Math.round(Math.random() * (arr.length - 1))]
}

const revealNumberSign = n => (n > 0 ? `+${n}` : n)

const trim = str => str.replace(/\t+|^\n+|\n+$/g, "")

const pluralize = (n, singular, plural, accusative) => {
	n = Math.abs(n)
	const n10 = n % 10
	const n100 = n % 100
	if (n10 === 1 && n100 !== 11) {
		return singular
	}
	if (2 <= n10 && n10 <= 4 && !(12 <= n100 && n100 <= 14)) {
		return plural
	}
	return accusative
}

const numberWithSpaces = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")

const iterateObject = (obj, f) => {
	let index = 0
	for (const key in obj) {
		f(key, obj[key], index)
		index++
	}
}

const findExact = (arr, field, value) => arr.find(item => item[field] === value)

const getAddToGroupButton = ctx => ({
	reply_markup: new InlineKeyboard().url(
		"Добавить бота в группу 👥",
		`https://t.me/${ctx.me.username}?startgroup=add`
	),
})

const getSessionKey = ctx => {
	// Let all users in a group chat share the same session
	return ctx.chat?.id < 0 ? ctx.chat.id.toString() : undefined
}

const isGroupChat = ctx => Boolean(ctx?.chat?.id < 0)

const wait = delay => new Promise(resolve => setTimeout(resolve, delay))

const buildCallbackData = (...theArgs) => theArgs.join(",")

const parseCallbackData = str => {
	const split = str.split(",")
	return {
		command: split[0],
		data: split.slice(1),
	}
}

const getChangePhotoButton = ctx => ({
	reply_markup: new InlineKeyboard().text(
		"🔁 Сменить фото",
		buildCallbackData("change", ctx.chat.id)
	),
})

const countPoints = (realAge, userAnswer) => Math.round(((realAge - Math.abs(realAge - userAnswer)) / realAge) * 100)

module.exports = {
	arrayRandom,
	revealNumberSign,
	trim,
	pluralize,
	numberWithSpaces,
	iterateObject,
	findExact,
	getAddToGroupButton,
	getChangePhotoButton,
	getSessionKey,
	isGroupChat,
	wait,
	buildCallbackData,
	parseCallbackData,
	countPoints,
}
