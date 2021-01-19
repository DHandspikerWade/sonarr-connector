const argv = require('minimist')(process.argv.slice(2));
const https = require('https');
const fs = require('fs');
const child_process = require('child_process');
const Helpers = require('./helpers')(argv, 'youtube');

const bannedTitles = ['[Private video]', '[Deleted video]'];

function handleDryVideoItem(showId, replacements, title, url) {
    let newTitle = title;

    for (const [regexStr, replacement] of Object.entries(replacements)) {
        // TODO: Is there a good way to reuse the RegExp obj?
        newTitle = newTitle.replace(new RegExp(regexStr, 'g'), replacement);
    }

    Helpers.getFileName(showId, newTitle).then((newfile) => {
        if (newfile) {
            Helpers.youtubeDl(url, newfile, 'WEB-DL');
        }
    });
}

console.log('starting');
Helpers.prepareScript();

let settings = fs.readFileSync(__dirname + '/youtube.json', 'UTF-8');
settings = JSON.parse(settings);

if (settings && settings.shows) {
    settings.shows.forEach((show) => {
        child_process.exec(
            // Trusting the playlist to not contain single quotes. Dangerous!
            'youtube-dl --no-warnings --no-progress --no-color --flat-playlist --ignore-errors --dump-json \'' + show.youtubePlaylist + '\'',
            // 8MB buffer. Should never hit if reached, abandon hope. Testing with PLpR68gbIfkKnP7m8D04V40al1t8rAxDT0 (5000 item list) resulted in 1.2MB
            {maxBuffer: 1024 * 1024 * 8},
            (error, stdout, stderr) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    return;
                }

                let items = stdout.toString().trim().split("\n");
                stdout = null;

                items.forEach((item) => {
                    if (!(item && item.trim())) {
                        return;
                    }

                    let data;
                    try {
                        data = JSON.parse(item);
                    } catch (e) {
                        console.log('JSON parse failed');
                        console.log(item);
                    }

                    if (!(data && data.title) || bannedTitles.indexOf(data.title) > -1) {
                        return;
                    }

                    handleDryVideoItem(show.showId, show.titleReplacements || {}, data.title, 'https://www.youtube.com/watch?v=' + data.url);
                });
            }
        );
    });
}