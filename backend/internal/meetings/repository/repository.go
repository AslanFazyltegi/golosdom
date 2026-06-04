package repository

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"golosdom-backend/internal/common/datetime"
	"golosdom-backend/internal/meetings/model"
)

type Repository struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

type PublicationData struct {
	DeduplicationKey string
	NotificationHTML string
}

func (r *Repository) Create(ctx context.Context, meeting model.Meeting, publication PublicationData) (*model.Meeting, error) {
	agendaJSON, err := json.Marshal(meeting.Agenda)
	if err != nil {
		return nil, err
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	query := `
		insert into meetings (
			building_id,
			initiator_name,
			scheduled_at,
			location,
			agenda,
			meeting_form,
			created_by,
			deduplication_key
		)
		values ($1, $2, $3, $4, $5, $6, $7, $8)
		on conflict (deduplication_key) where deduplication_key is not null do nothing
		returning
			id::text,
			coalesce(building_id, '')::text,
			initiator_name,
			scheduled_at,
			location,
			agenda,
			meeting_form,
			created_by,
			created_at,
			notification_id,
			announcement_id::text
	`

	created, inserted, err := scanMeetingRow(tx.QueryRow(
		ctx,
		query,
		meeting.BuildingID,
		meeting.InitiatorName,
		meeting.ScheduledAt,
		meeting.Location,
		agendaJSON,
		meeting.MeetingForm,
		meeting.CreatedBy,
		publication.DeduplicationKey,
	), true)
	if err == pgx.ErrNoRows {
		created, inserted, err = r.getMeetingByDeduplicationKey(ctx, tx, publication.DeduplicationKey)
	}
	if err != nil {
		return nil, err
	}

	if inserted || created.NotificationID == nil || created.AnnouncementID == nil {
		if err := r.publishMeetingInfocenterItems(ctx, tx, created, publication.NotificationHTML); err != nil {
			return nil, err
		}
		created, err = r.getMeetingByID(ctx, tx, created.ID)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return created, nil
}

func (r *Repository) List(ctx context.Context, period string) ([]model.Meeting, error) {
	query := `
		select
			id::text,
			coalesce(building_id, '')::text,
			initiator_name,
			scheduled_at,
			location,
			agenda,
			meeting_form,
			created_by,
			created_at,
			notification_id,
			announcement_id::text
		from meetings
		where
			(
				$1 = ''
				or ($1 = 'active' and scheduled_at::date = current_date)
				or ($1 = 'upcoming' and scheduled_at::date > current_date)
				or ($1 = 'past' and scheduled_at::date < current_date)
			)
		order by
			case when $1 = 'past' then scheduled_at end desc,
			case when $1 <> 'past' then scheduled_at end asc
	`

	rows, err := r.db.Query(ctx, query, period)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	meetings := make([]model.Meeting, 0)

	for rows.Next() {
		meeting, err := scanMeeting(rows)
		if err != nil {
			return nil, err
		}

		meetings = append(meetings, meeting)
	}

	return meetings, rows.Err()
}

func (r *Repository) getMeetingByDeduplicationKey(ctx context.Context, tx pgx.Tx, key string) (*model.Meeting, bool, error) {
	return scanMeetingRow(tx.QueryRow(ctx, `
		select
			id::text,
			coalesce(building_id, '')::text,
			initiator_name,
			scheduled_at,
			location,
			agenda,
			meeting_form,
			created_by,
			created_at,
			notification_id,
			announcement_id::text
		from meetings
		where deduplication_key = $1
	`, key), false)
}

func (r *Repository) getMeetingByID(ctx context.Context, tx pgx.Tx, id string) (*model.Meeting, error) {
	meeting, _, err := scanMeetingRow(tx.QueryRow(ctx, `
		select
			id::text,
			coalesce(building_id, '')::text,
			initiator_name,
			scheduled_at,
			location,
			agenda,
			meeting_form,
			created_by,
			created_at,
			notification_id,
			announcement_id::text
		from meetings
		where id = $1::uuid
	`, id), false)
	return meeting, err
}

func (r *Repository) publishMeetingInfocenterItems(ctx context.Context, tx pgx.Tx, meeting *model.Meeting, notificationHTML string) error {
	notificationID := fmt.Sprintf("meeting-%s-notification", meeting.ID)
	announcementID := meeting.ID
	announcementHTML := strings.Replace(notificationHTML, "УВЕДОМЛЕНИЕ", "ОБЪЯВЛЕНИЕ", 1)
	plainBody := stripHTML(notificationHTML)
	pinnedUntil := endOfAstanaDay(meeting.ScheduledAt)
	audienceFilter, err := json.Marshal(map[string]string{"building_id": meeting.BuildingID})
	if err != nil {
		return err
	}
	bodyJSON, err := json.Marshal(map[string]string{
		"type": "meeting-confirmation-html",
		"html": announcementHTML,
	})
	if err != nil {
		return err
	}

	if err := r.insertMeetingNotification(ctx, tx, meeting, notificationID, notificationHTML, plainBody); err != nil {
		return err
	}
	if err := r.insertMeetingAnnouncement(ctx, tx, meeting, announcementID, announcementHTML, bodyJSON, audienceFilter, pinnedUntil); err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		update meetings
		set notification_id = $2::text,
			announcement_id = $3::uuid
		where id = $1::uuid
	`, meeting.ID, notificationID, announcementID)
	return err
}

func (r *Repository) insertMeetingNotification(ctx context.Context, tx pgx.Tx, meeting *model.Meeting, id string, html string, body string) error {
	command, err := tx.Exec(ctx, `
		insert into communication_notifications (
			id,
			building_id,
			author_user_id,
			title,
			body,
			body_html,
			status,
			category,
			audience_summary,
			sent_at,
			meeting_id
		) values (
			$1::text,
			$2::text,
			$3::text,
			'Уведомление о проведении общедомового собрания',
			$4::text,
			$5::text,
			'sent',
			'Собрание',
			'Все собственники',
			now(),
			$6::uuid
		)
		on conflict (id) do nothing
	`, id, meeting.BuildingID, meeting.CreatedBy, body, html, meeting.ID)
	if err != nil {
		return fmt.Errorf("create meeting notification: %w", err)
	}
	if command.RowsAffected() == 0 {
		return nil
	}

	if _, err := tx.Exec(ctx, `
		insert into communication_notification_targets (id, notification_id, target_type, target_value)
		values ($1::text, $2::text, 'all', null)
		on conflict (id) do nothing
	`, id+"-target-all", id); err != nil {
		return fmt.Errorf("create meeting notification target: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		insert into communication_channels (id, notification_id, channel, enabled)
		values ($1::text, $2::text, 'portal', true)
		on conflict (id) do nothing
	`, id+"-channel-portal", id); err != nil {
		return fmt.Errorf("create meeting notification channel: %w", err)
	}

	_, err = tx.Exec(ctx, `
		insert into communication_deliveries (
			id,
			entity_type,
			entity_id,
			user_id,
			channel,
			status,
			sent_at,
			delivered_at
		)
		select
			'delivery-notification-' || $2::text || '-' || po.user_id || '-portal',
			'notification',
			$2::text,
			po.user_id,
			'portal',
			'delivered',
			now(),
			now()
		from property_owners po
		join property p on p.id = po.property_id
		where po.status = 'active'
			and p.building_id = $1::text
		group by po.user_id
		on conflict (entity_type, entity_id, user_id, channel) do nothing
	`, meeting.BuildingID, id)
	if err != nil {
		return fmt.Errorf("create meeting notification deliveries: %w", err)
	}
	return nil
}

func (r *Repository) insertMeetingAnnouncement(ctx context.Context, tx pgx.Tx, meeting *model.Meeting, id string, html string, bodyJSON []byte, audienceFilter []byte, pinnedUntil time.Time) error {
	command, err := tx.Exec(ctx, `
		insert into infocenter_announcements (
			id,
			title,
			body_json,
			body_html,
			category,
			audience_type,
			audience_filter,
			status,
			is_visible,
			is_pinned,
			is_important,
			notify_enabled,
			published_at,
			actual_until,
			pinned_until,
			created_by,
			meeting_id
		) values (
			$1::uuid,
			'Объявление о проведении общедомового собрания',
			$2::jsonb,
			$3::text,
			'Собрание',
			'all_owners',
			$4::jsonb,
			'published',
			true,
			true,
			true,
			false,
			now(),
			null,
			$5::timestamptz,
			$6::text,
			$7::uuid
		)
		on conflict (id) do nothing
	`, id, bodyJSON, html, audienceFilter, pinnedUntil, meeting.CreatedBy, meeting.ID)
	if err != nil {
		return fmt.Errorf("create meeting announcement: %w", err)
	}
	if command.RowsAffected() == 0 {
		return nil
	}

	_, err = tx.Exec(ctx, `
		insert into infocenter_announcement_history (id, announcement_id, action, actor_id)
		values ($1::uuid, $2::uuid, 'published', $3::text)
	`, newID(), id, meeting.CreatedBy)
	if err != nil {
		return fmt.Errorf("create meeting announcement history: %w", err)
	}
	return nil
}

func scanMeetingRow(row pgx.Row, inserted bool) (*model.Meeting, bool, error) {
	var meeting model.Meeting
	var agendaRaw []byte
	var notificationID, announcementID sql.NullString

	err := row.Scan(
		&meeting.ID,
		&meeting.BuildingID,
		&meeting.InitiatorName,
		&meeting.ScheduledAt,
		&meeting.Location,
		&agendaRaw,
		&meeting.MeetingForm,
		&meeting.CreatedBy,
		&meeting.CreatedAt,
		&notificationID,
		&announcementID,
	)
	if err != nil {
		return nil, inserted, err
	}
	if err := json.Unmarshal(agendaRaw, &meeting.Agenda); err != nil {
		return nil, inserted, err
	}
	meeting.NotificationID = nullStringPtr(notificationID)
	meeting.AnnouncementID = nullStringPtr(announcementID)
	return &meeting, inserted, nil
}

func scanMeeting(rows pgx.Rows) (model.Meeting, error) {
	meeting, _, err := scanMeetingRow(rows, false)
	if err != nil {
		return model.Meeting{}, err
	}
	return *meeting, nil
}

func endOfAstanaDay(value time.Time) time.Time {
	local := value.In(datetime.Location())
	year, month, day := local.Date()
	return time.Date(year, month, day, 23, 59, 59, int(time.Second-time.Nanosecond), datetime.Location())
}

func stripHTML(value string) string {
	withoutScripts := regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`).ReplaceAllString(value, " ")
	var builder strings.Builder
	inTag := false
	for _, char := range withoutScripts {
		switch char {
		case '<':
			inTag = true
			builder.WriteRune(' ')
		case '>':
			inTag = false
			builder.WriteRune(' ')
		default:
			if !inTag {
				builder.WriteRune(char)
			}
		}
	}
	return strings.Join(strings.Fields(strings.ReplaceAll(builder.String(), "&nbsp;", " ")), " ")
}

func nullStringPtr(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func newID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return strings.ReplaceAll(time.Now().Format("20060102150405.000000000"), ".", "")
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	encoded := hex.EncodeToString(bytes[:])
	return encoded[0:8] + "-" + encoded[8:12] + "-" + encoded[12:16] + "-" + encoded[16:20] + "-" + encoded[20:32]
}
