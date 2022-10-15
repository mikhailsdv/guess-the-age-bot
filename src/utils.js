const {InlineKeyboard} = require("grammy");
const arrayRandom = arr => {
	return arr[Math.round(Math.random() * (arr.length - 1))]
}

const revealNumberSign = n => (n > 0 ? `+${n}` : n)

const trim = str => str.replace(/\t+/gm, "")

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

const escape = str =>
	str
		.replace(/_/g, "\\_")
		.replace(/\*/g, "\\*")
		.replace(/\[/g, "\\[")
		.replace(/`/g, "\\`")

const bold = str =>
	`*${str.replace(/\*+/g, match => `*${match.replace(/(.)/g, "\\$1")}*`)}*`

const numberWithSpaces = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")

const iterateObject = (obj, f) => {
	let index = 0
	for (const key in obj) {
		f(key, obj[key], index)
		index++
	}
}

const findExact => (arr, field, value) => arr.find(item => item[field] === value)

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

module.exports = {
	arrayRandom,
	revealNumberSign,
	trim,
	pluralize,
	escape,
	bold,
	numberWithSpaces,
	iterateObject,
	findExact,
	getAddToGroupButton,
	getSessionKey,
	isGroupChat,
}
