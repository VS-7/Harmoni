package middleware

import (
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
)

func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				slog.ErrorContext(r.Context(), "panic_recovered",
					"err", fmt.Sprintf("%v", err),
					"stack", string(debug.Stack()),
					"path", r.URL.Path,
				)
				http.Error(w, `{"error": "erro interno no servidor"}`, http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
