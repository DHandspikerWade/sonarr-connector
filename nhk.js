const argv = require('minimist')(process.argv.slice(2));
const https = require('https');
const fs = require('fs');
const Helpers = require('./helpers')(argv);

const NHK_HOST = 'https://www3.nhk.or.jp';

function makeId(data) {
    // @TODO Remove marking when no longer forcing 720p
    return 'nhk_' + data.vod_id + '-limited-720';
}

function getVodURL(data) {
    return NHK_HOST + (data.vod_url || data.url);
}

function handleVideoData(data, programSlug, showId, show) {
    if (data.program_slag === programSlug || data.pgm_gr_id === programSlug) {
        let newTitle = data.sub_title_clean || data.subtitle;
        // Bring into the helpers?
        for (const [regexStr, replacement] of Object.entries(show.titleReplacements || {})) {
            // TODO: Is there a good way to reuse the RegExp obj?
            newTitle = newTitle.replace(new RegExp(regexStr, 'g'), replacement);
        }

        Helpers.getFileName(showId, newTitle).then((newfile) => {
            if (newfile) {
                // Force 702p as NHK's CDN corrupts their own 1080p videos (https://github.com/yt-dlp/yt-dlp/issues/3666)
                Helpers.youtubeDl(makeId(data), getVodURL(data), newfile, 'WEB-DL', null, 'bestvideo[height<=720]+bestaudio/best[height<=720]');
            }
        });
    }
}

console.log('starting');
Helpers.init();

let settings = fs.readFileSync(__dirname + '/nhk.json', 'UTF-8');
settings = JSON.parse(settings);

let episodes = [];
let promises = [];
if (settings && settings.shows) {
    settings.shows.forEach((show) => {
        promises[promises.length] = new Promise((finished) => {
            https.get('https://nwapi.nhk.jp/nhkworld/vodesdlist/v7b/program/' + show.nhkSlug + '/en/all/all.json', (resp) => {
            let data = '';

            resp.on('data', (chunk) => {
                data += chunk;
            });

            resp.on('end', () => {
                try {

                    // console.log(data);
                    let items = JSON.parse(data);
                    // console.log(items)

                    items.data.episodes.forEach((item) => episodes.push({show, data: item}));
                } catch (e) {
                    console.log(e)
                }
                finished();
            });

            }).on("error", (err) => {
                console.log("Error: " + err.message);
                finished();
            });
        });
    });

    Promise.all(promises).then(() => {
        // Download expiring vods first
        episodes.sort(function(a, b) {
            if (a.data.vod_to > b.data.vod_to) {
                return 1;
            } else if (a.data.vod_to < b.data.vod_to) {
                return -1;
            }
            return 0;
        });

        let limit = 20;
        episodes.forEach(element => {
            let videoId = makeId(element.data);
            let downloadHistory = Helpers.getHistory(videoId);

            if (limit > 0) {
                if (!downloadHistory) {
                    handleVideoData(element.data, element.show.nhkSlug, element.show.showId, element.show);
                    limit--;
                }
            } 

            // Dirty hack to add names on next run...SHAMEFUL and basically it's own bug
            if (downloadHistory && !downloadHistory.originalTitle) {
                Helpers.updateHistory(videoId, {'originalTitle': element.data.sub_title_clean || element.data.subtitle});
            }
        });
    }).catch((e) => {
        console.log('Unknown error');
        console.error(e);
        process.exit(1)
    })
}