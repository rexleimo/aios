package debughub

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sync/atomic"
	"time"
)

var counter atomic.Int64

func nextID() string {
	counter.Add(1)
	return fmt.Sprintf("%x-%x", time.Now().UnixMilli(), counter.Load())
}

type DebugHub struct {
	config Config
	client *http.Client
}

func New(config Config) *DebugHub {
	return &DebugHub{
		config: config,
		client: &http.Client{Timeout: 5 * time.Second},
	}
}

func (d *DebugHub) log(level LogLevel, message string, data map[string]interface{}, err error) {
	entry := LogEntry{
		ID:        nextID(),
		Timestamp: time.Now().UnixMilli(),
		Level:     level,
		Message:   message,
		Source:    LogSource{},
		Trace:     LogTrace{TraceID: nextID(), SpanID: nextID()},
		Data:      data,
		Sdk: SdkMeta{
			Name:    "debug-hub-go",
			Version: "0.1.0",
			Runtime: "go",
		},
		Tags: d.config.Tags,
	}
	if err != nil {
		entry.Error = &LogErrorInfo{
			Name:    "Error",
			Message: err.Error(),
		}
	}
	go d.send(entry)
}

func (d *DebugHub) send(entry LogEntry) {
	body, _ := json.Marshal(entry)
	url := d.config.endpointOrDefault() + "/api/logs/single"
	http.Post(url, "application/json", bytes.NewReader(body))
}

func (d *DebugHub) Debug(message string, data ...map[string]interface{}) {
	d.log(LogDebug, message, firstOr(data), nil)
}

func (d *DebugHub) Info(message string, data ...map[string]interface{}) {
	d.log(LogInfo, message, firstOr(data), nil)
}

func (d *DebugHub) Warn(message string, data ...map[string]interface{}) {
	d.log(LogWarn, message, firstOr(data), nil)
}

func (d *DebugHub) Error(message string, err error, data ...map[string]interface{}) {
	d.log(LogError, message, firstOr(data), err)
}

func (d *DebugHub) Fatal(message string, err error, data ...map[string]interface{}) {
	d.log(LogFatal, message, firstOr(data), err)
}

func (d *DebugHub) StartTrace(message string) *Trace {
	traceID := nextID()
	t := &Trace{
		traceID:   traceID,
		config:    d.config,
		client:    d.client,
		startTime: time.Now(),
	}
	span := t.Span(message)
	span.End()
	return t
}

func firstOr(data []map[string]interface{}) map[string]interface{} {
	if len(data) > 0 {
		return data[0]
	}
	return nil
}
