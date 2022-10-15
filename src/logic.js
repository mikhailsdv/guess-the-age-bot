const {BOT_TOKEN, REQUEST_TIMEOUT, ROUNDS, ROUND_DURATION, TIMER_STEPS} =
	process.env
const path = require("path")
const fs = require("fs")
const {
	InputFile,
	InlineKeyboard,
	HttpError,
	GrammyError,
	session,
} = require("grammy")
const {
	trim,
	bold,
	escape,
	numberWithSpaces,
	pluralize,
	revealNumberSign,
	arrayRandom,
} = require("./utils")

const getRoundMessage = async ctx => {
	const answers = ctx.session.players
		.filter(member => member.isPlaying && member.answer !== null)
		.sort(
			(a, b) =>
				ctx.session.answersOrder.indexOf(a.id) -
				ctx.session.answersOrder.indexOf(b.id)
		)

	const fileName = arrayRandom(
		fs.readdirSync(path.resolve(__dirname, "./photos"))
	)
	ctx.session.rightAnswer = Number(fileName.match(/^(\d+)/)[1])

	return await ctx.replyWithPhoto(InputFile(fileName), {
		caption: trim(`
			*Раунд ${ctx.session.round}/${ROUNDS}*
			Сколько, по-вашему, лет этому человеку?
			${
				answers.length > 0
					? `\n${answers
							.map(
								(member, index) =>
									`${index + 1}. ${bold(
										escape(member.firstName)
									)}: ${escape(member.answer)}`
							)
							.join("\n")}\n`
					: ""
			}
			${"⬛".repeat(ctx.session.time)}${"⬜".repeat(TIMER_STEPS - ctx.session.time)}
		`),
	})
}

const onStart = async ctx => {
	console.log("Start game")

	await ctx.replyWithMarkdownV1("*Игра начинается!*")

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

	const startRound = async () => {
		const guessMessage = await getRoundMessage(ctx)

		ctx.session.guessMessageId = guessMessage.message_id
		ctx.session.isWaitingForAnswers = true

		/*ctx.session.timeouts.timer = setInterval(async () => {
			ctx.session.time = ctx.session.time + 1
			try {
				await ctx.editMessageCaption(
					ctx.chat.id,
					guessMessage.message_id,
					null,
					getRoundMessage(chatId, round, time),
					{
						parse_mode: "Markdown",
					}
				)
			} catch (err) {
				console.log(err)
			}
			time++
			if (time >= config.timerSteps + 1)
				clearInterval(gameState.timeouts.timer)
		}, config.waitDelay / (config.timerSteps + 1))*/

		ctx.session.timeouts.round = setTimeout(async () => {
			try {
				ctx.session.isWaitingForAnswers = false

				const top = []
				for (const member of ctx.session.members) {
					if (!member.isPlaying) continue
					const addScore =
						member.answer === null
							? 0
							: ctx.session.rightAnswer -
							  Math.abs(ctx.session.rightAnswer - member.answer)
					member.score += addScore
					top.push({
						...member,
						addScore,
					})
					member.answer = null
					//db.update(chatId, ch => chat)
				}
				//db.update(chatId, ch => chat)

				if (top.every(member => member.answer === null)) {
					await ctx.reply(
						"🤔 Похоже, вы не играете. Ок, завершаю игру..."
					)
					await onStop(ctx)
					return
				} else {
					await ctx.replyWithMarkdownV1(
						trim(`
							Человеку на этом фото *${ctx.session.rightAnswer} ${pluralize(
							ctx.session.rightAnswer,
							"год",
							"года",
							"лет"
						)}*. Вот, кто был ближе всего:
	
							${top
								.sort((a, b) => b.addScore - a.addScore)
								.map(
									(member, index) =>
										`${["🏆", "🎖", "🏅"][index] || "🔸"} ${
											index + 1
										}. ${bold(
											escape(member.firstName)
										)}: ${revealNumberSign(
											member.addScore
										)}`
								)
								.join("\n")}
						`),
						{
							reply_to_message_id: ctx.session.guessMessageId,
						}
					)
				}

				if (ctx.session.round === ROUNDS) {
					ctx.session.timeouts.stopGame = setTimeout(async () => {
						await onStop(ctx)
					}, 1000)
				} else {
					ctx.session.answersOrder = []
					ctx.session.timeouts.afterRound = setTimeout(async () => {
						ctx.session.round++
						await startRound()
					}, 2500)
				}
			} catch (err) {
				console.log(err)
			}
		}, ROUND_DURATION)
	}

	ctx.session.timeouts.beforeGame = setTimeout(async () => {
		await startRound()
	}, 1000)
}

const onStop = async ctx => {
	console.log("Stop game")

	if (!ctx?.session?.isPlaying) {
		return await ctx.reply(
			"❌ Игра не была запущена. Вы можете запутить ее командой /start."
		)
	}
	Object.values(ctx.session.timeouts).forEach(timeout =>
		clearTimeout(timeout)
	)

	ctx.session.isPlaying = false
	ctx.session.isWaitingForAnswers = false

	const top = []
	for (const member of ctx.session.members) {
		if (!member.isPlaying) continue
		top.push({...member})
		Object.assign(member, {
			answer: null,
			isPlaying: false,
			score: 0,
		})
	}

	//db.update(chatId, ch => chat)
	if (top.length === 0) {
		return await ctx.replyWithMarkdownV1(
			trim(`
				*🏁 Ок, завершаю игру.*

				❤️ Канал автора, где иногда публикуются новые прикольные боты @FilteredInternet.
				🔄 /game - Еще разок?
			`)
		)
	}

	await ctx.replyWithMarkdownV1(
		trim(`
			*🏁 А вот и победители:*

			${top
				.sort((a, b) => b.score - a.score)
				.map(
					(member, index) =>
						`${["🏆", "🎖", "🏅"][index] || "🔸"} ${
							index + 1
						}. ${bold(
							escape(member.firstName)
						)}: ${numberWithSpaces(member.score)} ${pluralize(
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
}

const onNewAnswer = async ctx => {
	const firstName = message.from.first_name
	const answer = Number(message.text)
	if (answer <= 0 || answer > 120) {
		return ctx.reply("Ответ вне допустимого диапазона (1 - 120)", {
			reply_to_message_id: ctx.message.message_id,
		})
	}
	if (!chat.members[fromId]) {
		//new member's answer
		chat.members[fromId] = createMember(firstName)
	}
	Object.assign(chat.members[fromId], {
		isPlaying: true,
		answer: answer,
		firstName: firstName,
	})
	gameStates[chatId].answersOrder.push(fromId)

	db.update(chatId, ch => chat)

	await telegram.editMessageCaption(
		chatId,
		gameStates[chatId].guessMessageId,
		null,
		getRoundMessage(
			chatId,
			gameStates[chatId].currentRound,
			gameStates[chatId].currentTime
		),
		{
			parse_mode: "Markdown",
		}
	)
}

module.exports = {
	onStart,
	onStop,
	onFinish,
	getRoundMessage,
	onNewAnswer,
}
