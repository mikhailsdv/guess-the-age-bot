const { Telegraf, Telegram } = require("telegraf")
const config = require("./config")
const db = require("./db")
const fs = require("fs")
const {arrayRandom, trueTrim, plusminus, pluralize} = require("./functions")
const telegram = new Telegram(config.token)
const bot = new Telegraf(config.token)
let timeouts = {}

const getGreetMessage = isGroup => trueTrim(`
	👋 Привет. Я — бот для игры в «угадай возраст» в групповых чатах.

	📋 Правила просты: я кидаю вам фото человека, а ваша задача угадать его возраст. Чем точнее вы отвечаете, тем меньше баллов теряете.
	${isGroup ? "" : "\n😉 Для начала, добавь меня в чат и вызови /game.\n"}
	*Команды*
	/game - Начать игру
	/stop - Остановить игру
	/donate - Поддержать проект деньгами

	Автор: @mikhailsdv
	Мой канал: @FilteredInternet
`)
const getRandomPerson = () => {
	let imagePath = "./photos"
	let fimeName = arrayRandom(fs.readdirSync(imagePath))
	let age = Number(fimeName.match(/^(\d+)/)[1])
	return {
		age: age,
		photo: `${imagePath}/${fimeName}`
	}
}
const createChat = chatId => {
	let data = {
		isPlaying: true,
		//rounds: 5,
		rightAnswer: null,
		membersAnswers: {},
		members: {}
	}
	db.insert(chatId, data)
}
const getChat = chatId => {
	return db.get(chatId)
}
const setRightAnswer = (chatId, answer) => {
	let chat = getChat(chatId)
	chat.rightAnswer = answer
	db.update(chatId, ch => chat)
}
const memberAddScore = (chatId, memberId, score) => {
	let chat = getChat(chatId)
	db.update(chatId, ch => {
		ch.members[memberId].score.game += score
		ch.members[memberId].score.total += score
		return ch
	})
}
const memberAdd = (chatId, memberId, firstName) => {
	let chat = getChat(chatId)
	let member = chat.members[memberId]
	if (!member) {
		db.update(chatId, ch => {
			ch.members[memberId] = {
				firstName: firstName,// || member.firstName,
				score: {
					game: 0,
					total: 0
				},
			}
			return ch
		})
	}
	if (member && member.firstName !== firstName) {
		db.update(chatId, ch => {
			ch.members[memberId].firstName = firstName
			return ch
		})
	}
}
const stopGame = (ctx, chatId) => {
	let chat = getChat(chatId)
	if (chat && chat.isPlaying) {
		for (let tim in timeouts[chatId]) {
			clearTimeout(timeouts[chatId][tim])
		}
		chat.isPlaying = false
		chat.rightAnswer = null
		chat.membersAnswers = {}
		let top = []
		for (let key in chat.members) {
			let member = chat.members[key]
			top.push({
				text: `*${member.firstName}*: ${member.score.game} ${pluralize(member.score.game, "очко", "очка", "очков")}`,
				score: member.score.game
			})
			member.score.game = 0
		}
		db.update(chatId, ch => chat)
		if (top.length > 0) {
			ctx.replyWithMarkdown(trueTrim(`
				*🏁 А вот и победители:*

				${top.sort((a, b) => b.score - a.score).map((item, i) => `${["🏆","🎖","🏅"][i] || "🔸"} ${i + 1}. ${item.text}`).join("\n")}

				❤️ Канал автора, где иногда публикуются новые прикольные боты @FilteredInternet.
				🔄 /game - Еще разок?
			`))
		}
	}
	else {
		ctx.reply("❌ Игра не была запущена. Вы можете запутить ее командой /start.")
	}
}
const startGame = (ctx, chatId) => {
	let round = async r => {
		let person = getRandomPerson()
		let answer = person.age
		setRightAnswer(chatId, answer)
		let guessMessage = await ctx.replyWithPhoto({
			source: person.photo,
		}, {
			caption: `*Раунд ${r + 1}/${config.rounds}*\nСколько, по-вашему, лет этому человеку?\n\n${"⬜".repeat(config.timerSteps)}`,
			parse_mode: "Markdown"
		})

		let tm = 1
		timeouts[chatId].timer = setInterval(() => {
			telegram.editMessageCaption(
				ctx.chat.id,
				guessMessage.message_id,
				null,
				`*Раунд ${r + 1}/${config.rounds}*\nСколько, по-вашему, лет этому человеку?\n\n${"⬛".repeat(tm)}${"⬜".repeat(config.timerSteps - tm)}`,
				{
					parse_mode: "Markdown"
				}
			)
			tm++
			if (tm >= (config.timerSteps + 1)) clearInterval(timeouts[chatId].timer)
		}, config.waitDelay / (config.timerSteps + 1))
		
		timeouts[chatId].round = setTimeout(() => {
			let top = []
			let chat = getChat(chatId)
			for (let userId in chat.membersAnswers) {
				let memberAnswer = chat.membersAnswers[userId]
				let firstName = chat.members[userId].firstName
				let add = answer - Math.abs(answer - memberAnswer)
				memberAddScore(chatId, userId, add)
				let newScore = chat.members[userId].score.game + add
				top.push({
					text: `*${firstName}*: ${plusminus(add)}`,
					score: add,
					memberAnswer: memberAnswer
				})
			}
			db.update(chatId, ch => {
				for (let key in ch.membersAnswers) {
					ch.membersAnswers[key] = 0
				}
				return ch
			})
			
			if (!top.every(item => item.memberAnswer === 0)) {
				ctx.replyWithMarkdown(
					trueTrim(`
						Человеку на этом фото *${answer} ${pluralize(answer, "год", "года", "лет")}*. Вот, кто бы ближе всего:

						${top.sort((a, b) => b.score - a.score).map((item, i) => `${["🏆","🎖","🏅"][i] || "🔸"} ${i + 1}. ${item.text}`).join("\n")}
					`),
					{
						reply_to_message_id: guessMessage.message_id,
					}
				)
			}
				
			else {
				ctx.reply("🤔 Похоже, вы не играете. Ок, завершаю игру...")
				stopGame(ctx, chatId)
				return
			}

			if (r === config.rounds - 1) {
				timeouts[chatId].stopGame = setTimeout(() => {
					stopGame(ctx, chatId)
				}, 500)
			}
			else {
				timeouts[chatId].afterRound = setTimeout(() => {
					round(++r)
				}, 2500)
			}
		}, config.waitDelay)
	}
	round(0)
}

