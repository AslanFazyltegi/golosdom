package announcements

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"golosdom-backend/internal/infocenter/audience"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

type listFilter struct {
	Status string
	Search string
}

func (r *Repository) CompleteExpired(ctx context.Context, actorID string) error {
	rows, err := r.db.Query(ctx, `
		UPDATE infocenter_announcements
		SET status = 'completed',
			is_visible = false,
			completed_at = COALESCE(completed_at, now()),
			updated_by = $1,
			updated_at = now()
		WHERE status = 'published'
			AND actual_until IS NOT NULL
			AND actual_until <= now()
		RETURNING id
	`, actorID)
	if err != nil {
		return err
	}
	defer rows.Close()

	reason := "срок актуальности истек"
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return err
		}
		if err := r.addHistory(ctx, id, "completed", &reason, actorID); err != nil {
			return err
		}
	}
	return rows.Err()
}

func (r *Repository) List(ctx context.Context, filter listFilter) ([]AnnouncementResponse, error) {
	args := []any{}
	where := []string{"true"}

	if filter.Status != "" && filter.Status != "all" {
		args = append(args, filter.Status)
		where = append(where, fmt.Sprintf("a.status = $%d", len(args)))
	}
	if filter.Search != "" {
		args = append(args, "%"+strings.ToLower(filter.Search)+"%")
		where = append(where, fmt.Sprintf("(lower(a.title) LIKE $%d OR lower(a.body_html) LIKE $%d OR lower(a.category) LIKE $%d)", len(args), len(args), len(args)))
	}

	rows, err := r.db.Query(ctx, `
		SELECT `+announcementSelectColumns("NULL::timestamptz")+`
		FROM infocenter_announcements a
		LEFT JOIN users u ON u.id = a.created_by
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY
			`+effectivePinnedExpr("a")+` DESC,
			CASE a.status
				WHEN 'published' THEN 1
				WHEN 'scheduled' THEN 2
				WHEN 'draft' THEN 3
				WHEN 'hidden' THEN 4
				WHEN 'completed' THEN 5
				WHEN 'deleted' THEN 6
				ELSE 7
			END,
			COALESCE(a.published_at, a.scheduled_at, a.updated_at, a.created_at) DESC
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []AnnouncementResponse{}
	for rows.Next() {
		item, err := scanAnnouncement(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return r.attachHistory(ctx, items)
}

func (r *Repository) Get(ctx context.Context, id string) (AnnouncementResponse, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+announcementSelectColumns("NULL::timestamptz")+`
		FROM infocenter_announcements a
		LEFT JOIN users u ON u.id = a.created_by
		WHERE a.id = $1
	`, id)
	if err != nil {
		return AnnouncementResponse{}, err
	}
	defer rows.Close()
	if !rows.Next() {
		return AnnouncementResponse{}, sql.ErrNoRows
	}
	item, err := scanAnnouncement(rows)
	if err != nil {
		return AnnouncementResponse{}, err
	}
	items, err := r.attachHistory(ctx, []AnnouncementResponse{item})
	if err != nil {
		return AnnouncementResponse{}, err
	}
	return items[0], nil
}

func (r *Repository) ListForUser(ctx context.Context, userID string) ([]AnnouncementResponse, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+announcementSelectColumns("ar.read_at")+`
		FROM infocenter_announcements a
		LEFT JOIN users u ON u.id = a.created_by
		LEFT JOIN infocenter_announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = $1
		WHERE `+audience.PublishedAnnouncementPredicate("a")+`
			AND `+audience.InfocenterItemPredicate("a", "$1")+`
		ORDER BY
			`+effectivePinnedExpr("a")+` DESC,
			a.is_important DESC,
			COALESCE(a.published_at, a.updated_at, a.created_at) DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []AnnouncementResponse{}
	for rows.Next() {
		item, err := scanAnnouncement(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range items {
		items[i].History = []AnnouncementActionResponse{}
	}
	return items, nil
}

func (r *Repository) GetForUser(ctx context.Context, id string, userID string) (AnnouncementResponse, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+announcementSelectColumns("ar.read_at")+`
		FROM infocenter_announcements a
		LEFT JOIN users u ON u.id = a.created_by
		LEFT JOIN infocenter_announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = $1
		WHERE a.id = $2
			AND `+audience.PublishedAnnouncementPredicate("a")+`
			AND `+audience.InfocenterItemPredicate("a", "$1")+`
	`, userID, id)
	if err != nil {
		return AnnouncementResponse{}, err
	}
	defer rows.Close()
	if !rows.Next() {
		return AnnouncementResponse{}, sql.ErrNoRows
	}
	item, err := scanAnnouncement(rows)
	if err != nil {
		return AnnouncementResponse{}, err
	}
	item.History = []AnnouncementActionResponse{}
	return item, nil
}

func (r *Repository) MarkRead(ctx context.Context, id string, userID string) error {
	var announcementID string
	err := r.db.QueryRow(ctx, `
		INSERT INTO infocenter_announcement_reads (id, announcement_id, user_id, read_at)
		SELECT $1::uuid, a.id, $2::text, now()
		FROM infocenter_announcements a
		WHERE a.id = $3
			AND `+audience.PublishedAnnouncementPredicate("a")+`
			AND `+audience.InfocenterItemPredicate("a", "$2::text")+`
		ON CONFLICT (announcement_id, user_id) DO UPDATE SET read_at = infocenter_announcement_reads.read_at
		RETURNING announcement_id
	`, newID(), userID, id).Scan(&announcementID)
	if err == pgx.ErrNoRows {
		return sql.ErrNoRows
	}
	return err
}

func (r *Repository) Create(ctx context.Context, id string, req SaveRequest, actorID string, status string) (AnnouncementResponse, error) {
	_, err := r.db.Exec(ctx, `
		INSERT INTO infocenter_announcements (
			id, title, body_json, body_html, category, audience_type,
			audience_filter, status, is_visible, is_pinned, is_important,
			notify_enabled, scheduled_at, published_at, actual_until, created_by
		) VALUES (
			$1, $2, $3, $4, $5, $6, NULLIF($7, 'null')::jsonb, $8::varchar(30),
			$9, $10, $11, $12, $13,
			CASE WHEN $8::text = 'published' THEN now() ELSE NULL END,
			$14, $15
		)
	`, id, req.Title, req.BodyJSON, req.BodyHTML, req.Category, req.AudienceType,
		jsonOrNull(req.AudienceFilter), status, status == "published", req.IsPinned,
		req.IsImportant, req.NotifyEnabled, req.ScheduledAt, req.ActualUntil, actorID)
	if err != nil {
		return AnnouncementResponse{}, err
	}
	action := "created"
	if status == "published" {
		action = "published"
	}
	if status == "scheduled" {
		action = "scheduled"
	}
	if err := r.addHistory(ctx, id, action, nil, actorID); err != nil {
		return AnnouncementResponse{}, err
	}
	return r.Get(ctx, id)
}

func (r *Repository) Update(ctx context.Context, id string, req SaveRequest, actorID string) (AnnouncementResponse, error) {
	_, err := r.db.Exec(ctx, `
		UPDATE infocenter_announcements
		SET title = $2,
			body_json = $3,
			body_html = $4,
			category = $5,
			audience_type = $6,
			audience_filter = NULLIF($7, 'null')::jsonb,
			is_pinned = $8,
			is_important = $9,
			notify_enabled = $10,
			actual_until = $11,
			updated_by = $12,
			updated_at = now()
		WHERE id = $1
	`, id, req.Title, req.BodyJSON, req.BodyHTML, req.Category, req.AudienceType,
		jsonOrNull(req.AudienceFilter), req.IsPinned, req.IsImportant, req.NotifyEnabled,
		req.ActualUntil, actorID)
	if err != nil {
		return AnnouncementResponse{}, err
	}
	if err := r.addHistory(ctx, id, "updated", nil, actorID); err != nil {
		return AnnouncementResponse{}, err
	}
	return r.Get(ctx, id)
}

func (r *Repository) SetStatus(ctx context.Context, id string, status string, action string, reason *string, scheduledAt *time.Time, actorID string) (AnnouncementResponse, error) {
	_, err := r.db.Exec(ctx, `
		UPDATE infocenter_announcements
		SET status = $2::varchar(30),
			is_visible = $3,
			published_at = CASE WHEN $2::text = 'published' THEN now() ELSE published_at END,
			scheduled_at = CASE WHEN $2::text = 'scheduled' THEN $4 WHEN $2::text IN ('published', 'draft') THEN NULL ELSE scheduled_at END,
			hidden_at = CASE WHEN $2::text = 'hidden' THEN now() ELSE hidden_at END,
			completed_at = CASE WHEN $2::text = 'completed' THEN now() WHEN $2::text = 'draft' THEN NULL ELSE completed_at END,
			deleted_at = CASE WHEN $2::text = 'deleted' THEN now() WHEN $2::text = 'draft' THEN NULL ELSE deleted_at END,
			updated_by = $5,
			updated_at = now()
		WHERE id = $1
	`, id, status, status == "published", scheduledAt, actorID)
	if err != nil {
		return AnnouncementResponse{}, err
	}
	if err := r.addHistory(ctx, id, action, reason, actorID); err != nil {
		return AnnouncementResponse{}, err
	}
	return r.Get(ctx, id)
}

func (r *Repository) PermanentDelete(ctx context.Context, id string, actorID string) error {
	if err := r.addHistory(ctx, id, "permanently_deleted", nil, actorID); err != nil {
		return err
	}
	_, err := r.db.Exec(ctx, `DELETE FROM infocenter_announcements WHERE id = $1 AND status = 'deleted'`, id)
	return err
}

func (r *Repository) addHistory(ctx context.Context, announcementID string, action string, reason *string, actorID string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO infocenter_announcement_history (id, announcement_id, action, reason, actor_id)
		VALUES ($1, $2, $3, $4, $5)
	`, newID(), announcementID, action, reason, actorID)
	return err
}

func (r *Repository) attachHistory(ctx context.Context, items []AnnouncementResponse) ([]AnnouncementResponse, error) {
	for i := range items {
		history, err := r.history(ctx, items[i].ID)
		if err != nil {
			return nil, err
		}
		items[i].History = history
	}
	return items, nil
}

func (r *Repository) history(ctx context.Context, announcementID string) ([]AnnouncementActionResponse, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, announcement_id, action, reason, actor_id, created_at
		FROM infocenter_announcement_history
		WHERE announcement_id = $1
		ORDER BY created_at DESC
	`, announcementID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []AnnouncementActionResponse{}
	for rows.Next() {
		var item AnnouncementActionResponse
		var reason sql.NullString
		if err := rows.Scan(&item.ID, &item.AnnouncementID, &item.Action, &reason, &item.ActorID, &item.CreatedAt); err != nil {
			return nil, err
		}
		item.Reason = nullString(reason)
		items = append(items, item)
	}
	return items, rows.Err()
}

func announcementSelectColumns(readAtExpr string) string {
	return `
		a.id,
		a.title,
		COALESCE(a.body_json, 'null'::jsonb),
		a.body_html,
		a.category,
		a.audience_type,
		COALESCE(a.audience_filter, 'null'::jsonb),
		a.status,
		a.is_visible,
		` + effectivePinnedExpr("a") + ` AS is_pinned,
		a.is_important,
		a.notify_enabled,
		a.published_at,
		a.scheduled_at,
		a.actual_until,
		a.pinned_until,
		a.hidden_at,
		a.completed_at,
		a.deleted_at,
		a.created_by,
		a.updated_by,
		COALESCE(u.full_name, a.created_by) AS author_name,
		a.created_at,
		a.updated_at,
		(SELECT COUNT(*)::int FROM infocenter_announcement_reads r WHERE r.announcement_id = a.id) AS views_count,
		(SELECT COUNT(*)::int FROM infocenter_announcement_reads r WHERE r.announcement_id = a.id) AS reads_count,
		` + readAtExpr + ` AS read_at
	`
}

func scanAnnouncement(rows pgx.Rows) (AnnouncementResponse, error) {
	var item AnnouncementResponse
	var updatedBy sql.NullString
	var publishedAt, scheduledAt, actualUntil, pinnedUntil, hiddenAt, completedAt, deletedAt, readAt sql.NullTime
	err := rows.Scan(
		&item.ID, &item.Title, &item.BodyJSON, &item.BodyHTML,
		&item.Category, &item.AudienceType, &item.AudienceFilter, &item.Status,
		&item.IsVisible, &item.IsPinned, &item.IsImportant, &item.NotifyEnabled,
		&publishedAt, &scheduledAt, &actualUntil, &pinnedUntil, &hiddenAt, &completedAt,
		&deletedAt, &item.CreatedBy, &updatedBy, &item.AuthorName, &item.CreatedAt,
		&item.UpdatedAt, &item.ViewsCount, &item.ReadsCount, &readAt,
	)
	item.UpdatedBy = nullString(updatedBy)
	item.PublishedAt = nullTime(publishedAt)
	item.ScheduledAt = nullTime(scheduledAt)
	item.ActualUntil = nullTime(actualUntil)
	item.PinnedUntil = nullTime(pinnedUntil)
	item.HiddenAt = nullTime(hiddenAt)
	item.CompletedAt = nullTime(completedAt)
	item.DeletedAt = nullTime(deletedAt)
	item.ReadAt = nullTime(readAt)
	return item, err
}

func jsonOrNull(value json.RawMessage) string {
	if len(value) == 0 {
		return "null"
	}
	return string(value)
}

func effectivePinnedExpr(alias string) string {
	return "(" + alias + ".is_pinned = true AND (" + alias + ".pinned_until IS NULL OR " + alias + ".pinned_until >= now()))"
}

func nullString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func nullTime(value sql.NullTime) *time.Time {
	if !value.Valid {
		return nil
	}
	return &value.Time
}
