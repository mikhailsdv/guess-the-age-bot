const escape = str =>
	String(str)
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/&/g, "&amp;")

const $bold = str => `<b>${str}</b>`
const bold = str => $bold(escape(str))

const $italic = str => `<i>${str}</i>`
const italic = str => $italic(escape(str))

const $link = (str, url) => `<a href="${url}">${str}</a>`
const link = (str, url) => $link(escape(str), url)

const $mention = (str, id) => $link(str, `tg://user?id=${id}`)
const mention = (str, id) => $mention(escape(str), id)

module.exports = {
	escape,
	bold,
	$bold,
	mention,
	$mention,
	italic,
	$italic,
	link,
	$link,
}
