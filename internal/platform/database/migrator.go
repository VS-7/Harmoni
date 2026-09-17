package database

import (
	"context"
	"embed"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// RunMigrations applies all pending SQL migrations to the database.
func RunMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	slog.InfoContext(ctx, "iniciando verificação de migrações do banco de dados")

	// Ensure migrations tracking table exists
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name VARCHAR(255) PRIMARY KEY,
			applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		);
	`)
	if err != nil {
		return fmt.Errorf("falha ao criar tabela schema_migrations: %w", err)
	}

	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("falha ao ler diretório de migrações: %w", err)
	}

	var files []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			files = append(files, entry.Name())
		}
	}
	sort.Strings(files)

	for _, file := range files {
		var applied bool
		err := pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name = $1)", file).Scan(&applied)
		if err != nil {
			return fmt.Errorf("falha ao verificar status da migração %s: %w", file, err)
		}

		if applied {
			continue
		}

		slog.InfoContext(ctx, "aplicando migração", "file", file)
		content, err := migrationFS.ReadFile("migrations/" + file)
		if err != nil {
			return fmt.Errorf("falha ao ler arquivo de migração %s: %w", file, err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("falha ao iniciar transação para migração %s: %w", file, err)
		}

		if _, err := tx.Exec(ctx, string(content)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("falha ao executar migração %s: %w", file, err)
		}

		if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (name) VALUES ($1)", file); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("falha ao registrar migração %s: %w", file, err)
		}

		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("falha ao commitar migração %s: %w", file, err)
		}

		slog.InfoContext(ctx, "migração aplicada com sucesso", "file", file)
	}

	slog.InfoContext(ctx, "todas as migrações foram verificadas e aplicadas")
	return nil
}
