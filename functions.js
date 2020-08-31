module.exports = {
	arrayRandom: arr => {
		return arr[Math.round(Math.random() * (arr.length - 1))];
	},
	plusminus: n => n > 0 ? `+${n}` : n,
	trueTrim: str => str.replace(/\t+/gm, ""),
	pluralize: (n, singular, plural, accusative) => {
		n = Math.abs(n)
		let n10 = n % 10;
		let n100 = n % 100;
		if (n10 == 1 && n100 != 11) {
			return singular;
		}
		if (
			(2 <= n10 && n10 <= 4) &&
			!(12 <= n100 && n100 <= 14)
		) {
			return plural;
		}
		return accusative;
	}
}