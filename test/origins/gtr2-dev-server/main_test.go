package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func init() {
	// Generate test content
	var sb strings.Builder
	for i := 0; i < 1000; i++ {
		sb.WriteString(testContent)
	}
	testData = sb.String()
}

func TestSetupHandler(t *testing.T) {
	req := httptest.NewRequest("GET", "/setup.html", nil)
	w := httptest.NewRecorder()

	mux := setupHandlers()
	mux.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType != "text/html" {
		t.Errorf("Expected content type text/html, got %s", contentType)
	}

	body := w.Body.String()
	if !strings.Contains(body, "Cookie Setup") {
		t.Error("Expected HTML to contain 'Cookie Setup'")
	}
}

func TestDownloadHandler_NoCookie(t *testing.T) {
	req := httptest.NewRequest("GET", "/download/test.txt", nil)
	w := httptest.NewRecorder()

	mux := setupHandlers()
	mux.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusFound {
		t.Errorf("Expected redirect status 302, got %d", resp.StatusCode)
	}

	location := resp.Header.Get("Location")
	if location != "/setup.html" {
		t.Errorf("Expected redirect to /setup.html, got %s", location)
	}
}

func TestDownloadHandler_FullDownload(t *testing.T) {
	req := httptest.NewRequest("GET", "/download/test.txt", nil)
	req.AddCookie(&http.Cookie{Name: "testcookie", Value: "valid"})
	w := httptest.NewRecorder()

	mux := setupHandlers()
	mux.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	contentLength := resp.Header.Get("Content-Length")
	if contentLength == "" {
		t.Error("Expected Content-Length header")
	}

	contentDisposition := resp.Header.Get("Content-Disposition")
	if contentDisposition != "attachment; filename=test.txt" {
		t.Errorf("Expected Content-Disposition header, got %s", contentDisposition)
	}

	body := w.Body.String()
	if len(body) != len(testContent)*1000 {
		t.Errorf("Expected full content length %d, got %d", len(testContent)*1000, len(body))
	}
}

func TestDownloadHandler_RangeRequests(t *testing.T) {
	tests := []struct {
		name        string
		rangeHeader string
		start       int
		end         int
		status      int
	}{
		{"Valid single range", "bytes=0-99", 0, 99, http.StatusPartialContent},
		{"Valid open-ended range", "bytes=100-", 100, len(testContent)*1000 - 1, http.StatusPartialContent},
		{"Valid suffix range", "bytes=-100", len(testContent)*1000 - 100, len(testContent)*1000 - 1, http.StatusPartialContent},
		{"Invalid range (start > end)", "bytes=100-50", 0, 0, http.StatusBadRequest},
		{"Invalid range (negative start)", "bytes=-100-200", 0, 0, http.StatusBadRequest},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/download/test.txt", nil)
			req.Header.Set("Range", tt.rangeHeader)
			req.AddCookie(&http.Cookie{Name: "testcookie", Value: "valid"})
			w := httptest.NewRecorder()

			mux := setupHandlers()
			mux.ServeHTTP(w, req)

			resp := w.Result()
			if resp.StatusCode != tt.status {
				t.Errorf("Expected status %d, got %d", tt.status, resp.StatusCode)
			}

			if tt.status == http.StatusPartialContent {
				contentRange := resp.Header.Get("Content-Range")
				expectedRange := fmt.Sprintf("bytes %d-%d/%d", tt.start, tt.end, len(testContent)*1000)
				if contentRange != expectedRange {
					t.Errorf("Expected Content-Range %s, got %s", expectedRange, contentRange)
				}

				body := w.Body.String()
				if len(body) != tt.end-tt.start+1 {
					t.Errorf("Expected content length %d, got %d", tt.end-tt.start+1, len(body))
				}
			}
		})
	}
}

func TestDownloadNoCookieHandler_FullDownload(t *testing.T) {
	req := httptest.NewRequest("GET", "/download-no-cookie/test.txt", nil)
	w := httptest.NewRecorder()

	mux := setupHandlers()
	mux.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	contentLength := resp.Header.Get("Content-Length")
	if contentLength == "" {
		t.Error("Expected Content-Length header")
	}

	contentDisposition := resp.Header.Get("Content-Disposition")
	if contentDisposition != "attachment; filename=test.txt" {
		t.Errorf("Expected Content-Disposition header, got %s", contentDisposition)
	}

	body := w.Body.String()
	if len(body) != len(testData) {
		t.Errorf("Expected full content length %d, got %d", len(testData), len(body))
	}
}

