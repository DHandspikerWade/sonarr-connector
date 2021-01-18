const argv = require('minimist')(process.argv.slice(2));
const https = require('https');
const Helpers = require('./helpers')(argv, 'nhk');

const NHK_HOST = 'https://www3.nhk.or.jp';
const programSlug = argv.slug;

function handleVideoData(data) {
    if (data.program_slag === programSlug || data.pgm_gr_id === programSlug) {
        Helpers.getFileName(data.sub_title_clean || data.subtitle).then((newfile) => {
            if (newfile) {
                Helpers.youtubeDl(NHK_HOST + (data.vod_url || data.url), newfile);
            }
        });
    }
}

function parseApiData(json) {
    if (json.data && json.data.episodes && json.data.episodes.length) {
        let i;
        for (i = 0; i < json.data.episodes.length; i++) {
            handleVideoData(json.data.episodes[i]);
        }
    }
}


console.log('starting');
Helpers.prepareScript();

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