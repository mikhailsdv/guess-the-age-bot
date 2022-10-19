const mongoose = require("mongoose")
const {Schema} = mongoose

const connection = mongoose.createConnection(
	"mongodb://localhost:27017/guess-the-age"
)

const Chat = connection.model(
	"Chat",
	new Schema({
		chat_id: String,
		players: [
			{
				id: String,
				first_name: String,
				total_score: Number,
			},
		],
		last_play_date: Date,
	})
)

const createChat = ({chat_id}) =>
	new Promise((resolve, reject) => {
		new Chat({
			chat_id: String(chat_id),
			players: [],
			last_play_date: new Date(),
		}).save(err => {
			if (err) {
				return reject(err)
			}
			resolve(true)
		})
	})

const getChat = async ({chat_id}) => await Chat.findOne({chat_id})

const getAllChats = async () => await Chat.find({})

const updateChatLastPlayDate = async ({chat_id}) =>
	await Chat.findOneAndUpdate({chat_id}, {last_play_date: new Date()})

const savePlayer = ({chat_id, player_id, first_name, total_score = 0}) =>
	new Promise((resolve, reject) => {
		Chat.findOne(
			{
				chat_id: String(chat_id),
			},
			(err, chat) => {
				if (err) {
					return reject(err)
				}
				chat.players.push({
					id: String(player_id),
					first_name,
					total_score,
				})
				chat.save(err => {
					if (err) {
						return reject(err)
					}
					resolve(true)
				})
			}
		)
	})

const updatePlayer = async ({chat_id, player_id, first_name, add_score = 0}) =>
	await Chat.findOneAndUpdate(
		{chat_id: String(chat_id), "players.id": String(player_id)},
		{
			$set: {"players.$.first_name": first_name},
			$inc: {
				"players.$.total_score": add_score,
			},
		}
	)

const isChatExists = async ({chat_id}) =>
	await Chat.exists({chat_id: String(chat_id)})

const isPlayerExists = async ({chat_id, player_id}) =>
	await Chat.exists({
		chat_id: String(chat_id),
		"players.id": String(player_id),
	})

module.exports = {
	Chat,
	createChat,
	getChat,
	getAllChats,
	savePlayer,
	updatePlayer,
	isChatExists,
	isPlayerExists,
	updateChatLastPlayDate,
}
