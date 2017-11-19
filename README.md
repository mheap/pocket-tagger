# pocket-tagger

A small node.js library for automatically tagging Pocket articles based on regular expressions

[![Build Status](https://api.travis-ci.org/mheap/pocket-tagger.svg?branch=master)](https://travis-ci.org/mheap/pocket-tagger)

`pocket-tagger` requires a minimum NodeJS version of 7.6

### Usage

```javascript
const PocketTagger = require("pocket-tagger");

(async function main(){
    const tagger = await PocketTagger(
        "default",
        {
            // Length related
            'length-too-short': '^[\\s\\S]{0,5}$',
            'length-short': '^[\\s\\S]{6,1500}$',
            'length-medium': '^[\\s\\S]{1501,5000}$',
            'length-long': '^[\\s\\S]{5001,15000}$',
            'length-essay': '^[\\s\\S]{15001,100000}$',
            'length-too-long': '^[\\s\\S]{100001,}$',

            // Code related
            'code-php': 'php',
            'code-javascript': 'javascript',
            'code-node': '(node\\.js|nodejs)',
            'code-golang': 'golang',

            // Talk related
            'slideshare-url': '^https://www.slideshare.net',
            'speakerdeck-url': '^https://www.speakerdeck.com',
            'slideshare-embed': 'https://www.slideshare.net/slideshow/embed_code',
            'speakerdeck-embed': 'speakerdeck-embed',

            // Urls
            'hacker-news': 'ycombinator',
        },
        {
            url: {
                "hacker-news": ["hacker-news"],
                "has-slides": ["slideshare-url", "speakerdeck-url"],
            },
            content: {
                "length-error": ["length-too-short","length-too-long"],
                "length-short": ["length-short"],
                "length-medium": ["length-medium"],
                "length-long": ["length-long"],
                "length-essay": ["length-essay"],
            },
            html: {
                "code-php": ["code-php"],
                "code-javascript": ["code-javascript"],
                "code-node": ["code-node"],
                "code-golang": ["code-golang"],
            }
        }
    );

    try {
        await tagger.run();
    } catch(e){
        console.log(e);
    }
})();
```
