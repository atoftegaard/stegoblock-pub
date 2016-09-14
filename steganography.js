var SBStego = function () {

	return {

		maxPlaintextLength: 255,
		blockLength: 4096,
			
		alphabetFrequencies: {
			
			' ': 18.31685753,
			'e': 10.21787708,
			't': 7.50999398,
			'a': 6.55307059,
			'o': 6.20055405,
			'n': 5.70308374,
			'i': 5.73425524,
			's': 5.32626738,
			'r': 4.97199926,
			'h': 4.86220925,
			'l': 3.35616550,
			'd': 3.35227377,
			'u': 2.29520040,
			'c': 2.26508836,
			'm': 2.01727037,
			'f': 1.97180888,
			'w': 1.68961396,
			'g': 1.63586607,
			'p': 1.50311560,
			'y': 1.46995463,
			'b': 1.27076566,
			'v': 0.78804815,
			'k': 0.56916712,
			'x': 0.14980832,
			'j': 0.11440544,
			'q': 0.08809302,
			'z': 0.05979301
		},
		
		generateNoise: function (plaintext) {
			
			let noise = [];
			let ptDict = {};

			// verify that all chars in plaintext exist in the alphabet.
			// track how many times each char occur.
			for (let i = 0; i < plaintext.length; i++) {

				// match with alphabet
				//if (this.alphabetFrequencies[plaintext[i]] === undefined) // given char is not in alphabet. notify about this later.

				// init bucket if none exists.
				if (ptDict[plaintext[i]] === undefined)
					ptDict[plaintext[i]] = 0;
				
				// increment char count.
				ptDict[plaintext[i]]++;
			}
			
			// run through all chars of the alphabet.
			for (let x in this.alphabetFrequencies) {
				
				// calculate the char count given the specified block length (4096) and frequency
				let charCount = Math.ceil(this.blockLength / 100 * this.alphabetFrequencies[x]);
				let ptFreq = ptDict[x] || 0;

				charCount = charCount - ptFreq; // subtract the char char count in the plaintext, from the calculated.
				if (charCount < 0)
					charCount = 0; // there are too many of the given char, to maintain correct frequency. notify about this later.
				
				// as the frequency and char count calculated is now with respect to the plaintext, push the char onto the noise
				// array "charCount" times.
				for (let i = 0; i < charCount; i++)
					noise.push(x);
			}

			// generated noise may not be exactly the desired length, because the rounding up of (blocklength / frequency) will
			// be slightly off. remedy by removing random chars until noise has correct length.
			while (noise.length !== this.blockLength - plaintext.length)
				noise.splice(this.getRandomInRange(Math.random, 0, noise.length - 1), 1);
			
			return noise;
		},
		
		encode: function (plaintext, seed, key) {

			if(plaintext.length > this.maxPlaintextLength)
				throw 'Plain text too long';

			let plaintextArr = typeof plaintext === 'string' ? plaintext.split('') : plaintext; // convert plaintext to string array
			let prng = new Math.seedrandom(seed + key); // seed the prng with desired key
			let plaintextLength = this.leftPad(plaintextArr.length.toString(), '000').split(''); // 3 digit length of plaintext
			let block = []; // the stegoblock

			plaintextArr = plaintextLength.concat(plaintextArr); // prepend plaintext length to plaintext
			let noise = this.generateNoise(plaintextArr.join('')); // generate noise with correct letter frequencies
	
			// iterate until entire block has been filled with message and noise
			while (block.length < this.blockLength) {

				let insertIndex = this.getRandomInRange(prng, 0, block.length);
				// pitfall: to avoid overriding any previously added char, new chars are inserted, as
				// opposed to setting the value at a given index to some char. this means later extraction
				// indexes are relative to their insertion order.
				block.splice(insertIndex, 0, this.getChar(plaintextArr, noise));
			}

			this.checkFrequency(block);

			// block will most likely contain consecutive spaces. those will be squashed by
			// https://dxr.mozilla.org/mozilla-central/rev/82d0a583a9a39bf0b0000bccbf6d5c9ec2596bcc/addon-sdk/source/test/addons/e10s-content/lib/httpd.js#4639
			// which is a normalization function that all headers go through. we cannot reverse
			// this transformation, and must therefore escape spaces. 
			let escaped = block.join('').replace(/_/g, '|_').replace(/ /g, '_');
			return escaped;
		},
		
		decode: function (ciphertext, seed, key) {
			
			// unesacpe any escaped spaces, introduced and mentioned in this.encode
			ciphertext = ciphertext.replace(/_/g, ' ').replace(/\|_/g, '_');

			let ciphertextArr = ciphertext.split('');
			let prng = new Math.seedrandom(seed + key);
			let insertionIndexes = [];
			let chars = [];
			
			// we can only generate the indexes forward, but need to pull chars out reversed.
			// therefore we will need to iterate twice.
			// because chars are always inserted, extraction indexes are relative to the block length.
			for (let i = 0; i < ciphertextArr.length; i++) {
			
				let insertIndex = this.getRandomInRange(prng, 0, insertionIndexes.length);
				insertionIndexes.unshift(insertIndex);
			}

			// we now have the reverse order of indexes the plaintext was inserted with. extract the correct chars.
			for (let i = 0; i < insertionIndexes.length; i++)
				chars.unshift(ciphertextArr.splice(insertionIndexes[i], 1)[0]);
				
			// parse the size of the plaintext to an int, so we can slice it off
			let size = parseInt(chars.slice(0, 3).join(''));

			return chars.slice(3, 3 + size).join('');
		},

		// checks if a string has correct frequency of each char, according to alphabetFrequencies.
		checkFrequency: function (string) {

			let allowedOffset = 0.1;
			let dict = {};
			let ret = {

				notInAlphabet: [],
				outsideFrequencyBounds: []
			};

			for (let i = 0; i < string.length; i++) {

				if (dict[string[i]] === undefined)
					dict[string[i]] = 0;
				
				dict[string[i]]++;
			}

			let frequencies = [];
			let sortedKeys = Object.keys(dict).sort();
			for (let i = 0; i < sortedKeys.length; i++) {

				let f = dict[sortedKeys[i]] / string.length * 100;
				let af = this.alphabetFrequencies[sortedKeys[i]];
				let isInAlphabet = af !== undefined;
				let isFrequencyWithinBounds = isInAlphabet && Math.abs(af - f) < allowedOffset;

				if (!isInAlphabet)
					ret.notInAlphabet.push(sortedKeys[i]);
				if (!isFrequencyWithinBounds)
					ret.outsideFrequencyBounds.push(sortedKeys[i]);
			}
			
			alert(JSON.stringify(ret)); // alert this for testing, halt of not empty
			return ret;
		},
		
		// returns the next char of a plaintext array or noise, if the first is empty.
		getChar: function (plaintext, noise) {

			if (plaintext.length > 0)
				return plaintext.shift();
				
			return noise.shift();
		},
		
		// returns a random int in the specified range (including), using the provided function.
		getRandomInRange: function (prng, min, max) {
			
			min = Math.ceil(min);
			max = Math.floor(max);
			return Math.floor(prng() * (max - min + 1)) + min;
		},
		
		// left pads some string with some other string
		leftPad: function (text, pad) {

			if (typeof text === 'undefined') 
				return pad;

			return (pad + text).substring(text.length, text.length + pad.length);
		}
	};
};

// extend the global variable with common functionality, for easy access
window.SBCommon.utils.extend(window.SBStego, SBStego());