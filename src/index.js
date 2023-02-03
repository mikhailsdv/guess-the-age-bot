const {
	BOT_TOKEN,
	REQUEST_TIMEOUT,
	ROUNDS,
	ROUND_DURATION,
	TIMER_STEPS,
} = require("./env")


const { Telegraf, Telegram } = require("telegraf")
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
	parseCallbackData,
	getChangePhotoButton,
	countPoints,
} = require("./utils")
const {bold, link} = require("./formatter")
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

	let repeatCount = TIMER_STEPS - ctx.session.time
	repeatCount < 0 && (repeatCount = 0)

	return trim(`
		${bold(`Raund ${ctx.session.round}/${ROUNDS}`)}
		Sizcə fotodakı adam neçə yaşındadır?
		${
			answers.length > 0
				? `\n${answers
						.map(
							(player, index) =>
								`${index + 1}. ${bold(player.firstName)}: ${
									player.answer
								}`
						)
						.join("\n")}\n`
				: ""
		}
		${["🟢", "🟡", "🔴"].slice(0, ctx.session.time).join("")}${"⚪️".repeat(
		repeatCount
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

const getFooterText = ctx =>
	trim(`
	Если вам нравится этот бот, поддержите автора подпиской @FilteredInternet.
	Также вступайте в ${link(
		"Ümumi oyun otağı",
		"https://t.me/goldmekan"
	)} 🔥

	🔝 Рейтинг игроков этого чата
	/top@${ctx.me.username}
	
	🌎 Глобальный рейтинг
	/chart@${ctx.me.username}
	
	🕹 Новая игра 
	/game@${ctx.me.username}
`)

const handlers = {
	greet: async ctx =>
		await ctx.reply(
			trim(`
				👋 Salam. Mən qrup çatlarında "yaşı təxmin et" oynamaq üçün bir robotam.
			
				📋 Qaydalar sadədir: mən sizə bir insanın şəklini göndərirəm, sizin vəzifəniz isə odur ${bold(
					"tez"
				)} onun yaşını təxmin edin. Çata təxmini yaşınızı rəqəmlə göndərin cavabınızı nəzərə alacam. Cavab vermək üçün təxminən 8 saniyəniz var, ona görə də əsnəməyin. Nə qədər dəqiq cavab versəniz, bir o qədər az xal itirirsiniz.
				${
					isGroupChat(ctx)
						? ""
						: `\n😉 Əvvəlcə məni əlavə et ${bold(
								`qrup söhbəti`
						  )} və əmri işə salın /game.\n`
				}
				${bold(`Команды:`)}
				
				🕹 Новая игра
				/game@${ctx.me.username}
				
				🛑 Остановить игру
				/stop@${ctx.me.username}
				
				🔝 Рейтинг игроков чата
				/top@${ctx.me.username}
				
				🌎 Глобальный рейтинг
				/chart@${ctx.me.username}
				
				Также вступайте в ${link(
					"общую игровую комнату",
					"https://t.me/+NXkIxFd5IfpjMDQy"
				)} 🔥
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
							"Qrupa bot əlavə edin 👥",
							`https://t.me/${ctx.me.username}?startgroup=add`
						),
				  }
		),
	change: ctx => {
		if (ctx.session?.isPlaying) {
			ctx.session.changePhoto = ctx.from
			ctx.session.isWaitingForAnswers = false
		} else {
			return "❌ Bu oyun artıq bitdi"
		}
	},
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

bot.command('start', (ctx) => {
    ctx.reply(`
👋 Salam!

 Mən, vaxtıvızı əyləncəli hala gətirmək üçün Yaş Təxmin etmə botuyam 🙂

 Daha ətraflı məlumat üçün /help əmrindən istifadə edin.. `,{
        reply_markup:{
            inline_keyboard:[
                [{text:'Botu Grupa Ekle ✅', url:`https://t.me/${process.env.BOT_ISMI}?startgroup=true`}],
                [{text:'Resmi Kanalımız 📣', url:`t.me/goldenbotresmi`},{text:'Əmirlər', callback_data:'əmr'}]
            ]
        }
    })
})

