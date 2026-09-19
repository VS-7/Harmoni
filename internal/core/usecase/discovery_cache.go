package usecase

import (
	"container/list"
	"sync"
	"time"
)

// ttlCache is a small LRU with per-entry expiry. It caps both the number of entries and
// their age so remote lookups stay cheap without pushing the process past the 35 MB
// budget (RF7.4, RNF5). Values are stored as any and asserted by the caller.
type ttlCache struct {
	mu       sync.Mutex
	maxItems int
	ttl      time.Duration
	entries  map[string]*list.Element
	order    *list.List // front = most recently used
	now      func() time.Time
}

type cacheEntry struct {
	key       string
	value     any
	expiresAt time.Time
}

func newTTLCache(maxItems int, ttl time.Duration) *ttlCache {
	if maxItems <= 0 {
		maxItems = 1
	}
	return &ttlCache{
		maxItems: maxItems,
		ttl:      ttl,
		entries:  make(map[string]*list.Element, maxItems),
		order:    list.New(),
		now:      time.Now,
	}
}

func (c *ttlCache) Get(key string) (any, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	element, ok := c.entries[key]
	if !ok {
		return nil, false
	}
	entry := element.Value.(*cacheEntry)
	if c.now().After(entry.expiresAt) {
		c.removeElement(element)
		return nil, false
	}
	c.order.MoveToFront(element)
	return entry.value, true
}

func (c *ttlCache) Put(key string, value any) {
	c.mu.Lock()
	defer c.mu.Unlock()

	expiresAt := c.now().Add(c.ttl)
	if element, ok := c.entries[key]; ok {
		entry := element.Value.(*cacheEntry)
		entry.value = value
		entry.expiresAt = expiresAt
		c.order.MoveToFront(element)
		return
	}

	element := c.order.PushFront(&cacheEntry{key: key, value: value, expiresAt: expiresAt})
	c.entries[key] = element

	for c.order.Len() > c.maxItems {
		c.removeElement(c.order.Back())
	}
}

// removeElement must be called with the mutex held.
func (c *ttlCache) removeElement(element *list.Element) {
	if element == nil {
		return
	}
	c.order.Remove(element)
	delete(c.entries, element.Value.(*cacheEntry).key)
}

func (c *ttlCache) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.order.Len()
}
