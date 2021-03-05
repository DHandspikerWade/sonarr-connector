const argv = require('minimist')(process.argv.slice(2));
const https = require('https');
const fs = require('fs');
const child_process = require('child_process');
const Helpers = require('./helpers')(argv);

const bannedTitles = ['[Private video]', '[Deleted video]'];

function makeId(youtubeId) {
    return 'youtube_' + youtubeId;
}

function handleDryVideoItem(show, title, watchId) {
    let newTitle = title;
    

    // Bring into the helpers?
    for (const [regexStr, replacement] of Object.entries(show.titleReplacements || {})) {
        // TODO: Is there a good way to reuse the RegExp obj?
        newTitle = newTitle.replace(new RegExp(regexStr, 'g'), replacement);
    }

    Helpers.getFileName(show.showId, newTitle, (episodes) => {
        if (episodes.length === 1) {
            return episodes[0];
        }

        let i;
        for (const [regexStr, replacementData] of Object.entries(show.matchReplacements || {})) {
            // TODO: Is there a good way to reuse the RegExp obj?
            if (title.match(new RegExp(regexStr, 'g'))) {
                episodes = episodes.filter((episode) => {
                    return (episode.season == replacementData.season || episode.season == 0);
                });
            }
        }

        if (episodes.length === 1) {
            return episodes[0];
        }

        return false;
    }).then((newfile) => {
        if (newfile) {
            Helpers.youtubeDl(makeId(watchId), 'https://www.youtube.com/watch?v=' + watchId, newfile, 'WEB-DL');
        }
    });
}

console.log('starting');
Helpers.init();

let settings = fs.readFileSync(__dirname + '/youtube.json', 'UTF-8');
settings = JSON.parse(settings);

let limit = 20;
if (settings && settings.shows) {
    settings.shows.forEach(async (show) => {
        if (limit < 1) {
            return false;
        }

        await child_process.exec(
            // Trusting the playlist to not contain single quotes. Dangerous!
            'youtube-dl --no-warnings --no-progress --no-color --flat-playlist --ignore-errors --dump-json \'' + show.youtubePlaylist + '\'',
            // 8MB buffer that should never be hit. If reached, abandon hope. Testing with PLpR68gbIfkKnP7m8D04V40al1t8rAxDT0 (5000 item list) resulted in 1.2MB
            {maxBuffer: 1024 * 1024 * 8},
            (error, stdout, stderr) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    return;
                }

                let items = stdout.toString().trim().split("\n");
                stdout = null;

                let youtubeId;
                items.forEach((item) => {
                    if (limit < 1) {
                        return false;
                    }

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

                    // For single videos use `data.id`
                    youtubeId = data.url || data.id;

                    if (youtubeId) {
                        if (!Helpers.getHistory(makeId(youtubeId))) {
                            handleDryVideoItem(show, data.title, youtubeId);
                            limit--;
                        }
                    }
                });
            }
        );
    });
}