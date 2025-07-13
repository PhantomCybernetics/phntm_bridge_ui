export function buf2hex(buffer) {
	// buffer is an ArrayBuffer
	return [...new Uint8Array(buffer)]
		.map((x) => x.toString(16).padStart(2, "0"))
		.join(" ");
}

export function escapeHtml(unsafe) {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export function deg2rad(degrees) {
	var pi = Math.PI;
	return degrees * (pi / 180);
}

export function rad2deg(r) {
	return (r * 180.0) / Math.PI;
}

export function nl2br(str, is_xhtml) {
	if (typeof str === "undefined" || str === null) {
		return "";
	}
	var breakTag = is_xhtml || typeof is_xhtml === "undefined" ? "<br />" : "<br>";
	return (str + "").replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, "$1" + breakTag + "$2");
}

export function unquote(str) {
	return str.replace(/"([^"]+)":/g, "$1:");
}

export function prettifyXml(sourceXml) {
	var xmlDoc = new DOMParser().parseFromString(sourceXml, "application/xml");
	var xsltDoc = new DOMParser().parseFromString(
		[
			// describes how we want to modify the XML - indent everything
			'<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform">',
			'  <xsl:strip-space elements="*"/>',
			'  <xsl:template match="para[content-style][not(text())]">', // change to just text() to strip space in text nodes
			'    <xsl:value-of select="normalize-space(.)"/>',
			"  </xsl:template>",
			'  <xsl:template match="node()|@*">',
			'    <xsl:copy><xsl:apply-templates select="node()|@*"/></xsl:copy>',
			"  </xsl:template>",
			'  <xsl:output indent="yes"/>',
			"</xsl:stylesheet>",
		].join("\n"),
		"application/xml",
	);

	var xsltProcessor = new XSLTProcessor();
	xsltProcessor.importStylesheet(xsltDoc);
	var resultDoc = xsltProcessor.transformToDocument(xmlDoc);
	var resultXml = new XMLSerializer().serializeToString(resultDoc);
	return resultXml;
}

export function linkifyURLs(text, is_xhtml) {
	const options = {
		//rel: 'nofollow noreferrer noopener',
		formatHref: {
			hashtag: (val) => `https://www.twitter.com/hashtag/${val.substr(1)}`,
			mention: (val) => `https://github.com/${val.substr(1)}`,
		},
		render: ({ tagName, attributes, content }) => {
			let attrs = "";
			tagName = "A";
			for (const attr in attributes) {
				if (attr == "href") {
					attrs += ` ${attr}=javascript:GetFile(\'${attributes[attr]}\');`;
				} else attrs += ` ${attr}=${attributes[attr]}`;
			}
			return `<${tagName}${attrs}>${content}</${tagName}>`;
		},
	};

	if (is_xhtml) return linkifyHtml(text, options);
	else return linkifyStr(text, options);
}

export function lerpColor(a, b, amount) {
	var ah = parseInt(a.replace(/#/g, ""), 16),
		ar = ah >> 16,
		ag = (ah >> 8) & 0xff,
		ab = ah & 0xff,
		bh = parseInt(b.replace(/#/g, ""), 16),
		br = bh >> 16,
		bg = (bh >> 8) & 0xff,
		bb = bh & 0xff,
		rr = (1.0 - amount) * ar + amount * br,
		rg = (1.0 - amount) * ag + amount * bg,
		rb = (1.0 - amount) * ab + amount * bb;

	return "#" + (((1 << 24) + (rr << 16) + (rg << 8) + rb) | 0).toString(16).slice(1);
}

export function randColor() {
	let r = Math.round(Math.random() * 255)
		.toString(16)
		.padStart(2, "0");
	let g = Math.round(Math.random() * 255)
		.toString(16)
		.padStart(2, "0");
	let b = Math.round(Math.random() * 255)
		.toString(16)
		.padStart(2, "0");
	return "#" + r + g + b;
}

export function lerp(a, b, alpha) {
	return (1.0 - alpha) * a + alpha * b;
}

export function formatBytes(b, mib = false, short = false) {
	let unit = mib ? 1000 : 1024;
	let GB = unit * unit * unit;
	let MB = unit * unit;
	let KB = unit;

	if (typeof b === "bigint") b = Number(b);

	if (b > GB) {
		return (b / GB).toFixed(1) + (short ? "G" : mib ? "GiB" : "GB");
	} else if (b > MB) {
		return (b / MB).toFixed(1) + (short ? "M" : mib ? "MiB" : "MB");
	} else if (b > KB) {
		return (b / KB).toFixed(1) + (short ? "K" : mib ? "KiB" : "KB");
	} else if (b > 0) {
		return b.toFixed(1) + "B";
	} else return "0B";
}

export function roughSizeOfObject(object) {
	const objectList = [];
	const stack = [object];
	let bytes = 0;

	while (stack.length) {
		const value = stack.pop();

		switch (typeof value) {
			case "boolean":
				bytes += 4;
				break;
			case "string":
				bytes += value.length * 2;
				break;
			case "number":
				bytes += 8;
				break;
			case "object":
				if (!objectList.includes(value)) {
					objectList.push(value);
					for (const prop in value) {
						if (value.hasOwnProperty(prop)) {
							stack.push(value[prop]);
						}
					}
				}
				break;
		}
	}

	return bytes;
}

export function isTouchDevice() {
	// return (('ontouchstart' in window) ||
	//   (navigator.maxTouchPoints > 0) ||
	//   (navigator.msMaxTouchPoints > 0));
	let check = false;
	(function (a) {
		if (
			/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(
				a,
			) ||
			/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(
				a.substr(0, 4),
			)
		)
			check = true;
	})(navigator.userAgent || navigator.vendor || window.opera);
	return check;
}

export function isPortraitMode() {
	// return screen.availHeight > screen.availWidth;
	return window.matchMedia("(orientation: portrait)").matches;
}

export function isIOS() {
	let ua = window.navigator.userAgent;
	let iOS = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i);
	return iOS;
}

export function isSafari() {
	let ua = window.navigator.userAgent;

	let webkit = !!ua.match(/WebKit/i);
	let iOSSafari = isIOS() && webkit && !ua.match(/CriOS/i);

	// let is_safari = navigator.userAgent.toLowerCase().indexOf('safari/') > -1;
	// console.log('safari: ', is_safari);
	return iOSSafari;
}

export function msToTime(duration) {
	var milliseconds = Math.floor((duration % 1000) / 100),
		seconds = Math.floor((duration / 1000) % 60),
		minutes = Math.floor((duration / (1000 * 60)) % 60),
		hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

	hours = hours < 10 ? "0" + hours : hours;
	minutes = minutes < 10 ? "0" + minutes : minutes;
	seconds = seconds < 10 ? "0" + seconds : seconds;

	return hours + ":" + minutes + ":" + seconds;
}

export function detectHWKeyboard() {
	// if (!isTouchDevice())
	//   return true; // always on on desktop

	// if (navigator.userAgent.includes('Android')) {
	//   return true; // no good way to detect on Adroid
	// }

	// if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
	//   // if (navigator.userAgent.includes('OS 14_') || navigator.userAgent.includes('OS 15_')) {
	//     if (navigator.getGamepads().some(gamepad => gamepad?.connected && gamepad?.id.includes('Keyboard'))) {
	//       return true;
	//     } else {
	//       return false;
	//     }
	//   // }
	// }

	// return false;

	return true;
}
