package usecase

import (
	"context"
	"log/slog"
	"sync"

	"harmoni/internal/core/ports"
)

// jobEventBuffer is the per-subscriber backlog. A browser that stops reading is dropped
// silently instead of blocking the worker, so a stalled SSE connection never slows a download.
const jobEventBuffer = 16

// JobEventBroker fans download queue changes out to every open SSE connection (RF8.5).
// It holds only channels, which keeps the memory cost of the stream negligible (RNF5).
type JobEventBroker struct {
	mu          sync.RWMutex
	subscribers map[chan ports.JobEvent]struct{}
}

func NewJobEventBroker() *JobEventBroker {
	return &JobEventBroker{subscribers: make(map[chan ports.JobEvent]struct{})}
}

// SubscribeJobEvents returns a stream and the function that must be deferred to close it.
func (b *JobEventBroker) SubscribeJobEvents() (<-chan ports.JobEvent, func()) {
	ch := make(chan ports.JobEvent, jobEventBuffer)

	b.mu.Lock()
	b.subscribers[ch] = struct{}{}
	b.mu.Unlock()

	var once sync.Once
	unsubscribe := func() {
		once.Do(func() {
			b.mu.Lock()
			delete(b.subscribers, ch)
			b.mu.Unlock()
			close(ch)
		})
	}
	return ch, unsubscribe
}

// PublishJobEvent never blocks: a subscriber whose buffer is full misses the event and
// catches up on the next one, since every event carries the full job state.
func (b *JobEventBroker) PublishJobEvent(ctx context.Context, event ports.JobEvent) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	for ch := range b.subscribers {
		select {
		case ch <- event:
		default:
			slog.DebugContext(ctx, "assinante de eventos lento, evento descartado", "job_id", event.JobID, "type", event.Type)
		}
	}
}

// Subscribers reports the number of open streams, used by tests and diagnostics.
func (b *JobEventBroker) Subscribers() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.subscribers)
}
