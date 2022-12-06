const escape = str =>
	String(str)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")

const $bold = str => `<b>${str}</b>`
const bold = str => $bold(escape(str))

const $italic = str => `<i>${str}</i>`
const italic = str => $italic(escape(str))

const $code = str => `<code>${str}</code>`
const code = str => $code(escape(str))

const $pre = str => `<pre>${str}</pre>`
const pre = str => $pre(escape(str))

const $preCode = (str, language) => `<pre><code class="language-${language}">${str}</code></pre>`
const preCode = (str, language) => $preCode(escape(str), language)

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

	code,
	$code,

	pre,
	$pre,

	preCode,
	$preCode,

	link,
	$link,
}