//geri
bot.callbackQuery("əmr", async (ctx) => {
  await ctx.reply(`\n👋 Salam Mən qrup çatlarında yaşı təxmin et oynamaq üçün bir robotam Qaydalar sadədir: Mən sizə bir Müğəninin şəklini atıram, sizin vəzifəniz onun yaşını təxmin etməkdir. Nə qədər dəqiq cavab versəniz, bir o qədər az xal itirirsiniz Əmrlər /game - 🕹 Yeni oyun /stop - 🛑 Oyunu dayandir /top - 🔝  Çat oyunçusu reytinqi /chart - 🌎 Qlobal reytinq /help - Əmrlər haqqinda məlumat `,{
        reply_markup:{
            inline_keyboard:[
                [{text:'Geri Qayıt', callback_data:"geri"}]
        ]
        }
    })
})


// başa 
bot.callbackQuery('geri', (ctx) => {
    ctx.reply(`
👋 Salam!

 Mən, vaxtıvızı əyləncəli hala gətirmək üçün Yaş Təxmin etmə botuyam 🙂

 Daha ətraflı məlumat üçün /help əmrindən istifadə edin.. `,{
        reply_markup:{
            inline_keyboard:[
                [{text:'Botu Grupa Ekle ✅', url:`https://t.me/${process.env.BOT_ISMI}?startgroup=true`}],
                [{text:'Resmi Kanalımız 📣', url:`t.me/goldenbotresmi`},{text:'Əmirlər', callback_data:'əmr'}]
            ]
        }
    })
})

