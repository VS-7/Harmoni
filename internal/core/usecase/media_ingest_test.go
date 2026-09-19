package usecase_test

import (
	"context"
	"errors"
	"testing"

	"harmoni/internal/core/domain/discovery"
	"harmoni/internal/core/domain/ingest"
	"harmoni/internal/core/ports"
	"harmoni/internal/core/usecase"
)

type mockDownloadJobRepository struct {
	jobs       map[string]*ingest.DownloadJob
	bySource   map[string]string
	deleted    []string
	failDelete error
}

func newMockJobRepo() *mockDownloadJobRepository {
	return &mockDownloadJobRepository{
		jobs:     make(map[string]*ingest.DownloadJob),
		bySource: make(map[string]string),
	}
}

func (m *mockDownloadJobRepository) Save(ctx context.Context, job *ingest.DownloadJob) error {
	copied := *job
	m.jobs[job.ID] = &copied
	return nil
}

func (m *mockDownloadJobRepository) FindByID(ctx context.Context, id string) (*ingest.DownloadJob, error) {
	if j, ok := m.jobs[id]; ok {
		copied := *j
		return &copied, nil
	}
	return nil, ingest.ErrJobNotFound
}

func (m *mockDownloadJobRepository) Update(ctx context.Context, job *ingest.DownloadJob) error {
	return m.Save(ctx, job)
}

func (m *mockDownloadJobRepository) ListRecent(ctx context.Context, limit int) ([]ingest.DownloadJob, error) {
	var list []ingest.DownloadJob
	for _, j := range m.jobs {
		list = append(list, *j)
	}
	return list, nil
}

func (m *mockDownloadJobRepository) Delete(ctx context.Context, id string) error {
	if m.failDelete != nil {
		return m.failDelete
	}
	if _, ok := m.jobs[id]; !ok {
		return ingest.ErrJobNotFound
	}
	delete(m.jobs, id)
	m.deleted = append(m.deleted, id)
	return nil
}

func (m *mockDownloadJobRepository) FindPlaylistIDBySource(ctx context.Context, provider, sourceID string) (string, error) {
	return m.bySource[provider+":"+sourceID], nil
}

type mockJobItemRepository struct {
	items map[string][]ingest.JobItem
}

func newMockItemRepo() *mockJobItemRepository {
	return &mockJobItemRepository{items: make(map[string][]ingest.JobItem)}
}

func (m *mockJobItemRepository) SaveAll(ctx context.Context, items []ingest.JobItem) error {
	for _, item := range items {
		m.items[item.JobID] = append(m.items[item.JobID], item)
	}
	return nil
}

func (m *mockJobItemRepository) Update(ctx context.Context, item *ingest.JobItem) error {
	list := m.items[item.JobID]
	for i := range list {
		if list[i].ID == item.ID {
			list[i] = *item
			return nil
		}
	}
	return errors.New("item não encontrado")
}

func (m *mockJobItemRepository) ListByJob(ctx context.Context, jobID string) ([]ingest.JobItem, error) {
	out := make([]ingest.JobItem, len(m.items[jobID]))
	copy(out, m.items[jobID])
	return out, nil
}

func (m *mockJobItemRepository) ProgressByJobs(ctx context.Context, jobIDs []string) (map[string]ingest.JobProgress, error) {
	progress := make(map[string]ingest.JobProgress, len(jobIDs))
	for _, id := range jobIDs {
		progress[id] = ingest.NewJobProgress(m.items[id])
	}
	return progress, nil
}

// mockDiscovery answers the metadata lookups the ingest flow makes.
type mockDiscovery struct {
	track    *discovery.RemoteItem
	playlist *discovery.RemotePlaylist
	err      error
}

func (m *mockDiscovery) Search(ctx context.Context, q, kind string, limit int) ([]discovery.RemoteItem, error) {
	return nil, nil
}

func (m *mockDiscovery) GetTrack(ctx context.Context, videoID string) (*discovery.RemoteItem, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.track, nil
}

