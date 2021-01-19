const SonarrAPI = require('./sonarr');
const fs = require('fs');
const child_process = require('child_process');
const Queue = require('promise-queue')

const SONARR_OPTIONS = {
    hostname: process.env.SONARR_HOST,
    apiKey: process.env.SONARR_KEY,
    port: 443,
    ssl: true,
    urlBase: ''
};

let shellQueue = new Queue(2, Infinity);

module.exports = function (argv, scriptName) {
    scriptName = scriptName || 'script';
    const copyComand = argv.copy || 'scp';
    const fileDestination = argv.output || '';
    const webDestination = argv.http || '';
    const includeDelete = !!argv.delete;
    const newScript = !argv.append;

    var sonarr = new SonarrAPI(SONARR_OPTIONS);

    if (!(SONARR_OPTIONS.hostname && SONARR_OPTIONS.apiKey && SONARR_OPTIONS.port)) {
        console.log('Error: Missing sonarr details');
    }

    // Cache sonarr requests
    let episodeList = {};

    function writeToScript(url, outputTitle, quality, resolution) {
        let filename = (outputTitle + '.English.' + resolution + '.' + quality).replace('(', '').replace(')', '')
        fs.appendFileSync(scriptName + ".sh", "\n" + 'realurl=$(curl -ILs -o /dev/null -w %{url_effective} \'' + url + '\')');
        fs.appendFileSync(scriptName + ".sh", "\n" + 'nextfilename=$(youtube-dl --get-filename -f \'bestvideo+bestaudio/best\' --merge-output-format mkv -o \'' + filename + '.%(ext)s\' "$realurl")');
        fs.appendFileSync(scriptName + ".sh", "\n" + 'youtube-dl --download-archive \'' + fileDestination + 'archive.txt\' --add-metadata -f \'bestvideo+bestaudio/best\' --all-subs --embed-subs --merge-output-format mkv -o \'' + filename + '.%(ext)s\' "$realurl"');
        fs.appendFileSync(scriptName + ".sh", ' \\' + "\n" + '&& test -f "$nextfilename" && mktorrent -p -a \'udp://127.0.0.1\' -w \'' + webDestination + '\'"$nextfilename" "$nextfilename"');
        fs.appendFileSync(scriptName + ".sh", ' \\' + "\n" + '&& ' + copyComand + ' "./' + filename + '"* \'' + fileDestination + "\'");
        fs.appendFileSync(scriptName + ".sh",' \\' + "\n" + '&& curl -i -H "Accept: application/json" -H "Content-Type: application/json" -H "X-Api-Key: $apiKey" -X POST -d \'{"title":"\'"$nextfilename"\'","downloadUrl":"' + webDestination + '\'"$nextfilename"\'.torrent","protocol":"torrent","publishDate":"\'"$date"\'"}\' ' + (SONARR_OPTIONS.ssl ? 'https://' : 'http://') + SONARR_OPTIONS.hostname + '/api/release/push');
        fs.appendFileSync(scriptName + ".sh","\n" + 'rm -f "./' + filename + "\"*\n");
    
        fs.appendFileSync(scriptName + ".sh","echo '' \n");
    }

    const self = {
        youtubeDl: function (url, output, quality, resolution) {
            quality = quality || 'WEBRip';

            if (!resolution) { // TODO: Is there a better way? Maybe within an earlier JSON feed?
                self.queueShell(
                    // Ask youtube-dl what resolution it's going to download
                    'youtube-dl --no-warnings --no-progress --no-color --ignore-errors -f \'bestvideo+bestaudio/best\' --get-filename -o \'%(height)s\' \'' + url + '\'',
                    (error, stdout, stderr) => {
                        if (error) {
                            console.error(`exec error: ${error}`);
                            return;
                        }

                        let string = stdout.toString();

                        if (string) {
                            resolution = string.trim() + 'p';
                            writeToScript(url, output, quality, resolution);
                        }
                    }
                );
            } else {
                writeToScript(url, output, quality, resolution);
            }
        },

        prepareScript: function () {
            if (newScript) {
                fs.writeFileSync(scriptName + ".sh", '#!/bin/bash' + "\n" + 'date=$(date -u +"%Y-%m-%d %H:%M:%SZ")' + "\n" + 'apiKey=' + SONARR_OPTIONS.apiKey + "\n\n");
                includeDelete && fs.writeFileSync(scriptName + ".sh", 'mkdir -p "' + fileDestination + "\"\n");
                includeDelete && fs.appendFileSync(scriptName + ".sh", 'rm -f"' + fileDestination + "/*\"\n");
            
            } else {
                fs.appendFileSync(scriptName + ".sh", '');
            }
            
            fs.chmodSync(scriptName + ".sh", 0o765);
        },
        findSonarrDetails: function (showId, episodeSlug) {

            if (!(showId in episodeList)) {
                episodeList[showId] = false;

                sonarr.get('series', {}).then(
                    serieses => sonarr.get("episode", { "seriesId": showId }).then(function (result) {
                        let series = null;
                        
                        serieses.forEach(value => {
                            if (value.id == showId) {
                                series = value;
                            }
                        });
                        
                        episodes = {};
                        let item, episode;
                        for (item of result) {
                            if (item && item.monitored) {
                                let compareSlug = self.toCompareSlug(item.title);
                                // "TBA" effectively means Sonarr doesn't have correct data yet. 
                                // Would a show ever have an episode with the slug of "tba"? Let's hope not.
                                if (compareSlug == 'tba') {
                                    continue;
                                }
    
                                episode = {
                                    seriesSlug: series.sortTitle.toLowerCase(),
                                    title: item.title,
                                    season: item.seasonNumber,
                                    episode: item.episodeNumber
                                };
                                
                                // TODO: Different seasons may have create duplicate slugs
                                episodes[compareSlug] = episode;
                            }
                        }
    
                        episodeList[showId] = episodes;
            
                        // Does it have a file? 
                        // Has the cuttoff been met? 
                        // pass back to download
                    }).catch((reason) => {
                        console.log(reason)
                    })).catch((reason) => {
                        console.log(reason)
                });
            }

            return new Promise((resolve) => {
                let loopId = setInterval(() => {
                    if (showId in episodeList && episodeList[showId]) {
                        clearInterval(loopId);
    
                        if (episodeSlug in episodeList[showId]) {
                            resolve(episodeList[showId][episodeSlug])
                        } else {
                            resolve(false);
                        }
                    }
                }, 100);
            });
        },

        toCompareSlug: function(input) {
            input = input || '';
            return input.trim().toLowerCase().replace(/[^a-z0-9 -]+/g, ' ').replace(/\s+/g, '-').replace(/\-+/g, '-').replace(/\~/g, '_').replace(/\_+/g, '_');
        },

        queueShell: function (cmd, resultCallback) {
            shellQueue.add(() => {
                return new Promise((resolve, reject) => {
                    child_process.exec(
                        cmd,
                        (error, stdout, stderr) => {
                            resultCallback(error, stdout, stderr);
                            resolve(stdout);
                        }
                    );
                })
            }).then(() => {}).catch((e) => { console.log('SHELL CATCH: ' + e)})
        },

        getFileName: function(showId, title) {
            return new Promise((resolve) => {
                self.findSonarrDetails(showId, self.toCompareSlug(title)).catch((reason) => {
                    console.log('failed');
                    console.log(reason)
                }).then((episode) => {
                    if (episode) {
                        let title = episode.title.toLowerCase().replace(/[\[\]\/\?<>\~\\:\*\|\'\":,]/g, '').replace(/\s+/g, '.');
                        let showTitle = episode.seriesSlug.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '.');
                        resolve(showTitle + '.S' + ('' + episode.season).padStart(2, '0') + 'E' +  ('' + episode.episode).padStart(2, '0') + '.' + title);
                    } else {
                        resolve('');
                    }
                }).catch(() => resolve(''));
            });
        }
    };

    return self;
}