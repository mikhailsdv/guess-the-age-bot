const fs = require("fs")
const dbfile = "./db.json"

const db = {
	read: () => {
		return JSON.parse(fs.readFileSync(dbfile))
	},
	write: json => {
		fs.writeFileSync(dbfile, JSON.stringify(json))
	},
	insert: (key, data) => {
		let dbjson = db.read()
		dbjson[key] = data
		db.write(dbjson)
	},
	get: key => {
		let dbjson = db.read()
		return dbjson[key]
	},
	update: (key, r) => {
		let dbjson = db.read()
		if (dbjson[key]) {
			dbjson[key] = r(dbjson[key])
			db.write(dbjson)
		}
	}
}

module.exports = db