func (m *mockDiscovery) GetPlaylist(ctx context.Context, playlistID string) (*discovery.RemotePlaylist, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.playlist, nil
}

func (m *mockDiscovery) GetArtist(ctx context.Context, channelID string) (*discovery.RemoteArtist, error) {
	return nil, discovery.ErrRemoteNotFound
}

type recordingPublisher struct {
	events []ports.JobEvent
}

func (r *recordingPublisher) PublishJobEvent(ctx context.Context, event ports.JobEvent) {
	r.events = append(r.events, event)
}

func newService(t *testing.T, disc ports.DiscoveryUseCase) (*usecase.IngestService, *mockDownloadJobRepository, *mockJobItemRepository, chan string, *recordingPublisher) {
	t.Helper()
	jobRepo := newMockJobRepo()
	itemRepo := newMockItemRepo()
	queue := make(chan string, 10)
	events := &recordingPublisher{}
	return usecase.NewIngestService(jobRepo, itemRepo, disc, events, queue), jobRepo, itemRepo, queue, events
}

func TestSubmitDownloadAndQueuing(t *testing.T) {
	ctx := context.Background()
	disc := &mockDiscovery{track: &discovery.RemoteItem{ID: "dQw4w9WgXcQ", Title: "Never Gonna Give You Up (Official Video)", ThumbnailURL: "https://img/1.jpg"}}
	svc, _, itemRepo, queue, events := newService(t, disc)

	job, err := svc.SubmitDownload(ctx, "https://www.youtube.com/watch?v=dQw4w9WgXcQ", ingest.ModeDefault)
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}

	if job.Status != ingest.StatusQueued || job.Kind != ingest.KindTrack {
		t.Errorf("job inesperado: %+v", job)
	}
	if job.Title != "Never Gonna Give You Up" || job.ThumbnailURL == "" {
		t.Errorf("prévia não preenchida: título=%q capa=%q", job.Title, job.ThumbnailURL)
	}

	select {
	case id := <-queue:
		if id != job.ID {
			t.Errorf("esperava o job %s na fila, veio %s", job.ID, id)
		}
	default:
		t.Error("job não foi enfileirado no canal")
	}

	// Even a single track is expanded, so progress and retry work the same way.
	items, _ := itemRepo.ListByJob(ctx, job.ID)
	if len(items) != 1 || items[0].SourceID != "dQw4w9WgXcQ" {
		t.Errorf("expansão inesperada: %+v", items)
	}
	if len(events.events) == 0 {
		t.Error("nenhum evento publicado no envio")
	}
}

// The link from P1 must be accepted and expanded into the whole playlist.
func TestSubmitPlaylistLinkFromPRD(t *testing.T) {
	ctx := context.Background()
	disc := &mockDiscovery{playlist: &discovery.RemotePlaylist{
		ID:        "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6",
		Title:     "Rock Nacional",
		ItemCount: 2,
		Tracks: []discovery.RemoteItem{
			{ID: "lBDDMrUCz1A", Title: "Tempo Perdido"},
			{ID: "aBcDeFgHiJk", Title: "Eduardo e Mônica"},
		},
	}}
	svc, _, itemRepo, _, _ := newService(t, disc)

	job, err := svc.SubmitDownload(ctx,
		"https://www.youtube.com/watch?v=lBDDMrUCz1A&list=PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6", ingest.ModeDefault)
	if err != nil {
		t.Fatalf("o link da playlist deveria ser aceito: %v", err)
	}
	if job.Kind != ingest.KindPlaylist || job.SourceID != "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6" {
		t.Fatalf("link ambíguo deveria virar playlist: %+v", job)
	}

	items, _ := itemRepo.ListByJob(ctx, job.ID)
	if len(items) != 2 || items[0].Position != 0 || items[1].Position != 1 {
		t.Fatalf("playlist deveria virar 2 itens ordenados: %+v", items)
	}

	views, err := svc.ListJobs(ctx, 10)
	if err != nil || len(views) != 1 {
		t.Fatalf("listagem inesperada: %v / %+v", err, views)
	}
	if views[0].Progress.Total != 2 || views[0].Progress.Done != 0 {
		t.Errorf("progresso inicial inesperado: %+v", views[0].Progress)
	}
}

