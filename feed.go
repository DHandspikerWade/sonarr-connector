package main

import (
	"fmt"
	"os"
	"strings"
	"net/http"
	"net/url"
	"io/ioutil"
	"log"
	"time"
	"path/filepath"
)

func main() {
    http.HandleFunc("/create_feed.php", func(w http.ResponseWriter, r *http.Request) {
		var headers = w.Header()
		// headers.Set("Content-Type", "text/html; charset=utf-8")
		headers.Set("Content-Type", "application/rss+xml; charset=utf-8")
		headers.Set("Content-Disposition", "inline; filename=\"nhk.xml\"")

		var output string = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n"
		output += `
<rss version="2.0">
<channel>
<title>NHK Record</title>
<ttl>11600</ttl>
<description></description>
`
		var havePub = false
		var directory = "./"
		files, err := ioutil.ReadDir(directory)
		if err != nil {
			log.Fatal(err)
		}

		for _, file := range files {
			var filename = file.Name()
			if filepath.Ext(filename) == ".torrent" {
				var size int64 = 1 // Default to 1 as Sonarr considers 0 an error state for the whole feed

				possibleFile := strings.TrimSuffix(filename, ".torrent")
				mediaStat, err := os.Stat(directory + possibleFile)
				if err == nil {
					size = mediaStat.Size()
				}

				output += "<item>\n" 
				output += fmt.Sprintf("\t<title><![CDATA[%s]]></title>\n", possibleFile)
				output += fmt.Sprintf("\t<size>%d</size>\n", size) 
				// output += fmt.Sprintf("\t<contentlength>%d</>\n", size) 
				output += fmt.Sprintf("\t<guid isPermaLink=\"false\">%s-%d</guid>\n", url.PathEscape(filename), file.ModTime().Unix())
				output += fmt.Sprintf("\t<link><![CDATA[https://%s/sonarr/%s]]></link>\n", r.Host, url.PathEscape(filename))
				output += fmt.Sprintf("\t<enclosure url=\"https://%s/sonarr/%s\" type=\"application/x-bittorrent\" />\n", r.Host, url.PathEscape(filename))
				output += fmt.Sprintf("\t<pubDate>%s</pubDate>\n", file.ModTime().Format(time.RFC1123Z))
				output += "</item>\n"

				if !havePub {
					output += fmt.Sprintf("<pubDate>%s</pubDate>\n", file.ModTime().Format(time.RFC1123Z))
					havePub = true
				}
			}
		}

		if !havePub {
			// No items; add placeholder as sonarr doesn't like empty feeds
			output += "<item>\n" 
			output += "\t<title>NO RESULTS</title>\n"
			output += "\t<size>1</size>\n"
			output += "\t<guid isPermaLink=\"false\">PLACEHOLDER</guid>\n"
			output += fmt.Sprintf("\t<link>https://%s/sonarr/%s</link>\n", r.Host, "404.torrent")
			output += fmt.Sprintf("\t<pubDate>%s</pubDate>\n", time.Now().Format(time.RFC1123))
			output += "</item>\n"

			// <title> WillisEarlBeal-BitTorrent </title>
            //             <description>
            //                     The Principles of a Protagonist Bundle

            //                     Chicago native Willis Earl Beal came from humble musical beginnings- he
            //                     began as a street performer of sorts that was prone to leaving homemade
            //                     novels, artwork and CD-Rs across America to promote his work, suggesting
            //                     a desire to be heard. Thereafter, he relocated to Albuquerque, NM where
            //                     he continued his practice of 'gifting' as he simultaneously recorded a
            //                     set of songs on a discarded karaoke machine that would become Acousmatic
            //                     Sorcery, his Hot Charity/XL Recordings debut.
            //             </description>
            //             <guid> e380a6c5ae0fb15f296d29964a56250780b05ad7 </guid>
            //             <enclosure
            //                     url="http://featuredcontent.utorrent.com/torrents/WillisEarlBeal-BitTorrent.torrent"
            //                     type="application/x-bittorrent" />

			output += fmt.Sprintf("<pubdate>%s</pubdate>", time.Now().Format(time.RFC1123))
			havePub = true
		}

		output += `
</channel>
</rss>
`
		fmt.Fprint(w, output)
	})
	
	log.Println("Listening on :5000")
    log.Fatal(http.ListenAndServe(":5000", nil))
}
