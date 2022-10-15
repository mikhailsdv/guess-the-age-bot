const path = require("path")
require("dotenv").config({path: path.resolve(__dirname, "../.env")})
const {BOT_TOKEN, REQUEST_TIMEOUT, ROUNDS, ROUND_DURATION, TIMER_STEPS} =
	process.env

const fs = require("fs")
const {
	Bot,
	InputFile,
	InlineKeyboard,
	HttpError,
	GrammyError,
	session,
} = require("grammy")
const {hydrateReply, parseMode} = require("@grammyjs/parse-mode")
const {
	numberWithSpaces,
	arrayRandom,
	trim,
	revealNumberSign,
	pluralize,
	escape,
	bold,
	findExact,
	getAddToGroupButton,
	getSessionKey,
	isGroupChat,
} = require("./utils")
const {
	onStart,
	onStop,
	onFinish,
	getRoundMessage,
	onNewAnswer,
} = require("./logic")

const bot = new Bot(BOT_TOKEN)
bot.use(hydrateReply)
bot.api.config.use(parseMode("Markdown"))

/*interface GameState {
	timeouts: object
	currentGuessMessageId: number
	currentRound: number
	currentTime: number
	answersOrder: []
	isPlaying: false
	members: {
		firstName: string
		isPlaying: boolean
		answer: string
		gameScore: number
		totalScore: number
	}[]
}*/

const handlers = {
	greet: async ctx =>
		await ctx.replyWithMarkdownV1(
			trim(`
			👋 Привет. Я — бот для игры в «угадай возраст» в групповых чатах.
		
			📋 Правила просты: я кидаю вам фото человека, а ваша задача быстро угадать его возраст. Просто отправьте предполагаемый возраст цифрами в чат и я учту ваш голос. Чем точнее вы отвечаете, тем меньше баллов теряете.
			${
				isGroupChat(ctx)
					? ""
					: "\n😉 Для начала, добавь меня в *групповой чат* и вызови /game.\n"
			}
			*Команды:*
			/game - 🕹 Новая игра
			/stop - 🛑 Остановить игру
			/top - 🔝 Рейтинг игроков чата
			/chart - 🌎 Глобальный рейтинг
			/donate - 💸 Поддержать проект
		
			Канал автора: @FilteredInternet ❤️ 
		`),
			isGroupChat(ctx)
				? null
				: {
						reply_markup: new InlineKeyboard().url(
							"Добавить бота в группу 👥",
							`https://t.me/${ctx.me.username}?startgroup=add`
						),
				  }
		),
	onlyGroups: async ctx =>
		await ctx.replyWithMarkdownV1(
			"❌ Эта команда доступна только для *групповых чатов*. Создайте чат с друзьями и добавьте туда бота.",
			isGroupChat(ctx)
				? null
				: {
						reply_markup: new InlineKeyboard().url(
							"Добавить бота в группу 👥",
							`https://t.me/${ctx.me.username}?startgroup=add`
						),
				  }
		),
}

const createMember = firstName => {
	console.log("createMember")
	return {
		firstName: firstName,
		isPlaying: true,
		answer: null,
		gameScore: 0,
		totalScore: 0,
	}
}

bot.api.config.use((prev, method, payload, signal) => {
	const controller = new AbortController()
	if (signal) signal.onabort = controller.abort.bind(controller)
	setTimeout(
		() => controller.abort(),
		method === "getUpdates" ? 31000 : REQUEST_TIMEOUT
	)

	return prev(method, payload, controller.signal)
})

bot.catch(err => {
	const ctx = err.ctx
	console.error(`Error while handling update ${ctx.update.update_id}:`)
	const e = err.error
	if (e instanceof GrammyError) {
		console.error("Error in request:", e.description)
	} else if (e instanceof HttpError) {
		console.error("Could not contact Telegram:", e)
	} else {
		console.error("Unknown error:", e)
	}
})

bot.use(session({getSessionKey}))

bot.command("start", async ctx => {
	await handlers.greet(ctx)
})

bot.command("game", async ctx => {
	console.log("game")
	const message = ctx.update.message
	if (!isGroupChat(ctx)) {
		//PM, skipping
		return await handlers.onlyGroups(ctx)
	}

	const chatRecord = getChat(ctx.chat.id)
	if (chatRecord) {
		if (ctx.session?.isPlaying) {
			return await ctx.reply(
				"❌ У вас уже запущена игра. Вы можете ее остановить командой /stop."
			)
		} else {
			ctx.session.isPlaying = true
			ctx.session.members.forEach(member => (member.gameScore = 0))
		}
	} else {
		await createChat(chatId)
	}

	await onStart(ctx)
})