bot.catch((err, ctx) => {
	console.log("\x1b[41m%s\x1b[0m", `Ooops, encountered an error for ${ctx.updateType}`, err)
})

bot.start(async (ctx) => {
	ctx.replyWithMarkdown(getGreetMessage(ctx.update.message.chat.id < 0))
})

bot.command("game", (ctx) => {
	let message = ctx.update.message
	if (message.chat.id < 0) {
		let chatId = message.chat.id
		let chat = getChat(chatId)
		if (chat) {
			if (chat.isPlaying) {
				return ctx.reply("❌ У вас уже запущена игра. Вы можете ее остановить командой /stop.")
			}
			else {
				chat.isPlaying = true
				for (let key in chat.members) {
					let member = chat.members[key]
					member.score.game = 0
				}
				db.update(chatId, ch => chat)
			}
		}
		else {
			createChat(chatId)
		}
		ctx.replyWithMarkdown("*Игра начинается!*")
		timeouts[chatId] = {}
		timeouts[chatId].beforeGame = setTimeout(() => {
			startGame(ctx, chatId)
		}, 1000)
	}
	else {
		ctx.reply("❌ Эта команда доступна только для чатов.")
	}
})

bot.command("stop", (ctx) => {
	let message = ctx.update.message
	if (message.chat.id < 0) {
		let chatId = message.chat.id
		stopGame(ctx, chatId)
	}
	else {
		ctx.reply("❌ Эта команда доступна только для чатов.")
	}
})

bot.command("donate", (ctx) => {
	return ctx.replyWithMarkdown(trueTrim(`
		Вот список доступных кошельков.

		Яндекс.Деньги: \`410018465529632\`
		QIWI: \`+77025852595\`
		BTC: \`1MDRDDBURiPEg93epMiryCdGvhEncyAbpy\`
		Kaspi (Казахстан): \`5169497160435198\`
	`))
})

bot.on("message", async (ctx) => {
	let message = ctx.update.message
	if (message.chat.id < 0) {
		let chatId = message.chat.id
		let chat = getChat(chatId)
		let fromId = message.from.id
		if (
			chat &&
			chat.isPlaying &&
			chat.rightAnswer &&
			[0, undefined].includes(chat.membersAnswers[fromId]) &&
			/^-?\d+$/.test(message.text)
		) {
			let memberAnswer = Number(message.text)
			if (memberAnswer <= 0 || memberAnswer >= 120) {
				return ctx.reply("Ответ вне допустимого диапазона (1 - 120)")
			}
			chat.membersAnswers[fromId] = Number(message.text)
			db.update(chatId, ch => chat)
			memberAdd(chatId, fromId, message.from.first_name)
			ctx.replyWithMarkdown(`📝 *${message.from.first_name}*, твой ответ принят (${memberAnswer}).`)
		}
		else if (message.new_chat_member && message.new_chat_member.id === config.botId) {
			ctx.replyWithMarkdown(getGreetMessage(true))
		}
	}
})

bot.launch();