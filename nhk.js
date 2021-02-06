const argv = require('minimist')(process.argv.slice(2));
const https = require('https');
const fs = require('fs');
const Helpers = require('./helpers')(argv, 'nhk');

const NHK_HOST = 'https://www3.nhk.or.jp';

function handleVideoData(data, programSlug, showId) {
    if (data.program_slag === programSlug || data.pgm_gr_id === programSlug) {
        Helpers.getFileName(showId, data.sub_title_clean || data.subtitle).then((newfile) => {
            if (newfile) {
                Helpers.youtubeDl(NHK_HOST + (data.vod_url || data.url), newfile, 'WEB-DL');
            }
        });
    }
}

function parseApiData(json, programSlug, showId) {
    if (json.data && json.data.episodes && json.data.episodes.length) {
        json.data.episodes.sort(function(a, b) {
            if (a.vod_to > b.vod_to) {
                return -1;
            } else if (a.vod_to < b.vod_to) {
                return 1;
            }
            return 0;
        });

        let i;
        for (i = 0; i < json.data.episodes.length; i++) {
            handleVideoData(json.data.episodes[i], programSlug, showId);
        }
    }
}

console.log('starting');
Helpers.prepareScript();

let settings = fs.readFileSync(__dirname + '/nhk.json', 'UTF-8');
settings = JSON.parse(settings);

if (settings && settings.shows) {
    settings.shows.forEach((show) => {
        https.get('https://api.nhk.or.jp/nhkworld/vodesdlist/v7a/program/' + show.nhkSlug + '/en/all/all.json?apikey=EJfK8jdS57GqlupFgAfAAwr573q01y6k', (resp) => {
        let data = '';

        resp.on('data', (chunk) => {
            data += chunk;
        });

        resp.on('end', () => {
            parseApiData(JSON.parse(data), show.nhkSlug, show.showId);
        });

        }).on("error", (err) => {
            console.log("Error: " + err.message);
        });
    })
}