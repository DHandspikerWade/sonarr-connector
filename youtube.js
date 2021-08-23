const argv = require('minimist')(process.argv.slice(2));
const https = require('https');
const fs = require('fs');
const child_process = require('child_process');
const util = require('util');
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

const promisingExec = util.promisify(child_process.exec);

let limit = 20;
if (settings && settings.shows) {
    let videos = [];
    let promises = [];
    let currentShowPromise = null;
    settings.shows.forEach((show) => {
        if (limit < 1) {
            return false;
        }

        currentShowPromise = promisingExec(
            // Trusting the playlist to not contain single quotes. Dangerous!
            'yt-dlp --no-warnings --no-progress --no-color --flat-playlist --ignore-errors --dump-json \'' + show.youtubePlaylist + '\'',
            // 8MB buffer that should never be hit. If reached, abandon hope. Testing with PLpR68gbIfkKnP7m8D04V40al1t8rAxDT0 (5000 item list) resulted in 1.2MB
            {maxBuffer: 1024 * 1024 * 8}
        );

        currentShowPromise.then((std) => {
            let items = std.stdout.toString().trim().split("\n");

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

                let videoData = {
                    show, 
                    title: data.title,
                    // For single videos use `data.id`
                    youtubeId: data.url || data.id
                };

                videos.push(videoData);
            });
        });

        currentShowPromise.catch((error) => {
            console.error(`exec error: ${error}`);
            return;
        })

        promises.push(currentShowPromise);
    });

    Promise.all(promises).then(() => {
        // Shuffle array to prevent video without match yet clogging up other channels
        videos = Helpers.shuffleArray(videos);

        videos.forEach((data) => {
            let videoId = makeId(data.youtubeId);
            let downloadHistory = Helpers.getHistory(videoId);

            if (!downloadHistory) {
                // handleDryVideoItem(show, data.title, data.youtubeId);
                console.log('trying: ' + data.title);
                limit--;
            }

            // Dirty hack to add names on next run...SHAMEFUL and basically it's own bug
            if (downloadHistory && !downloadHistory.originalTitle) {
                Helpers.updateHistory(videoId, {'originalTitle': data.title});
            }
        });
        
    }).catch((e) => {
        console.log('Unknown error');
        console.error(e);
        process.exit(1)
    });
}