func TestDownloadGtr2CookieAuthHandler(t *testing.T) {
	tests := []struct {
		name           string
		authHeader     string
		rangeHeader    string
		expectedStatus int
		expectedBody   string // Only for error cases
		expectedRange  string // Only for partial content
		expectedLength int    // Only for success cases
	}{
		{
			name:           "No Auth Header",
			authHeader:     "",
			expectedStatus: http.StatusUnauthorized,
			expectedBody:   "Authorization header required\n",
		},
		{
			name:           "Invalid Auth Scheme",
			authHeader:     "Bearer token",
			expectedStatus: http.StatusUnauthorized,
			expectedBody:   "Invalid Authorization scheme. Expected 'Gtr2Cookie'\n",
		},
		{
			name:           "Invalid Auth Data - Wrong Value",
			authHeader:     "Gtr2Cookie testcookie=invalid",
			expectedStatus: http.StatusUnauthorized,
			expectedBody:   "Invalid Authorization data. Expected 'testcookie=valid' within data part.\n",
		},
		{
			name:           "Invalid Auth Data - Missing Value",
			authHeader:     "Gtr2Cookie testcookie=",
			expectedStatus: http.StatusUnauthorized,
			expectedBody:   "Invalid Authorization data. Expected 'testcookie=valid' within data part.\n",
		},
		{
			name:           "Invalid Auth Data - Other Cookie Present",
			authHeader:     "Gtr2Cookie other=value; testcookie=nope",
			expectedStatus: http.StatusUnauthorized,
			expectedBody:   "Invalid Authorization data. Expected 'testcookie=valid' within data part.\n",
		},
		{
			name:           "Valid Auth - Full Download - Simple",
			authHeader:     "Gtr2Cookie testcookie=valid",
			expectedStatus: http.StatusOK,
			expectedLength: len(testData),
		},
		{
			name:           "Valid Auth - Full Download - With Other Data Start",
			authHeader:     "Gtr2Cookie testcookie=valid; other=data",
			expectedStatus: http.StatusOK,
			expectedLength: len(testData),
		},
		{
			name:           "Valid Auth - Full Download - With Other Data Middle",
			authHeader:     "Gtr2Cookie another=value; testcookie=valid; more=stuff",
			expectedStatus: http.StatusOK,
			expectedLength: len(testData),
		},
		{
			name:           "Valid Auth - Full Download - With Other Data End",
			authHeader:     "Gtr2Cookie last=one; testcookie=valid",
			expectedStatus: http.StatusOK,
			expectedLength: len(testData),
		},
		{
			name:           "Valid Auth - Full Download - With Spaces",
			authHeader:     "Gtr2Cookie  testcookie=valid ; ",
			expectedStatus: http.StatusOK,
			expectedLength: len(testData),
		},
		{
			name:           "Valid Auth - Range Download",
			authHeader:     "Gtr2Cookie other=data; testcookie=valid",
			rangeHeader:    "bytes=10-19",
			expectedStatus: http.StatusPartialContent,
			expectedRange:  fmt.Sprintf("bytes 10-19/%d", len(testData)),
			expectedLength: 10,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/download-gtr2cookie-auth/test.txt", nil)
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}
			if tt.rangeHeader != "" {
				req.Header.Set("Range", tt.rangeHeader)
			}
			w := httptest.NewRecorder()

			mux := setupHandlers()
			mux.ServeHTTP(w, req)

			resp := w.Result()
			if resp.StatusCode != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, resp.StatusCode)
			}

			body := w.Body.String()

			if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusPartialContent {
				contentDisposition := resp.Header.Get("Content-Disposition")
				if contentDisposition != "attachment; filename=test.txt" {
					t.Errorf("Expected Content-Disposition header, got %s", contentDisposition)
				}
				if len(body) != tt.expectedLength {
					t.Errorf("Expected body length %d, got %d", tt.expectedLength, len(body))
				}
				if tt.expectedRange != "" {
					contentRange := resp.Header.Get("Content-Range")
					if contentRange != tt.expectedRange {
						t.Errorf("Expected Content-Range '%s', got '%s'", tt.expectedRange, contentRange)
					}
				}
			} else {
				if body != tt.expectedBody {
					t.Errorf("Expected error body '%s', got '%s'", tt.expectedBody, body)
				}
			}
		})
	}
}
