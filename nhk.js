const argv = require('minimist')(process.argv.slice(2));
const https = require('https');
const fs = require('fs');
const Helpers = require('./helpers')(argv);

const NHK_HOST = 'https://www3.nhk.or.jp';

function makeId(data) {
    return 'nhk_' + data.vod_id;
}

function handleVideoData(data, programSlug, showId) {
    if (data.program_slag === programSlug || data.pgm_gr_id === programSlug) {
        Helpers.getFileName(showId, data.sub_title_clean || data.subtitle).then((newfile) => {
            if (newfile) {
                Helpers.youtubeDl(makeId(data), NHK_HOST + (data.vod_url || data.url), newfile, 'WEB-DL');
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
            https.get('https://api.nhk.or.jp/nhkworld/vodesdlist/v7a/program/' + show.nhkSlug + '/en/all/all.json?apikey=EJfK8jdS57GqlupFgAfAAwr573q01y6k', (resp) => {
            let data = '';

            resp.on('data', (chunk) => {
                data += chunk;
            });

            resp.on('end', () => {
                try {
                    let items = JSON.parse(data);
                    items.data.episodes.forEach((item) => episodes.push({show, data: item}));
                } catch (e) {

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
                return -1;
            } else if (a.data.vod_to < b.data.vod_to) {
                return 1;
            }
            return 0;
        });

        let limit = 10;
        episodes.forEach(element => {
            if (limit < 1) {
                return false;
            }

            if (!Helpers.getHistory(makeId(element.data))) {
                handleVideoData(element.data, element.show.nhkSlug, element.show.showId);
                limit--;
            }
        });
    }).catch(() => {
        console.log('Unknown error');
        process.exit(1)
    })
}