bot.command("game", async ctx => {
	console.log("Game command")
	if (!isGroupChat(ctx)) {
		//PM, skipping
		return await handlers.onlyGroups(ctx)
	}
	if (ctx.session?.isPlaying) {
		return await ctx.reply(
			`❌ Davam edən oyun artıq var. Komanda ilə dayandıra bilərsiniz /stop@${ctx.me.username}.`
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
		changePhoto: false,
		answersOrder: [],
		isPlaying: true,
		isWaitingForAnswers: false,
		players: [],
		photosHistory: [],
	})

	const _isChatExists = await isChatExists({chat_id: ctx.chat.id})
	if (!_isChatExists) {
		await createChat({chat_id: ctx.chat.id})
	} else {
		await updateChatLastPlayDate({chat_id: ctx.chat.id})
	}

	await ctx.reply(bold("Oyun başlayır!"))

	ctx.session.timeouts.beforeGame = setTimeout(async function startRound() {
		/*const photosPath = path.resolve(__dirname, "../photos")
		const fileName = arrayRandom(fs.readdirSync(photosPath))
		const filePath = path.resolve(photosPath, fileName)
		ctx.session.rightAnswer = Number(fileName.match(/^(\d+)/)[1])*/
		try {
			const photosPath = path.resolve(__dirname, "../photos")
			let fileName
			do {
				fileName = arrayRandom(fs.readdirSync(photosPath))
			} while (ctx.session.photosHistory.includes(fileName))
			const filePath = path.resolve(photosPath, fileName)
			const match = fileName.match(/(\d+)-\d+-\d+_(\d+)\.jpg$/)
			ctx.session.rightAnswer = Number(match[2]) - Number(match[1])
			ctx.session.photosHistory.push(fileName)

			const guessMessage = await ctx.replyWithPhoto(
				new InputFile(filePath),
				{
					caption: getRoundMessageText(ctx),
					parse_mode: "HTML",
					...getChangePhotoButton(ctx),
				}
			)

			ctx.session.guessMessageId = guessMessage.message_id
			ctx.session.isWaitingForAnswers = true

			let prevRoundMessage = null
			const updateTimeDelay = ROUND_DURATION / TIMER_STEPS
			ctx.session.timeouts.timer = setTimeout(
				async function updateTime() {
					if (ctx.session.changePhoto) {
						await bot.api.editMessageCaption(
							ctx.chat.id,
							guessMessage.message_id,
							{
								caption: `🔁 Yaxşı, xahişlə şəkli dəyişirəm ${bold(
									ctx.session.changePhoto.first_name
								)}. Приготовьтесь!`,
								parse_mode: "HTML",
							}
						)
						ctx.session.photosHistory.pop()
						ctx.session.changePhoto = false
						ctx.session.time = 0
						ctx.session.answersOrder = []
						for (const player of ctx.session.players) {
							player.answer = null
						}
						fs.copyFile(
							filePath,
							path.resolve(__dirname, "../changed", fileName),
							err => {
								if (err) {
									console.error(err)
								}
							}
						)
						await wait(waitStep * 2)
						await startRound()
						return
					}

					ctx.session.time++
					prevRoundMessage = getRoundMessageText(ctx)
					try {
						await bot.api.editMessageCaption(
							ctx.chat.id,
							guessMessage.message_id,
							{
								caption: prevRoundMessage,
								parse_mode: "HTML",
								...(ctx.session.time <= 1
									? getChangePhotoButton(ctx)
									: {}),
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
							ctx.session.isWaitingForAnswers = false
							ctx.session.time = 0
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

							const top = []
							for (const player of ctx.session.players) {
								if (!player.isPlaying) continue
								const addScore =
									player.answer === null
										? 0
										: countPoints(
												ctx.session.rightAnswer,
												player.answer
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
								😴 Deyəsən oynamırsan. Yaxşı, oyunu bitirdim...
								
								⚠️ Xatırladıram ki, yaşınızı rəqəmlərlə yazmağa vaxtınız olmalıdır ${bold(
									"до"
								)} qırmızı işıq yandıqda 🔴
								
								${getFooterText(ctx)}
							`),
									{disable_web_page_preview: true}
								)
								await destroyGame(ctx)
								return
							} else {
								ctx.session.players.forEach(
									player => (player.answer = null)
								)
								await ctx.reply(
									trim(`
									Bu fotodakı şəxs ${bold(ctx.session.rightAnswer)} ${bold(
										pluralize(
											ctx.session.rightAnswer,
											"Yaş",
											"Yaş",
											"Yaş"
										)
									)}. Budur, kim daha yaxın idi:
				
									${top
										.sort((a, b) => b.addScore - a.addScore)
										.map(
											(player, index) =>
												`${
													["🏆", "🎖", "🏅"][index] ||
													"🔸"
												} ${index + 1}. ${bold(
													player.firstName
												)}: ${revealNumberSign(
													player.addScore
												)}`
										)
										.join("\n")}
								`),
									{
										reply_to_message_id:
											ctx.session.guessMessageId,
									}
								)
							}

							if (ctx.session.round === Number(ROUNDS)) {
								console.log("Finish game")
								ctx.session.timeouts.stopGame = setTimeout(
									async () => {
										const top = []
										for (const player of ctx.session
											.players) {
											if (!player.isPlaying) continue
											top.push({...player})
										}
										await destroyGame(ctx)

										await ctx.reply(
											trim(`
												${bold("🏁 Və burada qaliblər var:")}
										
												${top
													.sort(
														(a, b) =>
															b.gameScore -
															a.gameScore
													)
													.map(
														(player, index) =>
															`${
																[
																	"🏆",
																	"🎖",
																	"🏅",
																][index] || "🔸"
															} ${
																index + 1
															}. ${bold(
																player.firstName
															)}: ${numberWithSpaces(
																player.gameScore
															)} ${pluralize(
																player.gameScore,
																"xal",
																"xal",
																"xal"
															)}`
													)
													.join("\n")}
										
												${getFooterText(ctx)}
											`),
											{disable_web_page_preview: true}
										)
									},
									waitStep
								)
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
				},
				updateTimeDelay
			)
		} catch (err) {
			console.error(err)
			await destroyGame(ctx)
			await ctx.reply(
				trim(`
				${bold("❌ Bir səhv baş verdi!")}
				
				Botun admin hüquqlarına və fotoşəkillər göndərmək icazəsinə malik olduğundan əmin olun.
			`)
			)
		}
	}, waitStep)
})

bot.command("stop", async ctx => {
	if (!isGroupChat(ctx)) {
		//PM, skipping
		return await handlers.onlyGroups(ctx)
	}

	if (!ctx?.session?.isPlaying) {
		return await ctx.reply(
			`❌ Oyun işə salınmayıb. Onu əmrlə çaşdıra bilərsiniz /game@${ctx.me.username}.`
		)
	}

	console.log("Stop game")
	await destroyGame(ctx)
	await ctx.reply(
		trim(`
				${bold("🏁 Tamam oyunu bitirirəm..")}
							
				${getFooterText(ctx)}
			`),
		{disable_web_page_preview: true}
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
			${bold("❌ Bu çatda hələ heç bir oyun oynamamısınız.")}
			
			🕹 Новая игра
			/game@${ctx.me.username}
		`)
		)
	}

	await ctx.reply(
		trim(`
			${bold("🔝 Bu çatda bütün zamanların ən yaxşı oyunçuları:")}

			${chat.players
				.slice()
				.sort((a, b) => b.total_score - a.total_score)
				.slice(0, 50)
				.map(
					(player, index) =>
						`${["🏆", "🎖", "🏅"][index] || "🔸"} ${
							index + 1
						}. ${bold(player.first_name)}: ${numberWithSpaces(
							player.total_score
						)} ${pluralize(
							player.total_score,
							"xal",
							"xal",
							"xal"
						)}`
				)
				.join("\n")}
							
			${getFooterText(ctx)}
		`),
		{disable_web_page_preview: true}
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
			bold("❌ Hazırda sıralamaq mümkün deyil.")
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
			${bold("🌍 Qlobal Oyunçu Reytinqi:")}

			${topN
				.map(
					(player, index) =>
						`${["🏆", "🎖", "🏅"][index] || "🔸"} ${index + 1}. ${
							String(ctx.from.id) === player.id ? "Вы: " : ""
						}${bold(player.first_name)}: ${numberWithSpaces(
							player.total_score
						)} ${pluralize(
							player.total_score,
							"xal",
							"xal",
							"xal"
						)}`
				)
				.join("\n")}
			${
				currentPlayer
					? `...\n🔸 ${currentPlayer.index + 1}. ${bold(
							currentPlayer.first_name
					  )}: ${numberWithSpaces(
							currentPlayer.total_score
					  )} ${pluralize(
							currentPlayer.total_score,
							"xal",
							"xal",
							"xal"
					  )}\n`
					: ""
			}
			${getFooterText(ctx)}
		`),
		{disable_web_page_preview: true}
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
			return ctx.reply("Cavab diapazondan kənardadır (1 - 120), {
				reply_to_message_id: ctx.msg.message_id,
			})
		}
		const player = findExact(ctx.session.players, "id", ctx.from.id)
		if (player) {
			//if (player.answer !== null) return
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

bot.on("callback_query", async ctx => {
	const {command, data} = parseCallbackData(ctx.callbackQuery.data)
	console.log("Button pressed:", command, data)
	if (handlers[command]) {
		const answerCallbackQuery = await handlers[command](ctx)
		if (answerCallbackQuery) {
			await ctx.answerCallbackQuery({
				text: answerCallbackQuery,
				show_alert: true,
			})
		} else {
			await ctx.answerCallbackQuery()
		}
	} else {
		await ctx.answerCallbackQuery("❌ Komanda tapılmadı və ya silindi")
	}
})
;(async () => {
	await bot.api.deleteWebhook({drop_pending_updates: true})
	run(bot)
	console.log("Bot тheyyet neferi")
})()