func TestSubmitFromSourceAndBatch(t *testing.T) {
	ctx := context.Background()
	svc, _, _, queue, _ := newService(t, &mockDiscovery{})

	if _, err := svc.SubmitFromSource(ctx, "youtube", "track", "lBDDMrUCz1A"); err != nil {
		t.Fatalf("fonte válida deveria ser aceita: %v", err)
	}
	if _, err := svc.SubmitFromSource(ctx, "soundcloud", "track", "lBDDMrUCz1A"); !errors.Is(err, ingest.ErrInvalidProvider) {
		t.Errorf("provedor não suportado deveria falhar, veio: %v", err)
	}
	if _, err := svc.SubmitFromSource(ctx, "youtube", "track", "id-curto"); !errors.Is(err, ingest.ErrInvalidSourceID) {
		t.Errorf("id inválido deveria falhar, veio: %v", err)
	}

	// One invalid entry must not discard the valid ones.
	jobs, err := svc.SubmitBatch(ctx, []ports.SourceInput{
		{Provider: "youtube", Kind: "track", ID: "aBcDeFgHiJk"},
		{Provider: "youtube", Kind: "track", ID: "invalido"},
		{Provider: "youtube", Kind: "track", ID: "zYxWvUtSrQp"},
	})
	if err != nil {
		t.Fatalf("lote parcialmente válido não deveria falhar: %v", err)
	}
	if len(jobs) != 2 {
		t.Errorf("esperava 2 jobs aceitos, veio %d", len(jobs))
	}

	if _, err := svc.SubmitBatch(ctx, nil); !errors.Is(err, ingest.ErrEmptyBatch) {
		t.Errorf("lote vazio deveria falhar, veio: %v", err)
	}

	drain(queue)
}

func TestInspectAmbiguousLink(t *testing.T) {
	ctx := context.Background()
	disc := &mockDiscovery{
		track:    &discovery.RemoteItem{ID: "lBDDMrUCz1A", Title: "Tempo Perdido (Official Video)", Artist: "Legião Urbana"},
		playlist: &discovery.RemotePlaylist{ID: "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6", Title: "Rock Nacional", ItemCount: 12},
	}
	svc, _, _, _, _ := newService(t, disc)

	inspection, err := svc.Inspect(ctx, "https://www.youtube.com/watch?v=lBDDMrUCz1A&list=PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6")
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if !inspection.Ambiguous || inspection.ItemCount != 12 {
		t.Errorf("link ambíguo deveria perguntar e trazer a contagem: %+v", inspection)
	}
	if inspection.Title != "Tempo Perdido" {
		t.Errorf("título não higienizado: %q", inspection.Title)
	}

	// A mix is not ambiguous: it defaults to the single track.
	mix, err := svc.Inspect(ctx, "https://www.youtube.com/watch?v=lBDDMrUCz1A&list=RDlBDDMrUCz1A")
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if mix.Ambiguous || !mix.IsMix {
		t.Errorf("mix não deveria ser ambíguo: %+v", mix)
	}

	if _, err := svc.Inspect(ctx, "https://evil.com/watch?v=lBDDMrUCz1A"); err == nil {
		t.Error("host fora da allowlist deveria ser recusado")
	}
}

