export function buf2hex(buffer) { // buffer is an ArrayBuffer
    return [...new Uint8Array(buffer)]
        .map(x => x.toString(16).padStart(2, '0'))
        .join(' ');
}

export function escapeHtml(unsafe)
{
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

export function deg2rad(degrees)
{
  var pi = Math.PI;
  return degrees * (pi/180);
}

export function nl2br (str, is_xhtml) {
    if (typeof str === 'undefined' || str === null) {
        return '';
    }
    var breakTag = (is_xhtml || typeof is_xhtml === 'undefined') ? '<br />' : '<br>';
    return (str + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1' + breakTag + '$2');
}

export function prettifyXml(sourceXml)
{
    var xmlDoc = new DOMParser().parseFromString(sourceXml, 'application/xml');
    var xsltDoc = new DOMParser().parseFromString([
        // describes how we want to modify the XML - indent everything
        '<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform">',
        '  <xsl:strip-space elements="*"/>',
        '  <xsl:template match="para[content-style][not(text())]">', // change to just text() to strip space in text nodes
        '    <xsl:value-of select="normalize-space(.)"/>',
        '  </xsl:template>',
        '  <xsl:template match="node()|@*">',
        '    <xsl:copy><xsl:apply-templates select="node()|@*"/></xsl:copy>',
        '  </xsl:template>',
        '  <xsl:output indent="yes"/>',
        '</xsl:stylesheet>',
    ].join('\n'), 'application/xml');

    var xsltProcessor = new XSLTProcessor();
    xsltProcessor.importStylesheet(xsltDoc);
    var resultDoc = xsltProcessor.transformToDocument(xmlDoc);
    var resultXml = new XMLSerializer().serializeToString(resultDoc);
    return resultXml;
};



export function linkifyURLs(text, is_xhtml) {
    const options = {
        //rel: 'nofollow noreferrer noopener',
        formatHref: {
          hashtag: (val) => `https://www.twitter.com/hashtag/${val.substr(1)}`,
          mention: (val) => `https://github.com/${val.substr(1)}`
        },
        render: ({ tagName, attributes, content }) => {
            let attrs = "";
            tagName = 'A';
            for (const attr in attributes) {
                if (attr == 'href') {
                    attrs += ` ${attr}=javascript:GetFile(\'${attributes[attr]}\');`;
                } else
                    attrs += ` ${attr}=${attributes[attr]}`;
            }
            return `<${tagName}${attrs}>${content}</${tagName}>`;
        },
      }

      if (is_xhtml)
        return linkifyHtml(text, options)
    else
        return linkifyStr(text, options)
}


export function lerpColor(a, b, amount) {

    var ah = parseInt(a.replace(/#/g, ''), 16),
        ar = ah >> 16, ag = ah >> 8 & 0xff, ab = ah & 0xff,
        bh = parseInt(b.replace(/#/g, ''), 16),
        br = bh >> 16, bg = bh >> 8 & 0xff, bb = bh & 0xff,
        rr = (1.0-amount)*ar + amount * (br),
        rg = (1.0-amount)*ag + amount * (bg),
        rb = (1.0-amount)*ab + amount * (bb);

    return '#' + ((1 << 24) + (rr << 16) + (rg << 8) + rb | 0).toString(16).slice(1);
}

export function randColor() {
    let r = Math.round((Math.random() * 255)).toString(16).padStart(2, '0');
    let g = Math.round((Math.random() * 255)).toString(16).padStart(2, '0');
    let b = Math.round((Math.random() * 255)).toString(16).padStart(2, '0');
    return '#'+r+g+b;
}

export function lerp(a, b, alpha) {
    return (1.0-alpha) * a + alpha * (b)
}

export function roughSizeOfObject(object) {
    const objectList = [];
    const stack = [object];
    let bytes = 0;
  
    while (stack.length) {
      const value = stack.pop();
  
      switch (typeof value) {
        case 'boolean':
          bytes += 4;
          break;
        case 'string':
          bytes += value.length * 2;
          break;
        case 'number':
          bytes += 8;
          break;
        case 'object':
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