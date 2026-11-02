package main

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
)

const testContent = "abcdefghijklmnopqrstuvwxyz0123456789"

func indexHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Accessed /")
	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, `<html>
<body>
  <h1>Gargantuan Takeout Rocket 2 Dev Server</h1>
  <p>This is a development and test server for the Gargantuan Takeout Rocket 2 project.</p>

  <h2>Test Links:</h2>
  <ul>
    <li><a href="/setup.html">Cookie Setup Page</a> - Set up cookies for testing</li>
    <li><a href="/download/test.txt">Download Test File</a> - Requires valid cookie to download</li>
    <li><a href="/download-no-cookie/test.txt">Download Test File (No Cookie)</a> - Download without cookie requirement</li>
    <li><a href="/download-gtr2cookie-auth/test.txt">Download Test File (Gtr2Cookie Auth)</a> - Requires 'Authorization: Gtr2Cookie testcookie=valid' header</li>
	</ul>

  <h2>Resources:</h2>
  <ul>
    <li><a href="https://github.com/nelsonjchen/gtr-2-dev-server" target="_blank">GitHub Repository</a></li>
  </ul>
</body>
</html>`)
}

func setupHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Accessed /setup.html")
	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, `<html>
<body>
  <h1>Cookie Setup</h1>
  <p><a href="/">Home</a></p>
    <p><a href="/download/test.txt">Download Test File (Requires Cookie)</a></p>

  <button onclick="setCookie()">Set Cookie</button>
  <button onclick="clearCookie()">Clear Cookie</button>
  <script>
    function setCookie() {
      document.cookie = "testcookie=valid; path=/";
      alert("Cookie set!");
    }
    function clearCookie() {
      document.cookie = "testcookie=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      alert("Cookie cleared!");
    }
  </script>
</body>
</html>`)
}

// serveTestFile handles the common logic for serving the test file with support for range requests
func serveTestFile(w http.ResponseWriter, r *http.Request, logPrefix string) {
	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Content-Disposition", "attachment; filename=test.txt")
	w.Header().Set("Accept-Ranges", "bytes")

	fileSize := int64(len(testData))
	rangeHeader := r.Header.Get("Range")

	if rangeHeader == "" {
		log.Printf("%s: Serving full test.txt content", logPrefix)
		w.Header().Set("Content-Length", fmt.Sprint(fileSize))
		fmt.Fprint(w, testData)
		return
	}

	// Parse range header
	rangeParts := strings.Split(rangeHeader, "=")
	if len(rangeParts) != 2 || rangeParts[0] != "bytes" {
		http.Error(w, "Invalid Range header", http.StatusBadRequest)
		return
	}

	rangeSpec := strings.Split(rangeParts[1], "-")
	if len(rangeSpec) != 2 {
		http.Error(w, "Invalid Range header", http.StatusBadRequest)
		return
	}

	var start, end int64

	if rangeSpec[0] == "" && rangeSpec[1] != "" {
		// Suffix range: -N means the last N bytes
		suffixLength, err := strconv.ParseInt(rangeSpec[1], 10, 64)
		if err != nil {
			http.Error(w, "Invalid Range header", http.StatusBadRequest)
			return
		}
		start = fileSize - suffixLength
		end = fileSize - 1
	} else if rangeSpec[0] != "" {
		// Normal range: N- or N-M
		var err error
		start, err = strconv.ParseInt(rangeSpec[0], 10, 64)
		if err != nil {
			http.Error(w, "Invalid Range header", http.StatusBadRequest)
			return
		}

		if rangeSpec[1] == "" {
			end = fileSize - 1
		} else {
			end, err = strconv.ParseInt(rangeSpec[1], 10, 64)
			if err != nil || end >= fileSize {
				end = fileSize - 1
			}
		}
	}

	if start < 0 {
		start = 0
	}

	if start > end || start >= fileSize {
		http.Error(w, "Invalid Range header", http.StatusBadRequest)
		return
	}

	contentLength := end - start + 1
	w.Header().Set("Content-Length", fmt.Sprint(contentLength))
	w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, fileSize))
	w.WriteHeader(http.StatusPartialContent)

	log.Printf("%s: Serving partial content: bytes %d-%d/%d", logPrefix, start, end, fileSize)
	fmt.Fprint(w, testData[start:end+1])
}

func downloadHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Accessed /download/test.txt")
	cookie, err := r.Cookie("testcookie")
	if err != nil || cookie.Value != "valid" {
		log.Println("Redirecting due to missing/invalid cookie")
		http.Redirect(w, r, "/setup.html", http.StatusFound)
		return
	}

	serveTestFile(w, r, "Cookie-protected endpoint")
}

func downloadNoCookieHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Accessed /download-no-cookie/test.txt")
	serveTestFile(w, r, "No-cookie endpoint")
}

func downloadGtr2CookieAuthHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Accessed /download-gtr2cookie-auth/test.txt")
	authHeader := r.Header.Get("Authorization")

	if authHeader == "" {
		log.Println("Missing Authorization header")
		http.Error(w, "Authorization header required", http.StatusUnauthorized)
		return
	}

	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || parts[0] != "Gtr2Cookie" {
		log.Printf("Invalid Authorization header scheme: %s", authHeader)
		http.Error(w, "Invalid Authorization scheme. Expected 'Gtr2Cookie'", http.StatusUnauthorized)
		return
	}

	// Parse the data part like a cookie header
	cookieData := parts[1]
	foundCookie := false
	pairs := strings.Split(cookieData, ";")
	for _, pair := range pairs {
		pair = strings.TrimSpace(pair)
		kv := strings.SplitN(pair, "=", 2)
		if len(kv) == 2 && kv[0] == "testcookie" && kv[1] == "valid" {
			foundCookie = true
			break
		}
	}

	if !foundCookie {
		log.Printf("Required 'testcookie=valid' not found in Authorization data: %s", cookieData)
		http.Error(w, "Invalid Authorization data. Expected 'testcookie=valid' within data part.", http.StatusUnauthorized)
		return
	}

	log.Println("Authorization successful")
	serveTestFile(w, r, "Gtr2Cookie-protected endpoint")
}


func setupHandlers() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/", indexHandler)
	mux.HandleFunc("/setup.html", setupHandler)
	mux.HandleFunc("/download/test.txt", downloadHandler)
	mux.HandleFunc("/download-no-cookie/test.txt", downloadNoCookieHandler)
	mux.HandleFunc("/download-gtr2cookie-auth/test.txt", downloadGtr2CookieAuthHandler)

	return mux
}

var testData string

func main() {
	// Generate test content
	var sb strings.Builder
	for i := 0; i < 1000; i++ {
		sb.WriteString(testContent)
	}
	testData = sb.String()

	mux := setupHandlers()

	log.Println("Starting server on :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}
