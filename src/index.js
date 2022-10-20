const {
	BOT_TOKEN,
	REQUEST_TIMEOUT,
	ROUNDS,
	ROUND_DURATION,
	TIMER_STEPS,
} = require("./env")
const fs = require("fs")
const path = require("path")
const {
	Bot,
	InputFile,
	InlineKeyboard,
	HttpError,
	GrammyError,
	session,
} = require("grammy")
const {hydrateReply, parseMode} = require("@grammyjs/parse-mode")
const {run} = require("@grammyjs/runner")
const {
	numberWithSpaces,
	arrayRandom,
	trim,
	revealNumberSign,
	pluralize,
	findExact,
	getAddToGroupButton,
	getSessionKey,
	isGroupChat,
	wait,
} = require("./utils")
const {bold, $mention} = require("./formatter")
const {
	createChat,
	savePlayer,
	getChat,
	getAllChats,
	updatePlayer,
	isChatExists,
	isPlayerExists,
	updateChatLastPlayDate,
} = require("./db")

const bot = new Bot(BOT_TOKEN)
bot.use(hydrateReply)
bot.api.config.use(parseMode("HTML"))

const waitStep = 1500

/*interface GameState {
	timeouts: object
	currentGuessMessageId: number
	currentRound: number
	currentTime: number
	answersOrder: []
	isPlaying: false
	players: {
		firstName: string
		isPlaying: boolean
		answer: string
		gameScore: number
		totalScore: number
	}[]
}*/

const getRoundMessageText = ctx => {
	const answers = ctx.session.players
		.filter(player => player.isPlaying && player.answer !== null)
		.sort(
			(a, b) =>
				ctx.session.answersOrder.indexOf(a.id) -
				ctx.session.answersOrder.indexOf(b.id)
		)
	return trim(`
		${bold(`Раунд ${ctx.session.round}/${ROUNDS}`)}
		Сколько, по-вашему, лет человеку на фото?
		${
			answers.length > 0
				? `\n${answers
						.map(
							(player, index) =>
								`${index + 1}. ${$mention(
									bold(player.firstName),
									player.id
								)}: ${player.answer}`
						)
						.join("\n")}\n`
				: ""
		}
		${["🟢", "🟡", "🔴"].slice(0, ctx.session.time).join("")}${"⚪️".repeat(
		TIMER_STEPS - ctx.session.time
	)}
	`)
}

const destroyGame = async ctx => {
	Object.values(ctx.session.timeouts).forEach(timeout =>
		clearTimeout(timeout)
	)

	ctx.session.isPlaying = false
	ctx.session.isWaitingForAnswers = false

	for (const player of ctx.session.players) {
		const _isPlayerExists = await isPlayerExists({
			chat_id: ctx.chat.id,
			player_id: player.id,
		})
		if (_isPlayerExists) {
			await updatePlayer({
				chat_id: ctx.chat.id,
				player_id: player.id,
				first_name: player.firstName,
				add_score: player.gameScore,
			})
		} else {
			await savePlayer({
				chat_id: ctx.chat.id,
				player_id: player.id,
				first_name: player.firstName,
				total_score: player.gameScore,
			})
		}
	}
}

