package debughub

import (
	"bytes"
	"encoding/json"
	"net/http"
	"time"
)

type Span struct {
	spanID       string
	traceID      string
	parentSpanID string
	config       Config
	client       *http.Client
	entries      []LogEntry
	ended        bool
}

func (s *Span) log(level LogLevel, message string, data map[string]interface{}, err error) {
	if s.ended {
		return
	}
	entry := LogEntry{
		ID:        nextID(),
		Timestamp: time.Now().UnixMilli(),
		Level:     level,
		Message:   message,
		Source:    LogSource{},
		Trace: LogTrace{
			TraceID:      s.traceID,
			SpanID:       s.spanID,
			ParentSpanID: s.parentSpanID,
		},
		Data: data,
		Sdk: SdkMeta{
			Name:    "debug-hub-go",
			Version: "0.1.0",
			Runtime: "go",
		},
		Tags: s.config.Tags,
	}
	if err != nil {
		entry.Error = &LogErrorInfo{
			Name:    "Error",
			Message: err.Error(),
		}
	}
	s.entries = append(s.entries, entry)
	go func() {
		body, _ := json.Marshal(entry)
		url := s.config.endpointOrDefault() + "/api/logs/single"
		http.Post(url, "application/json", bytes.NewReader(body))
	}()
}

func (s *Span) Debug(message string, data ...map[string]interface{}) {
	s.log(LogDebug, message, firstOr(data), nil)
}

func (s *Span) Info(message string, data ...map[string]interface{}) {
	s.log(LogInfo, message, firstOr(data), nil)
}

func (s *Span) Warn(message string, data ...map[string]interface{}) {
	s.log(LogWarn, message, firstOr(data), nil)
}

func (s *Span) Error(message string, err error, data ...map[string]interface{}) {
	s.log(LogError, message, firstOr(data), err)
}

func (s *Span) Fatal(message string, err error, data ...map[string]interface{}) {
	s.log(LogFatal, message, firstOr(data), err)
}

func (s *Span) Span(message string) *Span {
	return &Span{
		spanID:       nextID(),
		traceID:      s.traceID,
		parentSpanID: s.spanID,
		config:       s.config,
		client:       s.client,
	}
}

func (s *Span) End() {
	s.ended = true
}

type Trace struct {
	traceID   string
	config    Config
	client    *http.Client
	startTime time.Time
}

func (t *Trace) Span(message string) *Span {
	return &Span{
		spanID:       nextID(),
		traceID:      t.traceID,
		parentSpanID: t.traceID,
		config:       t.config,
		client:       t.client,
	}
}

func (t *Trace) End() {
	// Trace end is a no-op; spans track their own lifecycle
}
