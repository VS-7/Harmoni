package middleware

import (
	"log/slog"
	"net/http"
	"time"
)

type responseWriterWrapper struct {
	http.ResponseWriter
	statusCode int
	written    int64
}

func (rw *responseWriterWrapper) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *responseWriterWrapper) Write(b []byte) (int, error) {
	n, err := rw.ResponseWriter.Write(b)
	rw.written += int64(n)
	return n, err
}

func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		wrapper := &responseWriterWrapper{
			ResponseWriter: w,
			statusCode:     http.StatusOK,
		}

		next.ServeHTTP(wrapper, r)

		duration := time.Since(start)
		slog.InfoContext(r.Context(), "http_request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", wrapper.statusCode,
			"bytes", wrapper.written,
			"duration_ms", duration.Milliseconds(),
			"remote_addr", r.RemoteAddr,
		)
	})
}
