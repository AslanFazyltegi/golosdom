package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"golosdom-backend/internal/communications/model"
	"golosdom-backend/internal/infocenter/audience"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

type SavePostData struct {
	ID           string
	BuildingID   string
	AuthorUserID string
	Type         string
	Title        string
	Body         string
	ImageURL     *string
	Status       string
	Importance   string
	IsPinned     bool
	PublishAt    *time.Time
	VisibleFrom  *time.Time
	VisibleUntil *time.Time
	Targets      []model.Target
	Channels     []model.Channel
}

type SaveNotificationData struct {
	ID           string
	BuildingID   string
	AuthorUserID string
	Title        string
	Body         string
	BodyHTML     string
	Status       string
	Category     *string
	ScheduledAt  *time.Time
	Targets      []model.Target
	Channels     []model.Channel
}

type NotificationListFilter struct {
	Status   string
	Search   string
	Category string
	Audience string
	Sort     string
}

func (r *Repository) GetPrimaryBuildingID(ctx context.Context) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `SELECT id FROM building ORDER BY created_at ASC LIMIT 1`).Scan(&id)
	return id, err
}

func (r *Repository) ListPosts(ctx context.Context, userID string, roles []string, postType string, status string) ([]model.Post, error) {
	args := []any{}
	where := []string{}
	if postType != "" {
		args = append(args, postType)
		where = append(where, fmt.Sprintf("p.type = $%d", len(args)))
	}

	if hasRole(roles, "CHAIRMAN") {
		if status != "" && status != "all" {
			args = append(args, status)
			where = append(where, fmt.Sprintf("p.status = $%d", len(args)))
		}
	} else {
		args = append(args, userID)
		userParam := fmt.Sprintf("$%d", len(args))
		where = append(where, `p.status = 'published'
			AND p.deleted_at IS NULL
			AND (p.visible_from IS NULL OR p.visible_from <= now())
			AND (p.visible_until IS NULL OR p.visible_until >= now())
			AND EXISTS (
				SELECT 1
				FROM communication_post_targets t
				WHERE t.post_id = p.id
					AND `+audience.CommunicationTargetPredicate("t", "p.building_id", userParam)+`
			)`)
	}

	rows, err := r.db.Query(ctx, `
		SELECT
			p.id,
			p.building_id,
			p.author_user_id,
			p.type,
			p.title,
			p.body,
			p.image_url,
			p.status,
			p.importance,
			p.is_pinned,
			p.publish_at,
			p.visible_from,
			p.visible_until,
			p.created_at,
			p.updated_at,
			p.deleted_at,
			rr.read_at
		FROM communication_posts p
		LEFT JOIN communication_read_receipts rr
			ON rr.entity_type = 'post'
			AND rr.entity_id = p.id
			AND rr.user_id = $`+fmt.Sprint(len(args)+1)+`
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY
			p.is_pinned DESC,
			CASE p.importance WHEN 'urgent' THEN 1 WHEN 'important' THEN 2 ELSE 3 END,
			COALESCE(p.publish_at, p.created_at) DESC
	`, append(args, userID)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	posts := []model.Post{}
	for rows.Next() {
		post, err := scanPost(rows)
		if err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return r.attachPostRelations(ctx, posts)
}

func (r *Repository) GetPostForUser(ctx context.Context, id string, userID string, roles []string) (model.Post, error) {
	if hasRole(roles, "CHAIRMAN") {
		return r.getPostByID(ctx, id, userID)
	}
	posts, err := r.ListPosts(ctx, userID, roles, "", "")
	if err != nil {
		return model.Post{}, err
	}
	for _, post := range posts {
		if post.ID == id {
			return post, nil
		}
	}
	return model.Post{}, sql.ErrNoRows
}

func (r *Repository) SavePost(ctx context.Context, data SavePostData) (model.Post, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return model.Post{}, err
	}
	defer tx.Rollback(ctx)

	var post model.Post
	var imageURL sql.NullString
	var publishAt, visibleFrom, visibleUntil, deletedAt sql.NullTime
	err = tx.QueryRow(ctx, `
		INSERT INTO communication_posts (
			id, building_id, author_user_id, type, title, body, image_url, status,
			importance, is_pinned, publish_at, visible_from, visible_until
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		ON CONFLICT (id) DO UPDATE SET
			title = EXCLUDED.title,
			body = EXCLUDED.body,
			image_url = EXCLUDED.image_url,
			status = EXCLUDED.status,
			importance = EXCLUDED.importance,
			is_pinned = EXCLUDED.is_pinned,
			publish_at = EXCLUDED.publish_at,
			visible_from = EXCLUDED.visible_from,
			visible_until = EXCLUDED.visible_until,
			deleted_at = CASE WHEN EXCLUDED.status = 'deleted' THEN now() ELSE NULL END,
			updated_at = now()
		RETURNING id, building_id, author_user_id, type, title, body, image_url, status,
			importance, is_pinned, publish_at, visible_from, visible_until,
			created_at, updated_at, deleted_at
	`, data.ID, data.BuildingID, data.AuthorUserID, data.Type, data.Title, data.Body, data.ImageURL,
		data.Status, data.Importance, data.IsPinned, data.PublishAt, data.VisibleFrom, data.VisibleUntil).Scan(
		&post.ID, &post.BuildingID, &post.AuthorUserID, &post.Type, &post.Title, &post.Body,
		&imageURL, &post.Status, &post.Importance, &post.IsPinned, &publishAt, &visibleFrom,
		&visibleUntil, &post.CreatedAt, &post.UpdatedAt, &deletedAt,
	)
	if err != nil {
		return model.Post{}, err
	}
	post.ImageURL = nullStringPtr(imageURL)
	post.PublishAt = nullTimePtr(publishAt)
	post.VisibleFrom = nullTimePtr(visibleFrom)
	post.VisibleUntil = nullTimePtr(visibleUntil)
	post.DeletedAt = nullTimePtr(deletedAt)

	if err := replacePostTargets(ctx, tx, post.ID, normalizeTargets(data.Targets)); err != nil {
		return model.Post{}, err
	}
	if err := replacePostChannels(ctx, tx, post.ID, normalizePostChannels(data.Channels)); err != nil {
		return model.Post{}, err
	}
	if data.Status == "published" {
		if err := createPostDeliveries(ctx, tx, post.ID, data.BuildingID, normalizeTargets(data.Targets), normalizePostChannels(data.Channels)); err != nil {
			return model.Post{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return model.Post{}, err
	}
	post.Targets = normalizeTargets(data.Targets)
	post.Channels = normalizePostChannels(data.Channels)
	return post, nil
}

func (r *Repository) DeletePost(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE communication_posts
		SET status = 'deleted', deleted_at = now(), updated_at = now()
		WHERE id = $1
	`, id)
	return err
}

func (r *Repository) MarkPostRead(ctx context.Context, id string, userID string) error {
	return r.markRead(ctx, "post", id, userID)
}

func (r *Repository) ListNotifications(ctx context.Context, userID string, roles []string, filter NotificationListFilter) ([]model.Notification, error) {
	args := []any{}
	where := []string{}
	if hasRole(roles, "CHAIRMAN") {
		if filter.Status == "" || filter.Status == "all" {
			where = append(where, "n.status <> 'deleted'")
		} else {
			args = append(args, filter.Status)
			where = append(where, fmt.Sprintf("n.status = $%d", len(args)))
		}
		if strings.TrimSpace(filter.Search) != "" {
			args = append(args, "%"+strings.ToLower(strings.TrimSpace(filter.Search))+"%")
			where = append(where, fmt.Sprintf("(lower(n.title) LIKE $%d OR lower(n.body) LIKE $%d OR lower(n.body_html) LIKE $%d)", len(args), len(args), len(args)))
		}
		if strings.TrimSpace(filter.Category) != "" && filter.Category != "all" {
			args = append(args, filter.Category)
			where = append(where, fmt.Sprintf("n.category = $%d", len(args)))
		}
		if strings.TrimSpace(filter.Audience) != "" && filter.Audience != "all" {
			args = append(args, filter.Audience)
			where = append(where, fmt.Sprintf("EXISTS (SELECT 1 FROM communication_notification_targets t WHERE t.notification_id = n.id AND (t.target_type = $%d OR t.target_value = $%d))", len(args), len(args)))
		}
	} else {
		args = append(args, userID)
		userParam := fmt.Sprintf("$%d", len(args))
		where = append(where, audience.VisibleNotificationPredicate("n")+`
			AND EXISTS (
				SELECT 1
				FROM communication_notification_targets t
				WHERE t.notification_id = n.id
					AND `+audience.CommunicationTargetPredicate("t", "n.building_id", userParam)+`
			)`)
	}
	if len(where) == 0 {
		where = append(where, "true")
	}
	orderBy := "COALESCE(n.sent_at, n.scheduled_at, n.created_at) DESC"
	switch filter.Sort {
	case "oldest":
		orderBy = "COALESCE(n.sent_at, n.scheduled_at, n.created_at) ASC"
	case "title":
		orderBy = "lower(n.title) ASC"
	case "delivery":
		orderBy = "COALESCE(s.delivered_count, 0) DESC, COALESCE(s.recipient_count, 0) DESC"
	case "read":
		orderBy = "COALESCE(s.read_count, 0) DESC, COALESCE(s.recipient_count, 0) DESC"
	}

	rows, err := r.db.Query(ctx, `
		WITH stats AS (
			SELECT
				entity_id,
				COUNT(DISTINCT user_id)::int AS recipient_count,
				COUNT(DISTINCT user_id) FILTER (WHERE status IN ('delivered', 'read'))::int AS delivered_count,
				COUNT(DISTINCT user_id) FILTER (WHERE status = 'read')::int AS read_count
			FROM communication_deliveries
			WHERE entity_type = 'notification'
			GROUP BY entity_id
		)
		SELECT n.id, n.building_id, n.author_user_id, n.title, n.body, n.body_html,
			n.status, n.category, n.audience_summary, n.created_at, n.updated_at,
			n.scheduled_at, n.sent_at, n.deleted_at, n.hidden_at, rr.read_at
		FROM communication_notifications n
		LEFT JOIN stats s ON s.entity_id = n.id
		LEFT JOIN communication_read_receipts rr
			ON rr.entity_type = 'notification'
			AND rr.entity_id = n.id
			AND rr.user_id = $`+fmt.Sprint(len(args)+1)+`
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY `+orderBy+`
	`, append(args, userID)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []model.Notification{}
	for rows.Next() {
		item, err := scanNotification(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	items, err = r.attachNotificationRelations(ctx, items)
	if err != nil {
		return nil, err
	}
	return r.attachNotificationDeliveries(ctx, items)
}

func (r *Repository) SaveNotification(ctx context.Context, data SaveNotificationData) (model.Notification, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return model.Notification{}, fmt.Errorf("upsert notification: %w", err)
	}
	defer tx.Rollback(ctx)

	var item model.Notification
	status := normalizeNotificationStatus(data.Status, data.ScheduledAt)
	var sentAt *time.Time
	if status == "sent" || status == "sending" {
		now := time.Now()
		sentAt = &now
	}
	var sentAtScan, scheduledAt, deletedAt, hiddenAt, readAt sql.NullTime
	var category, audienceSummary sql.NullString
	err = tx.QueryRow(ctx, `
		INSERT INTO communication_notifications (
			id, building_id, author_user_id, title, body, body_html, status, category,
			audience_summary, scheduled_at, sent_at
		) VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, $8::text, $9::text, $10::timestamp, $11::timestamp)
		ON CONFLICT (id) DO UPDATE SET
			title = EXCLUDED.title,
			body = EXCLUDED.body,
			body_html = EXCLUDED.body_html,
			status = EXCLUDED.status,
			category = EXCLUDED.category,
			audience_summary = EXCLUDED.audience_summary,
			scheduled_at = EXCLUDED.scheduled_at,
			sent_at = CASE WHEN EXCLUDED.status IN ('sent', 'sending') THEN COALESCE(communication_notifications.sent_at, now()) ELSE communication_notifications.sent_at END,
			deleted_at = CASE WHEN EXCLUDED.status = 'deleted' THEN COALESCE(communication_notifications.deleted_at, now()) ELSE NULL END,
			hidden_at = CASE WHEN EXCLUDED.status = 'hidden' THEN COALESCE(communication_notifications.hidden_at, now()) ELSE NULL END,
			updated_at = now()
		RETURNING id, building_id, author_user_id, title, body, body_html, status,
			category, audience_summary, created_at, updated_at, scheduled_at, sent_at, deleted_at, hidden_at
	`, data.ID, data.BuildingID, data.AuthorUserID, data.Title, data.Body, data.BodyHTML, status, data.Category,
		audienceSummaryFor(normalizeTargets(data.Targets)), data.ScheduledAt, sentAt).Scan(
		&item.ID, &item.BuildingID, &item.AuthorUserID, &item.Title, &item.Body, &item.BodyHTML,
		&item.Status, &category, &audienceSummary, &item.CreatedAt, &item.UpdatedAt, &scheduledAt, &sentAtScan, &deletedAt, &hiddenAt,
	)
	if err != nil {
		return model.Notification{}, err
	}
	item.Category = nullStringPtr(category)
	item.AudienceSummary = nullStringPtr(audienceSummary)
	item.ScheduledAt = nullTimePtr(scheduledAt)
	item.SentAt = nullTimePtr(sentAtScan)
	item.DeletedAt = nullTimePtr(deletedAt)
	item.HiddenAt = nullTimePtr(hiddenAt)
	item.ReadAt = nullTimePtr(readAt)
	targets := normalizeTargets(data.Targets)
	channels := normalizeNotificationChannels(data.Channels)
	if err := replaceNotificationTargets(ctx, tx, item.ID, targets); err != nil {
		return model.Notification{}, fmt.Errorf("replace notification targets: %w", err)
	}
	if err := replaceNotificationChannels(ctx, tx, item.ID, channels); err != nil {
		return model.Notification{}, fmt.Errorf("replace notification channels: %w", err)
	}
	if status == "sent" || status == "sending" {
		if err := createNotificationDeliveries(ctx, tx, item.ID, data.BuildingID, targets, channels); err != nil {
			return model.Notification{}, fmt.Errorf("create notification deliveries: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return model.Notification{}, fmt.Errorf("commit notification: %w", err)
	}
	item.Targets = targets
	item.Channels = channels
	item.Deliveries, err = r.ListDeliveriesForNotification(ctx, item.ID)
	if err != nil {
		return model.Notification{}, fmt.Errorf("load notification deliveries: %w", err)
	}
	return item, nil
}

func (r *Repository) GetNotification(ctx context.Context, id string, userID string) (model.Notification, error) {
	rows, err := r.db.Query(ctx, `
		SELECT n.id, n.building_id, n.author_user_id, n.title, n.body, n.body_html,
			n.status, n.category, n.audience_summary, n.created_at, n.updated_at,
			n.scheduled_at, n.sent_at, n.deleted_at, n.hidden_at, rr.read_at
		FROM communication_notifications n
		LEFT JOIN communication_read_receipts rr
			ON rr.entity_type = 'notification'
			AND rr.entity_id = n.id
			AND rr.user_id = $2
		WHERE n.id = $1
	`, id, userID)
	if err != nil {
		return model.Notification{}, err
	}
	defer rows.Close()
	if !rows.Next() {
		return model.Notification{}, sql.ErrNoRows
	}
	item, err := scanNotification(rows)
	if err != nil {
		return model.Notification{}, err
	}
	items, err := r.attachNotificationRelations(ctx, []model.Notification{item})
	if err != nil {
		return model.Notification{}, err
	}
	items, err = r.attachNotificationDeliveries(ctx, items)
	if err != nil {
		return model.Notification{}, err
	}
	return items[0], nil
}

func (r *Repository) GetNotificationForUser(ctx context.Context, id string, userID string) (model.Notification, error) {
	rows, err := r.db.Query(ctx, `
		SELECT n.id, n.building_id, n.author_user_id, n.title, n.body, n.body_html,
			n.status, n.category, n.audience_summary, n.created_at, n.updated_at,
			n.scheduled_at, n.sent_at, n.deleted_at, n.hidden_at, rr.read_at
		FROM communication_notifications n
		LEFT JOIN communication_read_receipts rr
			ON rr.entity_type = 'notification'
			AND rr.entity_id = n.id
			AND rr.user_id = $2
		WHERE n.id = $1
			AND `+audience.VisibleNotificationPredicate("n")+`
			AND EXISTS (
				SELECT 1
				FROM communication_notification_targets t
				WHERE t.notification_id = n.id
					AND `+audience.CommunicationTargetPredicate("t", "n.building_id", "$2")+`
			)
	`, id, userID)
	if err != nil {
		return model.Notification{}, err
	}
	defer rows.Close()
	if !rows.Next() {
		return model.Notification{}, sql.ErrNoRows
	}
	item, err := scanNotification(rows)
	if err != nil {
		return model.Notification{}, err
	}
	items, err := r.attachNotificationRelations(ctx, []model.Notification{item})
	if err != nil {
		return model.Notification{}, err
	}
	items, err = r.attachNotificationDeliveries(ctx, items)
	if err != nil {
		return model.Notification{}, err
	}
	return items[0], nil
}

func (r *Repository) SetNotificationStatus(ctx context.Context, id string, status string, scheduledAt *time.Time) (model.Notification, error) {
	var sentExpr string
	if status == "sent" || status == "sending" {
		sentExpr = ", sent_at = COALESCE(sent_at, now())"
	}
	_, err := r.db.Exec(ctx, `
		UPDATE communication_notifications
		SET status = $2,
			scheduled_at = $3,
			deleted_at = CASE WHEN $2 = 'deleted' THEN COALESCE(deleted_at, now()) ELSE NULL END,
			hidden_at = CASE WHEN $2 = 'hidden' THEN COALESCE(hidden_at, now()) ELSE NULL END,
			updated_at = now()
			`+sentExpr+`
		WHERE id = $1
	`, id, status, scheduledAt)
	if err != nil {
		return model.Notification{}, err
	}
	return r.GetNotification(ctx, id, "")
}

func (r *Repository) PermanentDeleteNotification(ctx context.Context, id string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `DELETE FROM communication_deliveries WHERE entity_type = 'notification' AND entity_id = $1`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM communication_read_receipts WHERE entity_type = 'notification' AND entity_id = $1`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM communication_notifications WHERE id = $1`, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *Repository) MarkNotificationRead(ctx context.Context, id string, userID string) error {
	now := time.Now()
	var entityID string
	err := r.db.QueryRow(ctx, `
		INSERT INTO communication_read_receipts (id, entity_type, entity_id, user_id, read_at)
		SELECT $1, 'notification', n.id, $2, $4
		FROM communication_notifications n
		WHERE n.id = $3
			AND `+audience.VisibleNotificationPredicate("n")+`
			AND EXISTS (
				SELECT 1
				FROM communication_notification_targets t
				WHERE t.notification_id = n.id
					AND `+audience.CommunicationTargetPredicate("t", "n.building_id", "$2")+`
			)
		ON CONFLICT (entity_type, entity_id, user_id) DO UPDATE SET read_at = communication_read_receipts.read_at
		RETURNING entity_id
	`, fmt.Sprintf("read-notification-%s-%s", id, userID), userID, id, now).Scan(&entityID)
	if err == pgx.ErrNoRows {
		return sql.ErrNoRows
	}
	if err != nil {
		return err
	}
	_, err = r.db.Exec(ctx, `
		UPDATE communication_deliveries
		SET status = 'read',
			read_at = COALESCE(read_at, $3),
			updated_at = $3
		WHERE entity_type = 'notification'
			AND entity_id = $1
			AND user_id = $2
			AND channel = 'portal'
			AND status <> 'read'
	`, entityID, userID, now)
	return err
}

func (r *Repository) ListDeliveries(ctx context.Context) ([]model.Delivery, error) {
	return r.listDeliveries(ctx, "", nil)
}

func (r *Repository) ListDeliveriesForNotification(ctx context.Context, id string) ([]model.Delivery, error) {
	return r.listDeliveries(ctx, "WHERE d.entity_type = 'notification' AND d.entity_id = $1", id)
}

func (r *Repository) listDeliveries(ctx context.Context, where string, arg any) ([]model.Delivery, error) {
	args := []any{}
	if arg != nil {
		args = append(args, arg)
	}
	rows, err := r.db.Query(ctx, `
		SELECT
			d.id,
			d.entity_type,
			d.entity_id,
			CASE
				WHEN d.entity_type = 'post' THEN COALESCE(p.title, '')
				ELSE COALESCE(n.title, '')
			END AS entity_title,
			d.user_id,
			COALESCE(u.full_name, u.email) AS recipient,
			COALESCE(props.property_label, '') AS property_label,
			d.channel,
			d.status,
			d.sent_at,
			d.delivered_at,
			d.read_at,
			d.error_message,
			d.created_at,
			d.updated_at
		FROM communication_deliveries d
		LEFT JOIN communication_posts p ON d.entity_type = 'post' AND p.id = d.entity_id
		LEFT JOIN communication_notifications n ON d.entity_type = 'notification' AND n.id = d.entity_id
		JOIN users u ON u.id = d.user_id
		LEFT JOIN LATERAL (
			SELECT string_agg(pr.number, ', ' ORDER BY pr.number) AS property_label
			FROM property_owners po
			JOIN property pr ON pr.id = po.property_id
			WHERE po.user_id = u.id
				AND po.status = 'active'
		) props ON true
		`+where+`
		ORDER BY d.created_at DESC
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []model.Delivery{}
	for rows.Next() {
		var item model.Delivery
		var sentAt, deliveredAt, readAt sql.NullTime
		var errorMessage sql.NullString
		if err := rows.Scan(
			&item.ID, &item.EntityType, &item.EntityID, &item.EntityTitle,
			&item.UserID, &item.Recipient, &item.PropertyLabel, &item.Channel, &item.Status,
			&sentAt, &deliveredAt, &readAt, &errorMessage, &item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		item.SentAt = nullTimePtr(sentAt)
		item.DeliveredAt = nullTimePtr(deliveredAt)
		item.ReadAt = nullTimePtr(readAt)
		item.ErrorMessage = nullStringPtr(errorMessage)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) UnreadCounts(ctx context.Context, userID string) (map[string]int, error) {
	counts := map[string]int{"news": 0, "announcement": 0, "notification": 0}
	rows, err := r.db.Query(ctx, `
		SELECT key, COUNT(*)::int
		FROM (
			SELECT n.id::text, 'news' AS key
			FROM infocenter_news n
			WHERE `+audience.PublishedNewsPredicate("n")+`
				AND NOT EXISTS (
					SELECT 1
					FROM infocenter_news_reads nr
					WHERE nr.news_id = n.id AND nr.user_id = $1
				)
				AND `+audience.InfocenterItemPredicate("n", "$1")+`
			UNION ALL
			SELECT a.id::text, 'announcement' AS key
			FROM infocenter_announcements a
			WHERE `+audience.PublishedAnnouncementPredicate("a")+`
				AND NOT EXISTS (
					SELECT 1
					FROM infocenter_announcement_reads ar
					WHERE ar.announcement_id = a.id AND ar.user_id = $1
				)
				AND `+audience.InfocenterItemPredicate("a", "$1")+`
			UNION ALL
			SELECT n.id, 'notification' AS key
			FROM communication_notifications n
			WHERE `+audience.VisibleNotificationPredicate("n")+`
				AND NOT EXISTS (
					SELECT 1 FROM communication_read_receipts rr
					WHERE rr.entity_type = 'notification' AND rr.entity_id = n.id AND rr.user_id = $1
				)
				AND EXISTS (
					SELECT 1
					FROM communication_notification_targets t
					WHERE t.notification_id = n.id
						AND `+audience.CommunicationTargetPredicate("t", "n.building_id", "$1")+`
				)
		) unread
		GROUP BY key
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var count int
		if err := rows.Scan(&key, &count); err != nil {
			return nil, err
		}
		counts[key] = count
	}
	return counts, rows.Err()
}

func (r *Repository) getPostByID(ctx context.Context, id string, userID string) (model.Post, error) {
	rows, err := r.db.Query(ctx, `
		SELECT p.id, p.building_id, p.author_user_id, p.type, p.title, p.body, p.image_url,
			p.status, p.importance, p.is_pinned, p.publish_at, p.visible_from, p.visible_until,
			p.created_at, p.updated_at, p.deleted_at, rr.read_at
		FROM communication_posts p
		LEFT JOIN communication_read_receipts rr
			ON rr.entity_type = 'post'
			AND rr.entity_id = p.id
			AND rr.user_id = $2
		WHERE p.id = $1
	`, id, userID)
	if err != nil {
		return model.Post{}, err
	}
	defer rows.Close()
	if !rows.Next() {
		return model.Post{}, sql.ErrNoRows
	}
	post, err := scanPost(rows)
	if err != nil {
		return model.Post{}, err
	}
	posts, err := r.attachPostRelations(ctx, []model.Post{post})
	if err != nil {
		return model.Post{}, err
	}
	return posts[0], nil
}

func (r *Repository) markRead(ctx context.Context, entityType string, entityID string, userID string) error {
	now := time.Now()
	_, err := r.db.Exec(ctx, `
		INSERT INTO communication_read_receipts (id, entity_type, entity_id, user_id, read_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (entity_type, entity_id, user_id) DO UPDATE SET read_at = EXCLUDED.read_at
	`, fmt.Sprintf("read-%s-%s-%s", entityType, entityID, userID), entityType, entityID, userID, now)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(ctx, `
		UPDATE communication_deliveries
		SET status = 'read', read_at = $4, updated_at = $4
		WHERE entity_type = $1
			AND entity_id = $2
			AND user_id = $3
			AND channel = 'portal'
	`, entityType, entityID, userID, now)
	return err
}

func (r *Repository) attachPostRelations(ctx context.Context, posts []model.Post) ([]model.Post, error) {
	for index := range posts {
		targets, err := r.postTargets(ctx, posts[index].ID)
		if err != nil {
			return nil, err
		}
		channels, err := r.postChannels(ctx, posts[index].ID)
		if err != nil {
			return nil, err
		}
		posts[index].Targets = targets
		posts[index].Channels = channels
	}
	return posts, nil
}

func (r *Repository) attachNotificationRelations(ctx context.Context, items []model.Notification) ([]model.Notification, error) {
	for index := range items {
		targets, err := r.notificationTargets(ctx, items[index].ID)
		if err != nil {
			return nil, err
		}
		channels, err := r.notificationChannels(ctx, items[index].ID)
		if err != nil {
			return nil, err
		}
		items[index].Targets = targets
		items[index].Channels = channels
	}
	return items, nil
}

func (r *Repository) attachNotificationDeliveries(ctx context.Context, items []model.Notification) ([]model.Notification, error) {
	for index := range items {
		deliveries, err := r.ListDeliveriesForNotification(ctx, items[index].ID)
		if err != nil {
			return nil, err
		}
		items[index].Deliveries = deliveries
	}
	return items, nil
}

func (r *Repository) postTargets(ctx context.Context, postID string) ([]model.Target, error) {
	rows, err := r.db.Query(ctx, `SELECT target_type, COALESCE(target_value, '') FROM communication_post_targets WHERE post_id = $1 ORDER BY target_type, target_value`, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTargets(rows)
}

func (r *Repository) postChannels(ctx context.Context, postID string) ([]model.Channel, error) {
	rows, err := r.db.Query(ctx, `SELECT channel, enabled FROM communication_channels WHERE post_id = $1 ORDER BY channel`, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanChannels(rows)
}

func (r *Repository) notificationTargets(ctx context.Context, id string) ([]model.Target, error) {
	rows, err := r.db.Query(ctx, `SELECT target_type, COALESCE(target_value, '') FROM communication_notification_targets WHERE notification_id = $1 ORDER BY target_type, target_value`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTargets(rows)
}

func (r *Repository) notificationChannels(ctx context.Context, id string) ([]model.Channel, error) {
	rows, err := r.db.Query(ctx, `SELECT channel, enabled FROM communication_channels WHERE notification_id = $1 ORDER BY channel`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanChannels(rows)
}

func replacePostTargets(ctx context.Context, tx pgx.Tx, postID string, targets []model.Target) error {
	if _, err := tx.Exec(ctx, `DELETE FROM communication_post_targets WHERE post_id = $1`, postID); err != nil {
		return err
	}
	for index, target := range targets {
		if _, err := tx.Exec(ctx, `
			INSERT INTO communication_post_targets (id, post_id, target_type, target_value)
			VALUES ($1::text, $2::text, $3::text, NULLIF($4::text, ''))
		`, fmt.Sprintf("%s-target-%d", postID, index), postID, target.Type, target.Value); err != nil {
			return err
		}
	}
	return nil
}

func replaceNotificationTargets(ctx context.Context, tx pgx.Tx, id string, targets []model.Target) error {
	if _, err := tx.Exec(ctx, `DELETE FROM communication_notification_targets WHERE notification_id = $1`, id); err != nil {
		return err
	}
	for index, target := range targets {
		if _, err := tx.Exec(ctx, `
			INSERT INTO communication_notification_targets (id, notification_id, target_type, target_value)
			VALUES ($1::text, $2::text, $3::text, NULLIF($4::text, ''))
		`, fmt.Sprintf("%s-target-%d", id, index), id, target.Type, target.Value); err != nil {
			return err
		}
	}
	return nil
}

func replacePostChannels(ctx context.Context, tx pgx.Tx, postID string, channels []model.Channel) error {
	if _, err := tx.Exec(ctx, `DELETE FROM communication_channels WHERE post_id = $1`, postID); err != nil {
		return err
	}
	for _, channel := range channels {
		if _, err := tx.Exec(ctx, `
			INSERT INTO communication_channels (id, post_id, channel, enabled)
			VALUES ($1::text, $2::text, $3::text, $4::boolean)
		`, fmt.Sprintf("%s-channel-%s", postID, channel.Channel), postID, channel.Channel, channel.Enabled); err != nil {
			return err
		}
	}
	return nil
}

func replaceNotificationChannels(ctx context.Context, tx pgx.Tx, id string, channels []model.Channel) error {
	if _, err := tx.Exec(ctx, `DELETE FROM communication_channels WHERE notification_id = $1`, id); err != nil {
		return err
	}
	for _, channel := range channels {
		if _, err := tx.Exec(ctx, `
			INSERT INTO communication_channels (id, notification_id, channel, enabled)
			VALUES ($1::text, $2::text, $3::text, $4::boolean)
		`, fmt.Sprintf("%s-channel-%s", id, channel.Channel), id, channel.Channel, channel.Enabled); err != nil {
			return err
		}
	}
	return nil
}

func createPostDeliveries(ctx context.Context, tx pgx.Tx, postID string, buildingID string, targets []model.Target, channels []model.Channel) error {
	users, err := selectTargetUsers(ctx, tx, buildingID, targets)
	if err != nil {
		return err
	}
	for _, userID := range users {
		for _, channel := range channels {
			status, errorMessage := initialDeliveryStatus(channel.Channel)
			if _, err := tx.Exec(ctx, `
				INSERT INTO communication_deliveries (
					id, entity_type, entity_id, user_id, channel, status, sent_at, delivered_at, error_message
				) VALUES ($1::text, 'post', $2::text, $3::text, $4::text, $5::text, CASE WHEN $5::text = 'delivered' THEN now() ELSE NULL END, CASE WHEN $5::text = 'delivered' THEN now() ELSE NULL END, $6)
				ON CONFLICT (entity_type, entity_id, user_id, channel) DO UPDATE SET
					status = EXCLUDED.status,
					sent_at = EXCLUDED.sent_at,
					delivered_at = EXCLUDED.delivered_at,
					error_message = EXCLUDED.error_message,
					updated_at = now()
			`, fmt.Sprintf("delivery-post-%s-%s-%s", postID, userID, channel.Channel), postID, userID, channel.Channel, status, errorMessage); err != nil {
				return err
			}
		}
	}
	return nil
}

func createNotificationDeliveries(ctx context.Context, tx pgx.Tx, id string, buildingID string, targets []model.Target, channels []model.Channel) error {
	users, err := selectTargetUsers(ctx, tx, buildingID, targets)
	if err != nil {
		return err
	}
	for _, userID := range users {
		for _, channel := range channels {
			status, errorMessage := initialDeliveryStatus(channel.Channel)
			if _, err := tx.Exec(ctx, `
				INSERT INTO communication_deliveries (
					id, entity_type, entity_id, user_id, channel, status, sent_at, delivered_at, error_message
				) VALUES ($1::text, 'notification', $2::text, $3::text, $4::text, $5::text, CASE WHEN $5::text = 'delivered' THEN now() ELSE NULL END, CASE WHEN $5::text = 'delivered' THEN now() ELSE NULL END, $6)
				ON CONFLICT (entity_type, entity_id, user_id, channel) DO UPDATE SET
					status = EXCLUDED.status,
					sent_at = EXCLUDED.sent_at,
					delivered_at = EXCLUDED.delivered_at,
					error_message = EXCLUDED.error_message,
					updated_at = now()
			`, fmt.Sprintf("delivery-notification-%s-%s-%s", id, userID, channel.Channel), id, userID, channel.Channel, status, errorMessage); err != nil {
				return err
			}
		}
	}
	return nil
}

func selectTargetUsers(ctx context.Context, tx pgx.Tx, buildingID string, targets []model.Target) ([]string, error) {
	where := []string{}
	args := []any{buildingID}
	for _, target := range normalizeTargets(targets) {
		switch target.Type {
		case "all":
			where = append(where, `EXISTS (
				SELECT 1 FROM property_owners po2
				JOIN property p2 ON p2.id = po2.property_id
				WHERE po2.user_id = u.id
					AND po2.status = 'active'
					AND p2.building_id = $1
			)`)
		case "user":
			args = append(args, target.Value)
			where = append(where, fmt.Sprintf("u.id = $%d", len(args)))
		case "role":
			args = append(args, target.Value)
			where = append(where, fmt.Sprintf(`EXISTS (
				SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
				WHERE ur.user_id = u.id AND r.code = $%d
			)`, len(args)))
		case "property_type":
			args = append(args, target.Value)
			where = append(where, fmt.Sprintf(`EXISTS (
				SELECT 1 FROM property_owners po2
				JOIN property p2 ON p2.id = po2.property_id
				WHERE po2.user_id = u.id
					AND po2.status = 'active'
					AND p2.building_id = $1
					AND p2.type = $%d
			)`, len(args)))
		}
	}
	rows, err := tx.Query(ctx, `
		SELECT DISTINCT u.id
		FROM users u
		WHERE $1::text IS NOT NULL
			AND (`+strings.Join(where, " OR ")+`)
		ORDER BY u.id
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		users = append(users, id)
	}
	return users, rows.Err()
}

func scanPost(rows pgx.Rows) (model.Post, error) {
	var post model.Post
	var imageURL sql.NullString
	var publishAt, visibleFrom, visibleUntil, deletedAt, readAt sql.NullTime
	err := rows.Scan(
		&post.ID, &post.BuildingID, &post.AuthorUserID, &post.Type, &post.Title, &post.Body,
		&imageURL, &post.Status, &post.Importance, &post.IsPinned, &publishAt, &visibleFrom,
		&visibleUntil, &post.CreatedAt, &post.UpdatedAt, &deletedAt, &readAt,
	)
	post.ImageURL = nullStringPtr(imageURL)
	post.PublishAt = nullTimePtr(publishAt)
	post.VisibleFrom = nullTimePtr(visibleFrom)
	post.VisibleUntil = nullTimePtr(visibleUntil)
	post.DeletedAt = nullTimePtr(deletedAt)
	post.ReadAt = nullTimePtr(readAt)
	return post, err
}

func scanNotification(rows pgx.Rows) (model.Notification, error) {
	var item model.Notification
	var category, audienceSummary sql.NullString
	var scheduledAt, sentAt, deletedAt, hiddenAt, readAt sql.NullTime
	err := rows.Scan(
		&item.ID, &item.BuildingID, &item.AuthorUserID, &item.Title, &item.Body, &item.BodyHTML,
		&item.Status, &category, &audienceSummary, &item.CreatedAt, &item.UpdatedAt,
		&scheduledAt, &sentAt, &deletedAt, &hiddenAt, &readAt,
	)
	item.Category = nullStringPtr(category)
	item.AudienceSummary = nullStringPtr(audienceSummary)
	item.ScheduledAt = nullTimePtr(scheduledAt)
	item.SentAt = nullTimePtr(sentAt)
	item.DeletedAt = nullTimePtr(deletedAt)
	item.HiddenAt = nullTimePtr(hiddenAt)
	item.ReadAt = nullTimePtr(readAt)
	return item, err
}

func scanTargets(rows pgx.Rows) ([]model.Target, error) {
	items := []model.Target{}
	for rows.Next() {
		var item model.Target
		if err := rows.Scan(&item.Type, &item.Value); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func scanChannels(rows pgx.Rows) ([]model.Channel, error) {
	items := []model.Channel{}
	for rows.Next() {
		var item model.Channel
		if err := rows.Scan(&item.Channel, &item.Enabled); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func normalizeTargets(targets []model.Target) []model.Target {
	result := []model.Target{}
	for _, target := range targets {
		target.Type = strings.TrimSpace(target.Type)
		target.Value = strings.TrimSpace(target.Value)
		if target.Type == "" {
			continue
		}
		if target.Type == "all" {
			return []model.Target{{Type: "all"}}
		}
		result = append(result, target)
	}
	if len(result) == 0 {
		return []model.Target{{Type: "all"}}
	}
	return result
}

func normalizePostChannels(channels []model.Channel) []model.Channel {
	return normalizeChannels(channels, []string{"portal", "whatsapp", "telegram"})
}

func normalizeNotificationChannels(channels []model.Channel) []model.Channel {
	return normalizeChannels(channels, []string{"portal", "whatsapp", "sms"})
}

func normalizeNotificationStatus(value string, scheduledAt *time.Time) string {
	value = strings.TrimSpace(value)
	switch value {
	case "draft", "scheduled", "sending", "sent", "hidden", "completed", "deleted":
		return value
	default:
		if scheduledAt != nil && scheduledAt.After(time.Now()) {
			return "scheduled"
		}
		return "sent"
	}
}

func audienceSummaryFor(targets []model.Target) string {
	targets = normalizeTargets(targets)
	has := func(targetType string, value string) bool {
		for _, target := range targets {
			if target.Type == targetType && target.Value == value {
				return true
			}
		}
		return false
	}
	if has("all", "") {
		return "Все собственники"
	}
	if has("property_type", "apartment") && has("property_type", "commercial_room") {
		return "Квартиры и нежилые помещения"
	}
	if has("property_type", "storage") && has("property_type", "parking") {
		return "Кладовые и паркоместа"
	}
	if has("role", "COUNCIL_MEMBER") {
		return "Только члены совета дома"
	}
	if len(targets) > 0 {
		onlyUsers := true
		for _, target := range targets {
			if target.Type != "user" {
				onlyUsers = false
				break
			}
		}
		if onlyUsers {
			return "Отдельные собственники"
		}
	}
	labels := []string{}
	for _, target := range targets {
		switch target.Type {
		case "all":
			labels = append(labels, "Все собственники")
		case "role":
			labels = append(labels, target.Value)
		case "property_type":
			labels = append(labels, target.Value)
		case "user":
			labels = append(labels, target.Value)
		}
	}
	if len(labels) == 0 {
		return "Все собственники"
	}
	return strings.Join(labels, ", ")
}

func normalizeChannels(channels []model.Channel, allowed []string) []model.Channel {
	allowedSet := map[string]bool{}
	for _, channel := range allowed {
		allowedSet[channel] = true
	}
	result := []model.Channel{}
	seen := map[string]bool{}
	for _, channel := range channels {
		name := strings.TrimSpace(channel.Channel)
		if !allowedSet[name] || seen[name] || !channel.Enabled {
			continue
		}
		seen[name] = true
		result = append(result, model.Channel{Channel: name, Enabled: true})
	}
	if len(result) == 0 && allowedSet["portal"] {
		result = append(result, model.Channel{Channel: "portal", Enabled: true})
	}
	return result
}

func initialDeliveryStatus(channel string) (string, *string) {
	if channel == "portal" {
		return "delivered", nil
	}
	msg := "канал не подключён"
	return "channel_not_connected", &msg
}

func hasRole(roles []string, role string) bool {
	for _, item := range roles {
		if strings.TrimSpace(item) == role {
			return true
		}
	}
	return false
}

func nullStringPtr(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func nullTimePtr(value sql.NullTime) *time.Time {
	if !value.Valid {
		return nil
	}
	return &value.Time
}
