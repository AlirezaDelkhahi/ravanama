package migrations

import (
	_ "embed"
	"strings"
)

//go:embed 00001_init.sql
var InitSQL string

// InitUpSQL returns only the `-- +goose Up` portion of 00001_init.sql.
func InitUpSQL() string {
	sql := InitSQL
	if idx := strings.Index(sql, "-- +goose Down"); idx != -1 {
		sql = sql[:idx]
	}
	sql = strings.Replace(sql, "-- +goose Up", "", 1)
	return strings.TrimSpace(sql)
}