const handlers = {
	greet: async ctx =>
		await ctx.reply(
			trim(`
				👋 Привет. Я — бот для игры в «угадай возраст» в групповых чатах.
			
				📋 Правила просты: я кидаю вам фото человека, а ваша задача быстро угадать его возраст. Просто отправьте предполагаемый возраст цифрами в чат и я учту ваш ответ. Чем точнее вы отвечаете, тем меньше баллов теряете.
				${
					isGroupChat(ctx)
						? ""
						: `\n😉 Для начала, добавь меня в ${bold(
								`групповой чат`
						  )} и вызови /game.\n`
				}
				${bold(`Команды:`)}
				/game - 🕹 Новая игра
				/stop - 🛑 Остановить игру
				/top - 🔝 Рейтинг игроков чата
				/chart - 🌎 Глобальный рейтинг
			
				Канал автора: @FilteredInternet ❤️ 
			`),
			isGroupChat(ctx) ? null : getAddToGroupButton(ctx)
		),
	onlyGroups: async ctx =>
		await ctx.reply(
			`❌ Эта команда доступна только для ${bold(
				`групповых чатов`
			)}. Создайте чат с друзьями и добавьте туда бота.`,
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

bot.use(session({getSessionKey, initial: () => ({})}))

bot.command("start", async ctx => {
	await handlers.greet(ctx)
})

bot.command("game", async ctx => {
	console.log("Game command")
	if (!isGroupChat(ctx)) {
		//PM, skipping
		return await handlers.onlyGroups(ctx)
	}
	if (ctx.session?.isPlaying) {
		return await ctx.reply(
			"❌ У вас уже запущена игра. Вы можете ее остановить командой /stop."
		)
	}

	console.log("Start game")

	Object.assign(ctx.session, {
		timeouts: {
			timer: null,
			round: null,
			beforeGame: null,
			afterRound: null,
			stopGame: null,
		},
		guessMessageId: null,
		round: 1,
		time: 0,
		answersOrder: [],
		isPlaying: true,
		isWaitingForAnswers: false,
		players: [],
	})

	const _isChatExists = await isChatExists({chat_id: ctx.chat.id})
	if (!_isChatExists) {
		await createChat({chat_id: ctx.chat.id})
	} else {
		await updateChatLastPlayDate({chat_id: ctx.chat.id})
	}

	await ctx.reply(bold("Игра начинается!"))

	ctx.session.timeouts.beforeGame = setTimeout(async function startRound() {
		const photosPath = path.resolve(__dirname, "../photos")
		const fileName = arrayRandom(fs.readdirSync(photosPath))
		const filePath = path.resolve(photosPath, fileName)
		ctx.session.rightAnswer = Number(fileName.match(/^(\d+)/)[1])

		const guessMessage = await ctx.replyWithPhoto(new InputFile(filePath), {
			caption: getRoundMessageText(ctx),
			parse_mode: "HTML",
		})

		ctx.session.guessMessageId = guessMessage.message_id
		ctx.session.isWaitingForAnswers = true

		let prevRoundMessage = null
		const updateTimeDelay = ROUND_DURATION / TIMER_STEPS
		ctx.session.timeouts.timer = setTimeout(async function updateTime() {
			ctx.session.time++
			prevRoundMessage = getRoundMessageText(ctx)
			try {
				await bot.api.editMessageCaption(
					ctx.chat.id,
					guessMessage.message_id,
					{
						caption: prevRoundMessage,
						parse_mode: "HTML",
					}
				)
			} catch (err) {
				console.log(err)
			}
			if (ctx.session.time < TIMER_STEPS) {
				//update timer
				ctx.session.timeouts.timer = setTimeout(
					updateTime,
					updateTimeDelay
				)
			} else {
				//finishing round
				try {
					await wait(updateTimeDelay)
					const lastRoundMessage = getRoundMessageText(ctx)
					if (lastRoundMessage !== prevRoundMessage) {
						await bot.api.editMessageCaption(
							ctx.chat.id,
							guessMessage.message_id,
							{
								caption: lastRoundMessage,
								parse_mode: "HTML",
							}
						)
						await wait(waitStep)
					}

					ctx.session.isWaitingForAnswers = false
					ctx.session.time = 0

					const top = []
					for (const player of ctx.session.players) {
						if (!player.isPlaying) continue
						const addScore =
							player.answer === null
								? 0
								: ctx.session.rightAnswer -
								  Math.abs(
										ctx.session.rightAnswer - player.answer
								  )
						player.gameScore += addScore
						top.push({
							...player,
							addScore,
						})
					}
					if (top.every(player => player.answer === null)) {
						console.log("Dead chat")
						await ctx.reply(
							trim(`
							😴 Похоже, вы не играете. Ок, завершаю игру...
							
							Напоминаю, что вы должны успеть написать возраст цифрами ${bold(
								"до"
							)} того, как загорится красный сигнал.
							🔄 /game - Еще разок?
						`)
						)
						await destroyGame(ctx)
						return
					} else {
						ctx.session.players.forEach(
							player => (player.answer = null)
						)
						await ctx.reply(
							trim(`
								Человеку на этом фото ${bold(ctx.session.rightAnswer)} ${bold(
								pluralize(
									ctx.session.rightAnswer,
									"год",
									"года",
									"лет"
								)
							)}. Вот, кто был ближе всего:
			
								${top
									.sort((a, b) => b.addScore - a.addScore)
									.map(
										(player, index) =>
											`${
												["🏆", "🎖", "🏅"][index] || "🔸"
											} ${index + 1}. ${$mention(
												bold(player.firstName),
												player.id
											)}: ${revealNumberSign(
												player.addScore
											)}`
									)
									.join("\n")}
							`),
							{
								reply_to_message_id: ctx.session.guessMessageId,
							}
						)
					}

					if (ctx.session.round === Number(ROUNDS)) {
						console.log("Finish game")
						ctx.session.timeouts.stopGame = setTimeout(async () => {
							const top = []
							for (const player of ctx.session.players) {
								if (!player.isPlaying) continue
								top.push({...player})
							}
							await destroyGame(ctx)

							await ctx.reply(
								trim(`
									${bold("🏁 А вот и победители:")}
							
									${top
										.sort((a, b) => b.score - a.score)
										.map(
											(player, index) =>
												`${
													["🏆", "🎖", "🏅"][index] ||
													"🔸"
												} ${index + 1}. ${$mention(
													bold(player.firstName),
													player.id
												)}: ${numberWithSpaces(
													player.gameScore
												)} ${pluralize(
													player.gameScore,
													"балл",
													"балла",
													"баллов"
												)}`
										)
										.join("\n")}
							
									Если вам нравится этот бот, поддержите автора подпиской @FilteredInternet.
									🔄 /game - Еще разок?
								`)
							)
						}, waitStep)
					} else {
						ctx.session.answersOrder = []
						ctx.session.timeouts.afterRound = setTimeout(
							async () => {
								ctx.session.round++
								await startRound()
							},
							waitStep * 2
						)
					}
				} catch (err) {
					console.log(err)
				}
			}
		}, updateTimeDelay)
	}, waitStep)
})

bot.command("stop", async ctx => {
	console.log("Stop game")
	if (!isGroupChat(ctx)) {
		//PM, skipping
		return await handlers.onlyGroups(ctx)
	}

	if (!ctx?.session?.isPlaying) {
		return await ctx.reply(
			"❌ Игра не была запущена. Вы можете запутить ее командой /game."
		)
	}

	console.log("Stop game")
	await destroyGame(ctx)
	await ctx.reply(
		trim(`
				${bold("🏁 Ок, завершаю игру.")}

				Если вам нравится этот бот, поддержите автора подпиской @FilteredInternet.
				🔄 /game - Еще разок?
			`)
	)
})

bot.command("top", async ctx => {
	console.log("Chat top")

	if (!isGroupChat(ctx)) {
		//PM, skipping
		return await handlers.onlyGroups(ctx)
	}

	const chat = await getChat({chat_id: ctx.chat.id})
	if (!chat || chat?.players.length === 0) {
		return await ctx.reply(
			trim(`
			${bold("❌ Вы еще не сыграли ни одной игры в этом чате.")}
			
			🕹 /game - Новая игра
		`)
		)
	}

	await ctx.reply(
		trim(`
			${bold("🔝 Лучшие игроки этого чата за все время:")}

			${chat.players
				.slice()
				.sort((a, b) => b.total_score - a.total_score)
				.map(
					(player, index) =>
						`${["🏆", "🎖", "🏅"][index] || "🔸"} ${
							index + 1
						}. ${$mention(
							bold(player.first_name),
							player.id
						)}: ${numberWithSpaces(player.total_score)} ${pluralize(
							player.total_score,
							"балл",
							"балла",
							"баллов"
						)}`
				)
				.join("\n")}

			Если вам нравится этот бот, поддержите автора подпиской @FilteredInternet.
			🕹 /game - Новая игра
		`)
	)
})

bot.command("chart", async ctx => {
	console.log("Chart command")

	const chats = await getAllChats()
	const topMap = new Map()
	for (const chat of chats) {
		for (const player of chat.players) {
			player.last_play_date = chat.last_play_date

			const existingPlayer = topMap.get(player.id)
			if (existingPlayer) {
				if (player.total_score > existingPlayer.total_score) {
					existingPlayer.total_score = player.total_score
				}
				if (
					player.last_play_date.valueOf() >
					existingPlayer.last_play_date.valueOf()
				) {
					existingPlayer.first_name = player.first_name
				}
			} else {
				topMap.set(player.id, player)
			}
		}
	}

	if (topMap.size === 0) {
		return await ctx.reply(
			bold("❌ На данный момент невозможно составить рейтинг.")
		)
	}

	const top = Array.from(topMap.values()).sort(
		(a, b) => b.total_score - a.total_score
	)
	const topN = top.slice(0, 25)
	let currentPlayer
	if (!topN.find(player => player.id === String(ctx.from.id))) {
		let currentPlayerIndex
		const foundPlayer = top.find((player, index) => {
			if (player.id === String(ctx.from.id)) {
				currentPlayerIndex = index
				return true
			}
		})
		if (foundPlayer) {
			currentPlayer = {
				id: foundPlayer.id,
				first_name: foundPlayer.first_name,
				total_score: foundPlayer.total_score,
				index: currentPlayerIndex,
			}
		}
	}

	await ctx.reply(
		trim(`
			${bold("🌍 Глобальный рейтинг игроков:")}

			${topN
				.map(
					(player, index) =>
						`${["🏆", "🎖", "🏅"][index] || "🔸"} ${index + 1}. ${
							String(ctx.from.id) === player.id ? "Вы: " : ""
						}${$mention(
							bold(player.first_name),
							player.id
						)}: ${numberWithSpaces(player.total_score)} ${pluralize(
							player.total_score,
							"балл",
							"балла",
							"баллов"
						)}`
				)
				.join("\n")}
			${
				currentPlayer
					? `...\n🔸 ${currentPlayer.index + 1}. ${$mention(
							bold(currentPlayer.first_name),
							currentPlayer.id
					  )}: ${numberWithSpaces(
							currentPlayer.total_score
					  )} ${pluralize(
							currentPlayer.total_score,
							"балл",
							"балла",
							"баллов"
					  )}\n`
					: ""
			}
			Если вам нравится этот бот, поддержите автора подпиской @FilteredInternet.
			🕹 /game - Новая игра
		`)
	)
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
		if (!/^[0-9]+$/.test(ctx.msg.text)) return
		const answer = Number(ctx.msg.text)
		if (answer <= 0 || answer > 120) {
			return ctx.reply("Ответ вне допустимого диапазона (1 - 120)", {
				reply_to_message_id: ctx.msg.message_id,
			})
		}
		const player = findExact(ctx.session.players, "id", ctx.from.id)
		if (player) {
			if (player.answer !== null) return
			player.answer = answer
		} else {
			ctx.session.players.push({
				id: ctx.from.id,
				firstName: ctx.from.first_name,
				isPlaying: true,
				answer,
				gameScore: 0,
			})
		}
		ctx.session.answersOrder.push(ctx.from.id)

		/*await bot.api.editMessageCaption(
			ctx.chat.id,
			ctx.session.guessMessageId,
			{
				caption: getRoundMessageText(ctx),
				parse_mode: "HTML",
			}
		)*/
	}
})
;(async () => {
	await bot.api.deleteWebhook({drop_pending_updates: true})
	run(bot)
})()
