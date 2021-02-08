const SonarrAPI = require('./sonarr');
const fs = require('fs');
const diskusage = require('diskusage-ng');
const https = require('https');
const Url = require('url').URL
const child_process = require('child_process');
const Queue = require('promise-queue')
const FileSync = require('lowdb/adapters/FileSync')
// shell-escape package annoyingly doesn't check if string
const shellescape = (a => (b) => a(b.map(c => c + '')))(require('shell-escape'));

const SONARR_OPTIONS = {
    hostname: process.env.SONARR_HOST,
    apiKey: process.env.SONARR_KEY,
    port: 443,
    ssl: true,
    urlBase: ''
};

const DEBUG = process.env.DEBUG && process.env.DEBUG > 0;
const DEBUG_QUALITY = 'worstvideo+worstaudio/worst';
const MIN_DISK_SPACE = 10 * 1024 * 1024 * 1024; // 10GB in bytes

function genericShellQueue(queue) {
    return function (cmd, resultCallback) {
        queue.add(() => {
            return new Promise((resolve, reject) => {
                if (DEBUG) console.debug(cmd);
                child_process.exec(
                    cmd,
                    (error, stdout, stderr) => {
                        resultCallback(error, stdout, stderr);
                        resolve(stdout);
                    }
                );
            })
        }).then(() => {}).catch((e) => { console.log('SHELL CATCH: ' + e)})
    };
}

const downloadQueue = new Queue(2, Infinity); 
let historyDb = require('lowdb')(new FileSync('/config/history.json'));
module.exports = function (argv) {
    const fileDestination = argv.output || '';
    const webDestination = argv.http || '';

    if (DEBUG) {
        console.debug('DEBUG enabled.');
        console.debug('Sonarr config: ' + JSON.stringify(SONARR_OPTIONS));
    }

    let self;
    let sonarr = new SonarrAPI(SONARR_OPTIONS);

    if (!(SONARR_OPTIONS.hostname && SONARR_OPTIONS.apiKey && SONARR_OPTIONS.port)) {
        console.log('Warning: Missing sonarr details');
    }

    historyDb.defaults({ downloaded: [] });

    // Cache sonarr requests
    let episodeList = {};

    function queueDownload(cmd, resultCallback) {
        downloadQueue.add(() => {
            return new Promise((resolve, reject) => {
                diskusage(fileDestination, function(err, usage) {
                    if (err) return console.log(err);
                    if (DEBUG) console.debug(cmd);

                    if (usage.available > MIN_DISK_SPACE) {
                        child_process.exec(
                            cmd,
                            (error, stdout, stderr) => {
                                resultCallback(error, stdout, stderr);
                                resolve(stdout);
                            }
                        );
                    } else {
                        if (DEBUG) console.debug('Disk limit reached.');
                    }
                });
            })
        }).then(() => {}).catch((e) => { console.log('SHELL CATCH: ' + e)})
    }

    function getProcessedFilename(filename, url) {
        return new Promise((resolve) => {
            self.queueShell(shellescape([
                'youtube-dl', 
                '--no-warnings', 
                '--no-progress', 
                '--no-color',
                '--ignore-errors', 
                '--get-filename', 
                '-f', (DEBUG ? DEBUG_QUALITY : 'bestvideo+bestaudio/best'), 
                '--merge-output-format', 'mkv', 
                '-o', filename + '.%(ext)s', 
                url
            ]),  (error, stdout) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    return;
                }

                resolve((stdout.toString() || '').trim());
            });
        });
    }

    function downloadVideo(url, filename) {
        return new Promise((downloaded) => {
            let downloadUrl = new Url(url);
            https.get(url, (res) => {
                if(res.statusCode === 301 || res.statusCode === 302) {
                    if (res.headers.location) {   
                        if (response.headers.location.match(/^http/)) {
                            let newUrl = new Url(response.headers.location);
                            downloadUrl.host = newUrl.host;
                            downloadUrl.path = newUrl.path;
                        } else {
                            downloadUrl.path = response.headers.location;
                        }
                    }
                }

                if (res.statusCode >= 200 && res.statusCode < 400) {
                    getProcessedFilename(filename, downloadUrl).then((properFilename) => {
                        if (properFilename) {
                            let outputFile = fileDestination + properFilename;
                            
                            
                            queueDownload(shellescape([
                                'youtube-dl',
                                '--add-metadata',
                                '-f', (DEBUG ? DEBUG_QUALITY : 'bestvideo+bestaudio/best'),
                                '--all-subs',
                                '-c',
                                '--embed-subs',
                                '--merge-output-format', 'mkv',
                                '-o', outputFile,
                                downloadUrl
                            ]), (error) => {
                                if (error) {
                                    downloaded(false);
                                    return;
                                }

                                fs.access(outputFile, fs.constants.R_OK, (error) => {
                                    if (!error) {
                                        fs.unlink(outputFile + '.torrent', () => {});

                                        let now = Date.now() / 1000;
                                        fs.utimes(outputFile, now, now, (err) => {
                                            // Don't really care if date change fails. Updating just so cron doesn't clean up too early
                                            self.queueShell(shellescape([
                                                'mktorrent',
                                                '-p',
                                                '-t', 1,
                                                '-a', 'udp://127.0.0.1',
                                                '-w', webDestination + properFilename,
                                                '-o', outputFile + '.torrent',
                                                outputFile
                                            ]), (error) => { 
                                                if (error) {
                                                    console.error(error);
                                                    downloaded(false);
                                                    return
                                                }

                                                downloaded(true);
                                            });
                                        });
                                    }
                                });
                            });
                        }
                    }).catch((error) => {
                        console.log(error);
                        downloaded(false);
                    });
                } else {
                    console.error(url + ' ' + res.statusCode);
                    downloaded(false);
                }
            });
        });
    }

    self = {
        getHistory: function(id) {
            let items = historyDb.get('downloaded').filter({'id': id}).value();

            if (items.length > 0) {
                return items[0];
            }
            
            return null;
            
        },
        setHistory: function(id, url, resolution, filename) {
            if (historyDb.get('downloaded').filter({'id': id}).value().length < 1) {
                historyDb.get('downloaded').push({
                    id: id, 
                    url: url, 
                    resolution: resolution, 
                    downloadTime: Date.now() / 1000,
                    filename: filename
                 }).write();
            } else {
                historyDb.get('downloaded').filter({'id': id}).assign({
                    url: url, 
                    resolution: resolution, 
                    downloadTime: Date.now() / 1000,
                    filename: filename
                 }).write();
            }
        },
        youtubeDl: function (id, url, output, quality, resolution) {
            quality = quality || 'WEBRip';
            let filename;

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
                            filename = (output + '.English.' + resolution + '.' + quality).replace('(', '').replace(')', '');
                            downloadVideo(url, filename).then((isDownloaded) => {
                                if (isDownloaded) {
                                    self.setHistory(id, url, resolution, output)
                                }
                            });
                        }
                    }
                );
            } else {
                filename = (output + '.English.' + resolution + '.' + quality).replace('(', '').replace(')', '');
                downloadVideo(url, filename);
            }
        },

        init: function () {
            historyDb.read();
            if (typeof historyDb.get('downloaded').value() === 'undefined') {
                historyDb.set('downloaded', []).write();
            }

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
                                
                                // TODO: Different seasons may have create duplicate slugs. Example show "Great Canadian Baking"
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

        queueShell: genericShellQueue(new Queue(2, Infinity)),

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