func TestCancelRetryAndDelete(t *testing.T) {
	ctx := context.Background()
	disc := &mockDiscovery{playlist: &discovery.RemotePlaylist{
		ID:    "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6",
		Title: "Rock Nacional",
		Tracks: []discovery.RemoteItem{
			{ID: "lBDDMrUCz1A", Title: "A"},
			{ID: "aBcDeFgHiJk", Title: "B"},
		},
	}}
	svc, jobRepo, itemRepo, queue, _ := newService(t, disc)

	job, err := svc.SubmitFromSource(ctx, "youtube", "playlist", "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6")
	if err != nil {
		t.Fatal(err)
	}
	drain(queue)

	// One item already finished: cancelling must not undo it.
	items, _ := itemRepo.ListByJob(ctx, job.ID)
	_ = items[0].StartProcessing()
	_ = items[0].Complete("track-1")
	_ = itemRepo.Update(ctx, &items[0])

	if err := svc.CancelJob(ctx, job.ID); err != nil {
		t.Fatalf("cancelamento falhou: %v", err)
	}
	stored, _ := jobRepo.FindByID(ctx, job.ID)
	if stored.Status != ingest.StatusCanceled {
		t.Errorf("status esperado canceled, veio %s", stored.Status)
	}
	items, _ = itemRepo.ListByJob(ctx, job.ID)
	if items[0].Status != ingest.ItemCompleted || items[1].Status != ingest.ItemCanceled {
		t.Errorf("itens inesperados após cancelar: %+v", items)
	}

	// Retry re-queues the job and only the items that did not finish.
	retried, err := svc.RetryJob(ctx, job.ID)
	if err != nil {
		t.Fatalf("retry falhou: %v", err)
	}
	if retried.Status != ingest.StatusQueued {
		t.Errorf("retry deveria voltar para queued, veio %s", retried.Status)
	}
	items, _ = itemRepo.ListByJob(ctx, job.ID)
	if items[0].Status != ingest.ItemCompleted || items[1].Status != ingest.ItemQueued {
		t.Errorf("retry deveria reenfileirar só o item pendente: %+v", items)
	}
	if id := <-queue; id != job.ID {
		t.Errorf("job não voltou para a fila do worker")
	}

	if err := svc.DeleteJob(ctx, job.ID); err != nil {
		t.Fatalf("remoção falhou: %v", err)
	}
	if _, err := svc.GetJobStatus(ctx, job.ID); err == nil {
		t.Error("job removido ainda foi encontrado")
	}
}

// A remote playlist already downloaded once keeps feeding the same Harmoni playlist.
func TestSubmitReusesPlaylistOfPreviousJob(t *testing.T) {
	ctx := context.Background()
	disc := &mockDiscovery{playlist: &discovery.RemotePlaylist{
		ID:     "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6",
		Title:  "Rock Nacional",
		Tracks: []discovery.RemoteItem{{ID: "lBDDMrUCz1A", Title: "A"}},
	}}
	svc, jobRepo, _, queue, _ := newService(t, disc)
	jobRepo.bySource["youtube:PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6"] = "playlist-existente"

	job, err := svc.SubmitFromSource(ctx, "youtube", "playlist", "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6")
	if err != nil {
		t.Fatal(err)
	}
	if job.PlaylistID == nil || *job.PlaylistID != "playlist-existente" {
		t.Errorf("job deveria reaproveitar a playlist anterior: %+v", job.PlaylistID)
	}
	drain(queue)
}

// The queue must still accept a job when the remote catalog is unreachable.
func TestSubmitSurvivesRemoteFailure(t *testing.T) {
	ctx := context.Background()
	svc, _, itemRepo, queue, _ := newService(t, &mockDiscovery{err: discovery.ErrRemoteUnavailable})

	job, err := svc.SubmitFromSource(ctx, "youtube", "playlist", "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6")
	if err != nil {
		t.Fatalf("catálogo remoto indisponível não deveria impedir o enfileiramento: %v", err)
	}
	if items, _ := itemRepo.ListByJob(ctx, job.ID); len(items) != 0 {
		t.Errorf("sem catálogo não há itens ainda, o worker expande depois: %+v", items)
	}
	drain(queue)
}

func drain(queue chan string) {
	for {
		select {
		case <-queue:
		default:
			return
		}
	}
}
