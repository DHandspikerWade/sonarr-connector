package main

import (
    "fmt"
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
				output += "<item>\n" 
				output += fmt.Sprintf("\t<title>%s</title>\n", filename)
				output += fmt.Sprintf("\t<size>%d</size>\n", 0) // Need the actual file size not hte torrent file
				output += fmt.Sprintf("\t<guid isPermaLink=\"false\">%s-%d</guid>\n", filename, file.ModTime().Unix())
				output += fmt.Sprintf("\t<link>https://%s/sonarr/%s</link>\n", r.Host, url.PathEscape(filename))
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
