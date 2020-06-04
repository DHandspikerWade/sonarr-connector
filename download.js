const SonarrAPI = require('./sonarr');
const fs = require('fs');
const argv = require('minimist')(process.argv.slice(2));

console.log('starting');

const NHK_HOST = 'https://www3.nhk.or.jp';
const SONARR_OPTIONS = {
    hostname: process.env.SONARR_HOST,
    apiKey: process.env.SONARR_KEY,
    port: 443,
    ssl: true,
    urlBase: ''
};

if (!(SONARR_OPTIONS.hostname && SONARR_OPTIONS.apiKey && SONARR_OPTIONS.port)) {
    console.log('Error: Missing sonarr details');
}

const copyComand = argv.copy || 'scp';
const fileDestination = argv.output || '';
const webDestination = argv.http || '';
const includeDelete = !!argv.delete;
const programSlug = argv.slug;
const showId = argv.show;
const newScript = !argv.append;

var sonarr = new SonarrAPI(SONARR_OPTIONS);

//const replacements = JSON.parse(fs.readFileSync('known_replacements.json'));

function toCompareSlug(input) {
    input = input || '';
    return input.trim().toLowerCase().replace(/[^a-z0-9 -]+/g, ' ').replace(/\s+/g, '-').replace(/\-+/g, '-').replace(/\~/g, '_').replace(/\_+/g, '_');
}

function handleVideoData(data) {
    if (data.program_slag === programSlug || data.pgm_gr_id === programSlug) {
        findSonarrDetails(toCompareSlug(data.sub_title_clean || data.subtitle)).catch((reason) => {
            console.log('failed');
            console.log(reason)
        }).then((episode) => {
            if (episode && episode.needsFile) {
                let title = episode.title.toLowerCase().replace(/[\[\]\/\?<>\~\\:\*\|\'\":,]/g, '').replace(/\s+/g, '.');
                let showTitle = episode.seriesSlug.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '.');
                youtubeDl(NHK_HOST + (data.vod_url || data.url), showTitle + '.S' + episode.season + 'E' + episode.episode + '.' + title);
            }
        })
    }
}

let findSonarrDetails = (function () {
    let episodes = null;
    sonarr.get('series', {}).then(
        serieses => sonarr.get("episodeFile", { "seriesId": showId }).then(
        files => sonarr.get("episode", { "seriesId": showId }).then(function (result) {
            let series = null;
            
            serieses.forEach(value => {
                if (value.id == showId) {
                    series = value;
                }
            });

            episodes = {};
            let i, item, episode;
            for (i = 0; i < result.length; i++) {
                item = result[i];
                if (item && item.monitored) {
                    let needsFile = true;
                    let compareSlug = toCompareSlug(item.title);

                    // "TBA" effectively means Sonarr doesn't have correct data yet. 
                    // Would a show ever have an episode with the slug of "tba"? Let's hope not.
                    if (compareSlug == 'tba') {
                        continue;
                    }

                    files.forEach((value) => {
                        if (value.id == item.episodeFileId && !value.qualityCutoffNotMet) {
                            needsFile = false;
                        }
                    });

                    episode = {
                        seriesSlug: series.sortTitle.toLowerCase(),
                        title: item.title,
                        season: item.seasonNumber,
                        episode: item.episodeNumber,
                        needsFile: needsFile,
                    };
                    
                    // TODO: Different seasons may have create duplicate slugs
                    episodes[compareSlug] = episode;
                }
            }

            // Does it have a file? 
            // Has the cuttoff been met? 
            // pass back to download
        }).catch((reason) => {
            
        })).catch((reason) => {
            
    })).catch((reason) => {
            
    });

    return episodeSlug => {
        return new Promise((resolve) => {
            let loopId = setInterval(() => {
                if (episodes) {
                    clearInterval(loopId);

                    if (episodeSlug in episodes) {
                        resolve(episodes[episodeSlug])
                    } else {
                        resolve(false);
                    }
                }
            }, 100);
        });
    }
})();

if (newScript) {
    fs.writeFileSync("script.sh", '#!/bin/bash' + "\n" + 'date=$(date -u +"%Y-%m-%d %H:%M:%SZ")' + "\n" + 'apiKey=' + SONARR_OPTIONS.apiKey + "\n\n");
    includeDelete && fs.writeFileSync("script.sh", 'mkdir -p "' + fileDestination + "\"\n");
    includeDelete && fs.appendFileSync("script.sh", 'rm -f"' + fileDestination + "/*\"\n");

} else {
    fs.appendFileSync("script.sh", '');
}

fs.chmodSync('script.sh', 0o765);

function youtubeDl(url, output) {
    let filename = (output + '.English.720p.WEBRip').replace('(', '').replace(')', '')
    fs.appendFileSync("script.sh", "\n" + 'realurl=$(curl -ILs -o /dev/null -w %{url_effective} \'' + url + '\')');
    fs.appendFileSync("script.sh", "\n" + 'nextfilename=$(youtube-dl --get-filename -f best --merge-output-format mkv -o \'' + filename + '.%(ext)s\' "$realurl")');
    fs.appendFileSync("script.sh", "\n" + 'youtube-dl --download-archive \'' + fileDestination + 'archive.txt\' --add-metadata -f best --all-subs --embed-subs --merge-output-format mkv -o \'' + filename + '.%(ext)s\' "$realurl"');
    fs.appendFileSync("script.sh", ' \\' + "\n" + '&& test -f "$nextfilename" && mktorrent -p -a \'udp://127.0.0.1\' -w \'' + webDestination + '\'"$nextfilename" "$nextfilename"');
    fs.appendFileSync("script.sh", ' \\' + "\n" + '&& ' + copyComand + ' "./' + filename + '"* \'' + fileDestination + "\'");
    fs.appendFileSync("script.sh",' \\' + "\n" + '&& curl -i -H "Accept: application/json" -H "Content-Type: application/json" -H "X-Api-Key: $apiKey" -X POST -d \'{"title":"\'"$nextfilename"\'","downloadUrl":"' + webDestination + '\'"$nextfilename"\'.torrent","protocol":"torrent","publishDate":"\'"$date"\'"}\' ' + (SONARR_OPTIONS.ssl ? 'https://' : 'http://') + SONARR_OPTIONS.hostname + '/api/release/push');
    fs.appendFileSync("script.sh","\n" + 'rm -f "./' + filename + "\"*\n");

    fs.appendFileSync("script.sh","echo '' \n");
}

function parseApiData(json) {
    if (json.data && json.data.episodes && json.data.episodes.length) {
        let i;
        for (i = 0; i < json.data.episodes.length; i++) {
            handleVideoData(json.data.episodes[i]);
        }
    }
}

const https = require('https');

https.get('https://api.nhk.or.jp/nhkworld/vodesdlist/v7a/program/' + programSlug + '/en/all/all.json?apikey=EJfK8jdS57GqlupFgAfAAwr573q01y6k', (resp) => {
  let data = '';

  resp.on('data', (chunk) => {
    data += chunk;
  });

  resp.on('end', () => {
    parseApiData(JSON.parse(data));
  });

}).on("error", (err) => {
  console.log("Error: " + err.message);
});