bot.command("stop", async ctx => {
	console.log("stop")
	if (ctx.chat.id < 0) {
		//if chat
		await onStop(ctx)
	} else {
		await handlers.onlyGroups(ctx)
	}
})

bot.command("top", async ctx => {
	/*console.log("top")
	const message = ctx.update.message
	if (message.chat.id < 0) {
		const chatId = message.chat.id
		const chat = getChat(chatId)
		if (chat) {
			const top = []
			iterateObject(chat.members, (memberId, member, memberIndex) => {
				top.push({
					firstName: member.firstName,
					score: member.totalScore,
				})

				Object.assign(member, {
					answer: null,
					isPlaying: false,
					gameScore: 0,
				})
			})
			if (top.length > 0) {
				await ctx.replyWithMarkdownV1(
					trim(`
					*🔝 Лучшие игроки этого чата за все время:*

					${top
						.sort((a, b) => b.score - a.score)
						.map(
							(member, index) =>
								`${["🏆", "🎖", "🏅"][index] || "🔸"} ${
									index + 1
								}. ${bold(
									member.firstName
								)}: ${numberWithSpaces(
									member.score
								)} ${pluralize(
									member.score,
									"очко",
									"очка",
									"очков"
								)}`
						)
						.join("\n")}

					❤️ Канал автора, где иногда публикуются новые прикольные боты @FilteredInternet.
					🔄 /game - Еще разок?
				`)
				)
			} else {
				await ctx.reply(
					"❌ Вы еще не сыграли ни одной игры в этом чате."
				)
			}
		} else {
			await ctx.reply("❌ Вы еще не сыграли ни одной игры в этом чате.")
		}
	} else {
		await ctx.replyWithMarkdownV1(
			...getOnlyGroupsMessage(ctx.botInfo.username)
		)
	}*/
})

bot.command("chart", async ctx => {
	/*console.log("chart")
	const fromId = String(ctx.update.message.from.id)
	const data = db.read()
	let top = []
	iterateObject(data, (chatId, chat, chatIndex) => {
		iterateObject(chat.members, (memberId, member, memberIndex) => {
			const existingMember = top.find(topItem => topItem.id === memberId)
			if (existingMember) {
				if (member.totalScore > existingMember.score) {
					existingMember.score = member.totalScore
				}
			} else {
				top.push({
					id: memberId,
					firstName: member.firstName,
					score: member.totalScore,
				})
			}
		})
	})

	top = top.sort((a, b) => b.score - a.score)
	const topSlice = top.slice(0, 25)
	let currentUser
	if (!topSlice.find(item => item.id === fromId)) {
		let currentUserIndex
		const foundUser = top.find((item, index) => {
			if (item.id === fromId) {
				currentUserIndex = index
				return true
			}
		})
		if (foundUser) {
			currentUser = {...foundUser}
			currentUser.index = currentUserIndex
		}
	}

	if (top.length > 0) {
		await ctx.replyWithMarkdownV1(
			trim(`
			*🔝 Глобальный рейтинг игроков:*

			${topSlice
				.map(
					(member, index) =>
						`${["🏆", "🎖", "🏅"][index] || "🔸"} ${index + 1}. ${
							fromId === member.id ? "Вы: " : ""
						}${bold(member.firstName)}: ${numberWithSpaces(
							member.score
						)} ${pluralize(member.score, "очко", "очка", "очков")}`
				)
				.join("\n")}
			${
				currentUser
					? `...\n🔸 ${currentUser.index + 1}. ${bold(
							currentUser.firstName
					  )}: ${numberWithSpaces(currentUser.score)} ${pluralize(
							currentUser.score,
							"очко",
							"очка",
							"очков"
					  )}\n`
					: ""
			}
			❤️ Канал автора, где иногда публикуются новые прикольные боты @FilteredInternet.
			🔄 /game - Еще разок?
		`)
		)
	} else {
		await ctx.reply("❌ На данный момент невозможно составить рейтинг.")
	}*/
})

bot.on("message:new_chat_members:me", async ctx => {
	console.log("Bot was added to chat")
	await handlers.greet(ctx)
})

bot.on("message", async ctx => {
	if (
		ctx.chat.id < 0 && //is chat
		ctx.session?.isPlaying && //has session and playing
		ctx.session?.isWaitingForAnswers //collecting answers
	) {
		await onNewAnswer(ctx)
	}
})

bot.start({dropPendingUpdates: true})
