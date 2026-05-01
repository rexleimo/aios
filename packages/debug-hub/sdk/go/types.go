package debughub

type LogLevel string

const (
	LogDebug LogLevel = "debug"
	LogInfo  LogLevel = "info"
	LogWarn  LogLevel = "warn"
	LogError LogLevel = "error"
	LogFatal LogLevel = "fatal"
)

type LogSource struct {
	File     string `json:"file,omitempty"`
	Line     int    `json:"line,omitempty"`
	Function string `json:"function,omitempty"`
	Module   string `json:"module,omitempty"`
}

type LogTrace struct {
	TraceID      string `json:"traceId"`
	SpanID       string `json:"spanId"`
	ParentSpanID string `json:"parentSpanId,omitempty"`
}

type LogErrorInfo struct {
	Name    string `json:"name"`
	Message string `json:"message"`
	Stack   string `json:"stack,omitempty"`
}

type SdkMeta struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Runtime string `json:"runtime"`
}

type LogEntry struct {
	ID        string                 `json:"id"`
	Timestamp int64                  `json:"timestamp"`
	Level     LogLevel               `json:"level"`
	Message   string                 `json:"message"`
	Source    LogSource              `json:"source"`
	Trace     LogTrace               `json:"trace"`
	Tags      map[string]string      `json:"tags,omitempty"`
	Data      map[string]interface{} `json:"data,omitempty"`
	Error     *LogErrorInfo          `json:"error,omitempty"`
	Sdk       SdkMeta                `json:"sdk"`
}

type Config struct {
	Service  string
	Endpoint string
	Tags     map[string]string
}

func (c *Config) endpointOrDefault() string {
	if c.Endpoint == "" {
		return "http://localhost:39200"
	}
	return c.Endpoint
}
