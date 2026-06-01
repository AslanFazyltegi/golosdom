package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"golosdom-backend/internal/communications/model"

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
	Targets      []model.Target
	Channels     []model.Channel
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
		where = append(where, fmt.Sprintf(`p.status = 'published'
			AND p.deleted_at IS NULL
			AND (p.visible_from IS NULL OR p.visible_from <= now())
			AND (p.visible_until IS NULL OR p.visible_until >= now())
			AND EXISTS (
				SELECT 1
				FROM communication_post_targets t
				WHERE t.post_id = p.id
					AND (
						t.target_type = 'all'
						OR (t.target_type = 'user' AND t.target_value = $%d)
						OR (t.target_type = 'role' AND EXISTS (
							SELECT 1
							FROM user_roles ur
							JOIN roles r ON r.id = ur.role_id
							WHERE ur.user_id = $%d AND r.code = t.target_value
						))
						OR (t.target_type = 'property_type' AND EXISTS (
							SELECT 1
							FROM property_owners po
							JOIN property pr ON pr.id = po.property_id
							WHERE po.user_id = $%d
								AND po.status = 'active'
								AND pr.building_id = p.building_id
								AND pr.type = t.target_value
						))
					)
			)`, len(args), len(args), len(args)))
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

func (r *Repository) ListNotifications(ctx context.Context, userID string, roles []string) ([]model.Notification, error) {
	args := []any{}
	where := []string{}
	if hasRole(roles, "CHAIRMAN") {
		where = append(where, "n.status <> 'deleted'")
	} else {
		args = append(args, userID)
		where = append(where, fmt.Sprintf(`n.status = 'sent'
			AND EXISTS (
				SELECT 1
				FROM communication_notification_targets t
				WHERE t.notification_id = n.id
					AND (
						t.target_type = 'all'
						OR (t.target_type = 'user' AND t.target_value = $%d)
						OR (t.target_type = 'role' AND EXISTS (
							SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
							WHERE ur.user_id = $%d AND r.code = t.target_value
						))
						OR (t.target_type = 'property_type' AND EXISTS (
							SELECT 1 FROM property_owners po
							JOIN property pr ON pr.id = po.property_id
							WHERE po.user_id = $%d
								AND po.status = 'active'
								AND pr.building_id = n.building_id
								AND pr.type = t.target_value
						))
					)
			)`, len(args), len(args), len(args)))
	}

	rows, err := r.db.Query(ctx, `
		SELECT n.id, n.building_id, n.author_user_id, n.title, n.body,
			n.status, n.created_at, n.sent_at, rr.read_at
		FROM communication_notifications n
		LEFT JOIN communication_read_receipts rr
			ON rr.entity_type = 'notification'
			AND rr.entity_id = n.id
			AND rr.user_id = $`+fmt.Sprint(len(args)+1)+`
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY COALESCE(n.sent_at, n.created_at) DESC
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
	return r.attachNotificationRelations(ctx, items)
}

func (r *Repository) SaveNotification(ctx context.Context, data SaveNotificationData) (model.Notification, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return model.Notification{}, err
	}
	defer tx.Rollback(ctx)

	var item model.Notification
	var sentAt, readAt sql.NullTime
	err = tx.QueryRow(ctx, `
		INSERT INTO communication_notifications (
			id, building_id, author_user_id, title, body, status, sent_at
		) VALUES ($1, $2, $3, $4, $5, 'sent', now())
		RETURNING id, building_id, author_user_id, title, body, status, created_at, sent_at
	`, data.ID, data.BuildingID, data.AuthorUserID, data.Title, data.Body).Scan(
		&item.ID, &item.BuildingID, &item.AuthorUserID, &item.Title, &item.Body,
		&item.Status, &item.CreatedAt, &sentAt,
	)
	if err != nil {
		return model.Notification{}, err
	}
	item.SentAt = nullTimePtr(sentAt)
	item.ReadAt = nullTimePtr(readAt)
	targets := normalizeTargets(data.Targets)
	channels := normalizeNotificationChannels(data.Channels)
	if err := replaceNotificationTargets(ctx, tx, item.ID, targets); err != nil {
		return model.Notification{}, err
	}
	if err := replaceNotificationChannels(ctx, tx, item.ID, channels); err != nil {
		return model.Notification{}, err
	}
	if err := createNotificationDeliveries(ctx, tx, item.ID, data.BuildingID, targets, channels); err != nil {
		return model.Notification{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return model.Notification{}, err
	}
	item.Targets = targets
	item.Channels = channels
	return item, nil
}

func (r *Repository) MarkNotificationRead(ctx context.Context, id string, userID string) error {
	return r.markRead(ctx, "notification", id, userID)
}

func (r *Repository) ListDeliveries(ctx context.Context) ([]model.Delivery, error) {
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
		ORDER BY d.created_at DESC
	`)
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
			&item.UserID, &item.Recipient, &item.Channel, &item.Status,
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
			SELECT p.id, p.type AS key
			FROM communication_posts p
			WHERE p.status = 'published'
				AND p.deleted_at IS NULL
				AND (p.visible_from IS NULL OR p.visible_from <= now())
				AND (p.visible_until IS NULL OR p.visible_until >= now())
				AND NOT EXISTS (
					SELECT 1 FROM communication_read_receipts rr
					WHERE rr.entity_type = 'post' AND rr.entity_id = p.id AND rr.user_id = $1
				)
				AND EXISTS (
					SELECT 1
					FROM communication_post_targets t
					WHERE t.post_id = p.id
						AND (
							t.target_type = 'all'
							OR (t.target_type = 'user' AND t.target_value = $1)
							OR (t.target_type = 'role' AND EXISTS (
								SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
								WHERE ur.user_id = $1 AND r.code = t.target_value
							))
							OR (t.target_type = 'property_type' AND EXISTS (
								SELECT 1 FROM property_owners po
								JOIN property pr ON pr.id = po.property_id
								WHERE po.user_id = $1
									AND po.status = 'active'
									AND pr.building_id = p.building_id
									AND pr.type = t.target_value
							))
						)
				)
			UNION ALL
			SELECT n.id, 'notification' AS key
			FROM communication_notifications n
			WHERE n.status = 'sent'
				AND NOT EXISTS (
					SELECT 1 FROM communication_read_receipts rr
					WHERE rr.entity_type = 'notification' AND rr.entity_id = n.id AND rr.user_id = $1
				)
				AND EXISTS (
					SELECT 1
					FROM communication_notification_targets t
					WHERE t.notification_id = n.id
						AND (
							t.target_type = 'all'
							OR (t.target_type = 'user' AND t.target_value = $1)
							OR (t.target_type = 'role' AND EXISTS (
								SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
								WHERE ur.user_id = $1 AND r.code = t.target_value
							))
							OR (t.target_type = 'property_type' AND EXISTS (
								SELECT 1 FROM property_owners po
								JOIN property pr ON pr.id = po.property_id
								WHERE po.user_id = $1
									AND po.status = 'active'
									AND pr.building_id = n.building_id
									AND pr.type = t.target_value
							))
						)
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
			VALUES ($1, $2, $3, NULLIF($4, ''))
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
			VALUES ($1, $2, $3, NULLIF($4, ''))
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
			VALUES ($1, $2, $3, $4)
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
			VALUES ($1, $2, $3, $4)
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
				) VALUES ($1, 'post', $2, $3, $4, $5, CASE WHEN $5 = 'delivered' THEN now() ELSE NULL END, CASE WHEN $5 = 'delivered' THEN now() ELSE NULL END, $6)
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
				) VALUES ($1, 'notification', $2, $3, $4, $5, CASE WHEN $5 = 'delivered' THEN now() ELSE NULL END, CASE WHEN $5 = 'delivered' THEN now() ELSE NULL END, $6)
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
			where = append(where, "true")
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
		JOIN property_owners po ON po.user_id = u.id AND po.status = 'active'
		JOIN property p ON p.id = po.property_id AND p.building_id = $1
		WHERE `+strings.Join(where, " OR ")+`
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
	var sentAt, readAt sql.NullTime
	err := rows.Scan(
		&item.ID, &item.BuildingID, &item.AuthorUserID, &item.Title, &item.Body,
		&item.Status, &item.CreatedAt, &sentAt, &readAt,
	)
	item.SentAt = nullTimePtr(sentAt)
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
