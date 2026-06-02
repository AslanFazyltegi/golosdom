package news

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

func (r *Repository) AutoPublishDue(ctx context.Context, actorID string) error {
	rows, err := r.db.Query(ctx, `
		UPDATE infocenter_news
		SET status = 'published',
			is_visible = true,
			published_at = COALESCE(scheduled_at, now()),
			scheduled_at = NULL,
			updated_by = $1,
			updated_at = now()
		WHERE status = 'scheduled'
			AND scheduled_at IS NOT NULL
			AND scheduled_at <= now()
		RETURNING id
	`, actorID)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return err
		}
		if err := r.addHistory(ctx, id, "published", nil, actorID); err != nil {
			return err
		}
	}
	return rows.Err()
}

func (r *Repository) List(ctx context.Context, filter listFilter) ([]NewsResponse, error) {
	args := []any{}
	where := []string{"true"}

	if filter.Status != "" && filter.Status != "all" {
		args = append(args, filter.Status)
		where = append(where, fmt.Sprintf("n.status = $%d", len(args)))
	}
	if filter.Search != "" {
		args = append(args, "%"+strings.ToLower(filter.Search)+"%")
		where = append(where, fmt.Sprintf("(lower(n.title) LIKE $%d OR lower(n.summary) LIKE $%d OR lower(n.category) LIKE $%d)", len(args), len(args), len(args)))
	}

	rows, err := r.db.Query(ctx, `
		SELECT `+newsSelectColumns("NULL::timestamptz")+`
		FROM infocenter_news n
		LEFT JOIN users u ON u.id = n.created_by
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY
			CASE n.status
				WHEN 'published' THEN 1
				WHEN 'scheduled' THEN 2
				WHEN 'draft' THEN 3
				WHEN 'hidden' THEN 4
				WHEN 'unpublished' THEN 5
				WHEN 'deleted' THEN 6
				ELSE 7
			END,
			COALESCE(n.published_at, n.scheduled_at, n.updated_at, n.created_at) DESC
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []NewsResponse{}
	for rows.Next() {
		item, err := scanNews(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return r.attachDetails(ctx, items)
}

func (r *Repository) Get(ctx context.Context, id string) (NewsResponse, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+newsSelectColumns("NULL::timestamptz")+`
		FROM infocenter_news n
		LEFT JOIN users u ON u.id = n.created_by
		WHERE n.id = $1
	`, id)
	if err != nil {
		return NewsResponse{}, err
	}
	defer rows.Close()
	if !rows.Next() {
		return NewsResponse{}, sql.ErrNoRows
	}
	item, err := scanNews(rows)
	if err != nil {
		return NewsResponse{}, err
	}
	items, err := r.attachDetails(ctx, []NewsResponse{item})
	if err != nil {
		return NewsResponse{}, err
	}
	return items[0], nil
}

func (r *Repository) ListForUser(ctx context.Context, userID string) ([]NewsResponse, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+newsSelectColumns("nr.read_at")+`
		FROM infocenter_news n
		LEFT JOIN users u ON u.id = n.created_by
		LEFT JOIN infocenter_news_reads nr ON nr.news_id = n.id AND nr.user_id = $1
		WHERE `+audience.PublishedNewsPredicate("n")+`
			AND `+audience.InfocenterItemPredicate("n", "$1")+`
		ORDER BY
			n.is_pinned DESC,
			n.is_important DESC,
			COALESCE(n.published_at, n.updated_at, n.created_at) DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []NewsResponse{}
	for rows.Next() {
		item, err := scanNews(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return r.attachImages(ctx, items)
}

func (r *Repository) GetForUser(ctx context.Context, id string, userID string) (NewsResponse, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+newsSelectColumns("nr.read_at")+`
		FROM infocenter_news n
		LEFT JOIN users u ON u.id = n.created_by
		LEFT JOIN infocenter_news_reads nr ON nr.news_id = n.id AND nr.user_id = $1
		WHERE n.id = $2
			AND `+audience.PublishedNewsPredicate("n")+`
			AND `+audience.InfocenterItemPredicate("n", "$1")+`
	`, userID, id)
	if err != nil {
		return NewsResponse{}, err
	}
	defer rows.Close()
	if !rows.Next() {
		return NewsResponse{}, sql.ErrNoRows
	}
	item, err := scanNews(rows)
	if err != nil {
		return NewsResponse{}, err
	}
	items, err := r.attachImages(ctx, []NewsResponse{item})
	if err != nil {
		return NewsResponse{}, err
	}
	return items[0], nil
}

func (r *Repository) MarkRead(ctx context.Context, id string, userID string) error {
	var newsID string
	err := r.db.QueryRow(ctx, `
		INSERT INTO infocenter_news_reads (id, news_id, user_id, read_at)
		SELECT $1::uuid, n.id, $2::text, now()
		FROM infocenter_news n
		WHERE n.id = $3
			AND `+audience.PublishedNewsPredicate("n")+`
			AND `+audience.InfocenterItemPredicate("n", "$2::text")+`
		ON CONFLICT (news_id, user_id) DO UPDATE SET read_at = infocenter_news_reads.read_at
		RETURNING news_id
	`, newID(), userID, id).Scan(&newsID)
	if err == pgx.ErrNoRows {
		return sql.ErrNoRows
	}
	return err
}

func (r *Repository) Create(ctx context.Context, id string, req SaveRequest, actorID string, status string) (NewsResponse, error) {
	_, err := r.db.Exec(ctx, `
		INSERT INTO infocenter_news (
			id, title, summary, body_json, body_html, category, audience_type,
			audience_filter, status, is_visible, is_pinned, is_important,
			notify_enabled, scheduled_at, published_at, created_by
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, NULLIF($8, 'null')::jsonb, $9::varchar(30),
			$10, $11, $12, $13, $14,
			CASE WHEN $9::text = 'published' THEN now() ELSE NULL END,
			$15
		)
	`, id, req.Title, req.Summary, req.BodyJSON, req.BodyHTML, req.Category,
		req.AudienceType, jsonOrNull(req.AudienceFilter), status, status == "published",
		req.IsPinned, req.IsImportant, req.NotifyEnabled, req.ScheduledAt, actorID)
	if err != nil {
		return NewsResponse{}, err
	}
	action := "created"
	if status == "published" {
		action = "published"
	}
	if status == "scheduled" {
		action = "scheduled"
	}
	if err := r.addHistory(ctx, id, action, nil, actorID); err != nil {
		return NewsResponse{}, err
	}
	return r.Get(ctx, id)
}

func (r *Repository) Update(ctx context.Context, id string, req SaveRequest, actorID string) (NewsResponse, error) {
	_, err := r.db.Exec(ctx, `
		UPDATE infocenter_news
		SET title = $2,
			summary = $3,
			body_json = $4,
			body_html = $5,
			category = $6,
			audience_type = $7,
			audience_filter = NULLIF($8, 'null')::jsonb,
			is_pinned = $9,
			is_important = $10,
			notify_enabled = $11,
			updated_by = $12,
			updated_at = now()
		WHERE id = $1
	`, id, req.Title, req.Summary, req.BodyJSON, req.BodyHTML, req.Category,
		req.AudienceType, jsonOrNull(req.AudienceFilter), req.IsPinned,
		req.IsImportant, req.NotifyEnabled, actorID)
	if err != nil {
		return NewsResponse{}, err
	}
	if err := r.addHistory(ctx, id, "updated", nil, actorID); err != nil {
		return NewsResponse{}, err
	}
	return r.Get(ctx, id)
}

func (r *Repository) SetStatus(ctx context.Context, id string, status string, action string, reason *string, scheduledAt *time.Time, actorID string) (NewsResponse, error) {
	_, err := r.db.Exec(ctx, `
		UPDATE infocenter_news
		SET status = $2::varchar(30),
			is_visible = $3,
			published_at = CASE WHEN $2::text = 'published' THEN COALESCE(published_at, now()) ELSE published_at END,
			scheduled_at = CASE WHEN $2::text = 'scheduled' THEN $4 WHEN $2::text IN ('published', 'draft') THEN NULL ELSE scheduled_at END,
			hidden_at = CASE WHEN $2::text = 'hidden' THEN now() ELSE hidden_at END,
			unpublished_at = CASE WHEN $2::text = 'unpublished' THEN now() ELSE unpublished_at END,
			deleted_at = CASE WHEN $2::text = 'deleted' THEN now() WHEN $2::text = 'draft' THEN NULL ELSE deleted_at END,
			updated_by = $5,
			updated_at = now()
		WHERE id = $1
	`, id, status, status == "published", scheduledAt, actorID)
	if err != nil {
		return NewsResponse{}, err
	}
	if err := r.addHistory(ctx, id, action, reason, actorID); err != nil {
		return NewsResponse{}, err
	}
	return r.Get(ctx, id)
}

func (r *Repository) PermanentDelete(ctx context.Context, id string, actorID string) error {
	if err := r.addHistory(ctx, id, "permanently_deleted", nil, actorID); err != nil {
		return err
	}
	_, err := r.db.Exec(ctx, `DELETE FROM infocenter_news WHERE id = $1 AND status = 'deleted'`, id)
	return err
}

func (r *Repository) AddImage(ctx context.Context, image ImageResponse, actorID string) (NewsResponse, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return NewsResponse{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		INSERT INTO infocenter_news_images (
			id, news_id, file_name, file_path, file_url, mime_type, size_bytes, sort_order
		) VALUES ($1, $2, $3, $4, $5, $6, $7, (
			SELECT COALESCE(MAX(sort_order), -1) + 1 FROM infocenter_news_images WHERE news_id = $2
		))
	`, image.ID, image.NewsID, image.FileName, image.FilePath, image.FileURL, image.MimeType, image.SizeBytes); err != nil {
		return NewsResponse{}, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE infocenter_news
		SET cover_image_id = COALESCE(cover_image_id, $2),
			updated_by = $3,
			updated_at = now()
		WHERE id = $1
	`, image.NewsID, image.ID, actorID); err != nil {
		return NewsResponse{}, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO infocenter_news_action_history (id, news_id, action, actor_id)
		VALUES ($1, $2, 'image_uploaded', $3)
	`, newID(), image.NewsID, actorID); err != nil {
		return NewsResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return NewsResponse{}, err
	}
	return r.Get(ctx, image.NewsID)
}

func (r *Repository) DeleteImage(ctx context.Context, newsID string, imageID string, actorID string) (NewsResponse, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return NewsResponse{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM infocenter_news_images WHERE news_id = $1 AND id = $2`, newsID, imageID); err != nil {
		return NewsResponse{}, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE infocenter_news n
		SET cover_image_id = CASE
				WHEN n.cover_image_id = $2 THEN (
					SELECT id FROM infocenter_news_images
					WHERE news_id = $1
					ORDER BY sort_order, created_at
					LIMIT 1
				)
				ELSE n.cover_image_id
			END,
			updated_by = $3,
			updated_at = now()
		WHERE n.id = $1
	`, newsID, imageID, actorID); err != nil {
		return NewsResponse{}, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO infocenter_news_action_history (id, news_id, action, actor_id)
		VALUES ($1, $2, 'image_deleted', $3)
	`, newID(), newsID, actorID); err != nil {
		return NewsResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return NewsResponse{}, err
	}
	return r.Get(ctx, newsID)
}

func (r *Repository) SetCover(ctx context.Context, newsID string, imageID string, actorID string) (NewsResponse, error) {
	_, err := r.db.Exec(ctx, `
		UPDATE infocenter_news
		SET cover_image_id = $2,
			updated_by = $3,
			updated_at = now()
		WHERE id = $1
			AND EXISTS (
				SELECT 1 FROM infocenter_news_images
				WHERE news_id = $1 AND id = $2
			)
	`, newsID, imageID, actorID)
	if err != nil {
		return NewsResponse{}, err
	}
	if err := r.addHistory(ctx, newsID, "cover_changed", nil, actorID); err != nil {
		return NewsResponse{}, err
	}
	return r.Get(ctx, newsID)
}

func (r *Repository) addHistory(ctx context.Context, newsID string, action string, reason *string, actorID string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO infocenter_news_action_history (id, news_id, action, reason, actor_id)
		VALUES ($1, $2, $3, $4, $5)
	`, newID(), newsID, action, reason, actorID)
	return err
}

func (r *Repository) attachDetails(ctx context.Context, items []NewsResponse) ([]NewsResponse, error) {
	for i := range items {
		images, err := r.images(ctx, items[i].ID)
		if err != nil {
			return nil, err
		}
		history, err := r.history(ctx, items[i].ID)
		if err != nil {
			return nil, err
		}
		items[i].Images = images
		items[i].History = history
	}
	return items, nil
}

func (r *Repository) attachImages(ctx context.Context, items []NewsResponse) ([]NewsResponse, error) {
	for i := range items {
		images, err := r.images(ctx, items[i].ID)
		if err != nil {
			return nil, err
		}
		items[i].Images = images
		items[i].History = []ActionResponse{}
	}
	return items, nil
}

func (r *Repository) images(ctx context.Context, newsID string) ([]ImageResponse, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, news_id, file_name, file_path, file_url, mime_type, size_bytes, sort_order, created_at
		FROM infocenter_news_images
		WHERE news_id = $1
		ORDER BY sort_order, created_at
	`, newsID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []ImageResponse{}
	for rows.Next() {
		var item ImageResponse
		if err := rows.Scan(&item.ID, &item.NewsID, &item.FileName, &item.FilePath, &item.FileURL, &item.MimeType, &item.SizeBytes, &item.SortOrder, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) history(ctx context.Context, newsID string) ([]ActionResponse, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, news_id, action, reason, actor_id, created_at
		FROM infocenter_news_action_history
		WHERE news_id = $1
		ORDER BY created_at DESC
	`, newsID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []ActionResponse{}
	for rows.Next() {
		var item ActionResponse
		var reason sql.NullString
		if err := rows.Scan(&item.ID, &item.NewsID, &item.Action, &reason, &item.ActorID, &item.CreatedAt); err != nil {
			return nil, err
		}
		item.Reason = nullString(reason)
		items = append(items, item)
	}
	return items, rows.Err()
}

func newsSelectColumns(readAtExpr string) string {
	return `
		n.id,
		n.title,
		n.summary,
		n.body_json,
		n.body_html,
		n.category,
		n.audience_type,
		COALESCE(n.audience_filter, 'null'::jsonb),
		n.status,
		n.is_visible,
		n.is_pinned,
		n.is_important,
		n.notify_enabled,
		n.cover_image_id,
		n.published_at,
		n.scheduled_at,
		n.hidden_at,
		n.unpublished_at,
		n.deleted_at,
		n.created_by,
		n.updated_by,
		COALESCE(u.full_name, n.created_by) AS author_name,
		n.created_at,
		n.updated_at,
		(SELECT COUNT(*)::int FROM infocenter_news_reads r WHERE r.news_id = n.id) AS views_count,
		(SELECT COUNT(*)::int FROM infocenter_news_reads r WHERE r.news_id = n.id) AS reads_count,
		` + readAtExpr + ` AS read_at
	`
}

func scanNews(rows pgx.Rows) (NewsResponse, error) {
	var item NewsResponse
	var coverID, updatedBy sql.NullString
	var publishedAt, scheduledAt, hiddenAt, unpublishedAt, deletedAt, readAt sql.NullTime
	err := rows.Scan(
		&item.ID, &item.Title, &item.Summary, &item.BodyJSON, &item.BodyHTML,
		&item.Category, &item.AudienceType, &item.AudienceFilter, &item.Status,
		&item.IsVisible, &item.IsPinned, &item.IsImportant, &item.NotifyEnabled,
		&coverID, &publishedAt, &scheduledAt, &hiddenAt, &unpublishedAt,
		&deletedAt, &item.CreatedBy, &updatedBy, &item.AuthorName, &item.CreatedAt,
		&item.UpdatedAt, &item.ViewsCount, &item.ReadsCount, &readAt,
	)
	item.CoverImageID = nullString(coverID)
	item.UpdatedBy = nullString(updatedBy)
	item.PublishedAt = nullTime(publishedAt)
	item.ScheduledAt = nullTime(scheduledAt)
	item.HiddenAt = nullTime(hiddenAt)
	item.UnpublishedAt = nullTime(unpublishedAt)
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
