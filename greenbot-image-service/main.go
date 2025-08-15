// greenbot-image-service/main.go
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

type OpenAIRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	N      int    `json:"n"`
	Size   string `json:"size"`
}

type OpenAIResponse struct {
	Data []struct {
		URL string `json:"url"`
	} `json:"data"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error,omitempty"`
}

func sanitizeSubject(raw string) string {
	// remove non-alnum (keep spaces)
	re := regexp.MustCompile(`[^a-zA-Z0-9\s]+`)
	cleaned := re.ReplaceAllString(raw, "")
	// lower & split
	words := strings.Fields(strings.ToLower(cleaned))
	if len(words) == 0 {
		return "blob" // safe fallback
	}

	// optional: drop some common junk words
	stop := map[string]bool{
		"the": true, "a": true, "an": true, "and": true, "or": true,
		"but": true, "this": true, "that": true, "with": true, "of": true,
		"for": true, "to": true, "in": true, "on": true, "at": true, "it": true,
		"you": true, "your": true, "my": true, "our": true, "is": true, "are": true,
	}
	filtered := make([]string, 0, len(words))
	for _, w := range words {
		if !stop[w] {
			filtered = append(filtered, w)
		}
	}
	if len(filtered) == 0 {
		filtered = words // if we removed everything, fall back to original words
	}

	// keep last 3 tokens to avoid giving DALL·E a novel
	if len(filtered) > 3 {
		filtered = filtered[len(filtered)-3:]
	}
	return strings.Join(filtered, " ")
}

func generateImageHandler(w http.ResponseWriter, r *http.Request) {
	// basic JSON request: { "prompt": "..." }
	var requestBody struct {
		Prompt string `json:"prompt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Bad request body", http.StatusBadRequest)
		return
	}

	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		log.Println("Error: OPENAI_API_KEY not set.")
		http.Error(w, "Server configuration error: API key not set", http.StatusInternalServerError)
		return
	}

	// sanitize & compress user prompt into a drawable subject
	subject := sanitizeSubject(requestBody.Prompt)

	// locked ugly-art prompt
	uglyPrompt := "Extremely ugly, rushed MS Paint scribble on a pure white background. " +
		"Only two flat colors total, random bucket fill shapes, messy angry lines, accidental marks, unrelated doodles. " +
		"Off-center, wrong proportions, unfinished. " +
		"No shading, no gradients, no detail, no texture, no clean lines, no perspective. " +
		"Looks like a frustrated child with no art skill made it in 2 minutes. " +
		"Subject: " + subject

	// allow overriding size via env, else default 1024
	size := os.Getenv("DALLE_SIZE")
	if size == "" {
		size = "1024x1024"
	}

	// allow overriding count via env, else 1 (DALL·E 3 typically returns 1)
	n := 1

	openAIRequest := OpenAIRequest{
		Model:  "dall-e-3",
		Prompt: uglyPrompt,
		N:      n,
		Size:   size,
	}

	requestBytes, err := json.Marshal(openAIRequest)
	if err != nil {
		log.Printf("Marshal error: %v", err)
		http.Error(w, "Failed to serialize request", http.StatusInternalServerError)
		return
	}

	// context & client with timeout
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.openai.com/v1/images/generations", bytes.NewBuffer(requestBytes))
	if err != nil {
		log.Printf("NewRequest error: %v", err)
		http.Error(w, "Failed to build OpenAI request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{
		Timeout: 25 * time.Second,
	}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Error calling OpenAI API: %v", err)
		http.Error(w, "Failed to call OpenAI API", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)

	// Try to parse OpenAI-style error payloads for better logs
	if resp.StatusCode != http.StatusOK {
		var oaiErr OpenAIResponse
		if err := json.Unmarshal(bodyBytes, &oaiErr); err == nil && oaiErr.Error != nil {
			log.Printf("OpenAI API error %d: %s (%s)", resp.StatusCode, oaiErr.Error.Message, oaiErr.Error.Type)
		} else {
			log.Printf("OpenAI API returned non-200 status: %d, body: %s", resp.StatusCode, string(bodyBytes))
		}
		http.Error(w, "OpenAI API failed", http.StatusBadGateway)
		return
	}

	var openAIResponse OpenAIResponse
	if err := json.Unmarshal(bodyBytes, &openAIResponse); err != nil {
		log.Printf("Unmarshal response error: %v, body: %s", err, string(bodyBytes))
		http.Error(w, "Bad response from OpenAI", http.StatusBadGateway)
		return
	}

	if len(openAIResponse.Data) == 0 || openAIResponse.Data[0].URL == "" {
		log.Println("OpenAI API returned no image URL.")
		http.Error(w, "No image URL returned", http.StatusBadGateway)
		return
	}

	// Return { "imageUrls": [ ... ] }
	urls := make([]string, 0, len(openAIResponse.Data))
	for _, d := range openAIResponse.Data {
		if d.URL != "" {
			urls = append(urls, d.URL)
		}
	}
	if len(urls) == 0 {
		http.Error(w, "No image URL returned", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string][]string{"imageUrls": urls})
	log.Printf("Successfully generated and returned %d image(s). Subject=%q", len(urls), subject)
}

func main() {
	http.HandleFunc("/generate", generateImageHandler)
	fmt.Println("greenbot-image-service listening on :8080 …")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
